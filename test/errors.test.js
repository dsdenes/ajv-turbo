"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {compareErrors} = require("./lib/errors");
const {collectSuiteCases, collectBenchmarkCases} = require("./lib/cases");

const CASES = [...collectSuiteCases(), ...collectBenchmarkCases()];

const CONFIGURATIONS = [
  ["default", {}],
  ["all errors collected", {allErrors: true}],
  ["types coerced", {coerceTypes: true}],
  ["defaults applied", {useDefaults: true}],
  ["additional properties removed", {removeAdditional: "all"}],
];

for (const [name, opts] of CONFIGURATIONS) {
  test(`error reports match ajv (${name})`, () => {
    const result = compareErrors(CASES, opts);
    assert.strictEqual(
      result.mismatches.length,
      0,
      JSON.stringify(result.mismatches.slice(0, 5), null, 2),
    );
    assert.strictEqual(
      result.compileFailures.length,
      0,
      JSON.stringify(result.compileFailures.slice(0, 5), null, 2),
    );
    assert.ok(result.tests > 0, "no covered test cases were exercised");
    assert.strictEqual(result.agreements, result.tests);
  });
}

const EDGE_CASES = [
  {
    name: "a type check runs before $ref when it is not elided",
    schema: {$ref: "#/definitions/target", type: "boolean", definitions: {target: {type: "integer"}}},
    data: [],
  },
  {
    name: "a composite type error still reports untyped keywords",
    schema: {anyOf: [{type: "string", enum: ["a"]}, {type: "number"}]},
    data: {},
  },
  {
    name: "a composite type error suppresses typed keyword groups",
    schema: {anyOf: [{type: "string", maximum: 1}, {type: "number"}]},
    data: 5,
  },
  {
    name: "propertyNames reports nested errors and the wrapper",
    schema: {propertyNames: {anyOf: [{pattern: "^a"}, {maxLength: 1}]}},
    data: {bb: 1, c: 2},
  },
  {
    name: "oneOf short-circuits after the second match",
    schema: {oneOf: [{type: "number"}, {minimum: 0}, {type: "number"}]},
    data: 5,
  },
  {
    name: "contains reports its own error for a boolean schema",
    schema: {contains: true},
    data: [],
  },
  {
    name: "refs and property names are escaped in paths",
    schema: {
      definitions: {"a/b~c": {type: "string"}},
      properties: {"x/y": {$ref: "#/definitions/a~1b~0c"}, "t\tk": {type: "number"}},
    },
    data: {"x/y": 1, "t\tk": "s"},
  },
  {
    name: "uniqueItems keeps ajv's index pairs",
    schema: {items: {type: "number"}, uniqueItems: true},
    data: [1, 1, 1, 2, 2],
  },
];

for (const edge of EDGE_CASES) {
  for (const [name, opts] of CONFIGURATIONS.slice(0, 2)) {
    test(`error report edge case matches ajv (${edge.name}, ${name})`, () => {
      const AjvReference = require("ajv-reference");
      const AjvReplacement = require("../");
      const a = new AjvReference({strict: false, ...opts});
      const b = new AjvReplacement({strict: false, ...opts});
      const va = a.compile(structuredClone(edge.schema));
      const vb = b.compile(structuredClone(edge.schema));
      const validA = va(structuredClone(edge.data));
      const errorsA = va.errors;
      const validB = vb(structuredClone(edge.data));
      const errorsB = vb.errors;
      assert.deepStrictEqual(
        {valid: validB, errors: errorsB, text: b.errorsText(errorsB)},
        {valid: validA, errors: errorsA, text: a.errorsText(errorsA)},
      );
    });
  }
}
