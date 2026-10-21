"use strict";

const {SchemaContext, Validator, MissingRefError, ValidationError} = require("./compile");
const {normalizeId, resolveUri, splitUri, resolvePointer} = require("./uri");
const {isObject, stableStringify} = require("./util");
const draft7MetaSchema = require("./refs/json-schema-draft-07.json");

const META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
const META_SCHEMA_ALIAS = "http://json-schema.org/schema";

const JSON_TYPES = new Set(["string", "number", "integer", "boolean", "null", "object", "array"]);

// The keywords ajv defines for its default dialect and vocabulary. Registering
// one of these through addKeyword is an error in ajv as well.
const BUILTIN_KEYWORDS = new Set([
  "$async",
  "$comment",
  "$defs",
  "$id",
  "$ref",
  "$schema",
  "$vocabulary",
  "additionalItems",
  "additionalProperties",
  "allOf",
  "anyOf",
  "const",
  "contains",
  "contentEncoding",
  "contentMediaType",
  "contentSchema",
  "default",
  "definitions",
  "dependencies",
  "deprecated",
  "description",
  "else",
  "enum",
  "examples",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "id",
  "if",
  "items",
  "maxItems",
  "maxLength",
  "maxProperties",
  "maximum",
  "minItems",
  "minLength",
  "minProperties",
  "minimum",
  "multipleOf",
  "not",
  "nullable",
  "oneOf",
  "pattern",
  "patternProperties",
  "properties",
  "propertyNames",
  "readOnly",
  "required",
  "then",
  "title",
  "type",
  "uniqueItems",
  "writeOnly",
]);

// Definition fields that make a keyword something other than a synchronous
// validation rule. They are rejected rather than ignored, so a project that
// relies on them fails loudly instead of validating differently.
const UNSUPPORTED_DEFINITION_FIELDS = ["code", "macro", "compile", "implements"];

function jsonTypes(value) {
  const types = Array.isArray(value) ? value.slice() : value ? [value] : [];
  if (types.every((type) => JSON_TYPES.has(type))) return types;
  throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
}

function keywordNames(keyword) {
  const names = Array.isArray(keyword) ? keyword : [keyword];
  if (names.length === 0 || names.some((name) => typeof name !== "string")) {
    throw new Error("addKeywords: keyword must be string or non-empty array");
  }
  return names;
}

function unsupportedField(definition) {
  for (const field of UNSUPPORTED_DEFINITION_FIELDS) {
    if (definition[field] !== undefined) return field;
  }
  if (definition.async === true) return "async";
  if (definition.post === true) return "post";
  if (definition.before !== undefined) return "before";
  return undefined;
}

class Ajv {
  constructor(options = {}) {
    this.opts = {
      ...options,
      strict: options.strict !== undefined ? options.strict : true,
      strictNumbers:
        options.strictNumbers !== undefined
          ? options.strictNumbers
          : options.strict !== undefined
            ? options.strict
            : true,
      unicodeRegExp: options.unicodeRegExp !== false,
      allErrors: options.allErrors === true,
      ownProperties: options.ownProperties === true,
      coerceTypes: options.coerceTypes || false,
      useDefaults: options.useDefaults || false,
      removeAdditional: options.removeAdditional || false,
      validateFormats: options.validateFormats !== false,
    };
    this.errors = null;
    this.schemas = Object.create(null);
    this.refs = Object.create(null);
    this.formats = Object.create(null);
    // Registered custom keywords, in registration order: name -> definition
    // entry. Entries without a validate function are keywords ajv knows about
    // but does not enforce.
    this.keywords = new Map();
    this._patternCache = new Map();
    this._schemaCache = new WeakMap();
    this._global = {ids: new Map(), roots: new Map()};
    this._contexts = [];
    this._cache = new Map();

    if (options.formats) {
      for (const name of Object.keys(options.formats)) {
        const format = options.formats[name];
        if (format) this.addFormat(name, format);
      }
    }

    const metaContext = new SchemaContext(
      this,
      draft7MetaSchema,
      normalizeId(resolveUri("", META_SCHEMA_ID)),
    );
    this._metaContext = metaContext;
    // ajv compiles and runs meta-schema validation without the options that
    // modify the validated data (META_IGNORE_OPTIONS), and with format
    // validation off (the meta-schema's own formats are annotations).
    this._metaOpts = {
      ...this.opts,
      removeAdditional: false,
      useDefaults: false,
      coerceTypes: false,
      validateFormats: false,
    };
    metaContext.opts = this._metaOpts;
    this._register(metaContext);
    const alias = normalizeId(resolveUri("", META_SCHEMA_ALIAS));
    this._global.ids.set(alias, {ctx: metaContext, node: metaContext.root});
    this._global.roots.set(alias, {ctx: metaContext, node: metaContext.root});
  }

