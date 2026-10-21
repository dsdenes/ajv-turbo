"use strict";

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const {ValidationError} = require("ajv");

const formats = {
  slug: {
    type: "string",
    async: true,
    validate: async (value) => {
      await Promise.resolve();
      return /^[a-z][a-z0-9-]*$/.test(value);
    },
  },
  even: {
    type: "number",
    async: true,
    validate: async (value) => Number.isInteger(value) && value % 2 === 0,
  },
  hex: {
    type: "string",
    async: true,
    validate: async (value) => /^[0-9a-f]+$/.test(value),
  },
};

const ajv = new Ajv({allErrors: true, strict: true, formats});
const singleErrorAjv = new Ajv({strict: true, formats});
const formatsDisabledAjv = new Ajv({allErrors: true, strict: true, validateFormats: false, formats});

for (const instance of [ajv, singleErrorAjv, formatsDisabledAjv]) {
  instance.addFormat("carr-prefix", /^carr-/);
}

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "schemas", "shipment.json"), "utf8"),
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

    results.push(await settle(ajv, ajv.compile(schema), data, label));
    results.push(
      await settle(singleErrorAjv, singleErrorAjv.compile(schema), data, `${label}.first`),
    );
    results.push(
      await settle(
        formatsDisabledAjv,
        formatsDisabledAjv.compile(schema),
        data,
        `${label}.formats-disabled`,
      ),
    );
  }

  for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
