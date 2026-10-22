"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "data-reference-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "data-reference-project");

// The unchanged project enables ajv's data-reference option, compiles schemas
// whose keyword values point into the document through every dialect, prints
// verdicts and reports under every reporting mode, registers a custom rule
// that declares support and one that does not, and validates schemas without
// references with the option on and off. It runs once with ajv installed and
// once with this package installed in ajv's place.
test("an ajv project's data references survive the switch unchanged", () => {
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.ok(reference.length >= 120, "expected every fixture case to run");

  const byCase = new Map(reference.map((row) => [row.case, row]));

  for (const dialect of ["draft-07", "2019-09", "2020-12"]) {
    assert.strictEqual(byCase.get(`${dialect} compile enabled`).compiled, true);
    for (const label of ["disabled", "omitted"]) {
      const rejected = byCase.get(`${dialect} compile ${label}`);
      assert.strictEqual(rejected.compiled, false, `${dialect} ${label} must reject the schema`);
      assert.match(rejected.message, /must be number/);
    }

    for (const mode of ["default", "complete", "extended", "message-free", "extended message-free"]) {
      assert.strictEqual(byCase.get(`${dialect} ${mode} valid`).valid, true);
      assert.strictEqual(byCase.get(`${dialect} ${mode} absent`).valid, true);
      const invalid = byCase.get(`${dialect} ${mode} invalid`);
      assert.strictEqual(invalid.valid, false);
      assert.ok(invalid.errors.length > 0);
    }

    assert.strictEqual(byCase.get(`${dialect} relative valid`).valid, true);
    assert.strictEqual(byCase.get(`${dialect} relative invalid`).valid, false);
    assert.strictEqual(byCase.get(`${dialect} referenced valid`).valid, true);
    assert.strictEqual(byCase.get(`${dialect} referenced invalid`).valid, false);
    assert.strictEqual(byCase.get(`${dialect} referenced absent`).valid, true);
  }

  // Reports carry the resolved values and the literal reference objects.
  const invalid = byCase.get("draft-07 complete invalid");
  const maximum = invalid.errors.find((error) => error.keyword === "maximum");
  assert.deepStrictEqual(maximum.params, {comparison: "<=", limit: 10});
  assert.strictEqual(maximum.message, "must be <= 10");

  const extended = byCase.get("draft-07 extended invalid");
  const extendedMaximum = extended.errors.find((error) => error.keyword === "maximum");
  assert.deepStrictEqual(extendedMaximum.schema, {$data: "/limit"});
  assert.strictEqual(extendedMaximum.data, 11);

  const messageFree = byCase.get("draft-07 message-free invalid");
  assert.ok(messageFree.errors.every((error) => !("message" in error)));

  const first = byCase.get("draft-07 default invalid");
  assert.strictEqual(first.errors.length, 1, "default reporting stops at the first failure");

  // A referenced value of the wrong type reports ajv's $data error.
  const wrongTypes = byCase.get("draft-07 complete wrongTypes");
  const messages = wrongTypes.errors.map((error) => error.message);
  assert.ok(messages.includes('"enum" keyword must be array ($data)'));
  assert.ok(messages.includes('"required" keyword must be array ($data)'));
  assert.ok(messages.includes('"uniqueItems" keyword must be boolean ($data)'));
  assert.ok(messages.includes('must match format "5"'));

  // The rule that declares support receives the resolved value; the rule that
  // does not receives the literal schema value.
  const received = byCase.get("custom received").received;
  assert.ok(received.resolved.length > 0);
  assert.ok(received.resolved.every((value) => value === 4));
  assert.ok(received.literal.some((value) => value && value.$data === "/limit"));
  assert.ok(received.literal.some((value) => value === 4));
  assert.strictEqual(byCase.get("custom valid").valid, true);
  assert.strictEqual(byCase.get("custom invalid").valid, false);
  assert.strictEqual(byCase.get("custom literal").valid, false);
  assert.strictEqual(byCase.get("custom plain invalid").valid, false);
  assert.strictEqual(byCase.get("custom absent").valid, true);
  assert.strictEqual(byCase.get("custom compile disabled").compiled, false);
  assert.match(byCase.get("custom compile disabled").message, /must be \["number"\]/);

  // Schemas without references keep their verdicts with the option on and off.
  for (const dialect of ["draft-07", "2019-09", "2020-12"]) {
    for (const label of ["enabled", "disabled", "omitted"]) {
      assert.strictEqual(byCase.get(`${dialect} ${label} plain valid`).valid, true);
      assert.strictEqual(byCase.get(`${dialect} ${label} plain invalid`).valid, false);
      assert.strictEqual(byCase.get(`${dialect} ${label} plain absent`).valid, false);
    }
  }

  assert.strictEqual(byCase.get("async valid").valid, true);
  assert.strictEqual(byCase.get("async invalid").valid, false);
});
