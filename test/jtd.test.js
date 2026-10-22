"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const {ROOT, hashDirectory, runWithBothValidators} = require("./lib/project");

const AjvReference = require("ajv-reference/dist/jtd");
const AjvReplacement = require("../dist/jtd");

const SOURCE_PROJECT = path.join(__dirname, "fixtures", "jtd-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "jtd-project");
const SERIALIZER_PROJECT = path.join(__dirname, "fixtures", "jtd-serializer-project");
const SERIALIZER_WORK_PROJECT = path.join(ROOT, ".tmp", "jtd-serializer-project");
const PARSER_PROJECT = path.join(__dirname, "fixtures", "jtd-parser-project");
const PARSER_WORK_PROJECT = path.join(ROOT, ".tmp", "jtd-parser-project");

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

// --- JSON Type Definition text generation --------------------------------

function serializerDocuments() {
  return [
    ...DOCUMENTS,
    new Date("2020-01-02T03:04:05.678Z"),
    new Date(NaN),
    NaN,
    Infinity,
    -Infinity,
    10n,
    "he\"llo\\\n\u0000\u00ad\u2028\ud800",
    Object.assign(Object.create({inherited: "i"}), {own: "o"}),
    Object.assign(Object.create({y: 4}), {x: "a"}),
    {a: undefined, b: 1},
    {b: 2, c: 1, a: 3},
  ];
}

// A runtime failure is compared by kind only: ajv's generated code names its
// temporaries, and those names appear in TypeError messages.
function serializerOutcome(serialize, document) {
  try {
    return {text: serialize(document)};
  } catch (error) {
    return {error: error.constructor.name};
  }
}

test("JSON Type Definition text matches ajv character for character", () => {
  const schemas = CASES.map((testCase) => testCase.schema).concat([{nullable: true}]);
  for (const options of [{}, {specialNumbers: "null"}, {ownProperties: true}]) {
    const oracle = new AjvReference(clone(options));
    const replacement = new AjvReplacement(clone(options));
    for (const schema of schemas) {
      const serializeOracle = oracle.compileSerializer(clone(schema));
      const serializeReplacement = replacement.compileSerializer(clone(schema));
      for (const document of serializerDocuments()) {
        const expected = serializerOutcome(serializeOracle, document);
        const actual = serializerOutcome(serializeReplacement, document);
        const context = JSON.stringify({options, schema, document}, (key, value) =>
          typeof value === "bigint" ? `${value}n` : value,
        );
        assert.deepStrictEqual(actual, expected, context);
        if (expected.text === undefined) continue;
        // The text is an ordinary JSON document whenever ajv's text is one.
        let expectedValue;
        try {
          expectedValue = JSON.parse(expected.text);
        } catch {
          continue;
        }
        assert.deepStrictEqual(JSON.parse(actual.text), expectedValue, context);
      }
    }
  }
});

const SERIALIZER_MALFORMED = [
  ...MALFORMED,
  {name: "missing definition", schema: {ref: "missing"}},
  {
    name: "missing definition behind a reference",
    schema: {definitions: {a: {ref: "missing"}}, ref: "a"},
  },
  {
    name: "definition overlap",
    schema: {definitions: {x: {properties: {a: {}}, optionalProperties: {a: {}}}}, ref: "x"},
  },
  {name: "mapping member null", schema: {discriminator: "t", mapping: {a: null}}},
  {name: "mapping member number", schema: {discriminator: "t", mapping: {a: 5}}},
  {name: "elements not a schema", schema: {elements: "x"}},
  {name: "properties not a schema", schema: {properties: "x"}},
  {name: "properties array", schema: {properties: ["x"]}},
];

test("the serializer rejects schemas where and as ajv rejects them", () => {
  for (const {name, schema} of SERIALIZER_MALFORMED) {
    for (const validateSchema of [true, false]) {
      const oracle = new AjvReference({validateSchema});
      const replacement = new AjvReplacement({validateSchema});
      const expected = capture(() => {
        oracle.compileSerializer(clone(schema));
        return "compiled";
      });
      const actual = capture(() => {
        replacement.compileSerializer(clone(schema));
        return "compiled";
      });
      assert.deepStrictEqual(actual, expected, `${name} (validateSchema: ${validateSchema})`);
    }
  }
});

test("serializer compilation keeps ajv's caching and registry behaviour", () => {
  const oracle = new AjvReference();
  const replacement = new AjvReplacement();
  const schema = {type: "string"};
  const oracleSerialize = oracle.compileSerializer(schema);
  const replacementSerialize = replacement.compileSerializer(schema);
  assert.strictEqual(replacement.compileSerializer(schema), replacementSerialize);
  assert.strictEqual(typeof replacementSerialize, "function");
  assert.strictEqual(replacementSerialize(5), oracleSerialize(5));

  // ajv registers an anonymous serializer schema under the empty key and
  // validates a schema object only once, even when that attempt failed.
  assert.strictEqual(typeof replacement.getSchema(""), "function");
  let oracleDuplicate = null;
  let replacementDuplicate = null;
  try {
    oracle.addSchema({type: "number"}, "");
  } catch (error) {
    oracleDuplicate = error.message;
  }
  try {
    replacement.addSchema({type: "number"}, "");
  } catch (error) {
    replacementDuplicate = error.message;
  }
  assert.strictEqual(replacementDuplicate, oracleDuplicate);

  const broken = {type: "nope"};
  assert.throws(() => oracle.compileSerializer(broken));
  assert.throws(() => replacement.compileSerializer(broken));
  assert.strictEqual(replacement.compileSerializer(broken)(5), oracle.compileSerializer(broken)(5));

  const withId = () => ({$id: "https://example.com/schema", type: "string"});
  const oracleIds = new AjvReference({validateSchema: false});
  const replacementIds = new AjvReplacement({validateSchema: false});
  oracleIds.compileSerializer(withId());
  replacementIds.compileSerializer(withId());
  let oracleIdError = null;
  let replacementIdError = null;
  try {
    oracleIds.compileSerializer(withId());
  } catch (error) {
    oracleIdError = error.message;
  }
  try {
    replacementIds.compileSerializer(withId());
  } catch (error) {
    replacementIdError = error.message;
  }
  assert.strictEqual(replacementIdError, oracleIdError);
});

test("a JSON Type Definition serializer project runs unchanged with the replacement", () => {
  const before = hashDirectory(SERIALIZER_PROJECT);
  const {reference, replacement} = runWithBothValidators(
    SERIALIZER_PROJECT,
    SERIALIZER_WORK_PROJECT,
  );

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(SERIALIZER_PROJECT), before, "fixture project was edited");
  assert.ok(reference.length > 0, "expected the fixture to serialize documents");
  for (const row of reference) {
    assert.strictEqual(typeof row.text, "string", `${row.case} should produce text`);
    assert.doesNotThrow(() => JSON.parse(row.text), `${row.case} should produce a JSON document`);
  }
});

