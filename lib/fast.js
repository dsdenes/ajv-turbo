"use strict";

// A verdict-only compiler for the synchronous covered subset. It generates one
// JavaScript function per schema node and answers exactly the question the
// interpreter answers: is this document valid? Error reports are never built
// here; callers confirm a negative answer through the interpreter, which keeps
// ajv's reports and every option that rewrites data exactly where they were.
//
// A schema is eligible only when the interpreter's verdict depends on nothing
// but the document and the schema: no data-rewriting option, no owned-property
// mode, no registered format that would run, and no registered custom keyword.
// Anything else returns null and the interpreter handles the validator.

const {
  isObject,
  deepEqual,
  checkDataTypes,
  schemaTypes,
  alwaysValidSchema,
  ucs2length,
  DATA_REFERENCE_KEYWORDS,
  isDataReference,
} = require("./util");

const CONTAINER = 'data !== null && typeof data === "object" && !Array.isArray(data)';

class Ineligible extends Error {}

function ineligible() {
  throw new Ineligible();
}

function schemaProperties(map) {
  return map ? Object.keys(map).filter((key) => key !== "__proto__") : [];
}

function numberGuard(strictNumbers) {
  return strictNumbers ? 'typeof data === "number" && isFinite(data)' : 'typeof data === "number"';
}

function typeCheck(type, strictNumbers) {
  switch (type) {
    case "null":
      return "data === null";
    case "array":
      return "Array.isArray(data)";
    case "object":
      return CONTAINER;
    case "integer":
      return strictNumbers
        ? 'typeof data === "number" && !(data % 1) && isFinite(data)'
        : 'typeof data === "number" && !(data % 1) && !isNaN(data)';
    case "number":
      return numberGuard(strictNumbers);
    default:
      if (typeof type !== "string") return "false";
      return "typeof data === " + JSON.stringify(type);
  }
}

function literal(value) {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (value === Infinity) return "Infinity";
    if (value === -Infinity) return "-Infinity";
    return value < 0 ? "(" + String(value) + ")" : String(value);
  }
  return JSON.stringify(value);
}

// Mirrors the interpreter's uniqueItems scan, including its index-map fast path
// for item schemas that can only produce primitives.
function uniqueItemsValid(data, itemTypes, strictNumbers) {
  if (itemTypes.length > 0 && !itemTypes.includes("object") && !itemTypes.includes("array")) {
    const indices = {};
    for (let i = data.length - 1; i >= 0; i--) {
      let item = data[i];
      if (!checkDataTypes(itemTypes, item, strictNumbers)) continue;
      if (itemTypes.length > 1 && typeof item === "string") item += "_";
      if (typeof indices[item] === "number") return false;
      indices[item] = i;
    }
    return true;
  }
  for (let i = data.length - 1; i > 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (deepEqual(data[i], data[j])) return false;
    }
  }
  return true;
}

const HELPERS = {
  deepEqual,
  ucs2length,
  uniqueItems: uniqueItemsValid,
};

class Generator {
  constructor() {
    this.functions = [];
    this.regexps = [];
    this.values = [];
    this.byContext = new Map();
    this.nextName = 0;
    this.trueName = this.createConstant("true");
    this.falseName = this.createConstant("false");
  }

  createConstant(value) {
    const name = "s" + this.nextName++;
    this.functions.push(`function ${name}() { return ${value}; }`);
    return name;
  }

  value(value) {
    this.values.push(value);
    return "v[" + (this.values.length - 1) + "]";
  }

  regexp(ctx, pattern) {
    this.regexps.push(ctx.pattern(pattern));
    return "r[" + (this.regexps.length - 1) + "]";
  }

