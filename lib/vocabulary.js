"use strict";

// The vocabulary each entry point publishes through `getKeyword`, declared in
// the shape ajv reports: a rule's answer is the definition it was registered
// with, with `type` and `schemaType` normalised to arrays, and a keyword the
// vocabulary knows without a rule of its own answers `false`.
//
// The keywords themselves are compiled by ./compile.js and ./jtd.js. The
// `code` functions declared here only carry the shape of ajv's registrations;
// an extension reads the vocabulary through `getKeyword`, it does not run a
// built-in rule from the returned declaration.

const {isObject} = require("./util");

const JSON_TYPES = new Set(["string", "number", "integer", "boolean", "null", "object", "array"]);

function jsonTypes(value) {
  const types = Array.isArray(value) ? value.slice() : value ? [value] : [];
  if (types.every((type) => JSON_TYPES.has(type))) return types;
  throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
}

// ajv stores every registration as `{...definition, type, schemaType}`: the
// caller's declarations, with the keyword's accepted types as arrays.
function normalizeDefinition(definition) {
  return {
    ...definition,
    type: jsonTypes(definition.type),
    schemaType: jsonTypes(definition.schemaType),
  };
}

// The registration `getKeyword` reports for a definition a project supplied.
// ajv compiles the value schema at registration time and reports it alongside
// the declaration, and it reports nothing for a keyword registered by name
// alone.
function keywordRegistration(definition, validateSchema) {
  if (!isObject(definition)) return undefined;
  const registration = {...definition};
  if (definition.metaSchema !== undefined) registration.validateSchema = validateSchema;
  registration.type = jsonTypes(definition.type);
  registration.schemaType = jsonTypes(definition.schemaType);
  return registration;
}

function code() {}

const COMPARISON = {
  maximum: "<=",
  minimum: ">=",
  exclusiveMaximum: "<",
  exclusiveMinimum: ">",
};

const limitNumberError = {
  message({keyword, schemaCode}) {
    return `must be ${COMPARISON[keyword]} ${schemaCode}`;
  },
  params({keyword, schemaCode}) {
    return `{comparison: ${JSON.stringify(COMPARISON[keyword])}, limit: ${schemaCode}}`;
  },
};

const multipleOfError = {
  message({schemaCode}) {
    return `must be multiple of ${schemaCode}`;
  },
  params({schemaCode}) {
    return `{multipleOf: ${schemaCode}}`;
  },
};

const limitLengthError = {
  message({keyword, schemaCode}) {
    const comparison = keyword === "maxLength" ? "more" : "fewer";
    return `must NOT have ${comparison} than ${schemaCode} characters`;
  },
  params({schemaCode}) {
    return `{limit: ${schemaCode}}`;
  },
};

const limitPropertiesError = {
  message({keyword, schemaCode}) {
    const comparison = keyword === "maxProperties" ? "more" : "fewer";
    return `must NOT have ${comparison} than ${schemaCode} properties`;
  },
  params({schemaCode}) {
    return `{limit: ${schemaCode}}`;
  },
};

const limitItemsError = {
  message({keyword, schemaCode}) {
    const comparison = keyword === "maxItems" ? "more" : "fewer";
    return `must NOT have ${comparison} than ${schemaCode} items`;
  },
  params({schemaCode}) {
    return `{limit: ${schemaCode}}`;
  },
};

const itemLimitError = {
  message({params: {len}}) {
    return `must NOT have more than ${len} items`;
  },
  params({params: {len}}) {
    return `{limit: ${len}}`;
  },
};

const patternError = {
  message({schemaCode}) {
    return `must match pattern "${schemaCode}"`;
  },
  params({schemaCode}) {
    return `{pattern: ${schemaCode}}`;
  },
};

const requiredError = {
  message({params: {missingProperty}}) {
    return `must have required property '${missingProperty}'`;
  },
  params({params: {missingProperty}}) {
    return `{missingProperty: ${missingProperty}}`;
  },
};

const uniqueItemsError = {
  message({params: {i, j}}) {
    return `must NOT have duplicate items (items ## ${j} and ${i} are identical)`;
  },
  params({params: {i, j}}) {
    return `{i: ${i}, j: ${j}}`;
  },
};

