"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const AjvReference = require("ajv-reference/dist/jtd");
const AjvReplacement = require("../dist/jtd");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "jtd-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "jtd-project");

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

// Every JSON Type Definition form ajv's dialect knows, plus schemas that
// combine forms and reach definitions through `ref`.
const CASES = [
  {name: "empty", schema: {}},
  {name: "type string", schema: {type: "string"}},
  {name: "type boolean", schema: {type: "boolean"}},
  {name: "type timestamp", schema: {type: "timestamp"}},
  {name: "type float32", schema: {type: "float32"}},
  {name: "type float64", schema: {type: "float64"}},
  {name: "type int8", schema: {type: "int8"}},
  {name: "type uint8", schema: {type: "uint8"}},
  {name: "type int16", schema: {type: "int16"}},
  {name: "type uint16", schema: {type: "uint16"}},
  {name: "type int32", schema: {type: "int32"}},
  {name: "type uint32", schema: {type: "uint32"}},
  {name: "enumeration", schema: {enum: ["a", "b"]}},
  {name: "enumeration nullable", schema: {enum: ["a"], nullable: true}},
  {name: "nullable type", schema: {type: "string", nullable: true}},
  {name: "elements", schema: {elements: {type: "string"}}},
  {name: "elements nullable", schema: {elements: {type: "string"}, nullable: true}},
  {name: "elements of empty schemas", schema: {elements: {}}},
  {name: "nested elements", schema: {elements: {elements: {type: "int8"}}}},
  {name: "properties", schema: {properties: {x: {type: "string"}}}},
  {name: "properties with optional members", schema: {properties: {x: {type: "string"}}, optionalProperties: {y: {type: "int8"}}}},
  {name: "optional properties", schema: {optionalProperties: {y: {type: "int8"}}}},
  {name: "additional properties allowed", schema: {properties: {x: {type: "string"}}, additionalProperties: true}},
  {name: "properties with always-valid member", schema: {properties: {x: {}}}},
  {name: "properties nullable", schema: {properties: {x: {type: "string"}}, nullable: true}},
  {name: "nested properties", schema: {properties: {x: {properties: {y: {type: "string"}}}}}},
  {name: "values", schema: {values: {type: "string"}}},
  {name: "values of empty schemas", schema: {values: {}}},
  {name: "values nullable", schema: {values: {type: "string"}, nullable: true}},
  {name: "ref", schema: {definitions: {s: {type: "string"}}, ref: "s"}},
  {name: "ref nullable", schema: {definitions: {s: {type: "string"}}, ref: "s", nullable: true}},
  {name: "ref to nullable definition", schema: {definitions: {s: {type: "string", nullable: true}}, ref: "s"}},
  {name: "definitions only", schema: {definitions: {s: {type: "string"}}}},
  {
    name: "recursive ref",
    schema: {
      definitions: {node: {properties: {id: {type: "string"}}, optionalProperties: {children: {elements: {ref: "node"}}}}},
      ref: "node",
    },
  },
  {name: "ref chain", schema: {definitions: {a: {ref: "b"}, b: {type: "string"}}, ref: "a"}},
  {
    name: "discriminator",
    schema: {
      discriminator: "t",
      mapping: {a: {properties: {x: {type: "string"}}}, b: {properties: {y: {type: "int8"}}}},
    },
  },
  {
    name: "discriminator with optional members",
    schema: {discriminator: "t", mapping: {a: {optionalProperties: {x: {type: "string"}}}}},
  },
  {
    name: "discriminator allowing additional properties",
    schema: {
      discriminator: "t",
      mapping: {a: {properties: {x: {type: "string"}}, additionalProperties: true}},
    },
  },
  {
    name: "discriminator nullable",
    schema: {discriminator: "t", mapping: {a: {properties: {x: {type: "string"}}}}, nullable: true},
  },
  {name: "empty discriminator mapping", schema: {discriminator: "t", mapping: {}}},
  {name: "metadata union", schema: {metadata: {union: [{type: "string"}, {type: "int8"}]}}},
  {
    name: "metadata union of forms",
    schema: {metadata: {union: [{properties: {a: {type: "string"}}}, {values: {type: "int8"}}]}},
  },
  {name: "metadata with an empty union member", schema: {metadata: {union: [{}, {type: "string"}]}}},
  {name: "metadata empty", schema: {metadata: {}, type: "string"}},
  {name: "metadata in a subschema", schema: {properties: {x: {metadata: {union: [{type: "string"}]}}}}},
  {name: "metadata union nullable", schema: {metadata: {union: [{type: "string"}]}, nullable: true}},
  {
    name: "metadata union over a ref",
    schema: {
      definitions: {s: {type: "string"}},
      metadata: {union: [{ref: "s"}, {type: "int8"}]},
    },
  },
  {
    name: "combined forms",
    schema: {
      definitions: {stamp: {properties: {at: {type: "timestamp"}}, optionalProperties: {zone: {enum: ["utc", "local"]}}}},
      properties: {name: {type: "string"}, stamps: {elements: {ref: "stamp"}}},
      optionalProperties: {labels: {values: {type: "string"}}, note: {type: "string", nullable: true}},
    },
  },
  {
    name: "discriminator over a recursive definition",
    schema: {
      definitions: {
        tree: {
          discriminator: "kind",
          mapping: {
            leaf: {properties: {value: {type: "int8"}}},
            branch: {
              properties: {left: {ref: "tree"}, right: {ref: "tree"}},
            },
          },
        },
      },
      ref: "tree",
    },
  },
];