// --- JSON Type Definition text parsing -------------------------------------

// Input text for the parser: every document above written as JSON, plus the
// forms where ajv's parser diverges from JSON.parse (integer digit limits,
// trailing commas, escapes, leading zeroes) and text that is not JSON at all.
const PARSER_TEXTS = [
  ...DOCUMENTS.filter((document) => document !== undefined).map((document) => JSON.stringify(document)),
  "",
  " ",
  "\n",
  " [1] ",
  "1 2",
  "{}x",
  " \n\t\r{}",
  "true ",
  " true ",
  "tru",
  "truex",
  "falsex",
  "nullx",
  "01",
  "+1",
  ".5",
  "1.",
  "1e",
  "1e+",
  "1e400",
  "-1e400",
  "1234",
  "4294967295",
  "4294967296",
  "65535",
  "65536",
  "2147483647",
  "2147483648",
  "3000000000",
  '"',
  '"a',
  '"a\\',
  '"\\q"',
  '"\\u12"',
  '"\\u00zz"',
  '"\\u00E9"',
  '"\\u0000"',
  '"\u0001"',
  '"a" "b"',
  "[]",
  "[ ]",
  "[1]",
  '["a"]',
  '["a","b"]',
  '["a",]',
  '["a" "b"]',
  "[1,]",
  "[",
  '["a"',
  '"a"]',
  "{}",
  "{ }",
  '{"x":"a"}',
  '{"x":1}',
  '{"x":"a",}',
  '{"x":"a" "y":1}',
  '{"x":"a","z":1}',
  '{"t":"a","x":"s"}',
  '{"t":"b"}',
  '{"t":"c"}',
  '{"t":1}',
  '{"x":"s","t":"a"}',
  '{"k":"v"}',
  '{"k":1}',
  '{"k":"v","j":"w"}',
  '{"k":"v",}',
  '{"k":"v" "j":"w"}',
  '"2020-01-01T00:00:00Z"',
  '"2020-01-01"',
  '"2020-02-30T00:00:00Z"',
  '"2020-01-01T24:00:00Z"',
  '"2020-01-01T23:59:60Z"',
  '"2020-01-01"',
  '{"id":"x"}',
  '{"id":"x","children":[]}',
  '{"id":"x","children":[{"id":"y"}]}',
  '{"id":"x","children":[{"id":"y"},]}',
  '{"id":1}',
  '{"id":"x","children":[{"id":"y"}],"extra":1}',
  '{"kind":"leaf","value":1}',
  '{"kind":"branch","left":{"kind":"leaf","value":1},"right":{"kind":"leaf","value":"x"}}',
  '{"kind":"leaf"}',
  '{"kind":"nope"}',
  '{"value":1}',
  '{"kind":"leaf","value":1,"x":2}',
  '{"name":"a","stamps":[{"at":"2020-01-01T00:00:00Z"}],"labels":{"k":"v"}}',
  '{"name":1,"stamps":[{"at":"nope","zone":"nowhere"}],"labels":{"k":1},"note":2}',
  '{"meta":"anything"}',
  '{"x":"a"} ',
  "[1] [2]",
];

