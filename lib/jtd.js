"use strict";

// JSON Type Definition validation for ajv's `ajv/dist/jtd` entry point.
//
// The dialect, the schemas that compile, the documents that validate, and the
// error reports follow ajv's JSON Type Definition implementation: RFC 8927
// plus ajv's `metadata`, `nullable`, and `definitions` extensions. Schemas are
// validated against ajv's JTD meta-schema (shipped in ./refs/jtd-schema.json),
// and the compile-time rules ajv applies on top of it (enum arity, property
// overlaps, discriminator restrictions, definition lookups, strict unknown
// keywords) are applied at the same points and with the same messages.

const Ajv = require("./ajv");
const {ValidationError, MissingRefError} = require("./compile");
const {isObject, checkDataType} = require("./util");
const jtdMetaSchema = require("./refs/jtd-schema.json");

const META_SCHEMA_ID = "JTD-meta-schema";

const KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
const JSON_TYPES = new Set(["string", "number", "integer", "boolean", "null", "object", "array"]);

// Definition fields that make a keyword something other than a synchronous
// validation rule or a macro. They are rejected rather than ignored, so a
// project that relies on them fails loudly instead of validating differently.
const UNSUPPORTED_DEFINITION_FIELDS = ["code", "compile", "implements"];

// ajv's range table for the ranged integer types. The third entry is the
// digit count the parser consumes before applying the range, exactly as ajv's
// `intRange` carries it.
const INT_RANGE = {
  int8: [-128, 127, 3],
  uint8: [0, 255, 3],
  int16: [-32768, 32767, 5],
  uint16: [0, 65535, 5],
  int32: [-2147483648, 2147483647, 10],
  uint32: [0, 4294967295, 10],
};

// ajv's timestamp runtime (ajv/dist/runtime/timestamp).
const DT_SEPARATOR = /t|\s/i;
const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
const TIME = /^(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:z|([+-]\d\d)(?::?(\d\d))?)$/i;
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function validDate(str) {
  const matches = DATE.exec(str);
  if (!matches) return false;
  const y = +matches[1];
  const m = +matches[2];
  const d = +matches[3];
  return (
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    (d <= DAYS[m] || (m === 2 && d === 29 && (y % 100 === 0 ? y % 400 === 0 : y % 4 === 0)))
  );
}

function validTime(str) {
  const matches = TIME.exec(str);
  if (!matches) return false;
  const hr = +matches[1];
  const min = +matches[2];
  const sec = +matches[3];
  const tzH = +(matches[4] || 0);
  const tzM = +(matches[5] || 0);
  return (hr <= 23 && min <= 59 && sec <= 59) || (hr - tzH === 23 && min - tzM === 59 && sec === 60);
}

function validTimestamp(str, allowDate) {
  const dt = str.split(DT_SEPARATOR);
  return (
    (dt.length === 2 && validDate(dt[0]) && validTime(dt[1])) ||
    (allowDate && dt.length === 1 && validDate(dt[0]))
  );
}