const constError = {
  message: "must be equal to constant",
  params({schemaCode}) {
    return `{allowedValue: ${schemaCode}}`;
  },
};

const enumError = {
  message: "must be equal to one of the allowed values",
  params({schemaCode}) {
    return `{allowedValues: ${schemaCode}}`;
  },
};

const containsError = {
  message({params: {min, max}}) {
    return max === undefined
      ? `must contain at least ${min} valid item(s)`
      : `must contain at least ${min} and no more than ${max} valid item(s)`;
  },
  params({params: {min, max}}) {
    return max === undefined
      ? `{minContains: ${min}}`
      : `{minContains: ${min}, maxContains: ${max}}`;
  },
};

const dependenciesError = {
  message({params: {property, depsCount, deps}}) {
    const properties = depsCount === 1 ? "property" : "properties";
    return `must have ${properties} ${deps} when property ${property} is present`;
  },
  params({params: {property, depsCount, deps, missingProperty}}) {
    return (
      `{property: ${property}, missingProperty: ${missingProperty}, ` +
      `depsCount: ${depsCount}, deps: ${deps}}`
    );
  },
};

const ifError = {
  message({params}) {
    return `must match "${params.ifClause}" schema`;
  },
  params({params}) {
    return `{failingKeyword: ${params.ifClause}}`;
  },
};

const additionalPropertiesError = {
  message: "must NOT have additional properties",
  params({params}) {
    return `{additionalProperty: ${params.additionalProperty}}`;
  },
};

const oneOfError = {
  message: "must match exactly one schema in oneOf",
  params({params}) {
    return `{passingSchemas: ${params.passing}}`;
  },
};

const propertyNamesError = {
  message: "property name must be valid",
  params({params}) {
    return `{propertyName: ${params.propertyName}}`;
  },
};

const unevaluatedPropertiesError = {
  message: "must NOT have unevaluated properties",
  params({params}) {
    return `{unevaluatedProperty: ${params.unevaluatedProperty}}`;
  },
};

// The format rule's declaration, which lib/ajv.js also exposes as
// `RULES.all.format.definition` for extensions that compile against it.
const FORMAT_RULE_DEFINITION = normalizeDefinition({
  keyword: "format",
  type: ["number", "string"],
  schemaType: ["string"],
  $data: true,
  error: {
    message({schemaCode}) {
      return `must match format "${schemaCode}"`;
    },
    params({schemaCode}) {
      return `{format: ${schemaCode}}`;
    },
  },
  code,
});

function addDefinition(map, definition) {
  const normalized =
    definition === FORMAT_RULE_DEFINITION ? definition : normalizeDefinition(definition);
  const names = Array.isArray(definition.keyword) ? definition.keyword : [definition.keyword];
  for (const name of names) {
    map.set(name, normalized);
  }
}

