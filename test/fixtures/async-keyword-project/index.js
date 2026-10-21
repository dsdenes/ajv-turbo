"use strict";

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const {ValidationError} = require("ajv");

const ajv = new Ajv({allErrors: true, strict: true});
const singleErrorAjv = new Ajv({strict: true});

// The project's own asynchronous rules, registered through ajv's extension
// surface before any schema is compiled.
function registerKeywords(instance) {
  instance.addKeyword({
    keyword: "normalize",
    type: "string",
    async: true,
    modifying: true,
    validate: async (enabled, value, parentSchema, dataCxt) => {
      await Promise.resolve();
      dataCxt.parentData[dataCxt.parentDataProperty] = value.trim().toLowerCase();
      return true;
    },
  });
  instance.addKeyword({
    keyword: "slug",
    type: "string",
    async: true,
    validate: async (enabled, value) => /^[a-z][a-z0-9-]*$/.test(value),
  });
  instance.addKeyword({
    keyword: "audit",
    type: "string",
    async: true,
    errors: true,
    validate: async (prefix, value) => {
      await Promise.resolve();
      if (value.startsWith(prefix)) return true;
      throw new ValidationError([
        {keyword: "audit", params: {prefix}, message: `must start with ${prefix}`},
      ]);
    },
  });
  instance.addKeyword({
    keyword: "evenSeats",
    type: "number",
    async: true,
    validate: async (limit, value) =>
      Number.isInteger(value) && value >= 1 && value <= limit && value % 2 === 0,
  });
  instance.addKeyword({
    keyword: "present",
    async: true,
    schema: false,
    validate: async (value) => typeof value === "string" && value.length > 0,
  });
  instance.addKeyword({
    keyword: "nonEmpty",
    async: true,
    validate: async (enabled, value) => value !== "" && value !== null && value !== undefined,
  });
}
registerKeywords(ajv);
registerKeywords(singleErrorAjv);

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "schemas", "account.json"), "utf8"),
);
const dataDir = path.join(__dirname, "data");

async function settle(instance, validate, data, label) {
  const input = structuredClone(data);
  const result = validate(input);
  if (!(result instanceof Promise)) {
    return {
      case: label,
      promise: false,
      valid: result,
      errors: validate.errors,
      data: input,
      text: instance.errorsText(validate.errors),
    };
  }
  try {
    const resolved = await result;
    return {
      case: label,
      promise: true,
      valid: true,
      errors: null,
      validateErrors: validate.errors,
      data: resolved,
      text: "No errors",
    };
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return {
      case: label,
      promise: true,
      valid: false,
      errors: error.errors,
      validateErrors: validate.errors,
      data: input,
      text: instance.errorsText(error.errors),
    };
  }
}

async function main() {
  const results = [];
  for (const file of fs.readdirSync(dataDir).sort()) {
    if (!file.endsWith(".json")) continue;
    const label = file.replace(/\.json$/, "");
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));

    const validate = ajv.compile(schema);
    results.push(await settle(ajv, validate, data, label));

    const singleValidate = singleErrorAjv.compile(schema);
    results.push(await settle(singleErrorAjv, singleValidate, data, `${label}.first`));
  }

  const viaApi = ajv.validate(schema, structuredClone(JSON.parse(
    fs.readFileSync(path.join(dataDir, "account.valid.json"), "utf8"),
  )));
  results.push({
    case: "account.valid.api",
    promise: viaApi instanceof Promise,
    data: await viaApi,
  });

  for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
