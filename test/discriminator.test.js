"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "discriminator-project");

// The unchanged project enables ajv's discriminator option through each JSON
// Schema entry point, compiles tagged-union schemas, and prints every verdict,
// report, summary, rewritten document, and compile-time refusal. Running it
// with ajv and then with this package in ajv's place must produce the same
// output, including the schemas that do not use the option.
for (const dialect of ["draft7", "2019", "2020"]) {
  test(`an ajv project's discriminators run unchanged (${dialect})`, () => {
    const before = hashDirectory(SOURCE_PROJECT);
    const workProject = path.join(ROOT, ".tmp", `discriminator-project-${dialect}`);
    const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, workProject, {
      DIALECT: dialect,
    });

    assert.deepStrictEqual(replacement, reference);
    assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

    const byCase = new Map(reference.map((row) => [row.case, row]));
    const report = (label) => {
      const row = byCase.get(label);
      assert.ok(row, `missing case "${label}"`);
      return row;
    };

    assert.ok(reference.length > 100, "expected every discriminator case to run");

    const unknown = report("complete unknown tag");
    assert.strictEqual(unknown.valid, false);
    assert.deepStrictEqual(unknown.errors, [
      {
        instancePath: "",
        schemaPath: "#/discriminator",
        keyword: "discriminator",
        params: {error: "mapping", tag: "kind", tagValue: "hexagon"},
        message: 'value of tag "kind" must be in oneOf',
      },
    ]);
    assert.strictEqual(report("first error unknown tag").errors[0].keyword, "discriminator");
    assert.strictEqual(report("complete circle valid").valid, true);
    assert.strictEqual(report("complete circle negative").valid, false);
    assert.strictEqual(report("complete rect valid").valid, true);
    assert.strictEqual(report("complete square missing height").valid, false);
    assert.strictEqual(report("complete extra property").valid, true);

    const nonString = report("complete non-string tag");
    assert.strictEqual(nonString.valid, false);
    assert.deepStrictEqual(nonString.errors.at(-1).params, {
      error: "tag",
      tag: "kind",
      tagValue: 5,
    });

    assert.strictEqual(report("complete missing branch property").errors[0].keyword, "required");

    const verbose = report("verbose unknown tag").errors[0];
    assert.ok("schema" in verbose && "parentSchema" in verbose && "data" in verbose);
    assert.deepStrictEqual(verbose.schema, {propertyName: "kind"});
    assert.strictEqual(verbose.data.kind, "hexagon");

    for (const label of [
      "message-free unknown tag",
      "message-free non-string tag",
      "message-free missing tag",
      "message-free verbose unknown tag",
    ]) {
      assert.ok(
        report(label).errors.every((error) => !("message" in error)),
        `${label} must omit every message`,
      );
    }

    assert.strictEqual(report("referenced circle valid").valid, true);
    assert.strictEqual(report("referenced branch fails").valid, false);
    assert.strictEqual(report("referenced unknown tag").valid, false);

    assert.strictEqual(report("option without annotation plain valid").valid, true);
    assert.strictEqual(report("option without annotation plain both branches").valid, false);

    if (dialect !== "draft7") {
      assert.strictEqual(report("evaluated allOf complete circle inside").valid, true);
      assert.strictEqual(report("evaluated allOf complete unevaluated extra").valid, false);
      assert.deepStrictEqual(
        report("evaluated allOf complete unevaluated extra").errors.map((error) => error.keyword),
        ["unevaluatedProperties"],
      );
      assert.strictEqual(report("evaluated oneOf complete branch fails").valid, false);
      assert.strictEqual(report("evaluated oneOf complete circle inside").valid, true);
    }

    assert.strictEqual(report("compile accepted tagged union").error, null);
    assert.strictEqual(
      report("compile missing propertyName").error,
      "discriminator: requires propertyName",
    );
    assert.strictEqual(
      report("compile mapping unsupported").error,
      "discriminator: mapping is not supported",
    );
    assert.strictEqual(
      report("compile missing oneOf").error,
      "discriminator: requires oneOf keyword",
    );
    assert.strictEqual(
      report("compile member without tag property").error,
      'discriminator: oneOf subschemas (or referenced schemas) must have "properties/kind"',
    );
    assert.strictEqual(
      report("compile tag not required").error,
      'discriminator: "kind" must be required',
    );
    assert.strictEqual(
      report("compile tag without const or enum").error,
      'discriminator: "properties/kind" must have "const" or "enum"',
    );
    assert.strictEqual(
      report("compile non-string tag value").error,
      'discriminator: "kind" values must be unique strings',
    );
    assert.strictEqual(
      report("compile duplicate tag value").error,
      'discriminator: "kind" values must be unique strings',
    );
    const missingRef = report("compile unresolved member reference");
    assert.strictEqual(missingRef.name, "MissingRefError");
    assert.strictEqual(missingRef.error, "can't resolve reference #/$defs/missing from id #");
    assert.strictEqual(missingRef.missingRef, "#/$defs/missing");
    assert.strictEqual(missingRef.missingSchema, "");
    assert.strictEqual(
      report("compile non-object annotation").error,
      'discriminator value must be ["object"]',
    );

    assert.strictEqual(
      report("option off strict true").error,
      'strict mode: unknown keyword: "discriminator"',
    );
    const logged = report("option off strict log");
    assert.strictEqual(logged.error, null);
    assert.deepStrictEqual(logged.warnings, ['strict mode: unknown keyword: "discriminator"']);
    assert.strictEqual(logged.verdicts[0].valid, true);
    assert.strictEqual(logged.verdicts[1].valid, false);
  });
}
