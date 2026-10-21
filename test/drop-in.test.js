"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {spawnSync} = require("child_process");

const ROOT = path.join(__dirname, "..");
const SOURCE_PROJECT = path.join(__dirname, "fixtures", "existing-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "drop-in-project");

function hashDirectory(dir) {
  const hash = crypto.createHash("sha256");
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        hash.update(path.relative(dir, full));
        hash.update(fs.readFileSync(full));
      }
    }
  };
  walk(dir);
  return hash.digest("hex");
}

function prepareProject() {
  fs.rmSync(WORK_PROJECT, {recursive: true, force: true});
  fs.mkdirSync(path.dirname(WORK_PROJECT), {recursive: true});
  fs.cpSync(SOURCE_PROJECT, WORK_PROJECT, {recursive: true});
  fs.mkdirSync(path.join(WORK_PROJECT, "node_modules"), {recursive: true});
}

function linkValidator(packageDir) {
  const link = path.join(WORK_PROJECT, "node_modules", "ajv");
  fs.rmSync(link, {recursive: true, force: true});
  fs.symlinkSync(packageDir, link, "dir");
}

function runProject() {
  const result = spawnSync(process.execPath, ["index.js"], {
    cwd: WORK_PROJECT,
    encoding: "utf8",
    env: {...process.env, NODE_ENV: "test"},
  });
  assert.strictEqual(result.status, 0, `project failed to start: ${result.stderr}`);
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("an ajv project runs unchanged when the replacement takes ajv's place", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  prepareProject();
  const projectBefore = hashDirectory(WORK_PROJECT);

  const referenceDir = path.dirname(require.resolve("ajv-reference/package.json"));
  linkValidator(referenceDir);
  const reference = runProject();

  linkValidator(ROOT);
  const replacement = runProject();

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.strictEqual(hashDirectory(WORK_PROJECT), projectBefore, "project copy was edited");
  assert.ok(reference.length >= 30, "expected every fixture document to be validated twice");

  for (const result of reference) {
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
