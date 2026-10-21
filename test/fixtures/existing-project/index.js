"use strict";

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

const ajv = new Ajv({allErrors: true, strict: true});
const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");

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
    kind,
    data: JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")),
  });
}

const results = [];
for (const document of documents) {
  const schema = schemas.get(document.case.split(".")[0]);
  let valid;
  if (document.case.startsWith("text.")) {
    valid = ajv.validate(schema, document.data);
    if (!valid && !ajv.errors) throw new Error("ajv did not report errors for invalid data");
  } else {
    const validate = ajv.compile(schema);
    valid = validate(document.data);
  }
  results.push({case: document.case, valid});
}

const catalog = schemas.get("catalog");
const catalogRef = ajv.getSchema(catalog.$id);
if (!catalogRef) throw new Error("catalog schema was not registered");
results.push({
  case: "catalog.registered.valid",
  valid: catalogRef(JSON.parse(fs.readFileSync(path.join(dataDir, "catalog.valid.json"), "utf8"))),
});

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
