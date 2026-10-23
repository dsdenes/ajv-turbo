"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const AjvReference = require("ajv-reference");
const AjvReference2019 = require("ajv-reference/dist/2019");
const AjvReference2020 = require("ajv-reference/dist/2020");
const AjvReferenceJTD = require("ajv-reference/dist/jtd");
const AjvReplacement = require("../");
const AjvReplacement2019 = require("../dist/2019");
const AjvReplacement2020 = require("../dist/2020");
const AjvReplacementJTD = require("../dist/jtd");
const standaloneReference = require("ajv-reference/dist/standalone");
const standaloneReplacement = require("../dist/standalone");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "keyword-lookup-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "keyword-lookup-project");
const WORK_STANDALONE = path.join(ROOT, ".tmp", "keyword-lookup-standalone");

const DIALECTS = ["draft7", "2019", "2020", "jtd"];

const ENTRY_PAIRS = [
  ["draft7", AjvReference, AjvReplacement],
  ["2019", AjvReference2019, AjvReplacement2019],
  ["2020", AjvReference2020, AjvReplacement2020],
  ["jtd", AjvReferenceJTD, AjvReplacementJTD],
];

// Functions are reported by their presence; declarations compare by content.
function normalize(value) {
  if (typeof value === "function") return "[function]";
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = normalize(value[key]);
    return result;
  }
  return value;
}

// Every keyword either package's table carries answers the same way, whether
// it has a rule of its own, is known without one, or is outside the
// vocabulary.
test("every built-in keyword answers as ajv does on every entry point", () => {
  for (const [dialect, Reference, Replacement] of ENTRY_PAIRS) {
    const reference = new Reference({strict: false});
    const replacement = new Replacement({strict: false});
    const names = new Set([
      ...Object.keys(reference.RULES.keywords),
      ...Object.keys(reference.RULES.all),
      "neverRegisteredKeyword",
    ]);
    for (const name of names) {
      assert.deepStrictEqual(
        normalize(replacement.getKeyword(name)),
        normalize(reference.getKeyword(name)),
        `${dialect}: getKeyword(${JSON.stringify(name)})`,
      );
    }
  }
});

// The unchanged project registers rules of its own, asks about them, about
// built-in keywords, and about a name it never registered, validates through
// its rules before and after the queries, then removes a rule and asks again.
// It runs first with ajv and then with this package in ajv's place; every
// printed answer, verdict, report, and rewritten document must match.
test("a project that inspects the keyword vocabulary runs unchanged", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.ok(reference.length >= 100, "expected every answer and document to be printed");

  const rows = new Map(
    reference.map((row) => [
      [row.dialect, row.kind, row.step, row.keyword === undefined ? row.case : row.keyword].join(
        "/",
      ),
      row,
    ]),
  );
  const row = (dialect, kind, step, name) => {
    const found = rows.get(`${dialect}/${kind}/${step}/${name}`);
    assert.ok(found, `missing ${dialect}/${kind}/${step}/${name}`);
    return found;
  };

  for (const dialect of DIALECTS) {
    // The project's own rule is reported with the declaration it registered.
    const even = row(dialect, "answer", "before removal", "even");
    assert.strictEqual(even.answer.keyword, "even");
    assert.deepStrictEqual(even.answer.type, ["number"]);
    assert.deepStrictEqual(even.answer.schemaType, ["boolean"]);
    assert.strictEqual(even.answer.modifying, true);
    assert.strictEqual(even.answer.validate, "[function]");

    // A name that was never registered is unknown on both queries.
    for (const step of ["before removal", "after removal"]) {
      assert.strictEqual(row(dialect, "answer", step, "neverRegisteredKeyword").answer, false);
    }

    // A built-in keyword answer exists on every entry point; the dialect's
    // vocabulary decides the rest.
    assert.strictEqual(typeof row(dialect, "answer", "before removal", "type").answer, "object");
    const maximum = row(dialect, "answer", "before removal", "maximum").answer;
    const not = row(dialect, "answer", "before removal", "not").answer;
    if (dialect === "jtd") {
      assert.strictEqual(maximum, false);
      assert.strictEqual(not, false);
    } else {
      assert.deepStrictEqual(maximum.keyword, [
        "maximum",
        "minimum",
        "exclusiveMaximum",
        "exclusiveMinimum",
      ]);
      assert.strictEqual(not.keyword, "not");
    }

    // The registration reports the same validate function the project
    // supplied, and the value schema compiled when it declared one.
    const registration = row(dialect, "registration", "before removal", "even");
    assert.strictEqual(registration.sameValidate, true);
    assert.strictEqual(registration.hasValidateSchema, false);

    // The project's rule validates before and after the queries, and the
    // documents keep their verdicts, reports, and rewritten values.
    for (const step of ["before queries", "after queries"]) {
      const accepted = row(dialect, "validation", step, "accepted");
      assert.strictEqual(accepted.valid, true);
      assert.strictEqual(accepted.errors, null);
      assert.deepStrictEqual(accepted.data, {count: 20, label: "ADA"});

      const rejected = row(dialect, "validation", step, "rejected");
      assert.strictEqual(rejected.valid, false);
      assert.deepStrictEqual(
        rejected.errors.map((error) => error.keyword),
        ["even"],
      );
      assert.deepStrictEqual(rejected.data, {count: 3, label: "ADA"});

      const wrongTypes = row(dialect, "validation", step, "wrong types");
      assert.strictEqual(wrongTypes.valid, false);
      assert.deepStrictEqual(
        wrongTypes.errors.map((error) => error.keyword),
        ["type", "type"],
      );

      const missing = row(dialect, "validation", step, "missing count");
      assert.strictEqual(missing.valid, false);
      assert.deepStrictEqual(
        missing.errors.map((error) => error.keyword),
        [dialect === "jtd" ? "properties" : "required"],
      );
    }

    // Removing the rule makes it unknown; the other rules keep their answers.
    assert.strictEqual(row(dialect, "answer", "after removal", "even").answer, false);
    assert.strictEqual(
      row(dialect, "answer", "after removal", "upper").answer.keyword,
      "upper",
    );
    assert.strictEqual(row(dialect, "registration", "after removal", "even").sameValidate, false);

    if (dialect !== "jtd") {
      const bounded = row(dialect, "answer", "before removal", "bounded").answer;
      assert.deepStrictEqual(bounded.metaSchema, {type: "number", minimum: 1});
      assert.strictEqual(bounded.validateSchema, "[function]");
      assert.strictEqual(
        row(dialect, "registration", "before removal", "bounded").hasValidateSchema,
        true,
      );
    }
  }
});

