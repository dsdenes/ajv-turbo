"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const ReferenceAjv = require("ajv-reference");
const ReplacementAjv = require("../");
const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");
const {collectSuiteCases, collectBenchmarkCases, readRemoteSchemas} = require("./lib/cases");

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function create(Ajv, options, configure) {
  const ajv = new Ajv({strict: false, ...options});
  if (configure) configure(ajv, Ajv);
  return ajv;
}

function describe(schema, document, options) {
  return `${JSON.stringify(schema)} :: ${JSON.stringify(document)} :: ${JSON.stringify(options)}`;
}

async function settle(validate, data) {
  const result = validate(clone(data));
  if (!(result instanceof Promise)) {
    return {promise: false, valid: result, errors: validate.errors};
  }
  try {
    const resolved = await result;
    return {promise: true, valid: true, errors: validate.errors, data: resolved};
  } catch (error) {
    return {
      promise: true,
      valid: false,
      name: error.constructor.name,
      message: error.message,
      errors: error.errors,
      errorsAfter: validate.errors,
    };
  }
}

// Runs the same schema and documents through both validators and requires the
// outcome the project observes — resolved or rejected, the failure entries, and
// the resulting data — to be identical.
async function expectParity(schema, documents, options = {}, configure) {
  const reference = create(ReferenceAjv, options, configure);
  const replacement = create(ReplacementAjv, options, configure);
  const referenceValidate = reference.compile(clone(schema));
  const replacementValidate = replacement.compile(clone(schema));
  assert.strictEqual(
    replacementValidate.constructor.name,
    referenceValidate.constructor.name,
    `compiled validator kind differs for ${JSON.stringify(schema)}`,
  );
  assert.strictEqual(replacementValidate.$async, referenceValidate.$async);

  for (const document of documents) {
    const context = describe(schema, document, options);
    const expected = await settle(referenceValidate, document);
    const actual = await settle(replacementValidate, document);
    assert.deepStrictEqual(actual, expected, `async outcome differs for ${context}`);
  }
}

function expectCompileError(schema, options = {}, configure) {
  const reference = create(ReferenceAjv, options, configure);
  const replacement = create(ReplacementAjv, options, configure);
  let referenceError;
  try {
    reference.compile(clone(schema));
  } catch (error) {
    referenceError = error.message;
  }
  assert.ok(referenceError, "ajv should reject the schema");
  assert.throws(
    () => replacement.compile(clone(schema)),
    (error) => error.message === referenceError,
    `compile error differs for ${JSON.stringify(schema)}`,
  );
}

test("asynchronous schemas produce ajv's outcomes and reports", async () => {
  const schema = {
    $async: true,
    type: "object",
    required: ["name", "age", "tags"],
    properties: {
      name: {type: "string", minLength: 3},
      age: {type: "integer", minimum: 18},
      tags: {type: "array", items: {type: "string"}, uniqueItems: true},
      address: {
        type: "object",
        required: ["city"],
        properties: {city: {type: "string"}, zip: {type: "string", pattern: "^[0-9]{5}$"}},
      },
    },
    additionalProperties: false,
  };
  const documents = [
    {name: "ada", age: 36, tags: ["a", "b"], address: {city: "Paris", zip: "75001"}},
    {name: "x", age: 17, tags: ["a", "a"], address: {zip: "abc"}, extra: true},
    {name: "grace", age: 30.5, tags: []},
    {},
  ];

  await expectParity(schema, documents);
  await expectParity(schema, documents, {allErrors: true});
  await expectParity(schema, documents, {verbose: true, allErrors: true});
  await expectParity(schema, documents, {verbose: true});
  await expectParity(schema, documents, {messages: false, allErrors: true});
  await expectParity(schema, documents, {verbose: true, messages: false, allErrors: true});

  for (const document of documents) {
    const reference = create(ReferenceAjv);
    const replacement = create(ReplacementAjv);
    const referenceValidate = reference.compile(clone(schema));
    const replacementValidate = replacement.compile(clone(schema));
    const expected = await settle(referenceValidate, document);
    const actual = await settle(replacementValidate, document);
    assert.strictEqual(actual.promise, true, "a $async schema must validate asynchronously");
    assert.deepStrictEqual(actual, expected);
  }
});

