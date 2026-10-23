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
const {KeywordCxt} = require("./keyword-code");
const discriminatorDefinition = require("./discriminator");
const {_, str, stringify, nil, Name, CodeGen} = require("./codegen");
const {
  normalizeId,
  resolvePointer,
  defaultUriResolver,
  resolveUrl,
  splitResolved,
} = require("./uri");
const {isObject, forEachSubschema, stableStringify, DATA_REFERENCE_KEYWORDS} = require("./util");
const {
  FORMAT_RULE_DEFINITION,
  builtinVocabulary,
  keywordRegistration,
} = require("./vocabulary");
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

// A plain object, so `INHERITED_RULES[name]` answers the way ajv's plain
// rule table answers a name inherited from Object.prototype.
const INHERITED_RULES = {};

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

// ajv's logger: console unless the project supplies a logger, or `false` to
// silence every message it would report.
const NO_LOGGER = {log() {}, warn() {}, error() {}};

function getLogger(logger) {
  if (logger === false) return NO_LOGGER;
  if (logger === undefined) return console;
  if (logger.log && logger.warn && logger.error) return logger;
  throw new Error("logger must implement log, warn and error methods");
}

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

// ajv's pattern engine when the project supplies none. Its `code` names the
// expression a generated module would carry, as ajv's default engine does.
const defaultRegExp = (pattern, flags) => new RegExp(pattern, flags);
defaultRegExp.code = "new RegExp";

// ajv resolves `code.regExp` once, defaulting a missing or null engine.
function normalizeCodeOptions(value) {
  const code = value === undefined ? {} : {...value};
  if (code.regExp === undefined || code.regExp === null) code.regExp = defaultRegExp;
  return code;
}

function keywordNames(keyword) {
  const names = Array.isArray(keyword) ? keyword : [keyword];
  if (names.length === 0 || names.some((name) => typeof name !== "string")) {
    throw new Error("addKeywords: keyword must be string or non-empty array");
  }
  return names;
}

