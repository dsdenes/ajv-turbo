"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "data-context-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "data-context-project");

const DIALECTS = ["draft7", "2019", "2020"];
const FORMS = ["compiled", "standalone"];

function rowsByLabel(rows) {
  return new Map(rows.map((row) => [row.label, row]));
}

function prefixErrors(row, prefix) {
  return row.errors.every((error) => error.instancePath.startsWith(prefix));
}

// The unchanged project compiles a validator for each supported dialect and
// calls it with a value, its location, its container, and a document root. The
// same scenarios are repeated through a generated standalone validator. It
// runs once with ajv installed and once with this package in its place; every
// printed line must match.
test("an ajv project's validators honour a caller-supplied location", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(
    SOURCE_PROJECT,
    WORK_PROJECT,
    {},
    ["generated"],
  );

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.strictEqual(reference.length, 3 * 46 + 2 * 4);

  const rows = rowsByLabel(reference);

  for (const dialect of DIALECTS) {
    for (const form of FORMS) {
      const invalid = rows.get(`${dialect}/${form}/report/invalid`);
      assert.strictEqual(invalid.valid, false);
      assert.ok(invalid.errors.length > 1);
      assert.ok(prefixErrors(invalid, "/document/items/2"), "reports use the supplied location");
      assert.ok(
        invalid.errors.some((error) => error.instancePath === "/document/items/2/a"),
        "a nested error keeps the supplied location as its base",
      );
      assert.ok(invalid.errors.some((error) => error.instancePath === "/document/items/2"));

      const valid = rows.get(`${dialect}/${form}/report/valid`);
      assert.strictEqual(valid.valid, true);
      assert.strictEqual(valid.errors, null);

      const noContext = rows.get(`${dialect}/${form}/report/invalid-no-context`);
      assert.strictEqual(noContext.valid, false);
      assert.ok(noContext.errors.every((error) => !error.instancePath.startsWith("/document")));
      assert.ok(noContext.errors.some((error) => error.instancePath === ""));

      const locationOnly = rows.get(`${dialect}/${form}/report/invalid-location-only`);
      assert.strictEqual(locationOnly.valid, false);
      assert.ok(prefixErrors(locationOnly, "/elsewhere"));

      const within = rows.get(`${dialect}/${form}/data/within`);
      assert.strictEqual(within.valid, true);
      assert.strictEqual(within.errors, null);

      const violates = rows.get(`${dialect}/${form}/data/violates`);
      assert.strictEqual(violates.valid, false);
      assert.deepStrictEqual(
        violates.errors.map((error) => error.instancePath),
        ["/sub/n"],
        "the document root supplies the limit the value is compared with",
      );

      assert.strictEqual(rows.get(`${dialect}/${form}/data/absent`).valid, true);
      assert.strictEqual(rows.get(`${dialect}/${form}/data/no-context-absent`).valid, true);

      const wrongLimit = rows.get(`${dialect}/${form}/data/wrong-limit`);
      assert.strictEqual(wrongLimit.valid, false);
      assert.strictEqual(wrongLimit.errors[0].message, "must be >= 5");
      assert.deepStrictEqual(wrongLimit.errors[0].params, {comparison: ">=", limit: "5"});

      const wrongRequired = rows.get(`${dialect}/${form}/data/wrong-required`);
      assert.strictEqual(wrongRequired.valid, false);
      assert.strictEqual(
        wrongRequired.errors[0].message,
        '"required" keyword must be array ($data)',
      );

      const noContextRoot = rows.get(`${dialect}/${form}/data/no-context-root`);
      assert.strictEqual(noContextRoot.valid, false);
      assert.deepStrictEqual(
        noContextRoot.errors.map((error) => error.instancePath),
        ["/n"],
        "without a supplied root the document itself is the root",
      );

      const coerced = rows.get(`${dialect}/${form}/coercion/coerced-container`);
      assert.deepStrictEqual(coerced.container, {slot: 7});
      const detached = rows.get(`${dialect}/${form}/coercion/detached-container`);
      assert.deepStrictEqual(detached.container, {slot: "7"});
      assert.strictEqual(rows.get(`${dialect}/${form}/coercion/coerced-no-context`).valid, true);

      const rewritten = rows.get(`${dialect}/${form}/rewrite/rewritten-container`);
      assert.deepStrictEqual(rewritten.container, {item: {a: 9}});
      const rewrittenDetached = rows.get(`${dialect}/${form}/rewrite/detached-container`);
      assert.deepStrictEqual(rewrittenDetached.data, {a: 9});

      const asyncValid = rows.get(`${dialect}/${form}/async-valid`);
      assert.strictEqual(asyncValid.settled, "resolved");
      assert.deepStrictEqual(asyncValid.data, {a: 1, b: true});

      const asyncInvalid = rows.get(`${dialect}/${form}/async-invalid`);
      assert.strictEqual(asyncInvalid.settled, "rejected");
      assert.ok(asyncInvalid.errors.length > 1);
      assert.ok(prefixErrors(asyncInvalid, "/document/items/2"));

      const asyncNoContext = rows.get(`${dialect}/${form}/async-no-context`);
      assert.strictEqual(asyncNoContext.settled, "rejected");
      assert.ok(
        asyncNoContext.errors.every((error) => !error.instancePath.startsWith("/document")),
      );
      assert.ok(asyncNoContext.errors.some((error) => error.instancePath === ""));
    }
  }

  for (const form of FORMS) {
    const invalid = rows.get(`jtd/${form}/report/invalid`);
    assert.strictEqual(invalid.valid, false);
    assert.ok(invalid.errors.length > 1);
    assert.ok(prefixErrors(invalid, "/document/items/2"));
    assert.ok(invalid.errors.some((error) => error.instancePath === "/document/items/2/a"));

    assert.strictEqual(rows.get(`jtd/${form}/report/valid`).valid, true);
    assert.strictEqual(rows.get(`jtd/${form}/report/valid`).errors, null);

    const noContext = rows.get(`jtd/${form}/report/invalid-no-context`);
    assert.strictEqual(noContext.valid, false);
    assert.ok(noContext.errors.some((error) => error.instancePath === "/a"));

    const locationOnly = rows.get(`jtd/${form}/report/invalid-location-only`);
    assert.strictEqual(locationOnly.valid, false);
    assert.ok(prefixErrors(locationOnly, "/elsewhere"));
  }
});
