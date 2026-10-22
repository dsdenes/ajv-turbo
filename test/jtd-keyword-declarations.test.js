"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "jtd-keyword-declarations-project");

// The project registers JSON Type Definition keywords that use every optional
// declaration ajv honours beyond a plain rule or macro: a rule prepared once
// per schema location, a value schema, placement before another keyword and
// after all of them, names the keyword stands in for, and companion keywords.
// Running the unchanged project with ajv and then with this package in ajv's
// place must produce identical preparation counts, verdicts, reports, summary
// text, and compile-time refusals. Keywords are used where ajv's JSON Type
// Definition meta-schema admits them (inside `metadata`) and, with
// `validateSchema: false`, beside the built-in keywords.
test("a JTD project with optional keyword declarations runs unchanged", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const workProject = path.join(ROOT, ".tmp", "jtd-keyword-declarations-project");
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, workProject);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");

  const byCase = new Map(reference.map((row) => [row.case, row]));
  const row = (name) => {
    const found = byCase.get(name);
    assert.ok(found, `missing case "${name}"`);
    return found;
  };
  const keywords = (name) => row(name).errors.map((error) => error.keyword);

  // The rule is prepared once per schema location, never per document.
  assert.strictEqual(row("preparation count").count, 1);
  assert.deepStrictEqual(row("preparation count").values, [3, 5]);
  assert.strictEqual(row("two locations count").count, 2);

  assert.strictEqual(row("prepared rule valid").valid, true);
  assert.strictEqual(row("prepared rule rule fails").valid, false);
  assert.deepStrictEqual(row("prepared rule rule fails").errors, [
    {
      instancePath: "",
      schemaPath: "/metadata/multiple",
      keyword: "multiple",
      params: {},
      message: 'must pass "multiple" keyword validation',
    },
  ]);
  assert.strictEqual(
    row("prepared rule rule fails").text,
    'data must pass "multiple" keyword validation',
  );
  assert.strictEqual(row("two locations second odd").valid, false);
  assert.strictEqual(
    row("two locations second odd").errors[0].schemaPath,
    "/properties/b/metadata/even",
  );

  // A prepared rule's own entries reach the report at the keyword's location.
  assert.strictEqual(row("prepared rule errors valid").valid, true);
  assert.deepStrictEqual(row("prepared rule errors fails").errors, [
    {
      keyword: "divisible",
      params: {divisor: 3, remainder: 1},
      message: "must be divisible by 3",
      instancePath: "/n",
      schemaPath: "/properties/n/metadata/divisible",
    },
  ]);
  assert.strictEqual(
    row("prepared rule errors fails").text,
    "data/n must be divisible by 3",
  );

  // A keyword value that does not fit its schema is refused while the schema
  // is compiled, with ajv's path and reason; conforming values compile.
  assert.strictEqual(row("value schema accepted valid").valid, true);
  assert.strictEqual(row("value schema 0").error, null);
  for (const name of [
    'value schema 70000',
    'value schema -1',
    'value schema "8080"',
    'value schema null',
    'value schema {"type":"integer","minimum":1}',
  ]) {
    assert.strictEqual(
      row(name).error,
      'keyword "port" value is invalid at path "/metadata": data must be uint16',
      name,
    );
  }
  assert.strictEqual(
    row("value schema nested").error,
    'keyword "port" value is invalid at path "/properties/p/metadata": data must be uint16',
  );
  // A value schema written with another dialect's keywords is refused when
  // the definition is registered.
  assert.match(row("value schema dialect").error, /^schema is invalid: /);
  // Options that rewrite a document do not apply to a keyword's value.
  assert.strictEqual(
    row("value schema additional").error,
    'keyword "shape" value is invalid at path "/metadata": ' +
      "data/c must NOT have additional properties",
  );
  assert.strictEqual(row("value schema without additional").error, null);

  // Placement: `first` runs before `second`, `last` runs after every keyword,
  // and a keyword declared before a built-in reports before it.
  assert.deepStrictEqual(keywords("all errors metadata placement all fail"), [
    "first",
    "second",
    "last",
  ]);
  assert.deepStrictEqual(keywords("all errors metadata placement first passes"), [
    "second",
    "last",
  ]);
  assert.deepStrictEqual(keywords("all errors metadata placement first and second pass"), [
    "last",
  ]);
  assert.deepStrictEqual(keywords("first error metadata placement all fail"), ["first"]);
  assert.deepStrictEqual(keywords("first error metadata placement first passes"), ["second"]);
  assert.deepStrictEqual(keywords("first error metadata placement first and second pass"), [
    "last",
  ]);
  assert.deepStrictEqual(keywords("all errors builtin placement owner and type fail"), [
    "owner",
    "type",
    "approved",
  ]);
  assert.deepStrictEqual(keywords("first error builtin placement owner and type fail"), ["owner"]);
  assert.deepStrictEqual(keywords("all errors builtin placement post fails"), ["approved"]);
  assert.strictEqual(
    row("all errors typed post").error,
    'keyword with "post" flag cannot have "type"',
  );

  // Stand-in names: the declared name runs the owner's rule; a stand-in name
  // alone is an annotation, and beside another keyword it runs that rule.
  assert.strictEqual(row("stand-in declared name fails").valid, false);
  assert.strictEqual(row("stand-in declared name fails").errors[0].keyword, "bounded");
  assert.strictEqual(row("stand-in name alone valid").valid, true);
  assert.strictEqual(row("stand-in name alone valid").errors, null);
  assert.strictEqual(row("stand-in name with another keyword fails owner").valid, false);
  assert.strictEqual(
    row("stand-in name with another keyword fails owner").errors[0].keyword,
    "bounded",
  );
  assert.strictEqual(row("stand-in beside builtin fails").valid, false);
  assert.strictEqual(row("stand-in beside builtin fails").errors[0].schemaPath, "/bounded");
  assert.strictEqual(row("stand-in declared again").error, "Keyword lowerBound is already defined");

  // Required companions: the keyword is refused at compile time without both
  // of them, and validates normally with them.
  for (const metadata of ['{"owned":true}', '{"owned":true,"tenant":"t"}', '{"owned":true,"role":"r"}']) {
    assert.strictEqual(
      row(`companions ${metadata}`).error,
      "parent schema must have dependencies of owned: tenant,role",
    );
  }
  assert.strictEqual(row("companions present valid").valid, true);
  assert.strictEqual(row("companions present wrong type").valid, false);

  // A project that registers no custom keyword keeps ajv's built-in reports.
  assert.strictEqual(row("regression valid").valid, true);
  assert.strictEqual(row("regression missing").errors[0].keyword, "properties");
  assert.strictEqual(row("regression wrong type").errors[0].schemaPath, "/properties/name/type");
  assert.strictEqual(row("regression extra").errors[0].params.error, "additional");
});
