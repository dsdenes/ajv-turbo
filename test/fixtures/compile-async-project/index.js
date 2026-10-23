"use strict";

// An existing service that compiles schemas whose references it registers
// lazily: `loadSchema` fetches the referenced schema while compilation waits.
// The service is run unchanged with ajv and with the replacement installed in
// ajv's place; every printed row must match.

const fs = require("fs");
const path = require("path");

const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");

const SCHEMA_DIR = path.join(__dirname, "schemas");
const DATA_DIR = path.join(__dirname, "data");

const results = [];

function push(label, fields) {
  results.push({case: label, ...fields});
}

function schema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name + ".json"), "utf8"));
}

function document(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name + ".json"), "utf8"));
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

// The loader the service configures. Counts per URI expose how often
// compilation consulted it; a small delay makes concurrent compilations
// overlap, as a network fetch would.
function loader(counts) {
  return async (uri) => {
    counts[uri] = (counts[uri] || 0) + 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    switch (uri) {
      case "https://example.com/schemas/address":
        return schema("address");
      case "https://example.com/schemas/customer":
        return schema("customer");
      case "https://example.com/meta/profile":
        return schema("meta-profile");
      case "https://example.com/schemas/broken":
        return {$id: uri, type: 42};
      case "https://example.com/schemas/offline":
        throw new Error("offline schema store");
      default:
        throw new Error("cannot load " + uri);
    }
  };
}

function countsObject(counts) {
  const out = {};
  for (const uri of Object.keys(counts).sort()) out[uri] = counts[uri];
  return out;
}

async function attempt(build) {
  try {
    return {completed: true, value: await build()};
  } catch (error) {
    return {completed: false, name: error.constructor.name, message: error.message};
  }
}

function orderSchema() {
  return {
    $id: "https://example.com/schemas/order",
    type: "object",
    required: ["customer"],
    properties: {
      customer: {$ref: "https://example.com/schemas/customer"}
    }
  };
}

function addressOrderSchema(id) {
  return {
    $id: id,
    type: "object",
    properties: {
      address: {$ref: "https://example.com/schemas/address"}
    }
  };
}

function record(label, ajv, validate, data) {
  const valid = validate(clone(data));
  push(label, {
    valid,
    errors: clone(validate.errors),
    text: ajv.errorsText(validate.errors)
  });
}