  _register(ctx) {
    for (const [key, node] of ctx.ids) {
      if (key !== "") this._setGlobal(this._global.ids, key, ctx, node);
    }
    for (const [key, node] of ctx.roots) {
      if (key !== "") this._setGlobal(this._global.roots, key, ctx, node);
    }
  }

  _setGlobal(map, key, ctx, node) {
    const existing = map.get(key);
    if (existing !== undefined) {
      if (existing.node === node) return;
      throw new Error(`reference "${key}" resolves to more than one schema`);
    }
    map.set(key, {ctx, node});
  }

  _lookupGlobal(full) {
    const hit = this._global.ids.get(full);
    if (hit) return {ctx: hit.ctx, node: hit.node};
    const split = splitUri(full);
    const root = this._global.roots.get(split.uri);
    if (!root) return undefined;
    if (split.fragment === undefined || split.fragment === "") {
      return {ctx: root.ctx, node: root.node};
    }
    if (split.fragment[0] !== "/") return undefined;
    const node = resolvePointer(root.node, split.fragment);
    return node === undefined ? undefined : {ctx: root.ctx, node};
  }

  _makeValidator(ctx, node, schema) {
    const validator = new Validator(ctx);
    const validate = (data) => {
      const errors = [];
      if (!validator.run(node, data, ctx, errors, "")) {
        validate.errors = errors;
        return false;
      }
      validate.errors = null;
      return true;
    };
    validate.errors = null;
    validate.schema = schema;
    return validate;
  }

  _addSchemaEntry(schema, baseId, key) {
    let base = baseId;
    if (isObject(schema) && typeof schema.$id === "string") {
      base = normalizeId(resolveUri(baseId || "", schema.$id));
    }
    const ctx = new SchemaContext(this, schema, base, false);
    this._register(ctx);
    this._contexts.push(ctx);

    const aliases = new Set();
    if (key !== undefined) aliases.add(normalizeId(resolveUri("", key)));
    if (base !== "") aliases.add(base);
    ctx.aliases = aliases;
    this._registerAliases(ctx);
    return {ctx, schema};
  }

  _registerAliases(ctx) {
    for (const alias of ctx.aliases || []) {
      if (alias === "") continue;
      this.schemas[alias] = ctx.root;
      this.refs[alias] = ctx.root;
      this._setGlobal(this._global.ids, alias, ctx, ctx.root);
      this._setGlobal(this._global.roots, alias, ctx, ctx.root);
    }
  }

  addSchema(schema, key, _meta, validateSchema) {
    if (Array.isArray(schema)) {
      for (const item of schema) this.addSchema(item, undefined, _meta, validateSchema);
      return this;
    }
    if (validateSchema !== false && this.opts.validateSchema !== false) {
      if (!this.validateSchema(schema)) {
        throw new Error("schema is invalid: " + this.errorsText(this.errors));
      }
    }
    const base = key !== undefined ? normalizeId(resolveUri("", key)) : "";
    this._addSchemaEntry(schema, base, key);
    this._cache.clear();
    return this;
  }

  compile(schema) {
    if (typeof schema === "string") {
      const validate = this.getSchema(schema);
      if (!validate) throw new Error(`schema with key or id "${schema}" is not defined`);
      return validate;
    }

    if (!isObject(schema)) {
      const ctx = new SchemaContext(this, schema, "");
      this._register(ctx);
      return this._makeValidator(ctx, schema, schema);
    }

    const cached = this._schemaCache.get(schema);
    if (cached) return cached;

    if (this.opts.validateSchema !== false && !this.validateSchema(schema)) {
      throw new Error("schema is invalid: " + this.errorsText(this.errors));
    }

    const base = typeof schema.$id === "string" ? normalizeId(resolveUri("", schema.$id)) : "";
    const ctx = new SchemaContext(this, schema, base);
    this._register(ctx);
    const validate = this._makeValidator(ctx, ctx.root, schema);
    this._schemaCache.set(schema, validate);
    return validate;
  }

  validate(schema, data) {
    const validate = this.compile(schema);
    const valid = validate(data);
    this.errors = validate.errors;
    return valid;
  }

  async compileAsync(schema) {
    if (typeof this.opts.loadSchema !== "function") return this.compile(schema);
    const load = this.opts.loadSchema;
    const attempt = () =>
      new Promise((resolve, reject) => {
        try {
          resolve(this.compile(schema));
        } catch (error) {
          if (!(error instanceof MissingRefError)) return reject(error);
          Promise.resolve(load(error.missingSchema))
            .then((loaded) => {
              this.addSchema(loaded, error.missingSchema);
              return attempt().then(resolve, reject);
            })
            .catch(reject);
        }
      });
    return attempt();
  }

  getSchema(ref) {
    const full = normalizeId(resolveUri("", ref));
    const cacheKey = "ref:" + full;
    const cached = this._cache.get(cacheKey);
    if (cached) return cached;
    const target = this._lookupGlobal(full);
    if (!target) return undefined;
    target.ctx.prepare(target.node);
    const validate = this._makeValidator(target.ctx, target.node, target.node);
    this._cache.set(cacheKey, validate);
    return validate;
  }

