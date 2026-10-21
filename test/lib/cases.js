"use strict";

const fs = require("fs");
const path = require("path");

const FIXTURES = path.join(__dirname, "..", "fixtures");
const SUITE_DIR = path.join(FIXTURES, "json-schema-test-suite");
const BENCH_SCHEMA_DIR = path.join(FIXTURES, "ajv-benchmark-schemas");

// Draft-07 validation keywords plus the annotations that never change a
// verdict. Everything else makes a schema ineligible for the covered subset.
const ALLOWED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$ref",
  "$comment",
  "title",
  "description",
  "default",
  "examples",
  "readOnly",
  "writeOnly",
  "definitions",
  "type",
  "enum",
  "const",
  "multipleOf",
  "maximum",
  "exclusiveMaximum",
  "minimum",
  "exclusiveMinimum",
  "maxLength",
  "minLength",
  "pattern",
  "items",
  "additionalItems",
  "maxItems",
  "minItems",
  "uniqueItems",
  "contains",
  "maxProperties",
  "minProperties",
  "required",
  "properties",
  "patternProperties",
  "additionalProperties",
  "dependencies",
  "propertyNames",
  "if",
  "then",
  "else",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
]);

function subschemas(schema) {
  const result = [];
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return result;
  for (const key of ["additionalProperties", "additionalItems", "contains", "propertyNames", "not", "if", "then", "else"]) {
    if (schema[key] !== undefined) result.push(schema[key]);
  }
  for (const key of ["definitions", "properties", "patternProperties"]) {
    if (schema[key] && typeof schema[key] === "object") result.push(...Object.values(schema[key]));
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(schema[key])) result.push(...schema[key]);
  }
  if (Array.isArray(schema.items)) result.push(...schema.items);
  else if (schema.items !== undefined) result.push(schema.items);
  if (schema.dependencies && typeof schema.dependencies === "object") {
    for (const value of Object.values(schema.dependencies)) {
      if (value && typeof value === "object" && !Array.isArray(value)) result.push(value);
    }
  }
  return result;
}

function isCoveredSchema(schema) {
  if (typeof schema === "boolean") return true;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  for (const key of Object.keys(schema)) {
    if (!ALLOWED_KEYWORDS.has(key)) return false;
  }
  return subschemas(schema).every(isCoveredSchema);
}

function readJsonFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readJsonFiles(full));
    else if (entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function readRemoteSchemas() {
  const remotes = [];
  const dir = path.join(SUITE_DIR, "remotes");
  for (const file of readJsonFiles(dir)) {
    const relative = path.relative(dir, file).split(path.sep).join("/");
    remotes.push({
      uri: `http://localhost:1234/${relative}`,
      schema: JSON.parse(fs.readFileSync(file, "utf8")),
    });
  }
  return remotes;
}

function normaliseGroup(group, source) {
  const tests = (group.tests || []).map((test) => ({
    description: test.description,
    data: test.data,
    valid: test.valid,
  }));
  return {source, description: group.description, schema: group.schema, tests};
}

function collectSuiteCases() {
  const cases = [];
  for (const file of readJsonFiles(path.join(SUITE_DIR, "tests", "draft7"))) {
    const relative = path.relative(SUITE_DIR, file).split(path.sep).join("/");
    const groups = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const group of groups) {
      if (isCoveredSchema(group.schema)) cases.push(normaliseGroup(group, relative));
    }
  }
  return cases;
}

function collectBenchmarkCases() {
  const cases = [];
  for (const file of readJsonFiles(BENCH_SCHEMA_DIR)) {
    const relative = path.relative(FIXTURES, file).split(path.sep).join("/");
    const groups = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const group of groups) {
      if (isCoveredSchema(group.schema)) cases.push(normaliseGroup(group, relative));
    }
  }
  return cases;
}

module.exports = {
  isCoveredSchema,
  collectSuiteCases,
  collectBenchmarkCases,
  readRemoteSchemas,
  readJsonFiles,
  SUITE_DIR,
  FIXTURES,
};
