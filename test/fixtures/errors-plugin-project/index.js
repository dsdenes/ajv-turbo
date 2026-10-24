"use strict";

// An existing service that customizes ajv's error messages through the
// published error-message extension. It never names the validator
// implementation: the same script runs with ajv and with the replacement
// installed in ajv's place, and every printed line must match.
//
// The extension requires `allErrors: true`, so each extended validator reports
// the complete error list. A validator without the extension reports the first
// error, as ajv does by default.

const dialect = process.env.DIALECT || "draft7";
const path = require("path");
const Ajv =
  dialect === "2019"
    ? require("ajv/dist/2019")
    : dialect === "2020"
      ? require("ajv/dist/2020")
      : require("ajv");
const addErrors = require("ajv-errors");

const results = [];
const clone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

// The extension must be loading the same validator the program does, or the
// comparison would silently test ajv against itself.
results.push({
  label: "resolution",
  validator: require.resolve("ajv"),
  extension: require.resolve("ajv", {paths: [path.dirname(require.resolve("ajv-errors"))]}),
});

function record(label, ajv, validate, data) {
  const document = clone(data);
  const valid = validate(document);
  results.push({
    label,
    valid,
    errors: clone(validate.errors),
    text: ajv.errorsText(validate.errors),
  });
}

function extended(label, schema, documents) {
  const ajv = new Ajv({allErrors: true, strict: true});
  addErrors(ajv);
  const validate = ajv.compile(schema);
  for (const [name, data] of documents) record(`${label}.${name}`, ajv, validate, data);
}

function plain(label, schema, documents, options = {}) {
  const ajv = new Ajv({strict: true, ...options});
  const validate = ajv.compile(schema);
  for (const [name, data] of documents) record(`${label}.${name}`, ajv, validate, data);
}

// One failing constraint at one location.
extended(
  "single",
  {
    type: "object",
    properties: {foo: {type: "string", errorMessage: "foo must be a string"}},
    required: ["foo"],
  },
  [
    ["invalid", {foo: 1}],
    ["valid", {foo: "x", baz: 1}],
  ],
);

// Every constraint at one location.
extended(
  "all-at-location",
  {
    type: "object",
    properties: {foo: {type: "string", minLength: 3, errorMessage: {_: "bad foo"}}},
  },
  [
    ["invalid", {foo: "a"}],
    ["valid", {foo: "abc"}],
  ],
);

// A failing property of an object.
extended(
  "property",
  {
    type: "object",
    properties: {foo: {type: "string"}},
    errorMessage: {properties: {foo: "foo is wrong"}},
  },
  [
    ["invalid", {foo: 5}],
    ["other", {foo: "x"}],
    ["valid", {foo: "ok", other: true}],
  ],
);

// A message for one keyword's failures, and for one property of that keyword.
extended(
  "keyword",
  {
    type: "object",
    required: ["foo"],
    properties: {
      foo: {
        type: "string",
        minLength: 2,
        errorMessage: {minLength: "too short"},
      },
    },
    errorMessage: {required: {foo: "need foo"}},
  },
  [
    ["required", {}],
    ["length", {foo: "a"}],
    ["valid", {foo: "ab"}],
  ],
);

// Errors inside an array item, addressed from the array's location.
extended(
  "items",
  {
    type: "array",
    items: {type: "string", errorMessage: "each entry must be text"},
  },
  [
    ["invalid", [1, "ok"]],
    ["valid", ["ok"]],
  ],
);

// The extension loaded but no replacement message configured.
const multiple = {
  type: "object",
  properties: {foo: {type: "string"}, baz: {type: "number"}},
  required: ["foo", "baz"],
};
extended(
  "unconfigured",
  multiple,
  [
    ["invalid", {foo: 1}],
    ["valid", {foo: "x", baz: 1}],
  ],
);

// Validators without the extension: default reporting and all-errors
// reporting must stay exactly as they are today.
plain(
  "plain-first",
  multiple,
  [
    ["invalid", {foo: 1}],
    ["valid", {foo: "x", baz: 1}],
  ],
);
plain(
  "plain-all",
  multiple,
  [
    ["invalid", {foo: 1}],
    ["valid", {foo: "x", baz: 1}],
  ],
  {allErrors: true},
);

for (const line of results) console.log(JSON.stringify(line));
