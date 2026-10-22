"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const AjvReference = require("ajv-reference");
const AjvReplacement = require("../");
const standaloneReference = require("ajv-reference/dist/standalone");
const standaloneReplacement = require("../dist/standalone");
const {collectSuiteCases, collectBenchmarkCases, readRemoteSchemas} = require("./lib/cases");
const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const WORK = path.join(ROOT, ".tmp", "standalone");
const SOURCE_PROJECT = path.join(__dirname, "fixtures", "standalone-project");

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

// Generated modules load from their own directory so a module a package
// generated resolves that package's runtime helpers, not this checkout.
function prepareSides() {
  // Generated modules load by absolute path; a path reused by a later test
  // must not resolve to the module a previous test left cached.
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(WORK + path.sep)) delete require.cache[key];
  }
  fs.rmSync(WORK, {recursive: true, force: true});
  const sides = {};
  for (const side of ["reference", "replacement"]) {
    const dir = path.join(WORK, side);
    fs.mkdirSync(path.join(dir, "node_modules"), {recursive: true});
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({name: side + "-validators", private: true}),
    );
    sides[side] = {dir, counter: 0};
  }
  fs.symlinkSync(
    path.dirname(require.resolve("ajv-reference/package.json")),
    path.join(WORK, "reference", "node_modules", "ajv"),
    "dir",
  );
  // The replacement side resolves a module ajv generated against the
  // replacement, the way a drop-in install does.
  fs.symlinkSync(ROOT, path.join(WORK, "replacement", "node_modules", "ajv"), "dir");
  return sides;
}

function load(side, code) {
  const file = path.join(side.dir, "validate" + side.counter++ + ".js");
  fs.writeFileSync(file, code);
  try {
    return {module: require(file), file};
  } catch (error) {
    delete require.cache[file];
    throw error;
  }
}

function unload(loaded) {
  delete require.cache[loaded.file];
}

function buildPair(opts) {
  const reference = new AjvReference({strict: false, code: {source: true}, ...opts});
  const replacement = new AjvReplacement({strict: false, code: {source: true}, ...opts});
  for (const remote of readRemoteSchemas()) {
    for (const ajv of [reference, replacement]) {
      try {
        ajv.addSchema(clone(remote.schema), remote.uri);
      } catch {}
    }
  }
  return {reference, replacement};
}

function firstDifference(actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    return null;
  } catch (error) {
    return error.message;
  }
}

// Generates a standalone validator from both packages for every covered
// draft-07 case, loads the generated modules, and requires the same verdict,
// the same report, and the same rewritten document for every test document.
function compareGenerated(opts, label) {
  const sides = prepareSides();
  const {reference, replacement} = buildPair(opts);
  const cases = [...collectSuiteCases(), ...collectBenchmarkCases()];
  let compared = 0;
  let generated = 0;
  const mismatches = [];
  const failures = [];

  for (const testCase of cases) {
    let referenceValidate;
    let replacementValidate;
    try {
      referenceValidate = reference.compile(clone(testCase.schema));
    } catch {
      continue;
    }
    try {
      replacementValidate = replacement.compile(clone(testCase.schema));
    } catch (error) {
      failures.push(`${testCase.source} :: ${testCase.description}: compile: ${error.message}`);
      continue;
    }
    let referenceLoaded;
    let replacementLoaded;
    try {
      const code = standaloneReference(reference, referenceValidate);
      referenceLoaded = load(sides.reference, code);
      replacementLoaded = load(
        sides.replacement,
        standaloneReplacement(replacement, replacementValidate),
      );
    } catch (error) {
      failures.push(`${testCase.source} :: ${testCase.description}: generate: ${error.message}`);
      continue;
    }
    generated++;

    for (const test of testCase.tests) {
      compared++;
      const referenceData = clone(test.data);
      const replacementData = clone(test.data);
      const referenceValid = referenceLoaded.module(referenceData);
      const replacementValid = replacementLoaded.module(replacementData);
      const diff =
        firstDifference(replacementValid, referenceValid) ||
        firstDifference(replacementLoaded.module.errors, referenceLoaded.module.errors) ||
        firstDifference(replacementData, referenceData);
      if (diff !== null && mismatches.length < 5) {
        mismatches.push({
          label,
          source: testCase.source,
          schema: testCase.description,
          test: test.description,
          data: test.data,
          reference: {valid: referenceValid, errors: referenceLoaded.module.errors},
          replacement: {valid: replacementValid, errors: replacementLoaded.module.errors},
          diff,
        });
      }
    }
    unload(referenceLoaded);
    unload(replacementLoaded);
  }

  assert.deepStrictEqual(failures, [], `${label}: generation failed for a covered case`);
  assert.deepStrictEqual(mismatches, [], `${label}: generated validators disagree`);
  assert.ok(generated > 150, `${label}: expected a large covered corpus, generated ${generated}`);
  assert.ok(compared > 500, `${label}: expected many documents, compared ${compared}`);
  return {generated, compared};
}

