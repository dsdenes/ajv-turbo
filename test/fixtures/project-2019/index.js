"use strict";

const Ajv2019 = require("ajv/dist/2019");

function configure(options) {
  const ajv = new Ajv2019({strict: true, strictTuples: false, ...options});
  ajv.addFormat("handle", /^[a-z][a-z0-9_]*$/);
  ajv.addFormat("even-count", {
    type: "number",
    validate: (value) => Number.isInteger(value) && value % 2 === 0,
  });
  ajv.addFormat("async-token", {
    type: "string",
    async: true,
    validate: async (value) => value.startsWith("tok_"),
  });
  ajv.addKeyword({
    keyword: "port",
    type: "number",
    validate: (limit, value) => Number.isInteger(value) && value >= 1 && value <= limit,
  });
  ajv.addKeyword({
    keyword: "available",
    type: "string",
    async: true,
    validate: async (required, value) => required !== true || value !== "taken",
  });
  return ajv;
}

const schemas = {
  tree: {
    $id: "https://example.test/tree",
    $defs: {
      node: {
        $recursiveAnchor: true,
        type: "object",
        properties: {
          value: {type: "number"},
          children: {type: "array", items: {$recursiveRef: "#"}},
        },
        required: ["value"],
        unevaluatedProperties: false,
      },
    },
    $ref: "#/$defs/node",
  },
  account: {
    $defs: {
      base: {
        type: "object",
        properties: {kind: {type: "string"}},
        required: ["kind"],
      },
    },
    type: "object",
    $ref: "#/$defs/base",
    properties: {
      card: {type: "string"},
      callback: {type: "string"},
      extra: {type: "boolean"},
    },
    dependentRequired: {card: ["callback"]},
    dependentSchemas: {
      kind: {properties: {extra: {type: "boolean"}}},
    },
    unevaluatedProperties: false,
  },
  numbers: {
    type: "array",
    items: [{type: "number"}],
    unevaluatedItems: {type: "string"},
  },
  bounded: {
    type: "array",
    contains: {type: "number", minimum: 10},
    minContains: 2,
    maxContains: 3,
  },
  ports: {
    type: "object",
    properties: {
      handle: {type: "string", format: "handle"},
      count: {type: "number", format: "even-count"},
      port: {type: "number", port: 1024},
    },
    required: ["handle"],
    unevaluatedProperties: false,
  },
  asyncDocument: {
    $async: true,
    type: "object",
    properties: {
      id: {type: "string", format: "async-token"},
      name: {type: "string", available: true},
    },
    required: ["id", "name"],
    dependentRequired: {id: ["name"]},
    unevaluatedProperties: false,
  },
  coercing: {
    type: "object",
    properties: {
      count: {type: "number"},
      label: {type: "string", default: "none"},
    },
    required: ["count"],
    unevaluatedProperties: false,
  },
};

const documents = {
  tree: [
    {value: 1, children: [{value: 2}, {value: 3, children: [{value: 4}]}]},
    {value: 1, children: [{value: "two"}]},
    {value: 1, extra: true},
  ],
  account: [
    {kind: "card", card: "4242", callback: "https://example.test/cb"},
    {kind: "card", card: "4242"},
    {kind: "card", card: "4242", callback: "cb", unexpected: 1},
    {kind: "cash", extra: true},
  ],
  numbers: [
    [1, "later", "later"],
    [1, 2],
    [1, "later", 3],
  ],
  bounded: [
    [1, 2, 10, 11],
    [1, 2, 3, 4],
    [1, 10, 11, 12, 13],
    [10, 11, 12],
  ],
  ports: [
    {handle: "api", count: 4, port: 8080},
    {handle: "BAD", count: 3, port: 9000},
    {handle: "api", count: 4, port: 2000},
  ],
  asyncDocument: [
    {id: "tok_ok", name: "service"},
    {id: "bad", name: "service"},
    {id: "tok_ok", name: "taken"},
    {id: "tok_ok"},
  ],
  coercing: [{count: "5", extra: true}, {label: 7}],
};

async function runCase(ajv, name, schema, documentsForSchema, options) {
  const validate = ajv.compile(schema);
  const rows = [];
  for (const document of documentsForSchema) {
    const data = structuredClone(document);
    let valid;
    let errors;
    let rewritten;
    try {
      valid = await validate(data);
      errors = validate.errors;
      rewritten = data;
    } catch (error) {
      if (!error || error.validation !== true) throw error;
      valid = false;
      errors = error.errors;
      rewritten = data;
    }
    rows.push({
      case: `${name}:${options.mode}`,
      document,
      valid,
      errors,
      text: ajv.errorsText(errors),
      rewritten,
    });
  }
  return rows;
}

async function main() {
  const modes = [
    {mode: "allErrors", options: {allErrors: true}},
    {mode: "first", options: {}},
    {
      mode: "rewrite",
      options: {coerceTypes: true, useDefaults: true, removeAdditional: "all"},
    },
  ];
  const rows = [];
  for (const {mode, options} of modes) {
    const ajv = configure(options);
    for (const name of Object.keys(schemas)) {
      if (mode === "rewrite" && name !== "coercing") continue;
      if (mode !== "rewrite" && name === "coercing") continue;
      rows.push(...(await runCase(ajv, name, schemas[name], documents[name], {mode})));
    }
  }
  for (const row of rows) console.log(JSON.stringify(row));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