function parserOutcome(parse, text) {
  try {
    const value = parse(text);
    return {
      failed: value === undefined,
      value: value === undefined ? null : value,
      message: parse.message,
      position: parse.position,
      promise: value instanceof Promise,
    };
  } catch (error) {
    return {thrown: `${error.constructor.name}: ${error.message}`};
  }
}

test("JSON Type Definition parsing matches ajv for every form and input", () => {
  for (const options of [{}, {allowDate: true}, {parseDate: true}, {int32range: false}]) {
    const oracle = new AjvReference(clone(options));
    const replacement = new AjvReplacement(clone(options));
    let compared = 0;
    for (const testCase of CASES) {
      const parseOracle = oracle.compileParser(clone(testCase.schema));
      const parseReplacement = replacement.compileParser(clone(testCase.schema));
      for (const text of PARSER_TEXTS) {
        compared++;
        const context = JSON.stringify({options, testCase: testCase.name, text});
        assert.deepStrictEqual(
          parserOutcome(parseReplacement, text),
          parserOutcome(parseOracle, text),
          context,
        );
      }
    }
    assert.strictEqual(compared, CASES.length * PARSER_TEXTS.length);
  }
});

test("JSON Type Definition parsing reports failures and offsets synchronously", () => {
  const ajv = new AjvReplacement();
  const parseObject = ajv.compileParser({properties: {x: {type: "string"}}});
  assert.deepStrictEqual(parseObject('{"x":"a"}'), {x: "a"});
  assert.strictEqual(parseObject.position, undefined);
  assert.strictEqual(parseObject.message, undefined);

  assert.strictEqual(parseObject('{"x":1}'), undefined);
  assert.strictEqual(parseObject.message, "unexpected token 1");
  assert.strictEqual(parseObject.position, 5);

  assert.strictEqual(parseObject('{"x":"a"'), undefined);
  assert.strictEqual(parseObject.message, "unexpected token undefined");
  assert.strictEqual(parseObject.position, 8);

  // The message and position of the previous call do not outlive it.
  assert.deepStrictEqual(parseObject('{"x":"b"}'), {x: "b"});
  assert.strictEqual(parseObject.message, undefined);
  assert.strictEqual(parseObject.position, undefined);

  const parseInteger = ajv.compileParser({type: "int8"});
  assert.strictEqual(parseInteger("128"), undefined);
  assert.strictEqual(parseInteger.message, "integer out of range");
  assert.strictEqual(parseInteger.position, 3);

  const parseEnum = ajv.compileParser({enum: ["a", "b"]});
  assert.strictEqual(parseEnum('"c"'), undefined);
  assert.strictEqual(parseEnum.message, "unexpected token c");
  assert.strictEqual(parseEnum.position, 1);

  const outcomes = [parseObject('{"x":"a"}'), parseObject("{")];
  for (const value of outcomes) assert.strictEqual(value instanceof Promise, false);
});