async function dialectRows(name, Dialect) {
  {
    // Compiling a schema whose references are not registered yet: the loader
    // supplies the customer schema, which in turn references the address
    // schema; both become ordinary registrations.
    const counts = Object.create(null);
    const ajv = new Dialect({strict: false, loadSchema: loader(counts)});
    const compiled = await attempt(() => ajv.compileAsync(orderSchema()));
    push(`${name} compiles with loaded references`, {completed: compiled.completed});
    if (compiled.completed) {
      record(`${name} loaded reference verdicts`, ajv, compiled.value, document("order.valid"));
      record(`${name} loaded reference refusal`, ajv, compiled.value, document("order.invalid"));
      push(`${name} loaded schemas are registered`, {
        customer: Boolean(ajv.getSchema("https://example.com/schemas/customer")),
        address: Boolean(ajv.getSchema("https://example.com/schemas/address")),
        counts: countsObject(counts)
      });
      const address = ajv.getSchema("https://example.com/schemas/address");
      push(`${name} loaded schema validates itself`, {
        valid: address(document("order.valid").customer.address),
        errors: clone(address.errors)
      });

      const before = {...counts};
      const second = await attempt(() =>
        ajv.compileAsync(addressOrderSchema("https://example.com/schemas/second-order"))
      );
      push(`${name} later compilation reuses the registration`, {
        completed: second.completed,
        valid: second.completed ? second.value(document("order.valid")) : null,
        newLoads: Object.keys(counts).filter((uri) => counts[uri] !== before[uri])
      });
    }
  }

  {
    // Two compilations that need the same missing schemas at the same time.
    const counts = Object.create(null);
    const ajv = new Dialect({strict: false, loadSchema: loader(counts)});
    const both = await attempt(() =>
      Promise.all([
        ajv.compileAsync(addressOrderSchema("https://example.com/schemas/left")),
        ajv.compileAsync(addressOrderSchema("https://example.com/schemas/right"))
      ])
    );
    push(`${name} concurrent compilations share one load`, {
      completed: both.completed,
      verdicts: both.completed
        ? both.value.map((validate) => validate(document("order.valid")))
        : null,
      counts: countsObject(counts)
    });
  }

  {
    // The asynchronous operation without a configured loader.
    const ajv = new Dialect({strict: false});
    let returned;
    let failure;
    try {
      returned = ajv.compileAsync(orderSchema());
    } catch (error) {
      failure = {name: error.constructor.name, message: error.message};
    }
    push(`${name} async compile requires a loader`, {
      failure,
      returnedPromise: returned instanceof Promise
    });
  }

  {
    // A reference whose enclosing schema is already registered cannot be
    // supplied by the loader.
    const counts = Object.create(null);
    const ajv = new Dialect({strict: false, loadSchema: loader(counts)});
    ajv.addSchema({
      $id: "https://example.com/schemas/catalog",
      $defs: {present: {type: "integer"}}
    });
    const missing = await attempt(() =>
      ajv.compileAsync({$ref: "https://example.com/schemas/catalog#/$defs/missing"})
    );
    push(`${name} registered schema without the reference`, {
      completed: missing.completed,
      name: missing.name,
      message: missing.message,
      counts: countsObject(counts)
    });
  }

  {
    // A meta-schema the instance does not have is loaded before the schema is
    // checked, and then governs the schema's acceptance and refusal.
    const counts = Object.create(null);
    const ajv = new Dialect({strict: false, loadSchema: loader(counts)});
    const accepted = await attempt(() =>
      ajv.compileAsync({
        $id: "https://example.com/schemas/profile",
        $schema: "https://example.com/meta/profile",
        marker: true,
        type: "object",
        properties: {nickname: {type: "string"}}
      })
    );
    push(`${name} meta-schema loaded`, {completed: accepted.completed});
    if (accepted.completed) {
      record(`${name} meta-schema governed verdicts`, ajv, accepted.value, {nickname: "ada"});
      record(`${name} meta-schema governed refusal`, ajv, accepted.value, {nickname: 7});
    }
    const refused = await attempt(() =>
      ajv.compileAsync({
        $id: "https://example.com/schemas/unmarked",
        $schema: "https://example.com/meta/profile",
        marker: "yes"
      })
    );
    push(`${name} meta-schema refuses a schema`, {
      completed: refused.completed,
      name: refused.name,
      message: refused.message,
      counts: countsObject(counts)
    });
  }

  {
    // The loader rejects.
    const counts = Object.create(null);
    const ajv = new Dialect({strict: false, loadSchema: loader(counts)});
    const rejected = await attempt(() =>
      ajv.compileAsync({$ref: "https://example.com/schemas/offline"})
    );
    push(`${name} loader rejection`, {
      completed: rejected.completed,
      name: rejected.name,
      message: rejected.message,
      counts: countsObject(counts)
    });
  }

  {
    // The loader supplies a schema the validator refuses.
    const counts = Object.create(null);
    const ajv = new Dialect({strict: false, loadSchema: loader(counts)});
    const refused = await attempt(() =>
      ajv.compileAsync({$ref: "https://example.com/schemas/broken"})
    );
    push(`${name} loaded schema refused`, {
      completed: refused.completed,
      name: refused.name,
      message: refused.message,
      counts: countsObject(counts)
    });
  }

  {
    // Synchronous compilation never consults the loader.
    const counts = Object.create(null);
    const ajv = new Dialect({strict: false, loadSchema: loader(counts)});
    const sync = await attempt(() =>
      ajv.compile({$ref: "https://example.com/schemas/address"})
    );
    push(`${name} synchronous compile ignores the loader`, {
      completed: sync.completed,
      name: sync.name,
      message: sync.message,
      counts: countsObject(counts)
    });
  }
}

async function main() {
  await dialectRows("draft-07", Ajv);
  await dialectRows("2019-09", Ajv2019);
  await dialectRows("2020-12", Ajv2020);
  for (const row of results) console.log(JSON.stringify(row));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
