"use strict";

const test = require("node:test");
const assert = require("node:assert");

// The strictness decisions are compared against the published ajv directly:
// the same schema, options, logger, and documents, and the same compile
// outcome, diagnostics, verdicts, and reports.
const DIALECTS = {
  draft7: {reference: require("ajv-reference"), replacement: require("..")},
  "2019": {
    reference: require("ajv-reference/dist/2019"),
    replacement: require("../dist/2019"),
  },
  "2020": {
    reference: require("ajv-reference/dist/2020"),
    replacement: require("../dist/2020"),
  },
};

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function capture(messages) {
  const record = (level) => (message) => messages.push([level, String(message)]);
  return {log: record("log"), warn: record("warn"), error: record("error")};
}

// Compiles a schema the way a project does, records every message its logger
// receives, then validates each document and records the verdict and report.
function run(Ajv, options, schema, documents = []) {
  const messages = [];
  const opts = {...options};
  if (!("logger" in opts)) opts.logger = capture(messages);
  const result = {error: null, messages, verdicts: []};
  try {
    const ajv = new Ajv(opts);
    const validate = ajv.compile(clone(schema));
    for (const document of documents) {
      const data = clone(document);
      const valid = validate(data);
      result.verdicts.push({valid, errors: validate.errors, data});
    }
  } catch (error) {
    result.error = {name: error.constructor.name, message: error.message};
  }
  return result;
}

// The same scenario run through ajv and through this package, compared entry
// for entry.
function both(dialect, options, schema, documents) {
  const {reference, replacement} = DIALECTS[dialect];
  const expected = run(reference, options, schema, documents);
  const actual = run(replacement, options, schema, documents);
  assert.deepStrictEqual(actual, expected, `${dialect} ${JSON.stringify(schema)}`);
  return actual;
}

// --- schemas whose keyword cannot act where it is written -------------------

const misplaced = {
  additionalItemsBesideItems: {
    schema: {type: "array", items: {type: "number"}, additionalItems: {type: "string"}},
    documents: [[1, 2], ["a"], [1, "a"]],
  },
  thenWithoutIf: {
    schema: {type: "object", then: {properties: {a: {type: "string"}}}},
    documents: [{a: "x"}, {a: 1}],
  },
  elseWithoutIf: {
    schema: {type: "object", else: {properties: {a: {type: "string"}}}},
    documents: [{a: "x"}, {a: 1}],
  },
  ifWithoutBranches: {
    schema: {type: "object", if: {properties: {a: {type: "string"}}}},
    documents: [{a: "x"}, {a: 1}],
  },
  minContainsWithoutContains: {
    schema: {type: "array", minContains: 2},
    documents: [[1, 2], []],
  },
  maxContainsWithoutContains: {
    schema: {type: "array", maxContains: 2},
    documents: [[1, 2], []],
  },
  minContainsZeroWithoutMax: {
    schema: {type: "array", contains: {type: "number"}, minContains: 0},
    documents: [[], [1, "a"]],
  },
  minContainsAboveMax: {
    schema: {type: "array", contains: {type: "number"}, minContains: 3, maxContains: 2},
    documents: [[1, 2, 3], [1]],
  },
  recursiveAnchorFalse: {
    schema: {$recursiveAnchor: false, type: "object"},
    documents: [{}],
  },
};

