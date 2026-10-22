"use strict";

const assert = require("node:assert");
const {readRemoteSchemas} = require("./cases");

function buildValidator(Ajv, source, opts = {}, remotes = readRemoteSchemas()) {
  const ajv = new Ajv({strict: false, ...opts});
  for (const remote of remotes) {
    try {
      ajv.addSchema(remote.schema, remote.uri);
    } catch (error) {
      if (source === "replacement") throw error;
    }
  }
  return ajv;
}

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function firstDiff(actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    return null;
  } catch (error) {
    return error.message;
  }
}

// Validates every case document through ajv and the replacement under the same
// options and requires the verdict, the complete error report, and the
// human-readable summary to be identical.
function compareErrors(
  cases,
  opts = {},
  {
    AjvReference = require("ajv-reference"),
    AjvReplacement = require("../../"),
    remotes = readRemoteSchemas(),
  } = {},
) {
  const oracle = buildValidator(AjvReference, "oracle", opts, remotes);
  const replacement = buildValidator(AjvReplacement, "replacement", opts, remotes);

  let tests = 0;
  let agreements = 0;
  const mismatches = [];
  const compileFailures = [];

  for (const testCase of cases) {
    let oracleValidate;
    let replacementValidate;
    try {
      oracleValidate = oracle.compile(clone(testCase.schema));
    } catch {
      continue;
    }
    try {
      replacementValidate = replacement.compile(clone(testCase.schema));
    } catch (error) {
      compileFailures.push({
        source: testCase.source,
        schema: testCase.description,
        message: error.message,
      });
      continue;
    }
    for (const test of testCase.tests) {
      tests++;
      const oracleValid = oracleValidate(clone(test.data));
      const replacementValid = replacementValidate(clone(test.data));
      const oracleErrors = oracleValidate.errors;
      const replacementErrors = replacementValidate.errors;
      const oracleText = oracle.errorsText(oracleErrors);
      const replacementText = replacement.errorsText(replacementErrors);
      const diff =
        firstDiff(replacementValid, oracleValid) ||
        firstDiff(replacementErrors, oracleErrors) ||
        firstDiff(replacementText, oracleText);
      if (!diff) agreements++;
      else {
        mismatches.push({
          source: testCase.source,
          schema: testCase.description,
          test: test.description,
          data: test.data,
          oracle: {valid: oracleValid, errors: oracleErrors, text: oracleText},
          replacement: {valid: replacementValid, errors: replacementErrors, text: replacementText},
          diff,
        });
      }
    }
  }

  return {tests, agreements, mismatches, compileFailures};
}

module.exports = {compareErrors, buildValidator};