  compile(ctx, node, root = false) {
    if (node === true) return this.trueName;
    if (node === false) {
      if (root) return this.createRootReject();
      return this.falseName;
    }
    if (!isObject(node)) return this.trueName;

    let cache = this.byContext.get(ctx);
    if (cache === undefined) {
      cache = new WeakMap();
      this.byContext.set(ctx, cache);
    }
    const cached = cache.get(node);
    if (cached !== undefined) return cached;

    // Reserve the name before descending so recursive references terminate.
    const name = "s" + this.nextName++;
    cache.set(node, name);
    let body = this.nodeBody(ctx, node);
    if (root) {
      // The root is the validator a project calls. It counts the call so a
      // lazily built error report can tell whether it still belongs to the
      // latest call, and it routes its own rejection through `__f`.
      body = "__s.n++;\n" + body.split("return false;").join("return __f(data);");
    }
    this.functions.push(`function ${name}(data) {\n${body}\n}`);
    return name;
  }

  createRootReject() {
    const name = "s" + this.nextName++;
    this.functions.push(`function ${name}(data) {\n  __s.n++;\n  return __f(data);\n}`);
    return name;
  }

  checkEligible(ctx, node) {
    const opts = ctx.opts;
    if (opts.coerceTypes || opts.useDefaults || opts.removeAdditional) ineligible();
    if (opts.ownProperties === true) ineligible();
    if (opts.multipleOfPrecision !== undefined) ineligible();
    if (node.$async) ineligible();
    // The discriminator option changes how an annotated schema's oneOf runs
    // even if the keyword itself was removed from the registry.
    if (opts.discriminator && node.discriminator) ineligible();
    // A data reference makes the keyword's verdict depend on the document in
    // a way this generator does not model; the interpreter handles it.
    if (opts.$data === true) {
      for (const keyword of DATA_REFERENCE_KEYWORDS) {
        if (isDataReference(node[keyword])) ineligible();
      }
    }

    for (const key of Object.keys(node)) {
      if (node[key] !== undefined && ctx.keywordRules.has(key)) ineligible();
    }
    // A keyword that stands in for other keywords runs when a schema uses one
    // of them, so the fast path cannot decide the verdict on its own.
    for (const entry of ctx.ajv.keywords.values()) {
      if (entry.implements === undefined) continue;
      if (entry.implements.some((keyword) => node[keyword] !== undefined)) ineligible();
    }
    if (
      typeof node.format === "string" &&
      opts.validateFormats &&
      ctx.ajv.formats[node.format] !== undefined &&
      ctx.ajv.formats[node.format] !== null &&
      ctx.ajv.formats[node.format] !== true
    ) {
      ineligible();
    }
  }

  equality(expression, value) {
    const primitive =
      value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number";
    if (primitive) {
      if (typeof value === "number" && Number.isNaN(value)) return `${expression} !== ${expression}`;
      return `${expression} === ${literal(value)}`;
    }
    return `h.deepEqual(${expression}, ${this.value(value)})`;
  }

