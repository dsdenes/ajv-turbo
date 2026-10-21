"use strict";

const {collectSuiteCases, collectBenchmarkCases, readRemoteSchemas} = require("./lib/cases");

function buildValidator(Ajv, source) {
  const ajv = new Ajv({strict: false});
  for (const remote of readRemoteSchemas()) {
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

function compare(name, cases) {
  const AjvReference = require("ajv-reference");
  const AjvReplacement = require("../");
  const oracle = buildValidator(AjvReference, "oracle");
  const replacement = buildValidator(AjvReplacement, "replacement");

  let tests = 0;
  let agreements = 0;
  let skippedCompile = 0;
  const mismatches = [];
  const compileFailures = [];

  for (const testCase of cases) {
    let oracleValidate;
    let replacementValidate;
    try {
      oracleValidate = oracle.compile(testCase.schema);
    } catch {
      skippedCompile++;
      continue;
    }
    try {
      replacementValidate = replacement.compile(testCase.schema);
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
      if (oracleValid === replacementValid) agreements++;
      else {
        mismatches.push({
          source: testCase.source,
          schema: testCase.description,
          test: test.description,
          oracle: oracleValid,
          replacement: replacementValid,
          declared: test.valid,
        });
      }
    }
  }

  return {name, cases: cases.length, tests, agreements, skippedCompile, mismatches, compileFailures};
}

function print(result) {
  console.log(`\n== ${result.name}`);
  console.log(
    `cases=${result.cases} tests=${result.tests} agree=${result.agreements} ` +
      `mismatch=${result.mismatches.length} compileFailures=${result.compileFailures.length} ` +
      `ajvCompileSkipped=${result.skippedCompile}`,
  );
  for (const failure of result.compileFailures.slice(0, 20)) {
    console.log(`COMPILE ${failure.source} :: ${failure.schema} :: ${failure.message}`);
  }
  for (const mismatch of result.mismatches.slice(0, 40)) {
    console.log(
      `MISMATCH ${mismatch.source} :: ${mismatch.schema} :: ${mismatch.test} ` +
        `ajv=${mismatch.oracle} replacement=${mismatch.replacement} declared=${mismatch.declared}`,
    );
  }
}

if (require.main === module) {
  const suite = compare("json-schema-test-suite draft7 (core keywords)", collectSuiteCases());
  const bench = compare("ajv benchmark schemas (core keywords)", collectBenchmarkCases());
  print(suite);
  print(bench);
  const failed =
    suite.mismatches.length > 0 ||
    bench.mismatches.length > 0 ||
    suite.compileFailures.length > 0 ||
    bench.compileFailures.length > 0 ||
    suite.tests === 0 ||
    bench.tests === 0;
  if (failed) process.exitCode = 1;
}

module.exports = {compare, buildValidator};
