"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "programmatic-keywords-project");

// The project defines all of its custom rules programmatically and registers
// them two ways: on the validator instance with addKeyword, and when the
// validator is created with the `keywords` option. Running the unchanged
// project with ajv and then with this package in ajv's place must produce the
// same verdicts, reports, and rewritten documents through every dialect entry
// point.
for (const dialect of ["draft7", "2019", "2020"]) {
  for (const registration of ["instance", "constructor"]) {
    test(`a project defining custom keywords programmatically runs unchanged (${dialect}, ${registration})`, () => {
      const before = hashDirectory(SOURCE_PROJECT);
      const workProject = path.join(
        ROOT,
        ".tmp",
        `programmatic-keywords-project-${dialect}-${registration}`,
      );
      const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, workProject, {
        DIALECT: dialect,
        REGISTRATION: registration,
      });

      assert.deepStrictEqual(replacement, reference);
      assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

      const byCase = new Map(reference.map((row) => [row.case, row]));
      const report = (name) => {
        const row = byCase.get(name);
        assert.ok(row, `missing case "${name}"`);
        return row;
      };
      const keywords = (name) => report(name).errors.map((error) => error.keyword);
      const modes = ["all errors", "first error", "message-free", "verbose"];

      for (const mode of modes) {
        // Verdicts over the fixed documents, in the project's order.
        assert.strictEqual(report(`${mode}: accepted`).valid, true);
        assert.strictEqual(report(`${mode}: rejected`).valid, false);
        assert.strictEqual(report(`${mode}: rewritten`).valid, true);
        assert.strictEqual(report(`${mode}: several`).valid, false);
        assert.strictEqual(report(`${mode}: missing`).valid, false);
        assert.strictEqual(report(`${mode}: wrong types`).valid, false);
      }

      // Every violation: the rule's own entries come first and in its order,
      // followed by the built-in, compiled, and macro reports at their
      // locations.
      assert.deepStrictEqual(keywords("all errors: rejected"), [
        "count",
        "count",
        "evenPage",
        "count",
        "count",
        "prefixed",
        "multipleOf",
        "multipleOfThree",
      ]);
      assert.deepStrictEqual(
        report("all errors: rejected").errors.map((error) => error.instancePath),
        ["/count", "/count", "/pages", "/steps/0", "/steps/1", "/code", "/total", "/total"],
      );
      assert.deepStrictEqual(
        report("all errors: rejected").errors.map((error) => error.schemaPath),
        [
          "#/properties/count/count",
          "#/properties/count/count",
          "#/properties/pages/evenPage",
          "#/properties/steps/items/count",
          "#/properties/steps/items/count",
          "#/properties/code/prefixed",
          "#/properties/total/multipleOfThree/multipleOf",
          "#/properties/total/multipleOfThree",
        ],
      );
      assert.deepStrictEqual(report("all errors: rejected").errors[0].params, {
        limit: 4,
        reason: "limit",
      });
      assert.strictEqual(report("all errors: rejected").errors[0].message, "must not exceed 4");
      assert.deepStrictEqual(report("all errors: rejected").errors[1].params, {reason: "even"});
      assert.deepStrictEqual(report("all errors: rejected").errors[2].params, {limit: 3});
      assert.strictEqual(
        report("all errors: rejected").errors[2].message,
        "must be an even page (<= 3)",
      );

      // First violation: the failing rule supplies its own entries, and the
      // document stops there; later keywords neither report nor rewrite.
      assert.deepStrictEqual(keywords("first error: rejected"), ["count", "count"]);
      assert.deepStrictEqual(report("first error: rejected").data, {
        count: 5,
        label: "Mixed  Case",
        pages: 5,
        steps: [3, 4],
        code: "ZZ",
        total: 4,
      });
      assert.strictEqual(
        report("first error: rejected").text,
        "data/count must not exceed 4, data/count must be even",
      );

      // Message-free reports suppress the entries the validator generates but
      // keep the messages a custom rule supplies, as ajv does.
      const messageFree = report("message-free: rejected").errors;
      for (const error of messageFree.filter((entry) => entry.keyword === "count" ||
        entry.keyword === "evenPage")) {
        assert.strictEqual(typeof error.message, "string");
      }
      for (const keyword of ["prefixed", "multipleOf", "multipleOfThree"]) {
        const error = messageFree.find((entry) => entry.keyword === keyword);
        assert.ok(error, `missing message-free entry for ${keyword}`);
        assert.strictEqual(error.message, undefined);
      }

      // Verbose reports carry the keyword's value and the value it rejected
      // with a custom rule's entries, and the full context with a generated
      // entry.
      const verbose = report("verbose: rejected").errors;
      const custom = verbose.find((entry) => entry.keyword === "count");
      assert.deepStrictEqual(custom.schema, {limit: 4, even: true});
      assert.strictEqual(custom.data, 5);
      assert.strictEqual(custom.parentSchema, undefined);
      const generated = verbose.find((entry) => entry.keyword === "prefixed");
      assert.strictEqual(generated.schema, "AB");
      assert.strictEqual(generated.data, "ZZ");
      assert.deepStrictEqual(generated.parentSchema, {type: "string", prefixed: "AB"});

      // A rule that rewrites the value leaves ajv's value in the project's
      // document, and the later rule's verdict covers the rewritten value: the
      // text is accepted only because normalisation happened first.
      const rewritten = report("all errors: rewritten");
      assert.strictEqual(rewritten.valid, true);
      assert.strictEqual(rewritten.errors, null);
      assert.strictEqual(rewritten.data.label, "mixed case");
      assert.deepStrictEqual(rewritten.data, {
        count: 2,
        label: "mixed case",
        pages: 2,
        steps: [1, 2],
        code: "AB",
        total: 3,
      });

      // A rule reporting several violations supplies its whole set, and one
      // that reports a single violation supplies that single first entry; the
      // generated entry from the even-page rule follows in the complete report.
      assert.deepStrictEqual(keywords("all errors: several"), [
        "count",
        "evenPage",
        "count",
        "count",
      ]);
      assert.deepStrictEqual(keywords("first error: several"), ["count"]);
      assert.strictEqual(report("first error: several").errors.length, 1);
      assert.strictEqual(report("first error: several").errors[0].instancePath, "/count");
      assert.strictEqual(report("first error: several").errors[0].message, "must be positive");
    });
  }
}
