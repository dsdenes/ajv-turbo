"use strict";

// An existing project that configures its validator with settings ajv has
// removed, settings it has deprecated but still honours, and settings it
// supports. It is run unchanged with ajv and with the replacement installed in
// ajv's place; every printed line must match.
//
// With `--console` the project configures no diagnostic handler at all, so the
// same explanations reach the console and the two runs' standard error text is
// compared instead.

const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");
const AjvJTD = require("ajv/dist/jtd");

// Values are the ones an ajv project could plausibly have kept from an older
// release. None of these settings has any other effect in ajv 8.
const REMOVED = {
  errorDataPath: "property",
  format: true,
  nullable: true,
  jsonPointers: true,
  extendRefs: true,
  missingRefs: "ignore",
  processCode: (code) => code,
  sourceCode: true,
  strictDefaults: true,
  strictKeywords: true,
  uniqueItems: true,
  unknownFormats: "ignore",
  cache: true,
  serialize: (schema) => schema,
  ajvErrors: true,
};

const DEPRECATED = {
  ignoreKeywordsWithRef: true,
  jsPropertySyntax: true,
  unicode: true,
};

// Settings ajv supports and says nothing about.
const SUPPORTED = {
  allErrors: true,
  coerceTypes: true,
  useDefaults: true,
  removeAdditional: true,
  validateFormats: false,
  verbose: true,
  messages: true,
  ownProperties: true,
  code: {optimize: 1},
};

const DIALECTS = [
  ["draft-07", Ajv],
  ["2019-09", Ajv2019],
  ["2020-12", Ajv2020],
  ["jtd", AjvJTD],
];

function channel() {
  const messages = [];
  return {
    messages,
    log: (...args) => messages.push(["log", ...args]),
    warn: (...args) => messages.push(["warn", ...args]),
    error: (...args) => messages.push(["error", ...args]),
  };
}

function schemaFor(name) {
  return name === "jtd"
    ? {type: "boolean"}
    : {
        type: "object",
        required: ["a"],
        properties: {a: {type: "number"}},
        additionalProperties: false,
      };
}

// Invalid documents are rejected at the root, so the settings this epic must
// not give new meaning to (`jsPropertySyntax` rewrites nested error paths in
// ajv) cannot mask the comparison. The diagnostics, not the setting's own
// semantics, are what the two runs must agree on.
function documentsFor(name) {
  return name === "jtd" ? [true, "x"] : [{a: 1}, "not-an-object"];
}

const MUTATING_SCHEMA = {
  type: "object",
  properties: {
    a: {type: "number"},
    b: {type: "number", default: 7},
  },
  additionalProperties: false,
};

function snapshot(validate, document) {
  const data = structuredClone(document);
  const valid = validate(data);
  return {
    valid,
    data,
    errors: validate.errors === null ? null : JSON.parse(JSON.stringify(validate.errors)),
  };
}

// Constructs one validator and records both the diagnostics it reports and
// what it does with the validation documents.
function observe(Dialect, options, schema, documents) {
  const captured = channel();
  const ajv = new Dialect({
    strict: false,
    validateSchema: false,
    logger: captured,
    ...options,
  });
  const validate = ajv.compile(schema);
  return {
    messages: captured.messages,
    results: documents.map((document) => snapshot(validate, document)),
  };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function main() {
  if (process.argv.includes("--console")) {
    // No logger is configured: every explanation goes to the console, which
    // the test captures and compares between the two runs.
    for (const [name, Dialect] of DIALECTS) {
      for (const [option, value] of Object.entries({...REMOVED, ...DEPRECATED})) {
        new Dialect({strict: false, [option]: value});
        console.log(JSON.stringify({case: `${name} console ${option}`}));
      }
    }
    return;
  }

  const rows = [];

  for (const [name, Dialect] of DIALECTS) {
    const schema = schemaFor(name);
    const documents = documentsFor(name);

    const supported = observe(Dialect, SUPPORTED, schema, documents);
    rows.push({case: `${name} supported only`, messages: supported.messages});

    const absent = observe(Dialect, {}, schema, documents);

    for (const [option, value] of Object.entries(REMOVED)) {
      const observed = observe(Dialect, {[option]: value}, schema, documents);
      rows.push({
        case: `${name} removed ${option}`,
        messages: observed.messages,
        sameAsAbsent: same(observed.results, absent.results),
      });
    }

    for (const [option, value] of Object.entries(DEPRECATED)) {
      const observed = observe(Dialect, {[option]: value}, schema, documents);
      rows.push({
        case: `${name} deprecated ${option}`,
        messages: observed.messages,
        sameAsAbsent: same(observed.results, absent.results),
      });
    }

    const combined = observe(Dialect, {...REMOVED, ...DEPRECATED}, schema, documents);
    rows.push({
      case: `${name} combined`,
      messages: combined.messages,
      sameAsAbsent: same(combined.results, absent.results),
    });

    // The mutating configuration runs with and without one removed and one
    // deprecated setting; the diagnostics must not change what it rewrites.
    if (name !== "jtd") {
      const mutated = observe(
        Dialect,
        {...SUPPORTED, nullable: true, unicode: true},
        MUTATING_SCHEMA,
        [{a: "1", extra: true}],
      );
      const mutatedAbsent = observe(Dialect, SUPPORTED, MUTATING_SCHEMA, [{a: "1", extra: true}]);
      rows.push({
        case: `${name} mutating same as absent`,
        messages: mutated.messages,
        sameAsAbsent: same(mutated.results, mutatedAbsent.results),
      });
    }
  }

  for (const row of rows) console.log(JSON.stringify(row));
}

main();
