"use strict";

// A service that validates telemetry documents with ajv's JSON Type
// Definition validator. It reads its schemas and documents from its own files
// and prints each verdict with the error report and the summary line, so the
// same run can be replayed against another validator.

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv/dist/jtd");

const ajv = new Ajv({allErrors: true});
const firstErrorAjv = new Ajv();

const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");

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
  if (!schema) throw new Error(`no schema named ${document.schema}`);

  const validate = ajv.compile(schema);
  const valid = validate(document.data);
  results.push({
    case: document.case,
    valid,
    errors: validate.errors,
    text: ajv.errorsText(validate.errors),
  });

  const firstValidate = firstErrorAjv.getSchema(document.schema);
  const firstValid = firstValidate(document.data);
  results.push({
    case: `${document.case}.first`,
    valid: firstValid,
    errors: firstValidate.errors,
    text: firstErrorAjv.errorsText(firstValidate.errors),
  });
}

const documentSchema = schemas.get("document");
const documentRef = ajv.getSchema("document");
if (!documentRef) throw new Error("document schema was not registered");
const registered = documentRef(JSON.parse(fs.readFileSync(path.join(dataDir, "document.valid.json"), "utf8")));
results.push({
  case: "document.registered.valid",
  valid: registered,
  errors: documentRef.errors,
  text: ajv.errorsText(documentRef.errors),
});

const validated = ajv.validate(documentSchema, {name: 1});
results.push({
  case: "document.validate.invalid",
  valid: validated,
  errors: ajv.errors,
  text: ajv.errorsText(ajv.errors),
});

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
