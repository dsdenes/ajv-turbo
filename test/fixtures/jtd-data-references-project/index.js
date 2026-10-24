"use strict";

// A service whose JSON Type Definition custom rules take their value from the
// document being validated. It registers the same definitions with and without
// the data-reference option, compiles schemas that use the rules, and prints
// every verdict, report, and compile-time refusal as one JSON line, so the
// same run can be replayed against another validator.

const importPaths = ["ajv/dist/jtd", "ajv/dist/jtd.js"];

const recordSchema = (keyword, value) => ({
  properties: {
    n: {type: "int32", metadata: {[keyword]: value}},
  },
  optionalProperties: {
    divisor: {type: "int32"},
  },
});

const results = [];

function report(label, instance, validate, documents) {
  for (const [name, document] of documents) {
    const valid = validate(document);
    results.push({
      case: `${label} ${name}`,
      valid,
      errors: validate.errors,
      text: instance.errorsText(validate.errors),
    });
  }
}

function refusal(label, run) {
  try {
    run();
  } catch (error) {
    results.push({case: label, error: error.message});
    return;
  }
  results.push({case: label, error: null});
}

function runScenarios(modulePath) {
  const Ajv = require(modulePath);
  const {_} = Ajv;
  const prefix = modulePath;

  const documents = [
    ["divisible", {n: 10, divisor: 5}],
    ["not divisible", {n: 11, divisor: 5}],
    ["absent location", {n: 11}],
    ["wrong kind", {n: 10, divisor: "5"}],
  ];

  const enabled = new Ajv({$data: true, allErrors: true});
  enabled.addKeyword({
    keyword: "multiple",
    $data: true,
    schemaType: "number",
    validate: (divisor, value) => value % divisor === 0,
  });
  report(
    `${prefix} enabled`,
    enabled,
    enabled.compile(recordSchema("multiple", {$data: "/divisor"})),
    documents,
  );

  const firstError = new Ajv({$data: true});
  firstError.addKeyword({
    keyword: "multiple",
    $data: true,
    schemaType: "number",
    validate: (divisor, value) => value % divisor === 0,
  });
  report(
    `${prefix} first error`,
    firstError,
    firstError.compile(recordSchema("multiple", {$data: "/divisor"})),
    [["wrong kind", {n: 10, divisor: "5"}]],
  );

  const verbose = new Ajv({$data: true, allErrors: true, verbose: true});
  verbose.addKeyword({
    keyword: "multiple",
    $data: true,
    schemaType: "number",
    validate: (divisor, value) => value % divisor === 0,
  });
  report(
    `${prefix} verbose`,
    verbose,
    verbose.compile(recordSchema("multiple", {$data: "/divisor"})),
    [["wrong kind", {n: 10, divisor: "5"}]],
  );

  const messageFree = new Ajv({$data: true, allErrors: true, messages: false});
  messageFree.addKeyword({
    keyword: "multiple",
    $data: true,
    schemaType: "number",
    validate: (divisor, value) => value % divisor === 0,
  });
  report(
    `${prefix} message-free`,
    messageFree,
    messageFree.compile(recordSchema("multiple", {$data: "/divisor"})),
    [["wrong kind", {n: 10, divisor: "5"}]],
  );

  const reported = new Ajv({$data: true, allErrors: true});
  reported.addKeyword({
    keyword: "underLimit",
    $data: true,
    schemaType: "number",
    $dataError: {
      message: ({keyword}) => `"${keyword}" needs a number from the document`,
      params: () => ({reason: "document value"}),
    },
    validate: (limit, value) => value <= limit,
  });
  report(
    `${prefix} custom data error`,
    reported,
    reported.compile({
      properties: {
        n: {type: "int32", metadata: {underLimit: {$data: "/limit"}}},
      },
      optionalProperties: {
        limit: {type: "int32"},
      },
    }),
    [["wrong kind", {n: 1, limit: true}], ["absent location", {n: 1}]],
  );

  const generated = new Ajv({$data: true, allErrors: true});
  generated.addKeyword({
    keyword: "atLeast",
    $data: true,
    schemaType: "number",
    code(cxt) {
      const {data, schemaCode} = cxt;
      cxt.fail$data(_`${data} % ${schemaCode} !== 0`);
    },
  });
  report(
    `${prefix} generated code`,
    generated,
    generated.compile(recordSchema("atLeast", {$data: "/divisor"})),
    documents,
  );

  const relative = new Ajv({$data: true, allErrors: true});
  relative.addKeyword({
    keyword: "multiple",
    $data: true,
    schemaType: "number",
    validate: (divisor, value) => value % divisor === 0,
  });
  report(
    `${prefix} relative pointer`,
    relative,
    relative.compile(recordSchema("multiple", {$data: "1/divisor"})),
    [
      ["divisible", {n: 10, divisor: 5}],
      ["not divisible", {n: 11, divisor: 5}],
    ],
  );

  const disabled = new Ajv({allErrors: true});
  disabled.addKeyword({
    keyword: "multiple",
    $data: true,
    schemaType: "number",
    validate: (divisor, value) => value % divisor === 0,
  });
  report(
    `${prefix} disabled literal`,
    disabled,
    disabled.compile(recordSchema("multiple", 5)),
    [
      ["divisible", {n: 10}],
      ["not divisible", {n: 11}],
    ],
  );

  const disabledObject = new Ajv({allErrors: true});
  const seen = [];
  disabledObject.addKeyword({
    keyword: "same",
    $data: true,
    validate: (value, data) => {
      seen.push([value, data]);
      return true;
    },
  });
  report(
    `${prefix} disabled object`,
    disabledObject,
    disabledObject.compile(recordSchema("same", {$data: "/divisor"})),
    [["literal object", {n: 1, divisor: 2}]],
  );
  results.push({case: `${prefix} disabled object seen`, seen});

  refusal(`${prefix} invalid pointer`, () => {
    const instance = new Ajv({$data: true});
    instance.addKeyword({
      keyword: "same",
      $data: true,
      validate: () => true,
    });
    instance.compile(recordSchema("same", {$data: "bad"}));
  });

  refusal(`${prefix} deep relative pointer`, () => {
    const instance = new Ajv({$data: true});
    instance.addKeyword({
      keyword: "same",
      $data: true,
      validate: () => true,
    });
    instance.compile(recordSchema("same", {$data: "2/divisor"}));
  });

  refusal(`${prefix} prepared rule only`, () => {
    const instance = new Ajv({$data: true});
    instance.addKeyword({
      keyword: "same",
      $data: true,
      compile: () => () => true,
    });
  });

  refusal(`${prefix} macro only`, () => {
    const instance = new Ajv({$data: true});
    instance.addKeyword({
      keyword: "same",
      $data: true,
      macro: () => ({type: "int32"}),
    });
  });

  refusal(`${prefix} disabled reference with type`, () => {
    const instance = new Ajv();
    instance.addKeyword({
      keyword: "same",
      $data: true,
      schemaType: "number",
      validate: () => true,
    });
    instance.compile(recordSchema("same", {$data: "/divisor"}));
  });
}

for (const modulePath of importPaths) runScenarios(modulePath);

for (const row of results) console.log(JSON.stringify(row));
