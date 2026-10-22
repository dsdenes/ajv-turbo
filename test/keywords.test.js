"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {spawnSync} = require("child_process");

// Every case registers the same custom keywords in ajv and in the replacement
// and requires the same verdict, the same error report, the same summary, and
// the same validated data for every document under every configuration.
const CONFIGURATIONS = [
  {name: "default", opts: {}},
  {name: "all errors collected", opts: {allErrors: true}},
  {name: "types coerced", opts: {coerceTypes: true}},
  {name: "all errors collected with coercion", opts: {allErrors: true, coerceTypes: true}},
  {name: "formats disabled", opts: {allErrors: true, validateFormats: false}},
  {name: "verbose errors", opts: {verbose: true, allErrors: true}},
  {name: "message-free errors", opts: {messages: false, allErrors: true}},
  {name: "verbose message-free errors", opts: {verbose: true, messages: false, allErrors: true}},
];

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CASES = [
  {
    name: "untyped keyword",
    define(ajv) {
      ajv.addKeyword({keyword: "notEmpty", validate: (schemaValue, data) => data !== ""});
    },
    schemas: [
      {
        schema: {notEmpty: true},
        documents: ["text", "", 0, null, false, [], {}],
      },
      {
        schema: {properties: {a: {notEmpty: true}, b: {type: "string"}}},
        documents: [{a: ""}, {a: "x", b: 1}, {a: 0, b: "y"}, {}],
      },
      {
        schema: {items: {notEmpty: true}, additionalItems: false, maxItems: 3},
        documents: [["a", ""], ["a", "b"], []],
      },
    ],
  },
  {
    name: "number keyword",
    define(ajv) {
      ajv.addKeyword({keyword: "even", type: "number", validate: (schemaValue, data) => data % 2 === 0});
    },
    schemas: [
      {
        schema: {even: true},
        documents: [2, 3, "3", null, true, 1.5],
      },
      {
        schema: {type: "number", even: true},
        documents: [2, 3, "3", null, true],
      },
      {
        schema: {type: "string", even: true},
        documents: ["3", 3, null],
      },
      {
        schema: {type: "number", minimum: 10, maximum: 100, multipleOf: 3, even: true},
        documents: [7, 12, 13, 200],
      },
      {
        schema: {type: "object", properties: {n: {type: "number", even: true}}},
        documents: [{n: 2}, {n: 3}, {n: "4"}, {}],
      },
    ],
  },
  {
    name: "string keyword",
    define(ajv) {
      ajv.addKeyword({keyword: "slug", type: "string", validate: (schemaValue, data) => slug.test(data)});
    },
    schemas: [
      {
        schema: {slug: true},
        documents: ["a-b", "A-B", 7, null, true, ["a-b"]],
      },
      {
        schema: {type: "string", minLength: 4, pattern: "^[a-z0-9-]+$", slug: true},
        documents: ["ab", "a b", "good-slug", "bad_slug"],
      },
      {
        schema: {type: "object", patternProperties: {"^x-": {type: "string", slug: true}}},
        documents: [{"x-a": "ok", "x-b": "not ok"}, {"x-a": "ok"}, {}],
      },
    ],
  },
  {
    name: "array keyword",
    define(ajv) {
      ajv.addKeyword({keyword: "paired", type: "array", validate: (schemaValue, data) => data.length % 2 === 0});
    },
    schemas: [
      {
        schema: {paired: true},
        documents: [[], [1], [1, 2], "abc", 4],
      },
      {
        schema: {type: "array", minItems: 1, items: {type: "number"}, paired: true},
        documents: [[], [1], [1, 2], [1, "2"]],
      },
      {
        schema: {type: "object", properties: {list: {type: "array", paired: true}}},
        documents: [{list: [1, 2]}, {list: [1]}, {list: "x"}],
      },
    ],
  },
  {
    name: "object keyword",
    define(ajv) {
      ajv.addKeyword({
        keyword: "hasName",
        type: "object",
        validate: (schemaValue, data) => typeof data.name === "string",
      });
    },
    schemas: [
      {
        schema: {type: "object", required: ["id"], hasName: true},
        documents: [{id: 1, name: "a"}, {id: 1}, {id: 1, name: 2}, "name", []],
      },
      {
        schema: {hasName: true},
        documents: [{name: "a"}, {}, [], "name"],
      },
      {
        schema: {type: "object", properties: {o: {type: "object", hasName: true}}},
        documents: [{o: {name: "a"}}, {o: {}}, {o: null}],
      },
    ],
  },
  {
    name: "keyword declared for several types",
    define(ajv) {
      ajv.addKeyword({
        keyword: "nonZero",
        type: ["number", "string"],
        validate: (schemaValue, data) => String(data) !== "0",
      });
    },
    schemas: [
      {
        schema: {nonZero: true},
        documents: [0, "0", 1, "1", null, [], {}],
      },
      {
        schema: {type: "string", nonZero: true},
        documents: ["0", 0, "1"],
      },
      {
        schema: {type: "number", nonZero: true},
        documents: [0, "0", 1],
      },
    ],
  },
  {
    name: "integer keyword",
    define(ajv) {
      ajv.addKeyword({keyword: "smallEven", type: "integer", validate: (schemaValue, data) => data % 2 === 0});
    },
    schemas: [
      {
        schema: {smallEven: true},
        documents: [2, 3, 2.5, "2", true],
      },
      {
        schema: {type: "integer", smallEven: true},
        documents: [2, 3, 2.5, "2"],
      },
      {
        schema: {type: "object", maxProperties: 0, smallEven: true},
        documents: [{a: 1}, 2, [1]],
      },
    ],
  },
  {
    name: "boolean and null keywords",
    define(ajv) {
      ajv.addKeyword({keyword: "strictFlag", type: "boolean", validate: (schemaValue, data) => data === true});
      ajv.addKeyword({keyword: "isNull", type: "null", validate: () => true});
    },
    schemas: [
      {
        schema: {strictFlag: true, isNull: true},
        documents: [true, false, null, 1, "true"],
      },
      {
        schema: {type: "boolean", strictFlag: true},
        documents: [true, false, 1],
      },
    ],
  },
  {
    name: "keyword value false",
    define(ajv, record) {
      ajv.addKeyword({
        keyword: "seen",
        validate: (schemaValue, data, parentSchema, dataCxt) => {
          record.push({schemaValue, data, parentSchema, dataCxt});
          return schemaValue !== false;
        },
      });
    },
    schemas: [
      {
        schema: {seen: false},
        documents: [1, "x", null],
      },
      {
        schema: {seen: {mode: "x"}},
        documents: [1, "x"],
      },
    ],
  },
  {
    name: "keywords in a composite rule",
    define(ajv) {
      ajv.addKeyword({keyword: "even", validate: (schemaValue, data) => typeof data !== "number" || data % 2 === 0});
      ajv.addKeyword({keyword: "shout", type: "string", validate: (schemaValue, data) => data === data.toUpperCase()});
    },
    schemas: [
      {
        schema: {anyOf: [{even: true}, {type: "string"}]},
        documents: [2, 3, "x", null],
      },
      {
        schema: {oneOf: [{even: true}, {type: "number"}]},
        documents: [2, 3, "x"],
      },
      {
        schema: {anyOf: [{even: true}, {type: "number", minimum: 0}]},
        documents: [3, -3, "x"],
      },
      {
        schema: {oneOf: [{even: true}, {type: "number", minimum: 0}]},
        documents: [3, 2, -3, "x"],
      },
      {
        schema: {not: {even: true}},
        documents: [2, 3, "x"],
      },
      {
        schema: {allOf: [{even: true}, {minimum: 0}]},
        documents: [2, 3, -2, "x"],
      },
      {
        schema: {if: {shout: true}, then: {maxLength: 3}, else: {minLength: 3}},
        documents: ["AB", "ABC", "abc", "ab"],
      },
      {
        schema: {type: "object", propertyNames: {even: true}},
        documents: [{"2": 1, "3": 2}, {"2": 1}],
      },
      {
        schema: {type: "array", contains: {even: true}},
        documents: [[1, 2], [1, 3], []],
      },
      {
        schema: {type: "object", dependencies: {a: {even: true}}},
        documents: [{a: 1}, {a: 1, b: 2}, {}],
      },
    ],
  },
  {
    name: "keyword in referenced schemas",
    define(ajv) {
      ajv.addKeyword({keyword: "even", validate: (schemaValue, data) => typeof data !== "number" || data % 2 === 0});
    },
    schemas: [
      {
        schema: {
          definitions: {leaf: {type: "number", even: true}},
          type: "object",
          properties: {n: {$ref: "#/definitions/leaf"}},
        },
        documents: [{n: 2}, {n: 3}, {n: "x"}, {}],
      },
      {
        register(ajv) {
          ajv.addSchema({$id: "https://example.com/leaf", type: "number", even: true}, "https://example.com/leaf");
        },
        schema: {type: "object", properties: {n: {$ref: "https://example.com/leaf"}}},
        documents: [{n: 2}, {n: 3}, {}],
      },
    ],
  },
  {
    name: "keyword next to a reference",
    define(ajv) {
      ajv.addKeyword({keyword: "even", validate: (schemaValue, data) => typeof data !== "number" || data % 2 === 0});
    },
    schemas: [
      {
        schema: {
          definitions: {base: {type: "number", minimum: 0}},
          type: "object",
          properties: {n: {$ref: "#/definitions/base", even: true}},
        },
        documents: [{n: 2}, {n: 3}, {n: -2}, {}],
      },
    ],
  },
  {
    name: "keyword that reports its own errors",
    define(ajv) {
      ajv.addKeyword({
        keyword: "even",
        type: "number",
        errors: true,
        validate: function even(schemaValue, data) {
          if (data % 2 === 0) return true;
          even.errors = [
            {keyword: "even", params: {odd: data}, message: "must be an even number"},
            {keyword: "even", params: {hint: "division"}, message: "cannot be divided by two"},
          ];
          return false;
        },
      });
    },
    schemas: [
      {
        schema: {type: "object", properties: {n: {type: "number", even: true}}},
        documents: [{n: 2}, {n: 3}],
      },
      {
        schema: {type: "object", properties: {n: {type: "number", minimum: 0, even: true}}},
        documents: [{n: 3}, {n: -3}],
      },
    ],
  },
  {
    name: "keyword that modifies data",
    define(ajv) {
      ajv.addKeyword({
        keyword: "trim",
        modifying: true,
        validate: function trim(schemaValue, data, parentSchema, dataCxt) {
          if (typeof data !== "string") return true;
          const trimmed = data.trim();
          dataCxt.parentData[dataCxt.parentDataProperty] = trimmed;
          return trimmed === data;
        },
      });
    },
    schemas: [
      {
        schema: {type: "object", properties: {a: {type: "string", trim: true}}},
        documents: [{a: "  x  "}, {a: "x"}, {a: 1}, {}],
      },
    ],
  },
  {
    name: "keyword without a schema argument",
    define(ajv) {
      ajv.addKeyword({
        keyword: "present",
        schema: false,
        validate: (data, dataCxt) => data !== undefined && dataCxt.instancePath !== "/skip",
      });
    },
    schemas: [
      {
        schema: {type: "object", properties: {a: {present: true}, skip: {present: true}}},
        documents: [{a: 1, skip: 2}, {a: 1}],
      },
    ],
  },
  {
    name: "keyword registered through the two-argument form",
    define(ajv) {
      const warn = console.warn;
      console.warn = () => {};
      try {
        ajv.addKeyword("even", {validate: (schemaValue, data) => typeof data !== "number" || data % 2 === 0});
      } finally {
        console.warn = warn;
      }
    },
    schemas: [
      {
        schema: {type: "object", properties: {n: {even: true}}},
        documents: [{n: 2}, {n: 3}],
      },
    ],
  },
  {
    name: "keyword registered for several names and removed",
    define(ajv) {
      ajv.addKeyword({
        keyword: ["low", "high"],
        type: "number",
        validate: (schemaValue, data) => data >= schemaValue[0] && data <= schemaValue[1],
      });
    },
    schemas: [
      {
        schema: {type: "object", properties: {n: {type: "number", low: [1, 3]}}},
        documents: [{n: 2}, {n: 4}],
      },
      {
        schema: {type: "object", properties: {n: {type: "number", high: [1, 3]}}},
        documents: [{n: 2}, {n: 0}],
      },
    ],
  },
  {
    name: "keywords keep registration order within a group",
    define(ajv) {
      ajv.addKeyword({keyword: "first", type: "string", validate: () => false});
      ajv.addKeyword({keyword: "second", type: "string", validate: () => false});
      ajv.addKeyword({keyword: "third", type: "number", validate: () => false});
      ajv.addKeyword({keyword: "fourth", validate: () => false});
    },
    schemas: [
      {
        schema: {
          type: "string",
          maxLength: 0,
          first: true,
          second: true,
          fourth: true,
        },
        documents: ["abc", 7],
      },
      {
        schema: {type: "number", minimum: 100, third: true, fourth: true},
        documents: [1, 200],
      },
    ],
  },
  {
    name: "keyword declared for a type alongside coercion",
    define(ajv) {
      ajv.addKeyword({keyword: "even", type: "number", validate: (schemaValue, data) => data % 2 === 0});
    },
    schemas: [
      {
        schema: {type: "object", properties: {n: {type: "number", even: true}}},
        documents: [{n: "4"}, {n: "5"}, {n: true}, {n: null}],
      },
    ],
  },
  {
    name: "schema fragment keyword",
    define(ajv) {
      ajv.addKeyword({keyword: "even", macro: () => ({multipleOf: 2})});
    },
    schemas: [
      {
        schema: {even: true},
        documents: [2, 3, "2", null, 1.5],
      },
      {
        schema: {type: "number", minimum: 10, maximum: 100, multipleOf: 3, even: true},
        documents: [7, 12, 13, 200],
      },
      {
        schema: {type: "object", properties: {n: {type: "number", even: true, maximum: 10}}},
        documents: [{n: 4}, {n: 3}, {n: "4"}, {}],
      },
    ],
  },
  {
    name: "schema fragment keyword declared for a type",
    define(ajv) {
      ajv.addKeyword({
        keyword: "slug",
        type: "string",
        macro: () => ({pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"}),
      });
    },
    schemas: [
      {
        schema: {slug: true},
        documents: ["a-b", "A-B", 7, null, true, ["a-b"]],
      },
      {
        schema: {type: "object", properties: {s: {slug: true}}},
        documents: [{s: "a-b"}, {s: "a b"}, {s: 4}],
      },
      {
        schema: {type: "string", minLength: 4, slug: true},
        documents: ["ab", "a b", "good-slug"],
      },
    ],
  },
  {
    name: "schema fragment keyword with local references",
    define(ajv) {
      ajv.addKeyword({keyword: "evenRef", macro: () => ({$ref: "#/definitions/even"})});
    },
    schemas: [
      {
        schema: {
          definitions: {even: {multipleOf: 2}},
          type: "object",
          properties: {n: {evenRef: true}},
        },
        documents: [{n: 4}, {n: 3}, {}],
      },
      {
        schema: {
          definitions: {even: {multipleOf: 2}},
          type: "array",
          items: {evenRef: true},
        },
        documents: [[1, 2], [1, 3]],
      },
    ],
  },
  {
    name: "schema fragment keyword with a registered reference",
    define(ajv) {
      ajv.addKeyword({keyword: "externalEven", macro: (value) => ({$ref: value})});
    },
    schemas: [
      {
        register(ajv) {
          ajv.addSchema({$id: "https://example.test/even", multipleOf: 2});
        },
        schema: {type: "object", properties: {n: {externalEven: "https://example.test/even"}}},
        documents: [{n: 4}, {n: 3}, {}],
      },
    ],
  },
  {
    name: "nested schema fragment keywords",
    define(ajv) {
      ajv.addKeyword({keyword: "innerEven", macro: () => ({multipleOf: 3})});
      ajv.addKeyword({keyword: "outerEven", macro: () => ({innerEven: true, minimum: 5})});
    },
    schemas: [
      {
        schema: {outerEven: true},
        documents: [6, 4, 9, 2],
      },
    ],
  },
  {
    name: "schema fragment keyword value drives the substitution",
    define(ajv) {
      ajv.addKeyword({keyword: "hasType", macro: (value) => ({type: value})});
    },
    schemas: [
      {
        schema: {hasType: "string"},
        documents: ["x", 1, null],
      },
      {
        schema: {hasType: ["number", "boolean"]},
        documents: [1, true, "x"],
      },
    ],
  },
  {
    name: "schema fragment keyword returning a boolean schema",
    define(ajv) {
      ajv.addKeyword({keyword: "always", macro: (value) => value});
    },
    schemas: [
      {
        schema: {type: "object", properties: {a: {always: true}, b: {always: false}}},
        documents: [{a: 1, b: 2}, {a: 1}, {b: 2}],
      },
    ],
  },
];

function buildValidators(testCase, opts) {
  const AjvReference = require("ajv-reference");
  const AjvReplacement = require("../");
  return [AjvReference, AjvReplacement].map((Ajv) => {
    const ajv = new Ajv({strict: false, ...opts});
    const record = [];
    testCase.define(ajv, record);
    return {ajv, record};
  });
}

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function compareDocument(testCase, schemaIndex, schemaCase, configuration, opts, document) {
  const [oracle, replacement] = buildValidators(testCase, opts);
  if (schemaCase.register) schemaCase.register(oracle.ajv);
  if (schemaCase.register) schemaCase.register(replacement.ajv);

  const oracleValidate = oracle.ajv.compile(clone(schemaCase.schema));
  const replacementValidate = replacement.ajv.compile(clone(schemaCase.schema));

  const oracleData = clone(document);
  const replacementData = clone(document);
  const oracleValid = oracleValidate(oracleData);
  const replacementValid = replacementValidate(replacementData);
  const oracleErrors = oracleValidate.errors;
  const replacementErrors = replacementValidate.errors;
  const detail = {
    case: testCase.name,
    schema: schemaIndex,
    configuration,
    options: opts,
    document,
    oracle: {valid: oracleValid, errors: oracleErrors},
    replacement: {valid: replacementValid, errors: replacementErrors},
  };
  assert.strictEqual(replacementValid, oracleValid, JSON.stringify(detail, null, 2));
  assert.deepStrictEqual(replacementErrors, oracleErrors, JSON.stringify(detail, null, 2));
  assert.strictEqual(
    replacement.ajv.errorsText(replacementErrors),
    oracle.ajv.errorsText(oracleErrors),
    JSON.stringify(detail, null, 2),
  );
  assert.deepStrictEqual(replacementData, oracleData, `validated data differs: ${JSON.stringify(detail, null, 2)}`);
  assert.deepStrictEqual(
    replacement.record.map(normalizeRecorded),
    oracle.record.map(normalizeRecorded),
    `keyword arguments differ: ${JSON.stringify(detail, null, 2)}`,
  );
}

function normalizeRecorded(record) {
  return JSON.parse(JSON.stringify(record, (key, value) => (value === undefined ? "<undefined>" : value)));
}

for (const testCase of CASES) {
  test(`custom keyword: ${testCase.name}`, () => {
    let documents = 0;
    for (const {name, opts} of CONFIGURATIONS) {
      for (let i = 0; i < testCase.schemas.length; i++) {
        for (const document of testCase.schemas[i].documents) {
          compareDocument(testCase, i, testCase.schemas[i], name, opts, document);
          documents++;
        }
      }
    }
    assert.ok(documents > 0, `no documents were compared (${testCase.name})`);
  });
}

test("a keyword that reports its own errors keeps the report shape", () => {
  const [oracle, replacement] = buildValidators(
    CASES.find((c) => c.name === "keyword that reports its own errors"),
    {allErrors: true},
  );
  const schema = {type: "object", properties: {n: {type: "number", even: true}}};
  const oracleValidate = oracle.ajv.compile(clone(schema));
  const replacementValidate = replacement.ajv.compile(clone(schema));
  oracleValidate({n: 3});
  replacementValidate({n: 3});
  assert.deepStrictEqual(replacementValidate.errors, oracleValidate.errors);
  assert.strictEqual(replacementValidate.errors.length, 2);
  assert.strictEqual(replacementValidate.errors[1].schemaPath, "#/properties/n/even");
});

test("a custom keyword is called with ajv's arguments", () => {
  const testCase = CASES.find((c) => c.name === "keyword value false");
  const [oracle, replacement] = buildValidators(testCase, {});
  const schema = {type: "object", properties: {a: {seen: 7}}};
  const data = {a: "value"};
  oracle.ajv.compile(clone(schema))(data);
  replacement.ajv.compile(clone(schema))(data);
  const expected = normalizeRecorded(oracle.record);
  assert.deepStrictEqual(normalizeRecorded(replacement.record), expected);
  assert.deepStrictEqual(expected, [
    {
      schemaValue: 7,
      data: "value",
      parentSchema: {seen: 7},
      dataCxt: {
        instancePath: "/a",
        parentData: {a: "value"},
        parentDataProperty: "a",
        rootData: {a: "value"},
      },
    },
  ]);
});

test("a custom keyword runs with the ajv instance as this", () => {
  for (const Ajv of [require("ajv-reference"), require("../")]) {
    const ajv = new Ajv({strict: false});
    let receiver = null;
    ajv.addKeyword({
      keyword: "check",
      validate: function check() {
        receiver = this;
        return true;
      },
    });
    ajv.compile({check: true})(1);
    assert.strictEqual(receiver, ajv);
  }
});

test("registering a keyword twice fails as it does in ajv", () => {
  const Ajv = require("../");
  const AjvReference = require("ajv-reference");
  const ajv = new Ajv({strict: false});
  const reference = new AjvReference({strict: false});
  ajv.addKeyword({keyword: "even", validate: () => true});
  reference.addKeyword({keyword: "even", validate: () => true});
  for (const instance of [ajv, reference]) {
    assert.throws(() => instance.addKeyword({keyword: "even", validate: () => true}), {
      message: "Keyword even is already defined",
    });
    assert.throws(() => instance.addKeyword({keyword: "type", validate: () => true}), {
      message: "Keyword type is already defined",
    });
    assert.throws(() => instance.addKeyword(), {message: "invalid addKeywords parameters"});
  }
});

test("a removed keyword no longer takes part in validation", () => {
  const Ajv = require("../");
  const ajv = new Ajv({strict: false});
  ajv.addKeyword({keyword: "even", validate: (schemaValue, data) => typeof data !== "number" || data % 2 === 0});
  assert.strictEqual(ajv.compile({even: true})(3), false);
  ajv.removeKeyword("even");
  assert.strictEqual(ajv.compile({even: true})(3), true);
});

test("a schema fragment keyword is called once with ajv's arguments", () => {
  for (const Ajv of [require("ajv-reference"), require("../")]) {
    const ajv = new Ajv({strict: false});
    const calls = [];
    ajv.addKeyword({
      keyword: "probe",
      macro: function (schemaValue, parentSchema) {
        calls.push({receiver: this, schemaValue, parentSchema});
        return {type: "number"};
      },
    });
    const validate = ajv.compile({type: "object", properties: {n: {probe: 7}}});
    assert.strictEqual(validate({n: 1}), true);
    assert.strictEqual(validate({n: "x"}), false);
    assert.strictEqual(calls.length, 1, "the macro should be expanded once, at compile time");
    assert.strictEqual(calls[0].receiver, ajv);
    assert.strictEqual(calls[0].schemaValue, 7);
    assert.deepStrictEqual(calls[0].parentSchema, {probe: 7});
  }
});

test("an invalid schema fragment is rejected where ajv rejects it", () => {
  const messages = [];
  for (const Ajv of [require("ajv-reference"), require("../")]) {
    const ajv = new Ajv({strict: false});
    ajv.addKeyword({keyword: "probe", macro: () => ({type: "nonsense"})});
    assert.throws(() => ajv.compile({probe: true}), (error) => {
      messages.push(error.message);
      return /^schema is invalid: /.test(error.message);
    });
  }
  assert.strictEqual(messages[1], messages[0]);

  for (const Ajv of [require("ajv-reference"), require("../")]) {
    const ajv = new Ajv({strict: false});
    ajv.addKeyword({keyword: "nothing", macro: () => undefined});
    assert.throws(() => ajv.compile({nothing: true}), {
      message: 'keyword "nothing" failed to compile',
    });
  }
});

test("a keyword registered by a schema fragment can be removed", () => {
  for (const Ajv of [require("ajv-reference"), require("../")]) {
    const ajv = new Ajv({strict: false});
    ajv.addKeyword({keyword: "even", macro: () => ({multipleOf: 2})});
    const beforeRemoval = ajv.compile({even: true});
    assert.strictEqual(beforeRemoval(3), false);
    ajv.removeKeyword("even");
    assert.strictEqual(beforeRemoval(3), false, "a compiled validator keeps its keywords");
    assert.strictEqual(ajv.compile({even: true})(3), true);
  }
});

test("a keyword registered after a schema is added still applies", () => {
  for (const Ajv of [require("ajv-reference"), require("../")]) {
    for (const form of ["macro", "function"]) {
      const ajv = new Ajv({strict: false});
      ajv.addSchema({
        $id: "https://example.test/late",
        type: "object",
        properties: {n: {lateEven: true}},
      });
      ajv.addKeyword(
        form === "macro"
          ? {keyword: "lateEven", macro: () => ({multipleOf: 2})}
          : {keyword: "lateEven", validate: (enabled, value) => value % 2 === 0},
      );
      const validate = ajv.compile({$ref: "https://example.test/late"});
      assert.strictEqual(validate({n: 4}), true, form);
      assert.strictEqual(validate({n: 3}), false, form);
    }
  }
});

test("a keyword without a validation rule is accepted and not enforced", () => {
  const Ajv = require("../");
  const ajv = new Ajv({strict: false});
  ajv.addKeyword("annotation");
  const validate = ajv.compile({annotation: true, type: "number"});
  assert.strictEqual(validate(1), true);
  assert.strictEqual(validate("x"), false);
});

// The unchanged project fixture registers custom keywords and prints its
// results. Running it with ajv and then with the replacement in place of ajv
// must produce the same output without any edit to the project.
const ROOT = path.join(__dirname, "..");
const SOURCE_PROJECT = path.join(__dirname, "fixtures", "keyword-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "keyword-project");

function hashDirectory(dir) {
  const hash = crypto.createHash("sha256");
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        hash.update(path.relative(dir, full));
        hash.update(fs.readFileSync(full));
      }
    }
  };
  walk(dir);
  return hash.digest("hex");
}

