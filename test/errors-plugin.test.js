"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {
  ROOT,
  hashDirectory,
  prepareCopy,
  linkValidator,
  runProject,
} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "errors-plugin-project");

// ajv-errors resolves `ajv` from its own directory, so a scratch copy is what
// makes the linked validator the one the extension loads. A symlink would keep
// resolving through this repository's installed ajv instead.
function installPlugin(workProject) {
  const source = path.dirname(require.resolve("ajv-errors/package.json"));
  const target = path.join(workProject, "node_modules", "ajv-errors");
  fs.cpSync(source, target, {recursive: true});
}

function run(dialect) {
  const workProject = path.join(ROOT, ".tmp", `errors-plugin-project-${dialect}`);
  const before = hashDirectory(SOURCE_PROJECT);
  prepareCopy(SOURCE_PROJECT, workProject);
  installPlugin(workProject);
  const projectBefore = hashDirectory(workProject);

  linkValidator(workProject, path.dirname(require.resolve("ajv-reference/package.json")));
  const reference = runProject(workProject, {DIALECT: dialect});

  linkValidator(workProject, ROOT);
  const replacement = runProject(workProject, {DIALECT: dialect});

  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.strictEqual(hashDirectory(workProject), projectBefore, "project copy was edited");
  return {reference, replacement};
}

for (const dialect of ["draft7", "2019", "2020"]) {
  test(
    `a project that customizes error messages through the extension runs unchanged (${dialect})`,
    () => {
      const {reference, replacement} = run(dialect);

      const rows = (output) => output.filter((row) => row.label !== "resolution");
      assert.deepStrictEqual(rows(replacement), rows(reference));
      assert.ok(reference.length >= 19, "expected every fixture document to be validated");

      const byLabel = new Map(reference.map((row) => [row.label, row]));
      for (const output of [reference, replacement]) {
        const resolution = output.find((row) => row.label === "resolution");
        assert.strictEqual(
          resolution.extension,
          resolution.validator,
          "the extension must load the same validator module as the project",
        );
      }

      const replacementMessage = (label) => {
        const row = byLabel.get(label);
        assert.ok(row, `${label} should be reported`);
        assert.strictEqual(row.valid, false, `${label} should be invalid`);
        assert.strictEqual(row.errors[0].keyword, "errorMessage", `${label} should be replaced`);
        assert.strictEqual(row.text, `data${row.errors[0].instancePath} ${row.errors[0].message}`);
        return row.errors[0].message;
      };

      assert.strictEqual(replacementMessage("single.invalid"), "foo must be a string");
      assert.strictEqual(replacementMessage("all-at-location.invalid"), "bad foo");
      assert.strictEqual(replacementMessage("property.invalid"), "foo is wrong");
      assert.strictEqual(replacementMessage("keyword.required"), "need foo");
      assert.strictEqual(replacementMessage("keyword.length"), "too short");
      assert.strictEqual(replacementMessage("items.invalid"), "each entry must be text");

      const unconfigured = byLabel.get("unconfigured.invalid");
      assert.deepStrictEqual(
        unconfigured.errors.map((error) => error.keyword).sort(),
        ["required", "type"],
        "ordinary reports are unchanged",
      );

      const first = byLabel.get("plain-first.invalid");
      assert.strictEqual(first.errors.length, 1, "default reporting keeps the first error only");
      const all = byLabel.get("plain-all.invalid");
      assert.strictEqual(all.errors.length, 2, "all-errors reporting keeps every error");

      for (const row of reference) {
        if (row.valid) {
          assert.strictEqual(row.text, "No errors", `${row.label} should summarize no errors`);
        }
      }
    },
  );
}
