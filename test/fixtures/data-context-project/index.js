"use strict";

// An existing service that validates a value inside a larger document. It
// tells the validator where the value sits, what contains it, and what the
// whole document is, then reads document-sourced schema values and rewritten
// containers from the same call. It is run unchanged with ajv and with the
// replacement installed in ajv's place; every printed line must match.

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");
const AjvJTD = require("ajv/dist/jtd");
const standaloneCode = require("ajv/dist/standalone");

const generatedDir = path.join(__dirname, "generated");
fs.rmSync(generatedDir, {recursive: true, force: true});
fs.mkdirSync(generatedDir, {recursive: true});

const rows = [];

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function documentContext() {
  return {
    instancePath: "/document/items/2",
    parentData: {document: {items: [null, null, {a: "5", c: 1}]}},
    parentDataProperty: "item",
    rootData: {limit: 5, document: true},
  };
}

function record(label, validate, data, dataCxt) {
  const valid = validate(data, dataCxt);
  rows.push({
    label,
    valid,
    errors: validate.errors,
    instancePath: dataCxt === undefined ? undefined : dataCxt.instancePath,
  });
  return data;
}

async function recordAsync(label, validate, data, dataCxt) {
  try {
    const result = await validate(data, dataCxt);
    rows.push({label, settled: "resolved", data: result});
  } catch (error) {
    rows.push({
      label,
      settled: "rejected",
      errors: error.errors,
      instancePath: dataCxt === undefined ? undefined : dataCxt.instancePath,
    });
  }
}

const REPORT_SCHEMA = {
  type: "object",
  properties: {a: {type: "integer"}, b: {type: "boolean"}},
  required: ["b"],
  additionalProperties: false,
};

const DATA_SCHEMA = {
  type: "object",
  properties: {n: {type: "number", minimum: {$data: "/limit"}}},
  required: {$data: "/requiredNames"},
};

const REWRITE_SCHEMA = {
  type: "object",
  properties: {a: {type: "integer", default: 9}},
  additionalProperties: false,
};

const ASYNC_SCHEMA = {
  $async: true,
  type: "object",
  properties: {a: {type: "integer"}, b: {type: "boolean"}},
  required: ["b"],
  additionalProperties: false,
};

const JTD_SCHEMA = {
  properties: {a: {type: "int32"}},
  optionalProperties: {b: {type: "boolean"}},
  additionalProperties: false,
};

function reportCases(label, validate) {
  record(`${label}/valid`, validate, {a: 1, b: true}, documentContext());
  record(`${label}/invalid`, validate, {a: "5", c: 1}, documentContext());
  record(`${label}/invalid-no-context`, validate, {a: "5", c: 1});
  record(`${label}/invalid-location-only`, validate, {a: "5"}, {instancePath: "/elsewhere"});
}

function dataCases(label, validate) {
  const rootData = {limit: 5, requiredNames: ["n", "a"]};
  record(`${label}/within`, validate, {n: 5, a: 1}, {instancePath: "/sub", rootData});
  record(`${label}/violates`, validate, {n: 3, a: 1}, {instancePath: "/sub", rootData});
  record(`${label}/absent`, validate, {n: 7}, {instancePath: "/sub", rootData: {}});
  record(`${label}/wrong-limit`, validate, {n: 7, a: 1}, {
    instancePath: "/sub",
    rootData: {limit: "5", requiredNames: ["n"]},
  });
  record(`${label}/wrong-required`, validate, {n: 5, a: 1}, {
    instancePath: "/sub",
    rootData: {limit: 5, requiredNames: "n"},
  });
  record(`${label}/no-context-absent`, validate, {n: 7});
  record(`${label}/no-context-root`, validate, {
    n: 3,
    limit: 5,
    requiredNames: ["n"],
  });
}

function coercionCases(label, validate) {
  const held = {slot: "7"};
  const rewritten = record(
    `${label}/coerced`,
    validate,
    held.slot,
    {instancePath: "/held", parentData: held, parentDataProperty: "slot"},
  );
  rows.push({label: `${label}/coerced-container`, container: held, data: rewritten});

  const untouched = {slot: "7"};
  const detached = record(`${label}/coerced-no-container`, validate, untouched.slot, {
    instancePath: "/detached",
  });
  rows.push({label: `${label}/detached-container`, container: untouched, data: detached});

  record(`${label}/coerced-no-context`, validate, "7");
}

