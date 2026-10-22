"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {ROOT, hashDirectory, prepareCopy, linkValidator, runProject} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "formats-plugin-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "formats-plugin-project");
const PLUGIN_DIR = path.dirname(require.resolve("ajv-formats/package.json"));

// The unchanged project loads ajv's official formats plugin and prints the
// verdict, the full report, and the summary for every format the plugin
// defines, for the range keywords it registers, for the plugin's lookup, and
// for projects that never load it.
test("ajv's official formats plugin runs unchanged when the replacement takes ajv's place", () => {
  prepareCopy(SOURCE_PROJECT, WORK_PROJECT);
  fs.cpSync(PLUGIN_DIR, path.join(WORK_PROJECT, "node_modules", "ajv-formats"), {
    recursive: true,
  });
  const before = hashDirectory(WORK_PROJECT);

  linkValidator(WORK_PROJECT, path.dirname(require.resolve("ajv-reference/package.json")));
  const reference = runProject(WORK_PROJECT);

  linkValidator(WORK_PROJECT, ROOT);
  const replacement = runProject(WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(WORK_PROJECT), before, "fixture project was edited");

  const count = (label) => reference.filter((result) => result.label === label).length;
  assert.strictEqual(count("formats"), 312, "every format, dialect, reporting mode, and verdict");
  assert.strictEqual(count("formats-fast"), 312, "every fast-mode format and verdict");
  assert.strictEqual(count("range"), 276, "every range keyword and document");
  assert.strictEqual(count("dependencies"), 12, "the format dependency on both sides");
  assert.strictEqual(count("lookup"), 52, "every format definition in both modes");
  assert.strictEqual(count("lookup-unknown"), 2, "the unknown-format refusal in both modes");
  assert.strictEqual(count("no-plugin"), 42, "projects that never load the plugin");

  const formatResults = reference.filter(
    (result) => result.label === "formats" || result.label === "formats-fast",
  );
  assert.ok(formatResults.some((result) => result.kind === "accept" && result.result.valid));
  assert.ok(formatResults.some((result) => result.kind === "reject" && !result.result.valid));
  for (const result of reference) {
    if (result.label === "range" && result.case === "exclusive") {
      if (result.document.low === "2020-01-01" || result.document.high === "2020-06-01") {
        assert.strictEqual(result.result.valid, false, "exclusive limits reject the boundary");
      }
      if (result.document.low === "2020-02-01" && result.document.high === "2020-05-01") {
        assert.strictEqual(result.result.valid, true, "exclusive limits accept inside the range");
      }
    }
  }

  for (const result of reference) {
    if (result.label === "dependencies") {
      if (result.kind === "missing") {
        assert.strictEqual(
          result.outcome,
          "parent schema must have dependencies of formatMaximum: format",
        );
      } else if (result.kind === "declared") {
        assert.strictEqual(result.outcome, "compiled");
      } else {
        assert.match(result.outcome, /does not define "compare" function/);
      }
    }
  }

  const unknown = reference.filter((result) => result.label === "lookup-unknown");
  for (const result of unknown) {
    assert.strictEqual(result.outcome, 'Unknown format "no-such-format"');
  }

  const noPluginUnknown = reference.filter(
    (result) => result.label === "no-plugin" && result.case === "unknown",
  );
  assert.ok(noPluginUnknown.length > 0);
  for (const result of noPluginUnknown) {
    assert.strictEqual(result.result.valid, typeof result.document === "string");
  }
});
