"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const {ROOT, hashDirectory, prepareCopy, linkValidator} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "typed-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "typed-project");
const REFERENCE = path.dirname(require.resolve("ajv-reference/package.json"));
const TYPESCRIPT = path.join(path.dirname(require.resolve("typescript")), "..", "bin", "tsc");

function linkPackage(name, target) {
  const link = path.join(WORK_PROJECT, "node_modules", name);
  fs.rmSync(link, {recursive: true, force: true});
  fs.symlinkSync(target, link, "dir");
}

function runTsc(args) {
  const result = spawnSync(process.execPath, [TYPESCRIPT, ...args], {
    cwd: WORK_PROJECT,
    encoding: "utf8",
  });
  assert.strictEqual(
    result.status,
    0,
    `type check failed:\n${result.stdout}${result.stderr}`,
  );
}

function runCompiled() {
  const result = spawnSync(process.execPath, [path.join("dist", "index.js")], {
    cwd: WORK_PROJECT,
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 0, `typed project failed to run: ${result.stderr}`);
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("a typed ajv project compiles and validates unchanged when the replacement takes ajv's place", () => {
  const before = hashDirectory(SOURCE_PROJECT);

  prepareCopy(SOURCE_PROJECT, WORK_PROJECT);
  linkPackage("ajv-reference", REFERENCE);
  linkPackage("typescript", path.dirname(require.resolve("typescript/package.json")));

  // Control: the fixture is a project that type-checks against published ajv.
  linkValidator(WORK_PROJECT, REFERENCE);
  runTsc(["-p", "tsconfig.json", "--noEmit"]);
  runTsc(["-p", "tsconfig.subpaths.json"]);

  // Installed under ajv's name, the replacement type-checks and compiles the
  // unchanged project.
  linkValidator(WORK_PROJECT, ROOT);
  runTsc(["-p", "tsconfig.json"]);

  const replacement = runCompiled();
  linkValidator(WORK_PROJECT, REFERENCE);
  const reference = runCompiled();

  assert.deepStrictEqual(replacement, reference);
  assert.ok(reference.length >= 5, "expected every typed case to be validated");
  assert.ok(
    reference.some((result) => result.name === "order.invalid" && result.valid === false),
    "expected an invalid order case",
  );
  assert.ok(
    reference.some((result) => result.name === "async.invalid" && result.valid === false),
    "expected an invalid asynchronous case",
  );

  // Every type ajv publishes from an entry point resolves from the same entry
  // point of the replacement, and the replacement's values are accepted where
  // ajv's corresponding types are accepted.
  linkValidator(WORK_PROJECT, ROOT);
  runTsc(["-p", "tsconfig.compat.json"]);
  runTsc(["-p", "tsconfig.subpaths.json"]);

  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
});
