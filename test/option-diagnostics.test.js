"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const {spawnSync} = require("node:child_process");

const {ROOT, hashDirectory, prepareCopy, linkValidator} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "option-diagnostics-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "option-diagnostics-project");

// ajv's explanations, kept here independently of the fixture so the test
// fails if the fixture stops constructing the setting, and independently of
// the implementation so it pins the wording ajv uses.
const REMOVED = {
  errorDataPath: "",
  format: "`validateFormats: false` can be used instead.",
  nullable: '"nullable" keyword is supported by default.',
  jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
  extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
  missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
  processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
  sourceCode: "Use option `code: {source: true}`",
  strictDefaults: "It is default now, see option `strict`.",
  strictKeywords: "It is default now, see option `strict`.",
  uniqueItems: '"uniqueItems" keyword is always validated.',
  unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
  cache: "Map is used as cache, schema object as key.",
  serialize: "Map is used as cache, schema object as key.",
  ajvErrors: "It is default now.",
};

const DEPRECATED = {
  ignoreKeywordsWithRef: "",
  jsPropertySyntax: "",
  unicode: '"minLength"/"maxLength" account for unicode characters by default.',
};

const DIALECTS = ["draft-07", "2019-09", "2020-12", "jtd"];

function diagnostic(table, option) {
  const removed = table === REMOVED;
  return [
    removed ? "error" : "warn",
    `${removed ? "NOT SUPPORTED" : "DEPRECATED"}: option ${option}. ${table[option]}`,
  ];
}

function expectedMessages(settings) {
  const messages = [];
  for (const option of Object.keys(REMOVED)) {
    if (option in settings) messages.push(diagnostic(REMOVED, option));
  }
  for (const option of Object.keys(DEPRECATED)) {
    if (option in settings) messages.push(diagnostic(DEPRECATED, option));
  }
  return messages;
}

function run(workProject, args = []) {
  const result = spawnSync(process.execPath, ["index.js", ...args], {
    cwd: workProject,
    encoding: "utf8",
    env: {...process.env, NODE_ENV: "test"},
  });
  assert.strictEqual(result.status, 0, `project failed to start: ${result.stderr}`);
  return {
    rows: result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runWithBoth(project, args = []) {
  prepareCopy(SOURCE_PROJECT, project);
  const before = hashDirectory(project);

  linkValidator(project, path.dirname(require.resolve("ajv-reference/package.json")));
  const reference = run(project, args);

  linkValidator(project, ROOT);
  const replacement = run(project, args);

  assert.strictEqual(hashDirectory(project), before, "project copy was edited");
  return {reference, replacement};
}

test("a project's removed and deprecated settings get ajv's diagnostics", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBoth(WORK_PROJECT);

  assert.deepStrictEqual(replacement.rows, reference.rows);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

  const rows = new Map(reference.rows.map((row) => [row.case, row]));
  const row = (label) => {
    const entry = rows.get(label);
    assert.ok(entry, `missing case "${label}"`);
    return entry;
  };

  for (const dialect of DIALECTS) {
    assert.deepStrictEqual(row(`${dialect} supported only`).messages, [], dialect);

    for (const option of Object.keys(REMOVED)) {
      const observed = row(`${dialect} removed ${option}`);
      assert.deepStrictEqual(
        observed.messages,
        [diagnostic(REMOVED, option)],
        `${dialect}: ${option} should report exactly one removed-option diagnostic`,
      );
      assert.strictEqual(observed.sameAsAbsent, true, `${dialect}: ${option} changed validation`);
    }

    for (const option of Object.keys(DEPRECATED)) {
      const observed = row(`${dialect} deprecated ${option}`);
      assert.deepStrictEqual(
        observed.messages,
        [diagnostic(DEPRECATED, option)],
        `${dialect}: ${option} should report exactly one deprecated-option diagnostic`,
      );
      assert.strictEqual(observed.sameAsAbsent, true, `${dialect}: ${option} changed validation`);
    }

    const all = {...REMOVED, ...DEPRECATED};
    const combined = row(`${dialect} combined`);
    assert.deepStrictEqual(combined.messages, expectedMessages(all), dialect);
    assert.strictEqual(combined.sameAsAbsent, true, `${dialect}: combined settings changed validation`);
  }

  for (const dialect of ["draft-07", "2019-09", "2020-12"]) {
    const mutated = row(`${dialect} mutating same as absent`);
    assert.deepStrictEqual(mutated.messages, expectedMessages({nullable: true, unicode: true}));
    assert.strictEqual(mutated.sameAsAbsent, true, `${dialect}: diagnostics changed a rewritten document`);
  }
});

test("a project without a diagnostic handler sees ajv's console output", () => {
  const {reference, replacement} = runWithBoth(WORK_PROJECT, ["--console"]);

  assert.strictEqual(replacement.stdout, reference.stdout);
  assert.strictEqual(replacement.stderr, reference.stderr);

  const expected = DIALECTS.flatMap((dialect) =>
    Object.entries({...REMOVED, ...DEPRECATED}).map(([option]) =>
      diagnostic(option in REMOVED ? REMOVED : DEPRECATED, option)[1],
    ),
  );
  assert.deepStrictEqual(reference.stderr.trim().split("\n"), expected);
});
