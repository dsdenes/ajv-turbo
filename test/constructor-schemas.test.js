"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "constructor-schemas-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "constructor-schemas-project");

// The unchanged project hands its schemas to the validator's constructor as an
// array and as a keyed collection, validates through them by identifier and by
// key, refers from one supplied schema to another, and builds the collections
// ajv refuses. It runs once with ajv installed and once with this package
// installed in ajv's place.
test("an ajv project's constructor-supplied schemas run unchanged", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.ok(reference.length >= 60, "expected every fixture case to run");

  const rows = (label) => reference.filter((row) => row.case === label);
  const one = (label) => {
    const found = rows(label);
    assert.strictEqual(found.length, 1, `expected one case "${label}"`);
    return found[0];
  };

  for (const dialect of ["draft-07", "2019-09", "2020-12"]) {
    const person = rows(`${dialect} list https://example.com/person`);
    assert.deepStrictEqual(
      person.map((row) => row.valid),
      [true, false],
      `${dialect} listed schemas validate by identifier`,
    );
    assert.strictEqual(person[0].errors, null);
    assert.strictEqual(person[0].text, "No errors");
    assert.strictEqual(
      person[1].errors.length,
      4,
      `${dialect} reports every violation with allErrors`,
    );
    assert.notStrictEqual(person[1].text, "No errors");

    assert.deepStrictEqual(
      rows(`${dialect} list https://example.com/tag`).map((row) => row.valid),
      [true, false],
    );
    assert.deepStrictEqual(
      rows(`${dialect} list https://example.com/pair`).map((row) => row.valid),
      [true, false, false],
    );

    assert.strictEqual(one(`${dialect} name contact valid`).valid, true);
    assert.strictEqual(one(`${dialect} name contact invalid`).valid, false);
    assert.strictEqual(
      one(`${dialect} name contact invalid`).text,
      "data must NOT have additional properties",
    );
    assert.strictEqual(one(`${dialect} name label invalid`).valid, false);
    assert.strictEqual(one(`${dialect} name coordinates invalid`).valid, false);

    assert.deepStrictEqual(
      rows(`${dialect} cross-reference`).map((row) => row.valid),
      [true, false, false, false],
      `${dialect} supplied schemas resolve each other without further registration`,
    );
    assert.strictEqual(one(`${dialect} cross-reference target`).valid, true);
    assert.strictEqual(one(`${dialect} validate by identifier`).valid, false);
    assert.strictEqual(one(`${dialect} validate method`).valid, true);
    assert.strictEqual(one(`${dialect} validate by identifier method`).valid, true);
    assert.strictEqual(one(`${dialect} validate by identifier method invalid`).valid, false);
  }

  assert.strictEqual(one("jtd name word valid").valid, true);
  assert.strictEqual(one("jtd name word invalid").valid, false);
  assert.strictEqual(one("jtd name point valid").valid, true);
  assert.strictEqual(one("jtd name point invalid").valid, false);

  const refusals = [
    "refuse duplicate list",
    "refuse duplicate names",
    "refuse invalid member",
    "refuse invalid required",
  ];
  for (const label of refusals) {
    const refused = one(label);
    assert.strictEqual(refused.constructed, false, `${label} must not construct a validator`);
    assert.strictEqual(typeof refused.message, "string");
  }
  assert.strictEqual(
    one("refuse duplicate list").message,
    'schema with key or id "https://example.com/duplicate" already exists',
  );
  assert.strictEqual(
    one("refuse duplicate names").message,
    'schema with key or id "https://example.com/duplicate" already exists',
  );
  assert.match(one("refuse invalid member").message, /^schema is invalid: data\/type /);
});

// Every construction ajv refuses is refused here with the same message, and
// the construction throws instead of yielding a validator.
test("refused constructor collections carry ajv's message", () => {
  const entries = [
    ["draft-07", require("ajv-reference"), require("../")],
    ["2019-09", require("ajv-reference/dist/2019"), require("../dist/2019")],
    ["2020-12", require("ajv-reference/dist/2020"), require("../dist/2020")],
    ["jtd", require("ajv-reference/dist/jtd"), require("../dist/jtd")],
  ];
  const collections = [
    ["duplicate identifiers in a list", () => [
      {$id: "https://example.com/duplicate", type: "number"},
      {$id: "https://example.com/duplicate", type: "string"},
    ]],
    ["duplicate identifiers under names", () => ({
      first: {$id: "https://example.com/duplicate", type: "number"},
      second: {$id: "https://example.com/duplicate", type: "string"},
    })],
    ["invalid member", () => [{$id: "https://example.com/broken", type: 5}]],
    ["non-string identifier", () => [{$id: 5, type: "number"}]],
    ["non-schema member", () => ({broken: "not a schema"})],
    ["two keyless members", () => [{type: "string"}, {type: "number"}]],
  ];

  for (const [dialect, ReferenceAjv, ReplacementAjv] of entries) {
    for (const [label, make] of collections) {
      const message = (Ajv) => {
        try {
          new Ajv({schemas: make()});
          return undefined;
        } catch (error) {
          return error.message;
        }
      };
      const expected = message(ReferenceAjv);
      assert.strictEqual(typeof expected, "string", `${dialect} ${label} should be refused by ajv`);
      assert.strictEqual(message(ReplacementAjv), expected, `${dialect} ${label}`);
    }
  }
});
