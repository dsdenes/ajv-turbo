"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "reference-alone-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "reference-alone-project");

// The unchanged project turns on ajv's deprecated reference-alone option and
// compiles schemas whose reference is accompanied by constraints the documents
// would otherwise violate, references with no companions, and a reference
// whose target carries companions of its own. It prints verdicts, reports,
// diagnostics, and the results of standalone modules for every published
// dialect, then runs once more with the option off and absent. It runs once
// with ajv installed and once with this package installed in ajv's place.
test("an ajv project's reference-alone option survives the switch unchanged", () => {
  const {reference, replacement} = runWithBothValidators(
    SOURCE_PROJECT,
    WORK_PROJECT,
    {},
    ["generated"],
  );

  assert.deepStrictEqual(replacement, reference);
  assert.ok(reference.length >= 500, "expected every fixture case to run");

  const byCase = new Map(reference.map((row) => [row.case, row]));
  const caseOf = (label) => {
    const row = byCase.get(label);
    assert.ok(row !== undefined, `missing fixture case: ${label}`);
    return row;
  };

  for (const dialect of ["draft-07", "2019-09", "2020-12"]) {
    for (const setting of ["on", "on all errors"]) {
      // Constraints beside the reference do not run: the referenced number
      // accepts 5 and 7, while a document outside the reference is refused by
      // the reference's own report.
      assert.strictEqual(caseOf(`${dialect} ${setting} companion 5`).valid, true);
      assert.strictEqual(caseOf(`${dialect} ${setting} companion 7`).valid, true);
      const rejected = caseOf(`${dialect} ${setting} companion "hello"`);
      assert.strictEqual(rejected.valid, false);
      assert.deepStrictEqual(
        rejected.errors.map((error) => error.keyword),
        ["type"],
        "only the referenced schema reports",
      );

      // ajv keeps its separate type guard when the declared type has no rule
      // of its own beside the reference, so a number fails the string type.
      assert.strictEqual(caseOf(`${dialect} ${setting} typeOnly 5`).valid, false);
      assert.strictEqual(caseOf(`${dialect} ${setting} typeOnly "hi"`).valid, false);

      // With a rule of the declared type present, the guard is not emitted.
      assert.strictEqual(caseOf(`${dialect} ${setting} typeWithRule 5`).valid, true);
      assert.strictEqual(caseOf(`${dialect} ${setting} typeWithRule "hi"`).valid, false);

      // Companions under an applicator and on a referenced target behave the
      // same way.
      assert.strictEqual(caseOf(`${dialect} ${setting} nested 5`).valid, true);
      assert.strictEqual(caseOf(`${dialect} ${setting} nested "hi"`).valid, false);
      assert.strictEqual(caseOf(`${dialect} ${setting} targetWithCompanion 5`).valid, true);
      assert.strictEqual(caseOf(`${dialect} ${setting} targetWithCompanion "hi"`).valid, false);
      assert.strictEqual(caseOf(`${dialect} ${setting} objectCompanion ${JSON.stringify({a: 1})}`).valid, true);
      assert.strictEqual(
        caseOf(`${dialect} ${setting} objectCompanion ${JSON.stringify({a: 1, b: 2})}`).valid,
        true,
      );
      assert.strictEqual(caseOf(`${dialect} ${setting} objectCompanion "no"`).valid, false);

      // A reference with no validation companions, or with annotations only,
      // behaves as it always did.
      for (const name of ["referenceAlone", "annotations"]) {
        const labels = {
          referenceAlone: ["referenceAlone \"hello\"", "referenceAlone \"hi\"", "referenceAlone 5"],
          annotations: ["annotations 5", "annotations \"hello\""],
        }[name];
        for (const suffix of labels) {
          const enabled = caseOf(`${dialect} ${setting} ${suffix}`);
          const disabled = caseOf(`${dialect} off ${suffix}`);
          const absent = caseOf(`${dialect} absent ${suffix}`);
          assert.strictEqual(enabled.valid, disabled.valid);
          assert.strictEqual(enabled.valid, absent.valid);
          assert.deepStrictEqual(enabled.errors, disabled.errors);
          assert.deepStrictEqual(enabled.errors, absent.errors);
        }
      }

      // Generated modules repeat the same verdicts and reports.
      for (const name of ["companion", "typeOnly", "referenceAlone", "objectCompanion"]) {
        const schema = {
          companion: [5, "\"hello\""],
          typeOnly: [5, "\"hi\""],
          referenceAlone: ["\"hello\"", "\"hi\"", "5"],
          objectCompanion: [JSON.stringify({a: 1}), "\"no\""],
        }[name];
        for (const document of schema) {
          const generated = caseOf(`${dialect} ${setting} ${name} standalone ${document}`);
          const inline = caseOf(`${dialect} ${setting} ${name} ${document}`);
          assert.strictEqual(generated.valid, inline.valid);
          assert.deepStrictEqual(generated.errors, inline.errors);
        }
      }

      // The failure report for a document outside the reference comes from
      // the reference alone, in ajv's order and wording.
      const full = caseOf(`${dialect} on all errors companion "hello"`);
      assert.strictEqual(full.errors.length, 1);
      assert.strictEqual(full.errors[0].message, "must be number");
      assert.strictEqual(full.errors[0].schemaPath, "#/definitions/number/type");

      // An asynchronous schema keeps the same verdicts and reports.
      assert.strictEqual(caseOf(`${dialect} ${setting} async 5`).valid, true);
      assert.strictEqual(caseOf(`${dialect} ${setting} async 7`).valid, true);
      assert.strictEqual(caseOf(`${dialect} ${setting} async "hello"`).valid, false);

      // ajv reports the ignored companions while compiling, beside the
      // deprecation notice for the option itself.
      const diagnostics = caseOf(`${dialect} ${setting} diagnostics`).messages;
      assert.ok(diagnostics.includes("DEPRECATED: option ignoreKeywordsWithRef. "));
      assert.ok(diagnostics.some((message) => /^\$ref: keywords ignored/.test(message)));
    }

    for (const setting of ["off", "absent"]) {
      // Without the request nothing changes: the companion constraints reject
      // documents the reference alone would accept.
      const rejected = caseOf(`${dialect} ${setting} companion 5`);
      assert.strictEqual(rejected.valid, false);
      assert.ok(rejected.errors.length > 0);
      assert.ok(rejected.errors.some((error) => error.keyword !== "type"));
      assert.strictEqual(caseOf(`${dialect} ${setting} typeWithRule 5`).valid, false);

      if (setting === "absent") {
        assert.deepStrictEqual(caseOf(`${dialect} absent diagnostics`).messages, []);
      }
    }
  }
});
