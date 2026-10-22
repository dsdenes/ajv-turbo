"use strict";

// An existing service that uses ajv's data-reference option. Keyword values
// name locations in the document being validated instead of holding literals.
// It is run unchanged with ajv and with the replacement installed in ajv's
// place; every printed line must match.

const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");

const results = [];

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

function record(label, ajv, validate, data) {
  const input = clone(data);
  const valid = validate(input);
  results.push({
    case: label,
    valid,
    errors: validate.errors,
    text: ajv.errorsText(validate.errors),
    data: input,
  });
}

function compile(label, ajv, schema) {
  try {
    ajv.compile(clone(schema));
    results.push({case: label, compiled: true});
  } catch (error) {
    results.push({case: label, compiled: false, message: error.message});
  }
}

const LIMITS = {
  type: "object",
  properties: {
    limit: {type: "number"},
    floor: {type: "number"},
    step: {type: "number"},
    maxLength: {type: "number"},
    pattern: {type: "string"},
    format: {type: "string"},
    maxItems: {type: "number"},
    unique: {type: "boolean"},
    wanted: {},
    required: {},
    maxProps: {type: "number"},
    modes: {},
    value: {
      type: "number",
      maximum: {$data: "/limit"},
      minimum: {$data: "/floor"},
      multipleOf: {$data: "/step"},
    },
    label: {
      type: "string",
      maxLength: {$data: "/maxLength"},
      pattern: {$data: "/pattern"},
      format: {$data: "/format"},
    },
    list: {
      type: "array",
      maxItems: {$data: "/maxItems"},
      uniqueItems: {$data: "/unique"},
      contains: {const: {$data: "/wanted"}},
    },
    box: {
      type: "object",
      required: {$data: "/required"},
      maxProperties: {$data: "/maxProps"},
    },
    mode: {enum: {$data: "/modes"}},
    token: {const: {$data: "/token"}},
  },
};

const LIMIT_DOCUMENTS = {
  valid: {
    limit: 10,
    floor: 1,
    step: 2,
    maxLength: 5,
    pattern: "^a",
    format: "handle",
    maxItems: 3,
    unique: true,
    wanted: 2,
    required: ["a"],
    maxProps: 2,
    modes: ["a", "b"],
    token: "x",
    value: 4,
    label: "abc",
    list: [1, 2],
    box: {a: 1},
    mode: "a",
  },
  invalid: {
    limit: 10,
    floor: 1,
    step: 2,
    maxLength: 5,
    pattern: "^a",
    format: "handle",
    maxItems: 3,
    unique: true,
    wanted: 2,
    required: ["a"],
    maxProps: 1,
    modes: ["a", "b"],
    token: "x",
    value: 11,
    label: "zzz",
    list: [1, 1],
    box: {},
    mode: "c",
    token: "y",
  },
  absent: {
    value: 4,
    label: "abc",
    list: [1, 2],
    box: {a: 1},
    mode: "a",
    token: "x",
  },
  wrongTypes: {
    limit: "10",
    floor: "1",
    step: "2",
    maxLength: "5",
    pattern: 5,
    format: 5,
    maxItems: "3",
    unique: "yes",
    wanted: 2,
    required: "a",
    maxProps: "1",
    modes: "a",
    token: "x",
    value: 4,
    label: "abc",
    list: [1, 2],
    box: {a: 1},
    mode: "a",
  },
};

const DIALECTS = [
  ["draft-07", Ajv],
  ["2019-09", Ajv2019],
  ["2020-12", Ajv2020],
];

const REPORT_OPTIONS = [
  ["default", {}],
  ["complete", {allErrors: true}],
  ["extended", {verbose: true, allErrors: true}],
  ["message-free", {messages: false, allErrors: true}],
  ["extended message-free", {verbose: true, messages: false, allErrors: true}],
];

for (const [dialect, Dialect] of DIALECTS) {
  // Compiling schemas whose keyword values are data references.
  {
    const ajv = new Dialect({$data: true, strict: false, formats: {handle: /^a/}});
    compile(`${dialect} compile enabled`, ajv, LIMITS);
  }

  // The same schemas are rejected at compile time without the option.
  for (const [label, options] of [
    ["disabled", {$data: false, strict: false}],
    ["omitted", {strict: false}],
  ]) {
    const ajv = new Dialect({...options, formats: {handle: /^a/}});
    compile(`${dialect} compile ${label}`, ajv, LIMITS);
  }

  // Verdicts and reports for every reporting mode.
  for (const [mode, options] of REPORT_OPTIONS) {
    const ajv = new Dialect({$data: true, strict: false, ...options, formats: {handle: /^a/}});
    const validate = ajv.compile(clone(LIMITS));
    for (const [document, data] of Object.entries(LIMIT_DOCUMENTS)) {
      record(`${dialect} ${mode} ${document}`, ajv, validate, data);
    }
  }
}

