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

function addError(errs, ctx, node, instancePath, keyword, params, message) {
  if (!errs) return;
  const path = ctx.pathOf.get(node) || "";
  const schemaPath = "#" + (path ? "/" + path : "") + (keyword ? "/" + keyword : "");
  errs.push({instancePath, schemaPath, keyword, params, message});
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
      this.refTargets.set(node, target);
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

function cloneDefault(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

class Validator {
  constructor(ctx) {
    this.ctx = ctx;
  }

  run(node, data, ctx, errs, instancePath, parentData, parentKey, composite) {
    return this.runRef(
      node,
      {value: data},
      ctx,
      errs,
      instancePath,
      parentData,
      parentKey,
      composite,
    );
  }

  runRef(node, ref, ctx, errs, instancePath, parentData, parentKey, composite) {
    let data = ref.value;
    if (node === true) return true;
    if (node === false) {
      addError(errs, ctx, node, instancePath, "false schema", {}, "boolean schema is false");
      return false;
    }
    if (!isObject(node)) return true;

    const opts = ctx.opts;
    const allErrors = errs !== null && opts.allErrors;
    let ok = true;

    const fail = (keyword, params, message, schemaNode) => {
      addError(errs, ctx, schemaNode || node, instancePath, keyword, params, message);
      ok = false;
      return false;
    };

    const target = ctx.refTargets.get(node);
    if (target) {
      const valid = this.runRef(target.node, ref, target.ctx, errs, instancePath, parentData, parentKey, composite);
      data = ref.value;
      if (!valid) {
        if (!allErrors) return false;
        ok = false;
      }
    }

    if (node.type !== undefined) {
      const types = schemaTypes(node);
      if (!checkDataTypes(types, data, opts.strictNumbers)) {
        const coerced = opts.coerceTypes ? coerceData(data, types, opts, opts.strictNumbers) : NO_COERCION;
        if (coerced !== NO_COERCION) {
          data = coerced;
          ref.value = coerced;
          if (parentData !== undefined) parentData[parentKey] = data;
        } else {
          fail("type", {type: node.type}, `must be ${Array.isArray(node.type) ? node.type.join(",") : node.type}`);
          ok = false;
        }
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

    if (Object.prototype.hasOwnProperty.call(node, "const")) {
      if (!deepEqual(data, node.const)) {
        fail("const", {allowedValue: node.const}, "must be equal to constant");
        if (!allErrors) return false;
      }
    }

    if (node.not !== undefined) {
      if (this.runRef(node.not, ref, ctx, null, instancePath, parentData, parentKey, true)) {
        fail("not", {}, "must NOT be valid");
        if (!allErrors) return false;
      }
      data = ref.value;
    }

    if (Array.isArray(node.anyOf)) {
      let matches = 0;
      for (const schema of node.anyOf) {
        if (this.runRef(schema, ref, ctx, null, instancePath, parentData, parentKey, true)) matches++;
        data = ref.value;
      }
      if (matches === 0) {
        fail("anyOf", {}, "must match a schema in anyOf");
        if (!allErrors) return false;
      }
    }

    if (Array.isArray(node.oneOf)) {
      let matches = 0;
      for (const schema of node.oneOf) {
        if (this.runRef(schema, ref, ctx, null, instancePath, parentData, parentKey, true)) matches++;
        data = ref.value;
      }
      if (matches !== 1) {
        fail("oneOf", {}, "must match exactly one schema in oneOf");
        if (!allErrors) return false;
      }
    }

    if (Array.isArray(node.allOf)) {
      for (const schema of node.allOf) {
        if (!this.runRef(schema, ref, ctx, errs, instancePath, parentData, parentKey, composite)) {
          if (!allErrors) return false;
          ok = false;
        }
        data = ref.value;
      }
    }

    if (node.if !== undefined) {
      const hasThen = node.then !== undefined && !alwaysValidSchema(node.then);
      const hasElse = node.else !== undefined && !alwaysValidSchema(node.else);
      if (hasThen || hasElse) {
        if (this.runRef(node.if, ref, ctx, null, instancePath, parentData, parentKey, true)) {
          data = ref.value;
          if (hasThen && !this.runRef(node.then, ref, ctx, errs, instancePath, parentData, parentKey, composite)) {
            if (!allErrors) return false;
            ok = false;
          }
          data = ref.value;
        } else {
          data = ref.value;
          if (hasElse && !this.runRef(node.else, ref, ctx, errs, instancePath, parentData, parentKey, composite)) {
            if (!allErrors) return false;
            ok = false;
          }
          data = ref.value;
        }
      }
    }

    if (typeof data === "number") {
      if (typeof node.multipleOf === "number") {
        const multipleOf = node.multipleOf;
        const quotient = data / multipleOf;
        const precision = opts.multipleOfPrecision;
        const invalid =
          precision
            ? Math.abs(Math.round(quotient) - quotient) > Math.pow(10, -precision)
            : quotient !== parseInt(quotient);
        if (multipleOf === 0 || invalid) {
          fail("multipleOf", {multipleOf}, `must be multiple of ${multipleOf}`);
          if (!allErrors) return false;
        }
      }
      if (typeof node.maximum === "number") {
        if (data > node.maximum || isNaN(data)) {
          fail("maximum", {comparison: "<=", limit: node.maximum}, `must be <= ${node.maximum}`);
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
      if (typeof node.minimum === "number") {
        if (data < node.minimum || isNaN(data)) {
          fail("minimum", {comparison: ">=", limit: node.minimum}, `must be >= ${node.minimum}`);
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
      if (node.uniqueItems === true && data.length > 1) {
        let duplicate = false;
        for (let i = 0; i < data.length && !duplicate; i++) {
          for (let j = 0; j < i; j++) {
            if (deepEqual(data[i], data[j])) {
              duplicate = true;
              break;
            }
          }
        }
        if (duplicate) {
          fail("uniqueItems", {}, "must NOT have duplicate items");
          if (!allErrors) return false;
        }
      }
      if (node.items !== undefined) {
        const items = node.items;
        if (Array.isArray(items)) {
          const limit = Math.min(items.length, data.length);
          for (let i = 0; i < limit; i++) {
            if (!this.run(items[i], data[i], ctx, errs, instancePath + "/" + i, data, i, composite)) {
              if (!allErrors) return false;
              ok = false;
            }
          }
          if (data.length > items.length) {
            const extra = node.additionalItems;
            if (extra === false) {
              fail("additionalItems", {limit: items.length}, "must NOT have additional items");
              if (!allErrors) return false;
            } else if (extra !== undefined && extra !== true) {
              for (let i = items.length; i < data.length; i++) {
                if (!this.run(extra, data[i], ctx, errs, instancePath + "/" + i, data, i, composite)) {
                  if (!allErrors) return false;
                  ok = false;
                }
              }
            }
          }
        } else if (items !== true) {
          if (items === false) {
            if (data.length > 0) {
              fail("items", {limit: 0}, "must NOT have more than 0 items");
              if (!allErrors) return false;
            }
          } else {
            for (let i = 0; i < data.length; i++) {
              if (!this.run(items, data[i], ctx, errs, instancePath + "/" + i, data, i, composite)) {
                if (!allErrors) return false;
                ok = false;
              }
            }
          }
        }
      }
      if (node.contains !== undefined) {
        let found = false;
        for (let i = 0; i < data.length; i++) {
          if (this.run(node.contains, data[i], ctx, null, instancePath + "/" + i, data, i, true)) {
            found = true;
            break;
          }
        }
        if (!found) {
          fail("contains", {minContains: 1}, "must contain at least 1 valid item(s)");
          if (!allErrors) return false;
        }
      }
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

      if (node.propertyNames !== undefined) {
        for (const key of enumerableKeys(data)) {
          if (!this.run(node.propertyNames, key, ctx, null, instancePath, undefined, undefined, true)) {
            fail("propertyNames", {propertyName: key}, "property name must be valid");
            if (!allErrors) return false;
          }
        }
      }

      const patternProperties = isObject(node.patternProperties) ? node.patternProperties : undefined;
      const testPatternProperties = (key) => {
        if (!patternProperties) return false;
        let matched = false;
        for (const pattern of Object.keys(patternProperties)) {
          if (ctx.pattern(pattern).test(key)) {
            matched = true;
            if (!this.run(
              patternProperties[pattern],
              data[key],
              ctx,
              errs,
              instancePath + "/" + escapePointerToken(key),
              data,
              key,
              composite,
            )) {
              if (!allErrors) return "fail";
              ok = false;
            }
          }
        }
        return matched;
      };

      if (isObject(node.properties)) {
        for (const property of schemaProperties(node.properties)) {
          if (propertyInData(data, property, ownProperties)) {
            if (!this.run(
              node.properties[property],
              data[property],
              ctx,
              errs,
              instancePath + "/" + escapePointerToken(property),
              data,
              property,
              composite,
            )) {
              if (!allErrors) return false;
              ok = false;
            }
          }
        }
      }

      if (patternProperties) {
        for (const key of enumerableKeys(data)) {
          const result = testPatternProperties(key);
          if (result === "fail") return false;
        }
      }

      const defined = new Set(isObject(node.properties) ? schemaProperties(node.properties) : []);
      const patterns = patternProperties ? Object.keys(patternProperties) : [];
      const matchesPattern = (key) => patterns.some((pattern) => ctx.pattern(pattern).test(key));

      if (opts.removeAdditional === "all") {
        for (const key of enumerableKeys(data)) {
          if (!defined.has(key) && !matchesPattern(key)) delete data[key];
        }
      } else if (node.additionalProperties !== undefined && node.additionalProperties !== true) {
        for (const key of enumerableKeys(data)) {
          if (defined.has(key) || matchesPattern(key)) continue;
          const additional = node.additionalProperties;
          if (additional === false) {
            if (opts.removeAdditional) {
              delete data[key];
              continue;
            }
            fail("additionalProperties", {additionalProperty: key}, "must NOT have additional properties");
            if (!allErrors) return false;
          } else if (opts.removeAdditional === "failing") {
            if (!this.run(additional, data[key], ctx, null, instancePath + "/" + escapePointerToken(key), data, key, true)) {
              delete data[key];
            }
          } else if (!this.run(
            additional,
            data[key],
            ctx,
            errs,
            instancePath + "/" + escapePointerToken(key),
            data,
            key,
            composite,
          )) {
            if (!allErrors) return false;
            ok = false;
          }
        }
      }

      if (isObject(node.dependencies)) {
        for (const property of Object.keys(node.dependencies)) {
          if (property === "__proto__") continue;
          if (!propertyInData(data, property, ownProperties)) continue;
          const dependency = node.dependencies[property];
          if (Array.isArray(dependency)) {
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
                  `must have property ${required} when property ${property} is present`,
                );
                if (!allErrors) return false;
              }
            }
          } else if (!this.run(dependency, data, ctx, errs, instancePath, parentData, parentKey, composite)) {
            if (!allErrors) return false;
            ok = false;
          }
        }
      }

    }

    return ok;
  }
}

module.exports = {
  SchemaContext,
  Validator,
  MissingRefError,
  ValidationError,
  addError,
};