const PARSER_MALFORMED = [
  ...MALFORMED,
  // ajv's parser has its own compile-time failures on top of the schema rules.
  {name: "empty properties object", schema: {properties: {}}},
  {
    name: "empty properties object in a mapping",
    schema: {discriminator: "t", mapping: {a: {properties: {}}}},
  },
  {name: "missing definition", schema: {ref: "missing"}},
  {
    name: "missing definition behind a reference",
    schema: {definitions: {a: {ref: "missing"}}, ref: "a"},
  },
  {name: "mapping member null", schema: {discriminator: "t", mapping: {a: null}}},
  {name: "mapping member number", schema: {discriminator: "t", mapping: {a: 5}}},
  {name: "type is not a known type", schema: {type: "nope"}},
  {name: "elements not a schema", schema: {elements: "x"}},
  {name: "properties not a schema", schema: {properties: "x"}},
  {name: "properties array", schema: {properties: ["x"]}},
];

test("the parser rejects schemas where and as ajv rejects them", () => {
  for (const {name, schema} of PARSER_MALFORMED) {
    for (const validateSchema of [true, false]) {
      const oracle = new AjvReference({validateSchema});
      const replacement = new AjvReplacement({validateSchema});
      const expected = capture(() => {
        const parse = oracle.compileParser(clone(schema));
        return {parsed: parse('"a"'), message: parse.message, position: parse.position};
      });
      const actual = capture(() => {
        const parse = replacement.compileParser(clone(schema));
        return {parsed: parse('"a"'), message: parse.message, position: parse.position};
      });
      assert.deepStrictEqual(actual, expected, `${name} (validateSchema: ${validateSchema})`);
    }
  }
});

