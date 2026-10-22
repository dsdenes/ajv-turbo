"use strict";

// An unchanged ajv project whose custom keyword definitions use the optional
// declarations ajv honours beyond a plain rule or macro: a rule compiled once
// against the keyword's value, a value schema, placement among the other
// keywords, implemented keywords, and a reason for an unusable document-sourced
// value. Every verdict and every error report is printed as one JSON line, so
// running the project with ajv and with the replacement in its place must
// produce identical output. DIALECT selects the entry point the same way a
// project on that dialect would: "draft7" (the default), "2019", or "2020".

const dialect = process.env.DIALECT || "draft7";

const Ajv =
  dialect === "2019"
    ? require("ajv/dist/2019")
    : dialect === "2020"
      ? require("ajv/dist/2020")
      : require("ajv");

const results = [];
let compileCalls = 0;

function registerKeywords(instance) {
  // The rule is produced once per schema location from the keyword's value.
  instance.addKeyword({
    keyword: "multiple",
    type: "number",
    compile(divisor) {
      compileCalls++;
      return (value) => value % divisor === 0;
    },
  });

  // The keyword's value must fit this schema or the schema is rejected.
  instance.addKeyword({
    keyword: "port",
    metaSchema: {type: "integer", minimum: 1, maximum: 65535},
    validate: () => true,
  });

  // Placement relative to a built-in keyword, and after every keyword.
  instance.addKeyword({
    keyword: "owner",
    type: "object",
    before: "required",
    validate: (enabled, data) => !enabled || data.owner !== undefined,
  });
  instance.addKeyword({
    keyword: "approved",
    post: true,
    validate: (enabled, data) => !enabled || data.approved === true,
  });

  // Stands in for the two keywords the schema uses instead of `bounded`.
  instance.addKeyword({
    keyword: "bounded",
    implements: ["lowerBound", "upperBound"],
    validate: (bound, data) =>
      typeof data !== "number" || (data >= (bound === undefined ? 0 : bound) && data <= 100),
  });

  // The value comes from the document; an unusable value reports this reason.
  instance.addKeyword({
    keyword: "underLimit",
    $data: true,
    schemaType: "number",
    $dataError: {
      message: ({keyword}) => `"${keyword}" needs a number from the document`,
      params: () => ({reason: "document value"}),
    },
    validate: (limit, value) => value <= limit,
  });
}

function report(instance, label, schema, documents) {
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

for (const [mode, options] of [
  ["all errors", {allErrors: true}],
  ["first error", {}],
  ["verbose", {allErrors: true, verbose: true}],
  ["message-free", {allErrors: true, messages: false}],
]) {
  const instance = new Ajv({strict: false, $data: true, ...options});
  registerKeywords(instance);

  try {
    instance.addKeyword({keyword: "typedPost", post: true, type: "number", validate: () => true});
    results.push({case: `${mode} typed post`, error: null});
  } catch (error) {
    results.push({case: `${mode} typed post`, error: error.message});
  }

  report(instance, `${mode} compiled rule`, {
    type: "object",
    properties: {n: {type: "number", multiple: 3, maximum: 10}},
  }, [
    ["valid", {n: 9}],
    ["rule fails", {n: 10}],
    ["limit fails", {n: 12}],
    ["other type", {n: "9"}],
  ]);

  for (const value of [0, 70000]) {
    try {
      instance.compile({type: "object", properties: {p: {port: value}}});
      results.push({case: `${mode} value schema ${value}`, error: null});
    } catch (error) {
      results.push({case: `${mode} value schema ${value}`, error: error.message});
    }
  }

  report(instance, `${mode} value schema accepted`, {
    type: "object",
    properties: {p: {port: 8080}},
  }, [
    ["valid", {p: 8080}],
    ["missing", {}],
    ["wrong type", {p: "8080"}],
  ]);

  report(instance, `${mode} placement`, {
    type: "object",
    owner: true,
    approved: true,
    required: ["id"],
    properties: {
      id: {type: "string"},
      score: {type: "number", lowerBound: 10, upperBound: 20},
    },
  }, [
    ["several fail", {score: -5}],
    ["implemented keyword fails", {id: "x", owner: "me", approved: true, score: 101}],
    ["valid", {id: "x", owner: "me", approved: true, score: 50}],
  ]);

  report(instance, `${mode} document value`, {
    type: "object",
    properties: {
      limit: {type: "number"},
      value: {type: "number", underLimit: {$data: "/limit"}},
    },
  }, [
    ["valid", {limit: 5, value: 3}],
    ["limit fails", {limit: 5, value: 9}],
    ["unusable value", {limit: "x", value: 3}],
    ["absent", {value: 3}],
  ]);
}

results.push({case: "compile calls", compileCalls});

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
