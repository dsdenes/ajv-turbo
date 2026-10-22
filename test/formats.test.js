"use strict";

const test = require("node:test");
const assert = require("node:assert");

const ReferenceAjv = require("ajv-reference");
const ReplacementAjv = require("../");

// One definition in each form ajv's documented extension surface accepts:
// a RegExp, a string pattern, a function, an object with a function, an object
// with a RegExp, an object with the default type, and the no-op `true`.
const FORMATS = {
  slug: /^[a-z][a-z0-9-]*$/,
  lower: "^[a-z]+$",
  even: (value) => typeof value === "number" && value % 2 === 0,
  positive: {type: "number", validate: (value) => value > 0},
  hex: {type: "string", validate: /^[0-9a-f]+$/},
  terse: {validate: /^.{0,3}$/},
  anything: true,
};

function createValidator(Ajv, options = {}, formats = FORMATS) {
  const ajv = new Ajv({strict: false, ...options});
  for (const [name, format] of Object.entries(formats)) ajv.addFormat(name, format);
  return ajv;
}

function describeValue(value) {
  return JSON.stringify(value);
}

// Runs each document through both validators under the same options and
// requires identical verdicts, error reports, and derived summaries.
function compare(schema, documents, options = {}) {
  const reference = createValidator(ReferenceAjv, options);
  const replacement = createValidator(ReplacementAjv, options);
  const referenceValidate = reference.compile(structuredClone(schema));
  const replacementValidate = replacement.compile(structuredClone(schema));

  for (const document of documents) {
    const referenceValid = referenceValidate(structuredClone(document));
    const replacementValid = replacementValidate(structuredClone(document));
    const context = `${describeValue(schema)} :: ${describeValue(document)} :: ${describeValue(options)}`;
    assert.strictEqual(replacementValid, referenceValid, `verdict differs for ${context}`);
    assert.deepStrictEqual(replacementValidate.errors, referenceValidate.errors, `errors differ for ${context}`);
    assert.strictEqual(
      replacement.errorsText(replacementValidate.errors),
      reference.errorsText(referenceValidate.errors),
      `summary differs for ${context}`,
    );
  }
  return {reference, replacement, referenceValidate, replacementValidate};
}

test("format rules produce ajv's verdicts across data types and schema positions", () => {
  const cases = [
    {schema: {type: "string", format: "slug"}, data: ["abc", "a-b-c", "ABC", "", "-bad"]},
    {schema: {type: "string", format: "lower"}, data: ["abc", "ABC", ""]},
    {schema: {type: "string", format: "even"}, data: ["abc", "42", ""]},
    {schema: {type: "string", format: "hex"}, data: ["deadbeef", "DEAD", ""]},
    {schema: {type: "string", format: "terse"}, data: ["abc", "abcd", ""]},
    {schema: {type: "string", format: "anything"}, data: ["abc", ""]},
    {schema: {type: "number", format: "positive"}, data: [5, -1, 0, 1.5]},
    {schema: {type: "integer", format: "positive"}, data: [5, 5.5, -2]},
    {schema: {type: "number", format: "slug"}, data: [5, -1, "x", "abc"]},
    {schema: {type: "string", format: "positive"}, data: [5, -5, "x", "5"]},
    {schema: {format: "slug"}, data: ["abc", "ABC", 5, 1.5, true, null, {}, []]},
    {schema: {format: "positive"}, data: [5, -5, "5", true, null]},
    {
      schema: {
        type: "object",
        required: ["handle", "seats"],
        additionalProperties: false,
        properties: {
          handle: {type: "string", format: "slug"},
          seats: {type: "integer", format: "positive"},
        },
      },
      data: [
        {handle: "ok", seats: 2},
        {handle: "NO", seats: 2},
        {handle: "ok", seats: -1},
        {handle: "NO", seats: -1},
        {handle: "ok", seats: 2, extra: 1},
      ],
    },
    {
      schema: {anyOf: [{type: "string", format: "slug"}, {type: "number", format: "positive"}]},
      data: ["ok", "NO", 2, -1, true],
    },
    {
      schema: {oneOf: [{type: "string", format: "slug"}, {type: "string", format: "lower"}]},
      data: ["abc", "ABC", "a b"],
    },
    {
      schema: {contains: {type: "string", format: "slug"}},
      data: [["ok", "fine"], ["NO"], []],
    },
    {
      schema: {not: {type: "string", format: "slug"}},
      data: ["ok", "NO", 5],
    },
    {
      schema: {
        if: {type: "string", format: "slug"},
        then: {type: "string", minLength: 5},
        else: {type: "string", maxLength: 2},
      },
      data: ["abcde", "NO", "abc", "x"],
    },
    {
      schema: {type: "array", items: {type: "string", format: "slug"}},
      data: [["ok", "fine"], ["ok", "NO"]],
    },
    {
      schema: {
        $id: "https://example.test/with-format.json",
        definitions: {handle: {type: "string", format: "slug"}},
        type: "object",
        properties: {handle: {$ref: "#/definitions/handle"}},
      },
      data: [{handle: "ok"}, {handle: "NO"}],
    },
  ];

  const optionSets = [
    {},
    {allErrors: true},
    {allErrors: true, coerceTypes: true},
    {verbose: true, allErrors: true},
    {messages: false, allErrors: true},
    {verbose: true, messages: false, allErrors: true},
  ];
  for (const {schema, data} of cases) {
    for (const options of optionSets) compare(schema, data, options);
  }
});

