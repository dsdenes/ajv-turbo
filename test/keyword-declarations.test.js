"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "keyword-declarations-project");

// The project registers keyword definitions that use every optional
// declaration ajv honours beyond a plain rule or macro: a compiled rule, a
// value schema, placement before another keyword and after all of them,
// implemented keywords, and a reason for an unusable document-sourced value.
// Running the unchanged project with ajv and then with this package in ajv's
// place must produce the same verdicts, reports, and compile-time rejections
// through every dialect entry point.
for (const dialect of ["draft7", "2019", "2020"]) {
  test(`a project with optional keyword declarations runs unchanged (${dialect})`, () => {
    const before = hashDirectory(SOURCE_PROJECT);
    const workProject = path.join(ROOT, ".tmp", `keyword-declarations-project-${dialect}`);
    const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, workProject, {
      DIALECT: dialect,
    });

    assert.deepStrictEqual(replacement, reference);
    assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

    const byCase = new Map(reference.map((row) => [row.case, row]));
    const report = (name) => {
      const row = byCase.get(name);
      assert.ok(row, `missing case "${name}"`);
      return row;
    };
    const keywords = (name) => report(name).errors.map((error) => error.keyword);

    // The rule is compiled once per schema location — one location in each of
    // the four reporting modes — not once per document.
    assert.strictEqual(report("compile calls").compileCalls, 4);

    assert.strictEqual(report("all errors compiled rule valid").valid, true);
    assert.strictEqual(report("all errors compiled rule rule fails").valid, false);
    assert.deepStrictEqual(keywords("all errors compiled rule rule fails"), ["multiple"]);
    assert.strictEqual(
      report("all errors compiled rule rule fails").errors[0].schemaPath,
      "#/properties/n/multiple",
    );

    // A value that does not fit the keyword's own schema is rejected when the
    // schema is compiled, with ajv's reason; a fitting value compiles.
    assert.strictEqual(
      report("all errors value schema 0").error,
      'keyword "port" value is invalid at path "#/properties/p": data must be >= 1',
    );
    assert.strictEqual(
      report("all errors value schema 70000").error,
      'keyword "port" value is invalid at path "#/properties/p": data must be <= 65535',
    );
    assert.strictEqual(report("all errors value schema accepted valid").valid, true);
    assert.strictEqual(report("all errors value schema accepted wrong type").valid, true);

    // Placement: the keyword declared before `required` reports before it, the
    // post keyword reports after every other group, and the keyword that stands
    // in for `lowerBound`/`upperBound` runs where they appear.
    assert.deepStrictEqual(keywords("all errors placement several fail"), [
      "owner",
      "required",
      "bounded",
      "approved",
    ]);
    assert.deepStrictEqual(keywords("first error placement several fail"), ["owner"]);
    assert.deepStrictEqual(keywords("first error placement implemented keyword fails"), [
      "bounded",
    ]);

    // A typed post keyword is rejected the way ajv rejects it.
    assert.strictEqual(
      report("all errors typed post").error,
      'keyword with "post" flag cannot have "type"',
    );

    // An unusable document-sourced value reports the definition's own reason.
    const unusable = report("all errors document value unusable value").errors;
    const dataError = unusable.find((error) => error.keyword === "underLimit");
    assert.deepStrictEqual(dataError.params, {reason: "document value"});
    assert.strictEqual(dataError.message, '"underLimit" needs a number from the document');
    assert.strictEqual(
      report("all errors document value limit fails").errors[0].message,
      'must pass "underLimit" keyword validation',
    );
    assert.strictEqual(report("all errors document value absent").valid, true);
  });
}
