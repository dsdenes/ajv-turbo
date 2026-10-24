"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const Ajv2019 = require("ajv/dist/2019");
const Ajv = require("ajv");
const standalone = require("ajv/dist/standalone");

function emit(value) {
  console.log(JSON.stringify(value));
}

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

// The account a compiled validator publishes about the locations validation
// evaluated. `null` stands for a document-decided value not assigned yet.
function account(validate) {
  const evaluated = validate.evaluated;
  if (evaluated === undefined) return {present: false};
  const props =
    evaluated.props === true
      ? true
      : evaluated.props === undefined
        ? null
        : Object.fromEntries(
            Object.keys(evaluated.props)
              .sort()
              .map((property) => [property, true]),
          );
  return {
    present: true,
    props,
    items: evaluated.items === undefined ? null : evaluated.items,
    dynamicProps: evaluated.dynamicProps,
    dynamicItems: evaluated.dynamicItems,
  };
}

function read(label, validate, documents) {
  emit({label, phase: "before", account: account(validate)});
  for (const document of documents) {
    const valid = validate(clone(document));
    emit({label, phase: "after", document, valid, account: account(validate)});
  }
}

async function readAsync(label, validate, documents) {
  emit({label, phase: "before", account: account(validate)});
  for (const document of documents) {
    let valid = true;
    try {
      await validate(clone(document));
    } catch (error) {
      if (!error || error.validation !== true) throw error;
      valid = false;
    }
    emit({label, phase: "after", document, valid, account: account(validate)});
  }
}

const STATIC = {
  type: "object",
  properties: {declared: {type: "number"}},
  additionalProperties: true,
};

const CONDITIONAL = {
  type: "object",
  properties: {kind: {const: "order"}},
  if: {properties: {kind: {const: "order"}}},
  then: {properties: {total: {type: "number"}}},
  else: {properties: {note: {type: "string"}}},
  unevaluatedProperties: false,
};

const ANY = {
  type: "object",
  properties: {owner: {type: "string"}},
  anyOf: [
    {required: ["card"], properties: {card: {type: "string"}}},
    {required: ["account"], properties: {account: {type: "string"}}},
  ],
};

const PATTERNED = {
  type: "object",
  properties: {owner: {type: "string"}},
  patternProperties: {"^tag_": {type: "string"}},
  unevaluatedProperties: false,
};

const ITEMS = {
  type: "array",
  prefixItems: [{type: "number"}, {type: "string"}],
  items: false,
};

const DOCUMENTS = [
  {},
  {declared: 1, extra: true},
  {kind: "order", total: 7},
  {kind: "refund", note: "late"},
  {owner: "ada", card: "4242"},
  {owner: "ada", account: "acct-1"},
  {owner: "ada", tag_team: "core"},
  {owner: "ada", tag_team: 4},
  [1, "item"],
  [1, "item", 3],
];

function main() {
  const ajv2020 = new Ajv2020({strict: false});
  read("2020 static", ajv2020.compile(STATIC), DOCUMENTS);
  read("2020 conditional", ajv2020.compile(CONDITIONAL), DOCUMENTS);
  read("2020 anyOf", ajv2020.compile(ANY), DOCUMENTS);
  read("2020 pattern", ajv2020.compile(PATTERNED), DOCUMENTS);
  read("2020 items", ajv2020.compile(ITEMS), DOCUMENTS);

  const ajv2019 = new Ajv2019({strict: false});
  read("2019 conditional", ajv2019.compile(CONDITIONAL), DOCUMENTS);
  read("2019 pattern", ajv2019.compile(PATTERNED), DOCUMENTS);

  const untracked = new Ajv({strict: false});
  read("draft7 without tracking", untracked.compile(STATIC), DOCUMENTS);

  const generatedDir = path.join(__dirname, "generated");
  fs.mkdirSync(generatedDir, {recursive: true});
  const sourceAjv = new Ajv2020({strict: false, code: {source: true}});
  const sourceValidate = sourceAjv.compile(CONDITIONAL);
  const generatedFile = path.join(generatedDir, "conditional.js");
  fs.writeFileSync(generatedFile, standalone(sourceAjv, sourceValidate));
  read("2020 standalone", require(generatedFile), DOCUMENTS);

  const asyncSchema = {
    $async: true,
    type: "object",
    properties: {kind: {const: "order"}},
    if: {properties: {kind: {const: "order"}}},
    then: {properties: {total: {type: "number"}}},
  };
  return readAsync("2020 async", ajv2020.compile(asyncSchema), DOCUMENTS);
}

Promise.resolve(main()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
