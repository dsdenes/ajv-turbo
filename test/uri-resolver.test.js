"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "uri-resolver-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "uri-resolver-project");

// The unchanged project supplies its own schema identifier strategy: schema
// identifiers use a private form, references are written either in that form
// or as a bare name, and every spelling of a name is the same identifier. It
// runs once with ajv installed and once with this package installed in ajv's
// place; every printed row must match, including the refusals.
test("a project's schema identifier strategy survives the switch unchanged", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.strictEqual(reference.length, 76, "expected every fixture case to run");

  const rows = new Map(reference.map((row) => [row.case, row]));
  const row = (label) => {
    const entry = rows.get(label);
    assert.ok(entry, `missing case "${label}"`);
    return entry;
  };

  for (const dialect of ["draft-07", "2019-09", "2020-12"]) {
    // A bare reference in the project's identifier form.
    assert.strictEqual(row(`${dialect} bare valid`).valid, true);
    const invalid = row(`${dialect} bare invalid`);
    assert.strictEqual(invalid.valid, false);
    assert.ok(invalid.errors.length > 0);
    assert.notStrictEqual(invalid.text, "No errors");

    // Spellings the strategy treats as one identifier all resolve to the
    // registered schema, and produce the same reports.
    for (const spelling of ["person", "PERSON", "thing:PeRsOn", "thing:person"]) {
      assert.strictEqual(row(`${dialect} spelling ${spelling} valid`).valid, true);
      assert.strictEqual(row(`${dialect} spelling ${spelling} valid`).errors, null);
      assert.strictEqual(row(`${dialect} spelling ${spelling} invalid`).valid, false);
      assert.notStrictEqual(row(`${dialect} spelling ${spelling} invalid`).text, "No errors");
    }

    // A nested identifier resolved against its enclosing private identifier,
    // reached by a bare name and by a pointer through the enclosing schema.
    assert.strictEqual(row(`${dialect} nested valid`).valid, true);
    assert.strictEqual(row(`${dialect} nested invalid`).valid, false);
    assert.strictEqual(row(`${dialect} pointer valid`).valid, true);
    assert.strictEqual(row(`${dialect} pointer invalid`).valid, false);
    assert.strictEqual(row(`${dialect} root valid`).valid, true);
    assert.strictEqual(row(`${dialect} root invalid`).valid, false);

    // The registry answers the stored identifier, not every equivalent
    // spelling: the strategy resolves references, it does not rename keys.
    assert.strictEqual(row(`${dialect} lookup canonical`).found, true);
    assert.strictEqual(row(`${dialect} lookup mixed case`).found, false);
    assert.strictEqual(row(`${dialect} lookup bare`).found, false);

    // A reference the strategy maps but no schema supplies is refused with
    // ajv's message and the strategy's missing identifiers.
    const unresolved = row(`${dialect} unresolved`);
    assert.strictEqual(unresolved.refused, true);
    assert.strictEqual(unresolved.name, "Error");
    assert.strictEqual(unresolved.message, "can't resolve reference Missing from id #");
    assert.strictEqual(unresolved.missingRef, "thing:missing");
    assert.strictEqual(unresolved.missingSchema, "thing:missing");

    // Without a strategy, the same identifiers and references keep their
    // previous outcomes.
    assert.strictEqual(row(`${dialect} default self valid`).valid, true);
    assert.strictEqual(row(`${dialect} default self invalid`).valid, false);
    assert.strictEqual(row(`${dialect} default lookup`).found, true);
    const plainMissing = row(`${dialect} default missing`);
    assert.strictEqual(plainMissing.refused, true);
    assert.strictEqual(
      plainMissing.message,
      "can't resolve reference thing:missing from id #",
    );
  }

  // JSON Type Definition is unaffected by the strategy until an error names a
  // missing definition; that error carries the strategy's missing identifiers.
  assert.deepStrictEqual(row("jtd parse").value, {kind: "a", x: "ok"});
  assert.strictEqual(row("jtd parse invalid").value, undefined);
  assert.strictEqual(row("jtd serialize").value, '{"x":4}');
  const missingJtd = row("jtd missing definition");
  assert.strictEqual(missingJtd.refused, true);
  assert.strictEqual(missingJtd.message, "No definition Missing");
  assert.strictEqual(missingJtd.missingRef, "thing:missing");
  assert.strictEqual(missingJtd.missingSchema, "thing:missing");
});
