"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "jtd-data-references-project");

// The project registers JSON Type Definition custom rules whose values name a
// location in the document, with and without ajv's data-reference option, and
// uses every rule form ajv lets carry such a value. Running the unchanged
// project with ajv and then with this package in ajv's place must produce the
// same verdicts, reports, summaries, resolved values, and compile-time
// refusals through every published entry point that exposes the dialect.
test("a JTD project whose rules read document locations runs unchanged", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const workProject = path.join(ROOT, ".tmp", "jtd-data-references-project");
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, workProject);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

  const byCase = new Map(reference.map((row) => [row.case, row]));
  const row = (name) => {
    const found = byCase.get(name);
    assert.ok(found, `missing case "${name}"`);
    return found;
  };

  // Every published path that exposes the dialect behaves the same.
  for (const modulePath of ["ajv/dist/jtd", "ajv/dist/jtd.js"]) {
    assert.strictEqual(row(`${modulePath} enabled divisible`).valid, true);
    assert.strictEqual(row(`${modulePath} enabled not divisible`).valid, false);
    assert.deepStrictEqual(row(`${modulePath} enabled not divisible`).errors, [
      {
        instancePath: "/n",
        schemaPath: "/properties/n/metadata/multiple",
        keyword: "multiple",
        params: {},
        message: 'must pass "multiple" keyword validation',
      },
    ]);
    assert.strictEqual(
      row(`${modulePath} enabled not divisible`).text,
      'data/n must pass "multiple" keyword validation',
    );
    // A named location the document does not have leaves the rule passing.
    assert.strictEqual(row(`${modulePath} enabled absent location`).valid, true);
    assert.strictEqual(row(`${modulePath} enabled absent location`).errors, null);
  }

  // A resolved value of the wrong kind reports ajv's data-reference error at
  // the keyword's location, before the document's own rule failures.
  const wrongKind = row("ajv/dist/jtd enabled wrong kind");
  assert.deepStrictEqual(wrongKind.errors.map((error) => error.keyword), ["multiple", "type"]);
  assert.deepStrictEqual(wrongKind.errors[0], {
    instancePath: "/n",
    schemaPath: "/properties/n/metadata/multiple",
    keyword: "multiple",
    params: {},
    message: '"multiple" keyword must be number ($data)',
  });
  assert.strictEqual(
    wrongKind.text,
    'data/n "multiple" keyword must be number ($data), data/divisor must be int32',
  );

  // First-error reporting stops at the unusable document value.
  assert.deepStrictEqual(
    row("ajv/dist/jtd first error wrong kind").errors.map((error) => error.keyword),
    ["multiple"],
  );

  // Verbose entries keep the schema entry as written and the validated data.
  const verbose = row("ajv/dist/jtd verbose wrong kind").errors[0];
  assert.deepStrictEqual(verbose.schema, {$data: "/divisor"});
  assert.deepStrictEqual(verbose.parentSchema, {multiple: {$data: "/divisor"}});
  assert.strictEqual(verbose.data, 10);
  assert.strictEqual(row("ajv/dist/jtd message-free wrong kind").errors[0].message, undefined);

  // A definition that supplies its own data-reference report is honoured.
  const custom = row("ajv/dist/jtd custom data error wrong kind").errors[0];
  assert.deepStrictEqual(custom.params, {reason: "document value"});
  assert.strictEqual(custom.message, '"underLimit" needs a number from the document');
  assert.strictEqual(row("ajv/dist/jtd custom data error absent location").valid, true);

  // Generated validation code sees the resolved value, and a missing location
  // leaves the rule passing.
  assert.strictEqual(row("ajv/dist/jtd generated code divisible").valid, true);
  assert.strictEqual(row("ajv/dist/jtd generated code not divisible").valid, false);
  assert.strictEqual(row("ajv/dist/jtd generated code absent location").valid, true);
  assert.strictEqual(row("ajv/dist/jtd generated code wrong kind").valid, false);

  // A relative location is resolved from the level the rule stands at.
  assert.strictEqual(row("ajv/dist/jtd relative pointer divisible").valid, true);
  assert.strictEqual(row("ajv/dist/jtd relative pointer not divisible").valid, false);

  // With data references off, the same definition registers and its value is
  // used as written.
  assert.strictEqual(row("ajv/dist/jtd disabled literal divisible").valid, true);
  assert.strictEqual(row("ajv/dist/jtd disabled literal not divisible").valid, false);
  assert.deepStrictEqual(row("ajv/dist/jtd disabled object seen").seen, [
    [{$data: "/divisor"}, 1],
  ]);

  // Ajv's compile-time refusals are kept.
  for (const name of [
    "invalid pointer",
    "deep relative pointer",
    "prepared rule only",
    "macro only",
    "disabled reference with type",
  ]) {
    assert.strictEqual(row(`ajv/dist/jtd ${name}`).error !== null, true, name);
  }
  assert.strictEqual(
    row("ajv/dist/jtd invalid pointer").error,
    "Invalid JSON-pointer: bad",
  );
  assert.strictEqual(
    row("ajv/dist/jtd deep relative pointer").error,
    "Cannot access data 2 levels up, current level is 1",
  );
  assert.strictEqual(
    row("ajv/dist/jtd prepared rule only").error,
    '$data keyword must have "code" or "validate" function',
  );
  assert.strictEqual(
    row("ajv/dist/jtd macro only").error,
    '$data keyword must have "code" or "validate" function',
  );
});
