"use strict";

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

const ajv = new Ajv({coerceTypes: true, useDefaults: true, removeAdditional: true, allErrors: true});

ajv.addFormat("slug", /^[a-z][a-z0-9-]*$/);
ajv.addFormat("available", {
  type: "string",
  async: true,
  validate: async (value) => value !== "taken",
});
ajv.addKeyword({
  keyword: "port",
  type: "integer",
  validate: (limit, value) => Number.isInteger(value) && value >= 1 && value <= limit,
});

const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");

const schemas = new Map();
for (const file of fs.readdirSync(schemaDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const name = file.slice(0, -".json".length);
  schemas.set(name, JSON.parse(fs.readFileSync(path.join(schemaDir, file), "utf8")));
}

const documents = [];
for (const file of fs.readdirSync(dataDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const [name, kind] = file.split(".");
  documents.push({
    case: `${name}.${kind}`,
    name,
    data: JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")),
  });
}

async function main() {
  const results = [];
  for (const document of documents) {
    const schema = schemas.get(document.name);
    const validate = ajv.compile(schema);
    if (validate.$async) {
      try {
        const data = await validate(document.data);
        results.push({
          case: document.case,
          settled: "resolved",
          data,
          errors: validate.errors,
        });
      } catch (error) {
        results.push({
          case: document.case,
          settled: "rejected",
          data: document.data,
          errors: error.errors,
          text: ajv.errorsText(error.errors),
          errorsOnValidate: validate.errors,
        });
      }
    } else {
      const valid = validate(document.data);
      results.push({
        case: document.case,
        settled: "synchronous",
        valid,
        data: document.data,
        errors: validate.errors,
        text: ajv.errorsText(validate.errors),
      });
    }
  }
  for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((error) => {
  process.stderr.write(error.stack + "\n");
  process.exitCode = 1;
});