class Ajv {
  constructor(options = {}) {
    // ajv derives every strictness setting from `strict` when it is not given
    // its own value: vocabulary, type, and tuple checking follow it, while
    // required-property checking stays off unless asked for.
    const strict = options.strict;
    const fromStrict = (value, fallback) =>
      value !== undefined ? value : strict !== undefined ? strict : fallback;
    this.opts = {
      ...options,
      strict: fromStrict(undefined, true),
      strictSchema: fromStrict(options.strictSchema, true),
      strictNumbers: fromStrict(options.strictNumbers, true),
      strictTypes: fromStrict(options.strictTypes, "log"),
      strictTuples: fromStrict(options.strictTuples, "log"),
      strictRequired: fromStrict(options.strictRequired, false),
      allowUnionTypes: options.allowUnionTypes === true,
      allowMatchingProperties: options.allowMatchingProperties === true,
      unicodeRegExp: options.unicodeRegExp !== false,
      allErrors: options.allErrors === true,
      verbose: options.verbose === true,
      messages: options.messages !== false,
      ownProperties: options.ownProperties === true,
      coerceTypes: options.coerceTypes || false,
      useDefaults: options.useDefaults || false,
      removeAdditional: options.removeAdditional || false,
      validateFormats: options.validateFormats !== false,
      // ajv's code-generation options. Extensions that build code expressions
      // write their sources here (`code.formats`), standalone generation
      // reads them back, and `regExp` compiles every schema pattern.
      code: normalizeCodeOptions(options.code),
      // ajv's data-reference option: a keyword value may name a location in
      // the document instead of holding a literal value.
      $data: Boolean(options.$data),
      // ajv's discriminator option: a schema carrying the annotation selects
      // one oneOf branch through a tag property instead of validating every
      // branch.
      discriminator: Boolean(options.discriminator),
      // ajv's context-passing option: a compiled validation function invoked
      // with `call(context, data)` hands that context to every custom keyword
      // rule it reaches as the rule's `this` value. Off by default, in which
      // case rules keep receiving the Ajv instance.
      passContext: Boolean(options.passContext),
      // `meta` adds the dialect's meta-schema (true by default). `false`
      // leaves the instance without a default meta-schema, and an object is
      // registered after the keywords and becomes the default meta-schema.
      meta: options.meta === undefined || options.meta === null ? true : options.meta,
      // The property that carries a schema's identifier. `id` selects the
      // legacy draft-04 property; anything else reads `$id`, as ajv does.
      schemaId: options.schemaId === "id" ? "id" : "$id",
      // `compile` and `validate` register a schema by its identifier unless
      // this is off. Explicit registrations through `addSchema` are unaffected.
      addUsedSchema: options.addUsedSchema !== false,
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
      // ajv's URI strategy: `parse`, `serialize`, and `resolve`. A project
      // that supplies one keeps its own identifier forms and equivalences;
      // without one the package resolves exactly as it did before.
      uriResolver: options.uriResolver ?? defaultUriResolver,
    };
    this._customUriResolver = this.opts.uriResolver !== defaultUriResolver;
    this.errors = null;
    this.schemas = Object.create(null);
    this.refs = Object.create(null);
    this.formats = Object.create(null);
    this.logger = getLogger(options.logger);
    // The built-in vocabulary this entry point publishes, as `getKeyword`
    // reports it. The compiler implements the rules; the declarations answer
    // vocabulary queries and are removed with the keyword when a project
    // removes one.
    this._builtinRules = builtinVocabulary(options.jtd === true ? "jtd" : this.opts.metaDialect);
    // ajv's rule table, as far as extensions read it: the built-in `format`
    // rule exposes its definition to keyword code that compiles against it.
    this.RULES = {
      all: {
        format: {keyword: "format", definition: FORMAT_RULE_DEFINITION},
      },
    };
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
    // Loads in flight, by missing schema URI. Concurrent asynchronous
    // compilations that need the same schema await one loader call.
    this._loading = Object.create(null);

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

    // ajv registers the discriminator keyword with the dialect's vocabulary,
    // before any keyword definitions the project supplies.
    if (this.opts.discriminator) this.addKeyword(discriminatorDefinition);

    // ajv's `keywords` option: definitions supplied when the validator is
    // created are registered through the same path as addKeyword, after the
    // dialect meta-schemas, exactly as ajv applies them.
    if (options.keywords) this._addInitialKeywords(options.keywords);

    // ajv's `meta` option as an object: it is registered after the keywords
    // and, because `defaultMeta` prefers it, becomes the meta-schema that
    // governs schemas without a `$schema`. Registration precedes validation,
    // as in ajv, so a meta-schema that does not name `$schema` is checked
    // against itself. JSON Type Definition keeps its own meta-schema handling.
    if (this.opts.jtd !== true && isObject(options.meta)) {
      this.addSchema(options.meta, undefined, true, false);
      if (this.opts.validateSchema !== false) this.validateSchema(options.meta, true);
    }

    // ajv's `schemas` option: an array of schemas, or a map from key to
    // schema, supplied when the validator is created. They are registered
    // after the meta-schemas, formats, and keyword definitions the same options
    // configure, through addSchema, so each schema is validated against the
    // dialect meta-schema and becomes available to getSchema and to references
    // from other schemas exactly as a later registration does.
    this._addInitialSchemas(this.opts.schemas);
  }

  _addInitialSchemas(schemas) {
    if (!schemas) return;
    // ajv registers a keyless member under the empty key, so a second keyless
    // member is refused as a duplicate even though neither carries an id.
    const keys = new Set();
    if (Array.isArray(schemas)) {
      for (const schema of schemas) this._addInitialSchema(schema, undefined, keys);
    } else {
      for (const key of Object.keys(schemas)) this._addInitialSchema(schemas[key], key, keys);
    }
  }

  // ajv refuses a constructor-supplied schema before registering it when its
  // value is not a schema, its key or identifier is already taken, or its
  // identifier is not a string. Every refusal carries addSchema's message.
  _addInitialSchema(schema, key, keys) {
    // ajv's addSchema flattens a nested array before it looks at keys.
    if (Array.isArray(schema)) {
      for (const item of schema) this._addInitialSchema(item, undefined, keys);
      return;
    }
    let id;
    if (typeof schema === "object") {
      // A null member throws here, as it does in ajv's addSchema.
      id = schema[this._schemaIdentifierKeyword()];
      if (id !== undefined && typeof id !== "string") {
        throw new Error(`schema ${this._schemaIdentifierKeyword()} must be string`);
      }
    } else if (typeof schema !== "boolean") {
      throw new Error(
        this.opts.jtd ? "schema must be object" : "schema must be object or boolean",
      );
    }
    const name = normalizeId(key || id || "");
    if (this.schemas[name] || this.refs[name] || keys.has(name)) {
      throw new Error(`schema with key or id "${name}" already exists`);
    }
    // addSchema registers the identifier the schema carries, resolved against
    // its key, as a second name for the same schema.
    let base =
      key !== undefined
        ? normalizeId(
            this._customUriResolver ? key : resolveUrl(this.opts.uriResolver, "", key),
          )
        : "";
    if (typeof id === "string") base = this._rootBase(base, id);
    if (base !== "" && base !== name && (this.schemas[base] || this.refs[base])) {
      throw new Error(`schema with key or id "${base}" already exists`);
    }
    this.addSchema(schema, key);
    keys.add(name);
  }

