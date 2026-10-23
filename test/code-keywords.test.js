"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "code-keywords-project");

// The project defines custom keywords with the generated-validation-code form
// ajv documents. Running the unchanged project with ajv and then with this
// package in ajv's place must produce the same verdicts and the same reports
// through every dialect entry point.
for (const dialect of ["draft7", "2019", "2020"]) {
  test(`a project with generated-code custom keywords runs unchanged (${dialect})`, () => {
    const before = hashDirectory(SOURCE_PROJECT);
    const workProject = path.join(ROOT, ".tmp", `code-keywords-project-${dialect}`);
    const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, workProject, {
      DIALECT: dialect,
    });

    assert.deepStrictEqual(replacement, reference);
    assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

    const byCase = new Map(reference.map((row) => [row.case, row]));

    for (const mode of ["all errors", "first error"]) {
      const report = (name) => {
        const row = byCase.get(`${mode} ${name}`);
        assert.ok(row, `missing case "${mode} ${name}"`);
        return row;
      };

      assert.strictEqual(report("string rule valid").valid, true);
      assert.strictEqual(report("string rule fails").valid, false);
      assert.strictEqual(report("string rule fails").errors[0].schemaPath, "#/properties/value/startsWith");
      assert.strictEqual(report("string rule other type").valid, false);
      assert.strictEqual(report("string rule other type").errors[0].keyword, "type");

      assert.strictEqual(report("number rule valid").valid, true);
      assert.strictEqual(report("number rule fails").valid, false);
      assert.strictEqual(report("number rule fails").errors[0].keyword, "even");
      assert.strictEqual(report("number rule other type").valid, false);
      assert.strictEqual(report("number rule other type").errors[0].keyword, "type");

      assert.strictEqual(report("custom report valid").valid, true);
      assert.strictEqual(report("custom report fails").valid, false);
      assert.deepStrictEqual(report("custom report fails").errors[0].params, {limit: 3});
      assert.strictEqual(report("custom report fails").errors[0].message, "atMost allows at most 3");

      assert.strictEqual(report("generated loop valid").valid, true);
      assert.strictEqual(report("generated loop several fail").valid, false);
      assert.strictEqual(report("generated loop one fails").valid, false);
      assert.deepStrictEqual(report("generated loop one fails").errors[0].params, {bad: "Z"});

      assert.strictEqual(report("range valid").valid, true);
      assert.strictEqual(report("range low").valid, false);
      assert.strictEqual(report("range high").valid, false);
      assert.strictEqual(report("range other type").valid, false);

      assert.strictEqual(report("document value valid").valid, true);
      assert.strictEqual(report("document value fails").valid, false);
      assert.strictEqual(report("document value absent").valid, true);
      assert.strictEqual(report("document value wrong type").valid, false);

      assert.strictEqual(report("port accepted").error, null);
      assert.match(report("port too large").error, /keyword "port" value is invalid/);
      assert.match(report("port wrong type").error, /keyword "port" value is invalid/);
      assert.strictEqual(report("typed value accepted").error, null);
      assert.match(report("typed value wrong type").error, /typedValue value must be \["number"\]/);

      assert.strictEqual(report("range accepted").error, null);
      assert.match(report("range too short").error, /keyword "range" value is invalid/);
      assert.match(report("range wrong shape").error, /keyword "range" value is invalid/);
    }

    const verbose = byCase.get("verbose custom report fails");
    assert.strictEqual(verbose.errors[0].schema, 3);
    assert.deepStrictEqual(verbose.errors[0].parentSchema, {type: "string", atMost: 3});
    assert.strictEqual(verbose.errors[0].data, "abcd");

    const messageFree = byCase.get("message-free custom report fails");
    assert.strictEqual(messageFree.errors[0].message, undefined);

    const logged = byCase.get("logged value compiled");
    assert.strictEqual(logged.error, null);
    assert.strictEqual(logged.valid, true);

    // A generated-code rule that awaits settles with ajv's outcome, report,
    // and error order, and a rule that waits on nothing keeps its synchronous
    // behaviour inside an asynchronous schema.
    const row = (name) => {
      const found = byCase.get(name);
      assert.ok(found, `missing case "${name}"`);
      return found;
    };
    assert.strictEqual(row("all errors async rule valid").settled, "valid");
    assert.deepStrictEqual(row("all errors async rule valid").out, {value: "abcd"});
    assert.strictEqual(row("all errors async rule fails").settled, "invalid");
    assert.strictEqual(row("all errors async rule fails").errors[0].keyword, "asyncStartsWith");
    assert.strictEqual(
      row("all errors async rule fails").errors[0].schemaPath,
      "#/properties/value/asyncStartsWith",
    );
    assert.deepStrictEqual(row("all errors async rule fails").errors[0].params, {prefix: "ab"});
    assert.strictEqual(row("first error async rule fails").errors.length, 1);
    assert.deepStrictEqual(
      row("all errors async rule second both fail").errors.map((error) => error.keyword),
      ["minLength", "asyncWords"],
    );
    assert.strictEqual(row("all errors async rule wrong type").settled, "invalid");
    assert.strictEqual(row("all errors async rule wrong type").errors[0].keyword, "type");
    assert.strictEqual(row("all errors async schema sync rule valid").settled, "valid");
    assert.strictEqual(row("all errors async schema sync rule fails").settled, "invalid");
    assert.strictEqual(row("all errors async inlined reference fails").settled, "invalid");
    assert.strictEqual(
      row("all errors async inlined reference fails").errors[0].schemaPath,
      "http://example.com/code-keywords/inner/asyncStartsWith",
    );
    assert.deepStrictEqual(row("all errors async rewritten valid").document, {value: "padded"});
    assert.match(row("first error sync schema async rule").error, /^await is only valid/);
  });
}
