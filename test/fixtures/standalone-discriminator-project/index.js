"use strict";

// An existing service that generates standalone validators for tagged unions.
// The same schema is compiled through the draft-07, 2019-09, and 2020-12 entry
// points, and a union without the annotation is generated next to it, so a
// schema that does not carry the annotation keeps its verdicts and reports. It
// is run unchanged with ajv and with the replacement installed in ajv's place;
// every printed line must match.

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");
const standaloneCode = require("ajv/dist/standalone");

const generatedDir = path.join(__dirname, "generated");
fs.rmSync(generatedDir, {recursive: true, force: true});
fs.mkdirSync(generatedDir, {recursive: true});

// A tagged union whose members reject properties no member allows, so a
// generated validator must run the selected member and its report.
const taggedUnion = {
  type: "object",
  discriminator: {propertyName: "kind"},
  required: ["kind"],
  oneOf: [
    {
      properties: {kind: {const: "circle"}, radius: {type: "number"}},
      required: ["kind", "radius"],
      additionalProperties: false,
    },
    {
      properties: {kind: {const: "rect"}, width: {type: "number"}, height: {type: "number"}},
      required: ["kind", "width", "height"],
      additionalProperties: false,
    },
  ],
};

// The same members without the annotation: the oneOf rule decides.
const plainUnion = {
  type: "object",
  required: ["kind"],
  oneOf: taggedUnion.oneOf,
};

const documents = [
  ["circle", {kind: "circle", radius: 2}],
  ["rect", {kind: "rect", width: 2, height: 3}],
  ["unknown-tag", {kind: "oval"}],
  ["numeric-tag", {kind: 1}],
  ["null-tag", {kind: null}],
  ["missing-tag", {radius: 2}],
  ["missing-member-property", {kind: "circle"}],
  ["missing-second-member-property", {kind: "rect", width: 2}],
  ["property-no-member-allows", {kind: "circle", radius: 2, extra: true}],
  ["wrong-member-property-type", {kind: "rect", width: "2", height: 3}],
  ["empty-object", {}],
  ["string", "not-an-object"],
  ["null", null],
  ["array", [1]],
  ["number", 42],
];

const modes = [
  ["default", {}],
  ["complete", {allErrors: true}],
  ["verbose", {allErrors: true, verbose: true}],
  ["message-free", {allErrors: true, messages: false}],
];

const dialects = [
  ["draft-07", Ajv],
  ["2019-09", Ajv2019],
  ["2020-12", Ajv2020],
];

const schemas = [
  ["tagged", taggedUnion],
  ["plain", plainUnion],
];

const results = [];
for (const [dialect, Constructor] of dialects) {
  for (const [schemaName, schema] of schemas) {
    for (const [mode, modeOptions] of modes) {
      const ajv = new Constructor({
        strict: false,
        code: {source: true},
        discriminator: true,
        ...modeOptions,
      });
      const validate = ajv.compile(structuredClone(schema));
      const file = path.join(generatedDir, `${dialect}-${schemaName}-${mode}.js`);
      fs.writeFileSync(file, standaloneCode(ajv, validate));
      const generated = require(file);
      for (const [name, document] of documents) {
        const input = structuredClone(document);
        const valid = generated(input);
        results.push({
          case: name,
          schema: schemaName,
          dialect,
          mode,
          valid,
          errors: generated.errors,
          text: ajv.errorsText(generated.errors),
        });
      }
    }
  }
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