function rewriteCases(label, validate) {
  const held = {item: {extra: true}};
  const rewritten = record(`${label}/rewritten`, validate, held.item, {
    instancePath: "/held/item",
    parentData: held,
    parentDataProperty: "item",
  });
  rows.push({label: `${label}/rewritten-container`, container: held, data: rewritten});

  const detached = record(`${label}/rewritten-no-container`, validate, {extra: true});
  rows.push({label: `${label}/detached-container`, data: detached});
}

function writeStandalone(name, ajv, validate) {
  const file = path.join(generatedDir, `${name}.js`);
  fs.writeFileSync(file, standaloneCode(ajv, validate));
  return require(file);
}

const DIALECTS = [
  ["draft7", Ajv],
  ["2019", Ajv2019],
  ["2020", Ajv2020],
];

async function main() {
  for (const [dialect, Dialect] of DIALECTS) {
    const ajv = new Dialect({allErrors: true, code: {source: true}});
    const report = ajv.compile(clone(REPORT_SCHEMA));
    reportCases(`${dialect}/compiled/report`, report);
    reportCases(
      `${dialect}/standalone/report`,
      writeStandalone(`${dialect}-report`, ajv, report),
    );

    const dataAjv = new Dialect({allErrors: true, $data: true, code: {source: true}});
    const dataValidate = dataAjv.compile(clone(DATA_SCHEMA));
    dataCases(`${dialect}/compiled/data`, dataValidate);
    dataCases(
      `${dialect}/standalone/data`,
      writeStandalone(`${dialect}-data`, dataAjv, dataValidate),
    );

    const coercionAjv = new Dialect({coerceTypes: true, code: {source: true}});
    const coerce = coercionAjv.compile({type: "integer"});
    coercionCases(`${dialect}/compiled/coercion`, coerce);
    coercionCases(
      `${dialect}/standalone/coercion`,
      writeStandalone(`${dialect}-coercion`, coercionAjv, coerce),
    );

    const rewriteAjv = new Dialect({useDefaults: true, removeAdditional: true, code: {source: true}});
    const rewrite = rewriteAjv.compile(clone(REWRITE_SCHEMA));
    rewriteCases(`${dialect}/compiled/rewrite`, rewrite);
    rewriteCases(
      `${dialect}/standalone/rewrite`,
      writeStandalone(`${dialect}-rewrite`, rewriteAjv, rewrite),
    );

    const asyncAjv = new Dialect({allErrors: true, code: {source: true}});
    const asynchronous = asyncAjv.compile(clone(ASYNC_SCHEMA));
    await recordAsync(
      `${dialect}/compiled/async-valid`,
      asynchronous,
      {a: 1, b: true},
      documentContext(),
    );
    await recordAsync(`${dialect}/compiled/async-invalid`, asynchronous, {a: "5"}, documentContext());
    await recordAsync(`${dialect}/compiled/async-no-context`, asynchronous, {a: "5"});

    const asyncStandalone = writeStandalone(`${dialect}-async`, asyncAjv, asynchronous);
    await recordAsync(
      `${dialect}/standalone/async-valid`,
      asyncStandalone,
      {a: 1, b: true},
      documentContext(),
    );
    await recordAsync(
      `${dialect}/standalone/async-invalid`,
      asyncStandalone,
      {a: "5"},
      documentContext(),
    );
    await recordAsync(`${dialect}/standalone/async-no-context`, asyncStandalone, {a: "5"});
  }

  const jtd = new AjvJTD({allErrors: true, code: {source: true}});
  const jtdValidate = jtd.compile(clone(JTD_SCHEMA));
  reportCases("jtd/compiled/report", jtdValidate);
  reportCases(
    "jtd/standalone/report",
    writeStandalone("jtd-report", jtd, jtdValidate),
  );

  for (const row of rows) console.log(JSON.stringify(row));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
