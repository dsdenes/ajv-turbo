"use strict";

const test = require("node:test");
const assert = require("node:assert");

// Each dialect entry point reports schema comments the way ajv does: when the
// project enables `$comment`, every schema the validation reaches reports its
// text through the configured channel, in ajv's order and at ajv's schema
// path; a location the validation does not reach reports nothing.

const dialects = {
  "draft-07": {reference: require("ajv-reference"), replacement: require("../")},
  "2019-09": {
    reference: require("ajv-reference/dist/2019"),
    replacement: require("../dist/2019"),
  },
  "2020-12": {
    reference: require("ajv-reference/dist/2020"),
    replacement: require("../dist/2020"),
  },
};

function rootName(root, schema) {
  if (root === schema) return "root";
  if (root && typeof root.$id === "string") return root.$id;
  return "other";
}

// Runs one schema/document with ajv and once with the replacement. Comments
// are collected through the callback (or the logger for `$comment: true`),
// together with the verdict and report ajv produces for the same input.
async function run(Ajv, schema, document, options, setup) {
  const comments = [];
  const logged = [];
  const logger = {
    log: (...args) => logged.push(args),
    warn() {},
    error() {},
  };
  const callback = (comment, schemaPath, root) =>
    comments.push({comment, schemaPath, root: rootName(root, schema)});
  const settings = {strict: false, validateSchema: false, logger, ...options};
  if (settings.$comment === "callback") settings.$comment = callback;
  const ajv = new Ajv(settings);
  if (setup) setup(ajv);
  const validate = ajv.compile(schema);
  const result = validate(document);
  let valid;
  if (result && typeof result.then === "function") {
    try {
      await result;
      valid = true;
    } catch {
      valid = false;
    }
  } else {
    valid = result;
  }
  return {
    valid,
    errors: validate.errors === null ? null : JSON.parse(JSON.stringify(validate.errors)),
    comments,
    logged,
  };
}

async function assertParity(name, schema, document, options = {}, setup) {
  const withCallback = {...options, $comment: "callback"};
  for (const [dialect, {reference, replacement}] of Object.entries(dialects)) {
    const expected = await run(reference, schema, document, withCallback, setup);
    const actual = await run(replacement, schema, document, withCallback, setup);
    assert.deepStrictEqual(actual, expected, `${dialect}: ${name}`);
  }
}

test("reached schemas report their comments in ajv's order and at ajv's paths", async () => {
  const schema = {
    $comment: "root",
    type: "object",
    properties: {
      a: {$comment: "a", type: "integer"},
      b: {
        $comment: "b",
        type: "object",
        properties: {c: {$comment: "c", type: "integer"}},
      },
      d: {$comment: "d-only"},
      unreached: {$comment: "never", type: "integer"},
    },
    if: {$comment: "condition", required: ["flag"]},
    then: {$comment: "then", properties: {flag: {$comment: "flag", const: true}}},
    else: {$comment: "else", properties: {flag: {$comment: "noflag", type: "string"}}},
    allOf: [{$comment: "allOf", required: ["x"]}],
    anyOf: [
      {$comment: "anyOf0", required: ["one"]},
      {$comment: "anyOf1", required: ["two"]},
    ],
  };

  await assertParity("reached and unreached properties", schema, {
    a: 1,
    b: {c: 2},
    d: true,
    flag: true,
    x: 1,
    one: 1,
  });
  await assertParity("only the first matching anyOf branch", schema, {a: 1, x: 1, one: 1});
  await assertParity("else branch", schema, {flag: "text"});
  await assertParity("failing document", schema, {a: "x", b: {c: "y"}, flag: true, x: 1});

  const result = await run(dialects["draft-07"].reference, schema, {a: 1, x: 1, one: 1}, {
    $comment: "callback",
  });
  const paths = result.comments.map((entry) => entry.schemaPath);
  assert.ok(paths.includes("#/properties/a/$comment"));
  assert.ok(!paths.includes("#/properties/unreached/$comment"), "unreached property reported");
  assert.ok(!paths.includes("#/properties/b/$comment"), "absent property reported");
  assert.ok(result.comments.every((entry) => entry.root === "root"));
});

test("the logger receives ajv's comments when $comment is true", async () => {
  const schema = {
    $comment: "root",
    type: "object",
    properties: {a: {$comment: "a", type: "integer"}},
  };
  for (const [dialect, {reference, replacement}] of Object.entries(dialects)) {
    for (const document of [{a: 1}, {a: "x"}]) {
      const expected = await run(reference, schema, document, {$comment: true});
      const actual = await run(replacement, schema, document, {$comment: true});
      assert.deepStrictEqual(actual, expected, `${dialect}: ${JSON.stringify(document)}`);
      assert.deepStrictEqual(actual.logged, [["root"], ["a"]]);
    }
  }
});

