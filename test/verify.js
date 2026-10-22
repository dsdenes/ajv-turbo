"use strict";

const {
  collectSuiteCases,
  collectSuite2019Cases,
  collectSuite2020Cases,
  collectBenchmarkCases,
  readRemoteSchemas,
  readRemoteSchemas2020,
  usableRemotes,
} = require("./lib/cases");

function buildValidator(Ajv, source, remotes = readRemoteSchemas()) {
  const ajv = new Ajv({strict: false});
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

function compare(
  name,
  cases,
  {AjvReference = require("ajv-reference"), AjvReplacement = require("../"), remotes = readRemoteSchemas()} = {},
) {
  const oracle = buildValidator(AjvReference, "oracle", remotes);
  const replacement = buildValidator(AjvReplacement, "replacement", remotes);

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
  const suite2019 = compare("json-schema-test-suite draft2019-09", collectSuite2019Cases(), {
    AjvReference: require("ajv-reference/dist/2019"),
    AjvReplacement: require("../dist/2019"),
  });
  const suite2020 = compare("json-schema-test-suite draft2020-12", collectSuite2020Cases(), {
    AjvReference: require("ajv-reference/dist/2020"),
    AjvReplacement: require("../dist/2020"),
    remotes: usableRemotes(require("ajv-reference/dist/2020"), readRemoteSchemas2020()),
  });
  const bench = compare("ajv benchmark schemas (core keywords)", collectBenchmarkCases());
  print(suite);
  print(suite2019);
  print(suite2020);
  print(bench);
  const results = [suite, suite2019, suite2020, bench];
  const failed = results.some(
    (result) =>
      result.mismatches.length > 0 ||
      result.compileFailures.length > 0 ||
      result.tests === 0,
  );
  if (failed) process.exitCode = 1;
}

module.exports = {compare, buildValidator};