  nodeBody(ctx, node) {
    this.checkEligible(ctx, node);
    const opts = ctx.opts;
    const strictNumbers = opts.strictNumbers !== false;
    const keywordRules = ctx.keywordRules;
    const out = [];

    const types = schemaTypes(node);
    if (types.length > 0) {
      const checks = types.map((type) => typeCheck(type, strictNumbers));
      out.push(`if (!(${checks.join(" || ")})) return false;`);
    }
    // A schema that declares exactly one type has already proved that type
    // before any rule group runs, so the group's own guard is redundant.
    const soleType = types.length === 1 ? types[0] : null;

    if (typeof node.$ref === "string") {
      const target = ctx.refTargets.get(node);
      if (target === undefined) ineligible();
      out.push(`if (!${this.compile(target.ctx, target.node)}(data)) return false;`);
    }

    if (Object.prototype.hasOwnProperty.call(node, "const")) {
      out.push(`if (!(${this.equality("data", node.const)})) return false;`);
    }

    if (node.enum !== undefined) {
      if (!Array.isArray(node.enum)) {
        out.push("return false;");
      } else if (node.enum.length === 0) {
        out.push("return false;");
      } else {
        const checks = node.enum.map((allowed) => this.equality("data", allowed));
        out.push(`if (!(${checks.join(" || ")})) return false;`);
      }
    }

    if (node.not !== undefined) {
      if (node.not === true) out.push("return false;");
      else if (node.not !== false) out.push(`if (${this.compile(ctx, node.not)}(data)) return false;`);
    }

    if (Array.isArray(node.anyOf)) {
      if (!node.anyOf.some((schema) => alwaysValidSchema(schema, keywordRules))) {
        const checks = node.anyOf.map((schema) =>
          schema === true ? "true" : schema === false ? "false" : `${this.compile(ctx, schema)}(data)`,
        );
        out.push(`if (!(${checks.join(" || ")})) return false;`);
      }
    }

    if (Array.isArray(node.oneOf)) {
      if (node.oneOf.length === 0) {
        out.push("return false;");
      } else {
        const checks = node.oneOf.map((schema) =>
          schema === true
            ? "1"
            : schema === false
              ? "0"
              : `(${this.compile(ctx, schema)}(data) ? 1 : 0)`,
        );
        out.push(`if (${checks.join(" + ")} !== 1) return false;`);
      }
    }

    if (Array.isArray(node.allOf)) {
      for (const schema of node.allOf) {
        if (alwaysValidSchema(schema, keywordRules)) continue;
        out.push(`if (!${this.compile(ctx, schema)}(data)) return false;`);
      }
    }

    if (node.if !== undefined) {
      const hasThen = node.then !== undefined && !alwaysValidSchema(node.then, keywordRules);
      const hasElse = node.else !== undefined && !alwaysValidSchema(node.else, keywordRules);
      if (hasThen || hasElse) {
        const test = node.if === true ? null : node.if === false ? undefined : this.compile(ctx, node.if);
        const thenCall = hasThen ? this.compile(ctx, node.then) : null;
        const elseCall = hasElse ? this.compile(ctx, node.else) : null;
        if (test === null) {
          if (thenCall !== null) out.push(`if (!${thenCall}(data)) return false;`);
        } else if (test === undefined) {
          if (elseCall !== null) out.push(`if (!${elseCall}(data)) return false;`);
        } else {
          out.push(`if (${test}(data)) {`);
          if (thenCall !== null) out.push(`  if (!${thenCall}(data)) return false;`);
          out.push("} else {");
          if (elseCall !== null) out.push(`  if (!${elseCall}(data)) return false;`);
          out.push("}");
        }
      }
    }

    const number = numberGuard(strictNumbers);
    const numeric = [];
    if (typeof node.maximum === "number") {
      numeric.push(`if (data > ${literal(node.maximum)} || isNaN(data)) return false;`);
    }
    if (typeof node.minimum === "number") {
      numeric.push(`if (data < ${literal(node.minimum)} || isNaN(data)) return false;`);
    }
    if (typeof node.exclusiveMaximum === "number") {
      numeric.push(`if (data >= ${literal(node.exclusiveMaximum)} || isNaN(data)) return false;`);
    }
    if (typeof node.exclusiveMinimum === "number") {
      numeric.push(`if (data <= ${literal(node.exclusiveMinimum)} || isNaN(data)) return false;`);
    }
    if (typeof node.multipleOf === "number") {
      const multipleOf = node.multipleOf;
      if (multipleOf === 0) {
        numeric.push("return false;");
      } else {
        numeric.push(
          `{ const q = data / ${literal(multipleOf)}; ` +
            "if (q !== parseInt(q)) return false; }",
        );
      }
    }
    if (numeric.length > 0) {
      const inline = soleType === "number" || soleType === "integer";
      if (inline) {
        for (const line of numeric) out.push(line);
      } else {
        out.push(`if (${number}) {`);
        for (const line of numeric) out.push("  " + line);
        out.push("}");
      }
    }

    const strings = [];
    if (typeof node.maxLength === "number") {
      strings.push(`if (h.ucs2length(data) > ${literal(node.maxLength)}) return false;`);
    }
    if (typeof node.minLength === "number") {
      strings.push(`if (h.ucs2length(data) < ${literal(node.minLength)}) return false;`);
    }
    if (typeof node.pattern === "string") {
      strings.push(`if (!${this.regexp(ctx, node.pattern)}.test(data)) return false;`);
    }
    if (strings.length > 0) {
      if (soleType === "string") {
        for (const line of strings) out.push(line);
      } else {
        out.push('if (typeof data === "string") {');
        for (const line of strings) out.push("  " + line);
        out.push("}");
      }
    }

    const arrays = [];
    if (typeof node.maxItems === "number") {
      arrays.push(`if (data.length > ${literal(node.maxItems)}) return false;`);
    }
    if (typeof node.minItems === "number") {
      arrays.push(`if (data.length < ${literal(node.minItems)}) return false;`);
    }
    if (Array.isArray(node.items)) {
      for (let i = 0; i < node.items.length; i++) {
        if (alwaysValidSchema(node.items[i], keywordRules)) continue;
        arrays.push(`if (data.length > ${i} && !${this.compile(ctx, node.items[i])}(data[${i}])) return false;`);
      }
      if (node.additionalItems !== undefined) {
        if (node.additionalItems === false) {
          arrays.push(`if (data.length > ${node.items.length}) return false;`);
        } else if (!alwaysValidSchema(node.additionalItems, keywordRules)) {
          const extra = this.compile(ctx, node.additionalItems);
          arrays.push(
            `for (let i = ${node.items.length}; i < data.length; i++) ` +
              `if (!${extra}(data[i])) return false;`,
          );
        }
      }
    } else if (node.items !== undefined) {
      if (!alwaysValidSchema(node.items, keywordRules)) {
        const item = this.compile(ctx, node.items);
        arrays.push(`for (let i = 0; i < data.length; i++) if (!${item}(data[i])) return false;`);
      }
    }
    if (node.contains !== undefined) {
      if (alwaysValidSchema(node.contains, keywordRules)) {
        arrays.push("if (data.length < 1) return false;");
      } else {
        const item = this.compile(ctx, node.contains);
        arrays.push(
          "{ let found = false;",
          `  for (let i = 0; i < data.length; i++) if (${item}(data[i])) { found = true; break; }`,
          "  if (!found) return false; }",
        );
      }
    }
    if (node.uniqueItems === true) {
      // The interpreter derives an item type set only from a single object
      // item schema; an array of schemas leaves it empty.
      const types = itemSchemaTypes(node.items);
      arrays.push(
        "if (data.length > 1 && !h.uniqueItems(data, " +
          this.value(types) +
          ", " +
          strictNumbers +
          ")) return false;",
      );
    }
    if (arrays.length > 0) {
      if (soleType === "array") {
        for (const line of arrays) out.push(line);
      } else {
        out.push("if (Array.isArray(data)) {");
        for (const line of arrays) out.push("  " + line);
        out.push("}");
      }
    }

    const objects = [];
    if (typeof node.maxProperties === "number") {
      objects.push(`if (Object.keys(data).length > ${literal(node.maxProperties)}) return false;`);
    }
    if (typeof node.minProperties === "number") {
      objects.push(`if (Object.keys(data).length < ${literal(node.minProperties)}) return false;`);
    }
    if (Array.isArray(node.required)) {
      for (const property of node.required) {
        objects.push(`if (data[${JSON.stringify(property)}] === undefined) return false;`);
      }
    }
    if (node.propertyNames !== undefined && !alwaysValidSchema(node.propertyNames, keywordRules)) {
      const propertyName = this.compile(ctx, node.propertyNames);
      objects.push(`for (const key in data) if (!${propertyName}(key)) return false;`);
    }

    const defined = isObject(node.properties) ? schemaProperties(node.properties) : [];
    const patternProperties = isObject(node.patternProperties) ? node.patternProperties : undefined;
    const patterns = patternProperties ? schemaProperties(patternProperties) : [];

    if (node.additionalProperties !== undefined) {
      const additional = node.additionalProperties;
      const definedTest = defined.length
        ? defined.map((property) => `key === ${JSON.stringify(property)}`).join(" || ")
        : "false";
      const patternTest = () =>
        patterns.length
          ? patterns.map((pattern) => `${this.regexp(ctx, pattern)}.test(key)`).join(" || ")
          : "false";
      if (additional === false) {
        objects.push(
          `for (const key in data) if (!(${definedTest}) && !(${patternTest()})) return false;`,
        );
      } else if (!alwaysValidSchema(additional, keywordRules)) {
        const extra = this.compile(ctx, additional);
        objects.push(
          `for (const key in data) if (!(${definedTest}) && !(${patternTest()})) {` +
            ` const v = data[key]; if (!${extra}(v)) return false; }`,
        );
      }
    }

    if (isObject(node.dependencies)) {
      for (const property of Object.keys(node.dependencies)) {
        if (property === "__proto__") continue;
        const dependency = node.dependencies[property];
        const present = `data[${JSON.stringify(property)}] !== undefined`;
        if (Array.isArray(dependency)) {
          if (dependency.length === 0) continue;
          const checks = dependency
            .map((required) => `data[${JSON.stringify(required)}] !== undefined`)
            .join(" && ");
          objects.push(`if (${present} && !(${checks})) return false;`);
        } else if (!alwaysValidSchema(dependency, keywordRules)) {
          const dep = this.compile(ctx, dependency);
          objects.push(`if (${present} && !${dep}(data)) return false;`);
        }
      }
    }

    if (isObject(node.properties)) {
      for (const property of defined) {
        const propertySchema = node.properties[property];
        if (alwaysValidSchema(propertySchema, keywordRules)) continue;
        const value = this.compile(ctx, propertySchema);
        const key = JSON.stringify(property);
        objects.push(
          `{ const v = data[${key}]; if (v !== undefined && !${value}(v)) return false; }`,
        );
      }
    }

    for (let i = 0; i < patterns.length; i++) {
      const patternSchema = patternProperties[patterns[i]];
      if (alwaysValidSchema(patternSchema, keywordRules)) continue;
      const value = this.compile(ctx, patternSchema);
      const regExp = this.regexp(ctx, patterns[i]);
      objects.push(
        `for (const key in data) if (${regExp}.test(key)) { const v = data[key]; if (!${value}(v)) return false; }`,
      );
    }

    if (objects.length > 0) {
      if (soleType === "object") {
        for (const line of objects) out.push(line);
      } else {
        out.push(`if (${CONTAINER}) {`);
        for (const line of objects) out.push("  " + line);
        out.push("}");
      }
    }

    out.push("return true;");
    return out.join("\n");
  }

