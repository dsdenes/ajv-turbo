"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const {runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "strict-project");
const WORK_PROJECT = path.join(__dirname, "..", ".tmp", "strict-project");

const DIALECTS = ["draft7", "2019", "2020"];

test("an ajv project's strict-mode vocabulary decisions run unchanged", () => {
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  // Every outcome — refusal, logger output, verdict, report, and rewritten
  // document — matches ajv for the same schema and settings.
  assert.deepStrictEqual(replacement, reference);

  const find = (dialect, kind, name, setting) => {
    const result = reference.find(
      (line) =>
        line.dialect === dialect &&
        line.kind === kind &&
        line.case === name &&
        line.setting === setting,
    );
    assert.ok(result, `missing ${dialect}/${kind}/${name}/${setting}`);
    return result;
  };

  // The fixture covers every keyword position, every dialect-specific
  // keyword, every strictness setting, formats, registration, and unaffected
  // validation.
  assert.strictEqual(
    reference.filter((line) => line.case === "unreferencedDefinition").length,
    DIALECTS.length,
  );
  for (const dialect of DIALECTS) {
    const positions = reference.filter(
      (line) => line.dialect === dialect && line.setting === "default" && line.kind === "compile",
    );
    assert.strictEqual(positions.length, 35, `${dialect} exercises every keyword position`);
  }

  // Every strictness decision and every setting that governs it is exercised.
  assert.strictEqual(reference.filter((line) => line.kind === "misplaced").length, 54);
  assert.strictEqual(reference.filter((line) => line.kind === "overlap").length, 18);
  assert.strictEqual(reference.filter((line) => line.kind === "required").length, 30);
  assert.strictEqual(reference.filter((line) => line.kind === "diagnostics").length, 45);

  for (const dialect of DIALECTS) {
    for (const [name, expected] of [
      ["root", 'strict mode: unknown keyword: "note"'],
      ["properties", 'strict mode: unknown keyword: "note"'],
      ["patternProperties", 'strict mode: unknown keyword: "note"'],
      ["additionalProperties", 'strict mode: unknown keyword: "note"'],
      ["propertyNames", 'strict mode: unknown keyword: "note"'],
      ["dependencies", 'strict mode: unknown keyword: "note"'],
      ["items", 'strict mode: unknown keyword: "note"'],
      ["contains", 'strict mode: unknown keyword: "note"'],
      ["allOf", 'strict mode: unknown keyword: "note"'],
      ["anyOf", 'strict mode: unknown keyword: "note"'],
      ["oneOf", 'strict mode: unknown keyword: "note"'],
      ["not", 'strict mode: unknown keyword: "note"'],
      ["if", 'strict mode: unknown keyword: "note"'],
      ["then", 'strict mode: unknown keyword: "note"'],
      ["else", 'strict mode: unknown keyword: "note"'],
      ["referenced", 'strict mode: unknown keyword: "note"'],
      ["defsReferenced", 'strict mode: unknown keyword: "note"'],
      ["unreferencedDefinition", null],
    ]) {
      assert.strictEqual(find(dialect, "compile", name, "default").error?.message ?? null, expected);
    }
  }

  // Keywords owned by another dialect are refused only where ajv refuses them.
  const otherDialect = {
    crossPrefixItems: {draft7: "prefixItems", "2019": "prefixItems", "2020": null},
    crossDependentRequired: {draft7: "dependentRequired", "2019": null, "2020": null},
    crossUnevaluatedProperties: {draft7: "unevaluatedProperties", "2019": null, "2020": null},
    crossUnevaluatedItems: {draft7: "unevaluatedItems", "2019": null, "2020": null},
  };
  for (const [name, byDialect] of Object.entries(otherDialect)) {
    for (const dialect of DIALECTS) {
      const line = find(dialect, "compile", name, "default");
      const keyword = byDialect[dialect];
      if (keyword === null) {
        assert.strictEqual(line.error, null, `${dialect} accepts ${name}`);
        assert.ok(line.verdicts.length > 0, `${dialect} validates ${name}`);
      } else {
        assert.strictEqual(line.error?.message, `strict mode: unknown keyword: "${keyword}"`);
      }
    }
  }

  // Unknown formats are refused, nested formats report ajv's path, and a
  // registered format compiles and judges documents.
  for (const dialect of DIALECTS) {
    assert.strictEqual(
      find(dialect, "compile", "unknown-format", "default").error?.message,
      'unknown format "not-registered" ignored in schema at path "#"',
    );
    assert.strictEqual(
      find(dialect, "compile", "unknown-format-nested", "default").error?.message,
      'unknown format "not-registered" ignored in schema at path "#/properties/a"',
    );
    assert.strictEqual(
      find(dialect, "compile", "both", "default").error?.message,
      'strict mode: unknown keyword: "note"',
    );
    const registered = find(dialect, "compile", "registered-format", "default");
    assert.strictEqual(registered.error, null);
    assert.deepStrictEqual(
      registered.verdicts.map((verdict) => verdict.valid),
      [true, false],
    );
    assert.strictEqual(find(dialect, "compile", "registered-format-option", "default").error, null);
    assert.strictEqual(find(dialect, "compile", "format-added-before-compile", "default").error, null);
  }

  // Reporting keeps the schema and sends ajv's diagnostic through the
  // project's logger. As in ajv, a static unknown format is still refused when
  // only schema-keyword strictness reports, and disabling refusal logs it.
  for (const dialect of DIALECTS) {
    const reported = find(dialect, "compile", "unknown-keyword", "strict-log");
    assert.strictEqual(reported.error, null);
    assert.deepStrictEqual(reported.messages, [
      ["warn", 'strict mode: unknown keyword: "note"'],
    ]);
    assert.strictEqual(
      find(dialect, "compile", "unknown-keyword", "strict-schema-log").messages.length,
      1,
    );
    assert.strictEqual(
      find(dialect, "compile", "unknown-format", "strict-log").error?.message,
      'unknown format "not-registered" ignored in schema at path "#"',
    );
    const ignored = find(dialect, "compile", "unknown-format", "strict-off");
    assert.strictEqual(ignored.error, null);
    assert.deepStrictEqual(ignored.messages, [
      ["warn", 'unknown format "not-registered" ignored in schema at path "#"'],
      ["warn", 'unknown format "not-registered" ignored in schema at path "#"'],
    ]);
    const silenced = find(dialect, "compile", "unknown-keyword", "silenced-log");
    assert.strictEqual(silenced.error, null);
    assert.deepStrictEqual(silenced.messages, []);
    const silencedFormat = find(dialect, "compile", "unknown-format", "silenced-log");
    assert.strictEqual(silencedFormat.error?.message, 'unknown format "not-registered" ignored in schema at path "#"');
    assert.deepStrictEqual(silencedFormat.messages, []);
  }

  // With vocabulary strictness off and format checking off, the same schemas
  // compile with no refusal and no diagnostic.
  for (const dialect of DIALECTS) {
    for (const setting of ["strict-off-no-formats", "strict-schema-off-no-formats"]) {
      for (const name of ["unknown-keyword", "unknown-format", "both"]) {
        const line = find(dialect, "compile", name, setting);
        assert.strictEqual(line.error, null, `${dialect} ${name} ${setting} compiles`);
        assert.deepStrictEqual(line.messages, [], `${dialect} ${name} ${setting} logs nothing`);
      }
    }
    // Disabling format checking alone leaves the vocabulary decision in place.
    const formatOff = find(dialect, "compile", "unknown-format", "formats-off");
    assert.strictEqual(formatOff.error, null);
    assert.deepStrictEqual(formatOff.messages, []);
    assert.strictEqual(
      find(dialect, "compile", "unknown-keyword", "formats-off").error?.message,
      'strict mode: unknown keyword: "note"',
    );
    for (const setting of ["strict-off-no-formats", "strict-schema-off-no-formats"]) {
      const line = find(dialect, "compile", "registered-format", setting);
      assert.strictEqual(line.error, null);
      // With format checking off the rule is not generated, so the
      // unconstrained strings are both valid, exactly as for ajv.
      assert.deepStrictEqual(
        line.verdicts.map((verdict) => verdict.valid),
        [true, true],
      );
    }
  }

  // A keyword that cannot act where it is written is refused; with strict
  // schema checking off the same schema compiles and judges documents.
  for (const dialect of DIALECTS) {
    for (const name of [
      "additionalItemsBesideItems",
      "thenWithoutIf",
      "elseWithoutIf",
      "ifWithoutBranches",
      "minContainsWithoutContains",
      "maxContainsWithoutContains",
      "minContainsZeroWithoutMax",
      "minContainsAboveMax",
      "recursiveAnchorFalse",
    ]) {
      const refused = find(dialect, "misplaced", name, "default");
      assert.ok(
        refused.error !== null && refused.verdicts.length === 0,
        `${dialect} ${name} is refused`,
      );
      const off = find(dialect, "misplaced", name, "strict-schema-off");
      if (dialect === "2020" && name === "recursiveAnchorFalse") {
        // The 2020-12 meta-schema rejects the annotation outright.
        assert.ok(off.error !== null, "the meta-schema refuses the annotation");
      } else {
        assert.strictEqual(off.error, null, `${dialect} ${name} compiles`);
        assert.ok(off.verdicts.length > 0, `${dialect} ${name} validates documents`);
      }
    }
  }

  // A property declared directly and matched by a pattern is refused unless
  // the project allows the overlap, which then keeps ajv's verdicts.
  for (const dialect of DIALECTS) {
    assert.strictEqual(
      find(dialect, "overlap", "schema", "default").error?.message,
      "strict mode: property foo matches pattern ^f (use allowMatchingProperties)",
    );
    for (const setting of ["allowed", "allowed-first-error", "strict-schema-off"]) {
      const allowed = find(dialect, "overlap", "schema", setting);
      assert.strictEqual(allowed.error, null, `${dialect} ${setting}`);
      assert.strictEqual(allowed.verdicts.length, 3);
    }
    assert.deepStrictEqual(
      find(dialect, "overlap", "schema", "reported").messages,
      [["warn", "strict mode: property foo matches pattern ^f (use allowMatchingProperties)"]],
    );
    assert.deepStrictEqual(find(dialect, "overlap", "schema", "silenced").messages, []);
  }

  // Required names are checked against declarations and evaluated properties.
  for (const dialect of DIALECTS) {
    for (const setting of ["default", "enabled", "disabled", "silenced"]) {
      const evaluated = find(dialect, "required", "evaluated", setting);
      assert.strictEqual(evaluated.error, null, `${dialect} ${setting}`);
      assert.deepStrictEqual(evaluated.messages, []);
    }
    assert.strictEqual(
      find(dialect, "required", "missing", "enabled").error?.message,
      'strict mode: required property "absent" is not defined at "#" (strictRequired)',
    );
    for (const setting of ["default", "disabled", "silenced"]) {
      const quiet = find(dialect, "required", "missing", setting);
      assert.strictEqual(quiet.error, null);
      assert.deepStrictEqual(quiet.messages, []);
    }
    assert.strictEqual(
      find(dialect, "required", "missing", "reported").messages.length,
      1,
    );
  }

  // The type and tuple diagnostics are reported, refused, or ignored by their
  // own setting; reporting and refusal carry ajv's text.
  for (const dialect of DIALECTS) {
    for (const name of ["union", "tuple"]) {
      const reported = find(dialect, "diagnostics", name, "default");
      assert.strictEqual(reported.error, null, `${dialect} ${name}`);
      assert.strictEqual(reported.messages.length, 1, `${dialect} ${name} warns once`);
      assert.strictEqual(reported.messages[0][0], "warn");
      assert.strictEqual(
        find(dialect, "diagnostics", name, "refused").error?.message,
        reported.messages[0][1],
      );
      for (const setting of ["permitted", "silenced", "strict-off"]) {
        const quiet = find(dialect, "diagnostics", name, setting);
        assert.strictEqual(quiet.error, null);
        assert.deepStrictEqual(quiet.messages, []);
      }
    }
    assert.deepStrictEqual(
      find(dialect, "diagnostics", "union", "union-allowed").messages,
      [],
    );
    const ordered = find(dialect, "diagnostics", "ordered", "default");
    assert.strictEqual(ordered.error, null);
    assert.deepStrictEqual(
      ordered.messages.map((message) => message[1].split(" at ")[0]),
      [
        'strict mode: type "string" not allowed by context "object"',
        "strict mode: use allowUnionTypes to allow union type keyword",
        dialect === "2020"
          ? 'strict mode: "prefixItems" is 1-tuple, but minItems or maxItems/items are ' +
            "not specified or different"
          : 'strict mode: "items" is 1-tuple, but minItems or maxItems/additionalItems are ' +
            "not specified or different",
      ],
    );
  }

  // A registered custom keyword is part of the vocabulary, and the logger
  // interface is enforced.
  for (const dialect of DIALECTS) {
    assert.strictEqual(find(dialect, "compile", "custom-keyword", "default").error, null);
    assert.strictEqual(
      find(dialect, "compile", "invalid-logger", "default").error?.message,
      "logger must implement log, warn and error methods",
    );
  }

  // Schemas using only defined keywords compile and keep their verdicts,
  // reports, and rewritten documents.
  const acceptedVerdicts = {
    draft7: [true, false, false],
    "2019": [true, false, false],
    "2020": [true, false, false],
  };
  for (const dialect of DIALECTS) {
    const accepted = find(dialect, "accepted", "schema", "default");
    assert.strictEqual(accepted.error, null);
    assert.deepStrictEqual(
      accepted.verdicts.map((verdict) => verdict.valid),
      acceptedVerdicts[dialect],
    );
    for (const verdict of accepted.verdicts) {
      if (!verdict.valid) assert.ok(verdict.errors.length > 0);
    }
    assert.strictEqual(find(dialect, "accepted", "schema-all-errors", "default").error, null);
    assert.strictEqual(find(dialect, "accepted", "rewriting", "default").error, null);
    const registered = find(dialect, "registered", "accepted", "default");
    assert.strictEqual(registered.error, null);
    assert.deepStrictEqual(
      registered.verdicts.map((verdict) => verdict.valid),
      [true, false],
    );
    assert.strictEqual(
      find(dialect, "registered", "unknown-keyword", "default").error?.message,
      'strict mode: unknown keyword: "note"',
    );
  }
});