  _initMeta() {
    // `meta: false` leaves the instance with no meta-schema at all: no dialect
    // meta-schema, no data-reference schema, and no `http://json-schema.org/schema`
    // alias. Schema checking then reports ajv's "meta-schema not available".
    if (!this.opts.meta) return;
    const meta = (schema) => (this.opts.$data ? withDataReferences(schema) : schema);
    // ajv registers its data-reference meta-schema before the dialect
    // meta-schemas, which refer to it once the option is on.
    if (this.opts.$data) this._addMetaContext(dataRefSchema, dataRefSchema.$id);
    if (this.opts.metaDialect === "2020") {
      for (const schema of META_2020_SCHEMAS) this._addMetaContext(meta(schema), schema.$id);
      this._metaContext = this._addMetaContext(meta2020Schema, META_SCHEMA_2020_ID);
      this._defaultMetaId = META_SCHEMA_2020_ID;
    } else if (this.opts.metaDialect === "2019") {
      for (const schema of META_2019_SCHEMAS) this._addMetaContext(meta(schema), schema.$id);
      this._metaContext = this._addMetaContext(meta2019Schema, META_SCHEMA_2019_ID);
      this._defaultMetaId = META_SCHEMA_2019_ID;
    } else {
      this._metaContext = this._addMetaContext(meta(draft7MetaSchema), META_SCHEMA_ID);
      this._defaultMetaId = META_SCHEMA_ID;
    }
    const alias = normalizeId(
      this._customUriResolver
        ? META_SCHEMA_ALIAS
        : resolveUrl(this.opts.uriResolver, "", META_SCHEMA_ALIAS),
    );
    this._global.ids.set(alias, {ctx: this._metaContext, node: this._metaContext.root});
    this._global.roots.set(alias, {ctx: this._metaContext, node: this._metaContext.root});
    this.refs[alias] = this._metaContext.root;
    this.schemas[alias] = this._metaContext.root;
  }

  // The property a schema's identifier is read from. JSON Type Definition
  // keeps reading `$id` from constructor-supplied schemas, as it always has.
  _schemaIdentifierKeyword() {
    return this.opts.jtd === true ? "$id" : this.opts.schemaId;
  }

  _schemaIdentifier(schema) {
    return isObject(schema) ? schema[this._schemaIdentifierKeyword()] : undefined;
  }

  // ajv's SchemaEnv base identifier for a schema registered under `key` and
  // carrying `id`. A project-supplied strategy is not consulted here: ajv
  // stores the identifier a schema declares, and only references and nested
  // identifiers are resolved through the strategy. The default path keeps
  // resolving the registration identifier, as this package always has.
  _rootBase(baseId, id) {
    if (this._customUriResolver) {
      return normalizeId(typeof id === "string" ? id || baseId || "" : baseId || "");
    }
    return normalizeId(
      typeof id === "string" ? resolveUrl(this.opts.uriResolver, baseId || "", id) : baseId || "",
    );
  }

  // ajv refuses a key or identifier that is already taken with this message,
  // before it validates the schema. A compiled schema can come back through
  // `compile` as the very object that registered it, which ajv's cache allows;
  // an explicit `addSchema` is refused even then, as ajv refuses it.
  _checkUnique(name, schema, allowSame = false) {
    if (name === "") return;
    const taken = (registered) => registered !== undefined && !(allowSame && registered === schema);
    if (taken(this.schemas[name]) || taken(this.refs[name])) {
      throw new Error(`schema with key or id "${name}" already exists`);
    }
  }