function prepareProject() {
  fs.rmSync(WORK_PROJECT, {recursive: true, force: true});
  fs.mkdirSync(path.dirname(WORK_PROJECT), {recursive: true});
  fs.cpSync(SOURCE_PROJECT, WORK_PROJECT, {recursive: true});
  fs.mkdirSync(path.join(WORK_PROJECT, "node_modules"), {recursive: true});
}

function linkValidator(packageDir) {
  const link = path.join(WORK_PROJECT, "node_modules", "ajv");
  fs.rmSync(link, {recursive: true, force: true});
  fs.symlinkSync(packageDir, link, "dir");
}

function runProject() {
  const result = spawnSync(process.execPath, ["index.js"], {
    cwd: WORK_PROJECT,
    encoding: "utf8",
    env: {...process.env, NODE_ENV: "test"},
  });
  assert.strictEqual(result.status, 0, `project failed to start: ${result.stderr}`);
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("a project that registers custom keywords runs unchanged when the replacement takes ajv's place", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  prepareProject();
  const projectBefore = hashDirectory(WORK_PROJECT);

  const referenceDir = path.dirname(require.resolve("ajv-reference/package.json"));
  linkValidator(referenceDir);
  const reference = runProject();

  linkValidator(ROOT);
  const replacement = runProject();

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.strictEqual(hashDirectory(WORK_PROJECT), projectBefore, "project copy was edited");
  assert.ok(reference.length >= 18, "expected every fixture document to be validated twice");

  for (const result of reference) {
    if (result.valid) {
      assert.strictEqual(result.errors, null, `${result.case} should report no errors`);
      assert.strictEqual(result.text, "No errors", `${result.case} should summarize no errors`);
    } else {
      assert.ok(Array.isArray(result.errors) && result.errors.length > 0, `${result.case} should report errors`);
      assert.notStrictEqual(result.text, "No errors", `${result.case} should summarize errors`);
    }
  }
});
