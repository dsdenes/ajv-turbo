"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "report-options-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "report-options-project");

// The unchanged project imports `ajv`, `ajv/dist/2019`, `ajv/dist/2020`,
// `ajv/dist/jtd`, and `ajv/dist/standalone`, uses verbose and message-free
// reporting everywhere, and prints each report with its summary. It runs once
// with ajv installed and once with this package installed in ajv's place.
test("an ajv project's verbose and message-free reports survive the switch unchanged", () => {
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT, {}, ["generated"]);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(reference.length, 12, "expected every report case to run");

  const byCase = new Map(reference.map((row) => [row.case, row]));
  assert.ok(byCase.get("draft-07 verbose").errors.every((error) => "schema" in error && "parentSchema" in error));
  assert.ok(byCase.get("2019-09 verbose").errors.every((error) => "data" in error));
  assert.ok(byCase.get("jtd verbose").errors.every((error) => "schema" in error && "parentSchema" in error));
  assert.ok(byCase.get("custom verbose").errors.some((error) => error.keyword === "evenLimit"));
  assert.ok(byCase.get("async verbose").errors.some((error) => error.keyword === "available"));

  for (const label of ["draft-07 verbose message-free", "2020-12 verbose message-free"]) {
    assert.ok(
      byCase.get(label).errors.every((error) => !("message" in error)),
      `${label} must omit every schema-generated message`,
    );
  }
  assert.ok(
    byCase.get("draft-07 message-free").errors.every((error) => !("message" in error)),
    "messages: false must omit every message",
  );
  assert.ok(
    byCase.get("custom verbose").errors.some((error) => error.keyword === "evenLimit" && error.message),
    "an entry a custom rule supplies keeps its own message",
  );
  for (const label of ["standalone verbose", "standalone message-free"]) {
    assert.ok(byCase.has(label), `${label} must load a generated validator`);
  }
});
