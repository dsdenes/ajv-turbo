"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");
const {readRemoteSchemas} = require("./lib/cases");
const {readPublishedCases} = require("../bench/runner");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "benchmark-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "benchmark-project");
const MANIFEST = path.join(ROOT, ".tmp", "benchmark-cases.json");

// The same setup the published suite gives ajv: `{schemaId: "auto"}` and the
// JSON-Schema-Test-Suite remotes registered under localhost:1234.
const OPTIONS = {schemaId: "auto"};

function buildValidator(Ajv) {
  const ajv = new Ajv(OPTIONS);
  for (const remote of readRemoteSchemas()) ajv.addSchema(remote.schema, remote.uri);
  return ajv;
}

function writeManifest() {
  const ajv = buildValidator(require("ajv-reference"));
  const replacement = buildValidator(require(".."));
  const cases = [];
  for (const testCase of readPublishedCases()) {
    try {
      ajv.compile(testCase.schema);
    } catch {
      continue;
    }
    try {
      replacement.compile(testCase.schema);
    } catch {
      continue;
    }
    cases.push({
      name: `${testCase.source} :: ${testCase.description}`,
      schema: testCase.schema,
      tests: testCase.tests,
    });
  }
  const manifest = {
    options: OPTIONS,
    remotes: readRemoteSchemas(),
    cases,
  };
  fs.mkdirSync(path.dirname(MANIFEST), {recursive: true});
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest));
  return {
    cases: cases.length,
    documents: cases.reduce((total, testCase) => total + testCase.tests.length, 0),
  };
}

test("an ajv project validates every published benchmark document unchanged with the replacement", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const expected = writeManifest();
  assert.ok(expected.cases > 0, "expected benchmark cases to compare");

  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT, {
    BENCHMARK_CASES: MANIFEST,
  });

  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.strictEqual(reference.length, expected.documents, "every benchmark document was validated");
  assert.strictEqual(
    reference.filter((result) => result.compile === false).length,
    0,
    "the selected benchmark cases compile in the project",
  );
  assert.deepStrictEqual(replacement, reference);
  for (const result of reference) {
    assert.strictEqual(typeof result.valid, "boolean", `${result.case} :: ${result.document} has a verdict`);
  }
});