test("asynchronous validation follows references and recursive schemas", async () => {
  const configure = (ajv) => {
    ajv.addSchema({
      $id: "https://example.test/part.json",
      type: "object",
      required: ["value"],
      properties: {value: {type: "integer", minimum: 1}},
    });
  };
  const schema = {
    $async: true,
    $id: "https://example.test/tree.json",
    type: "object",
    required: ["part"],
    properties: {
      part: {$ref: "https://example.test/part.json"},
      next: {$ref: "https://example.test/tree.json"},
    },
  };
  const documents = [
    {part: {value: 2}},
    {part: {value: 0}, next: {part: {}}},
  ];

  await expectParity(schema, documents, {}, configure);
  await expectParity(schema, documents, {allErrors: true}, configure);
  await expectParity(schema, documents, {verbose: true, allErrors: true}, configure);
  await expectParity(schema, documents, {verbose: true, messages: false, allErrors: true}, configure);
});

test("asynchronous custom keywords produce ajv's outcomes, reports, and data", async () => {
  await expectParity(
    {$async: true, type: "object", properties: {seats: {type: "number", evenSeats: 8}}},
    [{seats: 4}, {seats: 7}, {seats: 2.5}, {seats: "4"}],
    {allErrors: true},
    (ajv) =>
      ajv.addKeyword({
        keyword: "evenSeats",
        type: "number",
        async: true,
        validate: async (limit, value) => Number.isInteger(value) && value >= 1 && value <= limit && value % 2 === 0,
      }),
  );

  await expectParity(
    {
      $async: true,
      type: "object",
      properties: {
        handle: {type: "string", normalize: true, slug: true},
        marker: {type: "string", present: true},
        code: {type: "integer", positiveEven: true},
      },
    },
    [
      {handle: "  ACME-1 ", marker: "x", code: 4},
      {handle: "  Bad Handle ", marker: "", code: -2},
    ],
    {allErrors: true},
    (ajv) => {
      ajv.addKeyword({
        keyword: "normalize",
        type: "string",
        async: true,
        modifying: true,
        validate: async (enabled, value, parentSchema, dataCxt) => {
          await Promise.resolve();
          dataCxt.parentData[dataCxt.parentDataProperty] = value.trim().toLowerCase();
          return true;
        },
      });
      ajv.addKeyword({
        keyword: "slug",
        type: "string",
        async: true,
        validate: async (enabled, value) => /^[a-z][a-z0-9-]*$/.test(value),
      });
      ajv.addKeyword({
        keyword: "present",
        async: true,
        schema: false,
        validate: async (value) => value.length > 0,
      });
      ajv.addKeyword({
        keyword: "positiveEven",
        type: "integer",
        async: true,
        validate: async (enabled, value) => value > 0 && value % 2 === 0,
      });
    },
  );

  const auditOptions = (ajv, Ajv) => {
    ajv.addKeyword({
      keyword: "audit",
      type: "string",
      async: true,
      errors: true,
      validate: async (prefix, value) => {
        if (value.startsWith(prefix)) return true;
        throw new Ajv.ValidationError([{keyword: "audit", params: {prefix}, message: `must start with ${prefix}`}]);
      },
    });
  };
  const auditSchema = {$async: true, type: "object", properties: {audit: {type: "string", audit: "ok:"}}};
  const auditDocuments = [{audit: "ok:created"}, {audit: "nope"}];
  await expectParity(auditSchema, auditDocuments, {}, auditOptions);
  await expectParity(auditSchema, auditDocuments, {verbose: true, allErrors: true}, auditOptions);
  await expectParity(auditSchema, auditDocuments, {messages: false, allErrors: true}, auditOptions);
  await expectParity(
    auditSchema,
    auditDocuments,
    {verbose: true, messages: false, allErrors: true},
    auditOptions,
  );

  // With `errors: false` ajv does not consume the error list a rule rejects
  // with; the rejection itself reaches the caller.
  await expectParity(
    {$async: true, type: "string", opaque: true},
    ["x"],
    {},
    (ajv, Ajv) => {
      ajv.addKeyword({
        keyword: "opaque",
        async: true,
        errors: false,
        validate: async () => {
          throw new Ajv.ValidationError([{keyword: "opaque", params: {}, message: "ignored"}]);
        },
      });
    },
  );

  // A rejection that is not a ValidationError propagates unchanged.
  await expectParity(
    {$async: true, type: "string", explode: true},
    ["x"],
    {},
    (ajv) => {
      ajv.addKeyword({
        keyword: "explode",
        async: true,
        validate: async () => {
          throw new Error("rule failure");
        },
      });
    },
  );
});

