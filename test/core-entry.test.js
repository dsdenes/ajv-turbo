"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const {ROOT} = require("./lib/project");

const Core = require(path.join(ROOT, "dist", "core.js"));
const ReferenceCore = require("ajv-reference/dist/core").default;

function silentLogger() {
  return {log() {}, warn() {}, error() {}};
}

function core(Class = Core, options = {}) {
  return new Class({strict: false, ...options, logger: silentLogger()});
}

function report(validate, data) {
  const result = validate(data);
  return {result, errors: validate.errors};
}

test("a base-class schema ignores dialect keywords with strict mode off", () => {
  const schema = {minLength: 5, type: "string", enum: ["x"]};
  const document = "abc";

  const actual = report(core().compile(schema), document);
  const expected = report(core(ReferenceCore).compile(schema), document);

  assert.deepStrictEqual(actual, expected);
  assert.strictEqual(actual.result, true);
  assert.strictEqual(actual.errors, null);
});

test("a base-class schema refuses an unknown dialect keyword with strict mode on", () => {
  const schema = {minLength: 5};

  let actual;
  let expected;
  assert.throws(() => core(Core, {strict: true}).compile(schema), (error) => {
    actual = error.message;
    return true;
  });
  assert.throws(() => core(ReferenceCore, {strict: true}).compile(schema), (error) => {
    expected = error.message;
    return true;
  });

  assert.strictEqual(actual, expected);
  assert.match(actual, /unknown keyword: "minLength"/);
});

test("a registered rule is enforced by the base-class entry point", () => {
  const schema = {even: true};
  const install = (instance) =>
    instance.addKeyword({
      keyword: "even",
      validate: (option, data) => typeof data === "number" && data % 2 === 0,
    });

  const actualInstance = core();
  const expectedInstance = core(ReferenceCore);
  install(actualInstance);
  install(expectedInstance);
  const actual = actualInstance.compile(schema);
  const expected = expectedInstance.compile(schema);

  assert.deepStrictEqual(report(actual, 4), report(expected, 4));
  assert.deepStrictEqual(report(actual, 3), report(expected, 3));
  assert.strictEqual(report(actual, 4).result, true);
  assert.strictEqual(report(actual, 3).result, false);
  assert.strictEqual(report(actual, 3).errors[0].keyword, "even");
});

test("the base-class entry point answers no default meta-schema and compiles without one", () => {
  const actualWarnings = [];
  const expectedWarnings = [];
  const actualInstance = new Core({
    strict: false,
    logger: {log() {}, warn: (message) => actualWarnings.push(message), error() {}},
  });
  const expectedInstance = new ReferenceCore({
    strict: false,
    logger: {log() {}, warn: (message) => expectedWarnings.push(message), error() {}},
  });

  assert.strictEqual(actualInstance.defaultMeta(), expectedInstance.defaultMeta());
  assert.strictEqual(actualInstance.defaultMeta(), undefined);
  assert.deepStrictEqual(actualWarnings, expectedWarnings);

  assert.deepStrictEqual(
    report(actualInstance.compile({type: "string"}), "x"),
    report(expectedInstance.compile({type: "string"}), "x"),
  );
  assert.deepStrictEqual(actualWarnings, expectedWarnings);
  assert.deepStrictEqual(actualWarnings, ["meta-schema not available"]);
  assert.strictEqual(
    actualInstance.getSchema("http://json-schema.org/draft-07/schema"),
    undefined,
  );
});

test("a project-supplied meta-schema governs base-class schemas that name it", () => {
  const metaSchema = {
    $id: "https://example.test/meta",
    type: "object",
    properties: {value: {type: "string"}},
  };

  const actualInstance = core();
  const expectedInstance = core(ReferenceCore);
  actualInstance.addMetaSchema(metaSchema);
  expectedInstance.addMetaSchema(metaSchema);

  const schema = {$schema: "https://example.test/meta", value: "ignored"};
  assert.deepStrictEqual(
    report(actualInstance.compile(schema), 1),
    report(expectedInstance.compile(schema), 1),
  );
  assert.deepStrictEqual(actualInstance.defaultMeta(), expectedInstance.defaultMeta());
});

test("dialect entry points keep their built-in rules", () => {
  const cases = [
    {
      requirePath: ".",
      schema: {type: "object", properties: {x: {type: "string"}}, required: ["x"]},
      valid: {x: "ok"},
      invalid: {x: 1},
    },
    {
      requirePath: "dist/2019",
      schema: {type: "array", contains: {type: "number"}, minContains: 2},
      valid: [1, "x", 2],
      invalid: [1, "x"],
    },
    {
      requirePath: "dist/2020",
      schema: {type: "array", prefixItems: [{type: "string"}], items: false},
      valid: ["x"],
      invalid: ["x", "y"],
    },
    {
      requirePath: "dist/jtd",
      schema: {properties: {x: {type: "string"}}},
      valid: {x: "ok"},
      invalid: {x: 1},
    },
  ];

  for (const entry of cases) {
    const Actual = require(path.join(ROOT, entry.requirePath));
    const Expected = require(`ajv-reference/${entry.requirePath === "." ? "" : entry.requirePath}`);
    const actual = new Actual({strict: false, logger: silentLogger()}).compile(entry.schema);
    const expected = new (Expected.default || Expected)({
      strict: false,
      logger: silentLogger(),
    }).compile(entry.schema);

    assert.deepStrictEqual(report(actual, entry.valid), report(expected, entry.valid), entry.requirePath);
    assert.deepStrictEqual(report(actual, entry.invalid), report(expected, entry.invalid), entry.requirePath);
    assert.strictEqual(report(actual, entry.invalid).result, false, entry.requirePath);
  }
});
