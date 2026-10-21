"use strict";

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

const ajv = new Ajv({allErrors: true, strict: true});
const singleErrorAjv = new Ajv({strict: true});

// The project's own validation rules, registered through ajv's extension
// surface before any schema is compiled.
function registerKeywords(instance) {
  instance.addKeyword({
    keyword: "port",
    type: "number",
    validate: (limit, value) => Number.isInteger(value) && value >= 1 && value <= limit,
  });
  instance.addKeyword({
    keyword: "slug",
    type: "string",
    validate: (enabled, value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
  });
  instance.addKeyword({
    keyword: "paired",
    type: "array",
    validate: (enabled, value) => value.length % 2 === 0,
  });
  instance.addKeyword({
    keyword: "populated",
    validate: (enabled, value) => value !== null && value !== undefined && value !== "",
  });
}
registerKeywords(ajv);
registerKeywords(singleErrorAjv);

const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");

const schemas = new Map();
for (const file of fs.readdirSync(schemaDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const name = file.slice(0, -".json".length);
  const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, file), "utf8"));
  schemas.set(name, schema);
  if (schema.$id) ajv.addSchema(schema);
  if (schema.$id) singleErrorAjv.addSchema(schema);
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
  const validate = ajv.compile(schema);
  const valid = validate(document.data);
  results.push({case: document.case, valid, errors: validate.errors, text: ajv.errorsText(validate.errors)});

  const singleValidate = singleErrorAjv.compile(schema);
  const singleValid = singleValidate(document.data);
  results.push({
    case: `${document.case}.first`,
    valid: singleValid,
    errors: singleValidate.errors,
    text: singleErrorAjv.errorsText(singleValidate.errors),
  });

  if (document.case.startsWith("service.")) {
    const viaApi = ajv.validate(schema, document.data);
    results.push({
      case: `${document.case}.api`,
      valid: viaApi,
      errors: ajv.errors,
      text: ajv.errorsText(ajv.errors),
    });
  }
}

const service = schemas.get("service");
const registered = ajv.getSchema(service.$id);
if (!registered) throw new Error("service schema was not registered");
const registeredValid = registered(JSON.parse(fs.readFileSync(path.join(dataDir, "service.valid.json"), "utf8")));
results.push({
  case: "service.registered.valid",
  valid: registeredValid,
  errors: registered.errors,
  text: ajv.errorsText(registered.errors),
});

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