const DOCUMENTS = [
  undefined,
  null,
  true,
  false,
  0,
  1,
  -1,
  1.5,
  127,
  128,
  -128,
  -129,
  255,
  256,
  65535,
  65536,
  2147483647,
  3000000000,
  "",
  "a",
  "b",
  "abc",
  "2020-01-01T00:00:00Z",
  "2020-01-01",
  "nope",
  [],
  [1],
  ["a"],
  [1, "a"],
  [null],
  [[1]],
  [{}],
  {},
  {x: 1},
  {x: "a"},
  {y: 1},
  {x: "a", y: 1},
  {x: 1, y: "a"},
  {x: "a", z: 1},
  {t: "a"},
  {t: "a", x: "s"},
  {t: "b", y: 1},
  {t: "c"},
  {t: 5},
  {a: 1, b: 2},
  {k1: {a: "s"}, k2: {a: 1}},
  {kind: "leaf", value: 1},
  {kind: "branch", left: {kind: "leaf", value: 1}, right: {kind: "leaf", value: "x"}},
  {name: "a", stamps: [{at: "2020-01-01T00:00:00Z"}], labels: {k: "v"}},
  {name: 1, stamps: [{at: "nope", zone: "nowhere"}], labels: {k: 1}, note: 2},
];

function outcome(validate, document) {
  const data = clone(document);
  const valid = validate(data);
  return {valid, errors: validate.errors, data};
}

for (const [mode, options] of [
  ["default report", {}],
  ["complete report", {allErrors: true}],
  ["additional properties removed", {removeAdditional: true}],
]) {
  test(`JSON Type Definition verdicts and reports match ajv (${mode})`, () => {
    const oracle = new AjvReference(clone(options));
    const replacement = new AjvReplacement(clone(options));
    let compared = 0;
    for (const testCase of CASES) {
      const validateOracle = oracle.compile(clone(testCase.schema));
      const validateReplacement = replacement.compile(clone(testCase.schema));
      for (const document of DOCUMENTS) {
        compared++;
        const expected = outcome(validateOracle, document);
        const actual = outcome(validateReplacement, document);
        const context = JSON.stringify({testCase: testCase.name, document});
        assert.deepStrictEqual(actual, expected, context);
        assert.strictEqual(
          replacement.errorsText(actual.errors),
          oracle.errorsText(expected.errors),
          context,
        );
      }
    }
    assert.strictEqual(compared, CASES.length * DOCUMENTS.length);
  });
}

