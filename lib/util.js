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

// Keywords whose schema value ajv accepts as a data reference when its
// data-reference option is on: every keyword definition marked `$data: true`
// in ajv's draft-07 and 2019-09/2020-12 vocabularies.
const DATA_REFERENCE_KEYWORDS = new Set([
  "const",
  "enum",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "maxItems",
  "maxLength",
  "maxProperties",
  "maximum",
  "minItems",
  "minLength",
  "minProperties",
  "minimum",
  "multipleOf",
  "pattern",
  "required",
  "uniqueItems",
]);

// ajv recognizes a data reference by a truthy `$data` property on the keyword
// value. A falsy value (only an empty string survives meta-schema validation)
// leaves the object a literal schema value.
function isDataReference(value) {
  return isObject(value) && Boolean(value.$data);
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
  "prefixItems",
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

  // In the draft-07 vocabulary a dependency may itself be a schema. ajv
  // compiles those, so they carry the same compile-time checks as any other
  // subschema; an array dependency is just a list of property names.
  if (isObject(schema.dependencies)) {
    for (const name of Object.keys(schema.dependencies)) {
      const dependency = schema.dependencies[name];
      if (isObject(dependency)) {
        callback(dependency, "dependencies/" + escapePointerToken(name));
      }
    }
  }

  for (const key of ["allOf", "anyOf", "oneOf"]) {
    const list = schema[key];
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) callback(list[i], key + "/" + i);
    }
  }

  const prefixItems = schema.prefixItems;
  if (Array.isArray(prefixItems)) {
    for (let i = 0; i < prefixItems.length; i++) callback(prefixItems[i], "prefixItems/" + i);
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

// --- ajv data references -------------------------------------------------
// A keyword value of the form {$data: "<pointer>"} resolves against the
// document being validated. The pointer is either an absolute JSON pointer or
// ajv's relative form ("1/limit", "0#").
const RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;

function unescapeJsonPointerSegment(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

// Resolves a data reference against the document. Absolute pointers walk
// `rootData`; relative pointers walk the chain of ancestor data that the
// current reference records.
function resolveDataReference(pointer, ref, rootData) {
  if (pointer === "") return rootData;
  let value;
  let rest;
  if (pointer[0] === "/") {
    value = rootData;
    rest = pointer;
  } else {
    const match = RELATIVE_JSON_POINTER.exec(pointer);
    if (match === null) throw new Error(`Invalid JSON-pointer: ${pointer}`);
    let up = Number(match[1]);
    rest = match[2];
    let target = ref;
    while (up > 0 && target !== undefined) {
      target = target.parent;
      up--;
    }
    if (rest === "#") return target === undefined ? undefined : target.key;
    if (target === undefined) return undefined;
    if (rest === undefined || rest === "") return target.value;
    value = target.value;
  }
  for (const segment of rest.split("/")) {
    if (segment === "") continue;
    if (!value) return value;
    value = value[unescapeJsonPointerSegment(segment)];
  }
  return value;
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
  DATA_REFERENCE_KEYWORDS,
  isDataReference,
  resolveDataReference,
};
