"use strict";

// An existing service that writes generated validators into its own codebase
// and runs them later. Two schemas are generated: one takes a numeric limit
// and the required member names from the document through ajv's data-reference
// option, the other takes nothing from the document. It is run unchanged with
// ajv and with the replacement installed in ajv's place; every printed line
// must match.

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const standaloneCode = require("ajv/dist/standalone");

const generatedDir = path.join(__dirname, "generated");
fs.rmSync(generatedDir, {recursive: true, force: true});
fs.mkdirSync(generatedDir, {recursive: true});

// A document names its own limit and the members it must carry.
const documentSchema = {
  $id: "https://example.test/document-limits",
  type: "object",
  properties: {
    limit: {type: "number"},
    requiredNames: {type: "array", items: {type: "string"}},
    items: {type: "array", items: {type: "number", maximum: {$data: "/limit"}}},
  },
  required: {$data: "/requiredNames"},
  additionalProperties: false,
};

// The same shape with the limit and the required names fixed in the schema.
const plainSchema = {
  $id: "https://example.test/plain-limits",
  type: "object",
  properties: {
    limit: {type: "number"},
    requiredNames: {type: "array", items: {type: "string"}},
    items: {type: "array", items: {type: "number", maximum: 5}},
  },
  required: ["requiredNames"],
  additionalProperties: false,
};

const documents = [
  ["valid", {limit: 5, requiredNames: ["limit", "items"], items: [1, 5]}],
  ["valid-empty-items", {limit: 5, requiredNames: ["limit"], items: []}],
  ["maximum-fails", {limit: 5, requiredNames: ["limit"], items: [1, 6]}],
  ["maximum-limit-two", {limit: 2, requiredNames: ["limit"], items: [3]}],
  ["required-fails", {limit: 5, requiredNames: ["limit", "items"]}],
  ["required-absent", {limit: 5, items: [1]}],
  ["required-wrong-type", {limit: 5, requiredNames: "limit", items: [1]}],
  ["limit-absent", {requiredNames: ["items"], items: [6]}],
  ["limit-wrong-type", {limit: "5", requiredNames: ["limit"], items: [6]}],
  ["both-wrong-type", {limit: [], requiredNames: {}, items: [1]}],
  ["items-not-numbers", {limit: 5, requiredNames: ["limit"], items: ["x", null]}],
  ["extra-property", {limit: 5, requiredNames: ["limit"], items: [1], extra: true}],
];

// Each reporting mode is a compile-time setting, so it gets its own module.
const modes = [
  ["default", {}],
  ["complete", {allErrors: true}],
  ["verbose", {allErrors: true, verbose: true}],
  ["message-free", {allErrors: true, messages: false}],
];

const schemas = [
  ["document", documentSchema, true],
  ["plain", plainSchema, true],
  ["plain-without-option", plainSchema, false],
];

const results = [];
function record(entry) {
  results.push(entry);
}

for (const [schemaName, schema, dataReferences] of schemas) {
  for (const [mode, modeOptions] of modes) {
    const options = {strict: false, code: {source: true}, ...modeOptions};
    if (dataReferences) options.$data = true;
    const ajv = new Ajv(options);
    const validate = ajv.compile(structuredClone(schema));
    const file = path.join(generatedDir, `${schemaName}-${mode}.js`);
    fs.writeFileSync(file, standaloneCode(ajv, validate));
    const generated = require(file);
    for (const [name, document] of documents) {
      const input = structuredClone(document);
      const valid = generated(input);
      record({
        case: name,
        schema: schemaName,
        mode,
        valid,
        errors: generated.errors,
        text: ajv.errorsText(generated.errors),
      });
    }
  }
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
