"use strict";

// Verdict and report comparison for ajv's official formats plugin. The same
// script runs against ajv and against the replacement; every printed line must
// match.

const addFormats = require("ajv-formats");
const {formatNames, fullFormats, fastFormats} = require("ajv-formats/dist/formats");

const ENTRIES = [
  ["draft7", () => require("ajv")],
  ["2019", () => require("ajv/dist/2019")],
  ["2020", () => require("ajv/dist/2020")],
];

const FORMAT_CASES = {
  date: ["string", "2020-02-29", "not-a-date"],
  time: ["string", "23:59:59Z", "12:60:00Z"],
  "date-time": ["string", "2020-02-29T23:59:59Z", "2020-02-29T12:60:00Z"],
  duration: ["string", "P3Y6M4DT12H30M5S", "P"],
  uri: ["string", "http://example.com/a", "not a uri"],
  "uri-reference": ["string", "//example.com/a", "http://exa mple.com"],
  "uri-template": ["string", "/foo/{bar}", "/foo/{bar"],
  url: ["string", "https://example.com/x", "ftp:/bad"],
  email: ["string", "a@b.com", "a@b"],
  hostname: ["string", "example.com", "bad_host"],
  ipv4: ["string", "192.168.0.1", "999.1.1.1"],
  ipv6: ["string", "::1", "12345::"],
  regex: ["string", "^[a-z]+$", "["],
  uuid: ["string", "123e4567-e89b-12d3-a456-426614174000", "not-a-uuid"],
  "json-pointer": ["string", "/a/b", "a"],
  "json-pointer-uri-fragment": ["string", "#/a/b", "#a"],
  "relative-json-pointer": ["string", "1/a", "01/a"],
  byte: ["string", "aGVsbG8=", "!!!"],
  int32: ["number", 2147483647, 2147483648],
  int64: ["number", 9007199254740991, 1.5],
  float: ["number", 1.5, "not-a-number"],
  double: ["number", -2.25, "not-a-number"],
  password: ["string", "secret", 42],
  binary: ["string", "\u0000\u0001", 42],
};

function json(value) {
  return JSON.stringify(value);
}

function accepts(definition, value) {
  if (definition === true || definition === undefined) return true;
  if (definition instanceof RegExp) {
    definition.lastIndex = 0;
    return definition.test(value);
  }
  if (typeof definition === "function") return Boolean(definition(value));
  if (typeof definition.validate === "function") return Boolean(definition.validate(value));
  if (definition.validate instanceof RegExp) return definition.validate.test(value);
  return false;
}

// Validates once per reporting mode so verdicts and reports are observed under
// both first-error and complete reporting.
function report(ajv, validate, document) {
  const valid = validate(document);
  return {valid, errors: validate.errors, text: ajv.errorsText(validate.errors)};
}

function makeAjv(Ajv, options) {
  return new Ajv({strict: false, ...options});
}

function testFormats(label, mode, options) {
  for (const [dialect, load] of ENTRIES) {
    const Ajv = load();
    for (const allErrors of [false, true]) {
      const ajv = makeAjv(Ajv, {...options, allErrors});
      if (mode === "fast") addFormats(ajv, {mode: "fast"});
      else addFormats(ajv);
      for (const name of formatNames) {
        const [type, good, bad] = FORMAT_CASES[name];
        const schema = {type, format: name};
        const validate = ajv.compile(schema);
        for (const [kind, document] of [["accept", good], ["reject", bad]]) {
          console.log(
            json({
              label,
              dialect,
              mode,
              allErrors,
              format: name,
              kind,
              result: report(ajv, validate, document),
            }),
          );
        }
      }
    }
  }
}

