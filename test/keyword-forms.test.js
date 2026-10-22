"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "keyword-forms-project");

// The project registers both non-rule keyword forms — macros whose returned
// schema stands in for the keyword, and validation functions the project
// supplies — and prints one result per document. Running the unchanged
// project with ajv and then with this package in ajv's place must produce the
// same verdicts and the same reports through every dialect entry point.
for (const dialect of ["draft7", "2019", "2020"]) {
  test(`a project with fragment and function custom keywords runs unchanged (${dialect})`, () => {
    const before = hashDirectory(SOURCE_PROJECT);
    const workProject = path.join(ROOT, ".tmp", `keyword-forms-project-${dialect}`);
    const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, workProject, {
      DIALECT: dialect,
    });

    assert.deepStrictEqual(replacement, reference);
    assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

    const byCase = new Map(reference.map((row) => [row.case, row]));

    for (const mode of ["all errors", "first error"]) {
      const report = (name) => {
        const row = byCase.get(`${mode} ${name}`);
        assert.ok(row, `missing case "${mode} ${name}"`);
        return row;
      };

      assert.strictEqual(report("fragment macro valid").valid, true);
      assert.strictEqual(report("fragment macro invalid").valid, false);
      assert.strictEqual(
        report("fragment macro invalid").errors.at(-1).schemaPath,
        "#/properties/n/even",
      );

      assert.strictEqual(report("untyped fragment macro number").valid, false);
      assert.strictEqual(report("untyped fragment macro object").valid, false);
      assert.strictEqual(report("untyped fragment macro string").valid, true);
      assert.strictEqual(report("untyped fragment macro null").valid, true);

      assert.strictEqual(report("typed fragment macro valid").valid, true);
      assert.strictEqual(report("typed fragment macro invalid").valid, false);
      assert.strictEqual(report("typed fragment macro other type").valid, true);
      assert.strictEqual(report("typed fragment macro null").valid, true);

      assert.strictEqual(report("fragment reference valid").valid, true);
      assert.strictEqual(report("fragment reference invalid").valid, false);
      assert.match(report("fragment reference invalid").errors[0].schemaPath, /\/(definitions|\$defs)\/even\//);

      assert.strictEqual(report("external fragment reference valid").valid, true);
      assert.strictEqual(report("external fragment reference invalid").valid, false);
      assert.strictEqual(
        report("external fragment reference invalid").errors[0].schemaPath,
        "https://example.test/even/multipleOf",
      );

      assert.strictEqual(report("function keyword valid").valid, true);
      assert.strictEqual(report("function keyword invalid").valid, false);
      assert.strictEqual(report("function keyword other type").valid, true);
      assert.strictEqual(report("function keyword with errors valid").valid, true);
      assert.strictEqual(report("function keyword with errors invalid").valid, false);
      assert.strictEqual(
        report("function keyword with errors invalid").errors[0].keyword,
        "evenFunction",
      );

      assert.strictEqual(report("combined keywords valid").valid, true);
      assert.strictEqual(report("combined keywords macro fails").valid, false);
      assert.strictEqual(report("combined keywords limit fails").valid, false);

      assert.strictEqual(report("removal before").valid, false);
      assert.strictEqual(report("removal after").valid, true);
      assert.strictEqual(report("removal after").errors, null);
    }
  });
}