// ajv's escapeJsonPointer / escapeFragment, used for the schema paths in a
// reported error.
function escapePointerToken(value) {
  return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function escapeFragment(value) {
  return encodeURIComponent(escapePointerToken(value));
}

function jsonTypes(value) {
  const types = Array.isArray(value) ? value.slice() : value ? [value] : [];
  if (types.every((type) => JSON_TYPES.has(type))) return types;
  throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
}

function unsupportedField(definition) {
  for (const field of UNSUPPORTED_DEFINITION_FIELDS) {
    if (definition[field] !== undefined) return field;
  }
  if (definition.$data) return "$data";
  if (definition.post === true) return "post";
  if (definition.before !== undefined) return "before";
  return undefined;
}

// The keywords ajv's JTD vocabulary registers, in registration order. A rule
// with a `compile` step takes part in validation; `additionalProperties` and
// `nullable` are read by the keywords around them and do no work of their own,
// but still count as rules where ajv counts them.
const JTD_RULES = [
  {keyword: "ref", schemaType: "string", compile: compileRef},
  {keyword: "type", schemaType: "string", compile: compileType},
  {keyword: "enum", schemaType: "array", compile: compileEnum},
  {keyword: "elements", schemaType: "object", compile: compileElements},
  {keyword: "properties", schemaType: "object", compile: compileProperties},
  {keyword: "optionalProperties", schemaType: "object", compile: compileOptionalProperties},
  {
    keyword: "discriminator",
    schemaType: "string",
    implements: ["mapping"],
    compile: compileDiscriminator,
  },
  {keyword: "values", schemaType: "object", compile: compileValues},
  {keyword: "union", schemaType: "array", compile: compileUnion},
  {keyword: "metadata", schemaType: "object", compile: compileMetadata},
  {keyword: "additionalProperties", schemaType: "boolean"},
  {keyword: "nullable", schemaType: "boolean"},
];

// Keywords ajv knows about but gives no rule of their own: `definitions` is
// read by `ref`, `mapping` by `discriminator`, and `$async` is registered by
// ajv's core.
const JTD_KNOWN_KEYWORDS = new Set([
  "$async",
  "definitions",
  "mapping",
  ...JTD_RULES.map((rule) => rule.keyword),
]);

// ajv's rule table: one untyped group, then one group per data type, with
// groups for types outside the standard four appended as they appear.
function buildRules(ajv) {
  const known = new Set(JTD_KNOWN_KEYWORDS);
  const all = new Set();
  const untyped = [];
  for (const rule of JTD_RULES) {
    all.add(rule.keyword);
    untyped.push(rule);
  }
  const groups = [
    {type: "number", rules: []},
    {type: "string", rules: []},
    {type: "array", rules: []},
    {type: "object", rules: []},
  ];
  const extra = new Map();
  for (const [name, entry] of ajv.keywords) {
    known.add(name);
    if (!entry.rule) continue;
    all.add(name);
    const rule = {keyword: name, schemaType: entry.schemaType, custom: entry, compile: compileCustom};
    if (entry.types.length === 0) {
      untyped.push(rule);
      continue;
    }
    for (const type of entry.types) {
      let group = groups.find((candidate) => candidate.type === type);
      if (group === undefined) {
        group = extra.get(type);
        if (group === undefined) {
          group = {type, rules: []};
          extra.set(type, group);
        }
      }
      group.rules.push(rule);
    }
  }
  return {known, all, untyped, groups: groups.concat([...extra.values()])};
}

// --- compile-time checks --------------------------------------------------

function checkSchemaType(keyword, schemaType, value) {
  const types = schemaType === undefined ? [] : Array.isArray(schemaType) ? schemaType : [schemaType];
  if (types.length === 0) return;
  const valid = types.some((type) =>
    type === "array"
      ? Array.isArray(value)
      : type === "object"
        ? value && typeof value === "object" && !Array.isArray(value)
        : typeof value === type,
  );
  if (!valid) throw new Error(`${keyword} value must be ${JSON.stringify(types)}`);
}

function checkMetadata(cc, keyword) {
  if (cc.jtdMetadata) throw new Error(`JTD: "${keyword}" cannot be used in this schema location`);
}

function checkUnknownRules(node, cc) {
  const mode = cc.settings.strictSchema;
  if (!mode) return;
  for (const key in node) {
    if (cc.rules.known.has(key)) continue;
    const message = `strict mode: unknown keyword: "${key}"`;
    if (mode === true) throw new Error(message);
    console.warn(message);
  }
}

// ajv's alwaysValidSchema: an empty schema, or one whose keywords carry no
// rule, validates everything. Unknown keywords are reported here first.
function alwaysValid(schema, cc) {
  if (typeof schema === "boolean") return schema;
  if (Object.keys(schema).length === 0) return true;
  checkUnknownRules(schema, cc);
  for (const key in schema) {
    if (cc.rules.all.has(key)) return false;
  }
  return true;
}

function shouldUseRule(node, rule) {
  if (node[rule.keyword] !== undefined) return true;
  return rule.implements !== undefined && rule.implements.some((keyword) => node[keyword] !== undefined);
}

// ajv compiles a schema node's keywords only when the node carries at least
// one rule; anything else validates everything.
function hasRules(node, rules) {
  for (const key in node) {
    if (rules.all.has(key)) return true;
  }
  return false;
}

function compileRule(rule, node, cc) {
  checkSchemaType(rule.keyword, rule.schemaType, node[rule.keyword]);
  if (rule.compile === undefined) return null;
  return rule.compile(rule, node, cc);
}

// --- error reporting ------------------------------------------------------

function makeError(c, node, keyword, spec, data) {
  const error = {
    instancePath: spec.instancePath === undefined ? c.instancePath : spec.instancePath,
    schemaPath: spec.schemaPath === undefined ? c.errSchemaPath + "/" + keyword : spec.schemaPath,
    keyword,
    params: spec.params,
  };
  if (c.settings.messages) error.message = spec.message;
  if (c.settings.verbose) {
    error.schema = node[keyword];
    error.parentSchema = node;
    error.data = data;
  }
  return error;
}

function typeErrorSpec(node, type) {
  const nullable = Boolean(node.nullable);
  return {
    params: {type, nullable},
    message: nullable ? `must be ${type} or null` : `must be ${type}`,
  };
}

// ajv reports an error and, outside a composite rule, returns from the whole
// validation function with that error as the only entry.
function report(c, error) {
  if (c.compositeRule || c.settings.allErrors) {
    c.state.errors.push(error);
    return;
  }
  c.state.errors.length = 0;
  c.state.errors.push(error);
  c.state.abort = true;
}

// Appends a list of errors the way ajv concatenates the entries a custom
// keyword reported. An empty list still replaces a null report with an empty
// one, which is what ajv's `errors` ends up holding.
function pushErrors(c, errors) {
  if (errors.length === 0) {
    if (c.state.errors.length === 0) c.state.empty = true;
    return;
  }
  for (const error of errors) c.state.errors.push(error);
  c.state.empty = false;
}

// ajv's reportExtraError: the entry is added to the report and, outside a
// composite rule, the accumulated entries are returned as they stand.
function reportExtra(c, error) {
  c.state.errors.push(error);
  c.state.empty = false;
  if (!(c.compositeRule || c.settings.allErrors)) c.state.abort = true;
}

function childContext(c, props) {
  const next = {...c, jtdMetadata: undefined, jtdDiscriminator: undefined};
  for (const key of Object.keys(props)) next[key] = props[key];
  return next;
}

function compileContext(cc, props) {
  const next = {...cc, jtdMetadata: undefined, jtdDiscriminator: undefined};
  for (const key of Object.keys(props)) next[key] = props[key];
  return next;
}

// --- keyword compilation --------------------------------------------------

function typeCondition(type, settings) {
  switch (type) {
    case "boolean":
    case "string":
      return (data) => typeof data === type;
    case "timestamp": {
      if (settings.timestamp === "date") return (data) => data instanceof Date;
      const allowDate = settings.allowDate;
      const validString = (data) => typeof data === "string" && validTimestamp(data, allowDate);
      if (settings.timestamp === "string") return validString;
      return (data) => data instanceof Date || validString(data);
    }
    case "float32":
    case "float64":
      return (data) => typeof data === "number";
    default: {
      if (!settings.int32range && (type === "int32" || type === "uint32")) {
        if (type === "uint32") {
          return (data) => typeof data === "number" && isFinite(data) && !(data % 1) && data >= 0;
        }
        return (data) => typeof data === "number" && isFinite(data) && !(data % 1);
      }
      const [min, max] = INT_RANGE[type];
      return (data) => typeof data === "number" && isFinite(data) && !(data % 1) && data >= min && data <= max;
    }
  }
}

function compileType(rule, node, cc) {
  checkMetadata(cc, "type");
  const type = node.type;
  const matches = typeCondition(type, cc.settings);
  const nullable = Boolean(node.nullable);
  const spec = typeErrorSpec(node, type);
  return (data, c) => {
    const ok = matches(data);
    const valid = nullable ? data === null || ok : ok;
    if (!valid) report(c, makeError(c, node, "type", spec, data));
    return valid;
  };
}

function compileEnum(rule, node, cc) {
  checkMetadata(cc, "enum");
  const values = node.enum;
  if (values.length === 0) throw new Error("enum must have non-empty array");
  if (values.length !== new Set(values).size) throw new Error("enum items must be unique");
  const nullable = Boolean(node.nullable);
  const spec = {params: {allowedValues: values}, message: "must be equal to one of the allowed values"};
  return (data, c) => {
    const inEnum = typeof data === "string" && values.some((value) => data === value);
    const valid = nullable ? data === null || inEnum : inEnum;
    if (!valid) report(c, makeError(c, node, "enum", spec, data));
    return valid;
  };
}

function compileElements(rule, node, cc) {
  checkMetadata(cc, "elements");
  if (alwaysValid(node.elements, cc)) return null;
  const run = compileNode(node.elements, compileContext(cc, {}));
  const nullable = Boolean(node.nullable);
  const spec = typeErrorSpec(node, "array");
  const errSchemaPath = "/elements";
  return (data, c) => {
    let valid = nullable ? data === null : false;
    if (!valid) {
      if (Array.isArray(data)) {
        const len = data.length;
        const path = c.errSchemaPath + errSchemaPath;
        let itemsValid = true;
        for (let i = 0; i < len; i++) {
          const before = c.state.errors.length;
          run(
            data[i],
            childContext(c, {
              instancePath: c.instancePath + "/" + i,
              errSchemaPath: path,
              parentData: data,
              parentDataProperty: i,
            }),
          );
          if (c.state.abort) return false;
          if (c.state.errors.length !== before) {
            itemsValid = false;
            if (!c.settings.allErrors) break;
          }
        }
        valid = itemsValid;
      } else {
        report(c, makeError(c, node, "elements", spec, data));
      }
    }
    return valid;
  };
}

function compileValues(rule, node, cc) {
  checkMetadata(cc, "values");
  const always = alwaysValid(node.values, cc);
  const run = always ? null : compileNode(node.values, compileContext(cc, {}));
  const nullable = Boolean(node.nullable);
  const spec = typeErrorSpec(node, "object");
  return (data, c) => {
    const isObject = Boolean(data) && typeof data === "object" && !Array.isArray(data);
    let valid = nullable ? data === null : false;
    const cond = nullable ? !valid && isObject : isObject;
    if (always) {
      if (!(cond || valid)) report(c, makeError(c, node, "values", spec, data));
      return valid;
    }
    if (cond) {
      const path = c.errSchemaPath + "/values";
      let mapValid = true;
      for (const key in data) {
        const before = c.state.errors.length;
        run(
          data[key],
          childContext(c, {
            instancePath: c.instancePath + "/" + escapePointerToken(key),
            errSchemaPath: path,
            parentData: data,
            parentDataProperty: key,
          }),
        );
        if (c.state.abort) return false;
        if (c.state.errors.length !== before) {
          mapValid = false;
          if (!c.settings.allErrors) break;
        }
      }
      valid = mapValid;
    } else if (!valid) {
      report(c, makeError(c, node, "values", spec, data));
    }
    return valid;
  };
}

function compileMetadata(rule, node, cc) {
  checkMetadata(cc, "metadata");
  if (alwaysValid(node.metadata, cc)) return null;
  const run = compileNode(node.metadata, compileContext(cc, {jtdMetadata: true}));
  return (data, c) => {
    const before = c.state.errors.length;
    run(data, childContext(c, {errSchemaPath: c.errSchemaPath + "/metadata", jtdMetadata: true}));
    return c.state.errors.length === before;
  };
}

function compileUnion(rule, node, cc) {
  const branches = node.union;
  if (branches.some((branch) => alwaysValid(branch, cc))) return null;
  const runs = branches.map((branch, index) => ({
    index,
    run: compileNode(branch, compileContext(cc, {})),
  }));
  const spec = {params: {}, message: "must match a schema in union"};
  return (data, c) => {
    const errsCount = c.state.errors.length;
    let valid = false;
    for (const branch of runs) {
      if (c.state.abort) return false;
      const before = c.state.errors.length;
      branch.run(
        data,
        childContext(c, {
          errSchemaPath: c.errSchemaPath + "/union/" + branch.index,
          compositeRule: true,
        }),
      );
      if (c.state.errors.length === before) valid = true;
      if (valid) break;
    }
    if (valid) {
      c.state.errors.length = errsCount;
      if (errsCount === 0) c.state.empty = false;
    } else {
      reportExtra(c, makeError(c, node, "union", spec, data));
    }
    return valid;
  };
}

function schemaPropertyNames(map) {
  return map ? Object.keys(map).filter((key) => key !== "__proto__") : [];
}

function propertyInData(data, property, ownProperties) {
  return (
    data[property] !== undefined &&
    (!ownProperties || Object.prototype.hasOwnProperty.call(data, property))
  );
}

// ajv decides whether a key is additional by looking the key up in the schema
// map once the map has more than eight entries.
function isAdditional(key, props, propsSchema, jtdDiscriminator) {
  if (props.length > 8) {
    let additional = !Object.prototype.hasOwnProperty.call(propsSchema, key);
    if (jtdDiscriminator !== undefined) additional = additional && key !== jtdDiscriminator;
    return additional;
  }
  if (props.length || jtdDiscriminator !== undefined) {
    const names = jtdDiscriminator === undefined ? props : [jtdDiscriminator, ...props];
    return names.every((name) => key !== name);
  }
  return true;
}

function compileProperties(rule, node, cc) {
  return compilePropertiesKeyword("properties", node, cc);
}

function compileOptionalProperties(rule, node, cc) {
  if (node.properties !== undefined) return null;
  return compilePropertiesKeyword("optionalProperties", node, cc);
}

function compilePropertiesKeyword(keyword, node, cc) {
  checkMetadata(cc, keyword);
  const additional = node.additionalProperties;
  const nullable = Boolean(node.nullable);
  const discriminator = cc.jtdDiscriminator;
  if (discriminator !== undefined && nullable) {
    throw new Error("JTD: nullable inside discriminator mapping");
  }
  const propsSchema = node.properties;
  const optSchema = node.optionalProperties;
  if (propsSchema && optSchema) {
    for (const prop in propsSchema) {
      if (Object.prototype.hasOwnProperty.call(optSchema, prop)) {
        throw new Error("JTD: properties and optionalProperties have common members");
      }
    }
  }
  const allProps = schemaPropertyNames(propsSchema);
  if (discriminator !== undefined && allProps.includes(discriminator)) {
    throw new Error("JTD: discriminator tag used in properties");
  }
  const props = allProps.filter((prop) => !alwaysValid(propsSchema[prop], cc));
  const allOptProps = schemaPropertyNames(optSchema);
  if (discriminator !== undefined && allOptProps.includes(discriminator)) {
    throw new Error("JTD: discriminator tag used in optionalProperties");
  }
  const optProps = allOptProps.filter((prop) => !alwaysValid(optSchema[prop], cc));
  if (props.length === 0 && optProps.length === 0 && additional) return null;

  const compileProp = (map, prop) => ({
    name: prop,
    run: compileNode(map[prop], compileContext(cc, {})),
  });
  const compiledProps = props.map((prop) => compileProp(propsSchema, prop));
  const compiledOptProps = optProps.map((prop) => compileProp(optSchema, prop));
  const discriminatorMode = discriminator !== undefined;
  const spec = typeErrorSpec(node, "object");

  return (data, c) => {
    const isObject = Boolean(data) && typeof data === "object" && !Array.isArray(data);
    let valid = nullable ? data === null : false;
    const cond = discriminatorMode ? true : nullable ? !valid && isObject : isObject;
    if (cond) {
      valid = true;
      const basePath = c.errSchemaPath + "/" + keyword;
      let propValid = true;
      const runProps = (list, listKeyword, required) => {
        for (const prop of list) {
          if (!c.settings.allErrors && !propValid) break;
          if (propertyInData(data, prop.name, c.settings.ownProperties)) {
            const before = c.state.errors.length;
            prop.run(
              data[prop.name],
              childContext(c, {
                instancePath: c.instancePath + "/" + escapePointerToken(prop.name),
                errSchemaPath: c.errSchemaPath + "/" + listKeyword + "/" + escapeFragment(prop.name),
                parentData: data,
                parentDataProperty: prop.name,
              }),
            );
            if (c.state.abort) return false;
            propValid = c.state.errors.length === before;
          } else if (required) {
            propValid = false;
            report(
              c,
              makeError(
                c,
                node,
                keyword,
                {
                  schemaPath: basePath + "/" + escapePointerToken(prop.name),
                  params: {error: "missing", missingProperty: prop.name},
                  message: `must have property '${prop.name}'`,
                },
                data,
              ),
            );
          } else {
            propValid = true;
          }
        }
        return true;
      };
      if (runProps(compiledProps, "properties", true) === false) return false;
      if (runProps(compiledOptProps, "optionalProperties", false) === false) return false;
      if (!additional) {
        for (const key in data) {
          if (!c.settings.allErrors && !propValid) break;
          const addProp = isAdditional(key, allProps, propsSchema, discriminator);
          const addOptProp = isAdditional(key, allOptProps, optSchema, undefined);
          if (!(addProp && addOptProp)) continue;
          if (c.settings.removeAdditional) {
            delete data[key];
            continue;
          }
          report(
            c,
            makeError(
              c,
              node,
              keyword,
              {
                instancePath: c.instancePath + "/" + escapePointerToken(key),
                schemaPath: c.errSchemaPath,
                params: {error: "additional", additionalProperty: key},
                message: "must NOT have additional properties",
              },
              data,
            ),
          );
          if (!c.settings.allErrors) break;
        }
      }
    } else if (!valid) {
      report(c, makeError(c, node, keyword, spec, data));
    }
    return valid;
  };
}

function compileDiscriminator(rule, node, cc) {
  checkMetadata(cc, "discriminator");
  const tag = node.discriminator;
  const mapping = node.mapping;
  const nullable = Boolean(node.nullable);
  const entries = [];
  for (const tagValue in mapping) {
    entries.push({
      tagValue,
      run: compileNode(mapping[tagValue], compileContext(cc, {jtdDiscriminator: tag})),
    });
  }
  const spec = typeErrorSpec(node, "object");
  return (data, c) => {
    const isObject = Boolean(data) && typeof data === "object" && !Array.isArray(data);
    let valid = nullable ? data === null : false;
    const cond = nullable ? !valid && isObject : isObject;
    if (cond) {
      const tagValue = data[tag];
      if (tagValue === undefined) {
        report(
          c,
          makeError(
            c,
            node,
            "discriminator",
            {
              params: {error: "tag", tag, tagValue},
              message: `tag "${tag}" must be string`,
            },
            data,
          ),
        );
      } else if (typeof tagValue === "string") {
        let matched = false;
        for (const entry of entries) {
          if (entry.tagValue !== tagValue) continue;
          matched = true;
          const before = c.state.errors.length;
          entry.run(
            data,
            childContext(c, {
              errSchemaPath: c.errSchemaPath + "/mapping/" + escapeFragment(entry.tagValue),
              jtdDiscriminator: tag,
            }),
          );
          if (c.state.abort) return false;
          valid = c.state.errors.length === before;
          break;
        }
        if (!matched) {
          report(
            c,
            makeError(
              c,
              node,
              "discriminator",
              {
                instancePath: c.instancePath + "/" + escapePointerToken(tag),
                schemaPath: c.errSchemaPath + "/mapping",
                params: {error: "mapping", tag, tagValue},
                message: `value of tag "${tag}" must be in mapping`,
              },
              data,
            ),
          );
        }
      } else {
        report(
          c,
          makeError(
            c,
            node,
            "discriminator",
            {
              instancePath: c.instancePath + "/" + escapePointerToken(tag),
              params: {error: "tag", tag, tagValue},
              message: `tag "${tag}" must be string`,
            },
            data,
          ),
        );
      }
    } else if (!valid) {
      report(c, makeError(c, node, "discriminator", spec, data));
    }
    return valid;
  };
}

// ajv's JTD ref: a target that contains a reference is compiled into its own
// validation function, whose report is appended to the current one; anything
// else is inlined at the reference with the definition's schema path.
function hasRef(schema) {
  for (const key in schema) {
    let value;
    if (key === "ref" || (typeof (value = schema[key]) === "object" && hasRef(value))) return true;
  }
  return false;
}

// A definition compiled as its own schema environment is keyed by that
// environment's asynchronous flag, since the flag decides whether the
// compile-time rules inside it accept an asynchronous schema.
function compileDefinition(cc, target, envAsync) {
  let byEnvironment = cc.refs.get(target);
  if (byEnvironment === undefined) {
    byEnvironment = new Map();
    cc.refs.set(target, byEnvironment);
  }
  const existing = byEnvironment.get(envAsync);
  if (existing !== undefined) return existing;
  let run = null;
  const thunk = (data, c) => run(data, c);
  byEnvironment.set(envAsync, thunk);
  run = compileNode(target, compileContext(cc, {async: envAsync}));
  return thunk;
}

function compileRef(rule, node, cc) {
  checkMetadata(cc, "ref");
  const ref = node.ref;
  const definitions = cc.definitions;
  const target = definitions === undefined ? undefined : definitions[ref];
  if (!target) throw new MissingRefError("", ref, `No definition ${ref}`);
  const nullable = Boolean(node.nullable);
  const errSchemaPath = "/definitions/" + ref;
  const isolated = hasRef(target) || !cc.settings.inlineRefs;
  const run = compileDefinition(cc, target, isolated ? Boolean(target.$async) : cc.async);
  if (isolated && target.$async && !cc.async) {
    throw new Error("async schema referenced by sync schema");
  }
  return (data, c) => {
    if (nullable && data === null) return true;
    if (!isolated) {
      const before = c.state.errors.length;
      run(data, childContext(c, {errSchemaPath}));
      return c.state.errors.length === before;
    }
    const before = c.state.errors.length;
    const state = {errors: [], abort: false, empty: false};
    run(data, {...childContext(c, {errSchemaPath}), state, compositeRule: false});
    for (const error of state.errors) c.state.errors.push(error);
    return c.state.errors.length === before;
  };
}

function compileMacro(rule, node, cc, entry) {
  const keyword = rule.keyword;
  const macroSchema = entry.macro.call(cc.ajv, node[keyword], node, {opts: cc.opts, self: cc.ajv});
  if (macroSchema === undefined) throw new Error(`keyword "${keyword}" failed to compile`);
  if (cc.opts.validateSchema !== false) cc.ajv.validateSchema(macroSchema, true);
  const run = compileNode(macroSchema, compileContext(cc, {}));
  const spec = {params: {}, message: `must pass "${keyword}" keyword validation`};
  return (data, c) => {
    const before = c.state.errors.length;
    run(data, childContext(c, {errSchemaPath: c.errSchemaPath + "/" + keyword, compositeRule: true}));
    if (c.state.errors.length === before) return true;
    reportExtra(c, makeError(c, node, keyword, spec, data));
    return false;
  };
}

function compileValidate(rule, node, cc, entry) {
  const keyword = rule.keyword;
  const schemaValue = node[keyword];
  const spec = {params: {}, message: `must pass "${keyword}" keyword validation`};
  return (data, c) => {
    const dataCxt = {
      instancePath: c.instancePath,
      parentData: c.parentData,
      parentDataProperty: c.parentDataProperty,
      rootData: c.rootData,
    };
    if (entry.inspectErrors) entry.validate.errors = null;
    const passed = entry.passSchema
      ? entry.validate.call(cc.ajv, schemaValue, data, node, dataCxt)
      : entry.validate.call(cc.ajv, data, dataCxt);
    if (entry.modifying && c.parentData !== undefined) {
      c.nextData = c.parentData[c.parentDataProperty];
    }
    if (passed) return true;
    const ruleErrors = entry.inspectErrors ? entry.validate.errors : null;
    if (Array.isArray(ruleErrors)) {
      if (ruleErrors.length === 0) {
        pushErrors(c, ruleErrors);
        return false;
      }
      for (const error of ruleErrors) {
        if (error.instancePath === undefined) error.instancePath = c.instancePath;
        error.schemaPath = c.errSchemaPath + "/" + keyword;
        if (c.settings.verbose) {
          error.schema = schemaValue;
          error.data = c.nextData === undefined ? data : c.nextData;
        }
      }
      pushErrors(c, ruleErrors);
      return false;
    }
    report(c, makeError(c, node, keyword, spec, data));
    return false;
  };
}

function compileCustom(rule, node, cc) {
  const entry = rule.custom;
  if (entry.macro !== undefined) return compileMacro(rule, node, cc, entry);
  if (entry.async) throw new Error("async keyword in sync schema");
  if (entry.validate !== undefined) return compileValidate(rule, node, cc, entry);
  return null;
}

// --- schema compilation ---------------------------------------------------

const ALWAYS_VALID = () => true;

function compileNode(node, cc) {
  checkUnknownRules(node, cc);
  if (node.$async && !cc.async) throw new Error("async schema in sync schema");
  if (!hasRules(node, cc.rules)) return ALWAYS_VALID;
  const groups = [];
  const untyped = [];
  for (const rule of cc.rules.untyped) {
    if (!shouldUseRule(node, rule)) continue;
    const step = compileRule(rule, node, cc);
    if (step !== null) untyped.push(step);
  }
  if (untyped.length !== 0) groups.push({type: undefined, steps: untyped});
  for (const group of cc.rules.groups) {
    const steps = [];
    for (const rule of group.rules) {
      if (!shouldUseRule(node, rule)) continue;
      const step = compileRule(rule, node, cc);
      if (step !== null) steps.push(step);
    }
    if (steps.length !== 0) groups.push({type: group.type, steps});
  }
  if (groups.length === 0) return ALWAYS_VALID;
  return (data, c) => {
    const before = c.state.errors.length;
    let current = data;
    for (const group of groups) {
      if (c.state.abort) return false;
      if (!c.settings.allErrors && c.state.errors.length !== before) break;
      if (group.type !== undefined && !checkDataType(group.type, current, c.settings.strictNumbers)) {
        continue;
      }
      for (const step of group.steps) {
        const ok = step(current, c);
        if (c.state.abort) return false;
        if (c.nextData !== undefined) {
          current = c.nextData;
          c.nextData = undefined;
        }
        if (!ok && !c.settings.allErrors) break;
      }
    }
    return c.state.errors.length === before;
  };
}

function makeSettings(opts) {
  return {
    allErrors: opts.allErrors === true,
    removeAdditional: opts.removeAdditional || false,
    ownProperties: opts.ownProperties === true,
    strictNumbers: opts.strictNumbers !== false,
    verbose: opts.verbose === true,
    messages: opts.messages !== false,
    int32range: opts.int32range !== false,
    timestamp: opts.timestamp,
    allowDate: opts.allowDate === true,
    inlineRefs: opts.inlineRefs !== false,
    strictSchema: opts.strictSchema,
  };
}

function buildValidator(ajv, schema, opts) {
  const settings = makeSettings(opts);
  const async = Boolean(isObject(schema) && schema.$async);
  const cc = {
    ajv,
    opts,
    settings,
    rules: buildRules(ajv),
    root: schema,
    definitions: isObject(schema) ? schema.definitions : undefined,
    async,
    jtdMetadata: undefined,
    jtdDiscriminator: undefined,
    refs: new Map(),
  };
  const run = compileNode(schema, cc);
  const evaluate = (data) => {
    const state = {errors: [], abort: false, empty: false};
    const context = {
      state,
      settings,
      instancePath: "",
      errSchemaPath: "",
      jtdMetadata: undefined,
      jtdDiscriminator: undefined,
      compositeRule: false,
      parentData: undefined,
      parentDataProperty: undefined,
      rootData: data,
    };
    run(data, context);
    return state;
  };
  let validate;
  if (async) {
    // An asynchronous schema settles through a promise and reports its
    // failures as a ValidationError, exactly as ajv's does.
    validate = async (data) => {
      const state = evaluate(data);
      if (state.errors.length !== 0) throw new ValidationError(state.errors);
      return data;
    };
    validate.$async = true;
    validate.errors = null;
  } else {
    validate = (data) => {
      const state = evaluate(data);
      validate.errors = state.errors.length !== 0 ? state.errors : state.empty ? [] : null;
      return state.errors.length === 0;
    };
    validate.errors = null;
  }
  validate.schema = schema;
  return validate;
}

// --- serialization -------------------------------------------------------

// ajv's own quote runtime (ajv/dist/runtime/quote): the same escapable code
// points, escaped to the same sequences, leaving every other code point as
// written.
const QUOTE_ESCAPABLE =
  // eslint-disable-next-line no-control-regex
  /[\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
const QUOTE_ESCAPED = {
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\f": "\\f",
  "\r": "\\r",
  '"': '\\"',
  "\\": "\\\\",
};

function quote(value) {
  QUOTE_ESCAPABLE.lastIndex = 0;
  return (
    '"' +
    (QUOTE_ESCAPABLE.test(value)
      ? value.replace(QUOTE_ESCAPABLE, (character) => {
          const escaped = QUOTE_ESCAPED[character];
          return typeof escaped === "string"
            ? escaped
            : "\\u" + ("0000" + character.charCodeAt(0).toString(16)).slice(-4);
        })
      : value) +
    '"'
  );
}

// The form a schema carries, in ajv's order. A schema with none of them is
// serialized with JSON.stringify or parsed with JSON.parse, exactly as in ajv.
const JTD_FORMS = [
  "elements",
  "values",
  "discriminator",
  "properties",
  "optionalProperties",
  "enum",
  "type",
  "ref",
];

function serializeEmpty() {
  return (data) => "" + JSON.stringify(data);
}

function serializeElements(schema, definitions, holders, opts) {
  const run = compileSerialization(schema.elements, definitions, holders, opts);
  return (data) => {
    let json = "[";
    let first = true;
    for (const element of data) {
      if (first) first = false;
      else json += ",";
      json += run(element);
    }
    return json + "]";
  };
}

function serializeValues(schema, definitions, holders, opts) {
  const run = compileSerialization(schema.values, definitions, holders, opts);
  const ownProperties = opts.ownProperties === true;
  return (data) => {
    let json = "{";
    let first = true;
    const write = (key) => {
      if (first) first = false;
      else json += ",";
      json += quote(key) + ":";
      json += run(data[key]);
    };
    if (ownProperties) {
      for (const key of Object.keys(data)) write(key);
    } else {
      for (const key in data) write(key);
    }
    return json + "}";
  };
}

function serializeDiscriminator(schema, definitions, holders, opts) {
  const discriminator = schema.discriminator;
  const entries = [];
  for (const tagValue in schema.mapping) {
    entries.push({
      tagValue,
      run: compilePropertiesFragment(
        schema.mapping[tagValue],
        discriminator,
        definitions,
        holders,
        opts,
      ),
    });
  }
  const prefix = "{" + JSON.stringify(discriminator) + ":";
  return (data) => {
    const tag = data[discriminator];
    let json = prefix + quote(tag);
    for (const entry of entries) {
      if (tag === entry.tagValue) {
        json += entry.run(data, false);
        break;
      }
    }
    return json + "}";
  };
}

function serializeProperties(schema, definitions, holders, opts) {
  const run = compilePropertiesFragment(schema, undefined, definitions, holders, opts);
  return (data) => "{" + run(data, true) + "}";
}

function compilePropertiesFragment(schema, discriminator, definitions, holders, opts) {
  const {properties, optionalProperties} = schema;
  const props = properties ? Object.keys(properties) : [];
  const optProps = optionalProperties ? Object.keys(optionalProperties) : [];
  const allProps = props.concat(optProps);
  if (discriminator !== undefined) allProps.push(discriminator);
  if (new Set(allProps).size !== allProps.length) {
    throw new Error("JTD: properties/optionalProperties/disciminator overlap");
  }

  const required = props.map((key) => ({
    key,
    name: JSON.stringify(key),
    run: compileSerialization(properties[key], definitions, holders, opts),
  }));
  const optional = optProps.map((key) => ({
    key,
    name: JSON.stringify(key),
    run: compileSerialization(optionalProperties[key], definitions, holders, opts),
  }));
  const additional = Boolean(schema.additionalProperties);
  const excluded = new Set(allProps);
  const ownProperties = opts.ownProperties === true;
  const empty = additional ? serializeEmpty() : undefined;

  return (data, first) => {
    let json = "";
    const addComma = () => {
      if (first) first = false;
      else json += ",";
    };
    for (const property of required) {
      addComma();
      json += property.name + ":";
      json += property.run(data[property.key]);
    }
    for (const property of optional) {
      const value = data[property.key];
      if (value !== undefined && Object.prototype.hasOwnProperty.call(data, property.key)) {
        addComma();
        json += property.name + ":";
        json += property.run(value);
      }
    }
    if (additional) {
      const write = (key) => {
        if (excluded.has(key)) return;
        addComma();
        json += quote(key) + ":";
        json += empty(data[key]);
      };
      if (ownProperties) {
        for (const key of Object.keys(data)) write(key);
      } else {
        for (const key in data) write(key);
      }
    }
    return json;
  };
}

function serializeType(schema, definitions, holders, opts) {
  const type = schema.type;
  if (type === "boolean") return (data) => (data ? "true" : "false");
  if (type === "string") return quote;
  if (type === "timestamp") {
    return (data) =>
      data instanceof Date ? '"' + data.toISOString() + '"' : quote(data);
  }
  const specialNumbers = opts.specialNumbers;
  if (specialNumbers === undefined || specialNumbers === "fast") {
    return (data) => "" + data;
  }
  // specialNumbers: "null"
  return (data) =>
    data === Infinity || data === -Infinity || data !== data ? "null" : "" + data;
}

function serializeRef(schema, definitions, holders, opts) {
  const ref = schema.ref;
  const refSchema = definitions[ref];
  if (!refSchema) throw new MissingRefError("", ref, `No definition ${ref}`);
  // A definition that itself refers to a definition becomes a function ajv's
  // generated code can call, which is what makes recursive definitions work.
  const isolated = hasRef(refSchema);
  if (!isolated) return compileSerialization(refSchema, definitions, holders, opts);
  let holder = holders.get(refSchema);
  if (holder === undefined) {
    holder = {run: null};
    holders.set(refSchema, holder);
    holder.run = compileSerialization(refSchema, definitions, holders, opts);
  }
  return (data) => holder.run(data);
}

const SERIALIZE_FORMS = {
  elements: serializeElements,
  values: serializeValues,
  discriminator: serializeDiscriminator,
  properties: serializeProperties,
  optionalProperties: serializeProperties,
  enum: () => quote,
  type: serializeType,
  ref: serializeRef,
};

function compileSerialization(schema, definitions, holders, opts) {
  let form;
  for (const key of JTD_FORMS) {
    if (key in schema) {
      form = key;
      break;
    }
  }
  const run =
    form === undefined
      ? serializeEmpty()
      : SERIALIZE_FORMS[form](schema, definitions, holders, opts);
  if (!schema.nullable) return run;
  return (data) => (data === undefined || data === null ? "null" : run(data));
}

function buildSerializer(ajv, schema) {
  const definitions = schema.definitions || {};
  const run = compileSerialization(schema, definitions, new Map(), ajv.opts);
  return function serialize(data) {
    return run(data);
  };
}

// --- parsing --------------------------------------------------------------

// ajv's JSON Type Definition parser is generated code around the helpers in
// `ajv/dist/runtime/parseJson`. The functions below reproduce that generated
// code's behaviour: the same accepted grammar (which is close to JSON but not
// the same), the same reported messages, and the same offsets.

const RX_PARSE_JSON = /position\s(\d+)(?: \(line \d+ column \d+\))?$/;

const ESCAPED_CHARS = {
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  '"': '"',
  "/": "/",
  "\\": "\\",
};

const CODE_A = "a".charCodeAt(0);
const CODE_0 = "0".charCodeAt(0);

function parseJsonValue(json, pos) {
  let endPos;
  if (pos) json = json.slice(pos);
  try {
    const value = JSON.parse(json);
    return {value, message: undefined, position: pos + json.length};
  } catch (error) {
    const matches = RX_PARSE_JSON.exec(error.message);
    if (!matches) {
      return {value: undefined, message: "unexpected end", position: pos + json.length};
    }
    endPos = +matches[1];
    const character = json[endPos];
    json = json.slice(0, endPos);
    const position = pos + endPos;
    try {
      return {value: JSON.parse(json), message: undefined, position};
    } catch {
      return {value: undefined, message: `unexpected token ${character}`, position};
    }
  }
}

function parseJsonNumberValue(json, pos, maxDigits) {
  let numStr = "";
  let character;
  if (json[pos] === "-") {
    numStr += "-";
    pos++;
  }
  if (json[pos] === "0") {
    numStr += "0";
    pos++;
  } else if (!parseDigits(maxDigits)) {
    return numberError();
  }
  if (maxDigits) {
    return {value: +numStr, message: undefined, position: pos};
  }
  if (json[pos] === ".") {
    numStr += ".";
    pos++;
    if (!parseDigits()) return numberError();
  }
  if (((character = json[pos]), character === "e" || character === "E")) {
    numStr += "e";
    pos++;
    if (((character = json[pos]), character === "+" || character === "-")) {
      numStr += character;
      pos++;
    }
    if (!parseDigits()) return numberError();
  }
  return {value: +numStr, message: undefined, position: pos};

  function parseDigits(maxLen) {
    let digit = false;
    while (((character = json[pos]), character >= "0" && character <= "9" && (maxLen === undefined || maxLen-- > 0))) {
      digit = true;
      numStr += character;
      pos++;
    }
    return digit;
  }

  function numberError() {
    return {
      value: undefined,
      message: pos < json.length ? `unexpected token ${json[pos]}` : "unexpected end",
      position: pos,
    };
  }
}

function parseJsonStringValue(json, pos) {
  let str = "";
  let character;
  while (true) {
    character = json[pos++];
    if (character === '"') break;
    if (character === "\\") {
      character = json[pos];
      if (character in ESCAPED_CHARS) {
        str += ESCAPED_CHARS[character];
        pos++;
      } else if (character === "u") {
        pos++;
        let count = 4;
        let code = 0;
        while (count--) {
          code <<= 4;
          character = json[pos];
          if (character === undefined) return stringError("unexpected end");
          character = character.toLowerCase();
          if (character >= "a" && character <= "f") {
            code += character.charCodeAt(0) - CODE_A + 10;
          } else if (character >= "0" && character <= "9") {
            code += character.charCodeAt(0) - CODE_0;
          } else {
            return stringError(`unexpected token ${character}`);
          }
          pos++;
        }
        str += String.fromCharCode(code);
      } else {
        return stringError(`unexpected token ${character}`);
      }
    } else if (character === undefined) {
      return stringError("unexpected end");
    } else if (character.charCodeAt(0) >= 0x20) {
      str += character;
    } else {
      return stringError(`unexpected token ${character}`);
    }
  }
  return {value: str, message: undefined, position: pos};

  function stringError(message) {
    return {value: undefined, message, position: pos};
  }
}

function skipWhitespace(state) {
  const {json} = state;
  let pos = state.pos;
  let character;
  while (
    (character = json[pos], character === " " || character === "\n" || character === "\r" || character === "\t")
  ) {
    pos++;
  }
  state.pos = pos;
}

function jsonSlice(state, length) {
  return length === 1
    ? state.json[state.pos]
    : state.json.slice(state.pos, state.pos + length);
}

function failParse(state, message) {
  state.failed = true;
  state.message = message;
  return undefined;
}

function jsonSyntaxError(state) {
  return failParse(state, "unexpected token " + state.json[state.pos]);
}

function parseToken(state, token) {
  skipWhitespace(state);
  if (jsonSlice(state, token.length) === token) {
    state.pos += token.length;
    return true;
  }
  jsonSyntaxError(state);
  return false;
}

function tryParseToken(state, token, success) {
  skipWhitespace(state);
  if (jsonSlice(state, token.length) !== token) return false;
  state.pos += token.length;
  success();
  return true;
}

function partialParse(state, result) {
  state.pos = result.position;
  if (result.value === undefined) {
    state.failed = true;
    state.message = result.message;
    return undefined;
  }
  return result.value;
}

function parseEmpty(state) {
  return partialParse(state, parseJsonValue(state.json, state.pos));
}

function parseString(state) {
  if (!parseToken(state, '"')) return undefined;
  return partialParse(state, parseJsonStringValue(state.json, state.pos));
}

function parseNumber(state, maxDigits) {
  skipWhitespace(state);
  if ("-0123456789".indexOf(jsonSlice(state, 1)) < 0) return jsonSyntaxError(state);
  return partialParse(state, parseJsonNumberValue(state.json, state.pos, maxDigits));
}

// `tryParseItems` is ajv's item loop: a comma ends an item, a comma followed
// by the closing token is an error (the parser is not lenient about trailing
// commas), and the closing token itself is parsed by `parseItems`.
function tryParseItems(state, endToken, block, stop) {
  while (!state.failed && state.pos < state.json.length && jsonSlice(state, 1) !== endToken) {
    block();
    if (state.failed) return;
    if (stop !== undefined && stop()) return;
    if (!tryParseToken(state, ",", () => {})) return;
    if (tryParseToken(state, endToken, () => jsonSyntaxError(state))) return;
  }
}

function parseItems(state, endToken, block) {
  tryParseItems(state, endToken, block);
  if (state.failed) return false;
  return parseToken(state, endToken);
}

function compileParseElements(ajv, schema, definitions, holders) {
  const run = compileParseCode(ajv, schema.elements, definitions, holders);
  return (state) => {
    if (!parseToken(state, "[")) return undefined;
    const data = [];
    parseItems(state, "]", () => {
      const element = run(state);
      if (state.failed || element === undefined) return;
      data.push(element);
    });
    if (state.failed) return undefined;
    return data;
  };
}

function compileParseValues(ajv, schema, definitions, holders) {
  const run = compileParseCode(ajv, schema.values, definitions, holders);
  return (state) => {
    if (!parseToken(state, "{")) return undefined;
    const data = {};
    parseItems(state, "}", () => {
      const key = parseString(state);
      if (state.failed) return;
      if (!parseToken(state, ":")) return;
      const value = run(state);
      if (state.failed || value === undefined) return;
      data[key] = value;
      if (data[key] === undefined) {
        failParse(state, undefined);
      }
    });
    if (state.failed) return undefined;
    return data;
  };
}

function compileParseObjectBody(ajv, schema, definitions, holders, discriminator) {
  const {properties, optionalProperties, additionalProperties} = schema;
  const entries = [];
  for (const key in properties) {
    entries.push({key, run: compileParseCode(ajv, properties[key], definitions, holders)});
  }
  for (const key in optionalProperties) {
    entries.push({key, run: compileParseCode(ajv, optionalProperties[key], definitions, holders)});
  }
  let required;
  if (properties) {
    const keys = Object.keys(properties);
    // ajv builds its required-properties condition with `and(...keys)`, and
    // `and` reduces an empty list without an initial value.
    if (keys.length === 0) throw new TypeError("Reduce of empty array with no initial value");
    required = keys;
  }
  const additional = Boolean(additionalProperties);

  return (state, data) => {
    parseItems(state, "}", () => {
      const key = parseString(state);
      if (state.failed) return;
      if (!parseToken(state, ":")) return;
      for (const entry of entries) {
        if (key !== entry.key) continue;
        const value = entry.run(state);
        if (state.failed || value === undefined) return;
        data[key] = value;
        if (data[key] === undefined) failParse(state, undefined);
        return;
      }
      if (discriminator !== undefined && key === discriminator) {
        parseString(state);
        return;
      }
      if (additional) {
        const value = parseEmpty(state);
        if (state.failed || value === undefined) return;
        data[key] = value;
        if (data[key] === undefined) failParse(state, undefined);
        return;
      }
      failParse(state, "property " + key + " not allowed");
    });
    if (state.failed) return undefined;
    if (required !== undefined) {
      for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) {
          return failParse(state, "missing required properties");
        }
      }
    }
    return data;
  };
}

