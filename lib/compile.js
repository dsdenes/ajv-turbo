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
  DATA_REFERENCE_KEYWORDS,
  isDataReference,
  resolveDataReference,
} = require("./util");
const {compileKeywordCode} = require("./keyword-code");
const {_Code: Code} = require("./codegen-code");

// ajv's data references: a keyword value of the form {$data: "<pointer>"}
// resolves against the document being validated. The pointer is either an
// absolute JSON pointer or ajv's relative form ("1/limit", "0#").
const JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
const RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;

// The keyword value types ajv's meta-schemas allow a data reference to stand
// in for, keyed by keyword. `const` accepts any resolved value.
const DATA_KEYWORD_TYPES = new Map([
  ["const", undefined],
  ["enum", "array"],
  ["exclusiveMaximum", "number"],
  ["exclusiveMinimum", "number"],
  ["format", "string"],
  ["maxItems", "number"],
  ["maxLength", "number"],
  ["maxProperties", "number"],
  ["maximum", "number"],
  ["minItems", "number"],
  ["minLength", "number"],
  ["minProperties", "number"],
  ["minimum", "number"],
  ["multipleOf", "number"],
  ["pattern", "string"],
  ["required", "array"],
  ["uniqueItems", "boolean"],
]);

function unescapeJsonPointer(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

// Throws ajv's compile-time message for a pointer ajv cannot compile.
function checkDataPointer(pointer) {
  if (
    typeof pointer !== "string" ||
    (pointer !== "" && pointer[0] !== "/" && !RELATIVE_JSON_POINTER.test(pointer))
  ) {
    throw new Error(`Invalid JSON-pointer: ${pointer}`);
  }
  if (pointer[0] === "/" && !JSON_POINTER.test(pointer)) {
    throw new Error(`Invalid JSON-pointer: ${pointer}`);
  }
}

function dataKeywordMessage(keyword, types) {
  return `"${keyword}" keyword must be ${types.join(",")} ($data)`;
}

function dataPointer(value) {
  return isDataReference(value) ? value.$data : undefined;
}

// ajv's error for a reference whose resolved value has a type the keyword
// cannot use.
function reportDataReference(state, instancePath, schemaPath, keyword, types, node, data) {
  addError(state, instancePath, schemaPath, keyword, {}, dataKeywordMessage(keyword, types), {
    schema: node[keyword],
    parentSchema: node,
    data,
  });
}

// ajv's report for a document-sourced keyword value the keyword cannot use: a
// definition that supplies its own `$dataError` message and params is used
// instead of the generic type message.
function reportDataKeyword(state, instancePath, schemaPath, entry, node, data) {
  const definition = entry.$dataError;
  const cxt = {
    keyword: entry.keyword,
    schemaType: entry.schemaTypes,
    schema: node[entry.keyword],
    schemaValue: node[entry.keyword],
    parentSchema: node,
    data,
    params: {},
  };
  let params = {};
  if (isObject(definition) && definition.params !== undefined) {
    params = typeof definition.params === "function" ? definition.params(cxt) : definition.params;
  }
  // ajv only builds the message when reports carry messages, so a definition's
  // message function is not called in message-free mode.
  let message;
  if (state.messages) {
    if (isObject(definition) && definition.message !== undefined) {
      message =
        typeof definition.message === "function" ? definition.message(cxt) : definition.message;
    } else {
      message = dataKeywordMessage(entry.keyword, entry.schemaTypes);
    }
  }
  addError(state, instancePath, schemaPath, entry.keyword, params || {}, message, {
    schema: node[entry.keyword],
    parentSchema: node,
    data,
  });
}

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

function addError(state, instancePath, schemaPathBase, keyword, params, message, context) {
  if (!state.errs) return;
  const error = {
    instancePath,
    schemaPath: schemaPathBase + "/" + keyword,
    keyword,
    params,
  };
  if (state.messages) error.message = message;
  if (state.verbose) {
    error.schema = context.schema;
    error.parentSchema = context.parentSchema;
    error.data = context.data;
  }
  if (state.propertyName !== undefined) error.propertyName = state.propertyName;
  state.errs.push(error);
}

// A macro may return the same schema object from several schema locations, so
// each expansion gets its own copy: base identifiers and prepared reference
// targets are recorded per schema object.
function cloneSchema(value) {
  if (Array.isArray(value)) return value.map(cloneSchema);
  if (isObject(value)) {
    const copy = {};
    for (const key of Object.keys(value)) copy[key] = cloneSchema(value[key]);
    return copy;
  }
  return value;
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

// Names of registered keywords that carry a validation rule or a macro. A
// keyword registered without one is known to the validator but does not make a
// schema do work, exactly as a rule-less keyword in ajv's rule table.
function keywordRuleNames(keywords) {
  const names = new Set();
  for (const entry of keywords.values()) {
    if (
      entry.validate !== undefined ||
      entry.macro !== undefined ||
      entry.compile !== undefined ||
      entry.code !== undefined
    ) {
      names.add(entry.keyword);
    }
  }
  return names;
}

function isKeywordRule(entry) {
  return (
    entry.validate !== undefined ||
    entry.macro !== undefined ||
    entry.compile !== undefined ||
    entry.code !== undefined
  );
}

// ajv's shouldUseRule: a rule runs when its own keyword is present, or when a
// schema uses one of the keywords its definition says it implements. A schema
// whose only keywords are rule-less compiles no rules at all, so an
// `implements` declaration runs only when the node has at least one rule.
function keywordApplies(node, entry, customKeywords) {
  if (node[entry.keyword] !== undefined) return true;
  if (entry.implements === undefined) return false;
  if (!entry.implements.some((keyword) => node[keyword] !== undefined)) return false;
  for (const key of Object.keys(node)) {
    if (key === "$ref") continue;
    if (RULE_KEYWORDS.has(key) || customKeywords.has(key)) return true;
  }
  return false;
}

// The built-in rules of each ajv group, in the order ajv registers them for the
// dialect. A custom keyword's `before` names one of these rules (or another
// registered keyword), and its place among them decides when it runs.
function builtinRuleGroups(opts) {
  const any = [
    "$comment",
    "id",
    "$ref",
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
  ];
  if (opts.next) {
    any.unshift("$dynamicAnchor", "$dynamicRef", "$recursiveAnchor", "$recursiveRef");
  }
  const array =
    opts.metaDialect === "2020"
      ? ["maxItems", "minItems", "prefixItems", "items", "contains", "uniqueItems"]
      : ["maxItems", "minItems", "additionalItems", "items", "contains", "uniqueItems"];
  const object = [
    "maxProperties",
    "minProperties",
    "required",
    "propertyNames",
    "additionalProperties",
    "dependencies",
    "properties",
    "patternProperties",
  ];
  if (opts.next) {
    array.push("maxContains", "minContains");
    object.push("dependentRequired", "dependentSchemas");
  }
  if (opts.unevaluated) {
    array.push("unevaluatedItems");
    object.push("unevaluatedProperties");
  }
  return {
    any,
    number: ["maximum", "minimum", "exclusiveMaximum", "exclusiveMinimum", "multipleOf", "format"],
    string: ["maxLength", "minLength", "pattern", "format"],
    array,
    object,
  };
}

// The data types each rule applies to, as ajv's keyword definitions declare
// them. `strictTypes` reports a keyword whose rule cannot run for any type the
// schema allows.
const KEYWORD_DATA_TYPES = {
  maximum: ["number"],
  minimum: ["number"],
  exclusiveMaximum: ["number"],
  exclusiveMinimum: ["number"],
  multipleOf: ["number"],
  maxLength: ["string"],
  minLength: ["string"],
  pattern: ["string"],
  maxProperties: ["object"],
  minProperties: ["object"],
  required: ["object"],
  maxItems: ["array"],
  minItems: ["array"],
  uniqueItems: ["array"],
  propertyNames: ["object"],
  additionalProperties: ["object"],
  dependencies: ["object"],
  properties: ["object"],
  patternProperties: ["object"],
  additionalItems: ["array"],
  prefixItems: ["array"],
  items: ["array"],
  contains: ["array"],
  format: ["number", "string"],
  dependentRequired: ["object"],
  dependentSchemas: ["object"],
  maxContains: ["array"],
  minContains: ["array"],
  unevaluatedProperties: ["object"],
  unevaluatedItems: ["array"],
};

// The order ajv checks rules for a missing schema type: the order its rule
// table registers the keywords in.
function strictTypeKeywordOrder(opts) {
  const order = [
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
    "propertyNames",
    "additionalProperties",
    "dependencies",
    "properties",
    "patternProperties",
  ];
  if (opts.metaDialect === "2020") order.push("prefixItems", "items", "contains", "format");
  else order.push("additionalItems", "items", "contains", "format");
  if (opts.next) {
    order.push(
      "dependentRequired",
      "dependentSchemas",
      "maxContains",
      "minContains",
      "unevaluatedProperties",
      "unevaluatedItems",
    );
  }
  return order;
}

function includesSchemaType(types, type) {
  return types.includes(type) || (type === "integer" && types.includes("number"));
}

function hasApplicableType(schemaTypes, keywordType) {
  return (
    schemaTypes.includes(keywordType) ||
    (keywordType === "number" && schemaTypes.includes("integer"))
  );
}

// ajv narrows a schema's context types to the intersection with its own type.
function narrowSchemaTypes(types, withTypes) {
  const narrowed = [];
  for (const type of types) {
    if (includesSchemaType(withTypes, type)) narrowed.push(type);
    else if (withTypes.includes("integer") && type === "number") narrowed.push("integer");
  }
  return narrowed;
}

// The point in the runtime where a built-in rule runs. Most names are their own
// point; the few rules that only annotate another keyword share that keyword's
// point.
const ANY_KEYWORD_SLOTS = {
  $comment: "start",
  id: "start",
  $dynamicAnchor: "start",
  $recursiveAnchor: "start",
  nullable: "type",
  $dynamicRef: "dynref",
  $recursiveRef: "dynref",
  then: "ifEnd",
  else: "ifEnd",
};

function keywordSlot(group, keyword) {
  if (group === "any") return ANY_KEYWORD_SLOTS[keyword] || keyword;
  if (group === "array" && (keyword === "maxContains" || keyword === "minContains")) {
    return "containsEnd";
  }
  return keyword;
}

// Splits the registered keywords the way ajv splits its rule groups: untyped
// keywords first, then one list per data type, then the `post` group, with each
// keyword placed in registration order or before the rule its definition names.
// Each group becomes a map of runtime slots to the keywords that run at that
// slot, plus the keywords that follow every built-in rule of the group.
function buildKeywordPlan(keywords, opts, logger = console) {
  const builtins = builtinRuleGroups(opts);
  const lists = {any: [], number: [], string: [], array: [], object: [], post: []};
  for (const group of Object.keys(lists)) {
    if (group === "post") continue;
    for (const keyword of builtins[group]) lists[group].push({keyword});
  }
  const extras = new Map();

  const insert = (list, entry) => {
    if (entry.before !== undefined) {
      const index = list.findIndex(
        (item) => (item.entry === undefined ? item.keyword : item.entry.keyword) === entry.before,
      );
      if (index >= 0) {
        list.splice(index, 0, {entry});
        return;
      }
      logger.warn(`rule ${entry.before} is not defined`);
    }
    list.push({entry});
  };

  for (const entry of keywords.values()) {
    if (!isKeywordRule(entry)) continue;
    if (entry.post === true) {
      insert(lists.post, entry);
      continue;
    }
    if (entry.types.length === 0) {
      insert(lists.any, entry);
      continue;
    }
    for (const type of entry.types) {
      if (KEYWORD_GROUP_TYPES.includes(type)) {
        insert(lists[type], entry);
      } else {
        let list = extras.get(type);
        if (list === undefined) {
          list = [];
          extras.set(type, list);
        }
        insert(list, entry);
      }
    }
  }

  const plan = {
    any: [],
    number: [],
    string: [],
    array: [],
    object: [],
    post: [],
    phases: {},
    extra: new Map(),
  };
  for (const group of Object.keys(lists)) {
    const phases = new Map();
    const tail = [];
    let pending = null;
    for (const item of lists[group]) {
      if (item.entry === undefined) {
        if (pending !== null) {
          const slot = keywordSlot(group, item.keyword);
          const existing = phases.get(slot);
          if (existing === undefined) phases.set(slot, pending);
          else existing.push(...pending);
          pending = null;
        }
      } else {
        if (pending === null) pending = [];
        pending.push(item.entry);
      }
    }
    if (pending !== null) tail.push(...pending);
    plan[group] = tail;
    plan.phases[group] = phases;
  }
  for (const [type, list] of extras) {
    for (const item of list) {
      let entries = plan.extra.get(type);
      if (entries === undefined) {
        entries = [];
        plan.extra.set(type, entries);
      }
      entries.push(item.entry);
    }
  }
  // Every keyword that belongs to each group, in execution order, whether it
  // runs at a built-in rule's point or after the group's last rule. A group's
  // presence decides whether ajv's separate type check is needed.
  plan.all = {any: [], number: [], string: [], array: [], object: [], post: []};
  for (const group of Object.keys(lists)) {
    for (const item of lists[group]) {
      if (item.entry !== undefined) plan.all[group].push(item.entry);
    }
  }
  plan.all.extra = plan.extra;
  return plan;
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
// The keywords that hold a single schema and are known to every dialect, but
// are not declared by the draft-06 meta-schema. ajv checks their value type
// when it compiles them, whichever meta-schema validated the schema.
const CONDITION_KEYWORDS = ["if", "then", "else"];
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
  // Not a schema: the discriminator annotation holds a propertyName and an
  // optional mapping, and its contents are not validated as subschemas.
  "discriminator",
]);

// The keywords each dialect's vocabularies define, as ajv's rule table lists
// them. ajv keeps a few keywords from earlier dialects known in later ones
// (`definitions`, `dependencies`, `id`, `additionalItems` in 2019-09), and it
// never registers `$anchor` as a keyword at all, so strict mode treats those
// exactly as it does here.
const DRAFT7_KEYWORDS = [
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
];

// The keywords 2019-09 adds to the draft-07 vocabulary.
const NEXT_KEYWORDS = [
  "$dynamicAnchor",
  "$dynamicRef",
  "$recursiveAnchor",
  "$recursiveRef",
  "dependentRequired",
  "dependentSchemas",
  "maxContains",
  "minContains",
  "unevaluatedItems",
  "unevaluatedProperties",
];

const VOCABULARY_DRAFT7 = new Set(DRAFT7_KEYWORDS);
const VOCABULARY_2019 = new Set([...DRAFT7_KEYWORDS, ...NEXT_KEYWORDS]);
// 2020-12 replaces the tuple `items`/`additionalItems` pair with `prefixItems`
// and a schema-valued `items`.
const VOCABULARY_2020 = new Set(
  [...VOCABULARY_2019].filter((keyword) => keyword !== "additionalItems").concat("prefixItems"),
);

function vocabularyFor(opts) {
  if (opts.metaDialect === "2020") return VOCABULARY_2020;
  if (opts.metaDialect === "2019") return VOCABULARY_2019;
  return VOCABULARY_DRAFT7;
}

class SchemaContext {
  constructor(ajv, schema, baseId, prepareNow = true, meta = false) {
    this.ajv = ajv;
    // ajv skips its schema-type strictness checks while compiling a
    // meta-schema; the vocabulary and rule checks still apply there.
    this.meta = meta;
    this.opts = ajv.opts;
    this.next = this.opts.next === true;
    this.unevaluated = this.opts.unevaluated === true;
    this.dynamic = this.opts.dynamicRef === true;
    this.draft2020 = this.opts.metaDialect === "2020";
    // ajv's generated validator is an async function exactly when the schema
    // environment's root requests asynchronous validation. A schema inlined
    // from another environment inherits the mode of the environment it is
    // inlined into; the runtime state carries that mode.
    this.async = isObject(schema) && schema.$async === true;
    this.root = schema;
    this.base = normalizeId(baseId || "");
    // Standalone generation rebuilds a context only to run an already compiled
    // validator; its schema passed the compile-time checks when it was
    // compiled, so the reconstruction must not repeat them.
    this.strictChecks = ajv.strictChecks !== false;
    this._knownRevision = -1;
    this._knownKeywords = null;
    // Registered keywords carrying a rule, as of this compilation. A schema
    // may be added before a keyword is registered, so the set follows the
    // owning Ajv instance's registry revision instead of freezing here.
    this._keywordRevision = -1;
    this._keywordRuleSet = null;
    this.baseOf = new WeakMap();
    this.pathOf = new WeakMap();
    this.ids = new Map();
    this.roots = new Map();
    this.refTargets = new WeakMap();
    // Keyword macros expanded for the nodes that use them, by node and
    // definition entry.
    this.macroPlans = new WeakMap();
    // Validation functions a `compile` declaration produced, by node and
    // definition entry. They are produced once per schema location.
    this.compiledKeywords = new WeakMap();
    // Programs a `code` declaration generated, by node and definition entry.
    this.codeKeywords = new WeakMap();
    this.seen = new WeakSet();
    this.prepared = new WeakSet();
    // The async modes a node's generated-code keywords were prepared for. The
    // same node can be prepared once as its own schema environment and again
    // inlined into a schema of the other mode.
    this.preparedKeywordModes = new WeakMap();
    // Nodes whose strictness diagnostics were already emitted, and nodes whose
    // vocabulary was already checked outside a full compile (ajv inspects a
    // subschema with `alwaysValidSchema`, which checks its keywords).
    this._strictSeen = new WeakSet();
    // Schema nodes ajv never compiles (a condition with no usable branch, for
    // example) still appear in a traversal of the document, but must not
    // produce compile-time diagnostics.
    this._strictSkip = new WeakSet();
    // The dialect's rule order, keyword vocabulary, and schema-type check
    // order, computed once per compilation environment.
    this._strictGroups = null;
    this._strictTypeOrder = null;
    this._vocabulary = null;
    this._ruleKeywordSet = null;
    // While a macro expansion is prepared, its strictness walk is suspended:
    // the expansion is analyzed where the macro keyword stands, in the
    // enclosing schema's context.
    this._strictSuppress = false;
    // Every schema node this environment visited, in traversal order. Standalone
    // generation reads it to find the formats and custom keywords the
    // environment can reach.
    this.nodes = new Set();
    this.visit(schema, this.base, "");
    if (this.root !== undefined) this.roots.set(this.base, schema);
    this.ids.set(this.base, schema);
    if (prepareNow) this.prepare(schema);
  }

  get ruleGroups() {
    if (this._strictGroups === null) this._strictGroups = builtinRuleGroups(this.opts);
    return this._strictGroups;
  }

  get typeKeywordOrder() {
    if (this._strictTypeOrder === null) this._strictTypeOrder = strictTypeKeywordOrder(this.opts);
    return this._strictTypeOrder;
  }

  get vocabulary() {
    if (this._vocabulary === null) this._vocabulary = vocabularyFor(this.opts);
    return this._vocabulary;
  }

  // The keywords that make a schema do validation work, exactly ajv's rule
  // table: every rule of each group plus every registered keyword rule.
  get ruleKeywordSet() {
    if (this._ruleKeywordSet === null) {
      const rules = new Set();
      for (const group of Object.values(this.ruleGroups)) {
        for (const keyword of group) rules.add(keyword);
      }
      for (const keyword of this.keywordRules) rules.add(keyword);
      this._ruleKeywordSet = rules;
    }
    return this._ruleKeywordSet;
  }

  get keywordRules() {
    if (this._keywordRevision !== this.ajv._keywordRevision) {
      this._keywordRevision = this.ajv._keywordRevision;
      this._keywordRuleSet = keywordRuleNames(this.ajv.keywords);
    }
    return this._keywordRuleSet;
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

  // Records the base identifier and path of every schema node. A node in a
  // macro expansion gets `register = false`: ajv compiles the expansion under
  // the parent's schema environment but never registers its identifiers, so a
  // reference to the expansion's own `$id` does not resolve there either.
  visit(node, base, path, register = true) {
    if (!isObject(node)) return;
    if (this.seen.has(node)) return;
    this.seen.add(node);
    this.nodes.add(node);

    let nodeBase = base;
    // The identifier property the instance is configured to recognise (`$id`
    // unless the project selected the legacy `id`).
    const id = node[this.opts.schemaId || "$id"];
    if (typeof id === "string") {
      const resolved = normalizeId(resolveUri(base, id));
      nodeBase = resolved;
      if (register) {
        this.ids.set(resolved, node);
        const split = splitUri(resolved);
        if (split.fragment === undefined || split.fragment === "") {
          this.roots.set(resolved, node);
        }
      }
    }
    if (register) {
      for (const anchorKey of ["$anchor", "$dynamicAnchor"]) {
        const anchor = node[anchorKey];
        if (typeof anchor === "string") {
          this.ids.set(normalizeId(resolveUri(nodeBase, "#" + anchor)), node);
        }
      }
    }

    this.baseOf.set(node, nodeBase);
    if (!this.pathOf.has(node)) this.pathOf.set(node, path);

    for (const key of Object.keys(node)) {
      const child = node[key];
      const childPath = path ? path + "/" + escapePointerToken(key) : escapePointerToken(key);
      if (Array.isArray(child)) {
        if (SCHEMA_ARRAY_KEYWORDS.has(key)) {
          for (let i = 0; i < child.length; i++) {
            this.visit(child[i], nodeBase, childPath + "/" + i, register);
          }
        }
      } else if (SCHEMA_MAP_KEYWORDS.has(key)) {
        if (isObject(child)) {
          for (const name of Object.keys(child)) {
            this.visit(child[name], nodeBase, childPath + "/" + escapePointerToken(name), register);
          }
        }
      } else if (SCHEMA_KEYWORDS.has(key) || !NON_SCHEMA_KEYWORDS.has(key)) {
        this.visit(child, nodeBase, childPath, register);
      }
    }
  }

  // `prefix` and `prefixNode` describe where an inlined reference's schema
  // stands in the referencing schema, so a compile-time keyword error is
  // reported at ajv's path for it: the literal `$ref` followed by the path
  // inside the referenced schema.
  prepare(node, prefix, prefixNode, async = this.async) {
    if (!isObject(node)) return;
    if (this.prepared.has(node)) {
      this.prepareKeywordCodeMode(node, async);
      return;
    }
    this.prepared.add(node);
    // An inlined reference is prepared in the environment it is inlined into,
    // so the nested preparation that a macro expansion starts uses the same
    // mode rather than this context's own.
    const previous = this._prepareAsync;
    this._prepareAsync = async;
    try {
      this._prepareNode(node, prefix, prefixNode, async);
      this.prepareKeywordCodeMode(node, async);
    } catch (error) {
      // Asynchronous compilation retries the schema once the loader supplies a
      // missing reference. Only the nodes whose preparation did not finish may
      // run again; the ones that completed keep their resolved references.
      this.prepared.delete(node);
      throw error;
    } finally {
      this._prepareAsync = previous;
    }
  }

  // Compiles a node's generated-code keywords for an async mode the node has
  // not been prepared for yet. ajv compiles the same keyword use once per
  // schema environment, so a schema used both as its own synchronous
  // environment and inlined into an asynchronous one is compiled twice.
  prepareKeywordCodeMode(node, async) {
    let modes = this.preparedKeywordModes.get(node);
    if (modes === undefined) {
      modes = new Set();
      this.preparedKeywordModes.set(node, modes);
    }
    if (modes.has(async)) return;
    modes.add(async);
    for (const entry of this.ajv.keywords.values()) {
      if (entry.code === undefined) continue;
      if (!keywordApplies(node, entry, this.keywordRules)) continue;
      this.codeKeyword(node, entry, undefined, undefined, async);
    }
  }

  _prepareNode(node, prefix, prefixNode, async) {
    // ajv checks the value type of every keyword rule while compiling it. The
    // meta-schemas cover the keywords their dialect declares, so this check
    // only decides schemas a laxer meta-schema leaves unconstrained: a
    // draft-06 schema, whose meta-schema does not declare `if`/`then`/`else`,
    // or any schema compiled with validateSchema off. The message and the
    // accepted types are ajv's.
    for (const keyword of CONDITION_KEYWORDS) {
      const value = node[keyword];
      if (value === undefined || typeof value === "boolean" || isObject(value)) continue;
      throw new Error(`${keyword} value must be ["object","boolean"]`);
    }

    // ajv's strictness decisions are made while the schema is compiled. They
    // are gathered here, before the rest of the compile-time checks, in the
    // order ajv reaches them.
    this.strictAnalyze(node, {
      dataTypes: [],
      defined: new Set(),
      dataLevel: 0,
      base: this.base,
      prefix,
      prefixNode,
      meta: this.meta,
      top: prefix === undefined && node === this.root,
    });

    if (typeof node.pattern === "string") this.pattern(node.pattern);
    if (isObject(node.patternProperties)) {
      for (const key of Object.keys(node.patternProperties)) this.pattern(key);
    }

    this.checkKeywordSchemaTypes(node);
    if (this.opts.$data === true) this.checkDataReferences(node);
    this.checkKeywordDeclarations(node, prefix, prefixNode, async);

    // ajv's dynamic vocabularies only accept hash-fragment references.
    for (const keyword of ["$recursiveRef", "$dynamicRef"]) {
      const ref = node[keyword];
      if (ref === undefined) continue;
      if (typeof ref !== "string" || ref[0] !== "#") {
        throw new Error(`"${keyword}" only supports hash fragment reference`);
      }
    }

    if (typeof node.$ref === "string") {
      const target = this.resolve(node.$ref, node, false);
      // ajv reports a root schema without an identifier as base `#`.
      const base = this.baseOf.get(node) || this.base;
      if (!target) throw new MissingRefError(base === "" ? "#" : base, node.$ref);
      const plan = this.refTarget(node);
      // Compile the target now, at the path ajv reports its errors from: the
      // literal $ref for an inlined schema, or the target's own root for a
      // schema compiled as a separate function.
      if (plan.inline) {
        plan.ctx.prepare(plan.node, node.$ref, plan.node, async);
      } else {
        plan.ctx.prepare(plan.node, "#", plan.node, plan.ctx.async === true);
      }
    }

    this.prepareMacros(node, async);
    // ajv compiles only the subschemas its dialect defines. A schema value
    // under a keyword owned by another dialect (or no keyword at all) is never
    // reached, so its own compile-time checks do not run either.
    const vocabulary = this.vocabulary;
    forEachSubschema(node, (child, key) => {
      const keyword = key.includes("/") ? key.slice(0, key.indexOf("/")) : key;
      if (!vocabulary.has(keyword)) return;
      this.prepare(child, prefix, prefixNode, async);
    });
  }

  // Rejects at compile time what ajv rejects while compiling a keyword whose
  // value is a data reference: a malformed pointer, and a `{$data: ""}` value
  // that ajv treats as a literal and then refuses by the keyword's schema
  // type. A registered custom keyword gets the same pointer check when its
  // definition declares data-reference support.
  checkDataReferences(node) {
    for (const [keyword, type] of DATA_KEYWORD_TYPES) {
      const value = node[keyword];
      if (!isObject(value) || !Object.prototype.hasOwnProperty.call(value, "$data")) continue;
      if (!value.$data) {
        if (type !== undefined) {
          throw new Error(`${keyword} value must be ${JSON.stringify([type])}`);
        }
        continue;
      }
      checkDataPointer(value.$data);
    }
    for (const entry of this.ajv.keywords.values()) {
      if (!entry.$data) continue;
      const value = node[entry.keyword];
      if (!isObject(value) || !value.$data) continue;
      checkDataPointer(value.$data);
    }
  }

  // ajv generates a data-reference expression while it compiles the keyword
  // that uses it, and refuses a relative pointer that names more levels up
  // than the schema's compile-time data level. The level is the same one its
  // strictness walk threads through the applicators.
  checkDataReferenceLevels(node, dataLevel) {
    const check = (value) => {
      if (!isObject(value) || !Object.prototype.hasOwnProperty.call(value, "$data")) return;
      const pointer = value.$data;
      if (typeof pointer !== "string" || pointer === "" || pointer[0] === "/") return;
      const match = RELATIVE_JSON_POINTER.exec(pointer);
      if (match === null) return;
      const up = Number(match[1]);
      if (match[2] === "#") {
        if (up >= dataLevel) {
          throw new Error(
            `Cannot access property/index ${up} levels up, current level is ${dataLevel}`,
          );
        }
      } else if (up > dataLevel) {
        throw new Error(`Cannot access data ${up} levels up, current level is ${dataLevel}`);
      }
    };
    for (const [keyword] of DATA_KEYWORD_TYPES) check(node[keyword]);
    for (const entry of this.ajv.keywords.values()) {
      if (entry.$data) check(node[entry.keyword]);
    }
  }

  // Resolves a `$ref` the way compilation does and records where its schema
  // stands: inlined at the literal reference, or compiled as its own schema
  // environment.
  refTarget(node) {
    const cached = this.refTargets.get(node);
    if (cached !== undefined) return cached;
    const target = this.resolve(node.$ref, node, false);
    if (!target) return undefined;
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
      // A schema in another environment is compiled as its own function when
      // it is that environment's root; its errors are reported relative to
      // that root, so the chain must not be followed further.
      if (finalTarget.ctx !== this && finalTarget.node === finalTarget.ctx.root) break;
      const next = finalTarget.ctx.resolve(finalTarget.node.$ref, finalTarget.node, false);
      if (!next || next.node === finalTarget.node) break;
      finalTarget = next;
    }
    const inline = typeof finalTarget.node === "boolean" || !schemaHasRef(finalTarget.node);
    const plan = {
      ctx: finalTarget.ctx,
      node: finalTarget.node,
      inline,
      // ajv reports errors from an inlined reference at the literal $ref
      // location, and errors from a separately compiled schema from its own
      // root.
      base: inline ? node.$ref : "#",
    };
    this.refTargets.set(node, plan);
    return plan;
  }

  // --- strictness ----------------------------------------------------------
  // ajv makes its strictness decisions while compiling a schema. This walk
  // reproduces that visit: the vocabulary, then the schema-type checks, then
  // every rule in the order its group runs. A diagnostic is refused, logged,
  // or ignored according to the setting that governs it. The walk also carries
  // the two pieces of context ajv threads through compilation: the types the
  // enclosing schema allows, and the property names already evaluated at this
  // data level (which `strictRequired` consults).
  strictAnalyze(node, state) {
    if (!this.strictChecks) return;
    if (this._strictSuppress) return;
    if (!isObject(node)) return;
    if (this._strictSkip.has(node)) return;
    if (this._strictSeen.has(node)) return;
    this._strictSeen.add(node);

    this.strictUnknownKeywords(node);

    const strictSchema = this.strictSchemaMode();
    if (state.top && this.opts.useDefaults && node.default !== undefined && strictSchema) {
      this.strictDiagnostic("strict mode: default is ignored in the schema root", strictSchema);
    }

    if (!state.meta) this.checkStrictTypes(node, state);
    // ajv resolves a keyword's data reference while compiling its rule, after
    // the vocabulary and strict-type checks for the schema.
    if (this.opts.$data === true) this.checkDataReferenceLevels(node, state.dataLevel);

    const groups = this.ruleGroups;
    for (const group of ["any", "number", "string", "array", "object"]) {
      for (const keyword of groups[group]) {
        if (node[keyword] === undefined) continue;
        this.strictKeyword(node, keyword, state);
      }
    }

    // A macro keyword compiles its expansion where the keyword stands, in the
    // enclosing schema's type context and under the keyword's schema path.
    for (const entry of this.ajv.keywords.values()) {
      if (entry.macro === undefined || node[entry.keyword] === undefined) continue;
      if (!keywordApplies(node, entry, this.keywordRules)) continue;
      // ajv validates a keyword's dependencies and value schema before it
      // runs the definition's macro, so an invalid value is refused before
      // the expansion it would have produced is compiled.
      this.checkKeywordUsage(node, entry, state.prefix, state.prefixNode);
      const expansion = this.expandMacro(node, entry);
      if (!isObject(expansion)) continue;
      const parentPath = this.keywordSchemaPath(node, state.prefix, state.prefixNode);
      this.strictAnalyze(expansion, {
        dataTypes: state.dataTypes.slice(),
        defined: state.defined,
        dataLevel: state.dataLevel,
        base: state.base,
        prefix: parentPath + "/" + entry.keyword,
        prefixNode: expansion,
        meta: state.meta,
        top: false,
      });
    }
  }

  // ajv's strictSchema setting refuses a schema whose vocabulary it does not
  // know, by throwing or by reporting through the logger. The comparison is
  // against the keywords the instance's dialect defines plus every registered
  // keyword, exactly ajv's rule table.
  strictUnknownKeywords(node) {
    if (!isObject(node)) return;
    const strict = this.strictSchemaMode();
    if (!strict) return;
    const known = this.knownKeywords();
    for (const key in node) {
      if (!known.has(key)) {
        this.strictDiagnostic(`strict mode: unknown keyword: "${key}"`, strict);
      }
    }
  }

  // ajv's schema-type checks: a schema nested where a narrower type is already
  // required, a union of several types, and a keyword whose rule no allowed
  // type can reach.
  checkStrictTypes(node, state) {
    if (!this.opts.strictTypes) return;
    const types = schemaTypes(node);
    if (types.length > 0) {
      if (state.dataTypes.length === 0) {
        state.dataTypes = types.slice();
      } else {
        for (const type of types) {
          if (!includesSchemaType(state.dataTypes, type)) {
            this.strictTypesError(
              node,
              state,
              `type "${type}" not allowed by context "${state.dataTypes.join(",")}"`,
            );
          }
        }
        state.dataTypes = narrowSchemaTypes(state.dataTypes, types);
      }
    }
    if (
      !this.opts.allowUnionTypes &&
      types.length > 1 &&
      !(types.length === 2 && types.includes("null"))
    ) {
      this.strictTypesError(node, state, "use allowUnionTypes to allow union type keyword");
    }
    for (const keyword of this.typeKeywordOrder) {
      if (node[keyword] === undefined) continue;
      const keywordTypes = KEYWORD_DATA_TYPES[keyword];
      if (keywordTypes === undefined) continue;
      if (!keywordTypes.some((type) => hasApplicableType(state.dataTypes, type))) {
        this.strictTypesError(
          node,
          state,
          `missing type "${keywordTypes.join(",")}" for keyword "${keyword}"`,
        );
      }
    }
    for (const entry of this.ajv.keywords.values()) {
      if (entry.types === undefined || entry.types.length === 0) continue;
      const implemented =
        entry.implements !== undefined &&
        entry.implements.some((name) => node[name] !== undefined);
      const used = node[entry.keyword] !== undefined || implemented;
      if (!used) continue;
      if (!entry.types.some((type) => hasApplicableType(state.dataTypes, type))) {
        this.strictTypesError(
          node,
          state,
          `missing type "${entry.types.join(",")}" for keyword "${entry.keyword}"`,
        );
      }
    }
  }

  strictTypesError(node, state, message) {
    this.strictDiagnostic(
      `strict mode: ${message} at "${this.strictPath(node, state)}" (strictTypes)`,
      this.opts.strictTypes,
    );
  }

  // The path ajv reports a schema-type or required-property diagnostic at: the
  // environment's base identifier followed by the path inside it.
  strictPath(node, state) {
    return state.base + this.keywordSchemaPath(node, state.prefix, state.prefixNode);
  }

  // One rule of a compiled schema node, in the order its group runs.
  strictKeyword(node, keyword, state) {
    const strictSchema = this.strictSchemaMode();
    switch (keyword) {
      case "$recursiveAnchor":
        if (node.$recursiveAnchor === false) {
          this.strictDiagnostic("strict mode: $recursiveAnchor: false is ignored", strictSchema);
        }
        return;
      case "$ref": {
        this.strictRef(node, state);
        return;
      }
      case "not":
        // A schema that is always valid is not compiled.
        if (this.strictHasRules(node.not)) {
          this.strictAnalyzeChild(node.not, state, state.dataTypes.slice());
        } else {
          this.strictSkip(node.not);
        }
        return;
      case "allOf":
      case "oneOf": {
        const list = node[keyword];
        if (Array.isArray(list)) {
          for (const item of list) {
            if (this.strictHasRules(item)) {
              this.strictAnalyzeChild(item, state, state.dataTypes.slice());
            } else {
              this.strictSkip(item);
            }
          }
        }
        return;
      }
      case "anyOf": {
        const list = node.anyOf;
        if (!Array.isArray(list)) return;
        // ajv inspects the members until one of them is always valid, and
        // compiles none of them only when the unevaluated keywords are off.
        let early = false;
        for (const item of list) {
          if (!this.strictHasRules(item)) {
            early = true;
            break;
          }
        }
        if (early && !this.opts.unevaluated) {
          for (const item of list) this.strictSkip(item);
          return;
        }
        for (const item of list) this.strictAnalyzeChild(item, state, state.dataTypes.slice());
        return;
      }
      case "if": {
        // ajv compiles the condition only when a branch carries a rule, and
        // compiles each such branch itself.
        if (node.then === undefined && node.else === undefined) {
          this.strictDiagnostic(
            'strict mode: "if" without "then" and "else" is ignored',
            strictSchema,
          );
          this.strictSkip(node.if);
          return;
        }
        const hasThen = this.strictHasRules(node.then);
        const hasElse = this.strictHasRules(node.else);
        if (!hasThen && !hasElse) {
          this.strictSkip(node.if);
          this.strictSkip(node.then);
          this.strictSkip(node.else);
          return;
        }
        this.strictAnalyzeChild(node.if, state, state.dataTypes.slice());
        if (hasThen) this.strictAnalyzeChild(node.then, state, state.dataTypes.slice());
        else this.strictSkip(node.then);
        if (hasElse) this.strictAnalyzeChild(node.else, state, state.dataTypes.slice());
        else this.strictSkip(node.else);
        return;
      }
      case "then":
      case "else":
        // The branch is compiled by the `if` rule; this rule only reports a
        // missing condition.
        if (node.if === undefined) {
          this.strictDiagnostic(`strict mode: "${keyword}" without "if" is ignored`, strictSchema);
        }
        return;
      case "format":
        this.strictCheckFormat(node, state);
        return;
      case "additionalItems":
        if (!Array.isArray(node.items)) {
          this.strictDiagnostic(
            'strict mode: "additionalItems" is ignored when "items" is not an array of schemas',
            strictSchema,
          );
          return;
        }
        if (!isObject(node.additionalItems)) return;
        if (this.strictHasRules(node.additionalItems)) {
          this.strictDescend(node.additionalItems, state);
        } else {
          this.strictSkip(node.additionalItems);
        }
        return;
      case "items":
        if (Array.isArray(node.items)) {
          if (this.opts.metaDialect === "2020") return;
          this.strictTuple(node, state, node.items, "items", "additionalItems");
          for (const item of node.items) {
            if (this.strictHasRules(item)) this.strictDescend(item, state);
            else this.strictSkip(item);
          }
          return;
        }
        if (this.strictHasRules(node.items)) this.strictDescend(node.items, state);
        else this.strictSkip(node.items);
        return;
      case "prefixItems":
        if (Array.isArray(node.prefixItems)) {
          this.strictTuple(node, state, node.prefixItems, "prefixItems", "items");
          for (const item of node.prefixItems) {
            if (this.strictHasRules(item)) this.strictDescend(item, state);
            else this.strictSkip(item);
          }
        }
        return;
      case "contains": {
        let min = 1;
        let max;
        if (this.opts.next) {
          min = node.minContains === undefined ? 1 : node.minContains;
          max = node.maxContains;
        }
        if (max === undefined && min === 0) {
          this.strictDiagnostic(
            'strict mode: "minContains" == 0 without "maxContains": "contains" keyword ignored',
            strictSchema,
          );
          this.strictSkip(node.contains);
          return;
        }
        if (max !== undefined && min > max) {
          this.strictDiagnostic(
            'strict mode: "minContains" > "maxContains" is always invalid',
            strictSchema,
          );
          this.strictSkip(node.contains);
          return;
        }
        if (this.strictHasRules(node.contains)) this.strictDescend(node.contains, state);
        else this.strictSkip(node.contains);
        return;
      }
      case "maxContains":
      case "minContains":
        if (node.contains === undefined) {
          this.strictDiagnostic(
            `strict mode: "${keyword}" without "contains" is ignored`,
            strictSchema,
          );
        }
        return;
      case "unevaluatedItems":
        if (this.strictHasRules(node.unevaluatedItems)) {
          this.strictDescend(node.unevaluatedItems, state);
        } else {
          this.strictSkip(node.unevaluatedItems);
        }
        return;
      case "required":
        this.strictRequired(node, state);
        return;
      case "propertyNames":
        // ajv compiles the name schema as a string value.
        if (this.strictHasRules(node.propertyNames)) {
          this.strictDescend(node.propertyNames, state, ["string"]);
        } else {
          this.strictSkip(node.propertyNames);
        }
        return;
      case "additionalProperties": {
        const additional = node.additionalProperties;
        // ajv inspects the value for validity first, unless it is removing
        // additional properties, and inspects an object schema once more
        // while compiling it.
        if (this.opts.removeAdditional !== "all" && !this.strictHasRules(additional)) {
          this.strictSkip(additional);
          return;
        }
        if (!isObject(additional)) return;
        if (this.strictHasRules(additional)) this.strictDescend(additional, state);
        else this.strictSkip(additional);
        return;
      }
      case "dependencies":
        if (isObject(node.dependencies)) {
          for (const name of Object.keys(node.dependencies)) {
            const dependency = node.dependencies[name];
            if (!isObject(dependency)) continue;
            if (this.strictHasRules(dependency)) {
              this.strictAnalyzeChild(dependency, state, state.dataTypes.slice());
            } else {
              this.strictSkip(dependency);
            }
          }
        }
        return;
      case "properties":
        this.strictProperties(node, state);
        return;
      case "patternProperties":
        this.strictPatternProperties(node, state);
        return;
      case "dependentSchemas":
        if (isObject(node.dependentSchemas)) {
          for (const name of Object.keys(node.dependentSchemas)) {
            const dependency = node.dependentSchemas[name];
            if (this.strictHasRules(dependency)) {
              this.strictAnalyzeChild(dependency, state, state.dataTypes.slice());
            } else {
              this.strictSkip(dependency);
            }
          }
        }
        return;
      case "unevaluatedProperties":
        if (this.strictHasRules(node.unevaluatedProperties)) {
          this.strictDescend(node.unevaluatedProperties, state);
        } else {
          this.strictSkip(node.unevaluatedProperties);
        }
        return;
      default:
        return;
    }
  }

  // A schema node ajv's compilation never reaches, though a traversal of the
  // document does.
  strictSkip(node) {
    if (isObject(node)) this._strictSkip.add(node);
  }

  strictAnalyzeChild(child, state, dataTypes, dataLevel = state.dataLevel) {
    this.strictAnalyze(child, {
      dataTypes,
      defined: state.defined,
      dataLevel,
      base: state.base,
      prefix: state.prefix,
      prefixNode: state.prefixNode,
      meta: state.meta,
      top: false,
    });
  }

  // Compiling a subschema against a deeper value re-parents the evaluated-name
  // set for the rest of this node, exactly as ajv's compilation context does.
  strictDescend(child, state, dataTypes = []) {
    state.defined = new Set();
    this.strictAnalyzeChild(child, state, dataTypes, state.dataLevel + 1);
  }

  // ajv decides whether a subschema does any validation work, and checks its
  // vocabulary while doing so (its `alwaysValidSchema`). Its answer is `false`
  // for a boolean schema `false` and for any schema with a rule; an empty
  // schema, or one with only annotations, is always valid.
  strictHasRules(schema) {
    if (typeof schema === "boolean") return !schema;
    if (!isObject(schema)) return false;
    const keys = Object.keys(schema);
    if (keys.length === 0) return false;
    this.strictUnknownKeywords(schema);
    return keys.some((key) => this.ruleKeywordSet.has(key));
  }

  strictRef(node, state) {
    const plan = this.refTarget(node);
    if (plan === undefined) return;
    if (plan.inline) {
      plan.ctx.strictAnalyze(plan.node, {
        dataTypes: [],
        defined: state.defined,
        dataLevel: state.dataLevel,
        base: state.base,
        prefix: node.$ref,
        prefixNode: plan.node,
        meta: state.meta,
        top: false,
      });
      return;
    }
    // A separately compiled schema is its own environment: fresh type context
    // and fresh evaluated names, reported from its own base identifier.
    plan.ctx.strictAnalyze(plan.node, {
      dataTypes: [],
      defined: new Set(),
      dataLevel: 0,
      base: plan.ctx.baseOf.get(plan.node) || plan.ctx.base,
      prefix: "#",
      prefixNode: plan.node,
      meta: plan.ctx.meta,
      top: false,
    });
  }

  strictTuple(node, state, list, keyword, extraItems) {
    const length = list.length;
    const fullTuple =
      length === node.minItems && (length === node.maxItems || node[extraItems] === false);
    if (fullTuple) return;
    this.strictDiagnostic(
      `strict mode: "${keyword}" is ${length}-tuple, but minItems or maxItems/${extraItems} ` +
        `are not specified or different at path ` +
        `"${this.keywordSchemaPath(node, state.prefix, state.prefixNode)}"`,
      this.opts.strictTuples,
    );
  }

  // ajv's format rule is generated in both the number and the string group, so
  // a project that reports rather than refuses sees the diagnostic twice.
  strictCheckFormat(node, state) {
    if (!this.opts.validateFormats) return;
    const format = node.format;
    if (typeof format !== "string") return;
    if (this.ajv.formats[format]) return;
    const message =
      `unknown format "${format}" ignored in schema at path ` +
      `"${this.keywordSchemaPath(node, state.prefix, state.prefixNode)}"`;
    const strict = this.strictSchemaMode();
    if (strict !== false) throw new Error(message);
    this.logger().warn(message);
  }

  strictRequired(node, state) {
    const mode = this.opts.strictRequired;
    if (!mode) return;
    if (!Array.isArray(node.required)) return;
    const props = isObject(node.properties) ? node.properties : undefined;
    const path = this.strictPath(node, state);
    for (const key of node.required) {
      if ((props !== undefined && props[key] !== undefined) || state.defined.has(key)) continue;
      this.strictDiagnostic(
        `strict mode: required property "${key}" is not defined at "${path}" (strictRequired)`,
        mode,
      );
    }
  }

  strictProperties(node, state) {
    const map = node.properties;
    if (!isObject(map)) return;
    const names = Object.keys(map).filter((name) => name !== "__proto__");
    // ajv records every declared name before it compiles any of them.
    for (const name of names) state.defined.add(name);
    const compiled = [];
    for (const name of names) {
      if (this.strictHasRules(map[name])) compiled.push(name);
      else this.strictSkip(map[name]);
    }
    for (const name of compiled) {
      // Compiling a property re-parents the evaluated-name set; ajv re-adds
      // the property it just compiled.
      state.defined = new Set();
      this.strictAnalyzeChild(map[name], state, [], state.dataLevel + 1);
      state.defined.add(name);
    }
  }

  strictPatternProperties(node, state) {
    const map = node.patternProperties;
    if (!isObject(map)) return;
    const patterns = Object.keys(map).filter((name) => name !== "__proto__");
    if (patterns.length === 0) return;
    const alwaysValid = new Map();
    for (const pattern of patterns) alwaysValid.set(pattern, !this.strictHasRules(map[pattern]));
    if (patterns.every((pattern) => alwaysValid.get(pattern)) && !this.opts.unevaluated) return;

    const strictSchema = this.strictSchemaMode();
    if (strictSchema && !this.opts.allowMatchingProperties && isObject(node.properties)) {
      const names = Object.keys(node.properties).filter((name) => name !== "__proto__");
      for (const pattern of patterns) {
        let regExp;
        try {
          regExp = new RegExp(pattern);
        } catch {
          continue;
        }
        for (const name of names) {
          if (!regExp.test(name)) continue;
          this.strictDiagnostic(
            `strict mode: property ${name} matches pattern ${pattern} ` +
              "(use allowMatchingProperties)",
            strictSchema,
          );
        }
      }
    }

    for (const pattern of patterns) {
      if (alwaysValid.get(pattern)) this.strictSkip(map[pattern]);
      else this.strictDescend(map[pattern], state);
    }
  }

  // The known-keyword set follows the owning instance's dialect and keyword
  // registry. Registration after the context was created is visible here, as
  // it is to ajv when it compiles the schema.
  knownKeywords() {
    const revision = this.ajv._keywordRevision;
    if (this._knownRevision !== revision || this._knownKeywords === null) {
      const known = new Set(vocabularyFor(this.opts));
      for (const name of this.ajv.keywords.keys()) known.add(name);
      this._knownKeywords = known;
      this._knownRevision = revision;
    }
    return this._knownKeywords;
  }

  // ajv's strictSchema falls back to the general strict setting.
  strictSchemaMode() {
    return this.opts.strictSchema !== undefined ? this.opts.strictSchema : this.opts.strict;
  }

  strictDiagnostic(message, strict) {
    if (!strict) return;
    if (strict === true) throw new Error(message);
    this.logger().warn(message);
  }

  logger() {
    return this.ajv.logger || console;
  }

  // ajv checks a registered keyword's declared schema type when it compiles
  // the keyword. The check is applied here to a data-reference-shaped value,
  // which is the literal schema value for a rule that does not declare
  // data-reference support (and for every rule while the option is off).
  checkKeywordSchemaTypes(node) {
    for (const entry of this.ajv.keywords.values()) {
      if (entry.schemaTypes === undefined || entry.schemaTypes.length === 0) continue;
      const value = node[entry.keyword];
      if (!isObject(value) || !Object.prototype.hasOwnProperty.call(value, "$data")) continue;
      if (this.opts.$data === true && entry.$data) continue;
      throw new Error(`${entry.keyword} value must be ${JSON.stringify(entry.schemaTypes)}`);
    }
  }

  // Applies the declarations a keyword definition carries beyond its rule: a
  // value schema that decides whether the keyword's value is admissible, and a
  // compile step that turns the value into the rule run on every document.
  // Both happen when the schema is compiled, in that order, exactly as ajv
  // applies them while compiling the keyword.
  checkKeywordDeclarations(node, prefix, prefixNode, async = this.async) {
    for (const entry of this.ajv.keywords.values()) {
      if (!keywordApplies(node, entry, this.keywordRules)) continue;
      this.checkKeywordUsage(node, entry, prefix, prefixNode);
      if (entry.macro === undefined && entry.compile !== undefined) {
        this.compiledKeyword(node, entry);
      }
      if (entry.code !== undefined) {
        this.codeKeyword(node, entry, prefix, prefixNode, async);
      }
    }
  }

  // ajv validates a keyword's declared dependencies and its value schema
  // before compiling its rule. Both checks carry ajv's messages.
  checkKeywordUsage(node, entry, prefix, prefixNode) {
    if (
      entry.dependencies !== undefined &&
      entry.dependencies.some((keyword) => !Object.prototype.hasOwnProperty.call(node, keyword))
    ) {
      throw new Error(
        `parent schema must have dependencies of ${entry.keyword}: ` +
          entry.dependencies.join(","),
      );
    }
    if (entry.validateSchema !== undefined) {
      this.checkKeywordValue(node, entry, prefix, prefixNode);
    }
  }

  // The schema path ajv reports a keyword error at: the node's path from the
  // root, or, for a schema inlined from another environment, the literal $ref
  // followed by the path inside the referenced schema.
  keywordSchemaPath(node, prefix, prefixNode) {
    if (prefix !== undefined) {
      let path = this.pathOf.get(node) || "";
      const rootPath = prefixNode === undefined ? "" : this.pathOf.get(prefixNode) || "";
      if (rootPath !== "") {
        if (path === rootPath) path = "";
        else if (path.startsWith(rootPath + "/")) path = path.slice(rootPath.length + 1);
      }
      return path ? prefix + "/" + path : prefix;
    }
    const path = this.pathOf.get(node);
    return path ? "#/" + path : "#";
  }

  // Rejects an inadmissible keyword value with ajv's message and path, or logs
  // it when the project asked validateSchema to log rather than throw.
  checkKeywordValue(node, entry, prefix, prefixNode) {
    const validate = entry.validateSchema;
    if (validate(node[entry.keyword])) return;
    const schemaPath = this.keywordSchemaPath(node, prefix, prefixNode);
    const message =
      `keyword "${entry.keyword}" value is invalid at path "${schemaPath}": ` +
      this.ajv.errorsText(validate.errors);
    if (this.opts.validateSchema === "log") {
      this.logger().error(message);
      return;
    }
    throw new Error(message);
  }

  // The context ajv passes to a keyword's compile function.
  keywordContext(node) {
    return {
      baseId: this.baseOf.get(node) || this.base,
      opts: this.opts,
      self: this.ajv,
      schema: node,
      root: this.root,
    };
  }

  // The validation function for a compiled keyword use. A compiled rule is
  // produced once per schema location; a keyword that supports data references
  // falls back to its validate function when the value is a reference, exactly
  // as ajv does.
  compiledKeyword(node, entry) {
    if (entry.compile === undefined) return entry.validate;
    if (
      entry.$data === true &&
      this.opts.$data === true &&
      isDataReference(node[entry.keyword])
    ) {
      if (entry.validate === undefined) {
        throw new Error(`keyword "${entry.keyword}" failed to compile`);
      }
      return entry.validate;
    }
    let cache = this.compiledKeywords.get(node);
    if (cache !== undefined) {
      const cached = cache.get(entry);
      if (cached !== undefined) return cached;
    }
    const validate = entry.compile.call(
      this.ajv,
      node[entry.keyword],
      node,
      this.keywordContext(node),
    );
    if (validate === undefined) {
      throw new Error(`keyword "${entry.keyword}" failed to compile`);
    }
    if (cache === undefined) {
      cache = new Map();
      this.compiledKeywords.set(node, cache);
    }
    cache.set(entry, validate);
    return validate;
  }

  // The generated program for a code keyword use. ajv runs the definition's
  // `code` function once per schema location, while the schema is compiled, so
  // compile-time errors and value checks surface here.
  codeKeyword(node, entry, prefix, prefixNode, async) {
    let cache = this.codeKeywords.get(node);
    if (cache !== undefined) {
      let byEntry = cache.get(entry);
      if (byEntry !== undefined) {
        const cached = byEntry.get(async === true);
        if (cached !== undefined) return cached;
      }
    }
    const path = this.pathOf.get(node) || "";
    const schemaPath =
      path === ""
        ? new Code("")
        : new Code(
            path
              .split("/")
              .map((segment) => `[${JSON.stringify(unescapeJsonPointer(segment))}]`)
              .join(""),
          );
    const runtime = compileKeywordCode(entry, node, {
      opts: this.opts,
      self: this.ajv,
      errSchemaPath: this.keywordSchemaPath(node, prefix, prefixNode),
      schemaPath,
      baseId: this.baseOf.get(node) || this.base,
      root: this.root,
      ValidationError,
      compileContext: this,
      async: async === true,
    });
    if (cache === undefined) {
      cache = new Map();
      this.codeKeywords.set(node, cache);
    }
    let byEntry = cache.get(entry);
    if (byEntry === undefined) {
      byEntry = new Map();
      cache.set(entry, byEntry);
    }
    byEntry.set(async === true, runtime);
    return runtime;
  }

  // Expands the macro keywords present on a node, the way ajv does when it
  // compiles the schema: the macro is called once per schema location, its
  // result is validated as a schema, and that schema is compiled where the
  // keyword stands. The keyword's own value stays an ordinary value.
  prepareMacros(node, async = this._prepareAsync === undefined ? this.async : this._prepareAsync) {
    for (const entry of this.ajv.keywords.values()) {
      if (entry.macro === undefined) continue;
      if (node[entry.keyword] === undefined) continue;
      this.expandMacro(node, entry, async);
    }
  }

  // Returns the schema that stands in for `node[entry.keyword]`, expanding it
  // on first use. Calls made while the context is prepared are compile-time;
  // the runtime path covers a keyword registered after the schema was added.
  expandMacro(
    node,
    entry,
    async = this._prepareAsync === undefined ? this.async : this._prepareAsync,
  ) {
    let plans = this.macroPlans.get(node);
    if (plans !== undefined) {
      const existing = plans.get(entry);
      if (existing !== undefined) return existing;
    }
    const baseId = this.baseOf.get(node) || this.base;
    const macroSchema = entry.macro.call(this.ajv, node[entry.keyword], node, {
      baseId,
      opts: this.opts,
      self: this.ajv,
    });
    if (macroSchema === undefined) {
      throw new Error(`keyword "${entry.keyword}" failed to compile`);
    }
    if (this.ajv.opts.validateSchema !== false) {
      this.ajv.validateSchema(macroSchema, true);
    }
    const schema = cloneSchema(macroSchema);
    if (plans === undefined) {
      plans = new Map();
      this.macroPlans.set(node, plans);
    }
    plans.set(entry, schema);
    // The expansion is compiled at the keyword's location: its base identifier
    // is the parent's, so references inside it resolve as in any other
    // subschema, while its errors are reported under the keyword.
    this.visit(schema, baseId, "", false);
    // The strictness walk for the expansion runs where the macro keyword
    // stands (see strictAnalyze), not as an independent schema environment.
    const suppress = this._strictSuppress;
    this._strictSuppress = true;
    try {
      this.prepare(schema, undefined, undefined, async);
    } finally {
      this._strictSuppress = suppress;
    }
    return schema;
  }

  macroPlan(node, entry) {
    const plans = this.macroPlans.get(node);
    return plans === undefined ? undefined : plans.get(entry);
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

  resolve(ref, fromNode, prepareRemote = true, async = this.async) {
    const base = this.baseOf.get(fromNode) || this.base;
    const full = normalizeId(resolveUri(base, ref));

    const local = this.lookup(full);
    if (local !== undefined) {
      if (prepareRemote) this.prepare(local, undefined, undefined, async);
      return {ctx: this, node: local};
    }

    const remote = this.ajv._lookupGlobal(full);
    if (remote) {
      if (prepareRemote) remote.ctx.prepare(remote.node, undefined, undefined, async);
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
    // A generated module has no registered formats at run time: ajv resolves a
    // format named by the document from the code the project supplied, and the
    // standalone runtime hands that map over here.
    this.dataFormats = ctx.ajv.dataFormats;
    // Custom keywords are resolved at the same point, for the same reason.
    this.keywordRules = ctx.keywordRules;
    const keywordPlan = buildKeywordPlan(ctx.ajv.keywords, ctx.opts, ctx.ajv.logger || console);
    // Keywords that follow every built-in rule of their group, and the
    // keywords that run before a particular built-in rule.
    this.keywordGroups = keywordPlan;
    this.keywordPhases = keywordPlan.phases;
    this.next = ctx.opts.next === true;
    this.unevaluated = ctx.opts.unevaluated === true;
    this.dynamic = ctx.opts.dynamicRef === true;
    this.discriminator = ctx.opts.discriminator === true;
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
    return {props: undefined, items: undefined, leaked: false};
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

  // A child's evaluated names join the enclosing schema when the child is
  // valid, or unconditionally for an applicator that folds them in regardless.
  // Names a discriminator contributed live in ajv's shared evaluated-property
  // variable, so they remain visible even when the branch that assigned them
  // failed; `leaked` carries that outcome through the enclosing applicators.
  mergeChildEvaluated(evaluated, child, merge) {
    if (!this.unevaluated || (!merge && !child.leaked)) return;
    evaluated.props = this.mergeProps(child.props, evaluated.props);
    evaluated.items = this.mergeItems(child.items, evaluated.items);
    if (child.leaked) evaluated.leaked = true;
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
    const group = this.keywordGroups.all[type];
    return group !== undefined && group.some((entry) => keywordApplies(schema, entry, this.keywordRules));
  }

  // Runs one registered custom keyword with ajv's arguments and reports its
  // failure in ajv's form. Returns false only when the keyword added errors,
  // which is how ajv decides the verdict: by the number of reported errors.
  runKeyword(entry, node, ref, state, instancePath, parentData, parentKey, schemaPath, ctx) {
    if (entry.code !== undefined) {
      return this.runCodeKeyword(
        entry,
        node,
        ref,
        state,
        instancePath,
        parentData,
        parentKey,
        schemaPath,
        ctx,
      );
    }
    if (entry.macro !== undefined) {
      return this.runMacro(
        entry,
        node,
        ref,
        state,
        instancePath,
        parentData,
        parentKey,
        schemaPath,
        ctx,
      );
    }
    const data = ref.value;
    const dataCxt = {
      instancePath,
      parentData,
      parentDataProperty: parentKey,
      rootData: state.rootData,
    };
    // A rule that declares data-reference support receives the value the
    // reference resolves to; an absent location leaves the keyword passing,
    // and a resolved value the keyword cannot use — the wrong declared type,
    // or a value its own value schema rejects — is ajv's $data error.
    let schemaValue = node[entry.keyword];
    const usesDataReference =
      entry.$data === true && ctx.opts.$data === true && isDataReference(schemaValue);
    if (usesDataReference) {
      const resolved = resolveDataReference(schemaValue.$data, ref, state.rootData);
      if (resolved === undefined) return true;
      const wrongType =
        entry.schemaTypes.length > 0 &&
        !checkDataTypes(entry.schemaTypes, resolved, ctx.opts.strictNumbers);
      if (
        wrongType ||
        (entry.validateSchema !== undefined && !entry.validateSchema(resolved))
      ) {
        reportDataKeyword(state, instancePath, schemaPath, entry, node, data);
        return false;
      }
      schemaValue = resolved;
    }
    // A compiled rule replaces the definition's validate function for a
    // literal value and receives only the data, as ajv calls it.
    const compiled = entry.compile !== undefined && !usesDataReference;
    const validate = compiled ? ctx.compiledKeyword(node, entry) : entry.validate;
    const passSchema = compiled ? false : entry.passSchema;
    if (entry.inspectErrors) validate.errors = null;
    const ruleThis = ctx.opts.passContext ? state.callerContext : this.ctx.ajv;
    const passed = passSchema
      ? validate.call(ruleThis, schemaValue, data, node, dataCxt)
      : validate.call(ruleThis, data, dataCxt);
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
          if (state.verbose) {
            error.schema = node[entry.keyword];
            error.data = ref.value;
          }
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
      {schema: node[entry.keyword], parentSchema: node, data: ref.value},
    );
    return false;
  }

  // Runs a keyword that contributes generated validation code. The program was
  // produced when the schema was compiled; here it receives the current value
  // and a reporter that appends ajv's error entries. The program decides the
  // verdict, exactly as ajv's generated code does by the number of errors it
  // reports.
  runCodeKeyword(entry, node, ref, state, instancePath, parentData, parentKey, schemaPath, ctx) {
    const data = ref.value;
    let schemaValue = node[entry.keyword];
    const usesDataReference =
      entry.$data === true && ctx.opts.$data === true && isDataReference(schemaValue);
    if (usesDataReference) {
      const resolved = resolveDataReference(schemaValue.$data, ref, state.rootData);
      if (resolved === undefined) return true;
      // ajv only checks a document-sourced value where the keyword's generated
      // code asks it to: `fail$data` folds the check into its condition, and
      // `block$data` reports the definition's `$dataError`. The value is passed
      // through here.
      schemaValue = resolved;
    }
    const runtime = ctx.codeKeyword(node, entry, undefined, undefined, state.codeAsync);
    const errors = [];
    const report = (currentData, params, message, append, instancePathOverride, schemaPathOverride, parentSchemaOnly) => {
      let errorInstancePath = instancePath;
      if (instancePathOverride !== undefined && instancePathOverride !== null) {
        errorInstancePath =
          instancePath + "/" + String(instancePathOverride).replace(/~/g, "~0").replace(/\//g, "~1");
      }
      let errorSchemaPath = parentSchemaOnly
        ? schemaPath
        : schemaPath + "/" + entry.keyword;
      if (schemaPathOverride !== undefined && schemaPathOverride !== null) {
        errorSchemaPath =
          errorSchemaPath + "/" + String(schemaPathOverride).replace(/~/g, "~0").replace(/\//g, "~1");
      }
      const error = {
        instancePath: errorInstancePath,
        schemaPath: errorSchemaPath,
        keyword: entry.keyword,
        params: params || {},
      };
      if (state.messages && message !== undefined) error.message = message;
      if (state.verbose) {
        error.schema = node[entry.keyword];
        error.parentSchema = node;
        error.data = currentData;
      }
      if (state.propertyName !== undefined) error.propertyName = state.propertyName;
      errors.push(error);
      // ajv's generated program returns the current entry when default
      // reporting ends the keyword, and the entries accumulated by an
      // appending report; with all errors enabled it keeps going.
      if (state.allErrors) return false;
      return append === true ? errors.slice() : [error];
    };
    const subschema = (index, value, propertyName, instanceSuffix) => {
      const plan = runtime.subschemas[index];
      const childInstancePath =
        instanceSuffix === undefined
          ? instancePath
          : instancePath +
            "/" +
            String(instanceSuffix).replace(/~/g, "~0").replace(/\//g, "~1");
      const child = {
        errs: errors,
        allErrors: state.allErrors,
        messages: state.messages,
        verbose: state.verbose,
        propertyName: propertyName === undefined ? state.propertyName : propertyName,
        rootData: state.rootData,
        callerContext: state.callerContext,
        dynamicAnchors: state.dynamicAnchors,
        evaluated: this.newEvaluated(),
        abortToken: state.abortToken,
        env: {ctx: plan.context, node: plan.schema},
        // A subschema compiled at the keyword's location belongs to the same
        // generated program, so it keeps the environment's async mode.
        codeAsync: state.codeAsync,
      };
      const merge = (ok) => {
        // The discriminator merges the selected branch's evaluated names even
        // when that branch rejects, exactly as ajv folds them in at compile time.
        if (runtime.mergeEvaluated) {
          child.evaluated.leaked = true;
          this.mergeChildEvaluated(state.evaluated, child.evaluated, true);
        }
        return ok;
      };
      if (runtime.async) {
        return this.runRefAsync(
          plan.schema,
          {value},
          plan.context,
          child,
          childInstancePath,
          undefined,
          undefined,
          plan.schemaPath,
          plan.compositeRule,
        ).then(merge);
      }
      return merge(
        this.runRef(
          plan.schema,
          {value},
          plan.context,
          child,
          childInstancePath,
          undefined,
          undefined,
          plan.schemaPath,
          plan.compositeRule,
        ),
      );
    };
    const finish = (returned) => {
      const produced = Array.isArray(returned) ? returned : errors;
      // A code keyword's program can rewrite the document in place: ajv's
      // generated code assigns the new value back into its container, and the
      // following rules read the same rewritten variable. The interpreter
      // refreshes its reference here so those rules observe the new value.
      if (parentData !== undefined) ref.value = parentData[parentKey];
      if (produced.length === 0) return true;
      if (state.errs) {
        for (const error of produced) state.errs.push(error);
      }
      return false;
    };
    const returned = runtime.run(
      data,
      schemaValue,
      parentData,
      parentKey,
      state.rootData,
      errors,
      report,
      subschema,
      ref,
    );
    return runtime.async ? returned.then(finish) : finish(returned);
  }

  // A macro keyword validates with the schema the macro returned, compiled at
  // the keyword's location as a composite rule: the expansion's own errors are
  // reported first, then ajv's entry for the keyword itself.
  runMacro(entry, node, ref, state, instancePath, parentData, parentKey, schemaPath, ctx) {
    const macroSchema = ctx.macroPlan(node, entry) || ctx.expandMacro(node, entry);
    const child = {
      errs: state.errs,
      allErrors: state.allErrors,
      messages: state.messages,
      verbose: state.verbose,
      propertyName: state.propertyName,
      rootData: state.rootData,
      callerContext: state.callerContext,
      dynamicAnchors: state.dynamicAnchors,
      evaluated: this.newEvaluated(),
      abortToken: state.abortToken,
      env: state.env,
    };
    const ok = this.runRef(
      macroSchema,
      ref,
      ctx,
      child,
      instancePath,
      parentData,
      parentKey,
      schemaPath + "/" + entry.keyword,
      true,
    );
    if (ok) return true;
    addError(
      state,
      instancePath,
      schemaPath,
      entry.keyword,
      {},
      `must pass "${entry.keyword}" keyword validation`,
      {schema: node[entry.keyword], parentSchema: node, data: ref.value},
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

  // ajv's strictSchema setting decides whether an unresolved format name is a
  // failure; it falls back to the general strict setting.
  strictSchemaEnabled() {
    const opts = this.ctx.opts;
    const strict = opts.strictSchema !== undefined ? opts.strictSchema : opts.strict;
    return strict !== false;
  }

  // The format rule when its name comes from a data reference. An unknown name
  // fails under strict mode, as ajv's generated rule reports it; otherwise a
  // definition only applies to the data type it declares.
  formatDataFails(formatName, data, ruleType) {
    const formats = this.dataFormats === undefined ? this.formats : this.dataFormats;
    const formatDef = formats[formatName];
    let formatType = "string";
    let check = formatDef;
    if (typeof formatDef === "object" && formatDef !== null && !(formatDef instanceof RegExp)) {
      formatType = formatDef.type || "string";
      check = formatDef.validate;
    }
    if (this.strictSchemaEnabled() && formatName && !check) return true;
    if (!check || check === true) return false;
    if (formatType !== ruleType) return false;
    return !(typeof check === "function" ? check(data) : check.test(data));
  }

  run(node, data, ctx, errs, instancePath, callerContext) {
    return this.runRef(
      node,
      {value: data},
      ctx,
      {
        errs,
        allErrors: ctx.opts.allErrors,
        messages: ctx.opts.messages !== false,
        verbose: ctx.opts.verbose === true,
        propertyName: undefined,
        rootData: data,
        callerContext,
        dynamicAnchors: this.dynamic ? {} : undefined,
        evaluated: this.newEvaluated(),
        abortToken: {aborted: false},
        env: {ctx, node},
        // Whether the generated program that contains this keyword is async.
        codeAsync: false,
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
      addError(state, instancePath, schemaPath, "false schema", {}, "boolean schema is false", {
        schema: false,
        parentSchema: false,
        data: ref.value,
      });
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
      messages: state.messages,
      verbose: state.verbose,
      propertyName,
      rootData: state.rootData,
      callerContext: state.callerContext,
      dynamicAnchors: state.dynamicAnchors,
      evaluated: this.newEvaluated(),
      abortToken: state.abortToken,
      env: state.env,
      codeAsync: state.codeAsync,
    });
    const fail = (keyword, params, message, childSchemaPath = schemaPath, childInstancePath = instancePath) => {
      addError(state, childInstancePath, childSchemaPath, keyword, params, message, {
        schema: node[keyword],
        parentSchema: node,
        data,
      });
      valid = false;
      // In default reporting a keyword failure returns from the compiled
      // validation function; nested `if` clauses use this to decide whether
      // ajv's own failure entry is reachable.
      if (!allErrors && !composite) state.abortToken.aborted = true;
    };
    // A keyword value that is a data reference names a location in the
    // document instead of holding a literal value; `undefined` means literal.
    const dataEnabled = opts.$data === true;
    // Runs one group of registered custom keywords in ajv's order. Returns
    // false only when the first failure ends validation (default reporting).
    const runKeywords = (defs) => {
      for (const entry of defs) {
        if (!keywordApplies(node, entry, this.keywordRules)) continue;
        if (
          !this.runKeyword(
            entry,
            node,
            ref,
            state,
            instancePath,
            parentData,
            parentKey,
            schemaPath,
            ctx,
          )
        ) {
          if (!allErrors && !composite) state.abortToken.aborted = true;
          if (!allErrors) return false;
          valid = false;
        }
        data = ref.value;
      }
      return true;
    };
    // Runs the keywords a definition placed before one of the group's built-in
    // rules, at the point that rule runs.
    const runPhase = (group, slot) => {
      const phases = this.keywordPhases[group];
      const entries = phases === undefined ? undefined : phases.get(slot);
      return entries === undefined ? true : runKeywords(entries);
    };

    if (!runPhase("any", "start")) return false;
    if (!runPhase("any", "type")) return false;

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

    if (!runPhase("any", "dynref")) return false;
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

    if (!runPhase("any", "ref")) return false;
    if (typeof node.$ref === "string") {
      const target = ctx.refTargets.get(node);
      const child = childState();
      if (!target.inline) {
        child.env = {ctx: target.ctx, node: target.node};
        // A separately compiled schema is its own generated function, so its
        // async mode decides whether its code keywords may await.
        child.codeAsync = target.ctx.async === true;
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

    if (!runPhase("any", "const")) return false;
    if (Object.prototype.hasOwnProperty.call(node, "const")) {
      const constRef = (dataEnabled ? dataPointer(node.const) : undefined);
      if (constRef !== undefined) {
        const allowed = resolveDataReference(constRef, ref, state.rootData);
        if (allowed !== undefined && !deepEqual(data, allowed)) {
          fail("const", {allowedValue: allowed}, "must be equal to constant");
          if (!allErrors) return false;
        }
      } else if (!deepEqual(data, node.const)) {
        fail("const", {allowedValue: node.const}, "must be equal to constant");
        if (!allErrors) return false;
      }
    }

    if (!runPhase("any", "enum")) return false;
    if (node.enum !== undefined) {
      const enumRef = (dataEnabled ? dataPointer(node.enum) : undefined);
      const allowedValues = enumRef !== undefined ? resolveDataReference(enumRef, ref, state.rootData) : node.enum;
      if (allowedValues !== undefined) {
        let found = false;
        if (!Array.isArray(allowedValues)) {
          // ajv reports the reference's type error, then still reports the
          // enum's own failure with the resolved value when collecting all.
          reportDataReference(state, instancePath, schemaPath, "enum", ["array"], node, data);
          valid = false;
          if (!allErrors && !composite) state.abortToken.aborted = true;
          if (!allErrors) return false;
        } else {
          for (const allowed of allowedValues) {
            if (deepEqual(data, allowed)) {
              found = true;
              break;
            }
          }
        }
        if (!found) {
          fail("enum", {allowedValues}, "must be equal to one of the allowed values");
          if (!allErrors) return false;
        }
      }
    }

    if (!runPhase("any", "not")) return false;
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

    if (!runPhase("any", "anyOf")) return false;
    if (Array.isArray(node.anyOf)) {
      const anyOfPath = schemaPath + "/anyOf";
      const alwaysValidBranch = node.anyOf.some((schema) => alwaysValidSchema(schema, this.keywordRules));
      if (!alwaysValidBranch || this.unevaluated) {
        const start = state.errs ? state.errs.length : 0;
        let matched = false;
        let claimed = false;
        for (let i = 0; i < node.anyOf.length; i++) {
          if (
            this.discriminator &&
            this.unevaluated &&
            this.staticEvaluated(node.anyOf[i], ctx).props !== undefined
          ) {
            claimed = true;
          }
          const wasClaimed = claimed;
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
            if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
            if (!this.unevaluated) break;
          } else if (!wasClaimed) {
            this.mergeChildEvaluated(evaluated, child.evaluated, false);
            if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
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

    if (!runPhase("any", "oneOf")) return false;
    // A schema carrying the annotation leaves oneOf to the discriminator
    // keyword, which validates only the branch its tag selects.
    if (Array.isArray(node.oneOf) && !(this.discriminator && node.discriminator)) {
      const oneOfPath = schemaPath + "/oneOf";
      const start = state.errs ? state.errs.length : 0;
      let matched = false;
      let passing = null;
      let claimed = false;
      for (let i = 0; i < node.oneOf.length; i++) {
        if (
          this.discriminator &&
          this.unevaluated &&
          this.staticEvaluated(node.oneOf[i], ctx).props !== undefined
        ) {
          claimed = true;
        }
        const wasClaimed = claimed;
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
            if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
          } else if (!wasClaimed) {
            this.mergeChildEvaluated(evaluated, child.evaluated, false);
            if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
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
          if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
        } else if (!wasClaimed) {
          this.mergeChildEvaluated(evaluated, child.evaluated, false);
          if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
        }
      }
      if (matched) {
        if (state.errs) state.errs.length = start;
      } else {
        fail("oneOf", {passingSchemas: passing}, "must match exactly one schema in oneOf");
        if (!allErrors) return false;
      }
    }

    if (!runPhase("any", "allOf")) return false;
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

    if (!runPhase("any", "if")) return false;
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
            thenOk = clauseOk || child.evaluated.leaked;
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
          elseOk = clauseOk || child.evaluated.leaked;
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
        if (ifChild.evaluated.leaked || (testOk ? thenEval.leaked : elseEval.leaked)) {
          evaluated.leaked = true;
        }
        if (!clauseOk) {
          valid = false;
          // ajv appends its own "if" entry after a clause failure that did
          // not already return from the compiled function; a failure coming
          // from a reference call is reachable, an inline keyword failure is
          // not.
          if (allErrors || composite || !state.abortToken.aborted) {
            addError(
              state,
              instancePath,
              schemaPath,
              "if",
              {failingKeyword: clause},
              `must match "${clause}" schema`,
              {schema: node.if, parentSchema: node, data},
            );
            if (!allErrors && !composite) state.abortToken.aborted = true;
          }
          if (!allErrors) return false;
        }
      }
    }

    // The rules ajv leaves after `then` and `else` in the untyped group.
    if (!runPhase("any", "ifEnd")) return false;

    // Registered keywords declared for no particular type form ajv's untyped
    // rule group: they run after the standard untyped rules and before every
    // typed group.
    if (!runKeywords(this.keywordGroups.any)) return false;

    // ajv guards every keyword group after the untyped one by the error count,
    // so an error reported by an untyped keyword suppresses the typed groups.
    if (!allErrors && state.errs && state.errs.length > errorsAtStart) return false;

    if (checkDataType("number", data, opts.strictNumbers)) {
      if (!runPhase("number", "maximum")) return false;
      const maximumRef = (dataEnabled ? dataPointer(node.maximum) : undefined);
      if (maximumRef !== undefined) {
        const limit = resolveDataReference(maximumRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data > limit || isNaN(data))) {
          fail("maximum", {comparison: "<=", limit}, `must be <= ${limit}`);
          if (!allErrors) return false;
        }
      } else if (typeof node.maximum === "number") {
        if (data > node.maximum || isNaN(data)) {
          fail("maximum", {comparison: "<=", limit: node.maximum}, `must be <= ${node.maximum}`);
          if (!allErrors) return false;
        }
      }
      if (!runPhase("number", "minimum")) return false;
      const minimumRef = (dataEnabled ? dataPointer(node.minimum) : undefined);
      if (minimumRef !== undefined) {
        const limit = resolveDataReference(minimumRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data < limit || isNaN(data))) {
          fail("minimum", {comparison: ">=", limit}, `must be >= ${limit}`);
          if (!allErrors) return false;
        }
      } else if (typeof node.minimum === "number") {
        if (data < node.minimum || isNaN(data)) {
          fail("minimum", {comparison: ">=", limit: node.minimum}, `must be >= ${node.minimum}`);
          if (!allErrors) return false;
        }
      }
      if (!runPhase("number", "exclusiveMaximum")) return false;
      const exclusiveMaximumRef = (dataEnabled ? dataPointer(node.exclusiveMaximum) : undefined);
      if (exclusiveMaximumRef !== undefined) {
        const limit = resolveDataReference(exclusiveMaximumRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data >= limit || isNaN(data))) {
          fail("exclusiveMaximum", {comparison: "<", limit}, `must be < ${limit}`);
          if (!allErrors) return false;
        }
      } else if (typeof node.exclusiveMaximum === "number") {
        if (data >= node.exclusiveMaximum || isNaN(data)) {
          fail(
            "exclusiveMaximum",
            {comparison: "<", limit: node.exclusiveMaximum},
            `must be < ${node.exclusiveMaximum}`,
          );
          if (!allErrors) return false;
        }
      }
      if (!runPhase("number", "exclusiveMinimum")) return false;
      const exclusiveMinimumRef = (dataEnabled ? dataPointer(node.exclusiveMinimum) : undefined);
      if (exclusiveMinimumRef !== undefined) {
        const limit = resolveDataReference(exclusiveMinimumRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data <= limit || isNaN(data))) {
          fail("exclusiveMinimum", {comparison: ">", limit}, `must be > ${limit}`);
          if (!allErrors) return false;
        }
      } else if (typeof node.exclusiveMinimum === "number") {
        if (data <= node.exclusiveMinimum || isNaN(data)) {
          fail(
            "exclusiveMinimum",
            {comparison: ">", limit: node.exclusiveMinimum},
            `must be > ${node.exclusiveMinimum}`,
          );
          if (!allErrors) return false;
        }
      }
      if (!runPhase("number", "multipleOf")) return false;
      const multipleOfRef = (dataEnabled ? dataPointer(node.multipleOf) : undefined);
      if (multipleOfRef !== undefined) {
        const multipleOf = resolveDataReference(multipleOfRef, ref, state.rootData);
        if (multipleOf !== undefined) {
          const quotient = data / multipleOf;
          const precision = opts.multipleOfPrecision;
          const invalid = precision
            ? Math.abs(Math.round(quotient) - quotient) > Math.pow(10, -precision)
            : quotient !== parseInt(quotient);
          if (!checkDataTypes(["number"], multipleOf, opts.strictNumbers) || multipleOf === 0 || invalid) {
            fail("multipleOf", {multipleOf}, `must be multiple of ${multipleOf}`);
            if (!allErrors) return false;
          }
        }
      } else if (typeof node.multipleOf === "number") {
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
      if (!runPhase("number", "format")) return false;
      const formatRef = (dataEnabled ? dataPointer(node.format) : undefined);
      if (formatRef !== undefined && opts.validateFormats) {
        const formatName = resolveDataReference(formatRef, ref, state.rootData);
        if (
          formatName !== undefined &&
          (!checkDataTypes(["string"], formatName, opts.strictNumbers) || this.formatDataFails(formatName, data, "number"))
        ) {
          fail("format", {format: formatName}, `must match format "${formatName}"`);
          if (!allErrors) return false;
        }
      } else if (typeof node.format === "string" && opts.validateFormats) {
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
      if (!runPhase("string", "maxLength")) return false;
      const maxLengthRef = (dataEnabled ? dataPointer(node.maxLength) : undefined);
      if (maxLengthRef !== undefined) {
        const limit = resolveDataReference(maxLengthRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || ucs2length(data) > limit)) {
          fail("maxLength", {limit}, `must NOT have more than ${limit} characters`);
          if (!allErrors) return false;
        }
      } else if (typeof node.maxLength === "number" && ucs2length(data) > node.maxLength) {
        fail("maxLength", {limit: node.maxLength}, `must NOT have more than ${node.maxLength} characters`);
        if (!allErrors) return false;
      }
      if (!runPhase("string", "minLength")) return false;
      const minLengthRef = (dataEnabled ? dataPointer(node.minLength) : undefined);
      if (minLengthRef !== undefined) {
        const limit = resolveDataReference(minLengthRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || ucs2length(data) < limit)) {
          fail("minLength", {limit}, `must NOT have fewer than ${limit} characters`);
          if (!allErrors) return false;
        }
      } else if (typeof node.minLength === "number" && ucs2length(data) < node.minLength) {
        fail("minLength", {limit: node.minLength}, `must NOT have fewer than ${node.minLength} characters`);
        if (!allErrors) return false;
      }
      if (!runPhase("string", "pattern")) return false;
      const patternRef = (dataEnabled ? dataPointer(node.pattern) : undefined);
      if (patternRef !== undefined) {
        const pattern = resolveDataReference(patternRef, ref, state.rootData);
        if (pattern !== undefined) {
          let matches = false;
          try {
            matches = ctx.pattern(pattern).test(data);
          } catch {
            matches = false;
          }
          if (!checkDataTypes(["string"], pattern, opts.strictNumbers) || !matches) {
            fail("pattern", {pattern}, `must match pattern "${pattern}"`);
            if (!allErrors) return false;
          }
        }
      } else if (typeof node.pattern === "string" && !ctx.pattern(node.pattern).test(data)) {
        fail("pattern", {pattern: node.pattern}, `must match pattern "${node.pattern}"`);
        if (!allErrors) return false;
      }
      if (!runPhase("string", "format")) return false;
      const formatRef = (dataEnabled ? dataPointer(node.format) : undefined);
      if (formatRef !== undefined && opts.validateFormats) {
        const formatName = resolveDataReference(formatRef, ref, state.rootData);
        if (
          formatName !== undefined &&
          (!checkDataTypes(["string"], formatName, opts.strictNumbers) || this.formatDataFails(formatName, data, "string"))
        ) {
          fail("format", {format: formatName}, `must match format "${formatName}"`);
          if (!allErrors) return false;
        }
      } else if (typeof node.format === "string" && opts.validateFormats) {
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
      if (!runPhase("array", "maxItems")) return false;
      const maxItemsRef = (dataEnabled ? dataPointer(node.maxItems) : undefined);
      if (maxItemsRef !== undefined) {
        const limit = resolveDataReference(maxItemsRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data.length > limit)) {
          fail("maxItems", {limit}, `must NOT have more than ${limit} items`);
          if (!allErrors) return false;
        }
      } else if (typeof node.maxItems === "number" && data.length > node.maxItems) {
        fail("maxItems", {limit: node.maxItems}, `must NOT have more than ${node.maxItems} items`);
        if (!allErrors) return false;
      }
      if (!runPhase("array", "minItems")) return false;
      const minItemsRef = (dataEnabled ? dataPointer(node.minItems) : undefined);
      if (minItemsRef !== undefined) {
        const limit = resolveDataReference(minItemsRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data.length < limit)) {
          fail("minItems", {limit}, `must NOT have fewer than ${limit} items`);
          if (!allErrors) return false;
        }
      } else if (typeof node.minItems === "number" && data.length < node.minItems) {
        fail("minItems", {limit: node.minItems}, `must NOT have fewer than ${node.minItems} items`);
        if (!allErrors) return false;
      }
      // `prefixItems` exists only in the 2020-12 array group and
      // `additionalItems` only in the older one, so the two placements never
      // both apply to the same schema.
      if (!runPhase("array", "prefixItems")) return false;
      if (!runPhase("array", "additionalItems")) return false;
      if (this.draft2020) {
        const prefix = Array.isArray(node.prefixItems) ? node.prefixItems : undefined;
        if (prefix !== undefined) {
          const limit = Math.min(prefix.length, data.length);
          for (let i = 0; i < limit; i++) {
            if (alwaysValidSchema(prefix[i], this.keywordRules)) continue;
            if (
              !this.runRef(
                prefix[i],
                {value: data[i], parent: ref, key: i},
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
        if (!runPhase("array", "items")) return false;
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
                    {value: data[i], parent: ref, key: i},
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
                  {value: data[i], parent: ref, key: i},
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
                  {value: data[i], parent: ref, key: i},
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
        if (!runPhase("array", "items")) return false;
        if (node.items !== undefined) {
          const items = node.items;
          if (Array.isArray(items)) {
            const limit = Math.min(items.length, data.length);
            for (let i = 0; i < limit; i++) {
              if (alwaysValidSchema(items[i], this.keywordRules)) continue;
              if (
                !this.runRef(
                  items[i],
                  {value: data[i], parent: ref, key: i},
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
                  {value: data[i], parent: ref, key: i},
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
      if (!runPhase("array", "contains")) return false;
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
                {value: data[i], parent: ref, key: i},
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
              {value: data[i], parent: ref, key: i},
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
      if (!runPhase("array", "uniqueItems")) return false;
      const uniqueItemsRef = (dataEnabled ? dataPointer(node.uniqueItems) : undefined);
      let uniqueItemsEnabled = node.uniqueItems === true;
      if (uniqueItemsRef !== undefined) {
        const uniqueValue = resolveDataReference(uniqueItemsRef, ref, state.rootData);
        if (uniqueValue === undefined || uniqueValue === false) {
          uniqueItemsEnabled = false;
        } else if (typeof uniqueValue !== "boolean") {
          reportDataReference(state, instancePath, schemaPath, "uniqueItems", ["boolean"], node, data);
          valid = false;
          if (!allErrors && !composite) state.abortToken.aborted = true;
          if (!allErrors) return false;
          uniqueItemsEnabled = false;
        } else {
          uniqueItemsEnabled = true;
        }
      }
      if (uniqueItemsEnabled && data.length > 1) {
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
      // `maxContains` and `minContains` are annotations consumed by
      // `contains`; their rules follow `uniqueItems`.
      if (!runPhase("array", "containsEnd")) return false;
      if (!runPhase("array", "unevaluatedItems")) return false;
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
                {value: data[i], parent: ref, key: i},
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
      if (!runPhase("object", "maxProperties")) return false;
      const keys = Object.keys(data);
      const maxPropertiesRef = (dataEnabled ? dataPointer(node.maxProperties) : undefined);
      if (maxPropertiesRef !== undefined) {
        const limit = resolveDataReference(maxPropertiesRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || keys.length > limit)) {
          fail("maxProperties", {limit}, `must NOT have more than ${limit} properties`);
          if (!allErrors) return false;
        }
      } else if (typeof node.maxProperties === "number" && keys.length > node.maxProperties) {
        fail("maxProperties", {limit: node.maxProperties}, `must NOT have more than ${node.maxProperties} properties`);
        if (!allErrors) return false;
      }
      if (!runPhase("object", "minProperties")) return false;
      const minPropertiesRef = (dataEnabled ? dataPointer(node.minProperties) : undefined);
      if (minPropertiesRef !== undefined) {
        const limit = resolveDataReference(minPropertiesRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || keys.length < limit)) {
          fail("minProperties", {limit}, `must NOT have fewer than ${limit} properties`);
          if (!allErrors) return false;
        }
      } else if (typeof node.minProperties === "number" && keys.length < node.minProperties) {
        fail("minProperties", {limit: node.minProperties}, `must NOT have fewer than ${node.minProperties} properties`);
        if (!allErrors) return false;
      }
      if (!runPhase("object", "required")) return false;
      const requiredRef = (dataEnabled ? dataPointer(node.required) : undefined);
      if (requiredRef !== undefined) {
        const requiredValues = resolveDataReference(requiredRef, ref, state.rootData);
        if (requiredValues !== undefined) {
          if (!Array.isArray(requiredValues)) {
            reportDataReference(state, instancePath, schemaPath, "required", ["array"], node, data);
            valid = false;
            if (!allErrors && !composite) state.abortToken.aborted = true;
            if (!allErrors) return false;
          } else {
            for (const required of requiredValues) {
              if (noPropertyInData(data, required, ownProperties)) {
                fail("required", {missingProperty: required}, `must have required property '${required}'`);
                if (!allErrors) return false;
              }
            }
          }
        }
      } else if (Array.isArray(node.required)) {
        for (const required of node.required) {
          if (noPropertyInData(data, required, ownProperties)) {
            fail("required", {missingProperty: required}, `must have required property '${required}'`);
            if (!allErrors) return false;
          }
        }
      }

      if (!runPhase("object", "propertyNames")) return false;
      if (node.propertyNames !== undefined && !alwaysValidSchema(node.propertyNames, this.keywordRules)) {
        for (const key of enumerableKeys(data)) {
          const ok = this.runRef(
            node.propertyNames,
            {value: key, parent: ref},
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
              {schema: node.propertyNames, parentSchema: node, data},
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
      if (!runPhase("object", "additionalProperties")) return false;
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
                  {value: data[key], parent: ref, key},
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
                {value: data[key], parent: ref, key},
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

      if (!runPhase("object", "dependencies")) return false;
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
            // ajv replaces the enclosing evaluated-property set with the
            // schema dependency's local set. When the dependency fails, that
            // local set is empty, so names evaluated before this keyword stop
            // counting; reproduce that here rather than keeping the outer set.
            if (this.unevaluated && child.evaluated.props !== undefined) {
              evaluated.props = undefined;
            }
            if (!allErrors) return false;
            valid = false;
          }
        }
      }

      if (!runPhase("object", "properties")) return false;
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
              {value: data[property], parent: ref, key: property},
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

      if (!runPhase("object", "patternProperties")) return false;
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
                {value: data[key], parent: ref, key},
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
      if (!runPhase("object", "dependentRequired")) return false;
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

      if (!runPhase("object", "dependentSchemas")) return false;
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
            // ajv replaces the enclosing evaluated-property set with the
            // schema dependency's local set. When the dependency fails, that
            // local set is empty, so names evaluated before this keyword stop
            // counting; reproduce that here rather than keeping the outer set.
            if (this.unevaluated && child.evaluated.props !== undefined) {
              evaluated.props = undefined;
            }
            if (!allErrors) return false;
            valid = false;
          }
        }
      }

      if (!runPhase("object", "unevaluatedProperties")) return false;
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
                  {value: data[key], parent: ref, key},
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

    // Keywords a definition declared `post` run after every group.
    if (!runKeywords(this.keywordGroups.post)) return false;

    return valid;
  }

  // The asynchronous counterpart of run/runRef. It mirrors the synchronous
  // traversal rule for rule, awaiting the asynchronous rules and formats ajv
  // allows in a `$async: true` schema, and returns the possibly coerced or
  // modified root data the way ajv's asynchronous validators resolve.
  async runAsync(node, data, ctx, errs, instancePath, callerContext) {
    const ref = {value: data};
    const state = {
      errs,
      allErrors: ctx.opts.allErrors,
      messages: ctx.opts.messages !== false,
      verbose: ctx.opts.verbose === true,
      propertyName: undefined,
      rootData: data,
      callerContext,
      dynamicAnchors: this.dynamic ? {} : undefined,
      evaluated: this.newEvaluated(),
      abortToken: {aborted: false},
      env: {ctx, node},
      // The root generated program of an asynchronous environment is async,
      // so a code keyword's generated program may await.
      codeAsync: true,
    };
    const valid = await this.runRefAsync(node, ref, ctx, state, instancePath, undefined, undefined, "#", false);
    return {valid, data: ref.value};
  }

  // Runs an asynchronous custom keyword. ajv calls the rule with the same
  // arguments as a synchronous one, awaits its result, and only takes error
  // objects from a rejected ValidationError; a plain rejection propagates. A
  // macro runs its expansion in the same asynchronous environment.
  async runKeywordAsync(
    entry,
    node,
    ref,
    state,
    instancePath,
    parentData,
    parentKey,
    schemaPath,
    ctx,
  ) {
    if (entry.code !== undefined) {
      return this.runCodeKeyword(
        entry,
        node,
        ref,
        state,
        instancePath,
        parentData,
        parentKey,
        schemaPath,
        ctx,
      );
    }
    if (entry.macro !== undefined) {
      return this.runMacroAsync(
        entry,
        node,
        ref,
        state,
        instancePath,
        parentData,
        parentKey,
        schemaPath,
        ctx,
      );
    }
    const data = ref.value;
    const dataCxt = {
      instancePath,
      parentData,
      parentDataProperty: parentKey,
      rootData: state.rootData,
    };
    let schemaValue = node[entry.keyword];
    const usesDataReference =
      entry.$data === true && ctx.opts.$data === true && isDataReference(schemaValue);
    if (usesDataReference) {
      const resolved = resolveDataReference(schemaValue.$data, ref, state.rootData);
      if (resolved === undefined) return true;
      const wrongType =
        entry.schemaTypes.length > 0 &&
        !checkDataTypes(entry.schemaTypes, resolved, ctx.opts.strictNumbers);
      if (
        wrongType ||
        (entry.validateSchema !== undefined && !entry.validateSchema(resolved))
      ) {
        reportDataKeyword(state, instancePath, schemaPath, entry, node, data);
        return false;
      }
      schemaValue = resolved;
    }
    const compiled = entry.compile !== undefined && !usesDataReference;
    const validate = compiled ? ctx.compiledKeyword(node, entry) : entry.validate;
    const passSchema = compiled ? false : entry.passSchema;
    const args = passSchema ? [schemaValue, data, node, dataCxt] : [data, dataCxt];
    const ruleThis = ctx.opts.passContext ? state.callerContext : this.ctx.ajv;
    let passed;
    let ruleErrors = null;
    if (entry.inspectErrors) {
      try {
        passed = await validate.call(ruleThis, ...args);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        passed = false;
        ruleErrors = error.errors;
      }
    } else {
      passed = await validate.call(ruleThis, ...args);
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
          if (state.verbose) {
            error.schema = node[entry.keyword];
            error.data = ref.value;
          }
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
      {schema: node[entry.keyword], parentSchema: node, data: ref.value},
    );
    return false;
  }

  async runMacroAsync(
    entry,
    node,
    ref,
    state,
    instancePath,
    parentData,
    parentKey,
    schemaPath,
    ctx,
  ) {
    const macroSchema = ctx.macroPlan(node, entry) || ctx.expandMacro(node, entry);
    const child = {
      errs: state.errs,
      allErrors: state.allErrors,
      messages: state.messages,
      verbose: state.verbose,
      propertyName: state.propertyName,
      rootData: state.rootData,
      callerContext: state.callerContext,
      dynamicAnchors: state.dynamicAnchors,
      evaluated: this.newEvaluated(),
      abortToken: state.abortToken,
      env: state.env,
    };
    const ok = await this.runRefAsync(
      macroSchema,
      ref,
      ctx,
      child,
      instancePath,
      parentData,
      parentKey,
      schemaPath + "/" + entry.keyword,
      true,
    );
    if (ok) return true;
    addError(
      state,
      instancePath,
      schemaPath,
      entry.keyword,
      {},
      `must pass "${entry.keyword}" keyword validation`,
      {schema: node[entry.keyword], parentSchema: node, data: ref.value},
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

  async formatDataFailsAsync(formatName, data, ruleType) {
    const formats = this.dataFormats === undefined ? this.formats : this.dataFormats;
    const formatDef = formats[formatName];
    let formatType = "string";
    let check = formatDef;
    let isAsync = false;
    if (typeof formatDef === "object" && formatDef !== null && !(formatDef instanceof RegExp)) {
      formatType = formatDef.type || "string";
      check = formatDef.validate;
      isAsync = Boolean(formatDef.async);
    }
    if (this.strictSchemaEnabled() && formatName && !check) return true;
    if (!check || check === true) return false;
    if (formatType !== ruleType) return false;
    const result = isAsync
      ? await check(data)
      : typeof check === "function"
        ? check(data)
        : check.test(data);
    return !result;
  }

  async runRefAsync(node, ref, ctx, state, instancePath, parentData, parentKey, schemaPath, composite) {
    if (node === true) return true;
    if (node === false) {
      addError(state, instancePath, schemaPath, "false schema", {}, "boolean schema is false", {
        schema: false,
        parentSchema: false,
        data: ref.value,
      });
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
      messages: state.messages,
      verbose: state.verbose,
      propertyName,
      rootData: state.rootData,
      callerContext: state.callerContext,
      dynamicAnchors: state.dynamicAnchors,
      evaluated: this.newEvaluated(),
      abortToken: state.abortToken,
      env: state.env,
      codeAsync: state.codeAsync,
    });
    const fail = (keyword, params, message, childSchemaPath = schemaPath, childInstancePath = instancePath) => {
      addError(state, childInstancePath, childSchemaPath, keyword, params, message, {
        schema: node[keyword],
        parentSchema: node,
        data,
      });
      valid = false;
      if (!allErrors && !composite) state.abortToken.aborted = true;
    };
    // A keyword value that is a data reference names a location in the
    // document instead of holding a literal value; `undefined` means literal.
    const dataEnabled = opts.$data === true;
    const runKeywords = async (defs) => {
      for (const entry of defs) {
        if (!keywordApplies(node, entry, this.keywordRules)) continue;
        const passed =
          entry.async || entry.macro !== undefined || (entry.code !== undefined && state.codeAsync)
            ? await this.runKeywordAsync(
                entry,
                node,
                ref,
                state,
                instancePath,
                parentData,
                parentKey,
                schemaPath,
                ctx,
              )
            : this.runKeyword(
                entry,
                node,
                ref,
                state,
                instancePath,
                parentData,
                parentKey,
                schemaPath,
                ctx,
              );
        if (!passed) {
          if (!allErrors && !composite) state.abortToken.aborted = true;
          if (!allErrors) return false;
          valid = false;
        }
        data = ref.value;
      }
      return true;
    };
    const runPhase = async (group, slot) => {
      const phases = this.keywordPhases[group];
      const entries = phases === undefined ? undefined : phases.get(slot);
      return entries === undefined ? true : runKeywords(entries);
    };

    if (!(await runPhase("any", "start"))) return false;
    if (!(await runPhase("any", "type"))) return false;

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

    if (!(await runPhase("any", "dynref"))) return false;
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

    if (!(await runPhase("any", "ref"))) return false;
    if (typeof node.$ref === "string") {
      const target = ctx.refTargets.get(node);
      const child = childState();
      if (!target.inline) {
        child.env = {ctx: target.ctx, node: target.node};
        child.codeAsync = target.ctx.async === true;
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

    if (!(await runPhase("any", "const"))) return false;
    if (Object.prototype.hasOwnProperty.call(node, "const")) {
      const constRef = (dataEnabled ? dataPointer(node.const) : undefined);
      if (constRef !== undefined) {
        const allowed = resolveDataReference(constRef, ref, state.rootData);
        if (allowed !== undefined && !deepEqual(data, allowed)) {
          fail("const", {allowedValue: allowed}, "must be equal to constant");
          if (!allErrors) return false;
        }
      } else if (!deepEqual(data, node.const)) {
        fail("const", {allowedValue: node.const}, "must be equal to constant");
        if (!allErrors) return false;
      }
    }

    if (!(await runPhase("any", "enum"))) return false;
    if (node.enum !== undefined) {
      const enumRef = (dataEnabled ? dataPointer(node.enum) : undefined);
      const allowedValues = enumRef !== undefined ? resolveDataReference(enumRef, ref, state.rootData) : node.enum;
      if (allowedValues !== undefined) {
        let found = false;
        if (!Array.isArray(allowedValues)) {
          // ajv reports the reference's type error, then still reports the
          // enum's own failure with the resolved value when collecting all.
          reportDataReference(state, instancePath, schemaPath, "enum", ["array"], node, data);
          valid = false;
          if (!allErrors && !composite) state.abortToken.aborted = true;
          if (!allErrors) return false;
        } else {
          for (const allowed of allowedValues) {
            if (deepEqual(data, allowed)) {
              found = true;
              break;
            }
          }
        }
        if (!found) {
          fail("enum", {allowedValues}, "must be equal to one of the allowed values");
          if (!allErrors) return false;
        }
      }
    }

    if (!(await runPhase("any", "not"))) return false;
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

    if (!(await runPhase("any", "anyOf"))) return false;
    if (Array.isArray(node.anyOf)) {
      const anyOfPath = schemaPath + "/anyOf";
      const alwaysValidBranch = node.anyOf.some((schema) => alwaysValidSchema(schema, this.keywordRules));
      if (!alwaysValidBranch || this.unevaluated) {
        const start = state.errs ? state.errs.length : 0;
        let matched = false;
        let claimed = false;
        for (let i = 0; i < node.anyOf.length; i++) {
          if (
            this.discriminator &&
            this.unevaluated &&
            this.staticEvaluated(node.anyOf[i], ctx).props !== undefined
          ) {
            claimed = true;
          }
          const wasClaimed = claimed;
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
            if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
            if (!this.unevaluated) break;
          } else if (!wasClaimed) {
            this.mergeChildEvaluated(evaluated, child.evaluated, false);
            if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
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

    if (!(await runPhase("any", "oneOf"))) return false;
    // A schema carrying the annotation leaves oneOf to the discriminator
    // keyword, which validates only the branch its tag selects.
    if (Array.isArray(node.oneOf) && !(this.discriminator && node.discriminator)) {
      const oneOfPath = schemaPath + "/oneOf";
      const start = state.errs ? state.errs.length : 0;
      let matched = false;
      let passing = null;
      let claimed = false;
      for (let i = 0; i < node.oneOf.length; i++) {
        if (
          this.discriminator &&
          this.unevaluated &&
          this.staticEvaluated(node.oneOf[i], ctx).props !== undefined
        ) {
          claimed = true;
        }
        const wasClaimed = claimed;
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
            if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
          } else if (!wasClaimed) {
            this.mergeChildEvaluated(evaluated, child.evaluated, false);
            if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
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
          if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
        } else if (!wasClaimed) {
          this.mergeChildEvaluated(evaluated, child.evaluated, false);
          if (child.evaluated.props !== undefined || child.evaluated.leaked) claimed = true;
        }
      }
      if (matched) {
        if (state.errs) state.errs.length = start;
      } else {
        fail("oneOf", {passingSchemas: passing}, "must match exactly one schema in oneOf");
        if (!allErrors) return false;
      }
    }

    if (!(await runPhase("any", "allOf"))) return false;
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

    if (!(await runPhase("any", "if"))) return false;
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
            thenOk = clauseOk || child.evaluated.leaked;
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
          elseOk = clauseOk || child.evaluated.leaked;
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
        if (ifChild.evaluated.leaked || (testOk ? thenEval.leaked : elseEval.leaked)) {
          evaluated.leaked = true;
        }
        if (!clauseOk) {
          valid = false;
          // ajv appends its own "if" entry after a clause failure that did
          // not already return from the compiled function; a failure coming
          // from a reference call is reachable, an inline keyword failure is
          // not.
          if (allErrors || composite || !state.abortToken.aborted) {
            addError(
              state,
              instancePath,
              schemaPath,
              "if",
              {failingKeyword: clause},
              `must match "${clause}" schema`,
              {schema: node.if, parentSchema: node, data},
            );
            if (!allErrors && !composite) state.abortToken.aborted = true;
          }
          if (!allErrors) return false;
        }
      }
    }

    if (!(await runPhase("any", "ifEnd"))) return false;

    if (!(await runKeywords(this.keywordGroups.any))) return false;

    if (!allErrors && state.errs && state.errs.length > errorsAtStart) return false;

    if (checkDataType("number", data, opts.strictNumbers)) {
      if (!(await runPhase("number", "maximum"))) return false;
      const maximumRef = (dataEnabled ? dataPointer(node.maximum) : undefined);
      if (maximumRef !== undefined) {
        const limit = resolveDataReference(maximumRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data > limit || isNaN(data))) {
          fail("maximum", {comparison: "<=", limit}, `must be <= ${limit}`);
          if (!allErrors) return false;
        }
      } else if (typeof node.maximum === "number") {
        if (data > node.maximum || isNaN(data)) {
          fail("maximum", {comparison: "<=", limit: node.maximum}, `must be <= ${node.maximum}`);
          if (!allErrors) return false;
        }
      }
      if (!(await runPhase("number", "minimum"))) return false;
      const minimumRef = (dataEnabled ? dataPointer(node.minimum) : undefined);
      if (minimumRef !== undefined) {
        const limit = resolveDataReference(minimumRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data < limit || isNaN(data))) {
          fail("minimum", {comparison: ">=", limit}, `must be >= ${limit}`);
          if (!allErrors) return false;
        }
      } else if (typeof node.minimum === "number") {
        if (data < node.minimum || isNaN(data)) {
          fail("minimum", {comparison: ">=", limit: node.minimum}, `must be >= ${node.minimum}`);
          if (!allErrors) return false;
        }
      }
      if (!(await runPhase("number", "exclusiveMaximum"))) return false;
      const exclusiveMaximumRef = (dataEnabled ? dataPointer(node.exclusiveMaximum) : undefined);
      if (exclusiveMaximumRef !== undefined) {
        const limit = resolveDataReference(exclusiveMaximumRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data >= limit || isNaN(data))) {
          fail("exclusiveMaximum", {comparison: "<", limit}, `must be < ${limit}`);
          if (!allErrors) return false;
        }
      } else if (typeof node.exclusiveMaximum === "number") {
        if (data >= node.exclusiveMaximum || isNaN(data)) {
          fail(
            "exclusiveMaximum",
            {comparison: "<", limit: node.exclusiveMaximum},
            `must be < ${node.exclusiveMaximum}`,
          );
          if (!allErrors) return false;
        }
      }
      if (!(await runPhase("number", "exclusiveMinimum"))) return false;
      const exclusiveMinimumRef = (dataEnabled ? dataPointer(node.exclusiveMinimum) : undefined);
      if (exclusiveMinimumRef !== undefined) {
        const limit = resolveDataReference(exclusiveMinimumRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data <= limit || isNaN(data))) {
          fail("exclusiveMinimum", {comparison: ">", limit}, `must be > ${limit}`);
          if (!allErrors) return false;
        }
      } else if (typeof node.exclusiveMinimum === "number") {
        if (data <= node.exclusiveMinimum || isNaN(data)) {
          fail(
            "exclusiveMinimum",
            {comparison: ">", limit: node.exclusiveMinimum},
            `must be > ${node.exclusiveMinimum}`,
          );
          if (!allErrors) return false;
        }
      }
      if (!(await runPhase("number", "multipleOf"))) return false;
      const multipleOfRef = (dataEnabled ? dataPointer(node.multipleOf) : undefined);
      if (multipleOfRef !== undefined) {
        const multipleOf = resolveDataReference(multipleOfRef, ref, state.rootData);
        if (multipleOf !== undefined) {
          const quotient = data / multipleOf;
          const precision = opts.multipleOfPrecision;
          const invalid = precision
            ? Math.abs(Math.round(quotient) - quotient) > Math.pow(10, -precision)
            : quotient !== parseInt(quotient);
          if (!checkDataTypes(["number"], multipleOf, opts.strictNumbers) || multipleOf === 0 || invalid) {
            fail("multipleOf", {multipleOf}, `must be multiple of ${multipleOf}`);
            if (!allErrors) return false;
          }
        }
      } else if (typeof node.multipleOf === "number") {
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
      if (!(await runPhase("number", "format"))) return false;
      const formatRef = (dataEnabled ? dataPointer(node.format) : undefined);
      if (formatRef !== undefined && opts.validateFormats) {
        const formatName = resolveDataReference(formatRef, ref, state.rootData);
        if (
          formatName !== undefined &&
          (!checkDataTypes(["string"], formatName, opts.strictNumbers) ||
            (await this.formatDataFailsAsync(formatName, data, "number")))
        ) {
          fail("format", {format: formatName}, `must match format "${formatName}"`);
          if (!allErrors) return false;
        }
      } else if (typeof node.format === "string" && opts.validateFormats) {
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
      if (!(await runPhase("string", "maxLength"))) return false;
      const maxLengthRef = (dataEnabled ? dataPointer(node.maxLength) : undefined);
      if (maxLengthRef !== undefined) {
        const limit = resolveDataReference(maxLengthRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || ucs2length(data) > limit)) {
          fail("maxLength", {limit}, `must NOT have more than ${limit} characters`);
          if (!allErrors) return false;
        }
      } else if (typeof node.maxLength === "number" && ucs2length(data) > node.maxLength) {
        fail("maxLength", {limit: node.maxLength}, `must NOT have more than ${node.maxLength} characters`);
        if (!allErrors) return false;
      }
      if (!(await runPhase("string", "minLength"))) return false;
      const minLengthRef = (dataEnabled ? dataPointer(node.minLength) : undefined);
      if (minLengthRef !== undefined) {
        const limit = resolveDataReference(minLengthRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || ucs2length(data) < limit)) {
          fail("minLength", {limit}, `must NOT have fewer than ${limit} characters`);
          if (!allErrors) return false;
        }
      } else if (typeof node.minLength === "number" && ucs2length(data) < node.minLength) {
        fail("minLength", {limit: node.minLength}, `must NOT have fewer than ${node.minLength} characters`);
        if (!allErrors) return false;
      }
      if (!(await runPhase("string", "pattern"))) return false;
      const patternRef = (dataEnabled ? dataPointer(node.pattern) : undefined);
      if (patternRef !== undefined) {
        const pattern = resolveDataReference(patternRef, ref, state.rootData);
        if (pattern !== undefined) {
          let matches = false;
          try {
            matches = ctx.pattern(pattern).test(data);
          } catch {
            matches = false;
          }
          if (!checkDataTypes(["string"], pattern, opts.strictNumbers) || !matches) {
            fail("pattern", {pattern}, `must match pattern "${pattern}"`);
            if (!allErrors) return false;
          }
        }
      } else if (typeof node.pattern === "string" && !ctx.pattern(node.pattern).test(data)) {
        fail("pattern", {pattern: node.pattern}, `must match pattern "${node.pattern}"`);
        if (!allErrors) return false;
      }
      if (!(await runPhase("string", "format"))) return false;
      const formatRef = (dataEnabled ? dataPointer(node.format) : undefined);
      if (formatRef !== undefined && opts.validateFormats) {
        const formatName = resolveDataReference(formatRef, ref, state.rootData);
        if (
          formatName !== undefined &&
          (!checkDataTypes(["string"], formatName, opts.strictNumbers) ||
            (await this.formatDataFailsAsync(formatName, data, "string")))
        ) {
          fail("format", {format: formatName}, `must match format "${formatName}"`);
          if (!allErrors) return false;
        }
      } else if (typeof node.format === "string" && opts.validateFormats) {
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
      if (!(await runPhase("array", "maxItems"))) return false;
      const maxItemsRef = (dataEnabled ? dataPointer(node.maxItems) : undefined);
      if (maxItemsRef !== undefined) {
        const limit = resolveDataReference(maxItemsRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data.length > limit)) {
          fail("maxItems", {limit}, `must NOT have more than ${limit} items`);
          if (!allErrors) return false;
        }
      } else if (typeof node.maxItems === "number" && data.length > node.maxItems) {
        fail("maxItems", {limit: node.maxItems}, `must NOT have more than ${node.maxItems} items`);
        if (!allErrors) return false;
      }
      if (!(await runPhase("array", "minItems"))) return false;
      const minItemsRef = (dataEnabled ? dataPointer(node.minItems) : undefined);
      if (minItemsRef !== undefined) {
        const limit = resolveDataReference(minItemsRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || data.length < limit)) {
          fail("minItems", {limit}, `must NOT have fewer than ${limit} items`);
          if (!allErrors) return false;
        }
      } else if (typeof node.minItems === "number" && data.length < node.minItems) {
        fail("minItems", {limit: node.minItems}, `must NOT have fewer than ${node.minItems} items`);
        if (!allErrors) return false;
      }
      if (!(await runPhase("array", "prefixItems"))) return false;
      if (!(await runPhase("array", "additionalItems"))) return false;
      if (this.draft2020) {
        const prefix = Array.isArray(node.prefixItems) ? node.prefixItems : undefined;
        if (prefix !== undefined) {
          const limit = Math.min(prefix.length, data.length);
          for (let i = 0; i < limit; i++) {
            if (alwaysValidSchema(prefix[i], this.keywordRules)) continue;
            if (
              !(await this.runRefAsync(
                prefix[i],
                {value: data[i], parent: ref, key: i},
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
        if (!(await runPhase("array", "items"))) return false;
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
                    {value: data[i], parent: ref, key: i},
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
                  {value: data[i], parent: ref, key: i},
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
                  {value: data[i], parent: ref, key: i},
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
        if (!(await runPhase("array", "items"))) return false;
        if (node.items !== undefined) {
          const items = node.items;
          if (Array.isArray(items)) {
            const limit = Math.min(items.length, data.length);
            for (let i = 0; i < limit; i++) {
              if (alwaysValidSchema(items[i], this.keywordRules)) continue;
              if (
                !(await this.runRefAsync(
                  items[i],
                  {value: data[i], parent: ref, key: i},
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
                  {value: data[i], parent: ref, key: i},
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
      if (!(await runPhase("array", "contains"))) return false;
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
                {value: data[i], parent: ref, key: i},
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
              {value: data[i], parent: ref, key: i},
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
      if (!(await runPhase("array", "uniqueItems"))) return false;
      const uniqueItemsRef = (dataEnabled ? dataPointer(node.uniqueItems) : undefined);
      let uniqueItemsEnabled = node.uniqueItems === true;
      if (uniqueItemsRef !== undefined) {
        const uniqueValue = resolveDataReference(uniqueItemsRef, ref, state.rootData);
        if (uniqueValue === undefined || uniqueValue === false) {
          uniqueItemsEnabled = false;
        } else if (typeof uniqueValue !== "boolean") {
          reportDataReference(state, instancePath, schemaPath, "uniqueItems", ["boolean"], node, data);
          valid = false;
          if (!allErrors && !composite) state.abortToken.aborted = true;
          if (!allErrors) return false;
          uniqueItemsEnabled = false;
        } else {
          uniqueItemsEnabled = true;
        }
      }
      if (uniqueItemsEnabled && data.length > 1) {
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
      if (!(await runPhase("array", "containsEnd"))) return false;
      if (!(await runPhase("array", "unevaluatedItems"))) return false;
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
                {value: data[i], parent: ref, key: i},
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
      if (!(await runPhase("object", "maxProperties"))) return false;
      const keys = Object.keys(data);
      const maxPropertiesRef = (dataEnabled ? dataPointer(node.maxProperties) : undefined);
      if (maxPropertiesRef !== undefined) {
        const limit = resolveDataReference(maxPropertiesRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || keys.length > limit)) {
          fail("maxProperties", {limit}, `must NOT have more than ${limit} properties`);
          if (!allErrors) return false;
        }
      } else if (typeof node.maxProperties === "number" && keys.length > node.maxProperties) {
        fail("maxProperties", {limit: node.maxProperties}, `must NOT have more than ${node.maxProperties} properties`);
        if (!allErrors) return false;
      }
      if (!(await runPhase("object", "minProperties"))) return false;
      const minPropertiesRef = (dataEnabled ? dataPointer(node.minProperties) : undefined);
      if (minPropertiesRef !== undefined) {
        const limit = resolveDataReference(minPropertiesRef, ref, state.rootData);
        if (limit !== undefined && (!checkDataTypes(["number"], limit, opts.strictNumbers) || keys.length < limit)) {
          fail("minProperties", {limit}, `must NOT have fewer than ${limit} properties`);
          if (!allErrors) return false;
        }
      } else if (typeof node.minProperties === "number" && keys.length < node.minProperties) {
        fail("minProperties", {limit: node.minProperties}, `must NOT have fewer than ${node.minProperties} properties`);
        if (!allErrors) return false;
      }
      if (!(await runPhase("object", "required"))) return false;
      const requiredRef = (dataEnabled ? dataPointer(node.required) : undefined);
      if (requiredRef !== undefined) {
        const requiredValues = resolveDataReference(requiredRef, ref, state.rootData);
        if (requiredValues !== undefined) {
          if (!Array.isArray(requiredValues)) {
            reportDataReference(state, instancePath, schemaPath, "required", ["array"], node, data);
            valid = false;
            if (!allErrors && !composite) state.abortToken.aborted = true;
            if (!allErrors) return false;
          } else {
            for (const required of requiredValues) {
              if (noPropertyInData(data, required, ownProperties)) {
                fail("required", {missingProperty: required}, `must have required property '${required}'`);
                if (!allErrors) return false;
              }
            }
          }
        }
      } else if (Array.isArray(node.required)) {
        for (const required of node.required) {
          if (noPropertyInData(data, required, ownProperties)) {
            fail("required", {missingProperty: required}, `must have required property '${required}'`);
            if (!allErrors) return false;
          }
        }
      }

      if (!(await runPhase("object", "propertyNames"))) return false;
      if (node.propertyNames !== undefined && !alwaysValidSchema(node.propertyNames, this.keywordRules)) {
        for (const key of enumerableKeys(data)) {
          const ok = await this.runRefAsync(
            node.propertyNames,
            {value: key, parent: ref},
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
              {schema: node.propertyNames, parentSchema: node, data},
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
      if (!(await runPhase("object", "additionalProperties"))) return false;
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
                  {value: data[key], parent: ref, key},
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
                {value: data[key], parent: ref, key},
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

      if (!(await runPhase("object", "dependencies"))) return false;
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
            // ajv replaces the enclosing evaluated-property set with the
            // schema dependency's local set. When the dependency fails, that
            // local set is empty, so names evaluated before this keyword stop
            // counting; reproduce that here rather than keeping the outer set.
            if (this.unevaluated && child.evaluated.props !== undefined) {
              evaluated.props = undefined;
            }
            if (!allErrors) return false;
            valid = false;
          }
        }
      }

      if (!(await runPhase("object", "properties"))) return false;
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
              {value: data[property], parent: ref, key: property},
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

      if (!(await runPhase("object", "patternProperties"))) return false;
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
                {value: data[key], parent: ref, key},
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

      if (!(await runPhase("object", "dependentRequired"))) return false;
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

      if (!(await runPhase("object", "dependentSchemas"))) return false;
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
            // ajv replaces the enclosing evaluated-property set with the
            // schema dependency's local set. When the dependency fails, that
            // local set is empty, so names evaluated before this keyword stop
            // counting; reproduce that here rather than keeping the outer set.
            if (this.unevaluated && child.evaluated.props !== undefined) {
              evaluated.props = undefined;
            }
            if (!allErrors) return false;
            valid = false;
          }
        }
      }

      if (!(await runPhase("object", "unevaluatedProperties"))) return false;
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
                  {value: data[key], parent: ref, key},
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

    if (!(await runKeywords(this.keywordGroups.post))) return false;

    return valid;
  }
}

module.exports = {
  SchemaContext,
  Validator,
  MissingRefError,
  ValidationError,
  addError,
  keywordApplies,
  schemaHasRef,
  schemaHasRulesButRef,
};