// A rule of the project's own that both packages can carry into standalone
// code. ajv generates standalone validators for macro rules, not validation
// functions, so the schema fragments stand in for the rule.
function evenRule() {
  return {
    keyword: "even",
    type: "number",
    macro() {
      return {multipleOf: 2};
    },
  };
}

const STANDALONE_CASES = [
  {
    name: "draft7",
    reference: AjvReference,
    replacement: AjvReplacement,
    options: {strict: false, allErrors: true, code: {source: true}},
    schema: {
      type: "object",
      properties: {count: {type: "number", even: true}},
      required: ["count"],
    },
  },
  {
    name: "2019",
    reference: AjvReference2019,
    replacement: AjvReplacement2019,
    options: {strict: false, allErrors: true, code: {source: true}},
    schema: {
      type: "object",
      properties: {count: {type: "number", even: true}},
      required: ["count"],
    },
  },
  {
    name: "2020",
    reference: AjvReference2020,
    replacement: AjvReplacement2020,
    options: {strict: false, allErrors: true, code: {source: true}},
    schema: {
      type: "object",
      properties: {count: {type: "number", even: true}},
      required: ["count"],
    },
  },
];

const STANDALONE_DOCUMENTS = [
  {count: 2},
  {count: 3},
  {count: 4},
  {count: "2"},
  {},
];

// Loads a generated module in a fresh process that refuses to resolve any
// validator package, and prints every verdict, report, and rewritten document.
function runWithoutPackage(dir, file) {
  const documents = path.join(dir, "documents.json");
  fs.writeFileSync(documents, JSON.stringify(STANDALONE_DOCUMENTS));
  const script = [
    "const fs = require('fs');",
    "const Module = require('module');",
    "const resolveFilename = Module._resolveFilename;",
    "Module._resolveFilename = function (request, ...args) {",
    "  if (request === 'ajv' || request.startsWith('ajv/') || request === 'ajv-reference' ||",
    "      request.startsWith('ajv-reference/')) {",
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
  const result = spawnSync(process.execPath, ["-e", script, file, documents], {
    cwd: dir,
    encoding: "utf8",
    env: {...process.env, NODE_PATH: ""},
  });
  assert.strictEqual(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

// Generates a standalone validator from each package for a schema that uses
// the project's rule, loads both in a program that cannot resolve a validator
// package, and requires the same verdicts, reports, and rewritten documents.
test("a generated validator keeps the project's rule and its reports", () => {
  fs.rmSync(WORK_STANDALONE, {recursive: true, force: true});

  for (const testCase of STANDALONE_CASES) {
    const results = {};
    for (const side of ["reference", "replacement"]) {
      const dir = path.join(WORK_STANDALONE, testCase.name, side);
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({name: `keyword-lookup-${side}`, private: true}),
      );

      const Ajv = side === "reference" ? testCase.reference : testCase.replacement;
      const standalone = side === "reference" ? standaloneReference : standaloneReplacement;
      const ajv = new Ajv(testCase.options);
      ajv.addKeyword(evenRule());
      const validate = ajv.compile(structuredClone(testCase.schema));
      const code = standalone(ajv, validate);
      assert.ok(
        !/\brequire\(\s*["'](?!\.)/.test(code),
        `${testCase.name}: generated module must not require an installed package`,
      );
      const file = path.join(dir, "validate.js");
      fs.writeFileSync(file, code);
      results[side] = runWithoutPackage(dir, file);
      assert.strictEqual(results[side].packageAbsent, true);
    }

    assert.deepStrictEqual(
      results.replacement.out,
      results.reference.out,
      `${testCase.name}: generated validator differs from ajv's`,
    );

    // The project's rule still reports its failures.
    assert.strictEqual(results.replacement.out[0].valid, true);
    assert.strictEqual(results.replacement.out[1].valid, false);
    assert.deepStrictEqual(
      results.replacement.out[1].errors.map((error) => error.keyword),
      ["multipleOf", "even"],
    );
    assert.strictEqual(results.replacement.out[2].valid, true);
    assert.strictEqual(results.replacement.out[3].valid, false);
    assert.deepStrictEqual(
      results.replacement.out[3].errors.map((error) => error.keyword),
      ["type"],
    );
    assert.strictEqual(results.replacement.out[4].valid, false);
    assert.deepStrictEqual(
      results.replacement.out[4].errors.map((error) => error.keyword),
      ["required"],
    );
  }
});
