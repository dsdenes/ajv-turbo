"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const ReferenceAjv = require("ajv-reference");
const ReplacementAjv = require("../");
const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "compile-async-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "compile-async-project");

// The unchanged service loads missing schema references while compiling. It
// runs once with ajv installed and once with this package installed in ajv's
// place; every printed row must match.
test("a project that loads missing references compiles asynchronously unchanged", () => {
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

  for (const dialect of ["draft-07", "2019-09", "2020-12"]) {
    assert.strictEqual(row(`${dialect} compiles with loaded references`).completed, true);

    assert.strictEqual(row(`${dialect} loaded reference verdicts`).valid, true);
    assert.strictEqual(row(`${dialect} loaded reference verdicts`).errors, null);

    const refusal = row(`${dialect} loaded reference refusal`);
    assert.strictEqual(refusal.valid, false);
    assert.strictEqual(refusal.text, "data/customer must NOT have additional properties");

    const registered = row(`${dialect} loaded schemas are registered`);
    assert.strictEqual(registered.customer, true);
    assert.strictEqual(registered.address, true);
    assert.deepStrictEqual(registered.counts, {
      "https://example.com/schemas/address": 1,
      "https://example.com/schemas/customer": 1,
    });

    assert.strictEqual(row(`${dialect} loaded schema validates itself`).valid, true);

    const reuse = row(`${dialect} later compilation reuses the registration`);
    assert.strictEqual(reuse.completed, true);
    assert.strictEqual(reuse.valid, true);
    assert.deepStrictEqual(reuse.newLoads, []);

    const concurrent = row(`${dialect} concurrent compilations share one load`);
    assert.strictEqual(concurrent.completed, true);
    assert.deepStrictEqual(concurrent.verdicts, [true, true]);
    assert.deepStrictEqual(concurrent.counts, {
      "https://example.com/schemas/address": 1,
    });

    const noLoader = row(`${dialect} async compile requires a loader`);
    assert.strictEqual(noLoader.returnedPromise, false);
    assert.deepStrictEqual(noLoader.failure, {
      name: "Error",
      message: "options.loadSchema should be a function",
    });

    const unavailable = row(`${dialect} registered schema without the reference`);
    assert.strictEqual(unavailable.completed, false);
    assert.strictEqual(
      unavailable.message,
      "AnySchema https://example.com/schemas/catalog is loaded but " +
        "https://example.com/schemas/catalog#/$defs/missing cannot be resolved",
    );
    assert.deepStrictEqual(unavailable.counts, {});

    assert.strictEqual(row(`${dialect} meta-schema loaded`).completed, true);
    assert.strictEqual(row(`${dialect} meta-schema governed verdicts`).valid, true);
    assert.strictEqual(row(`${dialect} meta-schema governed refusal`).valid, false);
    const metaRefusal = row(`${dialect} meta-schema refuses a schema`);
    assert.strictEqual(metaRefusal.completed, false);
    assert.match(metaRefusal.message, /^schema is invalid: /);
    assert.deepStrictEqual(metaRefusal.counts, {"https://example.com/meta/profile": 1});

    const rejected = row(`${dialect} loader rejection`);
    assert.strictEqual(rejected.completed, false);
    assert.strictEqual(rejected.message, "offline schema store");
    assert.deepStrictEqual(rejected.counts, {"https://example.com/schemas/offline": 1});

    const refused = row(`${dialect} loaded schema refused`);
    assert.strictEqual(refused.completed, false);
    assert.match(refused.message, /^schema is invalid: /);
    assert.deepStrictEqual(refused.counts, {"https://example.com/schemas/broken": 1});

    const synchronous = row(`${dialect} synchronous compile ignores the loader`);
    assert.strictEqual(synchronous.completed, false);
    assert.strictEqual(synchronous.name, "MissingRefError");
    assert.strictEqual(
      synchronous.message,
      "can't resolve reference https://example.com/schemas/address from id #",
    );
    assert.deepStrictEqual(synchronous.counts, {});
  }
});

// Outcomes ajv produces around loading that the unchanged project cannot print
// without knowing ajv's internals: these compare the two validators directly.
async function outcome(Ajv, run) {
  const events = [];
  try {
    return {value: await run(Ajv, events), events};
  } catch (error) {
    return {name: error.constructor.name, message: error.message, events};
  }
}

test("asynchronous compilation follows ajv's loading rules", async () => {
  const scenarios = [
    {
      name: "loader id differs from the requested uri",
      async run(Ajv, events) {
        const ajv = new Ajv({
          strict: false,
          loadSchema: async (uri) => {
            events.push(uri);
            return {$id: "https://example.com/actual", type: "string"};
          },
        });
        const validate = await ajv.compileAsync({$ref: "https://example.com/alias"});
        return {
          verdicts: [validate("text"), validate(4)],
          byRequestedUri: Boolean(ajv.getSchema("https://example.com/alias")),
          byIdentifier: Boolean(ajv.getSchema("https://example.com/actual")),
        };
      },
    },
    {
      name: "loads a referenced schema before validating an asynchronous schema",
      async run(Ajv, events) {
        const ajv = new Ajv({
          strict: false,
          loadSchema: async (uri) => {
            events.push(uri);
            return {$id: uri, type: "integer", minimum: 5};
          },
        });
        const validate = await ajv.compileAsync({
          $async: true,
          $id: "https://example.com/async-order",
          required: ["quantity"],
          properties: {quantity: {$ref: "https://example.com/async-quantity"}},
        });
        const settled = [];
        for (const data of [{quantity: 7}, {quantity: 1}, {}]) {
          try {
            settled.push({value: await validate(structuredClone(data))});
          } catch (error) {
            settled.push({name: error.constructor.name, errors: error.errors});
          }
        }
        return {async: validate.$async === true, settled};
      },
    },
    {
      name: "loader supplies a non-schema",
      async run(Ajv, events) {
        const ajv = new Ajv({
          strict: false,
          loadSchema: async (uri) => {
            events.push(uri);
            return "not a schema";
          },
        });
        await ajv.compileAsync({$ref: "https://example.com/nonschema"});
        return {compiled: true};
      },
    },
    {
      name: "a failed load can be retried",
      async run(Ajv, events) {
        let calls = 0;
        const ajv = new Ajv({
          strict: false,
          loadSchema: async (uri) => {
            events.push(uri);
            calls += 1;
            if (calls === 1) throw new Error("first attempt fails");
            return {$id: uri, type: "string"};
          },
        });
        const failures = [];
        try {
          await ajv.compileAsync({$ref: "https://example.com/flaky"});
        } catch (error) {
          failures.push(error.message);
        }
        const validate = await ajv.compileAsync({$ref: "https://example.com/flaky"});
        return {failures, valid: validate("ok")};
      },
    },
    {
      name: "synchronous compilation leaves an unregistered reference alone",
      async run(Ajv, events) {
        const ajv = new Ajv({
          strict: false,
          loadSchema: async (uri) => {
            events.push(uri);
            return {$id: uri, type: "integer"};
          },
        });
        ajv.compile({$ref: "https://example.com/never-loaded"});
        return {compiled: true};
      },
    },
  ];

  for (const scenario of scenarios) {
    const expected = await outcome(ReferenceAjv, scenario.run);
    const actual = await outcome(ReplacementAjv, scenario.run);
    assert.deepStrictEqual(actual, expected, scenario.name);
  }
});
