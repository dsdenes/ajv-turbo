"use strict";

const {
  resolveUri,
  normalizeId,
  splitUri,
  resolvePointer,
  escapePointerToken,
} = require("./uri");
const {
  isObject,
  deepEqual,
  checkDataTypes,
  checkDataType,
  schemaTypes,
  alwaysValidSchema,
  forEachSubschema,
  ucs2length,
} = require("./util");

class MissingRefError extends Error {
  constructor(baseId, ref, message) {
    const missingRef = normalizeId(resolveUri(baseId, ref));
    super(message || `can't resolve reference ${ref} from id ${baseId}`);
    this.missingRef = missingRef;
    this.missingSchema = splitUri(missingRef).uri;
  }
}

class ValidationError extends Error {
  constructor(errors) {
    super("validation failed");
    this.errors = errors;
    this.ajv = this.validation = true;
  }
}

// ajv's escapeFragment: JSON-pointer escaping followed by URI escaping. Used
// for the schema properties in a reported schemaPath.
function escapeSchemaToken(token) {
  return encodeURIComponent(escapePointerToken(token));
}

function addError(state, instancePath, schemaPathBase, keyword, params, message) {
  if (!state.errs) return;
  const error = {
    instancePath,
    schemaPath: schemaPathBase + "/" + keyword,
    keyword,
    params,
    message,
  };
  if (state.propertyName !== undefined) error.propertyName = state.propertyName;
  state.errs.push(error);
}

const REF_KEYWORDS = new Set([
  "$ref",
  "$recursiveRef",
  "$recursiveAnchor",
  "$dynamicRef",
  "$dynamicAnchor",
]);

// ajv compiles a referenced schema into its own validation function when the
// referenced schema itself contains a reference; such errors are reported
// relative to that schema's root. Everything else is inlined at the $ref
// location.
function schemaHasRef(schema) {
  if (!isObject(schema)) return false;
  for (const key of Object.keys(schema)) {
    if (REF_KEYWORDS.has(key)) return true;
    const value = schema[key];
    if (Array.isArray(value)) {
      if (value.some(schemaHasRef)) return true;
    } else if (schemaHasRef(value)) {
      return true;
    }
  }
  return false;
}

// ajv's RULES.all: a schema with any of these rules alongside $ref is not
// treated as a pure reference.
const RULE_KEYWORDS = new Set([
  "$comment",
  "id",
  "$ref",
  "maximum",
  "minimum",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "multipleOf",
  "maxLength",
  "minLength",
  "pattern",
  "maxProperties",
  "minProperties",
  "required",
  "maxItems",
  "minItems",
  "uniqueItems",
  "type",
  "nullable",
  "const",
  "enum",
  "not",
  "anyOf",
  "oneOf",
  "allOf",
  "if",
  "then",
  "else",
  "propertyNames",
  "additionalProperties",
  "dependencies",
  "properties",
  "patternProperties",
  "additionalItems",
  "items",
  "contains",
  "format",
]);

function schemaHasRulesButRef(schema) {
  if (!isObject(schema)) return false;
  for (const key of Object.keys(schema)) {
    if (key !== "$ref" && RULE_KEYWORDS.has(key)) return true;
  }
  return false;
}

function propertyInData(data, property, ownProperties) {
  return data[property] !== undefined && (!ownProperties || Object.prototype.hasOwnProperty.call(data, property));
}

function noPropertyInData(data, property, ownProperties) {
  return data[property] === undefined || (ownProperties && !Object.prototype.hasOwnProperty.call(data, property));
}

function schemaProperties(map) {
  return map ? Object.keys(map).filter((key) => key !== "__proto__") : [];
}

const GROUP_KEYWORDS = {
  number: ["maximum", "minimum", "exclusiveMaximum", "exclusiveMinimum", "multipleOf"],
  string: ["maxLength", "minLength", "pattern"],
  array: ["maxItems", "minItems", "additionalItems", "items", "contains", "uniqueItems"],
  object: [
    "maxProperties",
    "minProperties",
    "required",
    "propertyNames",
    "additionalProperties",
    "dependencies",
    "properties",
    "patternProperties",
  ],
};

function schemaHasRulesForType(schema, type) {
  const keywords = GROUP_KEYWORDS[type];
  if (!keywords) return false;
  return keywords.some((keyword) => schema[keyword] !== undefined);
}

