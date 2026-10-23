"use strict";

// A service that validates telemetry documents with standalone JSON Type
// Definition validators. It reads its schemas and documents from its own
// files, generates a module for each validator, requires the generated
// modules immediately, and prints every verdict with the error report and the
// summary line, so the same run can be replayed against another validator.

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv/dist/jtd");
const standaloneCode = require("ajv/dist/standalone");

const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");
const generatedDir = path.join(__dirname, "generated");

const options = {code: {source: true}};
const ajv = new Ajv({...options, allErrors: true});
const firstErrorAjv = new Ajv(options);

const schemas = new Map();
for (const file of fs.readdirSync(schemaDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const name = file.slice(0, -".json".length);
  schemas.set(name, JSON.parse(fs.readFileSync(path.join(schemaDir, file), "utf8")));
}

for (const [name, schema] of schemas) {
  ajv.addSchema(schema, name);
  firstErrorAjv.addSchema(schema, name);
}

fs.mkdirSync(generatedDir, {recursive: true});
function generate(file, code) {
  fs.writeFileSync(path.join(generatedDir, file), code);
}

const generated = {};
for (const name of schemas.keys()) {
  generate(name + ".all.js", standaloneCode(ajv, ajv.getSchema(name)));
  generate(name + ".first.js", standaloneCode(firstErrorAjv, firstErrorAjv.getSchema(name)));
  generated[name + ".all"] = require(path.join(generatedDir, name + ".all.js"));
  generated[name + ".first"] = require(path.join(generatedDir, name + ".first.js"));
}

const registry = {};
for (const name of schemas.keys()) registry[name] = name;
generate("registry.js", standaloneCode(ajv, registry));
const registryModule = require(path.join(generatedDir, "registry.js"));

const results = [];
function record(entry) {
  results.push(entry);
}

const validators = [
  ...Array.from(schemas.keys(), (name) => ({
    mode: name + ".all",
    validate: generated[name + ".all"],
    instance: ajv,
  })),
  ...Array.from(schemas.keys(), (name) => ({
    mode: name + ".first",
    validate: generated[name + ".first"],
    instance: firstErrorAjv,
  })),
  ...Array.from(schemas.keys(), (name) => ({
    mode: "registry." + name,
    validate: registryModule[name],
    instance: ajv,
  })),
];

for (const file of fs.readdirSync(dataDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const [name, kind] = file.split(".");
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
  for (const {mode, validate, instance} of validators) {
    if (!mode.startsWith(name + ".") && mode !== "registry." + name) continue;
    const valid = validate(data);
    record({
      case: `${name}.${kind}`,
      mode,
      valid,
      errors: validate.errors,
      text: instance.errorsText(validate.errors),
    });
  }
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
