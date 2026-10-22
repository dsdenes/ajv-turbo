"use strict";

// An existing project that relies on ajv's strict mode for schema vocabulary.
// It is run unchanged with ajv and with this package installed in ajv's place;
// every printed line must match. Each entry point is loaded the way a project
// on that dialect loads it.

const ENTRIES = [
  ["draft7", () => require("ajv")],
  ["2019", () => require("ajv/dist/2019")],
  ["2020", () => require("ajv/dist/2020")],
];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function capture(messages) {
  const record = (level) => (message) => messages.push([level, String(message)]);
  return {log: record("log"), warn: record("warn"), error: record("error")};
}

function describeError(error) {
  return {name: error.constructor.name, message: error.message};
}

function print(line) {
  process.stdout.write(JSON.stringify(line) + "\n");
}

// Compiles one schema and validates its documents, recording the compile
// outcome, the messages the project's logger received, and each verdict,
// report, and rewritten document.
function attempt(Ajv, options, schema, documents = [], setup) {
  const messages = [];
  const opts = {...options};
  if (!("logger" in opts)) opts.logger = capture(messages);
  const result = {error: null, messages, verdicts: []};
  try {
    const ajv = new Ajv(opts);
    if (setup) setup(ajv);
    const validate = ajv.compile(clone(schema));
    for (const document of documents) {
      const data = clone(document);
      const valid = validate(data);
      result.verdicts.push({valid, errors: validate.errors, data});
    }
  } catch (error) {
    result.error = describeError(error);
  }
  return result;
}

function record(dialect, kind, name, setting, result) {
  print({dialect, kind, case: name, setting, ...result});
}

// --- schemas whose only vocabulary problem is an unknown keyword ----------

const unknownKeywordPositions = {
  root: {type: "string", note: 1},
  properties: {type: "object", properties: {a: {type: "string", note: 1}}},
  patternProperties: {
    type: "object",
    patternProperties: {"^a": {type: "string", note: 1}},
  },
  additionalProperties: {
    type: "object",
    additionalProperties: {type: "string", note: 1},
  },
  propertyNames: {type: "object", propertyNames: {type: "string", note: 1}},
  dependencies: {type: "object", dependencies: {a: {type: "string", note: 1}}},
  items: {type: "array", items: {type: "string", note: 1}},
  prefixItems: {
    type: "array",
    prefixItems: [{type: "string", note: 1}],
    minItems: 1,
    maxItems: 1,
  },
  contains: {type: "array", contains: {type: "string", note: 1}},
  unevaluatedItems: {type: "array", unevaluatedItems: {type: "string", note: 1}},
  unevaluatedProperties: {
    type: "object",
    unevaluatedProperties: {type: "string", note: 1},
  },
  dependentSchemas: {
    type: "object",
    dependentSchemas: {a: {type: "string", note: 1}},
  },
  allOf: {allOf: [{type: "string", note: 1}]},
  anyOf: {anyOf: [{type: "string", note: 1}]},
  oneOf: {oneOf: [{type: "string", note: 1}]},
  not: {not: {type: "string", note: 1}},
  if: {if: {type: "string", note: 1}, then: {type: "string"}},
  then: {if: {type: "string"}, then: {type: "string", note: 1}},
  else: {if: {type: "string"}, else: {type: "string", note: 1}},
  referenced: {
    definitions: {x: {type: "string", note: 1}},
    $ref: "#/definitions/x",
  },
  defsReferenced: {
    $defs: {x: {type: "string", note: 1}},
    $ref: "#/$defs/x",
  },
  unreferencedDefinition: {
    definitions: {x: {type: "string", note: 1}},
    type: "object",
  },
};

// Keywords another dialect owns, at a position where the selected dialect
// either defines them or refuses them as unknown.
const crossDialect = {
  crossPrefixItems: {
    schema: {type: "array", prefixItems: [{type: "string"}], minItems: 1, maxItems: 1},
    documents: [["a"], ["a", "b"], [1]],
  },
  crossDependentRequired: {
    schema: {type: "object", dependentRequired: {a: ["b"]}},
    documents: [{a: "x", b: "y"}, {a: "x"}],
  },
  crossUnevaluatedProperties: {
    schema: {type: "object", unevaluatedProperties: false},
    documents: [{}],
  },
  crossUnevaluatedItems: {
    schema: {type: "array", unevaluatedItems: false},
    documents: [[]],
  },
};

// --- keywords that cannot act where they are written ---------------------

