"use strict";

// An unchanged ajv project whose custom keywords use both non-rule forms:
// macros, whose returned schema stands in for the keyword, and validation
// functions supplied by the project. It validates one valid and one invalid
// document for every schema and prints the verdict together with the error
// report. DIALECT selects the ajv entry point the same way a project on that
// dialect would: "draft7" (the default), "2019", or "2020".

const dialect = process.env.DIALECT || "draft7";

const Ajv =
  dialect === "2019"
    ? require("ajv/dist/2019")
    : dialect === "2020"
      ? require("ajv/dist/2020")
      : require("ajv");

const defsKey = dialect === "draft7" ? "definitions" : "$defs";
const slugPattern = "^[a-z0-9]+(?:-[a-z0-9]+)*$";

// Reports its own error entries on rejection.
const evenValidator = function evenValidator(enabled, value) {
  if (!enabled) return true;
  if (value % 2 === 0) return true;
  evenValidator.errors = [
    {keyword: "evenFunction", params: {divisor: 2}, message: "must be an even number"},
  ];
  return false;
};
evenValidator.errors = null;

function registerKeywords(instance) {
  instance.addKeyword({keyword: "evenFunction", type: "number", validate: evenValidator});
  instance.addKeyword({
    keyword: "positive",
    type: "number",
    validate: (enabled, value) => enabled !== true || value > 0,
  });
  instance.addKeyword({keyword: "even", type: "number", macro: () => ({multipleOf: 2})});
  instance.addKeyword({keyword: "slug", type: "string", macro: () => ({pattern: slugPattern})});
  instance.addKeyword({keyword: "shaped", macro: () => ({type: ["string", "null"]})});
  instance.addKeyword({keyword: "fragmentRef", macro: (reference) => ({$ref: reference})});
  instance.addKeyword({
    keyword: "removableFragment",
    macro: () => ({minimum: 100}),
  });
  instance.addKeyword({keyword: "removableRule", validate: () => false});
  instance.addSchema({$id: "https://example.test/even", multipleOf: 2});
}

function run(instance, label, schema, documents) {
  const validate = instance.compile(schema);
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

const results = [];

for (const [mode, options] of [
  ["all errors", {allErrors: true}],
  ["first error", {}],
]) {
  const instance = new Ajv({strict: false, ...options});
  registerKeywords(instance);

  run(instance, `${mode} fragment macro`, {type: "object", properties: {n: {even: true}}}, [
    ["valid", {n: 4}],
    ["invalid", {n: 3}],
  ]);

  run(
    instance,
    `${mode} untyped fragment macro`,
    {type: "object", properties: {value: {shaped: true}}},
    [
      ["string", {value: "text"}],
      ["null", {value: null}],
      ["number", {value: 7}],
      ["object", {value: {}}],
    ],
  );

  run(instance, `${mode} typed fragment macro`, {type: "object", properties: {value: {slug: true}}}, [
    ["valid", {value: "good-slug"}],
    ["invalid", {value: "Bad Slug"}],
    ["other type", {value: 7}],
    ["null", {value: null}],
  ]);

  run(
    instance,
    `${mode} fragment reference`,
    {
      [defsKey]: {even: {multipleOf: 2}},
      type: "object",
      properties: {n: {fragmentRef: `#/${defsKey}/even`}},
    },
    [
      ["valid", {n: 6}],
      ["invalid", {n: 5}],
    ],
  );

  run(
    instance,
    `${mode} external fragment reference`,
    {type: "object", properties: {n: {fragmentRef: "https://example.test/even"}}},
    [
      ["valid", {n: 8}],
      ["invalid", {n: 9}],
    ],
  );

  run(instance, `${mode} function keyword`, {type: "object", properties: {n: {positive: true}}}, [
    ["valid", {n: 5}],
    ["invalid", {n: -5}],
    ["other type", {n: "5"}],
  ]);

  run(
    instance,
    `${mode} function keyword with errors`,
    {type: "object", properties: {n: {evenFunction: true}}},
    [
      ["valid", {n: 2}],
      ["invalid", {n: 3}],
    ],
  );

  run(
    instance,
    `${mode} combined keywords`,
    {type: "object", properties: {n: {even: true, positive: true, maximum: 10}}},
    [
      ["valid", {n: 4}],
      ["macro fails", {n: 3}],
      ["limit fails", {n: 12}],
    ],
  );

  const removalSchema = () => ({removableFragment: true, removableRule: true});
  const beforeRemoval = instance.compile(removalSchema());
  results.push({
    case: `${mode} removal before`,
    valid: beforeRemoval(1),
    errors: beforeRemoval.errors,
    text: instance.errorsText(beforeRemoval.errors),
  });

  instance.removeKeyword("removableFragment");
  instance.removeKeyword("removableRule");

  const afterRemoval = instance.compile(removalSchema());
  results.push({
    case: `${mode} removal after`,
    valid: afterRemoval(1),
    errors: afterRemoval.errors,
    text: instance.errorsText(afterRemoval.errors),
  });
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
