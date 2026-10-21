"use strict";

const {SchemaContext, Validator, MissingRefError, ValidationError} = require("./compile");
const {normalizeId, resolveUri, splitUri, resolvePointer} = require("./uri");
const {isObject, stableStringify} = require("./util");
const draft7MetaSchema = require("./refs/json-schema-draft-07.json");

const META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
const META_SCHEMA_ALIAS = "http://json-schema.org/schema";

class Ajv {
  constructor(options = {}) {
    this.opts = {
      ...options,
      strict: options.strict !== undefined ? options.strict : true,
      strictNumbers: options.strictNumbers !== false,
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
    this._patternCache = new Map();
    this._schemaCache = new WeakMap();
    this._global = {ids: new Map(), roots: new Map()};
    this._contexts = [];
    this._cache = new Map();

    const metaContext = new SchemaContext(
      this,
      draft7MetaSchema,
      normalizeId(resolveUri("", META_SCHEMA_ID)),
    );
    this._metaContext = metaContext;
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

  addKeyword() {
    return this;
  }

  removeKeyword() {
    return this;
  }

  addFormat() {
    return this;
  }

  addVocabulary() {
    return this;
  }

  addMetaSchema(schema, key) {
    return this.addSchema(schema, key, true, false);
  }

  errorsText(errors = this.errors, {separator = ", ", dataVar = "data"} = {}) {
    if (!errors || !errors.length) return "No errors";
    return errors
      .map((error) => {
        const path = error.instancePath ? error.instancePath.replace(/\//g, ".") : "";
        return `${dataVar}${path} ${error.message || error.keyword}`;
      })
      .join(separator);
  }
}

Ajv.ValidationError = ValidationError;
Ajv.MissingRefError = MissingRefError;

module.exports = Ajv;
module.exports.default = Ajv;
module.exports.Ajv = Ajv;
module.exports.ValidationError = ValidationError;
module.exports.MissingRefError = MissingRefError;