function compileParseProperties(ajv, schema, definitions, holders) {
  const body = compileParseObjectBody(ajv, schema, definitions, holders, undefined);
  return (state) => {
    if (!parseToken(state, "{")) return undefined;
    const data = {};
    return body(state, data);
  };
}

function compileParseDiscriminator(ajv, schema, definitions, holders) {
  const {discriminator, mapping} = schema;
  const entries = [];
  for (const tagValue in mapping) {
    entries.push({
      tagValue,
      run: compileParseObjectBody(ajv, mapping[tagValue], definitions, holders, discriminator),
    });
  }
  return (state) => {
    if (!parseToken(state, "{")) return undefined;
    const data = {};
    const startPos = state.pos;
    let tag;
    let found = false;
    tryParseItems(
      state,
      "}",
      () => {
        const key = parseString(state);
        if (state.failed) return;
        if (!parseToken(state, ":")) return;
        if (key === discriminator) {
          const value = parseString(state);
          if (state.failed) return;
          tag = value;
          data[key] = value;
          found = true;
        } else {
          parseEmpty(state);
        }
      },
      () => found,
    );
    if (state.failed) return undefined;
    state.pos = startPos;
    if (tag === undefined) return failParse(state, "discriminator tag not found");
    for (const entry of entries) {
      if (tag === entry.tagValue) return entry.run(state, data);
    }
    return failParse(state, "discriminator value not in schema");
  };
}