test("a format rejection reports ajv's exact error and summary in both modes", () => {
  const schema = {type: "string", format: "slug"};

  const single = compare(schema, ["NO"], {});
  assert.deepStrictEqual(single.referenceValidate.errors, [
    {
      instancePath: "",
      schemaPath: "#/format",
      keyword: "format",
      params: {format: "slug"},
      message: 'must match format "slug"',
    },
  ]);
  assert.strictEqual(single.reference.errorsText(single.referenceValidate.errors), 'data must match format "slug"');

  const nested = {
    type: "object",
    required: ["handle", "seats"],
    properties: {
      handle: {type: "string", format: "slug"},
      seats: {type: "integer", format: "positive"},
    },
  };
  const document = {handle: "NO", seats: -1};

  const first = compare(nested, [document], {});
  assert.strictEqual(first.referenceValidate.errors.length, 1);
  assert.strictEqual(first.referenceValidate.errors[0].instancePath, "/handle");
  assert.strictEqual(first.referenceValidate.errors[0].keyword, "format");
  assert.strictEqual(first.referenceValidate.errors[0].params.format, "slug");

  const all = compare(nested, [document], {allErrors: true});
  assert.deepStrictEqual(
    all.referenceValidate.errors.map((error) => [error.instancePath, error.schemaPath, error.keyword, error.params]),
    [
      ["/handle", "#/properties/handle/format", "format", {format: "slug"}],
      ["/seats", "#/properties/seats/format", "format", {format: "positive"}],
    ],
  );

  assert.strictEqual(
    all.reference.errorsText(all.referenceValidate.errors),
    'data/handle must match format "slug", data/seats must match format "positive"',
  );
  assert.strictEqual(
    all.replacement.errorsText(all.replacementValidate.errors, {separator: " | ", dataVar: "payload"}),
    all.reference.errorsText(all.referenceValidate.errors, {separator: " | ", dataVar: "payload"}),
  );
});

