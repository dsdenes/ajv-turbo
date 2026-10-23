"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "draft-06-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "draft-06-project");

// The unchanged project adds the draft-06 meta-schema the way ajv's
// documentation instructs (`ajv.addMetaSchema(require("ajv/dist/refs/json-schema-draft-06.json"))`),
// then compiles draft-06 schemas and validates valid, partly invalid, and
// wholly invalid documents through the normal path. It runs once with ajv
// installed and once with this package installed in ajv's place.
test("an ajv project's draft-06 schemas, verdicts, and reports survive the switch unchanged", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.strictEqual(reference.length, 28, "expected every document and malformed schema to be reported");

  const byCase = new Map(reference.map((row) => [row.case, row]));

  for (const name of ["catalog", "profile", "subscription"]) {
    const valid = byCase.get(`${name}.valid`);
    assert.strictEqual(valid.valid, true, `${name}.valid should be valid`);
    assert.strictEqual(valid.errors, null, `${name}.valid should report no errors`);
    assert.strictEqual(valid.text, "No errors", `${name}.valid should summarize no errors`);

    for (const kind of ["partial", "invalid"]) {
      const complete = byCase.get(`${name}.${kind}`);
      const first = byCase.get(`${name}.${kind}.first`);
      assert.strictEqual(complete.valid, false, `${name}.${kind} should be invalid`);
      assert.ok(complete.errors.length > 1, `${name}.${kind} should report every violation`);
      assert.strictEqual(first.valid, false, `${name}.${kind}.first should be invalid`);
      assert.strictEqual(first.errors.length, 1, `${name}.${kind}.first should report the first violation only`);
      assert.notStrictEqual(complete.text, "No errors", `${name}.${kind} should summarize errors`);
      assert.ok(complete.text.startsWith(`data${complete.errors[0].instancePath}`), "summary should render the first entry");
    }
  }

  assert.strictEqual(byCase.get("catalog.registered.valid").valid, true, "registered draft-06 schema should validate");

  const malformed = reference.filter((row) => row.case.startsWith("malformed."));
  assert.strictEqual(malformed.length, 9, "expected every malformed schema to be presented");
  for (const row of malformed) {
    if (row.case === "malformed.bad-if") {
      // `if` is not part of the draft-06 meta-schema, so ajv refuses its value
      // while compiling the keyword rather than through schema validation.
      assert.strictEqual(row.message, 'if value must be ["object","boolean"]');
      continue;
    }
    assert.ok(
      row.message.startsWith("schema is invalid: "),
      `${row.case} should be refused by the draft-06 meta-schema, got: ${row.message}`,
    );
  }
});