function compileParseEnum(ajv, schema) {
  const enumSch = schema.enum;
  const valueStrs = [];
  for (const value of enumSch) valueStrs.push({value, valueStr: JSON.stringify(value).slice(1)});
  return (state) => {
    if (!parseToken(state, '"')) return undefined;
    for (const {value, valueStr} of valueStrs) {
      if (jsonSlice(state, valueStr.length) === valueStr) {
        state.pos += valueStr.length;
        return value;
      }
    }
    return jsonSyntaxError(state);
  };
}

function compileParseType(ajv, schema) {
  const type = schema.type;
  if (type === "boolean") {
    return (state) => {
      if (tryParseToken(state, "true", () => {})) return true;
      if (state.failed) return undefined;
      if (tryParseToken(state, "false", () => {})) return false;
      if (state.failed) return undefined;
      return jsonSyntaxError(state);
    };
  }
  if (type === "string") return parseString;
  if (type === "timestamp") {
    const allowDate = Boolean(ajv.opts.allowDate);
    const parseDate = Boolean(ajv.opts.parseDate);
    return (state) => {
      const value = parseString(state);
      if (state.failed || value === undefined) return undefined;
      if (!validTimestamp(value, allowDate)) return failParse(state, "invalid timestamp");
      if (!parseDate) return value;
      const date = new Date(value);
      if (Number.isNaN(date.valueOf())) return failParse(state, "invalid timestamp");
      return date;
    };
  }
  if (type === "float32" || type === "float64") {
    return (state) => parseNumber(state);
  }
  const int32range = ajv.opts.int32range === undefined ? true : ajv.opts.int32range;
  if (!int32range && (type === "int32" || type === "uint32")) {
    return (state) => {
      const value = parseNumber(state, 16);
      if (state.failed || value === undefined) return undefined;
      if (type === "uint32" && value < 0) return failParse(state, "integer out of range");
      return value;
    };
  }
  const [min, max, maxDigits] = INT_RANGE[type];
  return (state) => {
    const value = parseNumber(state, maxDigits);
    if (state.failed || value === undefined) return undefined;
    if (value < min || value > max) return failParse(state, "integer out of range");
    return value;
  };
}

