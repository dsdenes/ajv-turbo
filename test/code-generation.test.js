"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "code-generation-project");

test("a project that imports ajv's published code-generation helpers runs unchanged", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(
    SOURCE_PROJECT,
    path.join(ROOT, ".tmp", "code-generation-project"),
  );

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

  const byCase = new Map(reference.map((row) => [row.case, row]));

  // The generator builds and evaluates the same source, and the published
  // helpers are the root entry's own objects.
  const source = byCase.get("generated source");
  assert.strictEqual(source.value, "five");
  assert.match(source.source, /^const sum0 = 2 \+ 3;/);
  assert.strictEqual(source.scopeName, "v0");

  const helpers = byCase.get("helper expressions");
  assert.strictEqual(helpers.str, '"a"+b+"c"');
  assert.strictEqual(helpers.property, ".length");
  assert.strictEqual(helpers.bracket, '["a-b"]');
  assert.strictEqual(helpers.sameGenerator, true);
  assert.strictEqual(helpers.sameUnderscore, true);
  assert.strictEqual(helpers.sameName, true);

  for (const mode of ["all errors", "first error", "verbose", "message-free"]) {
    assert.strictEqual(byCase.get(`${mode} string rule valid`).valid, true);
    assert.strictEqual(byCase.get(`${mode} string rule fails`).valid, false);
    assert.strictEqual(
      byCase.get(`${mode} string rule fails`).errors[0].schemaPath,
      "#/properties/value/startsWithCodegen",
    );
    assert.strictEqual(byCase.get(`${mode} range valid`).valid, true);
    assert.strictEqual(byCase.get(`${mode} range low`).valid, false);
    assert.strictEqual(byCase.get(`${mode} range high`).valid, false);
    assert.strictEqual(byCase.get(`${mode} property rule valid`).valid, true);
    assert.strictEqual(byCase.get(`${mode} property rule fails`).valid, false);
    assert.deepStrictEqual(
      byCase.get(`${mode} property rule fails`).errors[0].params,
      {limit: 3},
    );
    assert.strictEqual(byCase.get(`${mode} generated loop valid`).valid, true);
    assert.strictEqual(byCase.get(`${mode} generated loop one fails`).valid, false);
    assert.deepStrictEqual(
      byCase.get(`${mode} generated loop one fails`).errors[0].params,
      {bad: "Z"},
    );
  }
});
