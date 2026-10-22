"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "standalone-data-reference-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "standalone-data-reference-project");

const MODES = ["default", "complete", "verbose", "message-free"];
const DOCUMENTS = 12;

function stripSchema(row) {
  const copy = {...row};
  delete copy.schema;
  return copy;
}

// The unchanged project generates one validator per reporting mode for a
// schema reading a limit and the required member names from the document, and
// one for a schema reading nothing from it. It writes the generated modules
// into its own tree, loads them, and prints every verdict, report, and
// summary. It runs once with ajv installed and once with this package in its
// place; every printed line must match.
test("an ajv project's generated validators honour document-sourced values", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(
    SOURCE_PROJECT,
    WORK_PROJECT,
    {},
    ["generated"],
  );

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.strictEqual(reference.length, 3 * MODES.length * DOCUMENTS);

  const rows = new Map(reference.map((row) => [`${row.schema}/${row.mode}/${row.case}`, row]));

  for (const mode of MODES) {
    // The schema accepts documents that satisfy the values read from the
    // document, rejects a document at each place that reads from it, and skips
    // a keyword whose location is absent.
    assert.strictEqual(rows.get(`document/${mode}/valid`).valid, true);
    assert.strictEqual(rows.get(`document/${mode}/valid-empty-items`).valid, true);
    assert.strictEqual(rows.get(`document/${mode}/maximum-fails`).valid, false);
    assert.strictEqual(rows.get(`document/${mode}/maximum-limit-two`).valid, false);
    assert.strictEqual(rows.get(`document/${mode}/required-fails`).valid, false);
    assert.strictEqual(rows.get(`document/${mode}/required-absent`).valid, true);
    assert.strictEqual(rows.get(`document/${mode}/limit-absent`).valid, true);
    // A location holding a value of the wrong type is ajv's $data error.
    assert.strictEqual(rows.get(`document/${mode}/required-wrong-type`).valid, false);
    assert.strictEqual(rows.get(`document/${mode}/limit-wrong-type`).valid, false);
    assert.strictEqual(rows.get(`document/${mode}/both-wrong-type`).valid, false);
  }

  // Default reporting stops at the first failure.
  assert.strictEqual(rows.get("document/default/maximum-fails").errors.length, 1);
  assert.strictEqual(rows.get("document/default/limit-wrong-type").errors.length, 1);

  // Complete reporting reaches every place that reads from the document.
  const wrongType = rows.get("document/complete/limit-wrong-type");
  assert.deepStrictEqual(wrongType.errors.map((error) => error.keyword), ["type", "maximum"]);
  assert.deepStrictEqual(wrongType.errors[1].params, {comparison: "<=", limit: "5"});
  assert.strictEqual(wrongType.errors[1].message, "must be <= 5");
  const both = rows.get("document/complete/both-wrong-type");
  assert.ok(both.errors.some((error) => error.message === '"required" keyword must be array ($data)'));
  assert.ok(both.errors.some((error) => error.keyword === "maximum"));

  // Verbose reporting carries the literal reference and the resolved value.
  const verbose = rows.get("document/verbose/maximum-fails").errors[0];
  assert.deepStrictEqual(verbose.schema, {$data: "/limit"});
  assert.deepStrictEqual(verbose.parentSchema, {type: "number", maximum: {$data: "/limit"}});
  assert.strictEqual(verbose.data, 6);

  // Message-free reporting omits every message.
  const messageFree = rows.get("document/message-free/both-wrong-type");
  assert.ok(messageFree.errors.length > 1);
  assert.ok(messageFree.errors.every((error) => !("message" in error)));

  // Summaries match the reports.
  assert.strictEqual(rows.get("document/default/valid").text, "No errors");
  assert.strictEqual(rows.get("document/default/maximum-fails").text, "data/items/1 must be <= 5");
  assert.strictEqual(
    rows.get("document/default/required-wrong-type").text,
    'data "required" keyword must be array ($data)',
  );

  // A schema that reads nothing from the document behaves the same whether or
  // not the data-reference option is enabled, and keeps its literal rules.
  const plain = reference.filter((row) => row.schema === "plain").map(stripSchema);
  const plainWithoutOption = reference
    .filter((row) => row.schema === "plain-without-option")
    .map(stripSchema);
  assert.deepStrictEqual(plainWithoutOption, plain);
  assert.strictEqual(rows.get("plain/default/valid").valid, true);
  assert.strictEqual(rows.get("plain/default/maximum-fails").valid, false);
  assert.strictEqual(rows.get("plain/default/required-absent").valid, false);
  assert.strictEqual(rows.get("plain/verbose/maximum-fails").errors[0].message, "must be <= 5");
  assert.strictEqual(rows.get("plain/default/maximum-fails").text, "data/items/1 must be <= 5");
});

