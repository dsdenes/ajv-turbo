"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "existing-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "drop-in-project");

test("an ajv project runs unchanged when the replacement takes ajv's place", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.ok(reference.length >= 30, "expected every fixture document to be validated twice");

  for (const result of reference) {
    assert.strictEqual(result.synchronous, true, `${result.case} should report immediately`);
    assert.strictEqual(result.promise, false, `${result.case} should not validate asynchronously`);
    if (result.valid) {
      assert.strictEqual(result.errors, null, `${result.case} should report no errors`);
      assert.strictEqual(result.text, "No errors", `${result.case} should summarize no errors`);
    } else {
      assert.ok(Array.isArray(result.errors) && result.errors.length > 0, `${result.case} should report errors`);
      assert.notStrictEqual(result.text, "No errors", `${result.case} should summarize errors`);
      if (result.case === "text.invalid.first") {
        assert.strictEqual(result.errors.length, 1, "default collection reports the first violation only");
      }
    }
    if (result.case.endsWith(".valid") || result.case.endsWith(".registered.valid")) {
      assert.strictEqual(result.valid, true, `${result.case} should be valid`);
    } else if (!result.case.endsWith(".first")) {
      assert.strictEqual(result.valid, false, `${result.case} should be invalid`);
    }
  }
});
