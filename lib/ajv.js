"use strict";

const {
  SchemaContext,
  Validator,
  MissingRefError,
  ValidationError,
  keywordApplies,
  schemaHasRef,
} = require("./compile");
const {createFastValidator} = require("./fast");
const {_, str, stringify, nil, Name} = require("./codegen");
const {normalizeId, resolveUri, splitUri, resolvePointer} = require("./uri");
const {isObject, forEachSubschema, stableStringify, DATA_REFERENCE_KEYWORDS} = require("./util");
const draft7MetaSchema = require("./refs/json-schema-draft-07.json");
const meta2019Schema = require("./refs/json-schema-2019-09/schema.json");
const meta2019Core = require("./refs/json-schema-2019-09/meta/core.json");
const meta2019Applicator = require("./refs/json-schema-2019-09/meta/applicator.json");
const meta2019Validation = require("./refs/json-schema-2019-09/meta/validation.json");
const meta2019MetaData = require("./refs/json-schema-2019-09/meta/meta-data.json");
const meta2019Format = require("./refs/json-schema-2019-09/meta/format.json");
const meta2019Content = require("./refs/json-schema-2019-09/meta/content.json");
const meta2020Schema = require("./refs/json-schema-2020-12/schema.json");
const meta2020Core = require("./refs/json-schema-2020-12/meta/core.json");
const meta2020Applicator = require("./refs/json-schema-2020-12/meta/applicator.json");
const meta2020Unevaluated = require("./refs/json-schema-2020-12/meta/unevaluated.json");
const meta2020Validation = require("./refs/json-schema-2020-12/meta/validation.json");
const meta2020MetaData = require("./refs/json-schema-2020-12/meta/meta-data.json");
const meta2020Format = require("./refs/json-schema-2020-12/meta/format-annotation.json");
const meta2020Content = require("./refs/json-schema-2020-12/meta/content.json");
const dataRefSchema = require("./refs/data.json");

// Shared with lib/standalone.js: the schema environment a compiled validator
// was built from, so standalone generation can reproduce it.
const STANDALONE = Symbol.for("ajv.standalone.metadata");

const META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
const META_SCHEMA_2019_ID = "https://json-schema.org/draft/2019-09/schema";
const META_SCHEMA_2020_ID = "https://json-schema.org/draft/2020-12/schema";
const META_SCHEMA_ALIAS = "http://json-schema.org/schema";

// The vocabulary meta-schemas the 2019-09 dialect's main meta-schema refers
// to. They are registered as separate schema resources, exactly as ajv
// registers them, so `$ref: "meta/core"` and friends resolve.
const META_2019_SCHEMAS = [
  meta2019Core,
  meta2019Applicator,
  meta2019Validation,
  meta2019MetaData,
  meta2019Format,
  meta2019Content,
];

// The 2020-12 meta-schema's vocabulary resources, registered the way ajv
// registers them so `$ref: "meta/core"` and friends resolve.
const META_2020_SCHEMAS = [
  meta2020Core,
  meta2020Applicator,
  meta2020Unevaluated,
  meta2020Validation,
  meta2020MetaData,
  meta2020Format,
  meta2020Content,
];

const JSON_TYPES = new Set(["string", "number", "integer", "boolean", "null", "object", "array"]);

// The keywords ajv defines for its default dialect and vocabulary. Registering
// one of these through addKeyword is an error in ajv as well.
const BUILTIN_KEYWORDS = new Set([
  "$anchor",
  "$async",
  "$comment",
  "$defs",
  "$dynamicAnchor",
  "$dynamicRef",
  "$id",
  "$recursiveAnchor",
  "$recursiveRef",
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
  "dependentRequired",
  "dependentSchemas",
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
  "maxContains",
  "maxItems",
  "maxLength",
  "maxProperties",
  "maximum",
  "minContains",
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
  "prefixItems",
  "properties",
  "propertyNames",
  "readOnly",
  "required",
  "then",
  "title",
  "type",
  "unevaluatedItems",
  "unevaluatedProperties",
  "uniqueItems",
  "writeOnly",
]);

// Definition fields that make a keyword contribute generated validation code.
// They are rejected rather than ignored, so a project that relies on them fails
// loudly instead of validating differently. The remaining declarations ajv
// accepts — compile, metaSchema, before, post, implements, and $dataError —
// are honoured.
const UNSUPPORTED_DEFINITION_FIELDS = ["code"];