function compileParseRef(ajv, schema, definitions, holders) {
  const ref = schema.ref;
  const refSchema = definitions[ref];
  if (!refSchema) throw new MissingRefError("", ref, `No definition ${ref}`);
  if (!hasRef(refSchema)) return compileParseCode(ajv, refSchema, definitions, holders);
  let holder = holders.get(refSchema);
  if (holder === undefined) {
    holder = {parse: null};
    holders.set(refSchema, holder);
    holder.parse = createParserFunction(ajv, refSchema, definitions, holders);
  }
  return (state) => {
    const child = holder.parse;
    const value = child(state.json, state.pos, true);
    state.pos = child.position;
    if (value === undefined) {
      state.failed = true;
      state.message = child.message;
      return undefined;
    }
    return value;
  };
}

const PARSE_FORMS = {
  elements: compileParseElements,
  values: compileParseValues,
  discriminator: compileParseDiscriminator,
  properties: compileParseProperties,
  optionalProperties: compileParseProperties,
  enum: compileParseEnum,
  type: compileParseType,
  ref: compileParseRef,
};

function compileParseCode(ajv, schema, definitions, holders) {
  let form;
  for (const key of JTD_FORMS) {
    if (key in schema) {
      form = key;
      break;
    }
  }
  if (form === undefined) return parseEmpty;
  const run = PARSE_FORMS[form](ajv, schema, definitions, holders, undefined);
  if (!schema.nullable) return run;
  return (state) => {
    if (tryParseToken(state, "null", () => {})) return null;
    if (state.failed) return undefined;
    return run(state);
  };
}