test("validateFormats: false accepts format-only violations like ajv", () => {
  const schemas = [
    [{type: "string", format: "slug"}, ["NO", "ok"]],
    [{type: "number", format: "positive"}, [-1, 3]],
    [{type: "object", properties: {handle: {type: "string", format: "slug"}}}, [{handle: "NO"}, {handle: "ok"}]],
  ];
  for (const options of [{validateFormats: false, allErrors: true}, {validateFormats: false}]) {
    for (const [schema, data] of schemas) {
      // compare() already requires both validators to accept the documents
      // and to report no errors for them.
      const {replacementValidate} = compare(schema, data, options);
      for (const document of data) {
        assert.strictEqual(replacementValidate(structuredClone(document)), true);
        assert.strictEqual(replacementValidate.errors, null);
      }
    }
  }

  // A project that disables format validation does not need to register the
  // formats its schemas name, in either implementation.
  const reference = new ReferenceAjv({strict: true, validateFormats: false});
  const replacement = new ReplacementAjv({strict: true, validateFormats: false});
  const referenceValidate = reference.compile({type: "string", format: "unregistered"});
  const replacementValidate = replacement.compile({type: "string", format: "unregistered"});
  assert.strictEqual(replacementValidate("anything"), referenceValidate("anything"));
  assert.deepStrictEqual(replacementValidate.errors, referenceValidate.errors);
  assert.strictEqual(replacementValidate("anything"), true);
});

test("a type-scoped format only judges its own type", () => {
  const numberFormat = {format: "positive"}; // registered with type "number"
  const documents = [5, -5, 0, "5", "abc", "", true, null, {}, []];
  const result = compare(numberFormat, documents, {allErrors: true});
  for (const document of documents) {
    const valid = result.replacementValidate(structuredClone(document));
    const judged = typeof document === "number";
    assert.strictEqual(valid, judged ? document > 0 : true, `unexpected verdict for ${describeValue(document)}`);
  }

  const stringFormat = {format: "slug"};
  const stringDocuments = [5, -5, 0, 1.5, true, null, {}, []];
  const stringResult = compare(stringFormat, stringDocuments, {allErrors: true});
  for (const document of stringDocuments) {
    assert.strictEqual(
      stringResult.replacementValidate(structuredClone(document)),
      true,
      `non-string data should ignore a string format: ${describeValue(document)}`,
    );
  }
});

test("every accepted format definition form yields ajv's verdict and error report", () => {
  for (const name of Object.keys(FORMATS)) {
    const stringSchema = {type: "string", format: name};
    const stringData = ["abc", "ABC", "", "42", "deadbeef", "a-b-c"];
    compare(stringSchema, stringData, {});

    const numberSchema = {type: "number", format: name};
    const numberData = [0, 1, -1, 2.5, 42];
    compare(numberSchema, numberData, {allErrors: true});
  }
});

test("valid documents leave no errors available afterwards", () => {
  const schema = {type: "object", properties: {handle: {type: "string", format: "slug"}}};
  const {referenceValidate, replacementValidate, reference, replacement} = compare(schema, [], {});

  assert.strictEqual(replacementValidate({handle: "ok"}), true);
  assert.strictEqual(replacementValidate.errors, null);
  assert.strictEqual(referenceValidate.errors, null);
  assert.strictEqual(replacement.errorsText(replacementValidate.errors), "No errors");
  assert.strictEqual(reference.errorsText(referenceValidate.errors), "No errors");

  assert.strictEqual(replacementValidate({handle: "NO"}), false);
  assert.ok(replacementValidate.errors.length > 0);

  assert.strictEqual(replacementValidate({handle: "also-ok"}), true);
  assert.strictEqual(replacementValidate.errors, null);
  assert.strictEqual(referenceValidate.errors, null);
});

test("formats supplied through the constructor option match ajv", () => {
  const formats = {initial: /^i/, measured: {type: "number", validate: (value) => value % 2 === 0}};
  for (const options of [{}, {allErrors: true}]) {
    const reference = new ReferenceAjv({strict: false, formats, ...options});
    const replacement = new ReplacementAjv({strict: false, formats, ...options});
    for (const [schema, data] of [
      [{type: "string", format: "initial"}, ["index", "other"]],
      [{type: "integer", format: "measured"}, [4, 3]],
    ]) {
      const referenceValidate = reference.compile(structuredClone(schema));
      const replacementValidate = replacement.compile(structuredClone(schema));
      for (const document of data) {
        assert.strictEqual(
          replacementValidate(structuredClone(document)),
          referenceValidate(structuredClone(document)),
        );
        assert.deepStrictEqual(replacementValidate.errors, referenceValidate.errors);
      }
    }
  }
});

