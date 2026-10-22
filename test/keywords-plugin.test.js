"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {ROOT, hashDirectory, prepareCopy, linkValidator, runProject} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "keywords-plugin-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "keywords-plugin-project");
const KEYWORDS_DIR = path.dirname(require.resolve("ajv-keywords/package.json"));
const FORMATS_DIR = path.dirname(require.resolve("ajv-formats/package.json"));
const EQUAL_DIR = path.dirname(require.resolve("fast-deep-equal/package.json"));

function copyPlugin(name, dir) {
  fs.cpSync(dir, path.join(WORK_PROJECT, "node_modules", name), {recursive: true});
}

// The unchanged project loads ajv's official keyword-extension plugin and
// prints the verdict, the full report, the summary, and the document after
// validation for every keyword the plugin registers, through each dialect,
// with first-error and complete reporting, with the formats plugin loaded
// alongside, and for the schemas the plugin refuses.
test("ajv's official keyword-extension plugin runs unchanged when the replacement takes ajv's place", () => {
  prepareCopy(SOURCE_PROJECT, WORK_PROJECT);
  copyPlugin("ajv-keywords", KEYWORDS_DIR);
  copyPlugin("fast-deep-equal", EQUAL_DIR);
  copyPlugin("ajv-formats", FORMATS_DIR);
  const before = hashDirectory(WORK_PROJECT);

  linkValidator(WORK_PROJECT, path.dirname(require.resolve("ajv-reference/package.json")));
  const reference = runProject(WORK_PROJECT);

  linkValidator(WORK_PROJECT, ROOT);
  const replacement = runProject(WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(WORK_PROJECT), before, "fixture project was edited");

  const byLabel = new Map(
    reference
      .filter((result) => typeof result.label === "string")
      .map((result) => [result.label, result]),
  );

  for (const dialect of ["draft-07", "2019-09", "2020-12"]) {
    for (const keyword of [
      "typeof",
      "instanceof",
      "range",
      "exclusiveRange",
      "regexp",
      "transform",
      "uniqueItemProperties",
      "allRequired",
      "anyRequired",
      "oneRequired",
      "patternRequired",
      "prohibited",
      "deepProperties",
      "deepRequired",
      "select",
    ]) {
      assert.ok(
        reference.some((result) =>
          typeof result.label === "string" && result.label.startsWith(`${dialect} ${keyword} `),
        ),
        `${dialect} must exercise ${keyword}`,
      );
    }

    // Every refusal carries the plugin's message and produces no validator.
    const refusals = reference.filter((result) =>
      typeof result.label === "string" && result.label.startsWith(`${dialect} refuse `),
    );
    assert.strictEqual(refusals.length, 27);
    for (const refusal of refusals) {
      assert.strictEqual(refusal.compiled, false);
      assert.strictEqual(typeof refusal.message, "string");
      assert.ok(refusal.message.length > 0);
    }

    // Both formats-plugin load orders run the same keyword vocabulary.
    for (const order of ["formats-first", "keywords-first"]) {
      const formats = reference.filter((result) =>
        typeof result.label === "string" && result.label.startsWith(`${dialect} ${order} formats `),
      );
      assert.strictEqual(formats.length, 8);
      assert.ok(formats.some((result) => result.valid === false));
      assert.ok(formats.some((result) => result.valid === true));
      // The plugin builds the pattern while compiling the keyword, so an
      // invalid regular expression is refused with its own message.
      const pattern = byLabel.get(`${dialect} ${order} patternRequired-format`);
      assert.strictEqual(pattern.compiled, false);
      assert.match(pattern.message, /Invalid regular expression/);
    }

    assert.strictEqual(byLabel.get(`${dialect} get deepRequired`).valid, false);
    assert.strictEqual(byLabel.get(`${dialect} lookup nope`).threw, true);
    assert.match(byLabel.get(`${dialect} lookup nope`).message, /Unknown keyword nope/);
    assert.strictEqual(byLabel.get(`${dialect} twice`).twice, "refused");
    assert.match(byLabel.get(`${dialect} twice`).message, /already defined/);
    assert.strictEqual(byLabel.get(`${dialect} strict`).valid, false);
    assert.deepStrictEqual(byLabel.get(`${dialect} strict-logs`).strictLogs, []);
    assert.ok(byLabel.get(`${dialect} strict-log`).compiled);
  }

  // Rewriting keywords leave the validated document in ajv's state, at every
  // nesting level the project validates.
  const depth = byLabel.get("2019-09 rewrite-depth 0");
  assert.strictEqual(depth.valid, true);
  assert.deepStrictEqual(depth.document, {
    top: "a",
    nested: {list: ["A"], deep: {s: "a"}},
  });

  const selectRewrite = byLabel.get("2020-12 rewrite-select 0");
  assert.strictEqual(selectRewrite.valid, true);
  assert.deepStrictEqual(selectRewrite.document, {o: {select: "a", s: "a"}});

  const additional = byLabel.get("2020-12 rewrite-additional 0");
  assert.deepStrictEqual(additional.document, {keep: 1, extra: "a"});

  const pattern = byLabel.get("draft-07 rewrite-pattern 0");
  assert.deepStrictEqual(pattern.document, {p1: "a", other: " x "});

  const defaults = byLabel.get("draft-07 dynamic-defaults 0");
  assert.strictEqual(defaults.valid, true);
  assert.strictEqual(typeof defaults.document.a, "number");
  assert.strictEqual(byLabel.get("draft-07 dynamic-defaults 1").document.a, 3);
  assert.strictEqual(typeof byLabel.get("draft-07 dynamic-defaults 2").document.a, "number");

  const nestedDefaults = byLabel.get("draft-07 dynamic-defaults-nested 0");
  assert.strictEqual(typeof nestedDefaults.document.o.a, "number");
  assert.deepStrictEqual(
    nestedDefaults.document.list.map((item) => typeof item.a),
    ["number", "number"],
  );

  const empty = [
    "2020-12 dynamic-defaults-empty 0",
    "2020-12 dynamic-defaults-empty 1",
    "2020-12 dynamic-defaults-empty 2",
    "2020-12 dynamic-defaults-empty 3",
  ].map((label) => byLabel.get(label).document.a);
  assert.strictEqual(typeof empty[0], "number");
  assert.strictEqual(typeof empty[1], "number");
  assert.strictEqual(empty[2], 0);
  assert.strictEqual(typeof empty[3], "number");
  assert.deepStrictEqual(byLabel.get("2020-12 dynamic-defaults-off 0").document, {});

  // Reporting modes cover both first-error and every-error collection, with
  // messages and verbose entries in ajv's shape.
  const firstErrors = reference.filter(
    (result) =>
      typeof result.label === "string" &&
      result.label.startsWith("draft-07 select-reports "),
  );
  assert.strictEqual(firstErrors.length, 4);
  assert.strictEqual(firstErrors[0].errors.length, 1, "default reporting stops at the first error");
  assert.ok(
    firstErrors.some((result) => Array.isArray(result.errors) && result.errors.length === 2),
    "complete reporting carries every error",
  );

  // Complete reporting carries every entry ajv reports for the same case.
  assert.ok(
    reference.some(
      (result) =>
        typeof result.label === "string" && result.label.startsWith("2020-12 select ") &&
        Array.isArray(result.errors) &&
        result.errors.length > 1,
    ),
    "complete reporting produced multi-entry reports",
  );

  // Asynchronous validation keeps the plugin's rules and errors.
  for (const dialect of ["draft-07", "2019-09", "2020-12"]) {
    const asyncLines = reference.filter(
      (result) => typeof result.label === "string" && result.label.startsWith(`${dialect} async `),
    );
    assert.strictEqual(asyncLines.length, 3);
    assert.ok(Array.isArray(asyncLines[1].rejected));
    assert.deepStrictEqual(asyncLines[0].document, {s: "a", v: 1, select: "x"});
  }
});