function createParserFunction(ajv, schema, definitions, holders) {
  const run = compileParseCode(ajv, schema, definitions, holders);
  return function parse(json, jsonPos, jsonPart) {
    parse.message = undefined;
    parse.position = undefined;
    const state = {
      json,
      pos: jsonPos || 0,
      failed: false,
      message: undefined,
    };
    const data = run(state);
    if (!state.failed) {
      skipWhitespace(state);
      if (jsonPart) {
        parse.position = state.pos;
        return data;
      }
      if (state.pos === json.length) return data;
      jsonSyntaxError(state);
    }
    parse.message = state.message;
    parse.position = state.pos;
    return undefined;
  };
}

function buildParser(ajv, schema) {
  const definitions = schema.definitions || {};
  return createParserFunction(ajv, schema, definitions, new Map());
}

// --- the ajv/dist/jtd entry point ----------------------------------------

class AjvJTD extends Ajv {
  constructor(options = {}) {
    const strictSchema =
      options.strictSchema !== undefined
        ? options.strictSchema
        : options.strict !== undefined
          ? options.strict
          : true;
    super({schemaId: "$id", ...options, jtd: true, strictSchema});
    // ajv leaves `errors` unset until a schema or document is validated.
    this.errors = undefined;
    // Compilation environments for the parser and serializer, keyed by the
    // schema object, mirroring ajv's schema cache: a schema object is
    // validated once and its compiled functions are kept together.
    this._jtdCache = new Map();
  }