function testRange() {
  const literalSchema = {
    type: "object",
    required: ["name", "value"],
    properties: {
      name: {type: "string", format: "date"},
      value: {type: "string", format: "date", formatMinimum: "2020-01-01"},
    },
  };
  const literalDocs = [
    {name: "2019-12-31", value: "2020-06-01"}, // inside
    {name: "2020-01-01", value: "2020-01-01"}, // boundary
    {name: "2021-01-01", value: "2019-12-31"}, // outside
  ];
  const exclusiveSchema = {
    type: "object",
    required: ["low", "high"],
    properties: {
      low: {type: "string", format: "date", formatExclusiveMinimum: "2020-01-01"},
      high: {type: "string", format: "date", formatExclusiveMaximum: "2020-06-01"},
    },
  };
  const exclusiveDocs = [
    {low: "2020-02-01", high: "2020-05-01"}, // inside
    {low: "2020-01-01", high: "2020-05-01"}, // exactly at the lower boundary
    {low: "2020-02-01", high: "2020-06-01"}, // exactly at the upper boundary
    {low: "2019-12-31", high: "2020-07-01"}, // outside both
  ];
  const siblingSchema = {
    type: "object",
    required: ["start", "end"],
    properties: {
      start: {type: "string", format: "date"},
      end: {type: "string", format: "date", formatMinimum: {$data: "1/start"}},
    },
  };
  const absoluteSchema = {
    type: "object",
    required: ["start", "end"],
    properties: {
      start: {type: "string", format: "date"},
      end: {type: "string", format: "date", formatMaximum: {$data: "/start"}},
    },
  };
  const formatNameSchema = {
    type: "object",
    required: ["which", "limit", "value"],
    properties: {
      which: {type: "string", format: "regex"},
      limit: {type: "string", format: {$data: "1/which"}},
      value: {type: "string", format: {$data: "1/which"}, formatMinimum: {$data: "1/limit"}},
    },
  };
  const nestedSchema = {
    type: "array",
    items: {
      type: "object",
      required: ["start", "end"],
      properties: {
        start: {type: "string", format: "date"},
        end: {type: "string", format: "date", formatMinimum: {$data: "1/start"}},
      },
    },
  };
  const nestedDocs = [
    [{start: "2020-01-01", end: "2020-02-01"}], // inside
    [{start: "2020-01-01", end: "2020-01-01"}], // boundary
    [{start: "2020-01-01", end: "2019-12-31"}], // outside
  ];
  const siblingDocs = [
    {start: "2020-01-01", end: "2020-01-01"}, // boundary
    {start: "2020-01-01", end: "2020-02-01"}, // inside
    {start: "2020-01-01", end: "2019-12-31"}, // outside
  ];
  const absoluteDocs = [
    {start: "2020-01-01", end: "2020-01-01"},
    {start: "2020-01-01", end: "2019-12-31"},
    {start: "2020-01-01", end: "2020-02-01"},
  ];
  const formatNameDocs = [
    {which: "date", limit: "2020-01-01", value: "2020-01-01"}, // boundary
    {which: "date", limit: "2020-01-01", value: "2020-02-01"}, // inside
    {which: "date", limit: "2020-01-01", value: "2019-12-31"}, // outside
    {which: "date", limit: "2020-01-01", value: "not-a-date"}, // format violation
    {which: "date", limit: "not-a-date", value: "2020-01-01"}, // limit format violation
    {which: "time", limit: "12:00:00", value: "13:00:00"}, // format name from document
    {which: "time", limit: "12:00:00", value: "11:59:59"}, // outside
  ];
  const cases = [
    ["literal", literalSchema, literalDocs],
    ["exclusive", exclusiveSchema, exclusiveDocs],
    ["sibling", siblingSchema, siblingDocs],
    ["nested", nestedSchema, nestedDocs],
    ["absolute", absoluteSchema, absoluteDocs],
    ["format-name", formatNameSchema, formatNameDocs],
  ];
  for (const [dialect, load] of ENTRIES) {
    const Ajv = load();
    for (const allErrors of [false, true]) {
      for (const [$data, label] of [[true, "with-$data"], [false, "without-$data"]]) {
        const ajv = makeAjv(Ajv, {allErrors, $data});
        addFormats(ajv);
        for (const [name, schema, documents] of cases) {
          let validate;
          let compileError;
          try {
            validate = ajv.compile(schema);
          } catch (error) {
            compileError = error.message;
          }
          for (const document of documents) {
            const result =
              validate === undefined
                ? {compileError}
                : report(ajv, validate, document);
            console.log(
              json({label: "range", dialect, allErrors, $data, variant: label, case: name, document, result}),
            );
          }
        }
      }
    }
  }
}

