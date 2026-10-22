"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "standalone-discriminator-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "standalone-discriminator-project");

const MODES = ["default", "complete", "verbose", "message-free"];
const DIALECTS = ["draft-07", "2019-09", "2020-12"];
const SCHEMAS = ["tagged", "plain"];
const DOCUMENTS = 15;

// The unchanged project generates one validator per dialect, schema, and
// reporting mode, writes them into its own tree, and prints every verdict,
// report, and summary. It runs once with ajv installed and once with this
// package in its place; every printed line must match.
test("an ajv project's generated validators honour tagged unions", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(
    SOURCE_PROJECT,
    WORK_PROJECT,
    {},
    ["generated"],
  );

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.strictEqual(reference.length, DIALECTS.length * SCHEMAS.length * MODES.length * DOCUMENTS);

  const rows = new Map(
    reference.map((row) => [`${row.dialect}/${row.schema}/${row.mode}/${row.case}`, row]),
  );

  for (const dialect of DIALECTS) {
    for (const mode of MODES) {
      const prefix = `${dialect}/tagged/${mode}`;
      // Each member is selected by its tag.
      assert.strictEqual(rows.get(`${prefix}/circle`).valid, true);
      assert.strictEqual(rows.get(`${prefix}/rect`).valid, true);
      // A tag outside the mapping reports the mapping failure, not oneOf.
      const unknown = rows.get(`${prefix}/unknown-tag`).errors;
      assert.strictEqual(unknown.length, 1);
      assert.strictEqual(unknown[0].keyword, "discriminator");
      assert.deepStrictEqual(unknown[0].params, {error: "mapping", tag: "kind", tagValue: "oval"});
      // A non-string tag reports the tag failure.
      const numeric = rows.get(`${prefix}/numeric-tag`).errors;
      assert.strictEqual(numeric[0].keyword, "discriminator");
      assert.deepStrictEqual(numeric[0].params, {error: "tag", tag: "kind", tagValue: 1});
      // The tag is required by the enclosing schema.
      assert.strictEqual(rows.get(`${prefix}/missing-tag`).errors[0].keyword, "required");
      // The selected member's own rules report their failures.
      assert.strictEqual(
        rows.get(`${prefix}/missing-member-property`).errors[0].keyword,
        "required",
      );
      assert.strictEqual(
        rows.get(`${prefix}/missing-second-member-property`).errors[0].params.missingProperty,
        "height",
      );
      assert.strictEqual(
        rows.get(`${prefix}/property-no-member-allows`).errors[0].keyword,
        "additionalProperties",
      );
      assert.strictEqual(
        rows.get(`${prefix}/wrong-member-property-type`).errors[0].keyword,
        "type",
      );
      // Values that are not objects fail the type check and never reach the
      // tag lookup.
      for (const name of ["string", "null", "array", "number"]) {
        const row = rows.get(`${prefix}/${name}`);
        assert.strictEqual(row.valid, false);
        assert.deepStrictEqual(row.errors.map((error) => error.keyword), ["type"]);
        assert.deepStrictEqual(row.errors[0].params, {type: "object"});
      }
      // The union without the annotation still validates every member and
      // reports oneOf's failure.
      assert.strictEqual(rows.get(`${dialect}/plain/${mode}/unknown-tag`).valid, false);
      assert.strictEqual(rows.get(`${dialect}/plain/${mode}/circle`).valid, true);
    }
  }

  // Default reporting stops at the first failure; complete reporting reaches
  // every member the document was checked against.
  for (const dialect of DIALECTS) {
    assert.strictEqual(
      rows.get(`${dialect}/tagged/default/wrong-member-property-type`).errors.length,
      1,
    );
    const complete = rows.get(`${dialect}/tagged/complete/wrong-member-property-type`);
    assert.ok(complete.errors.length >= 1);
    const empty = rows.get(`${dialect}/tagged/complete/missing-member-property`);
    assert.deepStrictEqual(empty.errors.map((error) => error.keyword), ["required"]);
    const plain = rows.get(`${dialect}/plain/complete/unknown-tag`);
    assert.ok(plain.errors.some((error) => error.keyword === "oneOf"));
  }

  // Verbose reporting carries the annotation and the selected member's schema.
  const verbose = rows.get("draft-07/tagged/verbose/unknown-tag").errors[0];
  assert.deepStrictEqual(verbose.schema, {propertyName: "kind"});
  assert.deepStrictEqual(verbose.parentSchema.discriminator, {propertyName: "kind"});
  assert.strictEqual(verbose.parentSchema.type, "object");
  assert.strictEqual(verbose.data.kind, "oval");

  // Message-free reporting omits messages from the same entries.
  for (const dialect of DIALECTS) {
    for (const name of ["unknown-tag", "numeric-tag", "missing-tag", "property-no-member-allows"]) {
      const row = rows.get(`${dialect}/tagged/message-free/${name}`);
      assert.ok(row.errors.length > 0);
      assert.ok(row.errors.every((error) => !("message" in error)));
    }
  }

  // Summaries match the reports.
  assert.strictEqual(rows.get("draft-07/tagged/default/circle").text, "No errors");
  assert.strictEqual(
    rows.get("draft-07/tagged/default/unknown-tag").text,
    'data value of tag "kind" must be in oneOf',
  );
  assert.strictEqual(
    rows.get("draft-07/tagged/default/numeric-tag").text,
    'data tag "kind" must be string',
  );
});

