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