function testLookup() {
  for (const mode of ["full", "fast"]) {
    const formats = mode === "fast" ? fastFormats : fullFormats;
    for (const name of Object.keys(formats)) {
      const definition = addFormats.get(name, mode);
      const [type, good, bad] = FORMAT_CASES[name];
      console.log(
        json({
          label: "lookup",
          mode,
          format: name,
          acceptsGood: accepts(definition, good),
          acceptsBad: accepts(definition, bad),
          type,
        }),
      );
    }
  }
  for (const [mode, name] of [["full", "no-such-format"], ["fast", "no-such-format"]]) {
    let outcome;
    try {
      addFormats.get(name, mode);
      outcome = "returned";
    } catch (error) {
      outcome = error.message;
    }
    console.log(json({label: "lookup-unknown", mode, outcome}));
  }
}

function testDependencies() {
  const cases = [
    ["missing", {type: "string", formatMaximum: "2020-01-01"}],
    ["declared", {type: "string", format: "date", formatMaximum: "2020-01-01"}],
    ["no-compare-number", {type: "number", format: "int32", formatMaximum: "1"}],
    ["no-compare-string", {type: "string", format: "email", formatMaximum: "a"}],
  ];
  for (const [dialect, load] of ENTRIES) {
    const Ajv = load();
    const ajv = makeAjv(Ajv, {});
    addFormats(ajv);
    for (const [kind, schema] of cases) {
      let outcome;
      try {
        ajv.compile(schema);
        outcome = "compiled";
      } catch (error) {
        outcome = error.message;
      }
      console.log(json({label: "dependencies", dialect, kind, outcome}));
    }
  }
}

function testNoPlugin() {
  const selfFormatSchema = {
    type: "object",
    required: ["handle", "count"],
    properties: {
      handle: {type: "string", format: "custom-slug"},
      count: {type: "integer"},
    },
  };
  const selfFormatDocs = [
    {handle: "abc", count: 1},
    {handle: "ABC", count: 1},
    {handle: "abc", count: 1.5},
  ];
  const plainSchema = {
    type: "object",
    required: ["limit", "items"],
    properties: {
      limit: {type: "integer", minimum: 1},
      items: {type: "array", items: {type: "string"}, minItems: 2},
    },
  };
  const plainDocs = [
    {limit: 2, items: ["a", "b"]},
    {limit: 0, items: ["a"]},
  ];
  const unknownSchema = {type: "string", format: "not-registered"};
  const unknownDocs = ["anything", 42];
  for (const [dialect, load] of ENTRIES) {
    const Ajv = load();
    for (const allErrors of [false, true]) {
      const ajv = makeAjv(Ajv, {allErrors});
      ajv.addFormat("custom-slug", /^[a-z]+$/);
      for (const [name, schema, documents] of [
        ["self-format", selfFormatSchema, selfFormatDocs],
        ["plain", plainSchema, plainDocs],
        ["unknown", unknownSchema, unknownDocs],
      ]) {
        const validate = ajv.compile(schema);
        for (const document of documents) {
          console.log(
            json({
              label: "no-plugin",
              dialect,
              allErrors,
              case: name,
              document,
              result: report(ajv, validate, document),
            }),
          );
        }
      }
    }
  }
}

testFormats("formats", "full", {});
testFormats("formats-fast", "fast", {});
testRange();
testDependencies();
testLookup();
testNoPlugin();
