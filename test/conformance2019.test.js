"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {compare} = require("./verify");
const {compareErrors} = require("./lib/errors");
const {collectSuite2019Cases} = require("./lib/cases");

const CLASSES = {
  AjvReference: require("ajv-reference/dist/2019"),
  AjvReplacement: require("../dist/2019"),
};

const CASES = collectSuite2019Cases();

test("json-schema-test-suite draft2019-09: replacement verdicts match ajv", () => {
  const result = compare("json-schema-test-suite draft2019-09", CASES, CLASSES);
  assert.strictEqual(
    result.mismatches.length,
    0,
    JSON.stringify(result.mismatches.slice(0, 10), null, 2),
  );
  assert.strictEqual(
    result.compileFailures.length,
    0,
    JSON.stringify(result.compileFailures.slice(0, 10), null, 2),
  );
  assert.ok(result.tests > 0, "no covered test cases were exercised");
  assert.strictEqual(result.agreements, result.tests);
});

for (const [name, opts] of [
  ["default", {}],
  ["all errors collected", {allErrors: true}],
  ["property syntax", {jsPropertySyntax: true}],
  ["property syntax collected", {jsPropertySyntax: true, allErrors: true}],
]) {
  test(`json-schema-test-suite draft2019-09: error reports match ajv (${name})`, () => {
    const result = compareErrors(CASES, opts, CLASSES);
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