  source(rootName) {
    return (
      '"use strict";\n' +
      this.functions.join("\n") +
      "\nreturn " +
      rootName +
      ";"
    );
  }
}

function itemSchemaTypes(items) {
  return isObject(items) ? schemaTypes(items) : [];
}

// Returns a verdict-only validator for the schema, or null when the schema is
// outside the subset this compiler can answer without the interpreter.
// `state` counts calls (`n`) and identifies the latest rejected call (`fail`);
// `onFailure` records the document of that call and returns false.
function createFastValidator(ctx, node, state, onFailure) {
  if (ctx === ctx.ajv._metaContext) return null;
  // The 2019-09 vocabularies need the interpreter's evaluated tracking and
  // error shapes; the verdict-only compiler does not model them.
  if (ctx.opts.next || ctx.opts.unevaluated) return null;
  // Comment reporting follows ajv's traversal order, which only the
  // interpreter reproduces.
  if (ctx.opts.$comment) return null;
  try {
    const generator = new Generator();
    const root = generator.compile(ctx, node, true);
    const factory = new Function("h", "r", "v", "__s", "__f", generator.source(root));
    return factory(HELPERS, generator.regexps, generator.values, state, onFailure);
  } catch (error) {
    if (error instanceof Ineligible) return null;
    throw error;
  }
}

module.exports = {createFastValidator};
