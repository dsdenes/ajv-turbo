"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const AjvReference = require("ajv-reference/dist/2020");
const AjvReplacement = require("../dist/2020");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "project-2020");
const WORK_PROJECT = path.join(ROOT, ".tmp", "project-2020");

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function configure(Ajv, options) {
  const ajv = new Ajv({strict: false, ...options});
  ajv.addFormat("handle", /^[a-z][a-z0-9_]*$/);
  ajv.addKeyword({
    keyword: "port",
    type: "number",
    validate: (limit, value) => Number.isInteger(value) && value >= 1 && value <= limit,
  });
  ajv.addKeyword({keyword: "evenFragment", macro: () => ({$ref: "#/$defs/even"})});
  ajv.addKeyword({
    keyword: "slugFragment",
    type: "string",
    macro: () => ({pattern: "^[a-z]+(?:-[a-z]+)*$"}),
  });
  ajv.addFormat("token", {
    type: "string",
    async: true,
    validate: async (value) => value.startsWith("tok_"),
  });
  ajv.addKeyword({
    keyword: "available",
    type: "string",
    async: true,
    validate: async (required, value) => required !== true || value !== "taken",
  });
  return ajv;
}

const PREFIX = {
  type: "array",
  prefixItems: [{type: "number"}, {type: "string"}],
  items: {type: "boolean"},
  minItems: 2,
};

const PREFIX_CLOSED = {
  type: "array",
  prefixItems: [{type: "number"}, {type: "string"}],
  items: false,
};

const DYNAMIC = {
  $id: "https://example.test/dynamic-2020",
  $defs: {
    node: {
      $dynamicAnchor: "node",
      type: "object",
      properties: {
        value: {type: "number"},
        children: {type: "array", items: {$dynamicRef: "#node"}},
      },
      required: ["value"],
    },
  },
  $ref: "#/$defs/node",
  unevaluatedProperties: false,
};

const DEPENDENCIES = {
  type: "object",
  properties: {
    card: {type: "string"},
    callback: {type: "string"},
    mode: {type: "string"},
  },
  dependentRequired: {card: ["callback"]},
  dependentSchemas: {
    mode: {properties: {mode: {minLength: 4}}},
  },
};

const BOUNDED = {
  type: "array",
  contains: {type: "number", minimum: 10},
  minContains: 2,
  maxContains: 3,
};

const UNEVALUATED_OBJECT = {
  type: "object",
  properties: {a: true},
  allOf: [{properties: {b: true}}],
  anyOf: [{properties: {c: true}}, {properties: {d: true}}],
  unevaluatedProperties: false,
};

const UNEVALUATED_ITEMS = {
  type: "array",
  prefixItems: [{type: "number"}],
  contains: {type: "string"},
  unevaluatedItems: false,
};

const ANNOTATIONS = {
  title: "Annotated document",
  description: "Annotations never change a verdict",
  $comment: "ignored",
  examples: [{name: "example", count: 1}],
  type: "object",
  properties: {
    name: {
      type: "string",
      title: "Name",
      description: "The document name",
      examples: ["a"],
      readOnly: true,
      deprecated: true,
    },
    count: {type: "number", default: 3},
    payload: {
      type: "string",
      contentEncoding: "base64",
      contentMediaType: "application/json",
      contentSchema: {type: "object"},
    },
  },
  required: ["name"],
};

const CASES = [
  {
    name: "keywords defined by schema fragments",
    schema: {
      type: "object",
      $defs: {even: {multipleOf: 2}},
      properties: {n: {evenFragment: true}, s: {slugFragment: true}},
      required: ["n"],
    },
    documents: [
      {n: 4, s: "abc-def"},
      {n: 3, s: "abc-def"},
      {n: 4, s: "ABC"},
      {n: "4", s: "abc"},
      {},
    ],
  },
  {
    name: "tuple prefix items and schema-valued items",
    schema: PREFIX,
    documents: [
      [1, "a", true],
      [1, "a", true, false],
      [1, "a", 2],
      [1, 2],
      [1, "a"],
    ],
  },
  {
    name: "a closed tuple prefix",
    schema: PREFIX_CLOSED,
    documents: [
      [1, "a"],
      [1, "a", true],
      [1],
    ],
  },
  {
    name: "dynamic anchors and dynamic references",
    schema: DYNAMIC,
    documents: [
      {value: 1, children: [{value: 2}, {value: 3, children: [{value: 4}]}]},
      {value: 1, children: [{value: "two"}]},
      {value: 1, extra: true},
      {value: 1, children: [{value: 2, extra: true}]},
    ],
  },
  {
    name: "dependent requirements and dependent schemas",
    schema: DEPENDENCIES,
    documents: [
      {card: "4242", callback: "cb"},
      {card: "4242"},
      {mode: "long"},
      {mode: "a"},
    ],
  },
  {
    name: "bounded contains",
    schema: BOUNDED,
    documents: [
      [1, 10, 11],
      [1, 2, 3],
      [10, 11, 12, 13],
      [10],
    ],
  },
  {
    name: "evaluated property and item tracking",
    schema: UNEVALUATED_OBJECT,
    documents: [
      {a: 1, b: 2, c: 3},
      {a: 1, d: 2},
      {a: 1, b: 2, extra: true},
      {c: 1, extra: true},
    ],
  },
  {
    name: "unevaluated items after a prefix and contains",
    schema: UNEVALUATED_ITEMS,
    documents: [
      [1, "x"],
      [1, "x", 3],
      [1, true],
      [1],
    ],
  },
  {
    name: "annotations that do not affect a verdict",
    schema: ANNOTATIONS,
    documents: [
      {name: "a"},
      {name: "a", count: 2, payload: "eyJhIjoxfQ=="},
      {count: 2},
      {name: 7},
    ],
  },
];

