"use strict";

// A gateway that already uses ajv with its own validation rules and its own
// validation context. Every rule records the `this` value ajv binds when the
// project passes a context to the validator, and decides validity from it. The
// project itself is never edited: the same file runs against ajv and against
// the replacement.

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const {ValidationError} = require("ajv");

const context = {tenant: "acme", requestId: "req-1"};
const otherContext = {tenant: "other", requestId: "req-2"};

function createInstance(options) {
  const ajv = new Ajv(options);
  const calls = [];

  // Describes the value a rule received through `this`, proving identity for
  // the objects the project created rather than only their shape.
  const record = (value) => {
    if (value === context) calls.push("matching-context");
    else if (value === otherContext) calls.push("other-context");
    else if (value === ajv) calls.push("ajv-instance");
    else if (value === globalThis) calls.push("global");
    else if (value === undefined) calls.push("undefined");
    else calls.push("other");
  };

  ajv.addKeyword({
    keyword: "tenant",
    type: "string",
    validate: function (expected, value) {
      record(this);
      return Boolean(this) && this.tenant === expected;
    },
  });

  ajv.addKeyword({
    keyword: "tenantHandle",
    validate: function (enabled, value) {
      record(this);
      return Boolean(this) && this.tenant === "acme";
    },
  });

  ajv.addKeyword({
    keyword: "tenantGate",
    validate: function (enabled, value) {
      record(this);
      return Boolean(this) && this.tenant === "acme";
    },
  });

  ajv.addKeyword({
    keyword: "asyncTenant",
    type: "string",
    async: true,
    validate: async function (expected, value) {
      record(this);
      await Promise.resolve();
      return Boolean(this) && this.tenant === expected;
    },
  });

  ajv.addKeyword({
    keyword: "asyncSlug",
    type: "string",
    async: true,
    validate: async function (enabled, value) {
      record(this);
      await Promise.resolve();
      return /^[a-z][a-z0-9-]*$/.test(value);
    },
  });

  ajv.addKeyword({
    keyword: "compiledTenant",
    compile(expected) {
      return function (value) {
        record(this);
        return Boolean(this) && this.tenant === expected;
      };
    },
  });

  ajv.addKeyword({
    keyword: "tenantSplit",
    macro: () => ({type: "string", tenant: "acme"}),
  });

  ajv.addKeyword({
    keyword: "contextOnly",
    schema: false,
    validate: function (value) {
      record(this);
      return Boolean(this) && this.tenant === "acme";
    },
  });

  ajv.addKeyword({
    keyword: "recordOnly",
    validate: function (enabled, value) {
      record(this);
      return true;
    },
  });

  return {ajv, calls};
}

// One instance applies the project's normal reporting (every violation); one
// applies ajv's default first-violation reporting, so error order is compared
// in both modes.
const contextsAll = createInstance({passContext: true, allErrors: true, strict: true});
const contextsFirst = createInstance({passContext: true, strict: true});
// A project that does not enable context passing: its rules keep receiving the
// Ajv instance, as they always have.
const plainAll = createInstance({allErrors: true, strict: true});

const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");

const schemas = new Map();
for (const file of fs.readdirSync(schemaDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, file), "utf8"));
  const name = file.slice(0, -".json".length);
  schemas.set(name, schema);
  for (const instance of [contextsAll, contextsFirst, plainAll]) {
    instance.ajv.addSchema(schema, name);
  }
}

function readData(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), "utf8"));
}

function invoke(validate, data, contextKind) {
  switch (contextKind) {
    case "matching":
      return validate.call(context, data);
    case "other":
      return validate.call(otherContext, data);
    case "undefined":
      return validate.call(undefined, data);
    case "null":
      return validate.call(null, data);
    default:
      return validate(data);
  }
}

async function settle(instance, schemaName, contextKind, label) {
  const validate = instance.ajv.getSchema(schemaName);
  if (!validate) throw new Error(`schema "${schemaName}" was not registered`);
  instance.calls.length = 0;
  const data = structuredClone(readData(label));
  const result = invoke(validate, data, contextKind);
  let entry;
  if (result instanceof Promise) {
    try {
      await result;
      entry = {valid: true, errors: null};
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      entry = {valid: false, errors: error.errors};
    }
  } else {
    entry = {valid: result, errors: validate.errors};
  }
  return {
    case: `${schemaName} ${label} ${contextKind || "none"}`,
    promise: result instanceof Promise,
    valid: entry.valid,
    errors: entry.errors,
    text: instance.ajv.errorsText(entry.errors),
    calls: instance.calls.slice(),
  };
}

async function main() {
  const cases = [];
  for (const instance of [contextsAll, contextsFirst]) {
    const mode = instance === contextsAll ? "all errors" : "first error";
    const plan = [
      ["account", "account.valid", "matching"],
      ["account", "account.valid", "other"],
      ["account", "account.valid", "undefined"],
      ["account", "account.valid", "null"],
      ["account", "account.valid", "none"],
      ["account", "account.invalid", "matching"],
      ["gateway", "account.valid", "matching"],
      ["gateway", "account.valid", "other"],
      ["gateway", "account.valid", "none"],
      ["gateway", "account.invalid", "matching"],
      ["route", "route.valid", "matching"],
      ["route", "route.valid", "other"],
      ["route", "route.valid", "none"],
      ["route", "route.invalid", "matching"],
      ["async-service", "async.valid", "matching"],
      ["async-service", "async.valid", "other"],
      ["async-service", "async.valid", "none"],
      ["async-service", "async.invalid", "matching"],
      ["async-account", "async.valid", "matching"],
      ["async-account", "async.valid", "other"],
      ["async-account", "async.valid", "none"],
      ["async-account", "async.invalid", "matching"],
      ["async-gateway", "async.valid", "matching"],
      ["async-gateway", "async.valid", "other"],
      ["async-gateway", "async.valid", "none"],
      ["async-gateway", "async.invalid", "matching"],
      ["compiled", "tenant.valid", "matching"],
      ["compiled", "tenant.valid", "other"],
      ["compiled", "tenant.valid", "none"],
      ["macro", "tenant.valid", "matching"],
      ["macro", "tenant.valid", "other"],
      ["macro", "tenant.valid", "none"],
      ["form", "form.valid", "matching"],
      ["form", "form.valid", "other"],
      ["form", "form.valid", "none"],
    ];
    for (const [schemaName, label, contextKind] of plan) {
      cases.push({...await settle(instance, schemaName, contextKind, label), mode});
    }
  }

  for (const contextKind of ["matching", "other", "none"]) {
    cases.push({
      ...await settle(plainAll, "plain", contextKind, "form.valid"),
      mode: "no context passing",
    });
  }

  for (const entry of cases) process.stdout.write(JSON.stringify(entry) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
