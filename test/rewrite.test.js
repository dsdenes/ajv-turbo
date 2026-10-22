"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "rewrite-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "rewrite-project");

test("formats, custom keywords, async validation, and rewriting options stay unchanged", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(reference.length, 6, "expected every fixture document to be validated");

  const byCase = new Map(reference.map((result) => [result.case, result]));

  const validProfile = byCase.get("profile.valid");
  assert.strictEqual(validProfile.valid, true);
  assert.strictEqual(validProfile.data.age, 30, "string coerced to an integer");
  assert.strictEqual(validProfile.data.port, 443, "custom keyword sees the coerced value");
  assert.strictEqual(validProfile.data.nickname, "anonymous", "default filled in");
  assert.strictEqual("extra" in validProfile.data, false, "additional property removed");
  assert.strictEqual(validProfile.errors, null);

  const invalidProfile = byCase.get("profile.invalid");
  assert.strictEqual(invalidProfile.valid, false);
  assert.ok(Array.isArray(invalidProfile.errors) && invalidProfile.errors.length > 0);
  assert.strictEqual("extra" in invalidProfile.data, false, "additional property removed before reporting");

  const validAccount = byCase.get("account.valid");
  assert.strictEqual(validAccount.settled, "resolved");
  assert.strictEqual(validAccount.data.seats, 3, "asynchronous validator resolves the coerced data");
  assert.strictEqual("extra" in validAccount.data, false, "additional property removed");
  assert.strictEqual(validAccount.errors, null);

  const invalidAccount = byCase.get("account.invalid");
  assert.strictEqual(invalidAccount.settled, "rejected");
  assert.ok(Array.isArray(invalidAccount.errors) && invalidAccount.errors.length > 0);
  assert.strictEqual(invalidAccount.errorsOnValidate, null, "async validators leave .errors null");

  assert.strictEqual(byCase.get("account.partial").settled, "rejected");
});