const SCHEMA_KEYWORDS = new Set([
  "additionalItems",
  "items",
  "contains",
  "additionalProperties",
  "propertyNames",
  "not",
  "if",
  "then",
  "else",
]);
const SCHEMA_ARRAY_KEYWORDS = new Set(["items", "allOf", "anyOf", "oneOf"]);
const SCHEMA_MAP_KEYWORDS = new Set([
  "$defs",
  "definitions",
  "properties",
  "patternProperties",
  "dependencies",
]);
const NON_SCHEMA_KEYWORDS = new Set([
  "default",
  "enum",
  "const",
  "required",
  "maximum",
  "minimum",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "multipleOf",
  "maxLength",
  "minLength",
  "pattern",
  "format",
  "maxItems",
  "minItems",
  "uniqueItems",
  "maxProperties",
  "minProperties",
]);

class SchemaContext {
  constructor(ajv, schema, baseId, prepareNow = true) {
    this.ajv = ajv;
    this.opts = ajv.opts;
    this.root = schema;
    this.base = normalizeId(baseId || "");
    this.baseOf = new WeakMap();
    this.pathOf = new WeakMap();
    this.ids = new Map();
    this.roots = new Map();
    this.refTargets = new WeakMap();
    this.seen = new WeakSet();
    this.prepared = new WeakSet();
    this.visit(schema, this.base, "");
    if (this.root !== undefined) this.roots.set(this.base, schema);
    this.ids.set(this.base, schema);
    if (prepareNow) this.prepare(schema);
  }

  pattern(pattern) {
    const cache = this.ajv._patternCache;
    const key = (this.opts.unicodeRegExp === false ? "" : "u") + ":" + pattern;
    let regExp = cache.get(key);
    if (regExp === undefined) {
      regExp = new RegExp(pattern, this.opts.unicodeRegExp === false ? "" : "u");
      cache.set(key, regExp);
    }
    return regExp;
  }

  visit(node, base, path) {
    if (!isObject(node)) return;
    if (this.seen.has(node)) return;
    this.seen.add(node);

    let nodeBase = base;
    const id = node.$id;
    if (typeof id === "string") {
      const resolved = normalizeId(resolveUri(base, id));
      nodeBase = resolved;
      this.ids.set(resolved, node);
      const split = splitUri(resolved);
      if (split.fragment === undefined || split.fragment === "") {
        this.roots.set(resolved, node);
      }
    }
    for (const anchorKey of ["$anchor", "$dynamicAnchor"]) {
      const anchor = node[anchorKey];
      if (typeof anchor === "string") {
        this.ids.set(normalizeId(resolveUri(nodeBase, "#" + anchor)), node);
      }
    }

    this.baseOf.set(node, nodeBase);
    if (!this.pathOf.has(node)) this.pathOf.set(node, path);

    for (const key of Object.keys(node)) {
      const child = node[key];
      const childPath = path ? path + "/" + escapePointerToken(key) : escapePointerToken(key);
      if (Array.isArray(child)) {
        if (SCHEMA_ARRAY_KEYWORDS.has(key)) {
          for (let i = 0; i < child.length; i++) this.visit(child[i], nodeBase, childPath + "/" + i);
        }
      } else if (SCHEMA_MAP_KEYWORDS.has(key)) {
        if (isObject(child)) {
          for (const name of Object.keys(child)) {
            this.visit(child[name], nodeBase, childPath + "/" + escapePointerToken(name));
          }
        }
      } else if (SCHEMA_KEYWORDS.has(key) || !NON_SCHEMA_KEYWORDS.has(key)) {
        this.visit(child, nodeBase, childPath);
      }
    }
  }

