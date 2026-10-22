"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "pass-context-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "pass-context-project");

// The project supplies its own context to every validation call and its rules
// decide validity from it. Running the unchanged project with ajv and then with
// this package in ajv's place must record the same context, return the same
// verdicts, and print the same reports and summaries through direct rules,
// rules reached through references, asynchronous rules, asynchronous schemas,
// compiled rules, macros, and the schema-less rule form.
test("a project's validation context reaches its custom rules exactly as ajv passes it", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

  const rows = new Map(reference.map((entry) => [`${entry.mode} ${entry.case}`, entry]));
  const row = (schema, label, contextKind, mode = "all errors") => {
    const key = `${mode} ${schema} ${label} ${contextKind}`;
    const entry = rows.get(key);
    assert.ok(entry, `missing case "${key}"`);
    return entry;
  };

  for (const mode of ["all errors", "first error"]) {
    assert.strictEqual(row("account", "account.valid", "matching", mode).valid, true);
    assert.deepStrictEqual(row("account", "account.valid", "matching", mode).calls, [
      "matching-context",
      "matching-context",
    ]);

    // The same document is invalid only because the supplied context differs.
    assert.strictEqual(row("account", "account.valid", "other", mode).valid, false);
    assert.deepStrictEqual(
      row("account", "account.valid", "other", mode).calls,
      mode === "all errors" ? ["other-context", "other-context"] : ["other-context"],
    );

    assert.strictEqual(row("account", "account.invalid", "matching", mode).valid, false);

    // The rule is reached only through a reference in both schemas.
    assert.strictEqual(row("route", "route.valid", "matching", mode).valid, true);
    assert.deepStrictEqual(row("route", "route.valid", "matching", mode).calls, ["matching-context"]);
    assert.strictEqual(row("route", "route.valid", "other", mode).valid, false);
    assert.strictEqual(row("route", "route.invalid", "matching", mode).valid, false);

    // Reference chains keep passing the same context at every boundary.
    assert.strictEqual(row("gateway", "account.valid", "matching", mode).valid, true);
    assert.deepStrictEqual(row("gateway", "account.valid", "matching", mode).calls, [
      "matching-context",
      "matching-context",
    ]);
    assert.strictEqual(row("gateway", "account.valid", "other", mode).valid, false);
    assert.strictEqual(row("gateway", "account.valid", "none", mode).valid, false);

    // Asynchronous rule in an asynchronous schema, direct and through a ref.
    for (const schemaName of ["async-service", "async-account", "async-gateway"]) {
      assert.strictEqual(row(schemaName, "async.valid", "matching", mode).valid, true);
      assert.deepStrictEqual(row(schemaName, "async.valid", "matching", mode).calls, [
        "matching-context",
        "matching-context",
      ]);
      assert.strictEqual(row(schemaName, "async.valid", "other", mode).valid, false);
      assert.strictEqual(row(schemaName, "async.valid", "none", mode).valid, false);
      assert.strictEqual(row(schemaName, "async.invalid", "matching", mode).valid, false);
    }

    // Compiled and macro-defined rules observe the same context.
    assert.strictEqual(row("compiled", "tenant.valid", "matching", mode).valid, true);
    assert.deepStrictEqual(row("compiled", "tenant.valid", "matching", mode).calls, ["matching-context"]);
    assert.strictEqual(row("compiled", "tenant.valid", "other", mode).valid, false);

    assert.strictEqual(row("macro", "tenant.valid", "matching", mode).valid, true);
    assert.deepStrictEqual(row("macro", "tenant.valid", "matching", mode).calls, ["matching-context"]);
    assert.strictEqual(row("macro", "tenant.valid", "other", mode).valid, false);

    assert.strictEqual(row("form", "form.valid", "matching", mode).valid, true);
    assert.strictEqual(row("form", "form.valid", "other", mode).valid, false);

    // A call without a context reaches the rule with what ajv binds on a plain
    // call: the global object, never the context the project created.
    const unmatchedCalls = mode === "all errors" ? ["global", "global"] : ["global"];
    assert.deepStrictEqual(row("account", "account.valid", "none", mode).calls, unmatchedCalls);
    assert.deepStrictEqual(row("account", "account.valid", "undefined", mode).calls, unmatchedCalls);
    assert.deepStrictEqual(row("account", "account.valid", "null", mode).calls, unmatchedCalls);
    assert.strictEqual(row("account", "account.valid", "none", mode).valid, false);
  }

  // A project that does not enable context passing keeps receiving the Ajv
  // instance in its rules, and its verdicts and reports are unchanged.
  for (const contextKind of ["matching", "other", "none"]) {
    const entry = row("plain", "form.valid", contextKind, "no context passing");
    assert.deepStrictEqual(entry.calls, ["ajv-instance"]);
    assert.strictEqual(entry.valid, true);
    assert.strictEqual(entry.errors, null);
    assert.strictEqual(entry.text, "No errors");
  }

  // The context-only failures report exactly ajv's entries, in ajv's order.
  const contextFailure = row("account", "account.valid", "other");
  assert.deepStrictEqual(
    contextFailure.errors.map((error) => error.keyword),
    ["tenant", "tenantHandle"],
  );
  assert.strictEqual(
    contextFailure.text,
    'data/tenant must pass "tenant" keyword validation, ' +
      'data/profile/handle must pass "tenantHandle" keyword validation',
  );
});
