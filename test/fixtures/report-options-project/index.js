"use strict";

// An existing service that relies on ajv's verbose and message-free error
// options across every dialect, custom keyword form, asynchronous validation,
// and standalone generation. It is run unchanged with ajv and with the
// replacement installed in ajv's place; every printed line must match.

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");
const AjvJTD = require("ajv/dist/jtd");
const standaloneCode = require("ajv/dist/standalone");

const results = [];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function record(label, ajv, validate, data) {
  const input = clone(data);
  const valid = validate(input);
  results.push({
    case: label,
    valid,
    errors: validate.errors,
    text: ajv.errorsText(validate.errors),
    data: input,
  });
}

const BLOCKS = {
  type: "object",
  required: ["name", "count"],
  properties: {
    name: {type: "string", minLength: 3},
    count: {type: "integer", minimum: 2, multipleOf: 2},
    tags: {type: "array", items: {type: "string"}, uniqueItems: true},
    mode: {enum: ["a", "b"]},
  },
  additionalProperties: false,
  allOf: [{properties: {mode: {const: "a"}}}],
  anyOf: [{required: ["tags"]}, {properties: {count: {maximum: 10}}}],
};

const BLOCKS_DATA = {
  name: "x",
  count: 3,
  tags: ["a", "a", 5],
  mode: "b",
  extra: true,
};

const draftOptions = [
  ["draft-07 verbose", {verbose: true}],
  ["draft-07 verbose complete", {verbose: true, allErrors: true}],
  ["draft-07 message-free", {messages: false, allErrors: true}],
  ["draft-07 verbose message-free", {verbose: true, messages: false, allErrors: true}],
];

for (const [label, options] of draftOptions) {
  const ajv = new Ajv({strict: false, ...options});
  record(label, ajv, ajv.compile(clone(BLOCKS)), BLOCKS_DATA);
}

{
  const ajv = new Ajv2019({strict: false, verbose: true, allErrors: true});
  const schema = {
    type: "object",
    properties: {value: {type: "integer", multipleOf: 3}},
    required: ["value"],
    dependentRequired: {value: ["unit"]},
    unevaluatedProperties: false,
  };
  record("2019-09 verbose", ajv, ajv.compile(clone(schema)), {value: 4, extra: 1});
}

{
  const ajv = new Ajv2020({strict: false, verbose: true, messages: false, allErrors: true});
  const schema = {
    type: "array",
    prefixItems: [{type: "string"}],
    items: {type: "number"},
    contains: {type: "boolean"},
  };
  record("2020-12 verbose message-free", ajv, ajv.compile(clone(schema)), [1, "x", 3]);
}

{
  const ajv = new AjvJTD({verbose: true, allErrors: true});
  const schema = {
    discriminator: "kind",
    mapping: {
      leaf: {properties: {value: {type: "int8"}}},
      branch: {
        properties: {left: {ref: "node"}},
        optionalProperties: {right: {ref: "node"}},
      },
    },
    definitions: {node: {properties: {kind: {type: "string"}}}},
  };
  record("jtd verbose", ajv, ajv.compile(clone(schema)), {
    kind: "branch",
    left: {kind: 5},
    right: {kind: "branch", other: true},
  });
}

{
  const ajv = new Ajv({strict: false, verbose: true, allErrors: true});
  function evenRule(limit, value) {
    if (value % 2 === 0 && value <= limit) return true;
    evenRule.errors = [
      {keyword: "evenLimit", params: {limit}, message: `must be an even number <= ${limit}`},
    ];
    return false;
  }
  ajv.addKeyword({keyword: "evenLimit", type: "number", errors: true, validate: evenRule});
  ajv.addKeyword({keyword: "triple", type: "number", macro: () => ({multipleOf: 3})});
  const schema = {
    type: "object",
    properties: {
      a: {type: "number", evenLimit: 4},
      b: {type: "number", triple: true},
    },
  };
  record("custom verbose", ajv, ajv.compile(clone(schema)), {a: 5, b: 4});
}

async function asynchronousCases() {
  const ajv = new Ajv({strict: false, verbose: true, allErrors: true});
  ajv.addKeyword({
    keyword: "available",
    type: "string",
    async: true,
    errors: true,
    validate: async (required, value) => {
      if (value !== required) return true;
      throw new Ajv.ValidationError([
        {keyword: "available", params: {required}, message: `"${value}" is reserved`},
      ]);
    },
  });
  const schema = {
    $async: true,
    type: "object",
    required: ["handle"],
    properties: {
      handle: {type: "string", available: "admin"},
      seats: {type: "integer", minimum: 1, multipleOf: 2},
    },
  };
  const validate = ajv.compile(clone(schema));
  try {
    await validate({handle: "admin", seats: 3});
  } catch (error) {
    results.push({
      case: "async verbose",
      valid: false,
      errors: error.errors,
      text: ajv.errorsText(error.errors),
      data: {handle: "admin", seats: 3},
    });
  }
}

function standaloneCases() {
  const generated = path.join(__dirname, "generated");
  fs.mkdirSync(generated, {recursive: true});
  const schema = {
    type: "object",
    required: ["name"],
    properties: {name: {type: "string", minLength: 2}, size: {type: "integer", maximum: 3}},
  };
  for (const [label, options] of [
    ["standalone verbose", {verbose: true, allErrors: true}],
    ["standalone message-free", {messages: false, allErrors: true}],
    ["standalone verbose message-free", {verbose: true, messages: false, allErrors: true}],
  ]) {
    const ajv = new Ajv({strict: false, code: {source: true}, ...options});
    const file = path.join(generated, label.replace(/[^a-z]+/gi, "-") + ".js");
    fs.writeFileSync(file, standaloneCode(ajv, ajv.compile(clone(schema))));
    const validate = require(file);
    record(label, ajv, validate, {name: "x", size: 8});
  }
}

(async () => {
  await asynchronousCases();
  standaloneCases();
  for (const result of results) console.log(JSON.stringify(result));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