test("formats are captured when a schema is compiled, as ajv captures them", () => {
  const schema = {type: "string", format: "late"};
  {
    const reference = new ReferenceAjv({strict: false});
    const replacement = new ReplacementAjv({strict: false});
    const referenceValidate = reference.compile(structuredClone(schema));
    const replacementValidate = replacement.compile(structuredClone(schema));
    reference.addFormat("late", /^a+$/);
    replacement.addFormat("late", /^a+$/);
    for (const document of ["aaa", "bbb"]) {
      assert.strictEqual(replacementValidate(document), referenceValidate(document));
      assert.deepStrictEqual(replacementValidate.errors, referenceValidate.errors);
    }
  }
  {
    const reference = new ReferenceAjv({strict: false, formats: {late: /^a+$/}});
    const replacement = new ReplacementAjv({strict: false, formats: {late: /^a+$/}});
    const referenceValidate = reference.compile(structuredClone(schema));
    const replacementValidate = replacement.compile(structuredClone(schema));
    reference.addFormat("late", /^b+$/);
    replacement.addFormat("late", /^b+$/);
    for (const document of ["aaa", "bbb"]) {
      assert.strictEqual(replacementValidate(document), referenceValidate(document));
      assert.deepStrictEqual(replacementValidate.errors, referenceValidate.errors);
    }
  }
});

test("a strict project with registered formats matches ajv", () => {
  const options = {strict: true, allErrors: true};
  const reference = createValidator(ReferenceAjv, options);
  const replacement = createValidator(ReplacementAjv, options);
  const schema = {
    type: "object",
    required: ["handle", "seats"],
    additionalProperties: false,
    properties: {
      handle: {type: "string", format: "slug"},
      seats: {type: "integer", format: "positive"},
    },
  };
  const referenceValidate = reference.compile(structuredClone(schema));
  const replacementValidate = replacement.compile(structuredClone(schema));
  for (const document of [
    {handle: "ok", seats: 2},
    {handle: "NO", seats: 2},
    {handle: "ok", seats: -1},
    {handle: "NO", seats: -1},
  ]) {
    assert.strictEqual(
      replacementValidate(structuredClone(document)),
      referenceValidate(structuredClone(document)),
    );
    assert.deepStrictEqual(replacementValidate.errors, referenceValidate.errors);
    assert.strictEqual(
      replacement.errorsText(replacementValidate.errors),
      reference.errorsText(referenceValidate.errors),
    );
  }
});

test("ajv.validate reports format errors through ajv.errors", () => {
  for (const allErrors of [false, true]) {
    const reference = createValidator(ReferenceAjv, {allErrors});
    const replacement = createValidator(ReplacementAjv, {allErrors});
    const schema = {type: "string", format: "slug"};
    for (const document of ["ok", "NO"]) {
      assert.strictEqual(replacement.validate(schema, document), reference.validate(schema, document));
      assert.deepStrictEqual(replacement.errors, reference.errors);
      assert.strictEqual(replacement.errorsText(), reference.errorsText());
    }
  }
});

test("format definitions are shared state on the instance, as in ajv", () => {
  const reference = createValidator(ReferenceAjv);
  const replacement = createValidator(ReplacementAjv);
  assert.deepStrictEqual(
    Object.keys(replacement.formats).sort(),
    Object.keys(reference.formats).sort(),
  );
  assert.ok(replacement.formats.slug instanceof RegExp);
  assert.ok(replacement.formats.lower instanceof RegExp);
});
