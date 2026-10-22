"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const AjvReference = require("ajv-reference/dist/2019");
const AjvReplacement = require("../dist/2019");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "project-2019");
const WORK_PROJECT = path.join(ROOT, ".tmp", "project-2019");

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function configure(Ajv, options) {
  const ajv = new Ajv({strict: false, ...options});
  ajv.addFormat("handle", /^[a-z][a-z0-9_]*$/);
  ajv.addFormat("positive", {type: "number", validate: (value) => value > 0});
  ajv.addKeyword({
    keyword: "port",
    type: "number",
    validate: (limit, value) => Number.isInteger(value) && value >= 1 && value <= limit,
  });
  ajv.addKeyword({
    keyword: "asyncTag",
    type: "string",
    async: true,
    validate: async () => true,
  });
  ajv.addFormat("asyncToken", {
    type: "string",
    async: true,
    validate: async (value) => value.startsWith("tok_"),
  });
  return ajv;
}

const RECURSIVE = {
  $id: "https://example.test/combined",
  $defs: {
    node: {
      $recursiveAnchor: true,
      type: "object",
      properties: {
        kind: {type: "string"},
        children: {type: "array", items: {$recursiveRef: "#"}},
      },
      dependentRequired: {kind: ["children"]},
      unevaluatedProperties: false,
    },
  },
  $ref: "#/$defs/node",
};

const ANCHORED = {
  $id: "https://example.test/anchored",
  $defs: {
    numbers: {$anchor: "numbers", type: "array", items: {type: "number"}},
  },
  $ref: "#numbers",
};

const BOUNDED = {
  type: "array",
  $defs: {large: {type: "number", minimum: 10}},
  contains: {$ref: "#/$defs/large"},
  minContains: 1,
  maxContains: 2,
  unevaluatedItems: {type: "string"},
};

const COMBINED = {
  type: "object",
  properties: {
    kind: {type: "string"},
    value: {type: "number"},
  },
  dependentSchemas: {
    kind: {
      properties: {value: {type: "number"}},
      required: ["value"],
    },
  },
  allOf: [
    {
      anyOf: [
        {properties: {kind: {const: "a"}}},
        {properties: {kind: {const: "b"}}, required: ["value"]},
      ],
    },
  ],
  oneOf: [
    {required: ["kind"]},
    {required: ["value"]},
  ],
  unevaluatedProperties: false,
};

const CONDITIONAL = {
  type: "object",
  if: {
    properties: {kind: {const: "then"}},
    required: ["kind"],
  },
  then: {
    properties: {left: {type: "number"}},
    required: ["left"],
  },
  else: {
    properties: {right: {type: "number"}},
    required: ["right"],
  },
  unevaluatedProperties: false,
};

const EXTENSIONS = {
  $async: true,
  type: "object",
  properties: {
    handle: {type: "string", format: "handle"},
    count: {type: "number", format: "positive", port: 10},
    tag: {type: "string", asyncTag: true},
    token: {type: "string", format: "asyncToken"},
  },
  required: ["handle", "tag", "token"],
  dependentRequired: {count: ["handle"]},
  unevaluatedProperties: false,
};

const CASES = [
  {
    name: "recursive references with dependent requirements and unevaluated properties",
    schema: RECURSIVE,
    documents: [
      {kind: "root", children: [{kind: "leaf", children: []}]},
      {kind: "root", children: [{kind: "leaf"}]},
      {kind: "root", children: [{kind: "leaf", children: [], extra: true}]},
      {kind: "root", children: [{kind: "leaf", children: []}, {kind: "leaf"}]},
    ],
  },
  {
    name: "location-independent anchors",
    schema: ANCHORED,
    documents: [[1, 2, 3], [1, "two"]],
  },
  {
    name: "bounded contains with references and unevaluated items",
    schema: BOUNDED,
    documents: [
      [1, 10, 11, "x"],
      [1, 2, 3],
      [1, 10, 11, 12],
      [1, 10, 11, 12, "x"],
    ],
  },
  {
    name: "references, applicators, dependent schemas, and unevaluated properties",
    schema: COMBINED,
    documents: [
      {kind: "a", value: 1},
      {kind: "b"},
      {kind: "b", value: 1},
      {value: 1},
      {kind: "a", value: 1, extra: true},
    ],
  },
  {
    name: "if/then/else with unevaluated properties",
    schema: CONDITIONAL,
    documents: [
      {kind: "then", left: 1},
      {kind: "then", left: 1, right: 2},
      {kind: "else", right: 1},
      {kind: "else", left: 1, right: 2},
      {kind: "else", right: "one"},
    ],
  },
  {
    name: "registered formats, custom keywords, and asynchronous validation",
    schema: EXTENSIONS,
    documents: [
      {handle: "api", count: 2, tag: "t", token: "tok_ok"},
      {handle: "API", count: 2, tag: "t", token: "tok_ok"},
      {handle: "api", count: 20, tag: "t", token: "tok_ok"},
      {handle: "api", tag: "t", token: "bad"},
      {handle: "api", count: 2, tag: "t", token: "tok_ok", extra: 1},
    ],
    async: true,
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
  test(`2019-09 dialect features match ajv (${mode})`, async () => {
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

test("a 2019-09 ajv project runs unchanged when the replacement takes ajv's place", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.ok(reference.length > 0, "expected the fixture to validate documents");

  const validAsync = reference.filter((row) => row.case.startsWith("asyncDocument:") && row.valid);
  assert.ok(validAsync.length > 0, "expected the asynchronous schema to resolve valid documents");
  assert.ok(
    reference.some((row) => row.case.startsWith("tree:") && !row.valid),
    "expected recursive schemas to reject documents",
  );
  assert.ok(
    reference.some((row) => row.case.startsWith("bounded:") && !row.valid),
    "expected bounded contains to reject documents",
  );
});