test("every JSON Type Definition form produces ajv's verdicts", () => {
  const ajv = new AjvReplacement();
  const checks = [
    ["empty schema", {}, {anything: true}, true],
    ["single type", {type: "string"}, "a", true],
    ["single type", {type: "string"}, 1, false],
    ["integer range", {type: "int8"}, 127, true],
    ["integer range", {type: "int8"}, 128, false],
    ["timestamp", {type: "timestamp"}, "2020-01-01T00:00:00Z", true],
    ["timestamp", {type: "timestamp"}, "2020-01-01", false],
    ["enumeration", {enum: ["a", "b"]}, "b", true],
    ["enumeration", {enum: ["a", "b"]}, "c", false],
    ["elements", {elements: {type: "int8"}}, [1, 2], true],
    ["elements", {elements: {type: "int8"}}, [1, "a"], false],
    ["properties", {properties: {x: {type: "string"}}}, {x: "a"}, true],
    ["properties", {properties: {x: {type: "string"}}}, {}, false],
    ["optional properties", {optionalProperties: {x: {type: "string"}}}, {}, true],
    ["optional properties", {optionalProperties: {x: {type: "string"}}}, {y: 1}, false],
    ["additional properties", {properties: {x: {type: "string"}}, additionalProperties: true}, {x: "a", y: 1}, true],
    ["additional properties", {properties: {x: {type: "string"}}, additionalProperties: true}, {y: 1}, false],
    ["discriminator", {discriminator: "t", mapping: {a: {properties: {x: {type: "string"}}}}}, {t: "a", x: "s"}, true],
    ["discriminator", {discriminator: "t", mapping: {a: {properties: {x: {type: "string"}}}}}, {t: "b"}, false],
    ["dictionary", {values: {type: "string"}}, {k: "v"}, true],
    ["dictionary", {values: {type: "string"}}, {k: 1}, false],
    ["reference", {definitions: {s: {type: "string"}}, ref: "s"}, "a", true],
    ["reference", {definitions: {s: {type: "string"}}, ref: "s"}, 1, false],
    ["nullable", {type: "string", nullable: true}, null, true],
    ["nullable", {type: "string", nullable: true}, 1, false],
    ["metadata", {metadata: {union: [{type: "string"}, {type: "int8"}]}}, 1, true],
    ["metadata", {metadata: {union: [{type: "string"}, {type: "int8"}]}}, null, false],
  ];
  for (const [name, schema, document, expected] of checks) {
    const validate = ajv.compile(clone(schema));
    assert.strictEqual(validate(clone(document)), expected, `${name}: ${JSON.stringify(document)}`);
    assert.strictEqual(validate.errors === null, expected, `${name}: report for a valid document`);
  }

  const validate = ajv.compile({properties: {x: {type: "string"}}, optionalProperties: {y: {type: "int8"}}});
  assert.strictEqual(validate({x: 1, y: "a"}), false);
  assert.deepStrictEqual(validate.errors, [
    {
      instancePath: "/x",
      schemaPath: "/properties/x/type",
      keyword: "type",
      params: {type: "string", nullable: false},
      message: "must be string",
    },
  ]);
  const complete = new AjvReplacement({allErrors: true}).compile({properties: {x: {type: "string"}}});
  assert.strictEqual(complete({x: 1, z: 2}), false);
  assert.deepStrictEqual(complete.errors, [
    {
      instancePath: "/x",
      schemaPath: "/properties/x/type",
      keyword: "type",
      params: {type: "string", nullable: false},
      message: "must be string",
    },
    {
      instancePath: "/z",
      schemaPath: "",
      keyword: "properties",
      params: {error: "additional", additionalProperty: "z"},
      message: "must NOT have additional properties",
    },
  ]);
});

const MALFORMED = [
  {name: "unknown type", schema: {type: "nope"}},
  {name: "empty enumeration", schema: {enum: []}},
  {name: "duplicate enumeration", schema: {enum: ["a", "a"]}},
  {name: "non-string enumeration", schema: {enum: [1]}},
  {name: "overlapping members", schema: {properties: {x: {}}, optionalProperties: {x: {}}}},
  {
    name: "discriminator tag in properties",
    schema: {discriminator: "t", mapping: {a: {properties: {t: {type: "string"}}}}},
  },
  {
    name: "discriminator tag in optional properties",
    schema: {discriminator: "t", mapping: {a: {optionalProperties: {t: {type: "string"}}}}},
  },
  {
    name: "nullable inside a mapping",
    schema: {discriminator: "t", mapping: {a: {properties: {x: {type: "string"}}, nullable: true}}},
  },
  {name: "unknown definition", schema: {ref: "nope"}},
  {name: "unknown keyword", schema: {type: "string", foo: 1}},
  {name: "two forms", schema: {type: "string", enum: ["a"]}},
  {name: "metadata with an unknown keyword", schema: {metadata: {foo: 1}, type: "string"}},
  {name: "nested metadata", schema: {metadata: {metadata: {union: []}}}},
  {name: "metadata holding a form keyword", schema: {metadata: {type: "string"}}},
  {name: "additionalProperties outside a properties form", schema: {additionalProperties: true}},
  {name: "non-boolean nullable", schema: {type: "string", nullable: 5}},
  {name: "non-object elements", schema: {elements: "x"}},
  {name: "union outside metadata", schema: {union: [{type: "string"}]}},
  {name: "definitions in a subschema", schema: {elements: {definitions: {}}}},
  {
    name: "mapping member that is not a properties form",
    schema: {definitions: {a: {properties: {x: {type: "string"}}}}, discriminator: "t", mapping: {a: {ref: "a"}}},
  },
  {name: "array schema", schema: []},
  {name: "boolean schema", schema: true},
  {name: "number schema", schema: 5},
  {name: "null schema", schema: null},
  {name: "undefined schema", schema: undefined},
];