const MISPLACED_MESSAGES = {
  draft7: {
    additionalItemsBesideItems:
      'strict mode: "additionalItems" is ignored when "items" is not an array of schemas',
    thenWithoutIf: 'strict mode: "then" without "if" is ignored',
    elseWithoutIf: 'strict mode: "else" without "if" is ignored',
    ifWithoutBranches: 'strict mode: "if" without "then" and "else" is ignored',
    minContainsWithoutContains: 'strict mode: unknown keyword: "minContains"',
    maxContainsWithoutContains: 'strict mode: unknown keyword: "maxContains"',
    minContainsZeroWithoutMax: 'strict mode: unknown keyword: "minContains"',
    minContainsAboveMax: 'strict mode: unknown keyword: "minContains"',
    recursiveAnchorFalse: 'strict mode: unknown keyword: "$recursiveAnchor"',
  },
  "2019": {
    additionalItemsBesideItems:
      'strict mode: "additionalItems" is ignored when "items" is not an array of schemas',
    thenWithoutIf: 'strict mode: "then" without "if" is ignored',
    elseWithoutIf: 'strict mode: "else" without "if" is ignored',
    ifWithoutBranches: 'strict mode: "if" without "then" and "else" is ignored',
    minContainsWithoutContains: 'strict mode: "minContains" without "contains" is ignored',
    maxContainsWithoutContains: 'strict mode: "maxContains" without "contains" is ignored',
    minContainsZeroWithoutMax:
      'strict mode: "minContains" == 0 without "maxContains": "contains" keyword ignored',
    minContainsAboveMax: 'strict mode: "minContains" > "maxContains" is always invalid',
    recursiveAnchorFalse: "strict mode: $recursiveAnchor: false is ignored",
  },
  "2020": {
    additionalItemsBesideItems: 'strict mode: unknown keyword: "additionalItems"',
    thenWithoutIf: 'strict mode: "then" without "if" is ignored',
    elseWithoutIf: 'strict mode: "else" without "if" is ignored',
    ifWithoutBranches: 'strict mode: "if" without "then" and "else" is ignored',
    minContainsWithoutContains: 'strict mode: "minContains" without "contains" is ignored',
    maxContainsWithoutContains: 'strict mode: "maxContains" without "contains" is ignored',
    minContainsZeroWithoutMax:
      'strict mode: "minContains" == 0 without "maxContains": "contains" keyword ignored',
    minContainsAboveMax: 'strict mode: "minContains" > "maxContains" is always invalid',
    // The 2020-12 meta-schema rejects the annotation before strictness runs.
    recursiveAnchorFalse: "schema is invalid: data/$recursiveAnchor must be string",
  },
};