async function outcome(validate, document) {
  const data = clone(document);
  try {
    await validate(data);
    return {valid: true, errors: null, data};
  } catch (error) {
    if (!error || error.validation !== true) throw error;
    return {valid: false, errors: error.errors, data};
  }
}

for (const [mode, options] of [
  ["default", {}],
  ["all errors collected", {allErrors: true}],
  ["rewriting", {coerceTypes: true, useDefaults: true, removeAdditional: "all"}],
]) {
  test(`2020-12 dialect features match ajv (${mode})`, async () => {
    const oracle = configure(AjvReference, options);
    const replacement = configure(AjvReplacement, options);
    let compared = 0;
    for (const testCase of CASES) {
      const validateOracle = oracle.compile(clone(testCase.schema));
      const validateReplacement = replacement.compile(clone(testCase.schema));
      for (const document of testCase.documents) {
        compared++;
        const expected = await outcome(validateOracle, document);
        const actual = await outcome(validateReplacement, document);
        assert.deepStrictEqual(actual, expected, JSON.stringify({testCase: testCase.name, document}));
      }
    }
    assert.ok(compared > 0, "no dialect documents were validated");
  });
}

const MALFORMED = [
  {name: "invalid identifier", schema: {$id: "#fragment", type: "object"}},
  {name: "invalid dynamic anchor", schema: {$dynamicAnchor: "1bad", type: "object"}},
  {name: "out-of-range minimum length", schema: {minLength: -1}},
  {name: "out-of-range item count", schema: {maxItems: -2}},
  {name: "array-valued items", schema: {items: [{type: "string"}]}},
  {name: "non-array prefix items", schema: {prefixItems: {type: "string"}}},
  {name: "duplicate required entry", schema: {required: ["a", "a"]}},
];

test("a malformed 2020-12 schema is rejected where and as ajv rejects it", () => {
  for (const {name, schema} of MALFORMED) {
    const oracle = configure(AjvReference, {});
    const replacement = configure(AjvReplacement, {});

    let oracleError = null;
    try {
      oracle.compile(clone(schema));
    } catch (error) {
      oracleError = error.message;
    }
    let replacementError = null;
    try {
      replacement.compile(clone(schema));
    } catch (error) {
      replacementError = error.message;
    }
    assert.ok(oracleError !== null, `${name}: ajv accepted the schema`);
    assert.strictEqual(replacementError, oracleError, name);

    assert.strictEqual(replacement.validateSchema(clone(schema)), oracle.validateSchema(clone(schema)), name);
    assert.strictEqual(replacement.errorsText(replacement.errors), oracle.errorsText(oracle.errors), name);

    let oracleAddError = null;
    try {
      oracle.addSchema(clone(schema), "https://example.test/malformed");
    } catch (error) {
      oracleAddError = error.message;
    }
    let replacementAddError = null;
    try {
      replacement.addSchema(clone(schema), "https://example.test/malformed");
    } catch (error) {
      replacementAddError = error.message;
    }
    assert.strictEqual(replacementAddError, oracleAddError, name);
  }
});

const ASYNC_2020 = {
  $async: true,
  type: "object",
  properties: {
    items: {type: "array", prefixItems: [{type: "number"}], items: {type: "string", format: "token"}},
    name: {type: "string", available: true},
  },
  required: ["items", "name"],
};

test("asynchronous 2020-12 validation settles to ajv's outcome and report", async () => {
  for (const options of [{}, {allErrors: true}]) {
    const oracle = configure(AjvReference, options);
    const replacement = configure(AjvReplacement, options);
    const validateOracle = oracle.compile(clone(ASYNC_2020));
    const validateReplacement = replacement.compile(clone(ASYNC_2020));
    assert.strictEqual(validateReplacement.$async, true);
    for (const document of [
      {items: [1, "tok_a"], name: "ok"},
      {items: [1, "bad"], name: "ok"},
      {items: [1, "tok_a"], name: "taken"},
      {items: ["one"], name: "ok"},
    ]) {
      const expected = await outcome(validateOracle, document);
      const actual = await outcome(validateReplacement, document);
      assert.deepStrictEqual(actual, expected, JSON.stringify({document, options}));
    }
  }
});

test("a 2020-12 ajv project runs unchanged when the replacement takes ajv's place", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.ok(reference.length > 0, "expected the fixture to validate documents");

  const validAsync = reference.filter((row) => row.case.startsWith("asyncDocument:") && row.valid);
  assert.ok(validAsync.length > 0, "expected the asynchronous schema to resolve valid documents");
  assert.ok(
    reference.some((row) => row.case.startsWith("tree:") && !row.valid),
    "expected dynamic references to reject documents",
  );
  assert.ok(
    reference.some((row) => row.case.startsWith("numbers:") && !row.valid),
    "expected prefix items to reject documents",
  );
});
