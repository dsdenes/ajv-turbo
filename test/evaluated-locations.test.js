"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const {ROOT, runWithBothValidators} = require("./lib/project");

const AjvReference2019 = require("ajv-reference/dist/2019");
const AjvReference2020 = require("ajv-reference/dist/2020");
const AjvReference = require("ajv-reference");
const AjvReplacement2019 = require("../dist/2019");
const AjvReplacement2020 = require("../dist/2020");
const AjvReplacement = require("../");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "evaluated-locations-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "evaluated-locations-project");

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function sortedProps(props) {
  if (props === true || props === undefined) return props;
  return Object.fromEntries(
    Object.keys(props)
      .sort()
      .map((property) => [property, props[property]]),
  );
}

function account(validate) {
  const evaluated = validate.evaluated;
  if (evaluated === undefined) return undefined;
  return {
    props: sortedProps(evaluated.props),
    items: evaluated.items,
    dynamicProps: evaluated.dynamicProps,
    dynamicItems: evaluated.dynamicItems,
  };
}

const SCHEMAS = [
  {
    name: "declared and additional properties",
    schema: {
      type: "object",
      properties: {declared: {type: "number"}},
      additionalProperties: true,
    },
    documents: [{}, {declared: 1}, {declared: 1, extra: true}],
  },
  {
    name: "conditional properties",
    schema: {
      type: "object",
      properties: {kind: {const: "order"}},
      if: {properties: {kind: {const: "order"}}},
      then: {properties: {total: {type: "number"}}},
      else: {properties: {note: {type: "string"}}},
      unevaluatedProperties: false,
    },
    documents: [
      {kind: "order", total: 7},
      {kind: "refund", note: "late"},
      {kind: "order"},
      {kind: "refund"},
    ],
  },
  {
    name: "branches that decide the account",
    schema: {
      type: "object",
      properties: {owner: {type: "string"}},
      anyOf: [
        {required: ["card"], properties: {card: {type: "string"}}},
        {required: ["account"], properties: {account: {type: "string"}}},
      ],
    },
    documents: [
      {owner: "ada", card: "4242"},
      {owner: "ada", account: "acct-1"},
      {owner: "ada"},
    ],
  },
  {
    name: "pattern properties",
    schema: {
      type: "object",
      properties: {owner: {type: "string"}},
      patternProperties: {"^tag_": {type: "string"}},
      unevaluatedProperties: false,
    },
    documents: [{owner: "ada"}, {owner: "ada", tag_team: "core"}, {owner: "ada", tag_team: 4}],
  },
  {
    name: "item boundary",
    schema: {
      type: "array",
      prefixItems: [{type: "number"}, {type: "string"}],
      items: false,
    },
    documents: [[], [1, "item"], [1, "item", 3]],
  },
];

test("a project reading evaluated locations keeps the same account after the switch", () => {
  const {reference, replacement} = runWithBothValidators(
    SOURCE_PROJECT,
    WORK_PROJECT,
    {},
    ["generated"],
  );
  assert.ok(reference.length > 0, "the project published no account");
  assert.deepStrictEqual(replacement, reference);
  // The account must actually be published, not absent on both sides.
  const before = reference.find((entry) => entry.phase === "before");
  assert.strictEqual(before.account.present, true);
});

for (const [label, Reference, Replacement] of [
  ["2019-09", AjvReference2019, AjvReplacement2019],
  ["2020-12", AjvReference2020, AjvReplacement2020],
]) {
  test(`${label}: evaluated locations match ajv before and after each document`, () => {
    const oracle = new Reference({strict: false});
    const replacement = new Replacement({strict: false});
    for (const testCase of SCHEMAS) {
      const expected = oracle.compile(clone(testCase.schema));
      const actual = replacement.compile(clone(testCase.schema));
      assert.deepStrictEqual(account(actual), account(expected), testCase.name);
      for (const document of testCase.documents) {
        assert.strictEqual(actual(clone(document)), expected(clone(document)), testCase.name);
        assert.deepStrictEqual(account(actual), account(expected), JSON.stringify({testCase: testCase.name, document}));
      }
    }
  });
}

test("the default dialect with tracking enabled publishes the same account", () => {
  const oracle = new AjvReference({strict: false, unevaluated: true});
  const replacement = new AjvReplacement({strict: false, unevaluated: true});
  const schema = {
    type: "object",
    properties: {declared: {}},
    patternProperties: {"^tag_": {}},
  };
  const expected = oracle.compile(clone(schema));
  const actual = replacement.compile(clone(schema));
  assert.notStrictEqual(actual.evaluated, undefined);
  assert.deepStrictEqual(account(actual), account(expected));
  for (const document of [{}, {declared: 1}, {declared: 1, tag_team: 2}]) {
    assert.strictEqual(actual(clone(document)), expected(clone(document)));
    assert.deepStrictEqual(account(actual), account(expected));
  }
});

test("tracking disabled publishes no evaluated account", () => {
  const oracle = new AjvReference({strict: false});
  const replacement = new AjvReplacement({strict: false});
  const expected = oracle.compile(SCHEMAS[0].schema);
  const actual = replacement.compile(SCHEMAS[0].schema);
  assert.strictEqual(actual.evaluated, undefined);
  assert.strictEqual(expected.evaluated, undefined);
});

test("a document-decided account changes with the document on one validator", () => {
  const replacement = new AjvReplacement2020({strict: false});
  const validate = replacement.compile({
    type: "object",
    if: {properties: {kind: {const: "order"}}},
    then: {properties: {total: {type: "number"}}},
    else: {properties: {note: {type: "string"}}},
  });
  validate({kind: "order", total: 7});
  assert.deepStrictEqual(sortedProps(validate.evaluated.props), {
    kind: true,
    total: true,
  });
  validate({kind: "refund", note: "late"});
  assert.deepStrictEqual(sortedProps(validate.evaluated.props), {
    note: true,
  });
});

test("published accounts use plain objects and the same shape as ajv", () => {
  const replacement = new AjvReplacement2020({strict: false});
  const validate = replacement.compile(SCHEMAS[2].schema);
  assert.deepStrictEqual(Object.keys(validate.evaluated).sort(), [
    "dynamicItems",
    "dynamicProps",
    "items",
    "props",
  ]);
  // Before validation a document-decided property account has no value.
  assert.strictEqual(validate.evaluated.props, undefined);
  validate({owner: "ada", card: "4242"});
  assert.strictEqual(Object.getPrototypeOf(validate.evaluated.props), Object.prototype);
});