test("standalone validators report the same first error as ajv's", () => {
  const {compared} = compareGenerated({}, "default reporting");
  assert.ok(compared > 500);
});

test("standalone validators report the same complete report as ajv's", () => {
  const {compared} = compareGenerated({allErrors: true}, "complete reporting");
  assert.ok(compared > 500);
});

test("standalone validators report the same verbose context as ajv's", () => {
  const {compared} = compareGenerated({verbose: true, allErrors: true}, "verbose reporting");
  assert.ok(compared > 500);
});

test("standalone validators suppress messages like ajv's", () => {
  const {compared} = compareGenerated(
    {verbose: true, messages: false, allErrors: true},
    "verbose message-free reporting",
  );
  assert.ok(compared > 500);
});

// A tagged union whose branches reject properties no member allows, so a
// generated validator must run the selected branch and its report, not the
// oneOf rule.
const TAGGED_UNION = {
  type: "object",
  discriminator: {propertyName: "kind"},
  required: ["kind"],
  oneOf: [
    {
      properties: {kind: {const: "a"}, x: {type: "string"}},
      required: ["kind", "x"],
      additionalProperties: false,
    },
    {
      properties: {kind: {const: "b"}, y: {type: "number"}},
      required: ["kind", "y"],
      additionalProperties: false,
    },
  ],
};

// Every document class the discriminator decides: each member, a tag outside
// the mapping, a non-string or absent tag, a missing required property, a
// property no member allows, and values that are not objects.
const TAGGED_UNION_DOCUMENTS = [
  {kind: "a", x: "s"},
  {kind: "b", y: 1},
  {kind: "c"},
  {kind: 1},
  {kind: null},
  {x: "s"},
  {kind: "a"},
  {kind: "a", x: "s", z: 1},
  {kind: "b", y: 1, z: 2},
  {kind: "b", y: "no"},
  {},
  "nope",
  null,
  [1],
  42,
];

