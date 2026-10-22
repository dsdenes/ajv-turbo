"use strict";

// An existing project that validates tagged unions with ajv's discriminator
// option. It is run unchanged with ajv and with this package installed in
// ajv's place; every printed line must match. DIALECT selects the entry point
// the same way a project on that dialect would: "draft7" (the default),
// "2019", or "2020".

const dialect = process.env.DIALECT || "draft7";

const Ajv =
  dialect === "2019"
    ? require("ajv/dist/2019")
    : dialect === "2020"
      ? require("ajv/dist/2020")
      : require("ajv");

const results = [];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
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

function attempt(label, options, schema) {
  try {
    const ajv = new Ajv({strict: false, ...options});
    const validate = ajv.compile(clone(schema));
    results.push({case: label, error: null, valid: validate({kind: "a", a: 1})});
  } catch (error) {
    results.push({
      case: label,
      error: error.message,
      name: error.constructor.name,
      missingRef: error.missingRef,
      missingSchema: error.missingSchema,
    });
  }
}

function recordWarnings(label, options, schema, documents) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const ajv = new Ajv(options);
    const validate = ajv.compile(clone(schema));
    const verdicts = documents.map((document) => {
      const valid = validate(clone(document));
      return {valid, errors: validate.errors, text: ajv.errorsText(validate.errors)};
    });
    results.push({case: label, error: null, warnings, verdicts});
  } catch (error) {
    results.push({case: label, error: error.message, name: error.constructor.name, warnings});
  } finally {
    console.warn = original;
  }
}

const MEMBER = {properties: {kind: {const: "a"}, a: {type: "number"}}, required: ["a"]};

const TAGGED = {
  type: "object",
  required: ["kind"],
  properties: {kind: {type: "string"}, note: {type: "string"}},
  discriminator: {propertyName: "kind"},
  oneOf: [
    {
      properties: {kind: {const: "circle"}, radius: {type: "number", minimum: 0}},
      required: ["radius"],
    },
    {
      properties: {
        kind: {enum: ["rect", "square"]},
        width: {type: "number"},
        height: {type: "number"},
      },
      required: ["width", "height"],
    },
    {
      properties: {kind: {const: "label"}, text: {type: "string", minLength: 2}},
      required: ["text"],
    },
  ],
};

const DOCUMENTS = [
  ["circle valid", {kind: "circle", radius: 2}],
  ["circle negative", {kind: "circle", radius: -1}],
  ["circle wrong type", {kind: "circle", radius: "2"}],
  ["rect valid", {kind: "rect", width: 2, height: 3}],
  ["square missing height", {kind: "square", width: 2}],
  ["label too short", {kind: "label", text: "x"}],
  ["label valid", {kind: "label", text: "ok"}],
  ["unknown tag", {kind: "hexagon"}],
  ["non-string tag", {kind: 5, radius: 2}],
  ["missing tag", {}],
  ["missing branch property", {kind: "circle"}],
  ["extra property", {kind: "circle", radius: 2, extra: true}],
  ["note between documents", {kind: "rect", width: 2, height: 3, note: "hello"}],
  ["array", []],
  ["null", null],
  ["string", "circle"],
  ["number", 5],
];

const OPTION_SETS = [
  ["first error", {}],
  ["complete", {allErrors: true}],
  ["verbose", {verbose: true}],
  ["complete verbose", {verbose: true, allErrors: true}],
  ["message-free", {messages: false, allErrors: true}],
  ["message-free verbose", {messages: false, verbose: true, allErrors: true}],
];

for (const [optionLabel, options] of OPTION_SETS) {
  const ajv = new Ajv({strict: false, discriminator: true, ...options});
  const validate = ajv.compile(clone(TAGGED));
  for (const [documentLabel, document] of DOCUMENTS) {
    record(`${optionLabel} ${documentLabel}`, ajv, validate, document);
  }
}

const PLAIN = {
  type: "object",
  properties: {name: {type: "string", minLength: 2}, count: {type: "integer"}},
  required: ["name"],
  oneOf: [{properties: {count: {minimum: 2}}}, {required: ["count"]}],
  additionalProperties: false,
};

{
  const options = {verbose: true, allErrors: true};
  const ajv = new Ajv({strict: false, discriminator: true, ...options});
  const validate = ajv.compile(clone(PLAIN));
  for (const [label, document] of [
    ["plain valid", {name: "ab"}],
    ["plain short", {name: "a"}],
    ["plain extra", {name: "ab", extra: 1}],
    ["plain both branches", {name: "ab", count: 3}],
  ]) {
    record(`option without annotation ${label}`, ajv, validate, document);
  }
}

const REFERENCED = {
  type: "object",
  required: ["kind"],
  $defs: {
    circle: {
      properties: {kind: {const: "circle"}, radius: {type: "number"}},
      required: ["radius"],
    },
    rect: {
      properties: {kind: {const: "rect"}, width: {type: "number"}, height: {type: "number"}},
      required: ["width", "height"],
    },
  },
  discriminator: {propertyName: "kind"},
  oneOf: [{$ref: "#/$defs/circle"}, {$ref: "#/$defs/rect"}],
};

{
  const options = {allErrors: true, verbose: true};
  const ajv = new Ajv({strict: false, discriminator: true, ...options});
  const validate = ajv.compile(clone(REFERENCED));
  for (const [label, document] of [
    ["circle valid", {kind: "circle", radius: 2}],
    ["rect valid", {kind: "rect", width: 2, height: 3}],
    ["branch fails", {kind: "rect", width: 2}],
    ["unknown tag", {kind: "oval"}],
  ]) {
    record(`referenced ${label}`, ajv, validate, document);
  }
}