function capture(run) {
  try {
    return {value: run()};
  } catch (error) {
    return {error: `${error.constructor.name}: ${error.message}`};
  }
}

test("a malformed JSON Type Definition schema is rejected where and as ajv rejects it", () => {
  for (const {name, schema} of MALFORMED) {
    const oracle = new AjvReference();
    const replacement = new AjvReplacement();

    const oracleCompile = capture(() => {
      oracle.compile(clone(schema));
      return "compiled";
    });
    const replacementCompile = capture(() => {
      replacement.compile(clone(schema));
      return "compiled";
    });
    assert.ok(oracleCompile.error !== undefined, `${name}: ajv accepted the schema`);
    assert.deepStrictEqual(replacementCompile, oracleCompile, name);

    const oracleSchema = capture(() => {
      const valid = oracle.validateSchema(clone(schema));
      return {valid, errors: oracle.errors, text: oracle.errorsText()};
    });
    const replacementSchema = capture(() => {
      const valid = replacement.validateSchema(clone(schema));
      return {valid, errors: replacement.errors, text: replacement.errorsText()};
    });
    assert.deepStrictEqual(replacementSchema, oracleSchema, name);

    const oracleAdd = capture(() => {
      oracle.addSchema(clone(schema), "malformed");
      return "added";
    });
    const replacementAdd = capture(() => {
      replacement.addSchema(clone(schema), "malformed");
      return "added";
    });
    assert.deepStrictEqual(replacementAdd, oracleAdd, name);
  }
});

const ASYNC_CASES = [
  {name: "asynchronous root", schema: {type: "string", $async: true}},
  {name: "asynchronous members", schema: {$async: true, properties: {x: {type: "string"}}, optionalProperties: {y: {type: "int8"}}}},
  {name: "asynchronous subschema", schema: {$async: true, properties: {x: {$async: true, type: "int8"}}}},
  {name: "asynchronous definition", schema: {$async: true, definitions: {s: {ref: "t"}, t: {type: "string"}}, ref: "s"}},
];

const SYNC_WITH_ASYNC = [
  {name: "asynchronous subschema in a sync schema", schema: {properties: {x: {$async: true, type: "string"}}}},
  {name: "asynchronous definition in a sync schema", schema: {definitions: {s: {$async: true, type: "string"}}, ref: "s"}},
  {
    name: "asynchronous definition with a reference in a sync schema",
    schema: {definitions: {s: {$async: true, properties: {x: {ref: "t"}}}, t: {type: "string"}}, ref: "s"},
  },
];

async function settle(validate, document) {
  const data = clone(document);
  try {
    const result = validate(data);
    if (result instanceof Promise) return {async: true, resolved: await result, errors: validate.errors};
    return {async: false, valid: result, errors: validate.errors, data};
  } catch (error) {
    return {rejected: error.constructor.name, errors: error.errors, validation: error.validation};
  }
}

test("an asynchronous JSON Type Definition schema settles to ajv's outcome and report", async () => {
  for (const options of [{validateSchema: false}, {validateSchema: false, allErrors: true}]) {
    const oracle = new AjvReference(clone(options));
    const replacement = new AjvReplacement(clone(options));
    for (const testCase of ASYNC_CASES) {
      const validateOracle = oracle.compile(clone(testCase.schema));
      const validateReplacement = replacement.compile(clone(testCase.schema));
      assert.strictEqual(validateReplacement.$async, validateOracle.$async, testCase.name);
      for (const document of ["a", 1, null, {}, {x: 1}, {x: "a"}, {x: "a", y: 1}]) {
        assert.deepStrictEqual(
          await settle(validateReplacement, document),
          await settle(validateOracle, document),
          JSON.stringify({testCase: testCase.name, document}),
        );
      }
    }
  }
});