test("asynchronous formats produce ajv's outcomes and reports", async () => {
  const configure = (ajv) => {
    ajv.addFormat("async-slug", {
      type: "string",
      async: true,
      validate: async (value) => {
        await Promise.resolve();
        return /^[a-z][a-z0-9-]*$/.test(value);
      },
    });
    ajv.addFormat("async-even", {
      type: "number",
      async: true,
      validate: async (value) => Number.isInteger(value) && value % 2 === 0,
    });
    ajv.addFormat("sync-prefix", /^carr-/);
  };
  const schema = {
    $async: true,
    type: "object",
    required: ["tracking", "weight", "carrier", "code"],
    properties: {
      tracking: {type: "string", format: "async-slug"},
      weight: {type: "number", format: "async-even"},
      carrier: {type: "string", format: "sync-prefix"},
      code: {type: "string", format: "hex"},
    },
  };
  const documents = [
    {tracking: "ab-1", weight: 4, carrier: "carr-x", code: "deadbeef"},
    {tracking: "AB", weight: 3, carrier: "carrier", code: "XYZ"},
    {tracking: "ab-1", weight: "4", carrier: "carr-x"},
  ];
  const constructorFormats = {
    hex: {
      type: "string",
      async: true,
      validate: async (value) => /^[0-9a-f]+$/.test(value),
    },
  };

  await expectParity(schema, documents, {allErrors: true, formats: constructorFormats}, configure);
  await expectParity(schema, documents, {formats: constructorFormats}, configure);
  await expectParity(
    schema,
    documents,
    {allErrors: true, validateFormats: false, formats: constructorFormats},
    configure,
  );
});

test("the covered corpus settles identically when validated asynchronously", async () => {
  const cases = [...collectSuiteCases(), ...collectBenchmarkCases()];

  for (const allErrors of [false, true]) {
    const reference = new ReferenceAjv({strict: false, allErrors});
    const replacement = new ReplacementAjv({strict: false, allErrors});
    for (const remote of readRemoteSchemas()) {
      try {
        reference.addSchema(structuredClone(remote.schema), remote.uri);
      } catch {}
      try {
        replacement.addSchema(structuredClone(remote.schema), remote.uri);
      } catch {}
    }

    for (const testCase of cases) {
      if (typeof testCase.schema !== "object" || testCase.schema === null || Array.isArray(testCase.schema)) {
        continue;
      }
      if (testCase.schema.$async) continue;
      const schema = {...testCase.schema, $async: true};
      let referenceValidate;
      let replacementValidate;
      let referenceError;
      let replacementError;
      try {
        referenceValidate = reference.compile(structuredClone(schema));
      } catch (error) {
        referenceError = error.message;
      }
      try {
        replacementValidate = replacement.compile(structuredClone(schema));
      } catch (error) {
        replacementError = error.message;
      }
      const context = `${testCase.source} :: ${testCase.description} :: allErrors=${allErrors}`;
      assert.strictEqual(Boolean(replacementValidate), Boolean(referenceValidate), `compilation differs for ${context}`);
      if (referenceError !== undefined) {
        assert.strictEqual(replacementError, referenceError, `compile error differs for ${context}`);
        continue;
      }
      for (const testcase of testCase.tests) {
        const expected = await settle(referenceValidate, testcase.data);
        const actual = await settle(replacementValidate, testcase.data);
        assert.deepStrictEqual(
          actual,
          expected,
          `async outcome differs for ${context} :: ${testcase.description}`,
        );
        assert.strictEqual(actual.promise, true, `$async schema should settle asynchronously for ${context}`);
      }
    }
  }
});

test("asynchronous constructs in a synchronous schema fail as they do in ajv", () => {
  expectCompileError({type: "string", asyncRule: true}, {}, (ajv) => {
    ajv.addKeyword({keyword: "asyncRule", async: true, validate: async () => true});
  });
  expectCompileError({type: "string", format: "async-format"}, {}, (ajv) => {
    ajv.addFormat("async-format", {async: true, validate: async () => true});
  });
  expectCompileError({type: "object", properties: {a: {$async: true, type: "string"}}});
  expectCompileError({$ref: "https://example.test/async.json"}, {}, (ajv) => {
    ajv.addSchema({$id: "https://example.test/async.json", $async: true, type: "string"});
  });
  expectCompileError({type: "object", properties: {a: {type: "string", format: "async-format"}}}, {}, (ajv) => {
    ajv.addFormat("async-format", {async: true, validate: async () => true});
  });
});

