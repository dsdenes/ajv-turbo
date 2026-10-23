"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "regexp-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "regexp-project");

function documentLabel(document) {
  return JSON.stringify(document);
}

// The unchanged project supplies its own regular-expression implementation
// through the validator's configuration, across every dialect entry point. It
// is run once with ajv installed and once with this package installed in ajv's
// place; every printed row must match.
test("a project's regular-expression implementation matches ajv's patterns", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

  const rows = new Map(reference.map((row) => [row.case, row]));
  const row = (label) => {
    const entry = rows.get(label);
    assert.ok(entry, `missing case "${label}"`);
    return entry;
  };

  for (const dialect of ["draft-07", "2019-09", "2020-12"]) {
    // Without a supplied implementation the platform decides.
    assert.strictEqual(row(`${dialect} default pattern start`).valid, true);
    assert.strictEqual(row(`${dialect} default pattern finish`).valid, false);
    assert.strictEqual(row(`${dialect} default pattern finish`).errors[0].keyword, "pattern");

    // A literal pattern is compiled with the supplied implementation, so its
    // verdict changes with it.
    assert.strictEqual(row(`${dialect} custom pattern`).compiled, true);
    assert.strictEqual(row(`${dialect} custom pattern "start"`).valid, false);
    assert.strictEqual(row(`${dialect} custom pattern "finish"`).valid, true);
    assert.strictEqual(row(`${dialect} custom pattern "finish"`).errors, null);

    // The implementation decides which property names match, and therefore
    // which properties the additional-property rule refuses.
    assert.strictEqual(
      row(`${dialect} custom patternProperties {"leftOne":1}`).errors[0].keyword,
      "additionalProperties",
    );
    assert.strictEqual(row(`${dialect} custom patternProperties {"rightOne":1}`).valid, true);
    assert.strictEqual(row(`${dialect} custom patternProperties {}`).valid, true);

    // It decides patterns a document supplies at validation time.
    const supplied = (document) => `${dialect} custom data ${documentLabel(document)}`;
    assert.strictEqual(
      row(supplied({pattern: "^start", value: "finish"})).valid,
      true,
    );
    assert.strictEqual(
      row(supplied({pattern: "^start", value: "start"})).errors[0].keyword,
      "pattern",
    );

    // References reach the same implementation.
    assert.strictEqual(row(`${dialect} custom reference "finish"`).valid, true);
    assert.strictEqual(row(`${dialect} custom reference "start"`).valid, false);

    // Asynchronous validation uses it too.
    const asyncRefused = row(`${dialect} custom async {"leftOne":"one"}`);
    assert.strictEqual(asyncRefused.resolved, false);
    assert.strictEqual(asyncRefused.validation, true);
    assert.strictEqual(asyncRefused.errors[0].keyword, "additionalProperties");

    // The Unicode flag reaches the implementation, and the option controls it.
    assert.strictEqual(row(`${dialect} flagged unicode u`).valid, true);
    assert.strictEqual(row(`${dialect} flagged unicode n`).valid, false);
    assert.strictEqual(row(`${dialect} flagged no unicode u`).valid, false);
    assert.strictEqual(row(`${dialect} flagged no unicode n`).valid, true);

    // A refused literal pattern fails compilation with the implementation's
    // message, wherever the schema states it.
    for (const label of ["refused pattern", "refused patternProperties"]) {
      const refused = row(`${dialect} ${label}`);
      assert.strictEqual(refused.compiled, false);
      assert.strictEqual(refused.message, "engine refused ^refused$");
    }

    // A patternProperties entry whose schema never runs is skipped where ajv
    // skips it; dialects that track evaluated properties still match names, so
    // their patterns are compiled.
    if (dialect === "draft-07") {
      assert.strictEqual(row(`${dialect} skipped patternProperties`).compiled, true);
    } else {
      assert.strictEqual(row(`${dialect} skipped patternProperties`).compiled, false);
    }

    // A refused document-supplied pattern is a validation failure, as ajv
    // handles an uncompilable pattern at validation time.
    const refusedData = row(`${dialect} refused data`);
    assert.strictEqual(refusedData.valid, false);
    assert.deepStrictEqual(refusedData.errors[0].params, {pattern: "^refused$"});
    assert.strictEqual(refusedData.errors[0].message, 'must match pattern "^refused$"');
  }
});
