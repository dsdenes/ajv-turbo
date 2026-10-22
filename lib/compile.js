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
  "dependentRequired",
  "dependentSchemas",
  "properties",
  "patternProperties",
  "unevaluatedProperties",
  "additionalItems",
  "items",
  "prefixItems",
  "contains",
  "unevaluatedItems",
  "format",
  "$recursiveRef",
  "$dynamicRef",
]);

function schemaHasRulesButRef(schema, customKeywords) {
  if (!isObject(schema)) return false;
  for (const key of Object.keys(schema)) {
    if (key === "$ref") continue;
    if (RULE_KEYWORDS.has(key)) return true;
    if (schema[key] !== undefined && customKeywords.has(key)) return true;
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

// ajv registers the format rule in both the number and the string group.
const GROUP_KEYWORDS = {
  number: ["maximum", "minimum", "exclusiveMaximum", "exclusiveMinimum", "multipleOf", "format"],
  string: ["maxLength", "minLength", "pattern", "format"],
  array: [
    "maxItems",
    "minItems",
    "additionalItems",
    "items",
    "contains",
    "uniqueItems",
    "unevaluatedItems",
  ],
  object: [
    "maxProperties",
    "minProperties",
    "required",
    "propertyNames",
    "additionalProperties",
    "dependencies",
    "properties",
    "patternProperties",
    "dependentRequired",
    "dependentSchemas",
    "unevaluatedProperties",
  ],
};

function standardRulesForType(schema, type) {
  const keywords = GROUP_KEYWORDS[type];
  return keywords !== undefined && keywords.some((keyword) => schema[keyword] !== undefined);
}

// The data types ajv keeps a rule group for. A keyword declared for one of
// them takes part in the group's type guard; a keyword declared for any other
// type (integer, boolean, null) forms a group of its own, appended after these.
const KEYWORD_GROUP_TYPES = ["number", "string", "array", "object"];

// Names of registered keywords that carry a validation rule. A keyword
// registered without one is known to the validator but does not make a schema
// do work, exactly as a rule-less keyword in ajv's rule table.
function keywordRuleNames(keywords) {
  const names = new Set();
  for (const entry of keywords.values()) {
    if (entry.validate !== undefined) names.add(entry.keyword);
  }
  return names;
}

// Splits the registered keywords the way ajv splits its rule groups: untyped
// keywords first, then one list per data type, in registration order within
// each list. Types without a standard group are collected in `extra`, in the
// order their first keyword was registered.
function buildKeywordGroups(keywords) {
  const groups = {any: [], number: [], string: [], array: [], object: [], extra: new Map()};
  for (const entry of keywords.values()) {
    if (entry.validate === undefined) continue;
    if (entry.types.length === 0) {
      groups.any.push(entry);
      continue;
    }
    for (const type of entry.types) {
      if (KEYWORD_GROUP_TYPES.includes(type)) {
        groups[type].push(entry);
      } else {
        let list = groups.extra.get(type);
        if (list === undefined) {
          list = [];
          groups.extra.set(type, list);
        }
        list.push(entry);
      }
    }
  }
  return groups;
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
  "unevaluatedProperties",
  "unevaluatedItems",
]);
const SCHEMA_ARRAY_KEYWORDS = new Set(["items", "prefixItems", "allOf", "anyOf", "oneOf"]);
const SCHEMA_MAP_KEYWORDS = new Set([
  "$defs",
  "definitions",
  "properties",
  "patternProperties",
  "dependencies",
  "dependentSchemas",
]);
const NON_SCHEMA_KEYWORDS = new Set([
  "default",
  "dependentRequired",
  "minContains",
  "maxContains",
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
    this.next = this.opts.next === true;
    this.unevaluated = this.opts.unevaluated === true;
    this.dynamic = this.opts.dynamicRef === true;
    this.draft2020 = this.opts.metaDialect === "2020";
    this.root = schema;
    this.base = normalizeId(baseId || "");
    // Registered keywords carrying a rule, as of this compilation.
    this.keywordRules = keywordRuleNames(ajv.keywords);
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

    // ajv's dynamic vocabularies only accept hash-fragment references.
    for (const keyword of ["$recursiveRef", "$dynamicRef"]) {
      const ref = node[keyword];
      if (ref === undefined) continue;
      if (typeof ref !== "string" || ref[0] !== "#") {
        throw new Error(`"${keyword}" only supports hash fragment reference`);
      }
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
        !schemaHasRulesButRef(finalTarget.node, this.keywordRules) &&
        !seen.has(finalTarget.node)
      ) {
        seen.add(finalTarget.node);
        // A schema in another environment is compiled as its own function
        // when it is that environment's root; its errors are reported
        // relative to that root, so the chain must not be followed further.
        if (finalTarget.ctx !== this && finalTarget.node === finalTarget.ctx.root) break;
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
    // ajv resolves each format once, when it compiles the schema, so a format
    // registered or replaced later does not affect an existing validator.
    this.formats = Object.assign(Object.create(null), ctx.ajv.formats);
    // Custom keywords are resolved at the same point, for the same reason.
    this.keywordRules = ctx.keywordRules;
    this.keywordGroups = buildKeywordGroups(ctx.ajv.keywords);
    this.next = ctx.opts.next === true;
    this.unevaluated = ctx.opts.unevaluated === true;
    this.dynamic = ctx.opts.dynamicRef === true;
    this.draft2020 = ctx.opts.metaDialect === "2020";
    this._staticEvalCache = new WeakMap();
  }

  // Caches the compile-time evaluated names of a referenced schema, which do
  // not depend on the document.
  staticEvaluatedFor(node, ctx) {
    let value = this._staticEvalCache.get(node);
    if (value === undefined) {
      value = this.staticEvaluated(node, ctx);
      this._staticEvalCache.set(node, value);
    }
    return value;
  }

  newEvaluated() {
    return {props: undefined, items: undefined};
  }

  // ajv tracks evaluated property names and item counts only for the 2019-09
  // vocabulary and later. The values match ajv's runtime representation: `true`
  // for everything, an object of property names, or a prefix count.
  staticProps(keys) {
    const props = Object.create(null);
    for (const key of keys) props[key] = true;
    return props;
  }

  mergeProps(from, to) {
    if (from === undefined) return to;
    if (to === undefined) return from === true ? true : this.staticProps(Object.keys(from));
    if (from === true || to === true) return true;
    const merged = this.staticProps(Object.keys(to));
    for (const key of Object.keys(from)) merged[key] = true;
    return merged;
  }

  mergeItems(from, to) {
    if (from === undefined) return to;
    if (to === undefined) return from;
    if (from === true || to === true) return true;
    return Math.max(from, to);
  }

  // Properties and items a schema marks as evaluated no matter which document
  // reaches it, mirroring how ajv folds these into the compiled validator.
  markStaticEvaluated(node, evaluated) {
    if (!this.unevaluated) return;
    if (isObject(node.properties)) {
      const names = schemaProperties(node.properties);
      if (names.length > 0) evaluated.props = this.mergeProps(this.staticProps(names), evaluated.props);
    }
    if (node.additionalProperties !== undefined) evaluated.props = true;
    if (this.draft2020) {
      if (Array.isArray(node.prefixItems) && node.prefixItems.length > 0) {
        evaluated.items = this.mergeItems(node.prefixItems.length, evaluated.items);
      }
      if (node.items !== undefined) evaluated.items = true;
    } else {
      if (node.items !== undefined) {
        if (Array.isArray(node.items)) {
          if (node.items.length > 0) evaluated.items = this.mergeItems(node.items.length, evaluated.items);
        } else {
          evaluated.items = true;
        }
      }
      if (Array.isArray(node.items) && node.additionalItems !== undefined) evaluated.items = true;
    }
    if (this.containsMarksItems(node)) evaluated.items = true;
  }

  // `contains` marks the whole array evaluated unless ajv ignores the keyword
  // (minContains 0 without maxContains), rejects its bounds outright, or gets
  // an always-valid item schema and therefore never enters the item loop.
  containsMarksItems(node) {
    if (node.contains === undefined) return false;
    const min = this.next && node.minContains !== undefined ? node.minContains : 1;
    const max = this.next ? node.maxContains : undefined;
    if (max === undefined && min === 0) return false;
    if (max !== undefined && min > max) return false;
    return !alwaysValidSchema(node.contains, this.keywordRules);
  }

  mergeChildEvaluated(evaluated, child, merge) {
    if (!this.unevaluated || !merge) return;
    evaluated.props = this.mergeProps(child.props, evaluated.props);
    evaluated.items = this.mergeItems(child.items, evaluated.items);
  }

  // The evaluated names a schema contributes at compile time, before any
  // document is seen. ajv needs this for unselected `if` clauses: their names
  // still decide whether the condition's names survive into a runtime variable.
  // Conditional applicators make the compiled value dynamic (`undefined`).
  staticEvaluated(node, ctx, seen = new Set()) {
    const evaluated = this.newEvaluated();
    if (!isObject(node) || seen.has(node)) return evaluated;
    seen.add(node);

    this.markStaticEvaluated(node, evaluated);

    if (
      evaluated.props !== true &&
      isObject(node.patternProperties) &&
      schemaProperties(node.patternProperties).length > 0
    ) {
      evaluated.props = undefined;
    }

    const mergeChild = (child, childCtx) => {
      const childEval = this.staticEvaluated(child, childCtx, seen);
      evaluated.props = this.mergeProps(childEval.props, evaluated.props);
      evaluated.items = this.mergeItems(childEval.items, evaluated.items);
    };

    if (typeof node.$ref === "string" && ctx.refTargets) {
      const target = ctx.refTargets.get(node);
      if (target) mergeChild(target.node, target.ctx);
    }

    if (Array.isArray(node.allOf)) {
      for (const child of node.allOf) mergeChild(child, ctx);
    }

    for (const keyword of ["anyOf", "oneOf"]) {
      if (!Array.isArray(node[keyword])) continue;
      for (const child of node[keyword]) {
        const childEval = this.staticEvaluated(child, ctx, seen);
        if (childEval.props !== undefined) evaluated.props = undefined;
        if (childEval.items !== undefined) evaluated.items = undefined;
      }
    }

    if (node.if !== undefined) {
      for (const child of [node.if, node.then, node.else]) {
        if (child === undefined) continue;
        const childEval = this.staticEvaluated(child, ctx, seen);
        if (childEval.props !== undefined) evaluated.props = undefined;
        if (childEval.items !== undefined) evaluated.items = undefined;
      }
    }

    for (const keyword of ["dependencies", "dependentSchemas"]) {
      const deps = node[keyword];
      if (!isObject(deps)) continue;
      for (const key of Object.keys(deps)) {
        const child = deps[key];
        if (!isObject(child) && typeof child !== "boolean") continue;
        const childEval = this.staticEvaluated(child, ctx, seen);
        if (childEval.props !== undefined) evaluated.props = undefined;
        if (childEval.items !== undefined) evaluated.items = undefined;
      }
    }

    return evaluated;
  }

  // ajv folds an `if` condition's evaluated names into the clause result and,
  // when a clause contributes names of its own, turns that union into a
  // validator-local variable assigned inside the selected branch. The condition
  // names are therefore lost whenever the branch that initialized the variable
  // did not run. This reproduces that observable outcome, including the case
  // where both clauses contribute.
  applyIfEvaluated(evaluated, condition, thenEval, elseEval, hasThen, hasElse, conditionTrue, thenOk, elseOk) {
    if (!this.unevaluated) return;
    evaluated.props = this.ifMerged(
      evaluated.props,
      condition.props,
      hasThen ? thenEval.props : undefined,
      hasElse ? elseEval.props : undefined,
      conditionTrue,
      thenOk,
      elseOk,
      (from, to) => this.mergeProps(from, to),
    );
    evaluated.items = this.ifMerged(
      evaluated.items,
      condition.items,
      hasThen ? thenEval.items : undefined,
      hasElse ? elseEval.items : undefined,
      conditionTrue,
      thenOk,
      elseOk,
      (from, to) => this.mergeItems(from, to),
    );
  }

  ifMerged(current, condition, thenValue, elseValue, conditionTrue, thenOk, elseOk, merge) {
    let value = condition;
    let conditional = false;
    if (thenValue !== undefined) {
      conditional = true;
      value = undefined;
      if (conditionTrue && thenOk) value = merge(thenValue, condition);
    }
    if (elseValue !== undefined) {
      if (!conditional) {
        conditional = true;
        value = undefined;
        if (!conditionTrue && elseOk) value = merge(elseValue, condition);
      } else if (!conditionTrue && elseOk) {
        value = merge(elseValue, value);
      }
    }
    return conditional ? merge(value, current) : merge(condition, current);
  }

  // ajv's dynamic reference resolution: a dynamic anchor registered earlier in
  // the validation call wins; otherwise the reference acts like a `$ref` to
  // the root of the current compilation environment.
  dynamicRefTarget(node, keyword, state) {
    const anchor = node[keyword].slice(1);
    return state.dynamicAnchors[anchor] || state.env;
  }

  // ajv skips the separate type check when a schema declares one type and has
  // rules for that type, because the group's own guard reports the type error.
  // Registered keywords belong to their declared type's group and count here.
  hasRulesForType(schema, type) {
    if (standardRulesForType(schema, type)) return true;
    const group = this.keywordGroups[type];
    return group !== undefined && group.some((entry) => schema[entry.keyword] !== undefined);
  }

  // Runs one registered custom keyword with ajv's arguments and reports its
  // failure in ajv's form. Returns false only when the keyword added errors,
  // which is how ajv decides the verdict: by the number of reported errors.
  runKeyword(entry, node, ref, state, instancePath, parentData, parentKey, schemaPath) {
    const data = ref.value;
    const dataCxt = {
      instancePath,
      parentData,
      parentDataProperty: parentKey,
      rootData: state.rootData,
    };
    const validate = entry.validate;
    if (entry.inspectErrors) validate.errors = null;
    const passed = entry.passSchema
      ? validate.call(this.ctx.ajv, node[entry.keyword], data, node, dataCxt)
      : validate.call(this.ctx.ajv, data, dataCxt);
    if (entry.modifying && parentData !== undefined) ref.value = parentData[parentKey];
    if (passed) return true;

    const ruleErrors = entry.inspectErrors ? validate.errors : null;
    if (Array.isArray(ruleErrors)) {
      // ajv decides the verdict by the error count, so an empty list of
      // errors the keyword reported leaves the verdict untouched.
      if (ruleErrors.length === 0) return true;
      if (state.errs !== null) {
        for (const error of ruleErrors) {
          if (error.instancePath === undefined) error.instancePath = instancePath;
          error.schemaPath = schemaPath + "/" + entry.keyword;
          state.errs.push(error);
        }
      }
      return false;
    }
    addError(
      state,
      instancePath,
      schemaPath,
      entry.keyword,
      {},
      `must pass "${entry.keyword}" keyword validation`,
    );
    return false;
  }

  // Returns undefined when the format rule does not apply to this data type,
  // otherwise whether the value satisfies the registered format. ajv's format
  // rule belongs to both the number and the string rule group and only runs
  // when the format's declared type equals the group's type.
  formatValid(formatName, data, ruleType) {
    const formatDef = this.formats[formatName];
    if (formatDef === undefined || formatDef === null || formatDef === true) return undefined;
    let formatType = "string";
    let check = formatDef;
    if (typeof formatDef === "object" && !(formatDef instanceof RegExp)) {
      formatType = formatDef.type || "string";
      check = formatDef.validate;
    }
    if (formatType !== ruleType) return undefined;
    return typeof check === "function" ? check(data) : check.test(data);
  }

  run(node, data, ctx, errs, instancePath) {
    return this.runRef(
      node,
      {value: data},
      ctx,
      {
        errs,
        allErrors: ctx.opts.allErrors,
        propertyName: undefined,
        rootData: data,
        dynamicAnchors: this.dynamic ? {} : undefined,
        evaluated: this.newEvaluated(),
        abortToken: {aborted: false},
        env: {ctx, node},
      },
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
      if (!state.allErrors && !composite) state.abortToken.aborted = true;
      return false;
    }
    if (!isObject(node)) return true;

    const opts = ctx.opts;
    const allErrors = state.allErrors;
    const errorsAtStart = state.errs ? state.errs.length : 0;
    let data = ref.value;
    let valid = true;
    const evaluated = state.evaluated;
    this.markStaticEvaluated(node, evaluated);
    if (this.dynamic) {
      if (node.$recursiveAnchor === true) {
        if (!state.dynamicAnchors[""]) state.dynamicAnchors[""] = {ctx, node};
      }
      if (typeof node.$dynamicAnchor === "string") {
        if (!state.dynamicAnchors[node.$dynamicAnchor]) {
          state.dynamicAnchors[node.$dynamicAnchor] = {ctx, node};
        }
      }
    }

    const childState = (errs = state.errs, propertyName = state.propertyName) => ({
      errs,
      allErrors,
      propertyName,
      rootData: state.rootData,
      dynamicAnchors: state.dynamicAnchors,
      evaluated: this.newEvaluated(),
      abortToken: state.abortToken,
      env: state.env,
    });
    const fail = (keyword, params, message, childSchemaPath = schemaPath, childInstancePath = instancePath) => {
      addError(state, childInstancePath, childSchemaPath, keyword, params, message);
      valid = false;
      // In default reporting a keyword failure returns from the compiled
      // validation function; nested `if` clauses use this to decide whether
      // ajv's own failure entry is reachable.
      if (!allErrors && !composite) state.abortToken.aborted = true;
    };
    // Runs one group of registered custom keywords in ajv's order. Returns
    // false only when the first failure ends validation (default reporting).
    const runKeywords = (defs) => {
      for (const entry of defs) {
        if (node[entry.keyword] === undefined) continue;
        if (!this.runKeyword(entry, node, ref, state, instancePath, parentData, parentKey, schemaPath)) {
          if (!allErrors && !composite) state.abortToken.aborted = true;
          if (!allErrors) return false;
          valid = false;
        }
        data = ref.value;
      }
      return true;
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
      !(coerceTo.length === 0 && types.length === 1 && this.hasRulesForType(node, types[0]));

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

    for (const keyword of ["$recursiveRef", "$dynamicRef"]) {
      if (typeof node[keyword] !== "string") continue;
      const target = this.dynamicRefTarget(node, keyword, state);
      const child = childState();
      // Dynamic references are compiled as calls, so a failure there does not
      // return from the current validation function.
      child.abortToken = {aborted: false};
      child.env = target;
      const ok = this.runRef(
        target.node,
        ref,
        target.ctx,
        child,
        instancePath,
        parentData,
        parentKey,
        "#",
        false,
      );
      data = ref.value;
      this.mergeChildEvaluated(evaluated, child.evaluated, ok);
      if (!ok) {
        if (!allErrors) return false;
        valid = false;
      }
    }

    if (typeof node.$ref === "string") {
      const target = ctx.refTargets.get(node);
      const child = childState();
      if (!target.inline) {
        child.env = {ctx: target.ctx, node: target.node};
        // A referenced schema compiled as its own validation function exposes
        // its statically known evaluated names to the referencing schema even
        // when the document does not satisfy it, exactly as ajv folds them in
        // at compile time.
        const staticTarget = this.staticEvaluatedFor(target.node, target.ctx);
        evaluated.props = this.mergeProps(staticTarget.props, evaluated.props);
        evaluated.items = this.mergeItems(staticTarget.items, evaluated.items);
        child.abortToken = {aborted: false};
      }
      const ok = this.runRef(
        target.node,
        ref,
        target.ctx,
        child,
        instancePath,
        parentData,
        parentKey,
        target.base,
        target.inline ? composite : false,
      );
      data = ref.value;
      this.mergeChildEvaluated(evaluated, child.evaluated, target.inline || ok);
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
      const alwaysValidBranch = node.anyOf.some((schema) => alwaysValidSchema(schema, this.keywordRules));
      if (!alwaysValidBranch || this.unevaluated) {
        const start = state.errs ? state.errs.length : 0;
        let matched = false;
        for (let i = 0; i < node.anyOf.length; i++) {
          const child = childState();
          const ok = this.runRef(
            node.anyOf[i],
            ref,
            ctx,
            child,
            instancePath,
            parentData,
            parentKey,
            anyOfPath + "/" + i,
            true,
          );
          data = ref.value;
          if (ok) {
            matched = true;
            this.mergeChildEvaluated(evaluated, child.evaluated, true);
            if (!this.unevaluated) break;
          }
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
        const child = childState();
        const ok = this.runRef(
          node.oneOf[i],
          ref,
          ctx,
          child,
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
            this.mergeChildEvaluated(evaluated, child.evaluated, true);
          }
        } else if (ok && matched) {
          // ajv skips the evaluated-property merge of a second matching
          // branch, so those names stay unevaluated.
          matched = false;
          passing = [passing, i];
          break;
        } else if (ok) {
          matched = true;
          passing = i;
          this.mergeChildEvaluated(evaluated, child.evaluated, true);
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
        const child = childState();
        const ok = this.runRef(
          node.allOf[i],
          ref,
          ctx,
          child,
          instancePath,
          parentData,
          parentKey,
          schemaPath + "/allOf/" + i,
          composite,
        );
        data = ref.value;
        this.mergeChildEvaluated(evaluated, child.evaluated, true);
        if (!ok) {
          valid = false;
          if (!allErrors) return false;
        }
      }
    }

    if (node.if !== undefined) {
      const hasThen = node.then !== undefined && !alwaysValidSchema(node.then, this.keywordRules);
      const hasElse = node.else !== undefined && !alwaysValidSchema(node.else, this.keywordRules);
      if (hasThen || hasElse) {
        const ifPath = schemaPath + "/if";
        const ifChild = childState(null);
        const testOk = this.runRef(
          node.if,
          ref,
          ctx,
          ifChild,
          instancePath,
          parentData,
          parentKey,
          ifPath,
          true,
        );
        data = ref.value;
        let clause = null;
        let clauseOk = true;
        let thenEval = hasThen ? this.staticEvaluated(node.then, ctx) : this.newEvaluated();
        let elseEval = hasElse ? this.staticEvaluated(node.else, ctx) : this.newEvaluated();
        let thenOk = false;
        let elseOk = false;
        if (testOk) {
          if (hasThen) {
            clause = "then";
            const child = childState();
            clauseOk = this.runRef(
              node.then,
              ref,
              ctx,
              child,
              instancePath,
              parentData,
              parentKey,
              schemaPath + "/then",
              composite,
            );
            data = ref.value;
            thenEval = child.evaluated;
            thenOk = clauseOk;
          }
        } else if (hasElse) {
          clause = "else";
          const child = childState();
          clauseOk = this.runRef(
            node.else,
            ref,
            ctx,
            child,
            instancePath,
            parentData,
            parentKey,
            schemaPath + "/else",
            composite,
          );
          data = ref.value;
          elseEval = child.evaluated;
          elseOk = clauseOk;
        }
        this.applyIfEvaluated(
          evaluated,
          ifChild.evaluated,
          thenEval,
          elseEval,
          hasThen,
          hasElse,
          testOk,
          thenOk,
          elseOk,
        );
        if (!clauseOk) {
          valid = false;
          // ajv appends its own "if" entry after a clause failure that did
          // not already return from the compiled function; a failure coming
          // from a reference call is reachable, an inline keyword failure is
          // not.
          if (allErrors || composite || !state.abortToken.aborted) {
            addError(state, instancePath, schemaPath, "if", {failingKeyword: clause}, `must match "${clause}" schema`);
            if (!allErrors && !composite) state.abortToken.aborted = true;
          }
          if (!allErrors) return false;
        }
      }
    }

    // Registered keywords declared for no particular type form ajv's untyped
    // rule group: they run after the standard untyped rules and before every
    // typed group.
    if (!runKeywords(this.keywordGroups.any)) return false;

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
      if (typeof node.format === "string" && opts.validateFormats) {
        const ok = this.formatValid(node.format, data, "number");
        if (ok === false) {
          fail("format", {format: node.format}, `must match format "${node.format}"`);
          if (!allErrors) return false;
        }
      }
      if (!runKeywords(this.keywordGroups.number)) return false;
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
      if (typeof node.format === "string" && opts.validateFormats) {
        const ok = this.formatValid(node.format, data, "string");
        if (ok === false) {
          fail("format", {format: node.format}, `must match format "${node.format}"`);
          if (!allErrors) return false;
        }
      }
      if (!runKeywords(this.keywordGroups.string)) return false;
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
      if (this.draft2020) {
        const prefix = Array.isArray(node.prefixItems) ? node.prefixItems : undefined;
        if (prefix !== undefined) {
          const limit = Math.min(prefix.length, data.length);
          for (let i = 0; i < limit; i++) {
            if (alwaysValidSchema(prefix[i], this.keywordRules)) continue;
            if (
              !this.runRef(
                prefix[i],
                {value: data[i]},
                ctx,
                childState(),
                instancePath + "/" + i,
                data,
                i,
                schemaPath + "/prefixItems/" + i,
                composite,
              )
            ) {
              if (!allErrors) return false;
              valid = false;
            }
          }
        }
        if (node.items !== undefined) {
          const items = node.items;
          if (prefix !== undefined) {
            // ajv 2020 validates `items` from the end of `prefixItems` on,
            // reporting a boolean false schema as the keyword's limit error.
            if (items === false) {
              if (data.length > prefix.length) {
                fail(
                  "items",
                  {limit: prefix.length},
                  `must NOT have more than ${prefix.length} items`,
                );
                if (!allErrors) return false;
              }
            } else if (!alwaysValidSchema(items, this.keywordRules)) {
              for (let i = prefix.length; i < data.length; i++) {
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
          } else if (!alwaysValidSchema(items, this.keywordRules)) {
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
      } else {
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
          } else if (!alwaysValidSchema(extra, this.keywordRules)) {
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
              if (alwaysValidSchema(items[i], this.keywordRules)) continue;
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
          } else if (!alwaysValidSchema(items, this.keywordRules)) {
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
      }
      if (node.contains !== undefined) {
        const min = this.next && node.minContains !== undefined ? node.minContains : 1;
        const max = this.next ? node.maxContains : undefined;
        const params =
          max === undefined ? {minContains: min} : {minContains: min, maxContains: max};
        const message =
          max === undefined
            ? `must contain at least ${min} valid item(s)`
            : `must contain at least ${min} and no more than ${max} valid item(s)`;
        if (max === undefined && min === 0) {
          // ajv ignores "minContains" == 0 without "maxContains".
        } else if (max !== undefined && min > max) {
          fail("contains", params, message);
          if (!allErrors) return false;
        } else if (alwaysValidSchema(node.contains, this.keywordRules)) {
          if (data.length < min || (max !== undefined && data.length > max)) {
            fail("contains", params, message);
            if (!allErrors) return false;
          }
        } else if (max === undefined && min === 1) {
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
            fail("contains", params, message);
            if (!allErrors) return false;
          }
        } else {
          const start = state.errs ? state.errs.length : 0;
          let count = 0;
          let matched = min === 0;
          let tooMany = false;
          for (let i = 0; i < data.length; i++) {
            const ok = this.runRef(
              node.contains,
              {value: data[i]},
              ctx,
              childState(),
              instancePath + "/" + i,
              data,
              i,
              schemaPath + "/contains",
              true,
            );
            if (!ok) continue;
            count++;
            if (max !== undefined && count > max) {
              tooMany = true;
              break;
            }
            if (min === 0 || count >= min) matched = true;
            if (max === undefined && count >= min) break;
          }
          if (matched && !tooMany) {
            if (state.errs) state.errs.length = start;
          } else {
            if (!allErrors && !composite && state.errs) state.errs.length = start;
            fail("contains", params, message);
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
      if (this.unevaluated && node.unevaluatedItems !== undefined && evaluated.items !== true) {
        const from = evaluated.items === undefined ? 0 : evaluated.items;
        if (node.unevaluatedItems === false) {
          if (data.length > from) {
            fail(
              "unevaluatedItems",
              {limit: from},
              `must NOT have more than ${from} items`,
            );
            if (!allErrors) return false;
          }
        } else if (!alwaysValidSchema(node.unevaluatedItems, this.keywordRules)) {
          for (let i = from; i < data.length; i++) {
            if (
              !this.runRef(
                node.unevaluatedItems,
                {value: data[i]},
                ctx,
                childState(),
                instancePath + "/" + i,
                data,
                i,
                schemaPath + "/unevaluatedItems",
                composite,
              )
            ) {
              if (!allErrors) return false;
              valid = false;
            }
          }
        }
        evaluated.items = true;
      }
      if (!runKeywords(this.keywordGroups.array)) return false;
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

      if (node.propertyNames !== undefined && !alwaysValidSchema(node.propertyNames, this.keywordRules)) {
        for (const key of enumerableKeys(data)) {
          const ok = this.runRef(
            node.propertyNames,
            {value: key},
            ctx,
            childState(state.errs, key),
            instancePath,
            // ajv validates the property name as the subschema's data while
            // keeping the validated object as its parent data.
            data,
            parentKey,
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
            if (!allErrors && !composite) state.abortToken.aborted = true;
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
        } else if (!alwaysValidSchema(additional, this.keywordRules)) {
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
          if (alwaysValidSchema(dependency, this.keywordRules)) continue;
          const child = childState();
          const ok = this.runRef(
            dependency,
            ref,
            ctx,
            child,
            instancePath,
            parentData,
            parentKey,
            schemaPath + "/dependencies/" + escapeSchemaToken(property),
            composite,
          );
          this.mergeChildEvaluated(evaluated, child.evaluated, ok);
          if (!ok) {
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
        const markPattern = (key) => {
          if (!this.unevaluated || evaluated.props === true) return;
          if (evaluated.props === undefined) evaluated.props = this.staticProps([]);
          evaluated.props[key] = true;
        };
        for (let p = 0; p < patterns.length; p++) {
          const regExp = patternRegExps[p];
          const patternSchema = patternProperties[patterns[p]];
          if (alwaysValidSchema(patternSchema, this.keywordRules)) {
            if (this.unevaluated) {
              for (const key of enumerableKeys(data)) {
                if (regExp.test(key)) markPattern(key);
              }
            }
            continue;
          }
          for (const key of enumerableKeys(data)) {
            if (!regExp.test(key)) continue;
            markPattern(key);
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
      if (this.next && isObject(node.dependentRequired)) {
        for (const property of Object.keys(node.dependentRequired)) {
          if (property === "__proto__") continue;
          const dependency = node.dependentRequired[property];
          if (!Array.isArray(dependency) || dependency.length === 0) continue;
          if (!propertyInData(data, property, ownProperties)) continue;
          for (const required of dependency) {
            if (noPropertyInData(data, required, ownProperties)) {
              fail(
                "dependentRequired",
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
      }

      if (this.next && isObject(node.dependentSchemas)) {
        for (const property of Object.keys(node.dependentSchemas)) {
          if (property === "__proto__") continue;
          const dependency = node.dependentSchemas[property];
          if (!propertyInData(data, property, ownProperties)) continue;
          if (alwaysValidSchema(dependency, this.keywordRules)) continue;
          const child = childState();
          const ok = this.runRef(
            dependency,
            ref,
            ctx,
            child,
            instancePath,
            parentData,
            parentKey,
            schemaPath + "/dependentSchemas/" + escapeSchemaToken(property),
            composite,
          );
          this.mergeChildEvaluated(evaluated, child.evaluated, ok);
          if (!ok) {
            if (!allErrors) return false;
            valid = false;
          }
        }
      }

      if (this.unevaluated && node.unevaluatedProperties !== undefined) {
        const props = evaluated.props;
        if (props !== true) {
          for (const key of enumerableKeys(data)) {
            if (props !== undefined && props[key] === true) continue;
            if (node.unevaluatedProperties === false) {
              fail(
                "unevaluatedProperties",
                {unevaluatedProperty: key},
                "must NOT have unevaluated properties",
              );
              if (!allErrors) return false;
            } else if (!alwaysValidSchema(node.unevaluatedProperties, this.keywordRules)) {
              if (
                !this.runRef(
                  node.unevaluatedProperties,
                  {value: data[key]},
                  ctx,
                  childState(),
                  instancePath + "/" + escapePointerToken(key),
                  data,
                  key,
                  schemaPath + "/unevaluatedProperties",
                  composite,
                )
              ) {
                if (!allErrors) return false;
                valid = false;
              }
            }
          }
        }
        evaluated.props = true;
      }

      if (!runKeywords(this.keywordGroups.object)) return false;
    } else if (!checkTypes && types.length === 1 && types[0] === "object") {
      fail("type", {type: node.type}, typeMessage(node.type));
      if (!allErrors) return false;
    }

    // Keywords declared for a type that has no standard rule group (integer,
    // boolean, null) form their own groups, appended after the standard ones.
    for (const [type, entries] of this.keywordGroups.extra) {
      if (checkDataType(type, data, opts.strictNumbers)) {
        if (!runKeywords(entries)) return false;
      }
    }

    return valid;
  }

  // The asynchronous counterpart of run/runRef. It mirrors the synchronous
  // traversal rule for rule, awaiting the asynchronous rules and formats ajv
  // allows in a `$async: true` schema, and returns the possibly coerced or
  // modified root data the way ajv's asynchronous validators resolve.
  async runAsync(node, data, ctx, errs, instancePath) {
    const ref = {value: data};
    const state = {
      errs,
      allErrors: ctx.opts.allErrors,
      propertyName: undefined,
      rootData: data,
      dynamicAnchors: this.dynamic ? {} : undefined,
      evaluated: this.newEvaluated(),
      abortToken: {aborted: false},
      env: {ctx, node},
    };
    const valid = await this.runRefAsync(node, ref, ctx, state, instancePath, undefined, undefined, "#", false);
    return {valid, data: ref.value};
  }

  // Runs an asynchronous custom keyword. ajv calls the rule with the same
  // arguments as a synchronous one, awaits its result, and only takes error
  // objects from a rejected ValidationError; a plain rejection propagates.
  async runKeywordAsync(entry, node, ref, state, instancePath, parentData, parentKey, schemaPath) {
    const data = ref.value;
    const dataCxt = {
      instancePath,
      parentData,
      parentDataProperty: parentKey,
      rootData: state.rootData,
    };
    const validate = entry.validate;
    const args = entry.passSchema
      ? [node[entry.keyword], data, node, dataCxt]
      : [data, dataCxt];
    let passed;
    let ruleErrors = null;
    if (entry.inspectErrors) {
      try {
        passed = await validate.call(this.ctx.ajv, ...args);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        passed = false;
        ruleErrors = error.errors;
      }
    } else {
      passed = await validate.call(this.ctx.ajv, ...args);
    }
    if (entry.modifying && parentData !== undefined) ref.value = parentData[parentKey];
    if (passed) return true;

    if (entry.inspectErrors && Array.isArray(ruleErrors)) {
      // ajv decides the verdict by the error count, so an empty list of
      // errors the keyword reported leaves the verdict untouched.
      if (ruleErrors.length === 0) return true;
      if (state.errs !== null) {
        for (const error of ruleErrors) {
          if (error.instancePath === undefined) error.instancePath = instancePath;
          error.schemaPath = schemaPath + "/" + entry.keyword;
          state.errs.push(error);
        }
      }
      return false;
    }
    addError(
      state,
      instancePath,
      schemaPath,
      entry.keyword,
      {},
      `must pass "${entry.keyword}" keyword validation`,
    );
    return false;
  }

  // Asynchronous formats are awaited only when their definition declares
  // `async: true`, exactly as ajv generates the call. An undefined result
  // means the format does not apply to this data type.
  async formatValidAsync(formatName, data, ruleType) {
    const formatDef = this.formats[formatName];
    if (formatDef === undefined || formatDef === null || formatDef === true) return undefined;
    let formatType = "string";
    let check = formatDef;
    let isAsync = false;
    if (typeof formatDef === "object" && !(formatDef instanceof RegExp)) {
      formatType = formatDef.type || "string";
      check = formatDef.validate;
      isAsync = Boolean(formatDef.async);
    }
    if (formatType !== ruleType) return undefined;
    if (isAsync) return await check(data);
    return typeof check === "function" ? check(data) : check.test(data);
  }

  async runRefAsync(node, ref, ctx, state, instancePath, parentData, parentKey, schemaPath, composite) {
    if (node === true) return true;
    if (node === false) {
      addError(state, instancePath, schemaPath, "false schema", {}, "boolean schema is false");
      if (!state.allErrors && !composite) state.abortToken.aborted = true;
      return false;
    }
    if (!isObject(node)) return true;

    const opts = ctx.opts;
    const allErrors = state.allErrors;
    const errorsAtStart = state.errs ? state.errs.length : 0;
    let data = ref.value;
    let valid = true;
    const evaluated = state.evaluated;
    this.markStaticEvaluated(node, evaluated);
    if (this.dynamic) {
      if (node.$recursiveAnchor === true) {
        if (!state.dynamicAnchors[""]) state.dynamicAnchors[""] = {ctx, node};
      }
      if (typeof node.$dynamicAnchor === "string") {
        if (!state.dynamicAnchors[node.$dynamicAnchor]) {
          state.dynamicAnchors[node.$dynamicAnchor] = {ctx, node};
        }
      }
    }

    const childState = (errs = state.errs, propertyName = state.propertyName) => ({
      errs,
      allErrors,
      propertyName,
      rootData: state.rootData,
      dynamicAnchors: state.dynamicAnchors,
      evaluated: this.newEvaluated(),
      abortToken: state.abortToken,
      env: state.env,
    });
    const fail = (keyword, params, message, childSchemaPath = schemaPath, childInstancePath = instancePath) => {
      addError(state, childInstancePath, childSchemaPath, keyword, params, message);
      valid = false;
      if (!allErrors && !composite) state.abortToken.aborted = true;
    };
    const runKeywords = async (defs) => {
      for (const entry of defs) {
        if (node[entry.keyword] === undefined) continue;
        const passed = entry.async
          ? await this.runKeywordAsync(
              entry,
              node,
              ref,
              state,
              instancePath,
              parentData,
              parentKey,
              schemaPath,
            )
          : this.runKeyword(entry, node, ref, state, instancePath, parentData, parentKey, schemaPath);
        if (!passed) {
          if (!allErrors && !composite) state.abortToken.aborted = true;
          if (!allErrors) return false;
          valid = false;
        }
        data = ref.value;
      }
      return true;
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
      !(coerceTo.length === 0 && types.length === 1 && this.hasRulesForType(node, types[0]));

    if (checkTypes && !checkDataTypes(types, data, opts.strictNumbers)) {
      let coerced = NO_COERCION;
      if (coerceTo.length) coerced = coerceData(data, coerceTo, opts, opts.strictNumbers);
      if (coerced !== NO_COERCION) {
        data = coerced;
        ref.value = coerced;
        if (parentData !== undefined) parentData[parentKey] = coerced;
      } else {
        fail("type", {type: node.type}, typeMessage(node.type));
        if (!allErrors && !composite) return false;
      }
    }

    for (const keyword of ["$recursiveRef", "$dynamicRef"]) {
      if (typeof node[keyword] !== "string") continue;
      const target = this.dynamicRefTarget(node, keyword, state);
      const child = childState();
      child.abortToken = {aborted: false};
      child.env = target;
      const ok = await this.runRefAsync(
        target.node,
        ref,
        target.ctx,
        child,
        instancePath,
        parentData,
        parentKey,
        "#",
        false,
      );
      data = ref.value;
      this.mergeChildEvaluated(evaluated, child.evaluated, ok);
      if (!ok) {
        if (!allErrors) return false;
        valid = false;
      }
    }

    if (typeof node.$ref === "string") {
      const target = ctx.refTargets.get(node);
      const child = childState();
      if (!target.inline) {
        child.env = {ctx: target.ctx, node: target.node};
        const staticTarget = this.staticEvaluatedFor(target.node, target.ctx);
        evaluated.props = this.mergeProps(staticTarget.props, evaluated.props);
        evaluated.items = this.mergeItems(staticTarget.items, evaluated.items);
        child.abortToken = {aborted: false};
      }
      const ok = await this.runRefAsync(
        target.node,
        ref,
        target.ctx,
        child,
        instancePath,
        parentData,
        parentKey,
        target.base,
        target.inline ? composite : false,
      );
      data = ref.value;
      this.mergeChildEvaluated(evaluated, child.evaluated, target.inline || ok);
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
      const notValid = await this.runRefAsync(
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
      const alwaysValidBranch = node.anyOf.some((schema) => alwaysValidSchema(schema, this.keywordRules));
      if (!alwaysValidBranch || this.unevaluated) {
        const start = state.errs ? state.errs.length : 0;
        let matched = false;
        for (let i = 0; i < node.anyOf.length; i++) {
          const child = childState();
          const ok = await this.runRefAsync(
            node.anyOf[i],
            ref,
            ctx,
            child,
            instancePath,
            parentData,
            parentKey,
            anyOfPath + "/" + i,
            true,
          );
          data = ref.value;
          if (ok) {
            matched = true;
            this.mergeChildEvaluated(evaluated, child.evaluated, true);
            if (!this.unevaluated) break;
          }
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
        const child = childState();
        const ok = await this.runRefAsync(
          node.oneOf[i],
          ref,
          ctx,
          child,
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
            this.mergeChildEvaluated(evaluated, child.evaluated, true);
          }
        } else if (ok && matched) {
          // ajv skips the evaluated-property merge of a second matching
          // branch and does not evaluate the branches after it.
          matched = false;
          passing = [passing, i];
          break;
        } else if (ok) {
          matched = true;
          passing = i;
          this.mergeChildEvaluated(evaluated, child.evaluated, true);
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
        const child = childState();
        const ok = await this.runRefAsync(
          node.allOf[i],
          ref,
          ctx,
          child,
          instancePath,
          parentData,
          parentKey,
          schemaPath + "/allOf/" + i,
          composite,
        );
        data = ref.value;
        this.mergeChildEvaluated(evaluated, child.evaluated, true);
        if (!ok) {
          valid = false;
          if (!allErrors) return false;
        }
      }
    }

    if (node.if !== undefined) {
      const hasThen = node.then !== undefined && !alwaysValidSchema(node.then, this.keywordRules);
      const hasElse = node.else !== undefined && !alwaysValidSchema(node.else, this.keywordRules);
      if (hasThen || hasElse) {
        const ifPath = schemaPath + "/if";
        const ifChild = childState(null);
        const testOk = await this.runRefAsync(
          node.if,
          ref,
          ctx,
          ifChild,
          instancePath,
          parentData,
          parentKey,
          ifPath,
          true,
        );
        data = ref.value;
        let clause = null;
        let clauseOk = true;
        let thenEval = hasThen ? this.staticEvaluated(node.then, ctx) : this.newEvaluated();
        let elseEval = hasElse ? this.staticEvaluated(node.else, ctx) : this.newEvaluated();
        let thenOk = false;
        let elseOk = false;
        if (testOk) {
          if (hasThen) {
            clause = "then";
            const child = childState();
            clauseOk = await this.runRefAsync(
              node.then,
              ref,
              ctx,
              child,
              instancePath,
              parentData,
              parentKey,
              schemaPath + "/then",
              composite,
            );
            data = ref.value;
            thenEval = child.evaluated;
            thenOk = clauseOk;
          }
        } else if (hasElse) {
          clause = "else";
          const child = childState();
          clauseOk = await this.runRefAsync(
            node.else,
            ref,
            ctx,
            child,
            instancePath,
            parentData,
            parentKey,
            schemaPath + "/else",
            composite,
          );
          data = ref.value;
          elseEval = child.evaluated;
          elseOk = clauseOk;
        }
        this.applyIfEvaluated(
          evaluated,
          ifChild.evaluated,
          thenEval,
          elseEval,
          hasThen,
          hasElse,
          testOk,
          thenOk,
          elseOk,
        );
        if (!clauseOk) {
          valid = false;
          // ajv appends its own "if" entry after a clause failure that did
          // not already return from the compiled function; a failure coming
          // from a reference call is reachable, an inline keyword failure is
          // not.
          if (allErrors || composite || !state.abortToken.aborted) {
            addError(state, instancePath, schemaPath, "if", {failingKeyword: clause}, `must match "${clause}" schema`);
            if (!allErrors && !composite) state.abortToken.aborted = true;
          }
          if (!allErrors) return false;
        }
      }
    }

    if (!(await runKeywords(this.keywordGroups.any))) return false;

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
      if (typeof node.format === "string" && opts.validateFormats) {
        const ok = await this.formatValidAsync(node.format, data, "number");
        if (ok !== undefined && !ok) {
          fail("format", {format: node.format}, `must match format "${node.format}"`);
          if (!allErrors) return false;
        }
      }
      if (!(await runKeywords(this.keywordGroups.number))) return false;
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
      if (typeof node.format === "string" && opts.validateFormats) {
        const ok = await this.formatValidAsync(node.format, data, "string");
        if (ok !== undefined && !ok) {
          fail("format", {format: node.format}, `must match format "${node.format}"`);
          if (!allErrors) return false;
        }
      }
      if (!(await runKeywords(this.keywordGroups.string))) return false;
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
      if (this.draft2020) {
        const prefix = Array.isArray(node.prefixItems) ? node.prefixItems : undefined;
        if (prefix !== undefined) {
          const limit = Math.min(prefix.length, data.length);
          for (let i = 0; i < limit; i++) {
            if (alwaysValidSchema(prefix[i], this.keywordRules)) continue;
            if (
              !(await this.runRefAsync(
                prefix[i],
                {value: data[i]},
                ctx,
                childState(),
                instancePath + "/" + i,
                data,
                i,
                schemaPath + "/prefixItems/" + i,
                composite,
              ))
            ) {
              if (!allErrors) return false;
              valid = false;
            }
          }
        }
        if (node.items !== undefined) {
          const items = node.items;
          if (prefix !== undefined) {
            if (items === false) {
              if (data.length > prefix.length) {
                fail(
                  "items",
                  {limit: prefix.length},
                  `must NOT have more than ${prefix.length} items`,
                );
                if (!allErrors) return false;
              }
            } else if (!alwaysValidSchema(items, this.keywordRules)) {
              for (let i = prefix.length; i < data.length; i++) {
                if (
                  !(await this.runRefAsync(
                    items,
                    {value: data[i]},
                    ctx,
                    childState(),
                    instancePath + "/" + i,
                    data,
                    i,
                    schemaPath + "/items",
                    composite,
                  ))
                ) {
                  if (!allErrors) return false;
                  valid = false;
                }
              }
            }
          } else if (!alwaysValidSchema(items, this.keywordRules)) {
            for (let i = 0; i < data.length; i++) {
              if (
                !(await this.runRefAsync(
                  items,
                  {value: data[i]},
                  ctx,
                  childState(),
                  instancePath + "/" + i,
                  data,
                  i,
                  schemaPath + "/items",
                  composite,
                ))
              ) {
                if (!allErrors) return false;
                valid = false;
              }
            }
          }
        }
      } else {
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
          } else if (!alwaysValidSchema(extra, this.keywordRules)) {
            for (let i = node.items.length; i < data.length; i++) {
              if (
                !(await this.runRefAsync(
                  extra,
                  {value: data[i]},
                  ctx,
                  childState(),
                  instancePath + "/" + i,
                  data,
                  i,
                  schemaPath + "/additionalItems",
                  composite,
                ))
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
              if (alwaysValidSchema(items[i], this.keywordRules)) continue;
              if (
                !(await this.runRefAsync(
                  items[i],
                  {value: data[i]},
                  ctx,
                  childState(),
                  instancePath + "/" + i,
                  data,
                  i,
                  schemaPath + "/items/" + i,
                  composite,
                ))
              ) {
                if (!allErrors) return false;
                valid = false;
              }
            }
          } else if (!alwaysValidSchema(items, this.keywordRules)) {
            for (let i = 0; i < data.length; i++) {
              if (
                !(await this.runRefAsync(
                  items,
                  {value: data[i]},
                  ctx,
                  childState(),
                  instancePath + "/" + i,
                  data,
                  i,
                  schemaPath + "/items",
                  composite,
                ))
              ) {
                if (!allErrors) return false;
                valid = false;
              }
            }
          }
        }
      }
      if (node.contains !== undefined) {
        const min = this.next && node.minContains !== undefined ? node.minContains : 1;
        const max = this.next ? node.maxContains : undefined;
        const params =
          max === undefined ? {minContains: min} : {minContains: min, maxContains: max};
        const message =
          max === undefined
            ? `must contain at least ${min} valid item(s)`
            : `must contain at least ${min} and no more than ${max} valid item(s)`;
        if (max === undefined && min === 0) {
          // ajv ignores "minContains" == 0 without "maxContains".
        } else if (max !== undefined && min > max) {
          fail("contains", params, message);
          if (!allErrors) return false;
        } else if (alwaysValidSchema(node.contains, this.keywordRules)) {
          if (data.length < min || (max !== undefined && data.length > max)) {
            fail("contains", params, message);
            if (!allErrors) return false;
          }
        } else if (max === undefined && min === 1) {
          const start = state.errs ? state.errs.length : 0;
          let found = false;
          for (let i = 0; i < data.length; i++) {
            if (
              await this.runRefAsync(
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
            if (!allErrors && !composite && state.errs) state.errs.length = start;
            fail("contains", params, message);
            if (!allErrors) return false;
          }
        } else {
          const start = state.errs ? state.errs.length : 0;
          let count = 0;
          let matched = min === 0;
          let tooMany = false;
          for (let i = 0; i < data.length; i++) {
            const ok = await this.runRefAsync(
              node.contains,
              {value: data[i]},
              ctx,
              childState(),
              instancePath + "/" + i,
              data,
              i,
              schemaPath + "/contains",
              true,
            );
            if (!ok) continue;
            count++;
            if (max !== undefined && count > max) {
              tooMany = true;
              break;
            }
            if (min === 0 || count >= min) matched = true;
            if (max === undefined && count >= min) break;
          }
          if (matched && !tooMany) {
            if (state.errs) state.errs.length = start;
          } else {
            if (!allErrors && !composite && state.errs) state.errs.length = start;
            fail("contains", params, message);
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
      if (this.unevaluated && node.unevaluatedItems !== undefined && evaluated.items !== true) {
        const from = evaluated.items === undefined ? 0 : evaluated.items;
        if (node.unevaluatedItems === false) {
          if (data.length > from) {
            fail(
              "unevaluatedItems",
              {limit: from},
              `must NOT have more than ${from} items`,
            );
            if (!allErrors) return false;
          }
        } else if (!alwaysValidSchema(node.unevaluatedItems, this.keywordRules)) {
          for (let i = from; i < data.length; i++) {
            if (
              !(await this.runRefAsync(
                node.unevaluatedItems,
                {value: data[i]},
                ctx,
                childState(),
                instancePath + "/" + i,
                data,
                i,
                schemaPath + "/unevaluatedItems",
                composite,
              ))
            ) {
              if (!allErrors) return false;
              valid = false;
            }
          }
        }
        evaluated.items = true;
      }
      if (!(await runKeywords(this.keywordGroups.array))) return false;
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

      if (node.propertyNames !== undefined && !alwaysValidSchema(node.propertyNames, this.keywordRules)) {
        for (const key of enumerableKeys(data)) {
          const ok = await this.runRefAsync(
            node.propertyNames,
            {value: key},
            ctx,
            childState(state.errs, key),
            instancePath,
            data,
            parentKey,
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
            if (!allErrors && !composite) state.abortToken.aborted = true;
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
        } else if (!alwaysValidSchema(additional, this.keywordRules)) {
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
                !(await this.runRefAsync(
                  additional,
                  {value: data[key]},
                  ctx,
                  childState(null),
                  childInstancePath,
                  data,
                  key,
                  schemaPath + "/additionalProperties",
                  true,
                ))
              ) {
                delete data[key];
              }
            } else if (
              !(await this.runRefAsync(
                additional,
                {value: data[key]},
                ctx,
                childState(),
                childInstancePath,
                data,
                key,
                schemaPath + "/additionalProperties",
                composite,
              ))
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
          if (alwaysValidSchema(dependency, this.keywordRules)) continue;
          const child = childState();
          const ok = await this.runRefAsync(
            dependency,
            ref,
            ctx,
            child,
            instancePath,
            parentData,
            parentKey,
            schemaPath + "/dependencies/" + escapeSchemaToken(property),
            composite,
          );
          this.mergeChildEvaluated(evaluated, child.evaluated, ok);
          if (!ok) {
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
            !(await this.runRefAsync(
              node.properties[property],
              {value: data[property]},
              ctx,
              childState(),
              instancePath + "/" + escapePointerToken(property),
              data,
              property,
              schemaPath + "/properties/" + escapeSchemaToken(property),
              composite,
            ))
          ) {
            if (!allErrors) return false;
            valid = false;
          }
        }
      }

      if (patternProperties) {
        const markPattern = (key) => {
          if (!this.unevaluated || evaluated.props === true) return;
          if (evaluated.props === undefined) evaluated.props = this.staticProps([]);
          evaluated.props[key] = true;
        };
        for (let p = 0; p < patterns.length; p++) {
          const regExp = patternRegExps[p];
          const patternSchema = patternProperties[patterns[p]];
          if (alwaysValidSchema(patternSchema, this.keywordRules)) {
            if (this.unevaluated) {
              for (const key of enumerableKeys(data)) {
                if (regExp.test(key)) markPattern(key);
              }
            }
            continue;
          }
          for (const key of enumerableKeys(data)) {
            if (!regExp.test(key)) continue;
            markPattern(key);
            if (
              !(await this.runRefAsync(
                patternSchema,
                {value: data[key]},
                ctx,
                childState(),
                instancePath + "/" + escapePointerToken(key),
                data,
                key,
                schemaPath + "/patternProperties/" + escapeSchemaToken(patterns[p]),
                composite,
              ))
            ) {
              if (!allErrors) return false;
              valid = false;
            }
          }
        }
      }

      if (this.next && isObject(node.dependentRequired)) {
        for (const property of Object.keys(node.dependentRequired)) {
          if (property === "__proto__") continue;
          const dependency = node.dependentRequired[property];
          if (!Array.isArray(dependency) || dependency.length === 0) continue;
          if (!propertyInData(data, property, ownProperties)) continue;
          for (const required of dependency) {
            if (noPropertyInData(data, required, ownProperties)) {
              fail(
                "dependentRequired",
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
      }

      if (this.next && isObject(node.dependentSchemas)) {
        for (const property of Object.keys(node.dependentSchemas)) {
          if (property === "__proto__") continue;
          const dependency = node.dependentSchemas[property];
          if (!propertyInData(data, property, ownProperties)) continue;
          if (alwaysValidSchema(dependency, this.keywordRules)) continue;
          const child = childState();
          const ok = await this.runRefAsync(
            dependency,
            ref,
            ctx,
            child,
            instancePath,
            parentData,
            parentKey,
            schemaPath + "/dependentSchemas/" + escapeSchemaToken(property),
            composite,
          );
          this.mergeChildEvaluated(evaluated, child.evaluated, ok);
          if (!ok) {
            if (!allErrors) return false;
            valid = false;
          }
        }
      }

      if (this.unevaluated && node.unevaluatedProperties !== undefined) {
        const props = evaluated.props;
        if (props !== true) {
          for (const key of enumerableKeys(data)) {
            if (props !== undefined && props[key] === true) continue;
            if (node.unevaluatedProperties === false) {
              fail(
                "unevaluatedProperties",
                {unevaluatedProperty: key},
                "must NOT have unevaluated properties",
              );
              if (!allErrors) return false;
            } else if (!alwaysValidSchema(node.unevaluatedProperties, this.keywordRules)) {
              if (
                !(await this.runRefAsync(
                  node.unevaluatedProperties,
                  {value: data[key]},
                  ctx,
                  childState(),
                  instancePath + "/" + escapePointerToken(key),
                  data,
                  key,
                  schemaPath + "/unevaluatedProperties",
                  composite,
                ))
              ) {
                if (!allErrors) return false;
                valid = false;
              }
            }
          }
        }
        evaluated.props = true;
      }

      if (!(await runKeywords(this.keywordGroups.object))) return false;
    } else if (!checkTypes && types.length === 1 && types[0] === "object") {
      fail("type", {type: node.type}, typeMessage(node.type));
      if (!allErrors) return false;
    }

    for (const [type, entries] of this.keywordGroups.extra) {
      if (checkDataType(type, data, opts.strictNumbers)) {
        if (!(await runKeywords(entries))) return false;
      }
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
  schemaHasRef,
};