// Relative references and references inside referenced schemas.
for (const [dialect, Dialect] of DIALECTS) {
  const ajv = new Dialect({$data: true, strict: false, allErrors: true});
  const relative = {
    type: "object",
    properties: {
      limit: {type: "number"},
      nested: {
        type: "object",
        properties: {
          cap: {type: "number"},
          value: {maximum: {$data: "1/cap"}},
        },
      },
      value: {maximum: {$data: "1/limit"}},
    },
  };
  const validateRelative = ajv.compile(clone(relative));
  record(`${dialect} relative valid`, ajv, validateRelative, {
    limit: 4,
    value: 3,
    nested: {cap: 2, value: 1},
  });
  record(`${dialect} relative invalid`, ajv, validateRelative, {
    limit: 4,
    value: 5,
    nested: {cap: 2, value: 3},
  });

  const referenced = {
    type: "object",
    properties: {value: {$ref: "#/definitions/capped"}},
    definitions: {capped: {type: "number", maximum: {$data: "/limit"}}},
  };
  const validateReferenced = ajv.compile(clone(referenced));
  record(`${dialect} referenced valid`, ajv, validateReferenced, {limit: 3, value: 2});
  record(`${dialect} referenced invalid`, ajv, validateReferenced, {limit: 3, value: 4});
  record(`${dialect} referenced absent`, ajv, validateReferenced, {value: 4});
}

// Custom rules: one declares data-reference support and receives the resolved
// value, one does not and receives the literal schema value.
{
  const received = {resolved: [], literal: []};
  const ajv = new Ajv({$data: true, strict: false, allErrors: true});
  ajv.addKeyword({
    keyword: "evenLimit",
    type: "number",
    $data: true,
    schemaType: "number",
    validate: (limit, value) => {
      received.resolved.push(limit);
      return typeof limit === "number" && value % 2 === 0 && value <= limit;
    },
  });
  ajv.addKeyword({
    keyword: "literalLimit",
    type: "number",
    validate: (schemaValue, value) => {
      received.literal.push(schemaValue);
      return typeof schemaValue === "number" && value <= schemaValue;
    },
  });
  const schema = {
    type: "object",
    properties: {
      resolved: {type: "number", evenLimit: {$data: "/limit"}},
      literal: {type: "number", literalLimit: {$data: "/limit"}},
      plain: {type: "number", literalLimit: 4},
    },
  };
  const validate = ajv.compile(clone(schema));
  for (const [label, data] of [
    ["custom valid", {limit: 4, resolved: 2, plain: 3}],
    ["custom invalid", {limit: 4, resolved: 5, plain: 3}],
    ["custom literal", {limit: 4, resolved: 2, literal: 1, plain: 3}],
    ["custom plain invalid", {limit: 4, resolved: 2, plain: 5}],
    ["custom absent", {resolved: 2, plain: 3}],
    ["custom wrong type", {limit: "4", resolved: 2, plain: 3}],
  ]) {
    record(label, ajv, validate, data);
  }
  results.push({case: "custom received", received});

  const disabled = new Ajv({strict: false});
  disabled.addKeyword({
    keyword: "evenLimit",
    type: "number",
    $data: true,
    schemaType: "number",
    validate: () => true,
  });
  compile("custom compile disabled", disabled, schema);
}

// Schemas without data references keep their verdicts and reports.
{
  const plain = {
    type: "object",
    required: ["name"],
    properties: {
      name: {type: "string", minLength: 2},
      count: {type: "integer", minimum: 0, maximum: 10},
      tags: {type: "array", items: {type: "string"}, uniqueItems: true},
      mode: {enum: ["a", "b"]},
    },
  };
  const documents = [
    ["plain valid", {name: "ok", count: 4, tags: ["x"], mode: "a"}],
    ["plain invalid", {name: "x", count: 11, tags: ["x", "x"], mode: "c"}],
    ["plain absent", {}],
  ];
  for (const [dialect, Dialect] of DIALECTS) {
    for (const [label, options] of [
      ["enabled", {$data: true}],
      ["disabled", {$data: false}],
      ["omitted", {}],
    ]) {
      const ajv = new Dialect({...options, strict: false, allErrors: true, verbose: true});
      const validate = ajv.compile(clone(plain));
      for (const [name, data] of documents) {
        record(`${dialect} ${label} ${name}`, ajv, validate, data);
      }
    }
  }
}

// Asynchronous validation resolves references the same way.
async function asynchronousCases() {
  const ajv = new Ajv({$data: true, strict: false, allErrors: true});
  ajv.addFormat("async-format", {
    type: "string",
    async: true,
    validate: async (value) => value === "good",
  });
  const schema = {
    $async: true,
    type: "object",
    properties: {
      limit: {type: "number"},
      value: {type: "number", maximum: {$data: "/limit"}},
      label: {type: "string", format: {$data: "/format"}},
    },
  };
  const validate = ajv.compile(clone(schema));
  for (const [label, data] of [
    ["async valid", {limit: 3, value: 2, format: "async-format", label: "good"}],
    ["async invalid", {limit: 3, value: 4, format: "async-format", label: "bad"}],
    ["async absent", {value: 4, label: "bad"}],
  ]) {
    try {
      await validate(clone(data));
      results.push({case: label, valid: true, errors: null, data});
    } catch (error) {
      results.push({
        case: label,
        valid: false,
        errors: error.errors,
        text: ajv.errorsText(error.errors),
        data,
      });
    }
  }
}

asynchronousCases()
  .then(() => {
    for (const result of results) console.log(JSON.stringify(result));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
