"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {compare} = require("./verify");
const {collectSuiteCases, collectBenchmarkCases} = require("./lib/cases");

for (const [name, collect] of [
  ["json-schema-test-suite draft7", collectSuiteCases],
  ["ajv benchmark schemas", collectBenchmarkCases],
]) {
  test(`${name}: replacement verdicts match ajv`, () => {
    const result = compare(name, collect());
    assert.strictEqual(result.mismatches.length, 0, JSON.stringify(result.mismatches.slice(0, 10), null, 2));
    assert.strictEqual(result.compileFailures.length, 0, JSON.stringify(result.compileFailures.slice(0, 10), null, 2));
    assert.ok(result.tests > 0, "no covered test cases were exercised");
    assert.strictEqual(result.agreements, result.tests);
  });
}