if (dialect !== "draft7") {
  const EVALUATED = {
    type: "object",
    $defs: {
      circle: {
        properties: {kind: {const: "circle"}, radius: {type: "number"}},
        required: ["radius"],
      },
      rect: {
        properties: {kind: {const: "rect"}, width: {type: "number"}, height: {type: "number"}},
        required: ["width", "height"],
      },
    },
    allOf: [
      {
        required: ["kind"],
        discriminator: {propertyName: "kind"},
        oneOf: [{$ref: "#/$defs/circle"}, {$ref: "#/$defs/rect"}],
      },
    ],
    unevaluatedProperties: false,
  };
  const WRAPPED = {
    oneOf: [
      {
        type: "object",
        required: ["kind"],
        discriminator: {propertyName: "kind"},
        oneOf: [
          {
            properties: {kind: {const: "circle"}, radius: {type: "number"}},
            required: ["radius"],
          },
          {
            properties: {
              kind: {const: "rect"},
              width: {type: "number"},
              height: {type: "number"},
            },
            required: ["width", "height"],
          },
        ],
      },
    ],
    unevaluatedProperties: false,
  };
  for (const [schemaLabel, schema] of [
    ["evaluated allOf", EVALUATED],
    ["evaluated oneOf", WRAPPED],
  ]) {
    for (const [optionLabel, options] of [
      ["first error", {}],
      ["complete", {allErrors: true}],
      ["verbose", {verbose: true, allErrors: true}],
    ]) {
      const ajv = new Ajv({strict: false, discriminator: true, ...options});
      const validate = ajv.compile(clone(schema));
      for (const [documentLabel, document] of [
        ["circle inside", {kind: "circle", radius: 2}],
        ["rect inside", {kind: "rect", width: 2, height: 3}],
        ["branch fails", {kind: "circle", extra: 1}],
        ["unevaluated extra", {kind: "circle", radius: 2, extra: 1}],
        ["unknown tag", {kind: "oval"}],
      ]) {
        record(`${schemaLabel} ${optionLabel} ${documentLabel}`, ajv, validate, document);
      }
    }
  }
}

attempt("compile accepted tagged union", {discriminator: true}, TAGGED);
attempt(
  "compile missing propertyName",
  {discriminator: true},
  {type: "object", discriminator: {}, oneOf: [MEMBER], required: ["kind"]},
);
attempt(
  "compile mapping unsupported",
  {discriminator: true},
  {
    type: "object",
    discriminator: {propertyName: "kind", mapping: {a: "#/defs/a"}},
    oneOf: [MEMBER],
    required: ["kind"],
  },
);
attempt(
  "compile missing oneOf",
  {discriminator: true},
  {type: "object", discriminator: {propertyName: "kind"}, required: ["kind"]},
);
attempt(
  "compile member without tag property",
  {discriminator: true},
  {type: "object", discriminator: {propertyName: "kind"}, oneOf: [{required: ["kind"]}]},
);
attempt(
  "compile tag not required",
  {discriminator: true},
  {
    type: "object",
    discriminator: {propertyName: "kind"},
    oneOf: [{properties: {kind: {const: "a"}}, required: ["a"]}],
  },
);
attempt(
  "compile tag without const or enum",
  {discriminator: true},
  {
    type: "object",
    discriminator: {propertyName: "kind"},
    oneOf: [{properties: {kind: {type: "string"}}, required: ["kind"]}],
  },
);
attempt(
  "compile non-string tag value",
  {discriminator: true},
  {
    type: "object",
    discriminator: {propertyName: "kind"},
    oneOf: [{properties: {kind: {const: 1}}, required: ["kind"]}],
  },
);
attempt(
  "compile duplicate tag value",
  {discriminator: true},
  {
    type: "object",
    discriminator: {propertyName: "kind"},
    oneOf: [
      {properties: {kind: {const: "a"}}, required: ["kind"]},
      {properties: {kind: {const: "a"}}, required: ["kind"]},
    ],
  },
);
attempt(
  "compile unresolved member reference",
  {discriminator: true},
  {
    type: "object",
    discriminator: {propertyName: "kind"},
    oneOf: [{$ref: "#/$defs/missing"}],
    required: ["kind"],
  },
);
attempt(
  "compile non-object annotation",
  {discriminator: true},
  {type: "object", discriminator: "kind", oneOf: [MEMBER], required: ["kind"]},
);

// Without the option, the annotation is an ordinary unknown keyword: strict
// mode refuses it, "log" reports it, and no strictness leaves oneOf unchanged.
for (const [label, options] of [
  ["option off strict false", {strict: false}],
  ["option off strictSchema false", {strict: true, strictSchema: false}],
]) {
  const ajv = new Ajv(options);
  const validate = ajv.compile(clone(TAGGED));
  for (const [documentLabel, document] of DOCUMENTS) {
    record(`${label} ${documentLabel}`, ajv, validate, document);
  }
}

attempt("option off strict true", {strict: true}, TAGGED);
recordWarnings("option off strict log", {strict: "log"}, TAGGED, [
  {kind: "circle", radius: 2},
  {kind: "hexagon"},
  {},
]);

for (const result of results) {
  console.log(JSON.stringify(result));
}