test("an asynchronous JSON Type Definition subschema is rejected where ajv rejects it", () => {
  for (const {name, schema} of SYNC_WITH_ASYNC) {
    const oracle = new AjvReference({validateSchema: false});
    const replacement = new AjvReplacement({validateSchema: false});
    const oracleCompile = capture(() => {
      oracle.compile(clone(schema));
      return "compiled";
    });
    const replacementCompile = capture(() => {
      replacement.compile(clone(schema));
      return "compiled";
    });
    assert.ok(oracleCompile.error !== undefined, `${name}: ajv accepted the schema`);
    assert.deepStrictEqual(replacementCompile, oracleCompile, name);
  }
});

test("the JSON Type Definition entry point keeps ajv's registry behaviour", () => {
  const oracle = new AjvReference();
  const replacement = new AjvReplacement();

  const schema = {properties: {x: {type: "string"}}};
  oracle.addSchema(clone(schema), "member");
  replacement.addSchema(clone(schema), "member");
  const oracleRegistered = oracle.getSchema("member");
  const replacementRegistered = replacement.getSchema("member");
  assert.strictEqual(typeof replacementRegistered, "function");
  for (const document of [{x: "a"}, {x: 1}, {}]) {
    assert.deepStrictEqual(outcome(replacementRegistered, document), outcome(oracleRegistered, document));
  }
  assert.strictEqual(typeof replacement.getSchema("JTD-meta-schema"), "function");
  assert.strictEqual(replacement.defaultMeta(), oracle.defaultMeta());
  assert.strictEqual(replacement.getSchema("missing"), undefined);

  assert.strictEqual(replacement.validate(clone(schema), {x: "a"}), oracle.validate(clone(schema), {x: "a"}));
  assert.strictEqual(replacement.validate(clone(schema), {}), oracle.validate(clone(schema), {}));
  assert.strictEqual(replacement.errorsText(), oracle.errorsText());

  let oracleError = null;
  try {
    oracle.addSchema(clone(schema), "member");
  } catch (error) {
    oracleError = error.message;
  }
  let replacementError = null;
  try {
    replacement.addSchema(clone(schema), "member");
  } catch (error) {
    replacementError = error.message;
  }
  assert.strictEqual(replacementError, oracleError);

  replacement.removeSchema("member");
  assert.strictEqual(replacement.getSchema("member"), undefined);
  assert.strictEqual(typeof replacement.getSchema("JTD-meta-schema"), "function");
});

test("inherited members are validated the way ajv validates them", () => {
  for (const ownProperties of [false, true]) {
    const oracle = new AjvReference({ownProperties});
    const replacement = new AjvReplacement({ownProperties});
    const schema = {properties: {x: {type: "string"}}};
    const validateOracle = oracle.compile(clone(schema));
    const validateReplacement = replacement.compile(clone(schema));
    const document = Object.create({x: "a"});
    document.y = 1;
    assert.deepStrictEqual(
      outcome(validateReplacement, document),
      outcome(validateOracle, document),
      `ownProperties: ${ownProperties}`,
    );
  }
});

test("a JSON Type Definition project runs unchanged when the replacement takes ajv's place", () => {
  const before = hashDirectory(SOURCE_PROJECT);
  const {reference, replacement} = runWithBothValidators(SOURCE_PROJECT, WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SOURCE_PROJECT), before, "fixture project was edited");
  assert.ok(reference.length > 0, "expected the fixture to validate documents");

  const valid = reference.filter((row) => row.valid);
  const invalid = reference.filter((row) => !row.valid);
  assert.ok(valid.length > 0, "expected valid documents");
  assert.ok(invalid.length > 0, "expected invalid documents");
  for (const row of valid) assert.strictEqual(row.errors, null, `${row.case} should report no errors`);
  for (const row of invalid) assert.ok(Array.isArray(row.errors) && row.errors.length > 0, row.case);
  assert.ok(
    reference.some((row) => row.case.endsWith(".first") && row.errors.length === 1),
    "expected a first-error report",
  );
  assert.ok(
    reference.some((row) => !row.case.endsWith(".first") && row.errors.length > 1),
    "expected a complete report",
  );
});
