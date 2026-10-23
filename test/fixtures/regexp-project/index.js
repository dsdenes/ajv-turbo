"use strict";

// An existing service that supplies its own regular-expression implementation
// through the validator's configuration. It is run unchanged with ajv and with
// the replacement installed in ajv's place; every printed line must match.

const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");

const DIALECTS = [
  ["draft-07", Ajv],
  ["2019-09", Ajv2019],
  ["2020-12", Ajv2020],
];

// Differs from the platform implementation for two patterns, so a matched
// document proves the supplied implementation was used.
function custom(pattern, flags) {
  const source = pattern === "^start" ? "^finish" : pattern === "^left" ? "^right" : pattern;
  return new RegExp(source, flags);
}
custom.code = "custom";

// Refuses one pattern, both where a schema states it literally and where a
// document supplies it at validation time.
function refusing(pattern, flags) {
  if (pattern === "^refused$") throw new SyntaxError("engine refused " + pattern);
  return new RegExp(pattern, flags);
}
refusing.code = "refusing";

// Reveals the flags the validator asked for: with Unicode expressions it
// matches "u"; with the option off it matches "n".
function flagged(pattern, flags) {
  if (pattern === "^flag$") return new RegExp(flags === "u" ? "^u$" : "^n$", flags);
  return new RegExp(pattern, flags);
}
flagged.code = "flagged";

const results = [];

function push(label, fields) {
  results.push({case: label, ...fields});
}

function record(label, validate, data) {
  const input = structuredClone(data);
  const valid = validate(input);
  push(label, {valid, errors: validate.errors, data: input});
}

function compile(label, build) {
  try {
    const validate = build();
    push(label, {compiled: true});
    return validate;
  } catch (error) {
    push(label, {compiled: false, message: error.message});
    return undefined;
  }
}

async function recordAsync(label, validate, data) {
  const input = structuredClone(data);
  try {
    const value = await validate(input);
    push(label, {resolved: true, value, data: input});
  } catch (error) {
    push(label, {
      resolved: false,
      validation: error.validation === true,
      errors: error.errors,
      data: input,
    });
  }
}

function options(engine, extra = {}) {
  return {strict: false, ...(engine ? {code: {regExp: engine}} : {}), ...extra};
}

const PATTERN_SCHEMA = {type: "string", pattern: "^start"};
const OBJECT_SCHEMA = {
  type: "object",
  patternProperties: {"^left": {type: "number"}},
  additionalProperties: false,
};
const DATA_SCHEMA = {
  type: "object",
  properties: {
    pattern: {type: "string"},
    value: {type: "string", pattern: {$data: "1/pattern"}},
  },
};
const REF_SCHEMA = {
  $defs: {value: {type: "string", pattern: "^start"}},
  $ref: "#/$defs/value",
};

const PATTERN_DOCUMENTS = ["start", "finish", "other"];
const OBJECT_DOCUMENTS = [{leftOne: 1}, {rightOne: 1}, {leftOne: "one"}, {}];
const DATA_DOCUMENTS = [
  {pattern: "^start", value: "finish"},
  {pattern: "^start", value: "start"},
  {pattern: "^(plain)$", value: "plain"},
  {pattern: "^refused$", value: "anything"},
];

async function main() {
  for (const [dialect, Dialect] of DIALECTS) {
    // No implementation supplied: the platform implementation decides.
    {
      const ajv = new Dialect(options(undefined));
      const validate = compile(`${dialect} default pattern`, () => ajv.compile(PATTERN_SCHEMA));
      if (validate) {
        for (const document of PATTERN_DOCUMENTS) {
          record(`${dialect} default pattern ${document}`, validate, document);
        }
      }
    }

    // A supplied implementation answers every regex-based rule.
    {
      const ajv = new Dialect(options(custom));
      for (const [name, schema, documents, extra] of [
        ["pattern", PATTERN_SCHEMA, PATTERN_DOCUMENTS, undefined],
        ["patternProperties", OBJECT_SCHEMA, OBJECT_DOCUMENTS, undefined],
        ["data", DATA_SCHEMA, DATA_DOCUMENTS.slice(0, 3), {$data: true}],
        ["reference", REF_SCHEMA, PATTERN_DOCUMENTS, undefined],
      ]) {
        const caseAjv = extra === undefined ? ajv : new Dialect(options(custom, extra));
        const validate = compile(`${dialect} custom ${name}`, () => caseAjv.compile(schema));
        if (!validate) continue;
        for (const document of documents) {
          record(`${dialect} custom ${name} ${JSON.stringify(document)}`, validate, document);
        }
      }

      const asyncSchema = {$async: true, ...OBJECT_SCHEMA};
      const validateAsync = compile(`${dialect} custom async`, () => ajv.compile(asyncSchema));
      if (validateAsync) {
        for (const document of OBJECT_DOCUMENTS) {
          await recordAsync(`${dialect} custom async ${JSON.stringify(document)}`, validateAsync, document);
        }
      }
    }

    // The supplied implementation decides the Unicode flag.
    for (const [label, extra] of [
      ["unicode", {}],
      ["no unicode", {unicodeRegExp: false}],
    ]) {
      const ajv = new Dialect(options(flagged, extra));
      const validate = compile(`${dialect} flagged ${label}`, () =>
        ajv.compile({type: "string", pattern: "^flag$"}),
      );
      if (!validate) continue;
      for (const document of ["u", "n", "other"]) {
        record(`${dialect} flagged ${label} ${document}`, validate, document);
      }
    }

    // A refused pattern behaves as ajv handles it: a literal pattern fails
    // compilation, a document-supplied pattern fails that validation.
    {
      const ajv = new Dialect(options(refusing, {$data: true}));
      compile(`${dialect} refused pattern`, () => ajv.compile({type: "string", pattern: "^refused$"}));
      compile(`${dialect} refused patternProperties`, () =>
        ajv.compile({type: "object", patternProperties: {"^refused$": {type: "number"}}}),
      );
      compile(`${dialect} skipped patternProperties`, () =>
        ajv.compile({type: "object", patternProperties: {"^refused$": {}}}),
      );
      const validate = compile(`${dialect} refused data compile`, () => ajv.compile(DATA_SCHEMA));
      if (validate) {
        record(`${dialect} refused data`, validate, {pattern: "^refused$", value: "anything"});
      }
    }
  }

  for (const result of results) console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
