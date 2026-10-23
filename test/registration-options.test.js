"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "registration-options-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "registration-options-project");

// The unchanged project disables the default meta-schema, supplies its own,
// disables automatic registration, and selects the legacy identifier property.
// It runs once with ajv installed and once with this package installed in
// ajv's place; every printed row must match.
test("a project's meta-schemas and schema registration survive the switch unchanged", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

  const rows = new Map(reference.map((row) => [row.case, row]));
  const row = (label) => {
    const entry = rows.get(label);
    assert.ok(entry, `missing case "${label}"`);
    return entry;
  };

  const dialects = [
    ["draft-07", "http://json-schema.org/draft-07/schema"],
    ["2019-09", "https://json-schema.org/draft/2019-09/schema"],
    ["2020-12", "https://json-schema.org/draft/2020-12/schema"],
  ];

  for (const [dialect, metaId] of dialects) {
    const disabled = row(`${dialect} disabled default meta`);
    assert.strictEqual(disabled.defaultMeta, undefined);
    assert.strictEqual(disabled.defaultResolves, false);

    const compiled = row(`${dialect} disabled default meta compiles`);
    assert.strictEqual(compiled.valid, true);
    assert.strictEqual(compiled.errors, null);

    const diagnostics = row(`${dialect} disabled default meta diagnostics`);
    assert.deepStrictEqual(diagnostics.messages, [["warn", "meta-schema not available"]]);

    const checked = row(`${dialect} disabled default meta validateSchema`);
    assert.strictEqual(checked.valid, true);
    assert.strictEqual(checked.errors, null);

    const refused = row(`${dialect} default refuses malformed schema`);
    assert.strictEqual(refused.completed, false);
    assert.match(refused.message, /^schema is invalid: data\/required /);

    const custom = row(`${dialect} custom meta`);
    assert.strictEqual(custom.defaultMeta, `https://example.com/${dialect}/meta`);
    assert.strictEqual(custom.customResolves, true);
    assert.strictEqual(custom.dialectResolves, true);

    assert.strictEqual(row(`${dialect} custom meta admits marker schema`).valid, true);
    assert.strictEqual(row(`${dialect} custom meta admits marker schema`).errors, null);
    assert.strictEqual(
      row(`${dialect} custom meta admits marker schema on a document`).valid,
      false,
    );

    const markerless = row(`${dialect} custom meta refuses markerless schema`);
    assert.strictEqual(markerless.completed, false);
    assert.strictEqual(
      markerless.message,
      "schema is invalid: data must have required property 'marker'",
    );

    const unregistered = row(`${dialect} registration disabled`);
    assert.strictEqual(unregistered.resolves, false);
    assert.strictEqual(unregistered.first, true);

    const duplicate = row(`${dialect} registration disabled accepts duplicate identifier`);
    assert.strictEqual(duplicate.completed, true);
    assert.strictEqual(duplicate.value, true);

    const explicit = row(`${dialect} registration disabled explicit schema`);
    assert.strictEqual(explicit.valid, true);

    const registered = row(`${dialect} registration enabled`);
    assert.strictEqual(registered.resolves, "function");
    assert.strictEqual(registered.first, true);

    const repeated = row(`${dialect} registration enabled refuses duplicate identifier`);
    assert.strictEqual(repeated.completed, false);
    assert.strictEqual(
      repeated.message,
      `schema with key or id "https://example.com/${dialect}/registered" already exists`,
    );

    const defaults = row(`${dialect} defaults`);
    assert.strictEqual(defaults.defaultMeta, metaId);
    assert.strictEqual(defaults.metaResolves, "function");
    assert.strictEqual(defaults.aliasResolves, "function");

    assert.strictEqual(row(`${dialect} defaults verdict`).valid, true);
    assert.strictEqual(row(`${dialect} defaults report`).valid, false);
    assert.match(row(`${dialect} defaults report`).text, /must be string/);
  }
});

// ajv 8.20's `id` keyword rule refuses every schema that carries one, so the
// legacy property's working behaviour is exercised on this package directly:
// the property carries identity, references resolve through it, and the
// verdicts and reports are the ones the same schemas produce under `$id`.
test("the legacy identifier property registers, resolves, and references schemas", () => {
  const Ajv = require("../");
  const Ajv2019 = require("../dist/2019");
  const Ajv2020 = require("../dist/2020");

  const documents = [
    {x: 5},
    {x: "no"},
    {},
    {x: 2, extra: true},
  ];

  for (const [name, Dialect] of [
    ["draft-07", Ajv],
    ["2019-09", Ajv2019],
    ["2020-12", Ajv2020],
  ]) {
    const legacy = new Dialect({schemaId: "id", strict: false});
    legacy.addSchema({id: "https://example.com/legacy-number", type: "number"});
    const validateLegacy = legacy.compile({
      id: "https://example.com/legacy-object",
      type: "object",
      required: ["x"],
      properties: {x: {$ref: "https://example.com/legacy-number"}},
    });

    // The same schemas written with the modern property, under the default
    // configuration, are the pre-switch behaviour the legacy run must match.
    const modern = new Dialect();
    modern.addSchema({$id: "https://example.com/legacy-number", type: "number"});
    const validateModern = modern.compile({
      $id: "https://example.com/legacy-object",
      type: "object",
      required: ["x"],
      properties: {x: {$ref: "https://example.com/legacy-number"}},
    });

    assert.strictEqual(
      typeof legacy.getSchema("https://example.com/legacy-object"),
      "function",
      `${name}: compiled schema is not available by its identifier`,
    );
    assert.strictEqual(
      typeof legacy.getSchema("https://example.com/legacy-number"),
      "function",
      `${name}: referenced schema is not available by its identifier`,
    );

    for (const document of documents) {
      const expected = validateModern(structuredClone(document));
      const expectedErrors = structuredClone(validateModern.errors);
      assert.strictEqual(validateLegacy(structuredClone(document)), expected, name);
      assert.deepStrictEqual(validateLegacy.errors, expectedErrors, name);
      assert.strictEqual(
        legacy.errorsText(validateLegacy.errors),
        modern.errorsText(expectedErrors),
        name,
      );
    }

    // A schema registered with the modern property is not identified by it:
    // it is an ordinary keyword, so two schemas carrying it both compile.
    const modernFirst = legacy.compile({
      $id: "https://example.com/legacy-modern",
      type: "string",
    });
    assert.strictEqual(legacy.getSchema("https://example.com/legacy-modern"), undefined, name);
    const modernSecond = legacy.compile({
      $id: "https://example.com/legacy-modern",
      type: "number",
    });
    assert.strictEqual(modernFirst("text"), true, name);
    assert.strictEqual(modernSecond(3), true, name);

    assert.throws(() => legacy.addSchema({id: 5}, "bad-identifier"), {
      message: "schema id must be string",
    });
  }
});