test("schemas not marked $async keep synchronous, immediate validation", () => {
  const schema = {
    type: "object",
    required: ["value"],
    properties: {value: {type: "number", minimum: 1}},
    additionalProperties: false,
  };
  const reference = create(ReferenceAjv, {allErrors: true});
  const replacement = create(ReplacementAjv, {allErrors: true});
  const referenceValidate = reference.compile(clone(schema));
  const replacementValidate = replacement.compile(clone(schema));

  for (const document of [{value: 2}, {value: 0, extra: true}]) {
    const expected = referenceValidate(clone(document));
    const actual = replacementValidate(clone(document));
    assert.strictEqual(typeof actual, "boolean", "a synchronous schema must return a boolean");
    assert.strictEqual(actual instanceof Promise, false, "a synchronous schema must not validate asynchronously");
    assert.strictEqual(actual, expected);
    assert.deepStrictEqual(replacementValidate.errors, referenceValidate.errors);
    assert.strictEqual(
      replacement.errorsText(replacementValidate.errors),
      reference.errorsText(referenceValidate.errors),
    );
  }
});

const FIXTURES = [
  {
    name: "async-project",
    work: "async-drop-in-project",
    check(results) {
      const asyncResults = results.filter((result) => !result.case.startsWith("sync."));
      assert.ok(asyncResults.length >= 12, "expected every asynchronous document to be validated");
      for (const result of asyncResults) {
        assert.strictEqual(result.promise, true, `${result.case} should settle asynchronously`);
        assert.strictEqual(result.synchronous, false, `${result.case} should not report synchronously`);
        if (!result.valid) {
          assert.ok(Array.isArray(result.errors) && result.errors.length > 0, `${result.case} should report errors`);
          if (Object.prototype.hasOwnProperty.call(result, "validateErrors")) {
            assert.strictEqual(result.validateErrors, null, `${result.case} should leave validate.errors null`);
          }
        }
      }
      for (const label of ["sync.valid", "sync.invalid"]) {
        const result = results.find((entry) => entry.case === label);
        assert.ok(result, `${label} should be validated`);
        assert.strictEqual(result.promise, false, `${label} should not be a promise`);
        assert.strictEqual(result.synchronous, true, `${label} should report immediately`);
        assert.strictEqual(typeof result.valid, "boolean");
      }
    },
  },
  {
    name: "async-keyword-project",
    work: "async-keyword-drop-in-project",
    check(results) {
      const valid = results.find((result) => result.case === "account.valid");
      const invalid = results.find((result) => result.case === "account.invalid");
      assert.ok(valid && valid.valid, "the valid account should be accepted");
      assert.strictEqual(valid.data.handle, "acme-1", "the modifying rule should change the validated data");
      assert.ok(invalid && !invalid.valid, "the invalid account should be rejected");
      const keywords = invalid.errors.map((error) => error.keyword);
      for (const keyword of ["slug", "audit", "evenSeats", "present", "nonEmpty"]) {
        assert.ok(keywords.includes(keyword), `the report should include the ${keyword} failure`);
      }
      const audit = invalid.errors.find((error) => error.keyword === "audit");
      assert.deepStrictEqual(audit.params, {prefix: "ok:"});
      assert.strictEqual(audit.instancePath, "/audit");
    },
  },
  {
    name: "async-format-project",
    work: "async-format-drop-in-project",
    check(results) {
      const invalid = results.find(
        (result) => result.case === "shipment.invalid" && result.valid === false,
      );
      assert.ok(invalid, "the invalid shipment should be rejected");
      const formats = invalid.errors.map((error) => error.params.format);
      assert.deepStrictEqual(formats, ["slug", "even", "carr-prefix", "hex"]);
      const disabled = results.filter((result) => result.case.endsWith(".formats-disabled"));
      assert.ok(disabled.length > 0, "format validation should also run disabled");
    },
  },
];

for (const fixture of FIXTURES) {
  test(`an asynchronous ajv project runs unchanged when the replacement takes ajv's place: ${fixture.name}`, () => {
    const source = path.join(__dirname, "fixtures", fixture.name);
    const work = path.join(ROOT, ".tmp", fixture.work);
    const before = hashDirectory(source);

    const {reference, replacement} = runWithBothValidators(source, work);

    assert.deepStrictEqual(replacement, reference);
    assert.strictEqual(hashDirectory(source), before, "fixture project was edited");
    assert.ok(reference.length > 0, "expected the fixture to validate documents");
    fixture.check(reference);
  });
}