test("generated validators carry the discriminator option and its reports", () => {
  const sides = prepareSides();
  const dialects = [
    ["draft-07", AjvReference, AjvReplacement],
    ["2019-09", require("ajv-reference/dist/2019").default, require("../dist/2019")],
    ["2020-12", require("ajv-reference/dist/2020").default, require("../dist/2020")],
  ];
  for (const [dialect, Reference, Replacement] of dialects) {
    for (const options of [
      {},
      {allErrors: true},
      {verbose: true, allErrors: true},
      {messages: false, verbose: true, allErrors: true},
    ]) {
      const label = `${dialect} ${JSON.stringify(options)}`;
      const reference = new Reference({
        strict: false,
        code: {source: true},
        discriminator: true,
        ...options,
      });
      const replacement = new Replacement({
        strict: false,
        code: {source: true},
        discriminator: true,
        ...options,
      });
      const generated = generatedPair(sides, {reference, replacement}, TAGGED_UNION);
      const code = standaloneReplacement(replacement, generated.replacementValidate);
      assert.ok(
        !/\brequire\(\s*["'](?!\.)/.test(code),
        `${label}: generated module must not require an installed package`,
      );
      assert.deepStrictEqual(
        runAll(generated.replacement.module, TAGGED_UNION_DOCUMENTS),
        runAll(generated.reference.module, TAGGED_UNION_DOCUMENTS),
        `${label}: generated validators disagree`,
      );
      assert.deepStrictEqual(
        runAll(generated.replacement.module, TAGGED_UNION_DOCUMENTS),
        runAll(generated.replacementValidate, TAGGED_UNION_DOCUMENTS),
        `${label}: generated validator disagrees with the instance`,
      );
      unload(generated.reference);
      unload(generated.replacement);
    }
  }

  const side = sides.replacement;
  const ajv = new AjvReplacement({
    strict: false,
    code: {source: true},
    discriminator: true,
  });
  const loaded = load(side, standaloneReplacement(ajv, ajv.compile(TAGGED_UNION)));
  assert.strictEqual(loaded.module({kind: "c"}), false);
  assert.deepStrictEqual(loaded.module.errors, [
    {
      instancePath: "",
      schemaPath: "#/discriminator",
      keyword: "discriminator",
      params: {error: "mapping", tag: "kind", tagValue: "c"},
      message: 'value of tag "kind" must be in oneOf',
    },
  ]);
  assert.strictEqual(loaded.module({kind: 1}), false);
  assert.strictEqual(loaded.module.errors[0].params.error, "tag");
  unload(loaded);
});

test("generated validators without the annotation keep their reports", () => {
  const sides = prepareSides();
  const schema = {
    type: "object",
    required: ["kind"],
    oneOf: [
      {properties: {kind: {const: "a"}, x: {type: "string"}}, required: ["kind", "x"]},
      {properties: {kind: {const: "b"}, y: {type: "number"}}, required: ["kind", "y"]},
    ],
  };
  for (const options of [{}, {allErrors: true}, {verbose: true, allErrors: true}]) {
    const reference = new AjvReference({
      strict: false,
      code: {source: true},
      discriminator: true,
      ...options,
    });
    const replacement = new AjvReplacement({
      strict: false,
      code: {source: true},
      discriminator: true,
      ...options,
    });
    const generated = generatedPair(sides, {reference, replacement}, schema);
    const label = JSON.stringify(options);
    assert.deepStrictEqual(
      runAll(generated.replacement.module, TAGGED_UNION_DOCUMENTS),
      runAll(generated.reference.module, TAGGED_UNION_DOCUMENTS),
      `${label}: generated validators disagree`,
    );
    unload(generated.reference);
    unload(generated.replacement);
  }
});

test("the generated module is self-contained and needs no build step", () => {
  const side = prepareSides().replacement;
  const ajv = new AjvReplacement({strict: false, code: {source: true}});
  const validate = ajv.compile({
    $id: "https://example.test/self-contained",
    type: "object",
    properties: {name: {type: "string", minLength: 2}},
    required: ["name"],
  });
  const code = standaloneReplacement(ajv, validate);
  assert.ok(
    !/\brequire\(\s*["'](?!\.)/.test(code),
    "generated module must not require an installed package",
  );
  assert.ok(!/\bimport\s/.test(code), "generated module must not import a package");
  const loaded = load(side, code);
  assert.strictEqual(loaded.module({name: "ok"}), true);
  assert.strictEqual(loaded.module.errors, null);
  assert.strictEqual(loaded.module({name: "x"}), false);
  assert.strictEqual(loaded.module.errors[0].keyword, "minLength");
  unload(loaded);
});

test("generated modules export by id, by name map, and every registered schema", () => {
  const side = prepareSides().replacement;
  const ajv = new AjvReplacement({strict: false, code: {source: true}});
  ajv.addSchema({
    $id: "https://example.test/a",
    type: "object",
    properties: {name: {type: "string", minLength: 2}},
    required: ["name"],
  });
  ajv.addSchema({
    $id: "https://example.test/b",
    type: "array",
    items: {$ref: "https://example.test/a"},
    uniqueItems: true,
  });

  const multi = load(side, standaloneReplacement(ajv, {
    a: "https://example.test/a",
    b: "https://example.test/b",
  }));
  assert.strictEqual(multi.module.a({name: "ok"}), true);
  assert.strictEqual(multi.module.a({}), false);
  assert.deepStrictEqual(multi.module.a.errors, [
    {
      instancePath: "",
      schemaPath: "#/required",
      keyword: "required",
      params: {missingProperty: "name"},
      message: "must have required property 'name'",
    },
  ]);
  assert.strictEqual(multi.module.b([{name: "ok"}]), true);
  assert.strictEqual(multi.module.b([{name: "ok"}, {name: "ok"}]), false);
  assert.strictEqual(multi.module.b.errors[0].keyword, "uniqueItems");
  unload(multi);

  const everything = load(side, standaloneReplacement(ajv));
  assert.strictEqual(everything.module["https://example.test/a"]({name: "ok"}), true);
  assert.strictEqual(everything.module["https://example.test/b"]([{name: "ok"}]), true);
  assert.strictEqual(
    everything.module["https://example.test/b"]([{name: "ok"}, {name: "ok"}]),
    false,
  );
  unload(everything);

  const subschema = load(
    side,
    standaloneReplacement(
      ajv,
      (() => {
        ajv.addSchema({
          $id: "https://example.test/defs",
          definitions: {even: {type: "integer", multipleOf: 2}},
        });
        return ajv.getSchema("https://example.test/defs#/definitions/even");
      })(),
    ),
  );
  assert.strictEqual(subschema.module(4), true);
  assert.strictEqual(subschema.module(3), false);
  assert.strictEqual(subschema.module.errors[0].schemaPath, "#/multipleOf");
  unload(subschema);
});

test("generated validators honour the options that change data and reports", () => {
  const side = prepareSides().replacement;
  const ajv = new AjvReplacement({
    strict: false,
    code: {source: true},
    allErrors: true,
    coerceTypes: true,
    useDefaults: true,
    removeAdditional: "all",
  });
  const validate = ajv.compile({
    type: "object",
    properties: {
      count: {type: "number", default: 3},
      active: {type: "boolean"},
    },
    required: ["count", "active"],
  });
  const loaded = load(side, standaloneReplacement(ajv, validate));

  const data = {count: "4", active: "true", extra: "dropped"};
  assert.strictEqual(loaded.module(data), true);
  assert.deepStrictEqual(data, {count: 4, active: true});

  const missing = {active: true};
  assert.strictEqual(loaded.module(missing), true);
  assert.deepStrictEqual(missing, {count: 3, active: true});

  const wrong = {count: "not-a-number", active: 2};
  assert.strictEqual(loaded.module(wrong), false);
  assert.deepStrictEqual(
    loaded.module.errors.map((error) => error.instancePath + " " + error.keyword),
    ["/count type", "/active type"],
  );
  unload(loaded);
});

test("a validator ajv generated keeps running when the replacement is installed", () => {
  const side = prepareSides().replacement;
  const reference = new AjvReference({strict: false, code: {source: true}});
  const referenceValidate = reference.compile({
    type: "object",
    properties: {
      name: {type: "string", minLength: 2, maxLength: 5},
      tags: {type: "array", uniqueItems: true, items: {enum: ["a", "b"]}},
    },
    required: ["name"],
  });
  const code = standaloneReference(reference, referenceValidate);
  assert.ok(code.includes("ajv/dist/runtime/"), "ajv's generated module resolves its helpers");
  const loaded = load(side, code);
  for (const data of [
    {name: "ok", tags: ["a"]},
    {name: "x"},
    {name: "toolong"},
    {name: "ok", tags: ["a", "a"]},
    {name: "ok", tags: ["c"]},
  ]) {
    assert.strictEqual(loaded.module(clone(data)), referenceValidate(clone(data)));
  }
  unload(loaded);
});

test("the standalone generator requires the same option ajv requires", () => {
  const ajv = new AjvReplacement();
  assert.throws(
    () => standaloneReplacement(ajv, ajv.compile({type: "string"})),
    /moduleCode: ajv instance must have code.source option/,
  );
});

test("an existing project that generates and loads standalone validators runs unchanged", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(
    SOURCE_PROJECT,
    path.join(ROOT, ".tmp", "standalone-project"),
    {},
    ["generated"],
  );

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.strictEqual(reference.length, 14, "expected every document and mode to be validated");
  assert.ok(reference.some((entry) => entry.mode === "first" && entry.valid === false));
  assert.ok(reference.some((entry) => entry.mode === "all" && entry.errors.length > 1));
  assert.ok(reference.some((entry) => entry.case === "catalog.valid" && entry.text === "No errors"));
});

test("$async schemas generate asynchronous validators", async () => {
  const sides = prepareSides();
  const schema = {
    $async: true,
    type: "object",
    properties: {id: {type: "integer"}},
    required: ["id"],
  };
  const reference = new AjvReference({strict: false, code: {source: true}});
  const replacement = new AjvReplacement({strict: false, code: {source: true}});
  const referenceLoaded = load(sides.reference, standaloneReference(reference, reference.compile(schema)));
  const replacementLoaded = load(
    sides.replacement,
    standaloneReplacement(replacement, replacement.compile(schema)),
  );

  const valid = {id: 3};
  assert.deepStrictEqual(await replacementLoaded.module(valid), await referenceLoaded.module(valid));
  assert.strictEqual(replacementLoaded.module.$async, true);

  async function settle(validate, data) {
    try {
      return {valid: true, data: await validate(data)};
    } catch (error) {
      return {valid: false, errors: error.errors};
    }
  }
  for (const data of [{id: "3"}, {}, {id: 1.5}]) {
    const expected = await settle(referenceLoaded.module, clone(data));
    const actual = await settle(replacementLoaded.module, clone(data));
    assert.strictEqual(actual.valid, expected.valid);
    assert.deepStrictEqual(actual.errors, expected.errors);
  }
  unload(referenceLoaded);
  unload(replacementLoaded);
});

test("code.source exposes validator source metadata and AjvPack evaluates generated code", () => {
  const ajv = new AjvReplacement({code: {source: true}});
  const validate = ajv.compile({type: "string"});
  assert.strictEqual(typeof validate.source.validateName, "string");

  const AjvPack = require("../dist/standalone/instance");
  const packed = new AjvPack(ajv);
  const packedValidate = packed.compile({type: "object", required: ["x"]});
  assert.strictEqual(packedValidate({x: 1}), true);
  assert.strictEqual(packedValidate({}), false);
  assert.strictEqual(packedValidate.errors[0].keyword, "required");
  assert.strictEqual(packed.validate({type: "integer"}, 2), true);
  assert.strictEqual(packed.validate({type: "integer"}, 2.5), false);
  assert.strictEqual(packed.getSchema("https://example.test/none"), undefined);
});

// Builds an ajv instance and a replacement that register the same extensions,
// so a generated module can be compared with the validator compiled on the
// same instance and with ajv's generated module.
function extensionPair(setup, options = {}) {
  const reference = new AjvReference({strict: false, code: {source: true}, ...options});
  const replacement = new AjvReplacement({strict: false, code: {source: true}, ...options});
  setup(reference);
  setup(replacement);
  return {reference, replacement};
}

function generatedPair(sides, {reference, replacement}, schema) {
  const referenceValidate = reference.compile(clone(schema));
  const replacementValidate = replacement.compile(clone(schema));
  return {
    referenceValidate,
    replacementValidate,
    reference: load(sides.reference, standaloneReference(reference, referenceValidate)),
    replacement: load(sides.replacement, standaloneReplacement(replacement, replacementValidate)),
  };
}

// ajv cannot generate a validator for a keyword defined by a validate function,
// so those modules are compared with the instance's validator instead.
function generatedReplacement(sides, replacement, schema) {
  const validate = replacement.compile(clone(schema));
  const loaded = load(sides.replacement, standaloneReplacement(replacement, validate));
  return {validate, module: loaded.module, file: loaded.file};
}

function runAll(validate, documents) {
  const results = [];
  for (const document of documents) {
    const data = clone(document);
    const valid = validate(data);
    results.push({data, valid, errors: clone(validate.errors)});
  }
  return results;
}

test("generated validators carry registered formats the way ajv's do", () => {
  const sides = prepareSides();
  const schema = {
    type: "object",
    properties: {
      hex: {type: "string", format: "hex"},
      slug: {type: "string", format: "slug"},
      count: {type: "number", format: "even"},
    },
    required: ["hex", "slug"],
  };
  // The object format needs the code ajv's `code.formats` names; both packages
  // must use the same supplied definitions.
  const formatsCode = "({even: {type: 'number', validate: /^\\d*[02468]$/}})";
  const {_Code} = require("ajv-reference/dist/compile/codegen/code");
  const setup = (ajv) => {
    ajv.addFormat("hex", /^[0-9a-f]+$/);
    ajv.addFormat("slug", "^[a-z]+(-[a-z]+)*$");
    ajv.addFormat("even", {type: "number", validate: /^\d*[02468]$/});
  };
  const reference = new AjvReference({strict: false, code: {source: true, formats: new _Code(formatsCode)}});
  const replacement = new AjvReplacement({strict: false, code: {source: true, formats: formatsCode}});
  setup(reference);
  setup(replacement);
  const generated = generatedPair(sides, {reference, replacement}, schema);
  const documents = [
    {hex: "deadbeef", slug: "a-b", count: 4},
    {hex: "XYZ", slug: "a b", count: 3},
    {hex: "abc", slug: "one", count: 1.5},
  ];
  assert.deepStrictEqual(
    runAll(generated.replacement.module, documents),
    runAll(generated.reference.module, documents),
  );
  assert.deepStrictEqual(
    runAll(generated.replacement.module, documents),
    runAll(generated.replacementValidate, documents),
  );
  unload(generated.reference);
  unload(generated.replacement);
});

test("a registered function format uses the code named by code.formats", () => {
  const sides = prepareSides();
  const formats =
    "({prefix: (value) => value.startsWith('x'), positive: {type: 'number', validate: (value) => value > 0}})";
  const {_Code} = require("ajv-reference/dist/compile/codegen/code");
  const setup = (ajv) => {
    ajv.addFormat("prefix", (value) => value.startsWith("x"));
    ajv.addFormat("positive", {type: "number", validate: (value) => value > 0});
  };
  const reference = new AjvReference({strict: false, code: {source: true, formats: new _Code(formats)}});
  const replacement = new AjvReplacement({strict: false, code: {source: true, formats}});
  setup(reference);
  setup(replacement);
  const generated = generatedPair(sides, {reference, replacement}, {
    type: "object",
    properties: {
      name: {type: "string", format: "prefix"},
      amount: {type: "number", format: "positive"},
    },
    required: ["name", "amount"],
  });
  const documents = [
    {name: "x-ray", amount: 2},
    {name: "y", amount: 2},
    {name: "x", amount: 0},
    {name: "y", amount: -1},
    {},
  ];
  assert.deepStrictEqual(
    runAll(generated.replacement.module, documents),
    runAll(generated.reference.module, documents),
  );
  assert.deepStrictEqual(
    runAll(generated.replacement.module, documents),
    runAll(generated.replacementValidate, documents),
  );
  unload(generated.reference);
  unload(generated.replacement);
});

test("a format ajv cannot carry fails generation with ajv's error", () => {
  const {reference, replacement} = extensionPair((ajv) => {
    ajv.addFormat("even", (value) => value % 2 === 0);
  });
  const schema = {type: "number", format: "even"};
  assert.throws(
    () => standaloneReference(reference, reference.compile(schema)),
    /CodeGen: "code" for formats0 not defined/,
  );
  assert.throws(
    () => standaloneReplacement(replacement, replacement.compile(schema)),
    /CodeGen: "code" for formats0 not defined/,
  );
});

test("a data-reference format resolves from the supplied formats code", () => {
  const sides = prepareSides();
  const formats =
    "({email: /^[^@]+@[^@]+$/, even: {type: 'string', validate: (v) => v.length % 2 === 0}})";
  const {_Code} = require("ajv-reference/dist/compile/codegen/code");
  const setup = (ajv) => {
    ajv.addFormat("email", /^[^@]+@[^@]+$/);
    ajv.addFormat("even", {type: "string", validate: (value) => value.length % 2 === 0});
    // Registered but absent from the supplied code: ajv's generated module
    // resolves the name from that code, so it is unknown there.
    ajv.addFormat("registered", /^z+$/);
  };
  const reference = new AjvReference({
    strict: false,
    $data: true,
    code: {source: true, formats: new _Code(formats)},
  });
  const replacement = new AjvReplacement({
    strict: false,
    $data: true,
    code: {source: true, formats},
  });
  setup(reference);
  setup(replacement);
  const generated = generatedPair(sides, {reference, replacement}, {
    type: "object",
    properties: {fmt: {type: "string"}, value: {type: "string", format: {$data: "/fmt"}}},
  });
  const documents = [
    {fmt: "email", value: "a@b.com"},
    {fmt: "email", value: "nope"},
    {fmt: "even", value: "22"},
    {fmt: "even", value: "23"},
    {fmt: "registered", value: "zz"},
    {fmt: "unknown", value: "x"},
    {value: "x"},
    {fmt: 5, value: "x"},
  ];
  assert.deepStrictEqual(
    runAll(generated.replacement.module, documents),
    runAll(generated.reference.module, documents),
  );
  unload(generated.reference);
  unload(generated.replacement);
});

test("a data-reference format needs formats code exactly where ajv does", () => {
  const setup = (ajv) => {
    ajv.addFormat("hex", /^[0-9a-f]+$/);
    ajv.addFormat("even", (value) => value.length % 2 === 0);
  };
  const onlyData = {type: "string", format: {$data: "/fmt"}};
  const onlyDataPair = extensionPair(setup, {$data: true});
  assert.throws(
    () => standaloneReference(onlyDataPair.reference, onlyDataPair.reference.compile(clone(onlyData))),
    /CodeGen: "code" for formats0 not defined/,
  );
  assert.throws(
    () =>
      standaloneReplacement(
        onlyDataPair.replacement,
        onlyDataPair.replacement.compile(clone(onlyData)),
      ),
    /CodeGen: "code" for formats0 not defined/,
  );
  // A literal format rule comes first, so ajv's data-reference scope is
  // formats2: the rule is compiled once per applicable type group.
  const mixed = {
    type: "object",
    properties: {
      a: {type: "string", format: "hex"},
      fmt: {type: "string"},
      b: {type: "string", format: {$data: "/fmt"}},
    },
  };
  const mixedPair = extensionPair(setup, {$data: true});
  assert.throws(
    () => standaloneReference(mixedPair.reference, mixedPair.reference.compile(clone(mixed))),
    /CodeGen: "code" for formats2 not defined/,
  );
  assert.throws(
    () =>
      standaloneReplacement(mixedPair.replacement, mixedPair.replacement.compile(clone(mixed))),
    /CodeGen: "code" for formats2 not defined/,
  );
});

test("an unused function format does not stop generation", () => {
  const side = prepareSides().replacement;
  const ajv = new AjvReplacement({strict: false, code: {source: true}});
  ajv.addFormat("unused", (value) => value === "never");
  ajv.addFormat("hex", /^[0-9a-f]+$/);
  const loaded = load(side, standaloneReplacement(ajv, ajv.compile({type: "string", format: "hex"})));
  assert.strictEqual(loaded.module("xyz"), false);
  assert.strictEqual(loaded.module("deadbeef"), true);
  unload(loaded);
});

test("generated validators carry registered custom keywords like the instance", () => {
  const sides = prepareSides();
  const pair = extensionPair((ajv) => {
    ajv.addKeyword({
      keyword: "port",
      type: "number",
      validate: (limit, value) => Number.isInteger(value) && value >= 1 && value <= limit,
    });
    ajv.addKeyword({
      keyword: "slug",
      schema: true,
      validate(enabled, value) {
        return !enabled || /^[a-z0-9-]+$/.test(value);
      },
    });
  });
  const schema = {
    type: "object",
    properties: {port: {type: "number", port: 10}, slug: {type: "string", slug: true}},
    required: ["port", "slug"],
  };
  const generated = generatedReplacement(sides, pair.replacement, schema);
  const documents = [
    {port: 10, slug: "ok-1"},
    {port: 11, slug: "ok-1"},
    {port: 0, slug: "Not A Slug"},
    {port: 5.5, slug: "ok"},
  ];
  assert.deepStrictEqual(runAll(generated.module, documents), runAll(generated.validate, documents));
  unload(generated);
});

test("generated validators carry keyword error entries and reporting options", () => {
  const sides = prepareSides();
  const setup = (ajv) => {
    ajv.addKeyword({
      keyword: "even",
      type: "number",
      errors: true,
      validate: function even(required, value) {
        if (!required || value % 2 === 0) return true;
        even.errors = [
          {keyword: "even", params: {notEven: value}, message: "must be even", instancePath: ""},
        ];
        return false;
      },
    });
  };
  const schema = {
    type: "object",
    properties: {value: {type: "number", even: true}},
    required: ["value"],
  };
  for (const options of [
    {},
    {allErrors: true},
    {verbose: true, allErrors: true},
    {messages: false, verbose: true, allErrors: true},
  ]) {
    const pair = extensionPair(setup, options);
    const generated = generatedReplacement(sides, pair.replacement, schema);
    const documents = [{value: 3}, {value: 2}, {}];
    assert.deepStrictEqual(
      runAll(generated.module, documents),
      runAll(generated.validate, documents),
      JSON.stringify(options),
    );
    unload(generated);
  }
});

test("generated validators carry macro keywords the way ajv's do", () => {
  const sides = prepareSides();
  const pair = extensionPair((ajv) => {
    ajv.addKeyword({keyword: "even", type: "number", macro: () => ({multipleOf: 2})});
  });
  const generated = generatedPair(sides, pair, {type: "number", even: true});
  const documents = [4, 3, 0];
  assert.deepStrictEqual(
    runAll(generated.replacement.module, documents),
    runAll(generated.reference.module, documents),
  );
  assert.deepStrictEqual(
    runAll(generated.replacement.module, documents),
    runAll(generated.replacementValidate, documents),
  );
  unload(generated.reference);
  unload(generated.replacement);
});

test("asynchronous extensions settle like the instance's validator", async () => {
  const sides = prepareSides();
  const formats = "({later: {type: 'string', async: true, validate: async (v) => v === 'ok'}})";
  const pair = extensionPair(
    (ajv) => {
      ajv.addFormat("later", {type: "string", async: true, validate: async (v) => v === "ok"});
      ajv.addKeyword({
        keyword: "taken",
        type: "string",
        async: true,
        validate: async (enabled, value) => !enabled || value !== "taken",
      });
    },
    {code: {source: true, formats}},
  );
  const schema = {
    $async: true,
    type: "object",
    properties: {code: {type: "string", format: "later"}, name: {type: "string", taken: true}},
    required: ["code", "name"],
  };
  const generated = generatedReplacement(sides, pair.replacement, schema);

  async function settle(validate, document) {
    try {
      return {valid: true, data: await validate(clone(document))};
    } catch (error) {
      return {valid: false, errors: clone(error.errors)};
    }
  }
  for (const document of [{code: "ok", name: "free"}, {code: "no", name: "taken"}, {code: "ok"}]) {
    assert.deepStrictEqual(
      await settle(generated.module, document),
      await settle(generated.validate, document),
    );
  }
  unload(generated);
});

test("a keyword whose definition cannot be carried fails generation with ajv's error", () => {
  const bound = ((schema, data) => data % 2 === 0).bind(null);
  const {reference, replacement} = extensionPair((ajv) => {
    ajv.addKeyword({keyword: "even", type: "number", validate: bound});
  });
  const schema = {type: "number", even: true};
  assert.throws(
    () => standaloneReference(reference, reference.compile(schema)),
    /CodeGen: "code" for keyword0 not defined/,
  );
  assert.throws(
    () => standaloneReplacement(replacement, replacement.compile(schema)),
    /CodeGen: "code" for keyword0 not defined/,
  );
});

test("2019-09 and 2020-12 standalone validators carry extensions", () => {
  const Ajv2019 = require("ajv-reference/dist/2019").default;
  const Ajv2020 = require("ajv-reference/dist/2020").default;
  const Replacement2019 = require("../dist/2019");
  const Replacement2020 = require("../dist/2020");
  const sides = prepareSides();
  for (const [Reference, Replacement] of [
    [Ajv2019, Replacement2019],
    [Ajv2020, Replacement2020],
  ]) {
    const schema = {type: "number", even: true};
    const setup = (ajv) => {
      ajv.addFormat("even-number", {type: "number", validate: (value) => value % 2 === 0});
      ajv.addKeyword({keyword: "even", type: "number", macro: () => ({multipleOf: 2})});
    };
    const reference = new Reference({
      strict: false,
      code: {source: true, formats: "({ 'even-number': {type: 'number', validate: (value) => value % 2 === 0} })"},
    });
    const replacement = new Replacement({
      strict: false,
      code: {source: true, formats: "({ 'even-number': {type: 'number', validate: (value) => value % 2 === 0} })"},
    });
    setup(reference);
    setup(replacement);
    const generated = generatedPair(sides, {reference, replacement}, schema);
    const documents = [2, 3, 0];
    assert.deepStrictEqual(
      runAll(generated.replacement.module, documents),
      runAll(generated.reference.module, documents),
    );
    unload(generated.reference);
    unload(generated.replacement);
  }
});

test("an unchanged project keeps its formats and keyword through generated validators", () => {
  const SOURCE = path.join(__dirname, "fixtures", "standalone-extensions-project");
  const before = hashDirectory(SOURCE);
  const {reference, replacement} = runWithBothValidators(
    SOURCE,
    path.join(ROOT, ".tmp", "standalone-extensions-project"),
    {},
    ["generated"],
  );

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE), before, "fixture project was edited");
  assert.strictEqual(reference.length, 9, "expected every dialect and document to be validated");
  for (const dialect of ["draft7", "2019", "2020"]) {
    const cases = reference.filter((entry) => entry.dialect === dialect);
    assert.deepStrictEqual(
      cases.map((entry) => entry.case),
      ["account.boundary", "account.invalid", "account.valid"],
    );
    assert.strictEqual(cases.find((entry) => entry.case === "account.valid").valid, true);
    assert.ok(cases.filter((entry) => !entry.valid).every((entry) => entry.errors.length > 0));
  }
});

test("a format the supplied code omits fails when the rule runs, as ajv's does", () => {
  const sides = prepareSides();
  const {_Code} = require("ajv-reference/dist/compile/codegen/code");
  const empty = "({})";
  const setup = (ajv) => {
    ajv.addFormat("positive", {type: "number", validate: (value) => value > 0});
  };
  const reference = new AjvReference({strict: false, code: {source: true, formats: new _Code(empty)}});
  const replacement = new AjvReplacement({strict: false, code: {source: true, formats: empty}});
  setup(reference);
  setup(replacement);
  const schema = {type: "number", format: "positive"};
  const generated = generatedPair(sides, {reference, replacement}, schema);
  for (const generatedSide of [generated.reference.module, generated.replacement.module]) {
    assert.throws(() => generatedSide(3), TypeError);
  }
  unload(generated.reference);
  unload(generated.replacement);
});
