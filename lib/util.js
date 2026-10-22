"use strict";

const {escapePointerToken} = require("./uri");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// fast-deep-equal semantics, which is what ajv uses for enum/const/uniqueItems.
function deepEqual(a, b) {
  if (a === b) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return a !== a && b !== b;
}

function escapeInstancePath(path) {
  return path
    .split("/")
    .map((segment) => escapePointerToken(decodeURIComponentSafe(segment)))
    .join("/");
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function checkDataTypes(types, data, strictNumbers) {
  for (const type of types) {
    if (checkDataType(type, data, strictNumbers)) return true;
  }
  return false;
}

// ajv counts Unicode code points, not UTF-16 code units, for string limits.
function ucs2length(value) {
  let length = 0;
  for (let position = 0; position < value.length; position++) {
    length++;
    const code = value.charCodeAt(position);
    if (code >= 0xd800 && code <= 0xdbff && position + 1 < value.length) {
      const next = value.charCodeAt(position + 1);
      if ((next & 0xfc00) === 0xdc00) position++;
    }
  }
  return length;
}

function checkDataType(type, data, strictNumbers) {
  switch (type) {
    case "null":
      return data === null;
    case "array":
      return Array.isArray(data);
    case "object":
      return data && typeof data === "object" && !Array.isArray(data);
    case "integer":
      return (
        typeof data === "number" &&
        !(data % 1) &&
        !isNaN(data) &&
        (!strictNumbers || isFinite(data))
      );
    case "number":
      return typeof data === "number" && (!strictNumbers || isFinite(data));
    default:
      return typeof data === type;
  }
}

function schemaTypes(schema) {
  const type = schema.type;
  const types = Array.isArray(type) ? type.slice() : type ? [type] : [];
  const includesNull = types.includes("null");
  if (schema.nullable === true && !includesNull) types.push("null");
  return types;
}

// Keywords that make a schema do validation work. Used where ajv decides
// whether a branch is a no-op (for example then/else in if). `customKeywords`
// carries the names of registered custom keywords that have a validation rule;
// ajv counts those as rules too.
const VALIDATING_KEYWORDS = new Set([
  "$ref",
  "$recursiveRef",
  "$dynamicRef",
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
  "format",
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
  "dependentRequired",
  "dependentSchemas",
  "propertyNames",
  "if",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "minContains",
  "maxContains",
  "unevaluatedItems",
  "unevaluatedProperties",
]);

function alwaysValidSchema(schema, customKeywords) {
  if (typeof schema === "boolean") return schema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  for (const key of Object.keys(schema)) {
    if (VALIDATING_KEYWORDS.has(key)) return false;
    if (schema[key] !== undefined && customKeywords.has(key)) return false;
  }
  return true;
}

// Visits the subschemas ajv compiles for a schema node: unreferenced
// definitions, then/else without if, and additionalItems without a tuple are
// not compiled. Passing a schema value in const/enum/default is never done.
function forEachSubschema(schema, callback) {
  if (!isObject(schema)) return;

  for (const key of [
    "additionalProperties",
    "contains",
    "propertyNames",
    "unevaluatedProperties",
    "unevaluatedItems",
  ]) {
    if (schema[key] !== undefined) callback(schema[key], key);
  }
  for (const key of ["not", "if"]) {
    if (schema[key] !== undefined) callback(schema[key], key);
  }
  if (schema.if !== undefined) {
    if (schema.then !== undefined) callback(schema.then, "then");
    if (schema.else !== undefined) callback(schema.else, "else");
  }

  for (const key of ["properties", "patternProperties", "dependentSchemas"]) {
    const map = schema[key];
    if (isObject(map)) {
      for (const name of Object.keys(map)) callback(map[name], key + "/" + escapePointerToken(name));
    }
  }

  for (const key of ["allOf", "anyOf", "oneOf"]) {
    const list = schema[key];
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) callback(list[i], key + "/" + i);
    }
  }

  const items = schema.items;
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) callback(items[i], "items/" + i);
    if (schema.additionalItems !== undefined) callback(schema.additionalItems, "additionalItems");
  } else if (items !== undefined) {
    callback(items, "items");
  }

  const dependencies = schema.dependencies;
  if (isObject(dependencies)) {
    for (const name of Object.keys(dependencies)) {
      const dep = dependencies[name];
      if (isObject(dep) || typeof dep === "boolean") {
        callback(dep, "dependencies/" + escapePointerToken(name));
      }
    }
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
}

module.exports = {
  isObject,
  deepEqual,
  checkDataType,
  checkDataTypes,
  schemaTypes,
  alwaysValidSchema,
  forEachSubschema,
  stableStringify,
  escapeInstancePath,
  ucs2length,
};