test("parser compilation keeps ajv's caching and registry behaviour", () => {
  const oracle = new AjvReference({validateSchema: false});
  const replacement = new AjvReplacement({validateSchema: false});
  const schema = {type: "string"};
  const oracleParse = oracle.compileParser(schema);
  const replacementParse = replacement.compileParser(schema);
  assert.strictEqual(replacement.compileParser(schema), replacementParse);
  assert.strictEqual(replacementParse('"a"'), oracleParse('"a"'));
  assert.deepStrictEqual(
    parserOutcome(replacementParse, "1"),
    parserOutcome(oracleParse, "1"),
  );

  // The parser and serializer share ajv's schema environment: an identified
  // schema can produce both, and the registered schema still validates.
  const oracleSchema = {$id: "https://example.com/parser", type: "string"};
  const replacementSchema = {$id: "https://example.com/parser", type: "string"};
  oracle.compileSerializer(oracleSchema);
  replacement.compileSerializer(replacementSchema);
  const oracleIdentifiedParse = oracle.compileParser(oracleSchema);
  const replacementIdentifiedParse = replacement.compileParser(replacementSchema);
  assert.strictEqual(replacementIdentifiedParse('"a"'), oracleIdentifiedParse('"a"'));
  assert.deepStrictEqual(
    capture(() => oracle.getSchema("https://example.com/parser")),
    capture(() => replacement.getSchema("https://example.com/parser")),
  );
  let oracleDuplicate = null;
  let replacementDuplicate = null;
  try {
    oracle.compileParser({$id: "https://example.com/parser", type: "string"});
  } catch (error) {
    oracleDuplicate = error.message;
  }
  try {
    replacement.compileParser({$id: "https://example.com/parser", type: "string"});
  } catch (error) {
    replacementDuplicate = error.message;
  }
  assert.strictEqual(replacementDuplicate, oracleDuplicate);

  // A schema whose compilation failed is not validated again on the next
  // attempt, exactly as ajv's schema cache behaves.
  const broken = {type: "nope"};
  const expectedFirst = capture(() => oracle.compileParser(broken));
  const actualFirst = capture(() => replacement.compileParser(broken));
  assert.deepStrictEqual(actualFirst, expectedFirst);
  const expectedSecond = capture(() => oracle.compileParser(broken));
  const actualSecond = capture(() => replacement.compileParser(broken));
  assert.deepStrictEqual(actualSecond, expectedSecond);
});

test("a JSON Type Definition parser project runs unchanged with the replacement", () => {
  const before = hashDirectory(PARSER_PROJECT);
  const {reference, replacement} = runWithBothValidators(PARSER_PROJECT, PARSER_WORK_PROJECT);

  assert.deepStrictEqual(replacement, reference);
  assert.strictEqual(hashDirectory(PARSER_PROJECT), before, "fixture project was edited");
  assert.ok(reference.length > 0, "expected the fixture to parse documents");

  const rejected = reference.filter((row) => row.rejected !== undefined);
  const dataRows = reference.filter((row) => row.rejected === undefined);
  assert.ok(rejected.length > 0, "expected refused schemas");
  for (const row of rejected) {
    assert.strictEqual(row.rejected, true, `${row.case} should be refused`);
    assert.match(row.error, /^(?:[A-Za-z]*Error): /, `${row.case} should report a reason`);
  }

  const failed = dataRows.filter((row) => row.failed);
  const parsed = dataRows.filter((row) => !row.failed);
  assert.ok(failed.length > 0, "expected failed parses");
  assert.ok(parsed.length > 0, "expected successful parses");
  for (const row of failed) {
    assert.strictEqual(typeof row.message, "string", `${row.case} should report a reason`);
    assert.strictEqual(typeof row.position, "number", `${row.case} should report a position`);
    assert.strictEqual(row.promise, false, `${row.case} should fail synchronously`);
  }
  for (const row of parsed) {
    assert.strictEqual(row.promise, false, `${row.case} should parse synchronously`);
    assert.strictEqual(typeof row.parsed, "string", `${row.case} should report a parsed value`);
    assert.strictEqual(typeof row.valid, "boolean", `${row.case} should validate the parsed value`);
    if (row.valid) {
      assert.strictEqual(typeof row.text, "string", `${row.case} should serialize`);
      assert.strictEqual(row.roundTrip, row.parsed, `${row.case} should read back unchanged`);
    } else assert.ok(Array.isArray(row.errors) && row.errors.length > 0, row.case);
  }
  assert.ok(failed.some((row) => row.case.endsWith(".malformed")), "expected malformed input");
  assert.ok(
    reference.some((row) => row.failed && row.case === "telemetry.invalid"),
    "expected schema-invalid input to fail parsing",
  );
});
