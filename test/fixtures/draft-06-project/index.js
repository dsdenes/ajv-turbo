"use strict";

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
// The documented way to enable draft-06 in ajv v8: register the draft-06
// meta-schema published with the package.
const draft6MetaSchema = require("ajv/dist/refs/json-schema-draft-06.json");

function createAjv(options) {
  const ajv = new Ajv(options);
  ajv.addMetaSchema(draft6MetaSchema);
  return ajv;
}

const ajv = createAjv({allErrors: true, strict: true});
const singleErrorAjv = createAjv({strict: true});

const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");
const malformedDir = path.join(__dirname, "malformed");

const schemas = new Map();
for (const file of fs.readdirSync(schemaDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const name = file.slice(0, -".json".length);
  const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, file), "utf8"));
  schemas.set(name, schema);
  if (schema.$id) ajv.addSchema(schema);
}

const documents = [];
for (const file of fs.readdirSync(dataDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const [name, kind] = file.split(".");
  documents.push({
    case: `${name}.${kind}`,
    schema: name,
    data: JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")),
  });
}

const results = [];
for (const document of documents) {
  const schema = schemas.get(document.schema);
  const validate = ajv.compile(schema);
  const valid = validate(document.data);
  results.push({
    case: document.case,
    valid,
    errors: validate.errors,
    text: ajv.errorsText(validate.errors),
  });

  const singleValidate = singleErrorAjv.compile(schema);
  const singleValid = singleValidate(document.data);
  results.push({
    case: `${document.case}.first`,
    valid: singleValid,
    errors: singleValidate.errors,
    text: singleErrorAjv.errorsText(singleValidate.errors),
  });
}

const catalog = schemas.get("catalog");
const catalogRef = ajv.getSchema(catalog.$id);
if (!catalogRef) throw new Error("catalog schema was not registered");
const catalogValid = catalogRef(
  JSON.parse(fs.readFileSync(path.join(dataDir, "catalog.valid.json"), "utf8")),
);
results.push({
  case: "catalog.registered.valid",
  valid: catalogValid,
  errors: catalogRef.errors,
  text: ajv.errorsText(catalogRef.errors),
});

// Malformed draft-06 schemas are presented through the same instance. ajv
// refuses each at compile time; the project reports the refusal so both runs
// can be compared.
for (const file of fs.readdirSync(malformedDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const name = file.slice(0, -".json".length);
  const schema = JSON.parse(fs.readFileSync(path.join(malformedDir, file), "utf8"));
  const instance = createAjv({strict: true});
  let message;
  try {
    instance.compile(schema);
    message = "compiled";
  } catch (error) {
    message = error.message;
  }
  results.push({case: `malformed.${name}`, message});
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
