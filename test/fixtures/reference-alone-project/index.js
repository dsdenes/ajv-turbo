"use strict";

// An existing project that asks ajv to honour a reference alone. It is run
// unchanged with ajv and with the replacement installed in ajv's place; every
// printed line must match, including verdicts, error reports, and modules
// generated for standalone use.

const fs = require("fs");
const path = require("path");

const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");
const standaloneCode = require("ajv/dist/standalone");

const DEFINITIONS = {
  number: {type: "number"},
  text: {type: "string", minLength: 3},
  object: {type: "object", required: ["a"]},
  never: false,
  inner: {$ref: "#/definitions/number", type: "string", minLength: 9},
};

// Every schema pairs a reference with constraints the documents would
// otherwise violate, or leaves the reference by itself. `withRule` names a
// constraint that belongs to the declared type's rule group, which decides
// whether ajv still keeps its separate type guard.
const SCHEMAS = {
  companion: {
    $ref: "#/definitions/number",
    type: "string",
    minLength: 10,
    const: 7,
    enum: [8],
    required: ["x"],
    properties: {x: {type: "string"}},
    allOf: [{minimum: 100}],
  },
  typeOnly: {$ref: "#/definitions/number", type: "string"},
  typeWithRule: {$ref: "#/definitions/number", type: "string", minLength: 10},
  referenceAlone: {$ref: "#/definitions/text"},
  annotations: {$ref: "#/definitions/number", title: "n", description: "d"},
  nested: {allOf: [{$ref: "#/definitions/number", type: "string", minLength: 9}]},
  booleanTarget: {$ref: "#/definitions/never", minimum: 3},
  targetWithCompanion: {$ref: "#/definitions/inner"},
  objectCompanion: {
    $ref: "#/definitions/object",
    required: ["b"],
    properties: {b: {type: "string"}},
    additionalProperties: false,
  },
};

const DOCUMENTS = {
  companion: [5, "hello", 7],
  typeOnly: [5, "hi", true],
  typeWithRule: [5, "hi"],
  referenceAlone: ["hello", "hi", 5],
  annotations: [5, "hello"],
  nested: [5, "hi"],
  booleanTarget: [5],
  targetWithCompanion: [5, "hi"],
  objectCompanion: [{a: 1}, {a: 1, b: 2}, "no"],
};

const ASYNC_SCHEMA = {
  $async: true,
  $ref: "#/definitions/number",
  type: "string",
  minLength: 10,
  const: 7,
};

const DIALECTS = [
  ["draft-07", Ajv],
  ["2019-09", Ajv2019],
  ["2020-12", Ajv2020],
];

const SETTINGS = [
  ["on", {ignoreKeywordsWithRef: true}],
  ["on all errors", {ignoreKeywordsWithRef: true, allErrors: true}],
  ["off", {ignoreKeywordsWithRef: false}],
  ["absent", {}],
];

const results = [];

function record(row) {
  results.push(row);
}

function schemaFor(name) {
  return {definitions: DEFINITIONS, ...SCHEMAS[name]};
}

function snapshot(validate, document) {
  const data = clone(document);
  const valid = validate(data);
  return {
    valid,
    errors: validate.errors === null ? null : clone(validate.errors),
  };
}

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function compile(label, ajv, schema) {
  try {
    return {validate: ajv.compile(clone(schema))};
  } catch (error) {
    record({case: label, compiled: false, message: error.message});
    return {};
  }
}

// A generated module is written into the project's own scratch directory and
// loaded the way a consumer loads the file it just produced.
function generatedModule(label, code) {
  const directory = path.join(__dirname, "generated");
  fs.mkdirSync(directory, {recursive: true});
  const file = path.join(directory, label.replace(/[^a-z0-9]+/gi, "-") + ".js");
  fs.writeFileSync(file, code);
  delete require.cache[file];
  return require(file);
}

async function main() {
  for (const [dialect, Dialect] of DIALECTS) {
    for (const [setting, options] of SETTINGS) {
      const messages = [];
      const logger = {
        log() {},
        warn: (message) => messages.push(message),
        error: (message) => messages.push(message),
      };
      const ajv = new Dialect({
        strict: false,
        validateSchema: false,
        code: {source: true},
        logger,
        ...options,
      });

      for (const name of Object.keys(SCHEMAS)) {
        const label = `${dialect} ${setting} ${name}`;
        const {validate} = compile(label, ajv, schemaFor(name));
        if (!validate) continue;

        for (const document of DOCUMENTS[name]) {
          record({case: label + " " + JSON.stringify(document), ...snapshot(validate, document)});
        }

        let code;
        try {
          code = standaloneCode(ajv, validate);
        } catch (error) {
          record({case: label + " standalone", generated: false, message: error.message});
          continue;
        }
        const generated = generatedModule(
          `generated ${label}`,
          `${code}\nmodule.exports = module.exports.default || module.exports;`,
        );
        for (const document of DOCUMENTS[name]) {
          record({
            case: label + " standalone " + JSON.stringify(document),
            ...snapshot(generated, document),
          });
        }
      }

      const asyncLabel = `${dialect} ${setting} async`;
      const compiled = ajv.compile(clone({definitions: DEFINITIONS, ...ASYNC_SCHEMA}));
      for (const document of [5, "hello", 7]) {
        try {
          await compiled(document);
          record({case: asyncLabel + " " + JSON.stringify(document), valid: true, errors: null});
        } catch (error) {
          record({
            case: asyncLabel + " " + JSON.stringify(document),
            valid: false,
            errors: error.errors === undefined ? null : clone(error.errors),
          });
        }
      }

      record({case: `${dialect} ${setting} diagnostics`, messages});
    }
  }

  for (const row of results) process.stdout.write(JSON.stringify(row) + "\n");
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack) + "\n");
  process.exitCode = 1;
});
