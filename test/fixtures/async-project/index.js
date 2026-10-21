"use strict";

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

const asyncAjv = new Ajv({allErrors: true, strict: true});
const singleErrorAjv = new Ajv({strict: true});

const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");

const schemas = new Map();
for (const file of fs.readdirSync(schemaDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const name = file.slice(0, -".json".length);
  const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, file), "utf8"));
  schemas.set(name, schema);
  if (schema.$id) {
    asyncAjv.addSchema(schema);
    singleErrorAjv.addSchema(schema);
  }
}

const documents = [];
for (const file of fs.readdirSync(dataDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const [name, kind] = file.split(".");
  documents.push({
    case: `${name}.${kind}`,
    data: JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")),
  });
}

function text(ajv, errors) {
  return ajv.errorsText(errors);
}

async function settle(ajv, validate, data, label) {
  const input = structuredClone(data);
  const result = validate(input);
  if (!(result instanceof Promise)) {
    return {
      case: label,
      promise: false,
      synchronous: typeof result === "boolean",
      valid: result,
      errors: validate.errors,
      validateErrors: validate.errors,
      data: input,
      text: text(ajv, validate.errors),
    };
  }
  try {
    const resolved = await result;
    return {
      case: label,
      promise: true,
      synchronous: false,
      valid: true,
      errors: null,
      validateErrors: validate.errors,
      data: resolved,
      text: "No errors",
    };
  } catch (error) {
    if (!(error instanceof Ajv.ValidationError)) throw error;
    return {
      case: label,
      promise: true,
      synchronous: false,
      valid: false,
      errors: error.errors,
      validateErrors: validate.errors,
      data: input,
      text: text(ajv, error.errors),
    };
  }
}

async function main() {
  const results = [];
  for (const document of documents) {
    const schema = schemas.get(document.case.split(".")[0]);
    const validate = asyncAjv.compile(schema);
    results.push(await settle(asyncAjv, validate, document.data, document.case));

    const singleValidate = singleErrorAjv.compile(schema);
    results.push(await settle(singleErrorAjv, singleValidate, document.data, `${document.case}.first`));

    const viaApi = asyncAjv.validate(schema, structuredClone(document.data));
    if (!(viaApi instanceof Promise)) {
      results.push({
        case: `${document.case}.api`,
        promise: false,
        synchronous: true,
        valid: viaApi,
        errors: asyncAjv.errors,
        ajvErrors: asyncAjv.errors,
        text: text(asyncAjv, asyncAjv.errors),
      });
    } else {
      try {
        const resolved = await viaApi;
        results.push({
          case: `${document.case}.api`,
          promise: true,
          synchronous: false,
          valid: true,
          errors: null,
          ajvErrors: asyncAjv.errors,
          data: resolved,
          text: "No errors",
        });
      } catch (error) {
        if (!(error instanceof Ajv.ValidationError)) throw error;
        results.push({
          case: `${document.case}.api`,
          promise: true,
          synchronous: false,
          valid: false,
          errors: error.errors,
          ajvErrors: asyncAjv.errors,
          text: text(asyncAjv, error.errors),
        });
      }
    }
  }

  const job = schemas.get("job");
  const registered = asyncAjv.getSchema(job.$id);
  if (!registered) throw new Error("job schema was not registered");
  results.push(
    await settle(
      asyncAjv,
      registered,
      JSON.parse(fs.readFileSync(path.join(dataDir, "job.valid.json"), "utf8")),
      "job.registered.valid",
    ),
  );

  // The same service also validates a schema that does not request
  // asynchronous validation; that result must still be immediate.
  const syncAjv = new Ajv({allErrors: true, strict: true});
  for (const file of ["sync.valid.json", "sync.invalid.json"]) {
    const validate = syncAjv.compile(schemas.get("sync"));
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
    results.push(await settle(syncAjv, validate, data, file.replace(/\.json$/, "")));
  }

  for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