test("references report the root and path of the environment ajv compiles", async () => {
  const base = {$comment: "base", type: "integer"};
  const other = {$comment: "other", $ref: "#/$defs/base"};
  const schema = {
    $comment: "root",
    $defs: {base, other},
    type: "object",
    properties: {
      inline: {$ref: "#/$defs/base"},
      compiled: {$ref: "#/$defs/other"},
    },
  };
  await assertParity("local references", schema, {inline: 1, compiled: 2});
});

test("a registered schema reached through $ref names the referencing root", async () => {
  const registered = {$comment: "registered", type: "integer"};
  const schema = {$comment: "root", $ref: "http://example.test/registered"};
  const setup = (ajv) => ajv.addSchema(registered, "http://example.test/registered");
  await assertParity("registered reference", schema, 1, {}, setup);
  await assertParity("registered reference", schema, "x", {}, setup);
});

test("dialect-specific applicators report their comments", async (t) => {
  const cases = {
    "draft-07": [
      {
        name: "dependencies, additionalItems, and contains",
        schema: {
          $comment: "root",
          type: "object",
          properties: {
            list: {
              $comment: "list",
              type: "array",
              items: [{$comment: "tuple"}],
              additionalItems: {$comment: "extra", type: "integer"},
            },
            values: {
              $comment: "values",
              type: "array",
              contains: {$comment: "contains", type: "integer"},
            },
          },
          dependencies: {a: {$comment: "dependency", required: ["b"]}},
        },
        document: {a: 1, b: 2, list: [1, 2], values: [1]},
      },
    ],
    "2019-09": [
      {
        name: "recursive and dependent schemas",
        schema: {
          $comment: "root",
          $recursiveAnchor: true,
          type: "object",
          properties: {child: {$recursiveRef: "#"}},
          dependentSchemas: {tag: {$comment: "dependent", required: ["value"]}},
          unevaluatedProperties: {$comment: "unevaluated", required: ["z"]},
        },
        document: {child: {child: {}}, tag: 1, value: 2},
      },
    ],
    "2020-12": [
      {
        name: "prefixItems and dynamic references",
        schema: {
          $comment: "root",
          $dynamicAnchor: "node",
          type: "object",
          properties: {
            list: {
              $comment: "list",
              type: "array",
              prefixItems: [{$comment: "prefix"}],
              unevaluatedItems: {$comment: "unevaluated", type: "integer"},
            },
            next: {$comment: "next", $dynamicRef: "#node"},
          },
        },
        document: {next: {next: {list: [1, 2]}}},
      },
    ],
  };

  for (const [dialect, entries] of Object.entries(cases)) {
    for (const entry of entries) {
      const expected = await run(dialects[dialect].reference, entry.schema, entry.document, {
        $comment: "callback",
      });
      const actual = await run(dialects[dialect].replacement, entry.schema, entry.document, {
        $comment: "callback",
      });
      assert.deepStrictEqual(actual, expected, `${dialect}: ${entry.name}`);
      assert.ok(actual.comments.length >= 2, `${dialect}: ${entry.name} reported no comments`);
    }
  }
});

test("without the option nothing is reported and verdicts are unchanged", async () => {
  const schema = {
    $comment: "root",
    type: "object",
    properties: {a: {$comment: "a", type: "integer"}},
  };
  for (const [dialect, {reference, replacement}] of Object.entries(dialects)) {
    for (const document of [{a: 1}, {a: "x"}]) {
      const expected = await run(reference, schema, document, {});
      const actual = await run(replacement, schema, document, {});
      assert.deepStrictEqual(actual, expected, `${dialect}: ${JSON.stringify(document)}`);
      assert.deepStrictEqual(actual.comments, []);
      assert.deepStrictEqual(actual.logged, []);
    }
  }
});

test("asynchronous validation reports the comments it reaches", async () => {
  const schema = {
    $async: true,
    $comment: "async root",
    type: "object",
    properties: {a: {$comment: "async a", type: "integer"}},
  };
  for (const [dialect, {reference, replacement}] of Object.entries(dialects)) {
    for (const document of [{a: 1}, {a: "x"}]) {
      const expected = await run(reference, schema, document, {$comment: "callback"});
      const actual = await run(replacement, schema, document, {$comment: "callback"});
      assert.deepStrictEqual(actual, expected, `${dialect}: ${JSON.stringify(document)}`);
      assert.deepStrictEqual(actual.comments.map((entry) => entry.comment), ["async root", "async a"]);
    }
  }
});