  prepare(node) {
    if (!isObject(node)) return;
    if (this.prepared.has(node)) return;
    this.prepared.add(node);

    if (typeof node.pattern === "string") this.pattern(node.pattern);
    if (isObject(node.patternProperties)) {
      for (const key of Object.keys(node.patternProperties)) this.pattern(key);
    }

    if (typeof node.$ref === "string") {
      const target = this.resolve(node.$ref, node);
      if (!target) throw new MissingRefError(this.baseOf.get(node) || this.base, node.$ref);
      // ajv follows schemas that are nothing but a $ref and reports inlined
      // errors at the location of the original $ref.
      let finalTarget = target;
      const seen = new Set();
      while (
        isObject(finalTarget.node) &&
        typeof finalTarget.node.$ref === "string" &&
        !schemaHasRulesButRef(finalTarget.node) &&
        !seen.has(finalTarget.node)
      ) {
        seen.add(finalTarget.node);
        const next = finalTarget.ctx.resolve(finalTarget.node.$ref, finalTarget.node);
        if (!next || next.node === finalTarget.node) break;
        finalTarget = next;
      }
      const inline = typeof finalTarget.node === "boolean" || !schemaHasRef(finalTarget.node);
      this.refTargets.set(node, {
        ctx: finalTarget.ctx,
        node: finalTarget.node,
        inline,
        // ajv reports errors from an inlined reference at the literal $ref
        // location, and errors from a separately compiled schema from its own
        // root.
        base: inline ? node.$ref : "#",
      });
    }

    forEachSubschema(node, (child) => this.prepare(child));
  }

  lookup(full) {
    let target = this.ids.get(full);
    if (target !== undefined) return target;
    const split = splitUri(full);
    const root = this.roots.get(split.uri);
    if (root === undefined) return undefined;
    if (split.fragment === undefined || split.fragment === "") return root;
    if (split.fragment[0] !== "/") return undefined;
    return resolvePointer(root, split.fragment);
  }

  resolve(ref, fromNode) {
    const base = this.baseOf.get(fromNode) || this.base;
    const full = normalizeId(resolveUri(base, ref));

    const local = this.lookup(full);
    if (local !== undefined) {
      this.prepare(local);
      return {ctx: this, node: local};
    }

    const remote = this.ajv._lookupGlobal(full);
    if (remote) {
      remote.ctx.prepare(remote.node);
      return remote;
    }

    return undefined;
  }
}

function isContainer(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}

function enumerableKeys(data) {
  const keys = [];
  for (const key in data) keys.push(key);
  return keys;
}

const NO_COERCION = Symbol("no-coercion");

// Mirrors ajv's coerceData for the types it supports.
function coerceData(data, types, opts, strictNumbers) {
  if (opts.coerceTypes === "array" && Array.isArray(data) && data.length === 1) {
    const candidate = data[0];
    if (checkDataTypes(types, candidate, strictNumbers)) return candidate;
  }
  for (const type of types) {
    switch (type) {
      case "string":
        if (typeof data === "number" || typeof data === "boolean") return "" + data;
        if (data === null) return "";
        break;
      case "number":
        if (
          typeof data === "boolean" ||
          data === null ||
          (typeof data === "string" && data && data == +data)
        ) {
          return +data;
        }
        break;
      case "integer":
        if (
          typeof data === "boolean" ||
          data === null ||
          (typeof data === "string" && data && data == +data && !(data % 1))
        ) {
          return +data;
        }
        break;
      case "boolean":
        if (data === "false" || data === 0 || data === null) return false;
        if (data === "true" || data === 1) return true;
        break;
      case "null":
        if (data === "" || data === 0 || data === false) return null;
        break;
      case "array":
        if (opts.coerceTypes === "array") {
          if (typeof data === "string" || typeof data === "number" || typeof data === "boolean" || data === null) {
            return [data];
          }
        }
        break;
    }
  }
  return NO_COERCION;
}

const COERCIBLE = new Set(["string", "number", "integer", "boolean", "null"]);