// The draft-07 vocabulary: the base every JSON Schema entry point shares.
function addJsonSchemaDefinitions(map) {
  addDefinition(map, {keyword: "$comment"});
  addDefinition(map, {keyword: "$ref", schemaType: "string", code});
  addDefinition(map, {
    keyword: "additionalItems",
    type: "array",
    schemaType: ["boolean", "object"],
    before: "uniqueItems",
    error: itemLimitError,
    code,
  });
  addDefinition(map, {
    keyword: "additionalProperties",
    type: "object",
    schemaType: ["boolean", "object"],
    allowUndefined: true,
    trackErrors: true,
    error: additionalPropertiesError,
    code,
  });
  addDefinition(map, {keyword: "allOf", schemaType: "array", code});
  addDefinition(map, {
    keyword: "anyOf",
    schemaType: "array",
    trackErrors: true,
    code,
    error: {message: "must match a schema in anyOf"},
  });
  addDefinition(map, {keyword: "const", $data: true, error: constError, code});
  addDefinition(map, {
    keyword: "contains",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    trackErrors: true,
    error: containsError,
    code,
  });
  addDefinition(map, {
    keyword: "dependencies",
    type: "object",
    schemaType: "object",
    error: dependenciesError,
    code,
  });
  addDefinition(map, {
    keyword: ["then", "else"],
    schemaType: ["object", "boolean"],
    code,
  });
  addDefinition(map, {keyword: "enum", schemaType: "array", $data: true, error: enumError, code});
  addDefinition(map, {
    keyword: ["maximum", "minimum", "exclusiveMaximum", "exclusiveMinimum"],
    type: "number",
    schemaType: "number",
    $data: true,
    error: limitNumberError,
    code,
  });
  addDefinition(map, FORMAT_RULE_DEFINITION);
  addDefinition(map, {keyword: "id", code});
  addDefinition(map, {
    keyword: "if",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    error: ifError,
    code,
  });
  addDefinition(map, {
    keyword: "items",
    type: "array",
    schemaType: ["object", "array", "boolean"],
    before: "uniqueItems",
    code,
  });
  addDefinition(map, {
    keyword: ["maxItems", "minItems"],
    type: "array",
    schemaType: "number",
    $data: true,
    error: limitItemsError,
    code,
  });
  addDefinition(map, {
    keyword: ["maxLength", "minLength"],
    type: "string",
    schemaType: "number",
    $data: true,
    error: limitLengthError,
    code,
  });
  addDefinition(map, {
    keyword: ["maxProperties", "minProperties"],
    type: "object",
    schemaType: "number",
    $data: true,
    error: limitPropertiesError,
    code,
  });
  addDefinition(map, {
    keyword: "multipleOf",
    type: "number",
    schemaType: "number",
    $data: true,
    error: multipleOfError,
    code,
  });
  addDefinition(map, {
    keyword: "not",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    code,
    error: {message: "must NOT be valid"},
  });
  addDefinition(map, {keyword: "nullable", schemaType: "boolean"});
  addDefinition(map, {
    keyword: "oneOf",
    schemaType: "array",
    trackErrors: true,
    error: oneOfError,
    code,
  });
  addDefinition(map, {
    keyword: "pattern",
    type: "string",
    schemaType: "string",
    $data: true,
    error: patternError,
    code,
  });
  addDefinition(map, {keyword: "patternProperties", type: "object", schemaType: "object", code});
  addDefinition(map, {keyword: "properties", type: "object", schemaType: "object", code});
  addDefinition(map, {
    keyword: "propertyNames",
    type: "object",
    schemaType: ["object", "boolean"],
    error: propertyNamesError,
    code,
  });
  addDefinition(map, {
    keyword: "required",
    type: "object",
    schemaType: "array",
    $data: true,
    error: requiredError,
    code,
  });
  addDefinition(map, {keyword: "type", schemaType: ["string", "array"]});
  addDefinition(map, {
    keyword: "uniqueItems",
    type: "array",
    schemaType: "boolean",
    $data: true,
    error: uniqueItemsError,
    code,
  });
}

// The keywords 2019-09 adds to the draft-07 vocabulary. 2020-12 publishes the
// same additions.
function addNextDefinitions(map) {
  addDefinition(map, {keyword: "$dynamicAnchor", schemaType: "string", code});
  addDefinition(map, {keyword: "$dynamicRef", schemaType: "string", code});
  addDefinition(map, {keyword: "$recursiveAnchor", schemaType: "boolean", code});
  addDefinition(map, {keyword: "$recursiveRef", schemaType: "string", code});
  addDefinition(map, {
    keyword: "dependentRequired",
    type: "object",
    schemaType: "object",
    error: dependenciesError,
    code,
  });
  addDefinition(map, {
    keyword: "dependentSchemas",
    type: "object",
    schemaType: "object",
    code,
  });
  addDefinition(map, {
    keyword: ["maxContains", "minContains"],
    type: "array",
    schemaType: "number",
    code,
  });
  addDefinition(map, {
    keyword: "unevaluatedItems",
    type: "array",
    schemaType: ["boolean", "object"],
    error: itemLimitError,
    code,
  });
  addDefinition(map, {
    keyword: "unevaluatedProperties",
    type: "object",
    schemaType: ["boolean", "object"],
    trackErrors: true,
    error: unevaluatedPropertiesError,
    code,
  });
}

function draft7Vocabulary() {
  const map = new Map();
  addJsonSchemaDefinitions(map);
  return map;
}

function vocabulary2019() {
  const map = new Map();
  addJsonSchemaDefinitions(map);
  addNextDefinitions(map);
  return map;
}