  _rebuildGlobal() {
    this._global = {ids: new Map(), roots: new Map()};
    this._register(this._metaContext);
    const alias = normalizeId(resolveUri("", META_SCHEMA_ALIAS));
    this._global.ids.set(alias, {ctx: this._metaContext, node: this._metaContext.root});
    this._global.roots.set(alias, {ctx: this._metaContext, node: this._metaContext.root});
    for (const ctx of this._contexts) {
      this._register(ctx);
      this._registerAliases(ctx);
    }
  }

  removeSchema(ref) {
    if (ref === undefined) {
      this._contexts.length = 0;
      this.schemas = Object.create(null);
      this.refs = Object.create(null);
      this._cache.clear();
      this._rebuildGlobal();
      return this;
    }
    if (ref instanceof RegExp) {
      for (const key of Object.keys(this.schemas)) {
        if (ref.test(key)) this.removeSchema(key);
      }
      return this;
    }
    const full = normalizeId(resolveUri("", ref));
    delete this.schemas[full];
    delete this.refs[full];
    for (const map of [this._global.ids, this._global.roots]) {
      const existing = map.get(full);
      if (!existing) continue;
      map.delete(full);
      if (existing.ctx.aliases) existing.ctx.aliases.delete(full);
    }
    this._cache.clear();
    return this;
  }

  validateSchema(schema, throwOrLogError) {
    const validate = this.getSchema(META_SCHEMA_ID);
    if (!validate) return true;
    const valid = validate(schema);
    this.errors = validate.errors;
    if (!valid) {
      const message = "schema is invalid: " + this.errorsText(validate.errors);
      if (throwOrLogError === true) throw new Error(message);
      if (throwOrLogError === "log") console.error(message);
    }
    return valid;
  }

  // Registers a custom keyword. The supported definition is a synchronous
  // validation rule: `{keyword, type?, validate(schema, data, parentSchema, dataCxt)}`,
  // or the deprecated two-argument form `addKeyword(name, definition)`. A
  // keyword registered without a rule is known to the validator but does not
  // take part in validation, as in ajv.
  addKeyword(keywordOrDefinition, definition) {
    let keyword = keywordOrDefinition;
    let def = definition;
    if (typeof keyword === "string") {
      if (isObject(def)) {
        console.warn("these parameters are deprecated, see docs for addKeyword");
        def = {...def, keyword};
      }
    } else if (isObject(keyword)) {
      def = keyword;
      keyword = def.keyword;
    } else {
      throw new Error("invalid addKeywords parameters");
    }

    const names = keywordNames(keyword);
    for (const name of names) {
      if (this.keywords.has(name) || BUILTIN_KEYWORDS.has(name)) {
        throw new Error(`Keyword ${name} is already defined`);
      }
    }

    const rule = isObject(def) && def.validate !== undefined;
    if (isObject(def)) {
      const field = unsupportedField(def);
      if (field !== undefined) {
        throw new Error(
          `keyword "${names[0]}" uses "${field}", which is not supported: ` +
            "only synchronous validation rules are supported",
        );
      }
    }
    if (!rule) {
      if (def !== undefined && !isObject(def)) {
        // ajv loses a function definition and then fails when the schema is
        // compiled; failing here names the actual problem.
        throw new Error(
          `keyword "${names[0]}" must be defined by an object with a validate function`,
        );
      }
      for (const name of names) {
        this.keywords.set(name, {keyword: name, types: [], validate: undefined});
      }
      return this;
    }
    if (typeof def.validate !== "function") {
      throw new Error(`keyword "${names[0]}" must have a validate function`);
    }

    const entry = {
      keyword: names[0],
      types: jsonTypes(def.type),
      validate: def.validate,
      inspectErrors: def.errors !== false,
      modifying: def.modifying === true,
      passSchema: def.schema !== false,
    };
    for (const name of names) this.keywords.set(name, {...entry, keyword: name});
    return this;
  }

  removeKeyword(keyword) {
    this.keywords.delete(keyword);
    return this;
  }

  addFormat(name, format) {
    if (typeof format === "string") format = new RegExp(format);
    this.formats[name] = format;
    return this;
  }

  addVocabulary() {
    return this;
  }

  addMetaSchema(schema, key) {
    return this.addSchema(schema, key, true, false);
  }

  errorsText(errors = this.errors, {separator = ", ", dataVar = "data"} = {}) {
    if (!errors || errors.length === 0) return "No errors";
    return errors
      .map((error) => `${dataVar}${error.instancePath} ${error.message}`)
      .reduce((text, message) => text + separator + message);
  }
}

Ajv.ValidationError = ValidationError;
Ajv.MissingRefError = MissingRefError;

module.exports = Ajv;
module.exports.default = Ajv;
module.exports.Ajv = Ajv;
module.exports.ValidationError = ValidationError;
module.exports.MissingRefError = MissingRefError;
