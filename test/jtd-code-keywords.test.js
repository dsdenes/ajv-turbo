"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "jtd-code-keywords-project");

// The project defines custom keywords with the generated-validation-code form
// ajv documents, on the JSON Type Definition entry point. Running the
// unchanged project with ajv and then with this package in ajv's place must
// produce the same verdicts, the same reports and summaries through every
// reporting mode, and the same compile-time refusals.
test("a JTD project with generated-code custom keywords runs unchanged", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const workProject = path.join(ROOT, ".tmp", "jtd-code-keywords-project");
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, workProject);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

  const byCase = new Map(reference.map((row) => [row.case, row]));
  const row = (name) => {
    const found = byCase.get(name);
    assert.ok(found, `missing case "${name}"`);
    return found;
  };

  // A record's own metadata carries the keyword for the record value.
  assert.strictEqual(row("all errors record metadata valid").valid, true);
  assert.strictEqual(row("all errors record metadata fails").valid, false);
  assert.deepStrictEqual(
    row("all errors record metadata fails").errors.map((error) => error.schemaPath),
    ["", "/metadata/maxKeys"],
  );
  assert.strictEqual(row("all errors record metadata not an object").valid, false);
  assert.strictEqual(
    row("all errors record metadata not an object").errors[0].keyword,
    "properties",
  );

  // A keyword that applies to one data type leaves every other type alone.
  for (const type of ["number", "boolean", "object", "array", "absent", "null"]) {
    assert.strictEqual(row(`all errors string only ${type}`).valid, true, type);
    assert.strictEqual(row(`all errors string only ${type}`).errors, null, type);
  }
  assert.strictEqual(row("all errors string only string").valid, true);

  // The keyword's report has ajv's locations, keyword, params, and message,
  // and the summary derived from it is identical; a valid document reads
  // `No errors`.
  assert.deepStrictEqual(row("all errors record name fails").errors, [
    {
      instancePath: "/name",
      schemaPath: "/properties/name/metadata/startsWith",
      keyword: "startsWith",
      params: {},
      message: 'must pass "startsWith" keyword validation',
    },
  ]);
  assert.strictEqual(
    row("all errors record name fails").text,
    'data/name must pass "startsWith" keyword validation',
  );
  assert.strictEqual(row("all errors record valid").text, "No errors");

  // A definition that declares its own params and message reports them.
  assert.deepStrictEqual(row("all errors record score fails").errors[0].params, {
    expected: true,
  });
  assert.strictEqual(
    row("all errors record score fails").errors[0].message,
    "even requires an even number",
  );

  // Complete reporting keeps every entry in ajv's order.
  assert.deepStrictEqual(
    row("all errors record both fail").errors.map((error) => error.instancePath),
    ["/name", "/score"],
  );
  // Default reporting stops at the first failure.
  assert.deepStrictEqual(
    row("first error record both fail").errors.map((error) => error.instancePath),
    ["/name"],
  );

  // Optional properties run the keyword too.
  assert.strictEqual(row("all errors record optional fails").valid, false);
  assert.strictEqual(
    row("all errors record optional fails").errors[0].schemaPath,
    "/optionalProperties/tag/metadata/startsWith",
  );

  // Verbose entries carry the schema value, the parent schema, and the data.
  const verbose = row("verbose record name fails").errors[0];
  assert.strictEqual(verbose.schema, "ab");
  assert.deepStrictEqual(verbose.parentSchema, {startsWith: "ab"});
  assert.strictEqual(verbose.data, "xbc");
  assert.strictEqual(row("verbose record score fails").errors[0].schema, true);
  assert.strictEqual(row("verbose record score fails").errors[0].data, 3);

  // Suppressed messages leave the entries otherwise identical.
  const messageFree = row("message-free record name fails").errors[0];
  assert.strictEqual(messageFree.message, undefined);
  assert.deepStrictEqual(messageFree.params, {});

  // Generated code decides the verdict over a rule function that would decide
  // the opposite one.
  for (const mode of ["all errors", "first error", "verbose", "message-free"]) {
    assert.strictEqual(row(`${mode} generated code wins below`).valid, false);
    assert.strictEqual(row(`${mode} generated code wins equal`).valid, true);
    assert.strictEqual(row(`${mode} generated code wins above`).valid, true);
    assert.strictEqual(
      row(`${mode} generated code wins below`).errors[0].schemaPath,
      "/metadata/atLeast",
    );
  }

  // A declared value schema is enforced while the containing schema compiles:
  // the rejected value produces no validator, and the message is ajv's.
  for (const mode of ["all errors", "first error", "verbose", "message-free"]) {
    assert.strictEqual(row(`${mode} port accepted`).error, null);
  }
  for (const mode of ["all errors", "first error", "verbose"]) {
    assert.strictEqual(
      row(`${mode} port too large`).error,
      'keyword "port" value is invalid at path "/properties/p/metadata": data must be uint16',
    );
    assert.strictEqual(
      row(`${mode} port wrong type`).error,
      'keyword "port" value is invalid at path "/properties/p/metadata": data must be uint16',
    );
  }
  // With messages suppressed the value schema's own report loses its text,
  // exactly as ajv's does.
  assert.strictEqual(
    row("message-free port too large").error,
    'keyword "port" value is invalid at path "/properties/p/metadata": data undefined',
  );
  assert.strictEqual(
    row("value schema refusal").error,
    'keyword "port" value is invalid at path "/metadata": data must be uint16',
  );

  // A schema the dialect admits compiles and validates; one that uses the
  // keyword where the dialect does not admit it is refused with ajv's
  // meta-schema message and produces no validator.
  assert.strictEqual(row("accepted valid").valid, true);
  assert.strictEqual(row("accepted fails").valid, false);
  assert.strictEqual(
    row("refused nested metadata").error,
    'JTD: "metadata" cannot be used in this schema location',
  );
  for (const name of ["refused root keyword", "refused beside properties"]) {
    assert.match(row(name).error, /^schema is invalid: /, name);
    assert.match(row(name).error, /must NOT have additional properties|must have property/, name);
  }
});
