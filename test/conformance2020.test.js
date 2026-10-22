"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {compare, buildValidator} = require("./verify");
const {compareErrors} = require("./lib/errors");
const {collectSuite2020Cases, readRemoteSchemas2020, usableRemotes} = require("./lib/cases");

const AjvReference = require("ajv-reference/dist/2020");
const AjvReplacement = require("../dist/2020");
const CLASSES = {AjvReference, AjvReplacement};

const REMOTES = usableRemotes(AjvReference, readRemoteSchemas2020());
const CASES = collectSuite2020Cases();

test("json-schema-test-suite draft2020-12: replacement verdicts match ajv", () => {
  const result = compare("json-schema-test-suite draft2020-12", CASES, {...CLASSES, remotes: REMOTES});
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
  // ajv 8.20 cannot compile these: three dynamic references with non-hash
  // fragments, two remotes whose custom meta-schemas it does not carry, two
  // schemas that exhaust its stack, and one duplicate identifier it reports.
  assert.strictEqual(result.skippedCompile, 8, "ajv unknowingly compiled a case it used to reject");
});

for (const [name, opts] of [
  ["default", {}],
  ["all errors collected", {allErrors: true}],
]) {
  test(`json-schema-test-suite draft2020-12: error reports match ajv (${name})`, () => {
    const result = compareErrors(CASES, opts, {...CLASSES, remotes: REMOTES});
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

test("json-schema-test-suite draft2020-12: compile outcomes follow ajv", () => {
  const oracle = buildValidator(AjvReference, "oracle", REMOTES);
  const replacement = buildValidator(AjvReplacement, "replacement", REMOTES);
  for (const testCase of CASES) {
    let oracleError = null;
    try {
      oracle.compile(structuredClone(testCase.schema));
    } catch (error) {
      oracleError = error.message;
    }
    let replacementError = null;
    try {
      replacement.compile(structuredClone(testCase.schema));
    } catch (error) {
      replacementError = error.message;
    }
    if (oracleError === null) {
      assert.strictEqual(
        replacementError,
        null,
        `replacement rejected a schema ajv accepted: ${testCase.source} :: ${testCase.description}`,
      );
    } else if (oracleError.startsWith("schema is invalid: ")) {
      assert.strictEqual(
        replacementError,
        oracleError,
        `meta-schema rejection differs: ${testCase.source} :: ${testCase.description}`,
      );
    }
  }
});