// ajv rewrites the parts of a dialect's meta-schemas that describe keywords
// supporting data references, letting either the keyword's own meta-schema or
// the data-reference meta-schema match. Registering the rewritten copies is
// what makes a `{$data: "..."}` keyword value a valid schema under the option.
function withDataReferences(metaSchema) {
  const copy = JSON.parse(JSON.stringify(metaSchema));
  if (isObject(copy.properties)) {
    for (const keyword of DATA_REFERENCE_KEYWORDS) {
      const schema = copy.properties[keyword];
      if (schema !== undefined) {
        copy.properties[keyword] = {anyOf: [schema, {$ref: dataRefSchema.$id}]};
      }
    }
  }
  return copy;
}

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
      verbose: options.verbose === true,
      messages: options.messages !== false,
      ownProperties: options.ownProperties === true,
      coerceTypes: options.coerceTypes || false,
      useDefaults: options.useDefaults || false,
      removeAdditional: options.removeAdditional || false,
      validateFormats: options.validateFormats !== false,
      // ajv's data-reference option: a keyword value may name a location in
      // the document instead of holding a literal value.
      $data: Boolean(options.$data),
      // 2019-09 and 2020-12 vocabulary switches. The dialect subclasses turn
      // all three on, exactly as ajv's 2019 and 2020 classes do; the draft-07
      // class leaves them off.
      next: options.next === true,
      unevaluated: options.unevaluated === true,
      dynamicRef: options.dynamicRef === true,
      metaDialect:
        options.metaDialect === "2019" || options.metaDialect === "2020"
          ? options.metaDialect
          : "draft7",
    };
    this.errors = null;
    this.schemas = Object.create(null);
    this.refs = Object.create(null);
    this.formats = Object.create(null);
    // Registered custom keywords, in registration order: name -> definition
    // entry. Entries without a validate function are keywords ajv knows about
    // but does not enforce.
    this.keywords = new Map();
    // Incremented whenever the keyword registry changes, so a context
    // prepared before a registration sees the current rules when it compiles.
    this._keywordRevision = 0;
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
    this._metaContexts = [];
    this._initMeta();

    // ajv's `keywords` option: definitions supplied when the validator is
    // created are registered through the same path as addKeyword, after the
    // dialect meta-schemas, exactly as ajv applies them.
    if (options.keywords) this._addInitialKeywords(options.keywords);
  }

  _initMeta() {
    const meta = (schema) => (this.opts.$data ? withDataReferences(schema) : schema);
    // ajv registers its data-reference meta-schema before the dialect
    // meta-schemas, which refer to it once the option is on.
    if (this.opts.$data) this._addMetaContext(dataRefSchema);
    if (this.opts.metaDialect === "2020") {
      for (const schema of META_2020_SCHEMAS) this._addMetaContext(meta(schema));
      this._metaContext = this._addMetaContext(meta2020Schema);
      this._defaultMetaId = META_SCHEMA_2020_ID;
    } else if (this.opts.metaDialect === "2019") {
      for (const schema of META_2019_SCHEMAS) this._addMetaContext(meta(schema));
      this._metaContext = this._addMetaContext(meta2019Schema);
      this._defaultMetaId = META_SCHEMA_2019_ID;
    } else {
      this._metaContext = this._addMetaContext(meta(draft7MetaSchema), META_SCHEMA_ID);
      this._defaultMetaId = META_SCHEMA_ID;
    }
    const alias = normalizeId(resolveUri("", META_SCHEMA_ALIAS));
    this._global.ids.set(alias, {ctx: this._metaContext, node: this._metaContext.root});
    this._global.roots.set(alias, {ctx: this._metaContext, node: this._metaContext.root});
    this.refs[alias] = this._metaContext.root;
    this.schemas[alias] = this._metaContext.root;
  }

  _addMetaContext(schema, defaultId) {
    const id = defaultId !== undefined ? defaultId : schema.$id;
    const ctx = new SchemaContext(this, schema, normalizeId(resolveUri("", id)), false);
    ctx.opts = this._metaOpts;
    ctx.prepare(ctx.root);
    this._register(ctx);
    const aliases = new Set([ctx.base]);
    ctx.aliases = aliases;
    this._registerAliases(ctx);
    this._metaContexts.push(ctx);
    return ctx;
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
    // Standalone generation reproduces the framework a validator was compiled
    // with, not the registry as it stands when generation runs: the formats and
    // custom keywords resolved here are what this validator enforces.
    ctx._standaloneExtensions = {
      formats: {...this.formats},
      keywords: [...this.keywords.values()],
    };
    const validator = new Validator(ctx);
    const isAsync = isObject(node) && Boolean(node.$async);
    this._checkNoAsyncUsage(node, ctx);
    let validate;
    if (isAsync) {
      validate = async (data) => {
        const errors = [];
        const result = await validator.runAsync(node, data, ctx, errors, "");
        if (!result.valid) throw new ValidationError(errors);
        return result.data;
      };
      validate.$async = true;
    } else {
      // The compiled validator is the callable itself. Its `errors` report is
      // built by the interpreter on first read after a rejection, so a project
      // that only needs the verdict never pays for one. Options that rewrite
      // data or extensions never reach this branch: the compiler refuses them
      // and the interpreter path above stays authoritative.
      const state = {n: 0, fail: -1, data: undefined, reported: -1, errors: null};
      const fast = createFastValidator(ctx, node, state, (data) => {
        state.data = data;
        state.fail = state.n;
        return false;
      });
      if (fast === null) {
        validate = (data) => {
          const errors = [];
          if (!validator.run(node, data, ctx, errors, "")) {
            validate.errors = errors;
            return false;
          }
          validate.errors = null;
          return true;
        };
      } else {
        validate = fast;
        Object.defineProperty(validate, "errors", {
          configurable: true,
          enumerable: true,
          get: () => {
            if (state.fail !== state.n) return null;
            if (state.reported !== state.n) {
              const report = [];
              state.errors = validator.run(node, state.data, ctx, report, "") ? null : report;
              state.reported = state.n;
              state.data = undefined;
            }
            return state.errors;
          },
          set: (value) => {
            state.errors = value;
            state.reported = state.n;
            state.fail = state.n;
          },
        });
      }
    }
    validate.errors = null;
    validate.schema = schema;
    Object.defineProperty(validate, STANDALONE, {
      value: {ctx, node},
      configurable: true,
    });
    if (this.opts.code && this.opts.code.source) {
      validate.source = {validateName: "validate", validateCode: "", scopeValues: {}};
    }
    return validate;
  }

  // Rejects, at compile time and with ajv's messages, asynchronous constructs
  // ajv cannot compile. Each `$ref` target that contains a reference is its own
  // schema environment, so its `$async` flag decides whether asynchronous rules
  // are legal there; a target without references is inlined into the current
  // environment and inherits its mode.
  _checkNoAsyncUsage(node, ctx) {
    this._checkAsyncEnvironment(node, ctx, isObject(node) && Boolean(node.$async), new WeakMap(), new WeakSet());
  }

  _checkAsyncEnvironment(node, ctx, isAsync, compiled, seen) {
    if (isObject(node)) {
      let environments = compiled.get(node);
      if (environments === undefined) {
        environments = new WeakSet();
        compiled.set(node, environments);
      }
      if (environments.has(ctx)) return;
      environments.add(ctx);
    }
    this._walkAsyncEnvironment(node, ctx, isAsync, compiled, seen);
  }

  _walkAsyncEnvironment(node, ctx, isAsync, compiled, seen) {
    if (!isObject(node) || seen.has(node)) return;
    seen.add(node);

    if (!isAsync) {
      if (node.$async) throw new Error("async schema in sync schema");

      for (const entry of this.keywords.values()) {
        if (entry.async !== true) continue;
        if (entry.validate === undefined && entry.compile === undefined) continue;
        if (!keywordApplies(node, entry, ctx.keywordRules)) continue;
        throw new Error("async keyword in sync schema");
      }

      if (this.opts.validateFormats && typeof node.format === "string") {
        const format = this.formats[node.format];
        if (isObject(format) && !(format instanceof RegExp) && format.async) {
          throw new Error("async format in sync schema");
        }
      }
    }

    if (typeof node.$ref === "string") {
      const target = ctx.resolve(node.$ref, node);
      if (target) {
        const targetNode = target.node;
        if (typeof targetNode === "boolean" || !schemaHasRef(targetNode)) {
          this._walkAsyncEnvironment(targetNode, target.ctx, isAsync, compiled, seen);
        } else {
          const targetAsync = isObject(targetNode) && Boolean(targetNode.$async);
          if (targetAsync && !isAsync) throw new Error("async schema referenced by sync schema");
          this._checkAsyncEnvironment(targetNode, target.ctx, targetAsync, compiled, new WeakSet());
        }
      }
    }

    forEachSubschema(node, (child) => this._walkAsyncEnvironment(child, ctx, isAsync, compiled, seen));
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

  // The second argument marks the schema as a keyword's value schema. ajv does
  // not validate such a schema against the dialect meta-schema, so a keyword
  // definition's metaSchema is compiled without that check.
  compile(schema, _meta) {
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

    if (!_meta && this.opts.validateSchema !== false && !this.validateSchema(schema)) {
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
    if (!("$async" in validate)) this.errors = validate.errors;
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
    // ajv compiles the schema the pointer belongs to before handing back a
    // validator for a subschema, so its compile-time checks apply here too.
    if (target.node !== target.ctx.root) {
      this._checkNoAsyncUsage(target.ctx.root, target.ctx);
    }
    const validate = this._makeValidator(target.ctx, target.node, target.node);
    this._cache.set(cacheKey, validate);
    return validate;
  }

  _rebuildGlobal() {
    this._global = {ids: new Map(), roots: new Map()};
    for (const ctx of this._metaContexts) this._register(ctx);
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

  defaultMeta() {
    return (this.opts.defaultMeta = this.opts.defaultMeta || this._defaultMetaId);
  }

  validateSchema(schema, throwOrLogError) {
    if (typeof schema === "boolean") return true;
    if (!isObject(schema)) return true;
    if (schema.$schema !== undefined && typeof schema.$schema !== "string") {
      throw new Error("$schema must be a string");
    }
    const metaRef = schema.$schema || this.defaultMeta();
    if (!metaRef) return true;
    const validate = this.getSchema(metaRef);
    if (!validate) throw new Error(`no schema with key or ref "${metaRef}"`);
    const valid = validate(schema);
    this.errors = validate.errors;
    if (!valid) {
      const message = "schema is invalid: " + this.errorsText(validate.errors);
      if (throwOrLogError === true) throw new Error(message);
      if (throwOrLogError === "log") console.error(message);
    }
    return valid;
  }

  // ajv's public addVocabulary: registers each definition in order, exactly
  // as a sequence of addKeyword calls.
  addVocabulary(definitions) {
    for (const definition of definitions) this.addKeyword(definition);
    return this;
  }

  // The `keywords` constructor option takes an array of definitions, or ajv's
  // deprecated name -> definition map. The map form is still accepted, with
  // ajv's warning and the keyword name filled in from the map key.
  _addInitialKeywords(definitions) {
    if (Array.isArray(definitions)) {
      this.addVocabulary(definitions);
      return;
    }
    console.warn("keywords option as map is deprecated, pass array");
    for (const keyword of Object.keys(definitions)) {
      const definition = definitions[keyword];
      if (definition.keyword === undefined) definition.keyword = keyword;
      this.addKeyword(definition);
    }
  }

  // Registers a custom keyword. A definition is either a validation rule
  // `{keyword, type?, validate(schema, data, parentSchema, dataCxt)}`, either
  // synchronous or asynchronous (`async: true` and a function that returns a
  // promise), a rule compiled once per schema location
  // `{keyword, type?, compile(schema, parentSchema)}`, or a macro
  // `{keyword, type?, macro(schema, parentSchema)}` whose return value is the
  // schema that stands in for the keyword. The deprecated two-argument form
  // `addKeyword(name, definition)` is accepted as well. A definition may also
  // declare `metaSchema` for its value, `post`/`before` for its place among the
  // keywords, `implements` for keywords it stands in for, and `$dataError` for
  // the report of an unusable document-sourced value. A keyword registered
  // without a rule is known to the validator but does not take part in
  // validation, as in ajv.
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

    const hasMacro = isObject(def) && def.macro !== undefined;
    const hasValidate = isObject(def) && def.validate !== undefined;
    const hasCompile = isObject(def) && def.compile !== undefined;
    if (isObject(def)) {
      const field = unsupportedField(def);
      if (field !== undefined) {
        throw new Error(
          `keyword "${names[0]}" uses "${field}", which is not supported: ` +
            "definitions that contribute generated validation code are not supported",
        );
      }
      // ajv only resolves a data reference for a rule that can receive the
      // resolved value, never for a macro or a keyword with no rule at all.
      if (def.$data && !hasValidate) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
      if (hasCompile && typeof def.compile !== "function") {
        throw new Error(`keyword "${names[0]}" must have a compile function`);
      }
      if (hasMacro && typeof def.macro !== "function") {
        throw new Error(`keyword "${names[0]}" must have a macro function`);
      }
      if (def.post === true && jsonTypes(def.type).length > 0) {
        throw new Error('keyword with "post" flag cannot have "type"');
      }
    }
    if (!hasMacro && !hasValidate && !hasCompile) {
      if (def !== undefined && !isObject(def)) {
        // ajv loses a function definition and then fails when the schema is
        // compiled; failing here names the actual problem.
        throw new Error(
          `keyword "${names[0]}" must be defined by an object with a validate function, ` +
            "a compile function, or a macro",
        );
      }
      // A definition without a rule still carries a value schema: ajv checks
      // the keyword's value when a schema is compiled, even though the keyword
      // itself does nothing at validation time.
      this._registerKeywordEntries(
        names,
        {
          keyword: names[0],
          types: [],
          validate: undefined,
          validateSchema: isObject(def) ? this._keywordMetaSchema(def) : undefined,
        },
        def,
      );
      return this;
    }

    if (!hasMacro && typeof def.validate !== "function" && hasValidate) {
      throw new Error(`keyword "${names[0]}" must have a validate function`);
    }

    const entry = {
      keyword: names[0],
      types: jsonTypes(def.type),
      schemaTypes: def.schemaType === undefined ? [] : jsonTypes(def.schemaType),
      $data: Boolean(def.$data),
      validate: hasValidate ? def.validate : undefined,
      // ajv gives a definition that carries both a macro and a validate or
      // compile function to the macro.
      macro: hasMacro ? def.macro : undefined,
      compile: !hasMacro && hasCompile ? def.compile : undefined,
      async: def.async === true,
      inspectErrors: def.errors !== false,
      modifying: def.modifying === true,
      passSchema: def.schema !== false,
      // Placement among the keyword groups: `post` runs after every other
      // keyword, `before` names the keyword this one precedes.
      post: def.post === true,
      before: def.before,
      // The keywords this definition stands in for: ajv registers them as
      // known keywords and runs this rule when a schema uses any of them.
      implements: Array.isArray(def.implements) ? def.implements.slice() : undefined,
      // The report a keyword supplies for a document-sourced value of an
      // unusable type.
      $dataError: def.$dataError,
      // The keyword's value schema, compiled now the way ajv compiles it when
      // the definition is registered.
      validateSchema: this._keywordMetaSchema(def),
    };
    this._registerKeywordEntries(names, entry, def);
    return this;
  }

  // Registers one entry per name in a definition, then the keywords its
  // `implements` declaration stands in for. Implemented names are registered
  // once per name, exactly as ajv registers them per rule.
  _registerKeywordEntries(names, entry, def) {
    const implemented = isObject(def) && Array.isArray(def.implements) ? def.implements : [];
    for (const name of names) {
      this.keywords.set(name, {...entry, keyword: name});
      for (const keyword of implemented) this.addKeyword(keyword);
    }
    this._keywordRevision++;
  }

  // ajv compiles a keyword definition's value schema when the keyword is
  // registered, wrapping it so a `$data` reference can stand in for the value
  // when the option is on. A reference is resolved at registration time, so a
  // definition that names an unregistered schema fails here.
  _keywordMetaSchema(def) {
    let metaSchema = def.metaSchema;
    if (metaSchema === undefined) return undefined;
    if (def.$data && this.opts.$data) {
      metaSchema = {anyOf: [metaSchema, {$ref: dataRefSchema.$id}]};
    }
    return this.compile(metaSchema, true);
  }

  removeKeyword(keyword) {
    this.keywords.delete(keyword);
    this._keywordRevision++;
    return this;
  }

  addFormat(name, format) {
    if (typeof format === "string") format = new RegExp(format);
    this.formats[name] = format;
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
Ajv._ = _;
Ajv.str = str;
Ajv.stringify = stringify;
Ajv.nil = nil;
Ajv.Name = Name;

module.exports = Ajv;
module.exports.default = Ajv;
module.exports.Ajv = Ajv;
module.exports.ValidationError = ValidationError;
module.exports.MissingRefError = MissingRefError;
module.exports._ = _;
module.exports.str = str;
module.exports.stringify = stringify;
module.exports.nil = nil;
module.exports.Name = Name;