// A generated validator must keep running in a plain Node.js program with the
// package absent: the module is written to a directory whose ancestors hold no
// `ajv` package and loaded by a fresh process.
test("a generated data-reference validator runs without the package", () => {
  const Ajv = require("../");
  const standaloneCode = require("../dist/standalone");

  const ajv = new Ajv({strict: false, $data: true, allErrors: true, code: {source: true}});
  const schema = {
    type: "object",
    properties: {
      limit: {type: "number"},
      requiredNames: {type: "array", items: {type: "string"}},
      items: {type: "array", items: {type: "number", maximum: {$data: "/limit"}}},
    },
    required: {$data: "/requiredNames"},
  };
  const code = standaloneCode(ajv, ajv.compile(schema));
  assert.ok(
    !/\brequire\(\s*["'](?!\.)/.test(code),
    "generated module must not require an installed package",
  );
  assert.ok(!/\bimport\s/.test(code), "generated module must not import a package");

  const dir = path.join(ROOT, ".tmp", "standalone-data-reference-plain");
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  // A package of its own, so the repository's `ajv` package cannot resolve
  // through self-reference.
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({name: "plain-runner", private: true}),
  );
  const file = path.join(dir, "validate.js");
  fs.writeFileSync(file, code);

  // The repository installs development packages named `ajv` for comparison
  // and plugin fixtures, so absence is simulated by refusing that name rather
  // than relying on the run directory's position in the resolution chain.
  const script = [
    "const Module = require('module');",
    "const resolveFilename = Module._resolveFilename;",
    "Module._resolveFilename = function (request, ...args) {",
    "  if (request === 'ajv' || request.startsWith('ajv/')) {",
    "    const error = new Error(`Cannot find module '${request}'`);",
    "    error.code = 'MODULE_NOT_FOUND';",
    "    throw error;",
    "  }",
    "  return resolveFilename.call(this, request, ...args);",
    "};",
    "const validate = require(process.argv[1]);",
    "let packageAbsent = false;",
    "try { require.resolve('ajv'); } catch { packageAbsent = true; }",
    "const bad = validate({limit: 5, requiredNames: ['limit'], items: [1, 6]});",
    "const badErrors = validate.errors;",
    "const good = validate({limit: 5, requiredNames: ['limit'], items: [1, 5]});",
    "process.stdout.write(JSON.stringify({bad, badErrors, good, packageAbsent}));",
  ].join("\n");
  const result = spawnSync(process.execPath, ["-e", script, file], {
    cwd: dir,
    encoding: "utf8",
    env: {...process.env, NODE_PATH: ""},
  });
  assert.strictEqual(result.status, 0, result.stderr);
  const printed = JSON.parse(result.stdout);
  assert.strictEqual(printed.packageAbsent, true, "the package must not resolve from the run directory");
  assert.strictEqual(printed.good, true);
  assert.strictEqual(printed.bad, false);
  assert.strictEqual(printed.badErrors[0].keyword, "maximum");
  assert.strictEqual(printed.badErrors[0].message, "must be <= 5");
});