// A generated tagged-union validator must keep running in a plain Node.js
// program with the package absent: the module is written to a directory whose
// ancestors hold no installed `ajv` package and loaded by a fresh process.
test("a generated tagged-union validator runs without the package", () => {
  const Ajv = require("../");
  const standaloneCode = require("../dist/standalone");

  const schema = {
    type: "object",
    discriminator: {propertyName: "kind"},
    required: ["kind"],
    oneOf: [
      {
        properties: {kind: {const: "circle"}, radius: {type: "number"}},
        required: ["kind", "radius"],
        additionalProperties: false,
      },
      {
        properties: {kind: {const: "rect"}, width: {type: "number"}, height: {type: "number"}},
        required: ["kind", "width", "height"],
        additionalProperties: false,
      },
    ],
  };
  const documents = [
    {kind: "circle", radius: 2},
    {kind: "rect", width: 2, height: 3},
    {kind: "oval"},
    {kind: 1},
    {radius: 2},
    {kind: "circle"},
    {kind: "circle", radius: 2, extra: true},
    {kind: "rect", width: "2", height: 3},
    "not-an-object",
  ];

  const ajv = new Ajv({strict: false, discriminator: true, allErrors: true, code: {source: true}});
  const code = standaloneCode(ajv, ajv.compile(schema));
  assert.ok(
    !/\brequire\(\s*["'](?!\.)/.test(code),
    "generated module must not require an installed package",
  );
  assert.ok(!/\bimport\s/.test(code), "generated module must not import a package");

  const dir = path.join(ROOT, ".tmp", "standalone-discriminator-plain");
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
    "const fs = require('fs');",
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
    "const documents = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));",
    "const out = [];",
    "for (const document of documents) {",
    "  const data = structuredClone(document);",
    "  out.push({valid: validate(data), errors: validate.errors, data});",
    "}",
    "process.stdout.write(JSON.stringify({packageAbsent, out}));",
  ].join("\n");
  const docsFile = path.join(dir, "documents.json");
  fs.writeFileSync(docsFile, JSON.stringify(documents));
  const result = spawnSync(process.execPath, ["-e", script, file, docsFile], {
    cwd: dir,
    encoding: "utf8",
    env: {...process.env, NODE_PATH: ""},
  });
  assert.strictEqual(result.status, 0, result.stderr);
  const printed = JSON.parse(result.stdout);
  assert.strictEqual(
    printed.packageAbsent,
    true,
    "the package must not resolve from the run directory",
  );
  // Both sides cross a JSON boundary, so an absent parameter and one whose
  // value is undefined compare the same way the printed reports do.
  const expected = JSON.parse(
    JSON.stringify(
      documents.map((document) => {
        const data = structuredClone(document);
        return {valid: ajv.validate(schema, data), errors: ajv.errors, data};
      }),
    ),
  );
  assert.deepStrictEqual(printed.out, expected);
  assert.strictEqual(printed.out[0].valid, true);
  assert.strictEqual(printed.out[2].valid, false);
  assert.strictEqual(printed.out[2].errors[0].keyword, "discriminator");
  assert.strictEqual(printed.out[5].valid, false);
  assert.strictEqual(printed.out[5].errors[0].keyword, "required");
});