function cloneDefault(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function typeMessage(type) {
  return `must be ${type}`;
}

class Validator {
  constructor(ctx) {
    this.ctx = ctx;
  }

  run(node, data, ctx, errs, instancePath) {
    return this.runRef(
      node,
      {value: data},
      ctx,
      {errs, allErrors: ctx.opts.allErrors, propertyName: undefined},
      instancePath,
      undefined,
      undefined,
      "#",
      false,
    );
  }

  runRef(node, ref, ctx, state, instancePath, parentData, parentKey, schemaPath, composite) {
    if (node === true) return true;
    if (node === false) {
      addError(state, instancePath, schemaPath, "false schema", {}, "boolean schema is false");
      return false;
    }
    if (!isObject(node)) return true;

    const opts = ctx.opts;
    const allErrors = state.allErrors;
    const errorsAtStart = state.errs ? state.errs.length : 0;
    let data = ref.value;
    let valid = true;

    const childState = (errs = state.errs, propertyName = state.propertyName) => ({
      errs,
      allErrors,
      propertyName,
    });
    const fail = (keyword, params, message, childSchemaPath = schemaPath, childInstancePath = instancePath) => {
      addError(state, childInstancePath, childSchemaPath, keyword, params, message);
      valid = false;
    };

    const types = schemaTypes(node);
    let coerceTo = [];
    if (types.length && opts.coerceTypes) {
      coerceTo = types.filter(
        (type) => COERCIBLE.has(type) || (opts.coerceTypes === "array" && type === "array"),
      );
    }
    const checkTypes =
      types.length > 0 &&
      !(coerceTo.length === 0 && types.length === 1 && schemaHasRulesForType(node, types[0]));

    if (checkTypes && !checkDataTypes(types, data, opts.strictNumbers)) {
      let coerced = NO_COERCION;
      if (coerceTo.length) coerced = coerceData(data, coerceTo, opts, opts.strictNumbers);
      if (coerced !== NO_COERCION) {
        data = coerced;
        ref.value = coerced;
        if (parentData !== undefined) parentData[parentKey] = coerced;
      } else {
        fail("type", {type: node.type}, typeMessage(node.type));
        // Inside a composite rule ajv keeps validating the remaining untyped
        // keywords after a type error, but skips every typed keyword group.
        if (!allErrors && !composite) return false;
      }
    }

    if (typeof node.$ref === "string") {
      const target = ctx.refTargets.get(node);
      const ok = this.runRef(
        target.node,
        ref,
        target.ctx,
        childState(),
        instancePath,
        parentData,
        parentKey,
        target.base,
        target.inline ? composite : false,
      );
      data = ref.value;
      if (!ok) {
        if (!allErrors) return false;
        valid = false;
      }
    }

    if (Object.prototype.hasOwnProperty.call(node, "const")) {
      if (!deepEqual(data, node.const)) {
        fail("const", {allowedValue: node.const}, "must be equal to constant");
        if (!allErrors) return false;
      }
    }

    if (node.enum !== undefined) {
      let found = false;
      if (Array.isArray(node.enum)) {
        for (const allowed of node.enum) {
          if (deepEqual(data, allowed)) {
            found = true;
            break;
          }
        }
      }
      if (!found) {
        fail("enum", {allowedValues: node.enum}, "must be equal to one of the allowed values");
        if (!allErrors) return false;
      }
    }

    if (node.not !== undefined) {
      const notValid = this.runRef(
        node.not,
        ref,
        ctx,
        childState(null),
        instancePath,
        parentData,
        parentKey,
        schemaPath + "/not",
        true,
      );
      data = ref.value;
      if (notValid) {
        fail("not", {}, "must NOT be valid");
        if (!allErrors) return false;
      }
    }

    if (Array.isArray(node.anyOf)) {
      const anyOfPath = schemaPath + "/anyOf";
      const alwaysValidBranch = node.anyOf.some((schema) => alwaysValidSchema(schema));
      if (!alwaysValidBranch) {
        const start = state.errs ? state.errs.length : 0;
        let matched = false;
        for (let i = 0; i < node.anyOf.length; i++) {
          if (
            this.runRef(
              node.anyOf[i],
              ref,
              ctx,
              childState(),
              instancePath,
              parentData,
              parentKey,
              anyOfPath + "/" + i,
              true,
            )
          ) {
            matched = true;
            break;
          }
          data = ref.value;
        }
        data = ref.value;
        if (matched) {
          if (state.errs) state.errs.length = start;
        } else {
          fail("anyOf", {}, "must match a schema in anyOf");
          if (!allErrors) return false;
        }
      }
    }

    if (Array.isArray(node.oneOf)) {
      const oneOfPath = schemaPath + "/oneOf";
      const start = state.errs ? state.errs.length : 0;
      let matched = false;
      let passing = null;
      for (let i = 0; i < node.oneOf.length; i++) {
        const ok = this.runRef(
          node.oneOf[i],
          ref,
          ctx,
          childState(),
          instancePath,
          parentData,
          parentKey,
          oneOfPath + "/" + i,
          true,
        );
        data = ref.value;
        if (i === 0) {
          if (ok) {
            matched = true;
            passing = 0;
          }
        } else if (ok && matched) {
          matched = false;
          passing = [passing, i];
          break;
        } else if (ok) {
          matched = true;
          passing = i;
        }
      }
      if (matched) {
        if (state.errs) state.errs.length = start;
      } else {
        fail("oneOf", {passingSchemas: passing}, "must match exactly one schema in oneOf");
        if (!allErrors) return false;
      }
    }

    if (Array.isArray(node.allOf)) {
      for (let i = 0; i < node.allOf.length; i++) {
        const ok = this.runRef(
          node.allOf[i],
          ref,
          ctx,
          childState(),
          instancePath,
          parentData,
          parentKey,
          schemaPath + "/allOf/" + i,
          composite,
        );
        data = ref.value;
        if (!ok) {
          valid = false;
          if (!allErrors) return false;
        }
      }
    }

    if (node.if !== undefined) {
      const hasThen = node.then !== undefined && !alwaysValidSchema(node.then);
      const hasElse = node.else !== undefined && !alwaysValidSchema(node.else);
      if (hasThen || hasElse) {
        const ifPath = schemaPath + "/if";
        const testOk = this.runRef(
          node.if,
          ref,
          ctx,
          childState(null),
          instancePath,
          parentData,
          parentKey,
          ifPath,
          true,
        );
        data = ref.value;
        let clause = null;
        let clauseOk = true;
        if (testOk) {
          if (hasThen) {
            clause = "then";
            clauseOk = this.runRef(
              node.then,
              ref,
              ctx,
              childState(),
              instancePath,
              parentData,
              parentKey,
              schemaPath + "/then",
              composite,
            );
            data = ref.value;
          }
        } else if (hasElse) {
          clause = "else";
          clauseOk = this.runRef(
            node.else,
            ref,
            ctx,
            childState(),
            instancePath,
            parentData,
            parentKey,
            schemaPath + "/else",
            composite,
          );
          data = ref.value;
        }
        if (!clauseOk) {
          valid = false;
          if (allErrors || composite) {
            addError(state, instancePath, schemaPath, "if", {failingKeyword: clause}, `must match "${clause}" schema`);
          }
          if (!allErrors) return false;
        }
      }
    }

    // ajv guards every keyword group after the untyped one by the error count,
    // so an error reported by an untyped keyword suppresses the typed groups.
    if (!allErrors && state.errs && state.errs.length > errorsAtStart) return false;

    if (checkDataType("number", data, opts.strictNumbers)) {
      if (typeof node.maximum === "number") {
        if (data > node.maximum || isNaN(data)) {
          fail("maximum", {comparison: "<=", limit: node.maximum}, `must be <= ${node.maximum}`);
          if (!allErrors) return false;
        }
      }
      if (typeof node.minimum === "number") {
        if (data < node.minimum || isNaN(data)) {
          fail("minimum", {comparison: ">=", limit: node.minimum}, `must be >= ${node.minimum}`);
          if (!allErrors) return false;
        }
      }
      if (typeof node.exclusiveMaximum === "number") {
        if (data >= node.exclusiveMaximum || isNaN(data)) {
          fail(
            "exclusiveMaximum",
            {comparison: "<", limit: node.exclusiveMaximum},
            `must be < ${node.exclusiveMaximum}`,
          );
          if (!allErrors) return false;
        }
      }
      if (typeof node.exclusiveMinimum === "number") {
        if (data <= node.exclusiveMinimum || isNaN(data)) {
          fail(
            "exclusiveMinimum",
            {comparison: ">", limit: node.exclusiveMinimum},
            `must be > ${node.exclusiveMinimum}`,
          );
          if (!allErrors) return false;
        }
      }
      if (typeof node.multipleOf === "number") {
        const multipleOf = node.multipleOf;
        const quotient = data / multipleOf;
        const precision = opts.multipleOfPrecision;
        const invalid = precision
          ? Math.abs(Math.round(quotient) - quotient) > Math.pow(10, -precision)
          : quotient !== parseInt(quotient);
        if (multipleOf === 0 || invalid) {
          fail("multipleOf", {multipleOf}, `must be multiple of ${multipleOf}`);
          if (!allErrors) return false;
        }
      }
    } else if (!checkTypes && types.length === 1 && types[0] === "number") {
      fail("type", {type: node.type}, typeMessage(node.type));
      if (!allErrors) return false;
    }

    if (typeof data === "string") {
      if (typeof node.maxLength === "number" && ucs2length(data) > node.maxLength) {
        fail("maxLength", {limit: node.maxLength}, `must NOT have more than ${node.maxLength} characters`);
        if (!allErrors) return false;
      }
      if (typeof node.minLength === "number" && ucs2length(data) < node.minLength) {
        fail("minLength", {limit: node.minLength}, `must NOT have fewer than ${node.minLength} characters`);
        if (!allErrors) return false;
      }
      if (typeof node.pattern === "string" && !ctx.pattern(node.pattern).test(data)) {
        fail("pattern", {pattern: node.pattern}, `must match pattern "${node.pattern}"`);
        if (!allErrors) return false;
      }
    } else if (!checkTypes && types.length === 1 && types[0] === "string") {
      fail("type", {type: node.type}, typeMessage(node.type));
      if (!allErrors) return false;
    }

    if (Array.isArray(data)) {
      if (opts.useDefaults && !composite && Array.isArray(node.items)) {
        for (let i = 0; i < node.items.length; i++) {
          const itemSchema = node.items[i];
          const defaultValue = isObject(itemSchema) ? itemSchema.default : undefined;
          if (defaultValue === undefined) continue;
          const empty =
            opts.useDefaults === "empty" && (data[i] === null || data[i] === "");
          if (data[i] === undefined || empty) data[i] = cloneDefault(defaultValue);
        }
      }
      if (typeof node.maxItems === "number" && data.length > node.maxItems) {
        fail("maxItems", {limit: node.maxItems}, `must NOT have more than ${node.maxItems} items`);
        if (!allErrors) return false;
      }
      if (typeof node.minItems === "number" && data.length < node.minItems) {
        fail("minItems", {limit: node.minItems}, `must NOT have fewer than ${node.minItems} items`);
        if (!allErrors) return false;
      }
      if (Array.isArray(node.items) && node.additionalItems !== undefined) {
        const extra = node.additionalItems;
        if (extra === false) {
          if (data.length > node.items.length) {
            fail(
              "additionalItems",
              {limit: node.items.length},
              `must NOT have more than ${node.items.length} items`,
            );
            if (!allErrors) return false;
          }
        } else if (!alwaysValidSchema(extra)) {
          for (let i = node.items.length; i < data.length; i++) {
            if (
              !this.runRef(
                extra,
                {value: data[i]},
                ctx,
                childState(),
                instancePath + "/" + i,
                data,
                i,
                schemaPath + "/additionalItems",
                composite,
              )
            ) {
              if (!allErrors) return false;
              valid = false;
            }
          }
        }
      }
      if (node.items !== undefined) {
        const items = node.items;
        if (Array.isArray(items)) {
          const limit = Math.min(items.length, data.length);
          for (let i = 0; i < limit; i++) {
            if (alwaysValidSchema(items[i])) continue;
            if (
              !this.runRef(
                items[i],
                {value: data[i]},
                ctx,
                childState(),
                instancePath + "/" + i,
                data,
                i,
                schemaPath + "/items/" + i,
                composite,
              )
            ) {
              if (!allErrors) return false;
              valid = false;
            }
          }
        } else if (!alwaysValidSchema(items)) {
          for (let i = 0; i < data.length; i++) {
            if (
              !this.runRef(
                items,
                {value: data[i]},
                ctx,
                childState(),
                instancePath + "/" + i,
                data,
                i,
                schemaPath + "/items",
                composite,
              )
            ) {
              if (!allErrors) return false;
              valid = false;
            }
          }
        }
      }
      if (node.contains !== undefined) {
        if (alwaysValidSchema(node.contains)) {
          if (data.length < 1) {
            fail("contains", {minContains: 1}, "must contain at least 1 valid item(s)");
            if (!allErrors) return false;
          }
        } else {
          const start = state.errs ? state.errs.length : 0;
          let found = false;
          for (let i = 0; i < data.length; i++) {
            if (
              this.runRef(
                node.contains,
                {value: data[i]},
                ctx,
                childState(),
                instancePath + "/" + i,
                data,
                i,
                schemaPath + "/contains",
                true,
              )
            ) {
              found = true;
              break;
            }
          }
          if (found) {
            if (state.errs) state.errs.length = start;
          } else {
            // The keyword reports through ajv's non-append error path: outside
            // a composite rule and without allErrors the item errors are
            // replaced by the single contains error.
            if (!allErrors && !composite && state.errs) state.errs.length = start;
            fail("contains", {minContains: 1}, "must contain at least 1 valid item(s)");
            if (!allErrors) return false;
          }
        }
      }
      if (node.uniqueItems === true && data.length > 1) {
        const itemSchema = node.items;
        const itemTypes = isObject(itemSchema) ? schemaTypes(itemSchema) : [];
        let duplicate = null;
        if (itemTypes.length > 0 && !itemTypes.includes("object") && !itemTypes.includes("array")) {
          const indices = {};
          for (let i = data.length - 1; i >= 0; i--) {
            let item = data[i];
            if (!checkDataTypes(itemTypes, item, opts.strictNumbers)) continue;
            if (itemTypes.length > 1 && typeof item === "string") item += "_";
            if (typeof indices[item] === "number") {
              duplicate = {i, j: indices[item]};
              break;
            }
            indices[item] = i;
          }
        } else {
          for (let i = data.length - 1; i > 0 && !duplicate; i--) {
            for (let j = i - 1; j >= 0; j--) {
              if (deepEqual(data[i], data[j])) {
                duplicate = {i, j};
                break;
              }
            }
          }
        }
        if (duplicate) {
          fail(
            "uniqueItems",
            {i: duplicate.i, j: duplicate.j},
            `must NOT have duplicate items (items ## ${duplicate.j} and ${duplicate.i} are identical)`,
          );
          if (!allErrors) return false;
        }
      }
    } else if (!checkTypes && types.length === 1 && types[0] === "array") {
      fail("type", {type: node.type}, typeMessage(node.type));
      if (!allErrors) return false;
    }

    if (isContainer(data)) {
      const ownProperties = opts.ownProperties === true;
      if (opts.useDefaults && !composite && isObject(node.properties)) {
        for (const property of schemaProperties(node.properties)) {
          const propertySchema = node.properties[property];
          const defaultValue = isObject(propertySchema) ? propertySchema.default : undefined;
          if (defaultValue === undefined) continue;
          const empty =
            opts.useDefaults === "empty" && (data[property] === null || data[property] === "");
          if (data[property] === undefined || empty) data[property] = cloneDefault(defaultValue);
        }
      }
      const keys = Object.keys(data);
      if (typeof node.maxProperties === "number" && keys.length > node.maxProperties) {
        fail("maxProperties", {limit: node.maxProperties}, `must NOT have more than ${node.maxProperties} properties`);
        if (!allErrors) return false;
      }
      if (typeof node.minProperties === "number" && keys.length < node.minProperties) {
        fail("minProperties", {limit: node.minProperties}, `must NOT have fewer than ${node.minProperties} properties`);
        if (!allErrors) return false;
      }
      if (Array.isArray(node.required)) {
        for (const required of node.required) {
          if (noPropertyInData(data, required, ownProperties)) {
            fail("required", {missingProperty: required}, `must have required property '${required}'`);
            if (!allErrors) return false;
          }
        }
      }

      if (node.propertyNames !== undefined && !alwaysValidSchema(node.propertyNames)) {
        for (const key of enumerableKeys(data)) {
          const ok = this.runRef(
            node.propertyNames,
            {value: key},
            ctx,
            childState(state.errs, key),
            instancePath,
            undefined,
            undefined,
            schemaPath + "/propertyNames",
            true,
          );
          if (!ok) {
            addError(
              state,
              instancePath,
              schemaPath,
              "propertyNames",
              {propertyName: key},
              "property name must be valid",
            );
            valid = false;
            if (!allErrors) return false;
          }
        }
      }

      const defined = new Set(isObject(node.properties) ? schemaProperties(node.properties) : []);
      const patternProperties = isObject(node.patternProperties) ? node.patternProperties : undefined;
      const patterns = patternProperties ? schemaProperties(patternProperties) : [];
      const patternRegExps = patterns.map((pattern) => ctx.pattern(pattern));
      const matchesPattern = (key) => patternRegExps.some((regExp) => regExp.test(key));

      if (node.additionalProperties !== undefined) {
        const additional = node.additionalProperties;
        if (opts.removeAdditional === "all") {
          for (const key of enumerableKeys(data)) {
            if (!defined.has(key) && !matchesPattern(key)) delete data[key];
          }
        } else if (!alwaysValidSchema(additional)) {
          for (const key of enumerableKeys(data)) {
            if (defined.has(key) || matchesPattern(key)) continue;
            const childInstancePath = instancePath + "/" + escapePointerToken(key);
            if (additional === false) {
              if (opts.removeAdditional) {
                delete data[key];
                continue;
              }
              fail(
                "additionalProperties",
                {additionalProperty: key},
                "must NOT have additional properties",
              );
              if (!allErrors) return false;
            } else if (opts.removeAdditional === "failing") {
              if (
                !this.runRef(
                  additional,
                  {value: data[key]},
                  ctx,
                  childState(null),
                  childInstancePath,
                  data,
                  key,
                  schemaPath + "/additionalProperties",
                  true,
                )
              ) {
                delete data[key];
              }
            } else if (
              !this.runRef(
                additional,
                {value: data[key]},
                ctx,
                childState(),
                childInstancePath,
                data,
                key,
                schemaPath + "/additionalProperties",
                composite,
              )
            ) {
              if (!allErrors) return false;
              valid = false;
            }
          }
        }
      }

      if (isObject(node.dependencies)) {
        const propertyDeps = [];
        const schemaDeps = [];
        for (const property of Object.keys(node.dependencies)) {
          if (property === "__proto__") continue;
          const dependency = node.dependencies[property];
          if (Array.isArray(dependency)) propertyDeps.push([property, dependency]);
          else schemaDeps.push([property, dependency]);
        }
        for (const [property, dependency] of propertyDeps) {
          if (dependency.length === 0) continue;
          if (!propertyInData(data, property, ownProperties)) continue;
          for (const required of dependency) {
            if (noPropertyInData(data, required, ownProperties)) {
              fail(
                "dependencies",
                {
                  property,
                  missingProperty: required,
                  depsCount: dependency.length,
                  deps: dependency.join(", "),
                },
                `must have ${dependency.length === 1 ? "property" : "properties"} ` +
                  `${dependency.join(", ")} when property ${property} is present`,
              );
              if (!allErrors) return false;
            }
          }
        }
        for (const [property, dependency] of schemaDeps) {
          if (!propertyInData(data, property, ownProperties)) continue;
          if (alwaysValidSchema(dependency)) continue;
          if (
            !this.runRef(
              dependency,
              ref,
              ctx,
              childState(),
              instancePath,
              parentData,
              parentKey,
              schemaPath + "/dependencies/" + escapeSchemaToken(property),
              composite,
            )
          ) {
            if (!allErrors) return false;
            valid = false;
          }
        }
      }

      if (isObject(node.properties)) {
        if (opts.removeAdditional === "all" && node.additionalProperties === undefined) {
          for (const key of enumerableKeys(data)) {
            if (!defined.has(key) && !matchesPattern(key)) delete data[key];
          }
        }
        for (const property of schemaProperties(node.properties)) {
          if (!propertyInData(data, property, ownProperties)) continue;
          if (
            !this.runRef(
              node.properties[property],
              {value: data[property]},
              ctx,
              childState(),
              instancePath + "/" + escapePointerToken(property),
              data,
              property,
              schemaPath + "/properties/" + escapeSchemaToken(property),
              composite,
            )
          ) {
            if (!allErrors) return false;
            valid = false;
          }
        }
      }

      if (patternProperties) {
        for (let p = 0; p < patterns.length; p++) {
          const regExp = patternRegExps[p];
          const patternSchema = patternProperties[patterns[p]];
          if (alwaysValidSchema(patternSchema)) continue;
          for (const key of enumerableKeys(data)) {
            if (!regExp.test(key)) continue;
            if (
              !this.runRef(
                patternSchema,
                {value: data[key]},
                ctx,
                childState(),
                instancePath + "/" + escapePointerToken(key),
                data,
                key,
                schemaPath + "/patternProperties/" + escapeSchemaToken(patterns[p]),
                composite,
              )
            ) {
              if (!allErrors) return false;
              valid = false;
            }
          }
        }
      }
    } else if (!checkTypes && types.length === 1 && types[0] === "object") {
      fail("type", {type: node.type}, typeMessage(node.type));
      if (!allErrors) return false;
    }

    return valid;
  }
}

module.exports = {
  SchemaContext,
  Validator,
  MissingRefError,
  ValidationError,
  addError,
};
