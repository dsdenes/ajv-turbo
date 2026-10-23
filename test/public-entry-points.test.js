"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT} = require("./lib/project");
const REFERENCE = require.resolve("ajv-reference/package.json").replace(/package\.json$/, "");

// Every entry point ajv presents to a consumer at run time: the package root,
// its dialect and standalone entry points, the code-generation helpers it
// publishes for extension authors (and the modules those helpers re-export),
// the runtime helpers its generated validators require by path, the bundled
// meta-schemas, and the type-only modules that exist at run time as empty
// modules. `re2` is an optional peer: both packages fail to load it unless the
// consumer installed it, and that failure is part of the surface.
const ENTRY_POINTS = [
  "index.js",
  "dist/ajv.js",
  "dist/core.js",
  "dist/2019.js",
  "dist/2020.js",
  "dist/jtd.js",
  "dist/standalone.js",
  "dist/standalone/index.js",
  "dist/standalone/instance.js",
  "dist/compile/codegen.js",
  "dist/compile/codegen/code.js",
  "dist/compile/codegen/index.js",
  "dist/compile/codegen/scope.js",
  "dist/runtime/equal.js",
  "dist/runtime/parseJson.js",
  "dist/runtime/quote.js",
  "dist/runtime/re2.js",
  "dist/runtime/timestamp.js",
  "dist/runtime/ucs2length.js",
  "dist/runtime/uri.js",
  "dist/runtime/validation_error.js",
  "dist/refs/json-schema-2019-09/index.js",
  "dist/refs/json-schema-2020-12/index.js",
  "dist/refs/jtd-schema.js",
  "dist/types/index.js",
  "dist/types/json-schema.js",
  "dist/types/jtd-schema.js",
];

// Paths this package has always exposed as flat files but that ajv publishes
// only as directory entry points. Both resolve to the same module for a
// consumer, so they are compared against ajv's directory index.
const REFERENCE_ALIASES = {
  "index.js": "dist/ajv.js",
  "dist/standalone.js": "dist/standalone/index.js",
  "dist/compile/codegen.js": "dist/compile/codegen/index.js",
};

function referencePath(entry) {
  return path.join(REFERENCE, REFERENCE_ALIASES[entry] || entry);
}

function load(entry) {
  try {
    const module = require(path.join(ROOT, entry));
    return {
      exports: Object.fromEntries(
        Object.keys(module)
          .sort()
          .map((name) => [name, typeof module[name]]),
      ),
    };
  } catch (error) {
    return {error: error.code || error.message};
  }
}

function loadReference(entry) {
  try {
    const module = require(referencePath(entry));
    return {
      exports: Object.fromEntries(
        Object.keys(module)
          .sort()
          .map((name) => [name, typeof module[name]]),
      ),
    };
  } catch (error) {
    return {error: error.code || error.message};
  }
}

for (const entry of ENTRY_POINTS) {
  test(`${entry} exposes every ajv export with the same kind`, () => {
    const reference = loadReference(entry);
    const replacement = load(entry);

    assert.deepStrictEqual(replacement, reference);
  });
}

test("every entry point agrees on the code-generation helpers", () => {
  const codegen = require(path.join(ROOT, "dist/compile/codegen.js"));
  const code = require(path.join(ROOT, "dist/compile/codegen/code.js"));
  const scope = require(path.join(ROOT, "dist/compile/codegen/scope.js"));

  assert.strictEqual(codegen._, code._);
  assert.strictEqual(codegen.Name, code.Name);
  assert.strictEqual(codegen.nil, code.nil);
  assert.strictEqual(codegen.CodeGen, require(path.join(ROOT, "dist/compile/codegen/index.js")).CodeGen);
  assert.strictEqual(codegen.Scope, scope.Scope);
  assert.strictEqual(codegen.ValueScope, scope.ValueScope);
  assert.strictEqual(codegen.varKinds, scope.varKinds);

  for (const entry of [
    "index.js",
    "dist/ajv.js",
    "dist/core.js",
    "dist/2019.js",
    "dist/2020.js",
    "dist/jtd.js",
  ]) {
    const module = require(path.join(ROOT, entry));
    for (const name of ["_", "str", "stringify", "nil", "Name", "CodeGen"]) {
      assert.strictEqual(module[name], codegen[name], `${entry} exposes a different ${name}`);
    }
  }
});

test("the ESM entry exposes the same names as the CommonJS entry", async () => {
  const commonjs = require(path.join(ROOT, "index.js"));
  const esm = await import(path.join(ROOT, "index.mjs"));

  assert.deepStrictEqual(
    Object.keys(esm).sort(),
    Object.keys(commonjs).sort(),
  );
  for (const name of Object.keys(commonjs)) {
    assert.strictEqual(esm[name], commonjs[name], `ESM ${name} differs`);
  }
});

test("the $data meta-schema rewrite matches ajv's for both JSON Schema dialects", () => {
  for (const [entry, directory] of [
    ["2019", "json-schema-2019-09"],
    ["2020", "json-schema-2020-12"],
  ]) {
    const Reference = require(path.join(REFERENCE, `dist/${entry}.js`));
    const Replacement = require(path.join(ROOT, `dist/${entry}.js`));
    const schema = require(path.join(ROOT, `dist/refs/${directory}/schema.json`));

    assert.deepStrictEqual(
      new Replacement({$data: true, strict: false}).$dataMetaSchema(schema, ["/properties"]),
      new Reference({$data: true, strict: false}).$dataMetaSchema(schema, ["/properties"]),
    );
  }
});

test("the meta-schema modules register the same schemas", () => {
  for (const [directory, $data] of [
    ["json-schema-2019-09", false],
    ["json-schema-2019-09", true],
    ["json-schema-2020-12", false],
    ["json-schema-2020-12", true],
  ]) {
    const collect = (module) => {
      const added = [];
      module.default.call(
        {
          addMetaSchema(schema) {
            added.push(schema);
            return this;
          },
          $dataMetaSchema(schema, pointers) {
            return {pointers, schema};
          },
        },
        $data,
      );
      return added;
    };

    assert.deepStrictEqual(
      collect(require(path.join(ROOT, `dist/refs/${directory}/index.js`))),
      collect(require(path.join(REFERENCE, `dist/refs/${directory}/index.js`))),
    );
  }
});

test("the equality runtime helper decides equality the way ajv's does", () => {
  const equal = require(path.join(ROOT, "dist/runtime/equal.js")).default;
  const reference = require(path.join(REFERENCE, "dist/runtime/equal.js")).default;

  const values = [
    1,
    "a",
    true,
    null,
    undefined,
    NaN,
    new Date(0),
    new Date(1),
    /a/gi,
    /a/g,
    [1, [2, {x: 3}]],
    {a: 1, b: [2]},
    new Map([["a", 1]]),
    new Set([1, 2]),
    Object.create(null),
  ];
  for (const [leftIndex, left] of values.entries()) {
    for (const [rightIndex, right] of values.entries()) {
      assert.strictEqual(
        equal(left, right),
        reference(left, right),
        `values[${leftIndex}] and values[${rightIndex}] differ`,
      );
    }
  }
});