  _initMeta() {
    this._metaSchemaCache = new WeakMap();
    if (this.opts.meta === false) return;
    this.schemas[META_SCHEMA_ID] = {schema: jtdMetaSchema, meta: true};
  }

  defaultMeta() {
    return (this.opts.defaultMeta =
      this.opts.defaultMeta || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : undefined));
  }

  _prepareJtdSchema(schema) {
    let id;
    if (typeof schema === "object") {
      id = schema[this.opts.schemaId];
    } else {
      throw new Error("schema must be object");
    }

    let entry = this._jtdCache.get(schema);
    if (entry === undefined) {
      entry = {serialize: undefined, parse: undefined};
      // ajv caches the schema environment before validating it, so a schema
      // that fails one attempt is not validated again on the next.
      this._jtdCache.set(schema, entry);
      const baseId = id ? id.replace(/#\/?$/, "") : "";
      if (!baseId.startsWith("#")) {
        if (baseId) {
          const existing = this.schemas[baseId] || this.refs[baseId];
          if (existing !== undefined && existing.schema !== schema) {
            throw new Error(`schema with key or id "${baseId}" already exists`);
          }
          if (existing === undefined) this.refs[baseId] = {schema};
        } else {
          this.refs[baseId] = {schema};
        }
      }
      if (this.opts.validateSchema !== false) this.validateSchema(schema, true);
    }
    return entry;
  }

  compileSerializer(schema) {
    const entry = this._prepareJtdSchema(schema);
    if (entry.serialize === undefined) entry.serialize = buildSerializer(this, schema);
    return entry.serialize;
  }

  compileParser(schema) {
    const entry = this._prepareJtdSchema(schema);
    if (entry.parse === undefined) entry.parse = buildParser(this, schema);
    return entry.parse;
  }

  compile(schema) {
    let id;
    if (typeof schema === "object") {
      id = schema[this.opts.schemaId];
    } else {
      throw new Error("schema must be object");
    }
    const cached = this._schemaCache.get(schema);
    if (cached !== undefined) return cached;
    if (this.opts.validateSchema !== false) this.validateSchema(schema, true);
    const validate = buildValidator(this, schema, this.opts);
    this._schemaCache.set(schema, validate);
    if (typeof id === "string" && id !== "" && !id.startsWith("#")) {
      const existing = this.schemas[id] || this.refs[id];
      if (existing !== undefined) {
        if (existing.schema !== schema) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
        if (existing.validate === undefined) existing.validate = validate;
      } else {
        this.refs[id] = {schema, validate};
      }
    }
    return validate;
  }

  addSchema(schema, key, _meta, _validateSchema) {
    if (Array.isArray(schema)) {
      for (const item of schema) this.addSchema(item, undefined, _meta, _validateSchema);
      return this;
    }
    let id;
    if (typeof schema === "object") {
      id = schema[this.opts.schemaId];
      if (id !== undefined && typeof id !== "string") {
        throw new Error(`schema ${this.opts.schemaId} must be string`);
      }
    } else {
      throw new Error("schema must be object");
    }
    const name = key || id || "";
    if (this.schemas[name] || this.refs[name]) {
      throw new Error(`schema with key or id "${name}" already exists`);
    }
    if (_validateSchema !== false && this.opts.validateSchema !== false) {
      this.validateSchema(schema, true);
    }
    this.schemas[name] = {schema};
    return this;
  }

  getSchema(ref) {
    const entry = this.schemas[ref] !== undefined ? this.schemas[ref] : this.refs[ref];
    if (entry === undefined) return undefined;
    if (entry.validate !== undefined) return entry.validate;
    const meta = entry.meta === true;
    const cache = meta ? this._metaSchemaCache : this._schemaCache;
    let validate = entry.schema === undefined ? undefined : cache.get(entry.schema);
    if (validate === undefined) {
      validate = buildValidator(this, entry.schema, meta ? this._metaOpts : this.opts);
      if (entry.schema !== undefined) cache.set(entry.schema, validate);
    }
    entry.validate = validate;
    return validate;
  }

  validate(schema, data) {
    const validate = this.compile(schema);
    const valid = validate(data);
    this.errors = validate.errors;
    return valid;
  }

  validateSchema(schema, throwOrLogError) {
    if (typeof schema === "boolean") return true;
    let metaRef = schema.$schema;
    if (metaRef !== undefined && typeof metaRef !== "string") {
      throw new Error("$schema must be a string");
    }
    metaRef = metaRef || this.opts.defaultMeta || this.defaultMeta();
    if (!metaRef) {
      console.warn("meta-schema not available");
      this.errors = null;
      return true;
    }
    const validate = this.getSchema(metaRef);
    if (!validate) throw new Error(`no schema with key or ref "${metaRef}"`);
    const valid = validate(schema);
    this.errors = validate.errors;
    if (!valid && throwOrLogError) {
      const message = "schema is invalid: " + this.errorsText(this.errors);
      if (this.opts.validateSchema === "log") console.error(message);
      else throw new Error(message);
    }
    return valid;
  }

  removeSchema(ref) {
    if (ref === undefined) {
      for (const key of Object.keys(this.schemas)) {
        if (this.schemas[key].meta !== true) delete this.schemas[key];
      }
      for (const key of Object.keys(this.refs)) delete this.refs[key];
      return this;
    }
    if (ref instanceof RegExp) {
      for (const key of Object.keys(this.schemas)) {
        if (this.schemas[key].meta !== true && ref.test(key)) delete this.schemas[key];
      }
      for (const key of Object.keys(this.refs)) {
        if (ref.test(key)) delete this.refs[key];
      }
      return this;
    }
    delete this.schemas[ref];
    delete this.refs[ref];
    return this;
  }

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

    const names = Array.isArray(keyword) ? keyword : [keyword];
    if (names.length === 0 || names.some((name) => typeof name !== "string")) {
      throw new Error("addKeywords: keyword must be string or non-empty array");
    }
    for (const name of names) {
      if (this.keywords.has(name) || JTD_KNOWN_KEYWORDS.has(name)) {
        throw new Error(`Keyword ${name} is already defined`);
      }
      if (!KEYWORD_NAME.test(name)) throw new Error(`Keyword ${name} has invalid name`);
    }
    if (def !== undefined && !isObject(def)) {
      throw new Error(
        `keyword "${names[0]}" must be defined by an object with a validate function or a macro`,
      );
    }
    if (isObject(def)) {
      const field = unsupportedField(def);
      if (field !== undefined) {
        throw new Error(
          `keyword "${names[0]}" uses "${field}", which is not supported: ` +
            "only synchronous validation rules and macros are supported",
        );
      }
      if (def.macro !== undefined) {
        if (typeof def.macro !== "function") {
          throw new Error(`keyword "${names[0]}" must have a macro function`);
        }
        const macroEntry = {
          keyword: names[0],
          types: jsonTypes(def.type),
          macro: def.macro,
          validate: undefined,
          schemaType: def.schemaType,
          rule: true,
        };
        for (const name of names) this.keywords.set(name, {...macroEntry, keyword: name});
        this._keywordRevision++;
        return this;
      }
      if (def.validate !== undefined && typeof def.validate !== "function") {
        throw new Error(`keyword "${names[0]}" must have a validate function`);
      }
    }

    const entry = {
      keyword: names[0],
      types: def === undefined ? [] : jsonTypes(def.type),
      validate: def === undefined ? undefined : def.validate,
      macro: undefined,
      async: def !== undefined && def.async === true,
      inspectErrors: def === undefined ? true : def.errors !== false,
      modifying: def !== undefined && def.modifying === true,
      passSchema: def === undefined ? true : def.schema !== false,
      schemaType: def === undefined ? undefined : def.schemaType,
      rule: def !== undefined,
    };
    for (const name of names) this.keywords.set(name, {...entry, keyword: name});
    this._keywordRevision++;
    return this;
  }
}

AjvJTD.ValidationError = ValidationError;
AjvJTD.MissingRefError = MissingRefError;

module.exports = AjvJTD;
module.exports.default = AjvJTD;
module.exports.Ajv = AjvJTD;
module.exports.ValidationError = ValidationError;
module.exports.MissingRefError = MissingRefError;
