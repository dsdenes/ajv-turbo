"use strict";

const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");

function hashDirectory(dir, ignore = []) {
  const hash = crypto.createHash("sha256");
  const skip = new Set(ignore);
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "node_modules" || skip.has(entry.name)) continue;
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

// Copies a fixture project to a scratch directory inside the repository and
// leaves it ready for a validator to replace its `ajv` dependency.
function prepareCopy(sourceProject, workProject) {
  fs.rmSync(workProject, {recursive: true, force: true});
  fs.mkdirSync(path.dirname(workProject), {recursive: true});
  fs.cpSync(sourceProject, workProject, {recursive: true});
  fs.mkdirSync(path.join(workProject, "node_modules"), {recursive: true});
}

function linkValidator(workProject, packageDir) {
  const link = path.join(workProject, "node_modules", "ajv");
  fs.rmSync(link, {recursive: true, force: true});
  fs.symlinkSync(packageDir, link, "dir");
}

function runProject(workProject, extraEnv = {}) {
  const result = spawnSync(process.execPath, ["index.js"], {
    cwd: workProject,
    encoding: "utf8",
    env: {...process.env, NODE_ENV: "test", ...extraEnv},
  });
  assert.strictEqual(result.status, 0, `project failed to start: ${result.stderr}`);
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// Runs a project against the published ajv and then against this package,
// without editing anything but the installed `ajv` dependency. `ignore` names
// directories the project itself writes, such as generated validators.
function runWithBothValidators(sourceProject, workProject, extraEnv = {}, ignore = []) {
  prepareCopy(sourceProject, workProject);
  const projectBefore = hashDirectory(workProject, ignore);

  linkValidator(workProject, path.dirname(require.resolve("ajv-reference/package.json")));
  const reference = runProject(workProject, extraEnv);

  linkValidator(workProject, ROOT);
  const replacement = runProject(workProject, extraEnv);

  assert.strictEqual(hashDirectory(workProject, ignore), projectBefore, "project copy was edited");
  return {reference, replacement};
}

module.exports = {
  ROOT,
  hashDirectory,
  prepareCopy,
  linkValidator,
  runProject,
  runWithBothValidators,
};