  _addMetaContext(schema, defaultId) {
    const id =
      defaultId !== undefined ? defaultId : this._schemaIdentifier(schema);
    const ctx = new SchemaContext(this, schema, this._rootBase("", id), false, true);
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
    const split = splitResolved(this.opts.uriResolver, full);
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
    // ajv's generated validators are sloppy functions: a plain call binds
    // `this` to the global object, and null or undefined does too. Context
    // passing mirrors that so a rule observes exactly what ajv gives it.
    const passesContext = this.opts.passContext === true;
    const contextOf = (self) =>
      self === null || self === undefined ? globalThis : Object(self);
    let validate;
    if (isAsync) {
      validate = async function (data, dataCxt) {
        const context = passesContext ? contextOf(this) : undefined;
        const errors = [];
        const result = await validator.runAsync(node, data, ctx, errors, dataCxt, context);
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
      const state = {
        n: 0,
        fail: -1,
        data: undefined,
        dataCxt: undefined,
        reported: -1,
        errors: null,
      };
      const fast = createFastValidator(ctx, node, state, (data, dataCxt) => {
        state.data = data;
        state.dataCxt = dataCxt;
        state.fail = state.n;
        return false;
      });
      if (fast === null) {
        validate = function (data, dataCxt) {
          const context = passesContext ? contextOf(this) : undefined;
          const errors = [];
          if (!validator.run(node, data, ctx, errors, dataCxt, context)) {
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
              state.errors = validator.run(node, state.data, ctx, report, state.dataCxt)
                ? null
                : report;
              state.reported = state.n;
              state.data = undefined;
              state.dataCxt = undefined;
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

  _addSchemaEntry(schema, baseId, key, meta) {
    const id = this._schemaIdentifier(schema);
    const base = typeof id === "string" ? this._rootBase(baseId, id) : baseId;
    const ctx = new SchemaContext(this, schema, base, false, Boolean(meta));
    if (meta) ctx.opts = this._metaOpts;
    this._register(ctx);
    this._contexts.push(ctx);

    const aliases = new Set();
    if (key !== undefined) {
      aliases.add(
        normalizeId(
          this._customUriResolver ? key : resolveUrl(this.opts.uriResolver, "", key),
        ),
      );
    }
    if (base !== "") aliases.add(base);
    ctx.aliases = aliases;
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
    // ajv reads the identifier before anything else, refuses a non-string
    // one, and refuses a key or identifier already in the registry before it
    // validates the schema.
    const id = typeof schema === "object" ? schema[this._schemaIdentifierKeyword()] : undefined;
    if (id !== undefined && typeof id !== "string") {
      throw new Error(`schema ${this._schemaIdentifierKeyword()} must be string`);
    }
    const name = normalizeId(key || id || "");
    this._checkUnique(name, schema);
    const keyBase =
      key !== undefined
        ? normalizeId(
            this._customUriResolver ? key : resolveUrl(this.opts.uriResolver, "", key),
          )
        : "";
    const resolved = typeof id === "string" ? this._rootBase(keyBase, id) : keyBase;
    if (resolved !== name) this._checkUnique(resolved, schema);
    // ajv makes the schema reachable by its identifier before it checks the
    // schema against a meta-schema, so a meta-schema that names itself as its
    // own `$schema` resolves. The name it was registered under becomes
    // reachable only once the check passes; a failed registration leaves the
    // identifier behind, exactly as ajv does.
    const {ctx} = this._addSchemaEntry(schema, keyBase, key, _meta);
    if (ctx.base !== "") this.refs[ctx.base] = ctx.root;
    this._cache.clear();
    // With `validateSchema: "log"` the refusal is reported through the logger
    // and registration continues, exactly as ajv continues.
    if (validateSchema !== false && this.opts.validateSchema !== false) {
      this.validateSchema(schema, true);
    }
    this._registerAliases(ctx);
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

    const id = this._schemaIdentifier(schema);
    const base = typeof id === "string" ? this._rootBase("", id) : "";
    const used = this.opts.addUsedSchema !== false;
    // ajv checks the identifier before it validates the schema, so a second
    // schema carrying a taken identifier is refused even if it is malformed.
    if (used && base !== "" && !base.startsWith("#")) this._checkUnique(base, schema, true);

    if (!_meta && this.opts.validateSchema !== false) this.validateSchema(schema, true);
    // A keyword definition's value schema is compiled as a meta-schema, with
    // the options ajv uses for meta-schemas: formats are annotations there,
    // and the options that rewrite data do not apply. The checks that report
    // unknown formats or strict types therefore stay silent for it.
    const ctx = new SchemaContext(this, schema, base, !_meta);
    if (_meta) {
      ctx.opts = this._metaOpts;
      ctx.meta = true;
      ctx.prepare(ctx.root);
    }
    // With automatic registration off the environment stays unreachable by
    // identifier: references inside it still resolve, but `getSchema` and a
    // later compiled schema carrying the same identifier see nothing.
    if (used) {
      this._register(ctx);
      if (base !== "" && !base.startsWith("#")) this.refs[base] = ctx.root;
    }
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

  // ajv's asynchronous compilation: a schema whose references are not
  // registered yet is retried after `opts.loadSchema` supplies each missing
  // schema. Loaded schemas become ordinary registrations, so later
  // compilations resolve them without asking the loader again. Concurrent
  // compilations share one in-flight load per missing schema URI. Without a
  // loader the call fails, synchronously, with ajv's message.
  compileAsync(schema, meta) {
    if (typeof this.opts.loadSchema !== "function") {
      throw new Error("options.loadSchema should be a function");
    }
    const loadSchema = this.opts.loadSchema;

    const loadMetaSchema = async ($ref) => {
      if ($ref && !this.getSchema($ref)) {
        await runCompileAsync({$ref}, true);
      }
    };

    const runCompileAsync = async (_schema, _meta) => {
      await loadMetaSchema(_schema.$schema);
      return compileMetaAware(_schema, _meta);
    };

    const compileMetaAware = async (_schema, _meta) => {
      try {
        return this.compile(_schema, _meta);
      } catch (error) {
        if (!(error instanceof MissingRefError)) throw error;
        checkLoaded(error);
        await loadMissingSchema(error.missingSchema);
        return compileMetaAware(_schema, _meta);
      }
    };

    // A missing reference inside a schema that is already available cannot be
    // fixed by the loader: ajv reports the enclosing schema and the
    // unresolvable reference instead of asking again.
    const checkLoaded = ({missingSchema: ref, missingRef}) => {
      if (this.refs[ref]) {
        throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
      }
    };

    const loadMissingSchema = async (ref) => {
      const loaded = await loadOnce(ref);
      // ajv hands the loaded value to addSchema, which refuses anything that
      // is not a schema.
      if (typeof loaded !== "object" && typeof loaded !== "boolean") {
        throw new Error(
          this.opts.jtd ? "schema must be object" : "schema must be object or boolean",
        );
      }
      if (!this.refs[ref]) await loadMetaSchema(loaded.$schema);
      if (!this.refs[ref]) this.addSchema(loaded, ref, meta);
    };

    const loadOnce = async (ref) => {
      const pending = this._loading[ref];
      if (pending) return pending;
      try {
        return await (this._loading[ref] = loadSchema(ref));
      } finally {
        delete this._loading[ref];
      }
    };

    return runCompileAsync(schema, meta);
  }

  getSchema(ref) {
    const full = this._customUriResolver
      ? ref
      : normalizeId(resolveUrl(this.opts.uriResolver, "", ref));
    const cacheKey = "ref:" + full;
    const cached = this._cache.get(cacheKey);
    if (cached) return cached;
    let target;
    if (this._customUriResolver) {
      // ajv first answers a key or identifier exactly as the project supplied
      // it, then resolves the query through the strategy.
      const direct = this._global.roots.get(ref);
      if (direct) target = {ctx: direct.ctx, node: direct.node};
      else target = this._lookupGlobal(ref);
    } else {
      target = this._lookupGlobal(full);
    }
    if (!target) return undefined;
    // ajv compiles the schema the pointer belongs to before handing back a
    // validator, so its compile-time checks apply to the environment root and
    // to the requested subschema.
    target.ctx.prepare(target.ctx.root);
    if (target.node !== target.ctx.root) target.ctx.prepare(target.node);
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
    if (this._metaContext !== undefined) {
      const alias = normalizeId(
        this._customUriResolver
          ? META_SCHEMA_ALIAS
          : resolveUrl(this.opts.uriResolver, "", META_SCHEMA_ALIAS),
      );
      this._global.ids.set(alias, {ctx: this._metaContext, node: this._metaContext.root});
      this._global.roots.set(alias, {ctx: this._metaContext, node: this._metaContext.root});
    }
    for (const ctx of this._contexts) {
      this._register(ctx);
      this._registerAliases(ctx);
    }
  }

  removeSchema(ref) {
    if (ref === undefined) {
      // As in ajv, removing every schema keeps the meta-schemas: the dialect
      // meta-schemas and any schema a project registered with addMetaSchema.
      this._contexts = this._contexts.filter((ctx) => ctx.meta);
      this.schemas = Object.create(null);
      this.refs = Object.create(null);
      this._cache.clear();
      this._rebuildGlobal();
      return this;
    }
    if (ref instanceof RegExp) {
      for (const key of Object.keys(this.schemas)) {
        const registered = this._global.ids.get(key) || this._global.roots.get(key);
        if (registered && registered.ctx.meta) continue;
        if (ref.test(key)) this.removeSchema(key);
      }
      return this;
    }
    const full = normalizeId(
      this._customUriResolver ? ref : resolveUrl(this.opts.uriResolver, "", ref),
    );
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
    if (this.opts.defaultMeta !== undefined) return this.opts.defaultMeta;
    let id;
    const {meta} = this.opts;
    if (isObject(meta)) {
      // An object supplied as `meta` is the default meta-schema; its
      // identifier names it when it carries one.
      id = meta[this._schemaIdentifierKeyword()] || meta;
    } else if (meta !== false) {
      id = this._defaultMetaId;
    }
    return (this.opts.defaultMeta = id);
  }

  validateSchema(schema, throwOrLogError) {
    if (typeof schema === "boolean") return true;
    if (!isObject(schema)) return true;
    if (schema.$schema !== undefined && typeof schema.$schema !== "string") {
      throw new Error("$schema must be a string");
    }
    const metaRef = schema.$schema || this.opts.defaultMeta || this.defaultMeta();
    if (!metaRef) {
      // ajv reports the missing default meta-schema through the project's
      // logger and lets the schema through unvalidated.
      this.logger.warn("meta-schema not available");
      this.errors = null;
      return true;
    }
    const validate =
      typeof metaRef === "string" ? this.getSchema(metaRef) : this.compile(metaRef, true);
    if (!validate) throw new Error(`no schema with key or ref "${metaRef}"`);
    const valid = validate(schema);
    this.errors = validate.errors;
    if (!valid && throwOrLogError) {
      const message = "schema is invalid: " + this.errorsText(validate.errors);
      if (this.opts.validateSchema === "log") this.logger.error(message);
      else throw new Error(message);
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
    this.logger.warn("keywords option as map is deprecated, pass array");
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
  // `{keyword, type?, compile(schema, parentSchema)}`, a macro
  // `{keyword, type?, macro(schema, parentSchema)}` whose return value is the
  // schema that stands in for the keyword, or a rule that contributes generated
  // validation code `{keyword, type?, code(cxt, ruleType)}`. The deprecated
  // two-argument form `addKeyword(name, definition)` is accepted as well. A
  // definition may also declare `metaSchema` for its value, `post`/`before` for
  // its place among the keywords, `implements` for keywords it stands in for,
  // and `$dataError` for the report of an unusable document-sourced value. A
  // keyword registered without a rule is known to the validator but does not
  // take part in validation, as in ajv.
  addKeyword(keywordOrDefinition, definition) {
    let keyword = keywordOrDefinition;
    let def = definition;
    if (typeof keyword === "string") {
      if (isObject(def)) {
        this.logger.warn("these parameters are deprecated, see docs for addKeyword");
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
    const hasCode = isObject(def) && def.code !== undefined;
    if (isObject(def)) {
      // ajv only resolves a data reference for a rule that can receive the
      // resolved value, never for a macro or a keyword with no rule at all.
      if (def.$data && !hasValidate && !hasCode) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
      if (hasCompile && typeof def.compile !== "function") {
        throw new Error(`keyword "${names[0]}" must have a compile function`);
      }
      if (hasMacro && typeof def.macro !== "function") {
        throw new Error(`keyword "${names[0]}" must have a macro function`);
      }
      if (hasCode && typeof def.code !== "function") {
        throw new Error(`keyword "${names[0]}" must have a code function`);
      }
      if (def.post === true && jsonTypes(def.type).length > 0) {
        throw new Error('keyword with "post" flag cannot have "type"');
      }
    }
    if (!hasMacro && !hasValidate && !hasCompile && !hasCode) {
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
          // ajv still runs the keyword's declaration checks when it compiles a
          // schema that uses it, even though the keyword contributes no rule:
          // a companion keyword's dependencies are refused without its owner.
          dependencies: isObject(def) && Array.isArray(def.dependencies)
            ? def.dependencies.slice()
            : undefined,
        },
        def,
      );
      return this;
    }

    if (!hasMacro && !hasCode && typeof def.validate !== "function" && hasValidate) {
      throw new Error(`keyword "${names[0]}" must have a validate function`);
    }

    const entry = {
      keyword: names[0],
      types: jsonTypes(def.type),
      schemaTypes: def.schemaType === undefined ? [] : jsonTypes(def.schemaType),
      $data: Boolean(def.$data),
      // The definition itself, for the declarations a code keyword reads while
      // generating its program (`error`, `$dataError`, `trackErrors`).
      definition: def,
      // A code keyword takes precedence over the other rule forms, exactly as
      // ajv's keyword compilation does.
      code: hasCode ? def.code : undefined,
      validate: hasValidate ? def.validate : undefined,
      // ajv gives a definition that carries both a macro and a validate or
      // compile function to the macro, unless it contributes generated code.
      macro: !hasCode && hasMacro ? def.macro : undefined,
      compile: !hasCode && !hasMacro && hasCompile ? def.compile : undefined,
      async: def.async === true,
      inspectErrors: def.errors !== false,
      modifying: def.modifying === true,
      passSchema: def.schema !== false,
      allowUndefined: def.allowUndefined === true,
      // Placement among the keyword groups: `post` runs after every other
      // keyword, `before` names the keyword this one precedes.
      post: def.post === true,
      // Keywords whose presence the parent schema must declare for this rule
      // to be legal, as ajv requires of its format-limit extension.
      dependencies: Array.isArray(def.dependencies) ? def.dependencies.slice() : undefined,
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
      this.keywords.set(name, {
        ...entry,
        keyword: name,
        registration: keywordRegistration(def, entry.validateSchema),
      });
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

  // ajv's public vocabulary lookup: the definition a keyword was registered
  // with, or `false` when the vocabulary knows the name without a rule and
  // when it does not know the name at all.
  getKeyword(keyword) {
    const entry = this.keywords.get(keyword);
    if (entry !== undefined) return entry.registration === undefined ? false : entry.registration;
    if (this._builtinRules.has(keyword)) return this._builtinRules.get(keyword);
    // ajv's rule table is a plain object, so a name it inherits from
    // Object.prototype is answered from the prototype: the inherited methods
    // read as known keywords, and `__proto__` reads as a rule without a
    // definition. Queries outside the vocabulary still answer `false`.
    const inherited = INHERITED_RULES[keyword];
    if (inherited !== undefined) {
      return typeof inherited === "object" ? inherited.definition : Boolean(inherited);
    }
    return false;
  }

  removeKeyword(keyword) {
    this.keywords.delete(keyword);
    this._builtinRules.delete(keyword);
    this._keywordRevision++;
    return this;
  }

  addFormat(name, format) {
    if (typeof format === "string") format = new RegExp(format);
    this.formats[name] = format;
    return this;
  }

  // ajv's `$dataMetaSchema`: a meta-schema whose value-keyword schemas also
  // accept `{ $data: ... }`, built at registration time by the 2019-09 and
  // 2020-12 meta-schema modules.
  $dataMetaSchema(metaSchema, keywordsJsonPointers) {
    const rules = builtinVocabulary(this.opts.metaDialect || "draft7");
    metaSchema = JSON.parse(JSON.stringify(metaSchema));
    for (const jsonPointer of keywordsJsonPointers) {
      const segments = jsonPointer.split("/").slice(1);
      let keywords = metaSchema;
      for (const segment of segments) keywords = keywords[segment];
      for (const [name, rule] of rules) {
        if (rule.$data !== true || keywords[name] === undefined) continue;
        keywords[name] = {
          anyOf: [
            keywords[name],
            {$ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"},
          ],
        };
      }
    }
    return metaSchema;
  }

  addMetaSchema(schema, key, validateSchema = this.opts.validateSchema) {
    return this.addSchema(schema, key, true, validateSchema);
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
Ajv.KeywordCxt = KeywordCxt;

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
module.exports.KeywordCxt = KeywordCxt;
module.exports.CodeGen = CodeGen;
