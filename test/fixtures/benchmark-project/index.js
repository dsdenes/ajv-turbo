"use strict";

// An unchanged project that validates every document of every published
// benchmark case. The case list, schemas, documents, and remote schemas come
// from BENCHMARK_CASES, so switching the installed `ajv` package is the only
// difference between runs.

const fs = require("fs");
const Ajv = require("ajv");

const manifestPath = process.env.BENCHMARK_CASES;
if (!manifestPath) throw new Error("BENCHMARK_CASES is not set");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const ajv = new Ajv(manifest.options);
for (const remote of manifest.remotes) {
  ajv.addSchema(remote.schema, remote.uri);
}

const results = [];
for (const testCase of manifest.cases) {
  let validate;
  try {
    validate = ajv.compile(testCase.schema);
  } catch (error) {
    results.push({case: testCase.name, compile: false});
    continue;
  }
  for (const test of testCase.tests) {
    const valid = validate(structuredClone(test.data));
    results.push({case: testCase.name, document: test.description, valid});
  }
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