// Each schema is refused under the default settings because the keyword has
// no effect at that position. With strict schema checking off the same schema
// compiles and judges its documents.
const misplacedKeywords = {
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

// A property named both directly and through a pattern; the overlap is
// refused unless the project allows it.
const overlappingProperty = {
  schema: {
    type: "object",
    properties: {foo: {type: "string"}, other: {type: "number"}},
    patternProperties: {"^f": {type: "number"}},
    required: ["foo", "other"],
  },
  documents: [{foo: "x", other: 1}, {foo: 1, other: 2}, {"far": 3}],
};

// Required names: one declared directly, one declared by a sibling branch of
// the same object, and one nowhere.
const requiredNames = {
  evaluated: {
    schema: {
      type: "object",
      properties: {declared: {type: "string"}},
      allOf: [{properties: {evaluated: {type: "number"}}}],
      required: ["declared", "evaluated"],
    },
    documents: [{declared: "x", evaluated: 1}, {declared: "x"}, {}],
  },
  missing: {
    schema: {
      type: "object",
      properties: {declared: {type: "string"}},
      required: ["declared", "absent"],
    },
    documents: [{declared: "x"}, {}],
  },
};

// --- strict type and tuple diagnostics ------------------------------------

// A union of several types and a fixed tuple whose length bounds are not
// stated are reported, not refused, under the default settings.
const typeDiagnostics = {
  draft7: {
    union: {type: ["string", "number"]},
    tuple: {type: "array", items: [{type: "string"}, {type: "number"}]},
  },
  "2019": {
    union: {type: ["string", "number"]},
    tuple: {type: "array", items: [{type: "string"}, {type: "number"}]},
  },
  "2020": {
    union: {type: ["string", "number"]},
    tuple: {type: "array", prefixItems: [{type: "string"}, {type: "number"}]},
  },
};
const typeDocuments = {
  union: ["text", 1, true],
  tuple: [["a", 1], ["a", "b"], [1, 2]],
};

// Several diagnostics at once, to pin their order: the applicator branch is
// compiled before the object's properties.
const orderedDiagnostics = {
  draft7: {
    type: "object",
    allOf: [{type: "string"}],
    properties: {
      a: {type: ["string", "number"]},
      b: {type: "array", items: [{type: "string"}]},
    },
  },
  "2019": {
    type: "object",
    allOf: [{type: "string"}],
    properties: {
      a: {type: ["string", "number"]},
      b: {type: "array", items: [{type: "string"}]},
    },
  },
  "2020": {
    type: "object",
    allOf: [{type: "string"}],
    properties: {
      a: {type: ["string", "number"]},
      b: {type: "array", prefixItems: [{type: "string"}]},
    },
  },
};
const orderedDocuments = [{a: "x", b: ["y"]}, {a: 1, b: ["y", 2]}];

// --- formats --------------------------------------------------------------

const unknownFormats = {
  root: {type: "string", format: "not-registered"},
  nested: {
    type: "object",
    properties: {a: {type: "string", format: "not-registered"}},
  },
  referenced: {
    definitions: {x: {type: "string", format: "not-registered"}},
    $ref: "#/definitions/x",
  },
  withUnknownKeyword: {type: "string", format: "not-registered", note: 1},
};

const settings = [
  ["default", {}],
  ["strict-log", {strict: "log"}],
  ["strict-schema-log", {strictSchema: "log"}],
  ["strict-off", {strict: false}],
  ["strict-off-no-formats", {strict: false, validateFormats: false}],
  ["strict-schema-off", {strictSchema: false}],
  ["strict-schema-off-no-formats", {strictSchema: false, validateFormats: false}],
  ["formats-off", {validateFormats: false}],
  ["silenced-log", {strict: "log", logger: false}],
  ["silenced-strict-off", {strict: false, logger: false}],
];

// --- schemas that use only keywords the dialect defines -------------------

const accepted = {
  draft7: {
    schema: {
      type: "object",
      required: ["name"],
      properties: {
        name: {type: "string", minLength: 2, format: "handle"},
        age: {type: "integer", minimum: 0},
        role: {type: "string", enum: ["admin", "user"]},
        list: {type: "array", items: {type: "number"}, minItems: 1},
      },
      patternProperties: {"^x-": {type: "string"}},
      additionalProperties: false,
    },
    documents: [
      {name: "ab", age: 3, role: "admin", list: [1, 2]},
      {name: "A!", age: -1, role: "guest", list: []},
      {name: "ab", "x-extra": 4},
    ],
    setup(ajv) {
      ajv.addFormat("handle", /^[a-z]+$/);
    },
    options: {allErrors: true},
  },
  "2019": {
    schema: {
      type: "object",
      properties: {a: {type: "string"}, b: {type: "string"}, c: {type: "number"}},
      dependentRequired: {a: ["b"]},
      dependentSchemas: {a: {properties: {c: {type: "number"}}, required: ["c"]}},
      unevaluatedProperties: false,
    },
    documents: [
      {a: "x", b: "y", c: 1},
      {a: "x"},
      {a: "x", c: "wrong", extra: true},
    ],
    options: {allErrors: true},
  },
  "2020": {
    schema: {
      type: "object",
      required: ["list"],
      properties: {
        list: {
          type: "array",
          prefixItems: [{type: "number"}, {type: "string"}],
          items: {type: "boolean"},
          minItems: 2,
        },
        extra: {type: "string"},
      },
      unevaluatedProperties: false,
    },
    documents: [
      {list: [1, "a", true]},
      {list: [1, 2]},
      {list: [1, "a"], extra: "x", unknown: 1},
    ],
    options: {allErrors: true},
  },
};

const contains = {
  "2019": {
    schema: {type: "array", contains: {type: "number"}, minContains: 2, maxContains: 3},
    documents: [[1, 2], [1, "a"], [1, 2, 3, 4]],
  },
  "2020": {
    schema: {type: "array", contains: {type: "string"}, minContains: 2},
    documents: [["a", "b"], ["a", 1]],
  },
};

// Rewriting options do not change which schemas compile, and must not change
// what validation does with a document.
const rewritingSchema = {
  type: "object",
  required: ["count"],
  properties: {
    count: {type: "number"},
    name: {type: "string", default: "none"},
    extra: {type: "string"},
  },
  additionalProperties: false,
};
const rewritingDocuments = [{count: "5", extra: "x"}, {count: "bad"}, {}];
const rewritingOptions = {coerceTypes: true, useDefaults: true, removeAdditional: "all"};

for (const [dialect, load] of ENTRIES) {
  const Ajv = load();

  // Every position a keyword can take, under the default settings.
  for (const [name, schema] of Object.entries(unknownKeywordPositions)) {
    record(
      dialect,
      "compile",
      name,
      "default",
      attempt(Ajv, {}, schema, [{}, "x"], (ajv) => ajv.addFormat("handle", /^[a-z]+$/)),
    );
  }

  for (const [name, entry] of Object.entries(crossDialect)) {
    record(dialect, "compile", name, "default", attempt(Ajv, {}, entry.schema, entry.documents));
  }

  // Every strictness setting against an unknown keyword, an unknown format,
  // and a schema carrying both.
  for (const [setting, options] of settings) {
    record(
      dialect,
      "compile",
      "unknown-keyword",
      setting,
      attempt(Ajv, options, unknownKeywordPositions.root, ["x"]),
    );
    record(
      dialect,
      "compile",
      "unknown-format",
      setting,
      attempt(Ajv, options, unknownFormats.root, ["x", 1]),
    );
    record(
      dialect,
      "compile",
      "unknown-format-nested",
      setting,
      attempt(Ajv, options, unknownFormats.nested, [{a: "x"}, {a: 1}]),
    );
    record(
      dialect,
      "compile",
      "both",
      setting,
      attempt(Ajv, options, unknownFormats.withUnknownKeyword, ["x"]),
    );
    record(
      dialect,
      "compile",
      "registered-format",
      setting,
      attempt(Ajv, options, {type: "string", format: "handle"}, ["abc", "ABC"], (ajv) =>
        ajv.addFormat("handle", /^[a-z]+$/),
      ),
    );
  }

  // A keyword that cannot act where it is written refuses the schema; with
  // strict schema checking off the same schema compiles and judges documents.
  for (const [name, entry] of Object.entries(misplacedKeywords)) {
    record(dialect, "misplaced", name, "default", attempt(Ajv, {}, entry.schema, entry.documents));
    record(
      dialect,
      "misplaced",
      name,
      "strict-schema-off",
      attempt(Ajv, {strictSchema: false}, entry.schema, entry.documents),
    );
  }

  // A property declared directly and matched by a pattern.
  for (const [setting, options] of [
    ["default", {allErrors: true}],
    ["allowed", {allowMatchingProperties: true, allErrors: true}],
    ["allowed-first-error", {allowMatchingProperties: true}],
    ["reported", {strict: "log", allErrors: true}],
    ["silenced", {strict: "log", logger: false, allErrors: true}],
    ["strict-schema-off", {strictSchema: false, allErrors: true}],
  ]) {
    record(
      dialect,
      "overlap",
      "schema",
      setting,
      attempt(Ajv, options, overlappingProperty.schema, overlappingProperty.documents),
    );
  }

  // Required names declared directly, by a sibling applicator branch, or
  // nowhere.
  for (const [name, entry] of Object.entries(requiredNames)) {
    for (const [setting, options] of [
      ["default", {}],
      ["enabled", {strictRequired: true}],
      ["disabled", {strictRequired: false}],
      ["reported", {strictRequired: "log"}],
      ["silenced", {strictRequired: "log", logger: false}],
    ]) {
      record(
        dialect,
        "required",
        name,
        setting,
        attempt(Ajv, options, entry.schema, entry.documents),
      );
    }
  }

  // A union of several types and a fixed tuple without length bounds are
  // diagnosed, refused, or ignored according to their strictness setting.
  const diagnostics = typeDiagnostics[dialect];
  for (const name of ["union", "tuple"]) {
    const setting = name === "union" ? "strictTypes" : "strictTuples";
    for (const [label, options] of [
      ["default", {}],
      ["refused", {[setting]: true}],
      ["permitted", {[setting]: false}],
      ["reported", {[setting]: "log"}],
      ["silenced", {[setting]: "log", logger: false}],
      ["strict-off", {strict: false}],
      ...(name === "union" ? [["union-allowed", {allowUnionTypes: true}]] : []),
    ]) {
      record(
        dialect,
        "diagnostics",
        name,
        label,
        attempt(Ajv, options, diagnostics[name], typeDocuments[name]),
      );
    }
  }

  // Several diagnostics in one schema, to pin their order.
  record(
    dialect,
    "diagnostics",
    "ordered",
    "default",
    attempt(Ajv, {}, orderedDiagnostics[dialect], orderedDocuments),
  );
  record(
    dialect,
    "diagnostics",
    "ordered",
    "reported",
    attempt(Ajv, {strict: "log"}, orderedDiagnostics[dialect], orderedDocuments),
  );

  // Registered formats through the constructor option, and a format family
  // registered after compilation, still behave as before.
  record(
    dialect,
    "compile",
    "registered-format-option",
    "default",
    attempt(Ajv, {formats: {handle: /^[a-z]+$/}}, {type: "string", format: "handle"}, ["abc", "ABC"]),
  );
  record(
    dialect,
    "compile",
    "format-added-before-compile",
    "default",
    attempt(Ajv, {}, {type: "string", format: "late"}, ["aaa", "b"], (ajv) =>
      ajv.addFormat("late", /^a+$/),
    ),
  );

  // A registered custom keyword makes its name part of the vocabulary.
  record(
    dialect,
    "compile",
    "custom-keyword",
    "default",
    attempt(Ajv, {}, {type: "string", note: 1}, ["x"], (ajv) =>
      ajv.addKeyword({keyword: "note", validate: () => true}),
    ),
  );

  // A logger that does not implement the interface is refused the way ajv
  // refuses it.
  record(
    dialect,
    "compile",
    "invalid-logger",
    "default",
    attempt(Ajv, {logger: {warn() {}}}, {type: "string"}, []),
  );

  // Accepted schemas still compile and validate exactly as before, including
  // reports and rewritten documents.
  const acceptedCase = accepted[dialect];
  record(
    dialect,
    "accepted",
    "schema",
    "default",
    attempt(Ajv, {}, acceptedCase.schema, acceptedCase.documents, acceptedCase.setup),
  );
  record(
    dialect,
    "accepted",
    "schema-all-errors",
    "default",
    attempt(Ajv, acceptedCase.options, acceptedCase.schema, acceptedCase.documents, acceptedCase.setup),
  );
  if (contains[dialect]) {
    record(
      dialect,
      "accepted",
      "contains",
      "default",
      attempt(Ajv, {allErrors: true}, contains[dialect].schema, contains[dialect].documents),
    );
  }
  record(
    dialect,
    "accepted",
    "rewriting",
    "default",
    attempt(Ajv, rewritingOptions, rewritingSchema, rewritingDocuments),
  );

  // Registration: an accepted registered schema compiles through getSchema,
  // and an unknown keyword in one is refused there.
  {
    const messages = [];
    const result = {error: null, messages, verdicts: []};
    try {
      const ajv = new Ajv({logger: capture(messages)});
      ajv.addSchema({
        $id: "https://example.test/accepted",
        type: "object",
        properties: {a: {type: "string"}},
      });
      const validate = ajv.getSchema("https://example.test/accepted");
      for (const document of [{a: "x"}, {a: 1}]) {
        const data = clone(document);
        const valid = validate(data);
        result.verdicts.push({valid, errors: validate.errors, data});
      }
    } catch (error) {
      result.error = describeError(error);
    }
    record(dialect, "registered", "accepted", "default", result);
  }
  {
    const messages = [];
    const result = {error: null, messages, verdicts: []};
    try {
      const ajv = new Ajv({logger: capture(messages)});
      ajv.addSchema({$id: "https://example.test/unknown", type: "object", note: 1});
      ajv.getSchema("https://example.test/unknown");
    } catch (error) {
      result.error = describeError(error);
    }
    record(dialect, "registered", "unknown-keyword", "default", result);
  }
}