function vocabulary2020() {
  const map = vocabulary2019();
  map.delete("additionalItems");
  addDefinition(map, {
    keyword: "items",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    error: itemLimitError,
    code,
  });
  addDefinition(map, {
    keyword: "prefixItems",
    type: "array",
    schemaType: ["array"],
    before: "uniqueItems",
    code,
  });
  return map;
}

// JSON Type Definition's vocabulary, whose rules ./jtd.js compiles.
function jtdVocabulary() {
  const map = new Map();
  addDefinition(map, {keyword: "additionalProperties", schemaType: "boolean"});
  addDefinition(map, {
    keyword: "discriminator",
    schemaType: "string",
    implements: ["mapping"],
    error: jtdDiscriminatorError,
    code,
  });
  addDefinition(map, {
    keyword: "elements",
    schemaType: "object",
    error: jtdTypeError("array"),
    code,
  });
  addDefinition(map, {keyword: "enum", schemaType: "array", error: jtdEnumError, code});
  addDefinition(map, {keyword: "metadata", schemaType: "object", code});
  addDefinition(map, {keyword: "nullable", schemaType: "boolean"});
  addDefinition(map, {
    keyword: "optionalProperties",
    schemaType: "object",
    error: jtdPropertiesError,
    code,
  });
  addDefinition(map, {
    keyword: "properties",
    schemaType: "object",
    error: jtdPropertiesError,
    code,
  });
  addDefinition(map, {keyword: "ref", schemaType: "string", code});
  addDefinition(map, {
    keyword: "type",
    schemaType: "string",
    error: jtdTypeError("string"),
    code,
  });
  addDefinition(map, {
    keyword: "union",
    schemaType: "array",
    trackErrors: true,
    code,
    error: {message: "must match a schema in union"},
  });
  addDefinition(map, {
    keyword: "values",
    schemaType: "object",
    error: jtdTypeError("object"),
    code,
  });
  return map;
}

function jtdTypeMessage(context, type) {
  return context.parentSchema && context.parentSchema.nullable
    ? `must be ${type} or null`
    : `must be ${type}`;
}

function jtdTypeParams(context, type) {
  const nullable = Boolean(context.parentSchema && context.parentSchema.nullable);
  return `{type: ${JSON.stringify(type)}, nullable: ${nullable}}`;
}

function jtdTypeError(type) {
  return {
    message(context) {
      return jtdTypeMessage(context, type);
    },
    params(context) {
      return jtdTypeParams(context, type);
    },
  };
}

const jtdEnumError = {
  message: "must be equal to one of the allowed values",
  params({schemaCode}) {
    return `{allowedValues: ${schemaCode}}`;
  },
};

const jtdPropertiesError = {
  message(context) {
    const {params} = context;
    if (!params.propError) return jtdTypeMessage(context, "object");
    return params.propError === "additional"
      ? "must NOT have additional properties"
      : `must have property '${params.missingProperty}'`;
  },
  params(context) {
    const {params} = context;
    if (!params.propError) return jtdTypeParams(context, "object");
    return params.propError === "additional"
      ? `{error: ${params.propError}, additionalProperty: ${params.additionalProperty}}`
      : `{error: ${params.propError}, missingProperty: ${params.missingProperty}}`;
  },
};

const jtdDiscriminatorError = {
  message(context) {
    const {schema, params} = context;
    if (!params.discrError) return jtdTypeMessage(context, "object");
    return params.discrError === "tag"
      ? `tag "${schema}" must be string`
      : `value of tag "${schema}" must be in mapping`;
  },
  params(context) {
    const {schema, params} = context;
    if (!params.discrError) return jtdTypeParams(context, "object");
    return `{error: ${params.discrError}, tag: ${schema}, tagValue: ${params.tag}}`;
  },
};

const VOCABULARIES = {
  draft7: draft7Vocabulary(),
  "2019": vocabulary2019(),
  "2020": vocabulary2020(),
  jtd: jtdVocabulary(),
};

// A per-instance copy: `removeKeyword` hides a built-in from lookup on the
// instance that removed it, exactly as ajv deletes the rule from its table.
function builtinVocabulary(dialect) {
  return new Map(VOCABULARIES[dialect] || VOCABULARIES.draft7);
}

module.exports = {
  FORMAT_RULE_DEFINITION,
  builtinVocabulary,
  keywordRegistration,
  normalizeDefinition,
};
