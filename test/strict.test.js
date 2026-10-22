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