for (const dialect of Object.keys(DIALECTS)) {
  test(`${dialect}: a keyword that cannot act where written is refused`, () => {
    for (const [name, entry] of Object.entries(misplaced)) {
      const refused = both(dialect, {}, entry.schema, entry.documents);
      assert.strictEqual(refused.error.message, MISPLACED_MESSAGES[dialect][name], name);
      assert.deepStrictEqual(refused.verdicts, [], `${name} produced no validator`);

      // Refusal off: the schema compiles and judges its documents. The 2020-12
      // meta-schema rejects `$recursiveAnchor: false` before strictness runs.
      const allowed = both(dialect, {strictSchema: false}, entry.schema, entry.documents);
      if (dialect === "2020" && name === "recursiveAnchorFalse") {
        assert.strictEqual(allowed.error.message, MISPLACED_MESSAGES[dialect][name]);
      } else {
        assert.strictEqual(allowed.error, null, name);
        assert.ok(allowed.verdicts.length > 0, name);
      }

      // Reporting instead of refusing keeps the schema and logs the message.
      both(dialect, {strictSchema: "log"}, entry.schema, entry.documents);
    }
  });

  test(`${dialect}: a schema ajv freely accepts still compiles`, () => {
    const schema = {
      type: "object",
      required: ["name"],
      properties: {name: {type: "string", minLength: 2}, age: {type: "integer"}},
      additionalProperties: false,
    };
    const documents = [{name: "ab", age: 3}, {name: "a"}, {name: "ab", extra: 1}];
    for (const options of [{}, {allErrors: true}, {verbose: true}]) {
      both(dialect, options, schema, documents);
    }
  });

  test(`${dialect}: a property declared directly and by a pattern`, () => {
    const schema = {
      type: "object",
      properties: {foo: {type: "string"}, other: {type: "number"}},
      patternProperties: {"^f": {type: "number"}},
      required: ["foo", "other"],
    };
    const documents = [{foo: "x", other: 1}, {foo: 1, other: 2}, {"far": 3}];
    const refused = both(dialect, {}, schema, documents);
    assert.strictEqual(
      refused.error.message,
      "strict mode: property foo matches pattern ^f (use allowMatchingProperties)",
    );
    const allowed = both(
      dialect,
      {allowMatchingProperties: true, allErrors: true},
      schema,
      documents,
    );
    assert.strictEqual(allowed.error, null);
    assert.deepStrictEqual(
      allowed.verdicts.map((verdict) => verdict.valid),
      [false, false, false],
    );
    for (const verdict of allowed.verdicts) assert.ok(verdict.errors.length > 0);
    both(dialect, {allowMatchingProperties: true}, schema, documents);
  });

  test(`${dialect}: strictType and strictTuple diagnostics`, () => {
    const tuple =
      dialect === "2020"
        ? {type: "array", prefixItems: [{type: "string"}, {type: "number"}]}
        : {type: "array", items: [{type: "string"}, {type: "number"}]};
    const tupleKeyword = dialect === "2020" ? "prefixItems" : "items";
    const tupleExtra = dialect === "2020" ? "items" : "additionalItems";
    const scenarios = [
      {name: "union", setting: "strictTypes", schema: {type: ["string", "number"]}},
      {name: "tuple", setting: "strictTuples", schema: tuple},
    ];
    for (const scenario of scenarios) {
      const documents = scenario.name === "union" ? ["text", 1, true] : [["a", 1], ["a", "b"]];
      const defaulted = both(dialect, {}, scenario.schema, documents);
      assert.strictEqual(defaulted.error, null);
      assert.strictEqual(defaulted.messages.length, 1);
      assert.strictEqual(defaulted.messages[0][0], "warn");
      const message = defaulted.messages[0][1];
      assert.ok(
        message.startsWith(
          scenario.name === "union"
            ? 'strict mode: use allowUnionTypes to allow union type keyword at "#" (strictTypes)'
            : `strict mode: "${tupleKeyword}" is 2-tuple, but minItems or maxItems/` +
                `${tupleExtra} are not specified or different at path "#"`,
        ),
        message,
      );

      const refused = both(dialect, {[scenario.setting]: true}, scenario.schema, documents);
      assert.strictEqual(refused.error.message, message);
      assert.deepStrictEqual(refused.verdicts, []);

      for (const options of [
        {[scenario.setting]: false},
        {[scenario.setting]: "log", logger: false},
        {strict: false},
        ...(scenario.name === "union" ? [{allowUnionTypes: true}] : []),
      ]) {
        const quiet = both(dialect, options, scenario.schema, documents);
        assert.strictEqual(quiet.error, null);
        assert.deepStrictEqual(quiet.messages, []);
        assert.strictEqual(quiet.verdicts.length, documents.length);
      }

      // Reporting keeps the schema and repeats the same diagnostic.
      const reported = both(dialect, {[scenario.setting]: "log"}, scenario.schema, documents);
      assert.deepStrictEqual(reported.messages, [["warn", message]]);
    }
  });

  test(`${dialect}: strictRequired checks declared and evaluated names`, () => {
    const evaluated = {
      type: "object",
      properties: {declared: {type: "string"}},
      allOf: [{properties: {evaluated: {type: "number"}}}],
      required: ["declared", "evaluated"],
    };
    const documents = [{declared: "x", evaluated: 1}, {declared: "x"}, {}];
    for (const options of [{strictRequired: true}, {strictRequired: "log"}]) {
      const result = both(dialect, options, evaluated, documents);
      assert.strictEqual(result.error, null);
      assert.deepStrictEqual(result.messages, []);
    }

    const missing = {
      type: "object",
      properties: {declared: {type: "string"}},
      required: ["declared", "absent"],
    };
    const refused = both(dialect, {strictRequired: true}, missing, [{declared: "x"}]);
    assert.strictEqual(
      refused.error.message,
      'strict mode: required property "absent" is not defined at "#" (strictRequired)',
    );
    for (const options of [{}, {strictRequired: false}, {strictRequired: "log", logger: false}]) {
      const quiet = both(dialect, options, missing, [{declared: "x"}]);
      assert.strictEqual(quiet.error, null);
      assert.deepStrictEqual(quiet.messages, []);
    }
    const reported = both(dialect, {strictRequired: "log"}, missing, [{declared: "x"}]);
    assert.deepStrictEqual(reported.messages, [
      ["warn", 'strict mode: required property "absent" is not defined at "#" (strictRequired)'],
    ]);
  });

  test(`${dialect}: diagnostics arrive in ajv's order`, () => {
    const schema = {
      type: "object",
      allOf: [{type: "string"}],
      properties: {
        a: {type: ["string", "number"]},
        b:
          dialect === "2020"
            ? {type: "array", prefixItems: [{type: "string"}]}
            : {type: "array", items: [{type: "string"}]},
      },
    };
    const documents = [{a: "x", b: ["y"]}, {a: 1, b: ["y", 2]}];
    const result = both(dialect, {}, schema, documents);
    assert.deepStrictEqual(
      result.messages.map((entry) => entry[1]),
      [
        'strict mode: type "string" not allowed by context "object" at "#/allOf/0" (strictTypes)',
        'strict mode: use allowUnionTypes to allow union type keyword at ' +
          '"#/properties/a" (strictTypes)',
        dialect === "2020"
          ? 'strict mode: "prefixItems" is 1-tuple, but minItems or maxItems/items are ' +
            'not specified or different at path "#/properties/b"'
          : 'strict mode: "items" is 1-tuple, but minItems or maxItems/additionalItems are ' +
            'not specified or different at path "#/properties/b"',
      ],
    );
  });

  test(`${dialect}: vocabulary diagnostics repeat as often as ajv's`, () => {
    // ajv inspects a subschema for validity and then compiles it, so an
    // unknown keyword in it is reported twice when strictness only reports.
    const schema = {
      type: "object",
      properties: {p: {type: "string", note: 1}},
    };
    const result = both(dialect, {strict: "log"}, schema, [{p: "x"}]);
    assert.deepStrictEqual(
      result.messages,
      [
        ["warn", 'strict mode: unknown keyword: "note"'],
        ["warn", 'strict mode: unknown keyword: "note"'],
      ],
    );
  });

  test(`${dialect}: paths follow identifiers and inlined references`, () => {
    const identified = {
      $id: `https://example.test/${dialect}`,
      type: "object",
      properties: {a: {type: ["string", "number"]}},
    };
    const identifiedResult = both(dialect, {}, identified, [{a: "x"}]);
    assert.strictEqual(
      identifiedResult.messages[0][1],
      `strict mode: use allowUnionTypes to allow union type keyword at ` +
        `"https://example.test/${dialect}#/properties/a" (strictTypes)`,
    );

    const inlined = {
      type: "object",
      $defs: {entry: {type: "object", required: ["absent"]}},
      properties: {item: {$ref: "#/$defs/entry"}},
    };
    const inlinedResult = both(dialect, {strictRequired: true}, inlined, []);
    assert.strictEqual(
      inlinedResult.error.message,
      'strict mode: required property "absent" is not defined at ' +
        '"#/$defs/entry" (strictRequired)',
    );
  });

  test(`${dialect}: accepted dialect schemas keep their verdicts and reports`, () => {
    const schema =
      dialect === "draft7"
        ? {
            type: "object",
            required: ["name"],
            properties: {name: {type: "string"}, tags: {type: "array", items: {type: "string"}}},
            additionalProperties: false,
          }
        : {
            type: "object",
            properties: {name: {type: "string"}, tags: {type: "array", items: {type: "string"}}},
            dependentRequired: {name: ["tags"]},
            additionalProperties: false,
          };
    const documents = [{name: "x", tags: ["a"]}, {name: "x"}, {tags: ["a"]}, {extra: 1}];
    for (const options of [{}, {allErrors: true}]) {
      const result = both(dialect, options, schema, documents);
      assert.strictEqual(result.error, null);
      for (const verdict of result.verdicts) {
        if (!verdict.valid) assert.ok(verdict.errors.length > 0);
      }
    }
  });
}
