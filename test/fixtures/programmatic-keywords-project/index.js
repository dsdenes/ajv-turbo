"use strict";

// An unchanged ajv project that defines all of its custom validation rules
// programmatically: either registered on the validator instance or supplied
// through the constructor's `keywords` option. It validates a fixed set of
// documents under first-error, complete, message-free, and verbose reporting
// and prints every verdict, the document as the project holds it afterwards,
// and the report as one JSON line. Running the project with ajv and with the
// replacement installed in ajv's place must produce identical output.
// DIALECT selects the entry point ("draft7", "2019", or "2020"); REGISTRATION
// selects "instance" (addKeyword) or "constructor" (the keywords option).

const dialect = process.env.DIALECT || "draft7";
const registration = process.env.REGISTRATION || "instance";

const Ajv =
  dialect === "2019"
    ? require("ajv/dist/2019")
    : dialect === "2020"
      ? require("ajv/dist/2020")
      : require("ajv");

// A rule that may report several violations for one value, in the order it
// finds them; the verdict is decided by the entries it reports.
function checkCount(spec, value) {
  const errors = [];
  if (value <= 0) {
    errors.push({keyword: "count", params: {reason: "positive"}, message: "must be positive"});
  }
  if (value > spec.limit) {
    errors.push({
      keyword: "count",
      params: {limit: spec.limit, reason: "limit"},
      message: `must not exceed ${spec.limit}`,
    });
  }
  if (spec.even && value % 2 !== 0) {
    errors.push({keyword: "count", params: {reason: "even"}, message: "must be even"});
  }
  checkCount.errors = errors;
  return errors.length === 0;
}

// A rule that rewrites the value it validates in place, through the context
// ajv hands it.
function normalizeText(enabled, value, parentSchema, dataCxt) {
  if (enabled && typeof value === "string") {
    dataCxt.parentData[dataCxt.parentDataProperty] = value.trim().replace(/\s+/g, " ").toLowerCase();
  }
  return true;
}

// A rule that rejects with its own error entries.
function uniformPage(enabled, value) {
  if (value % 2 === 0) return true;
  uniformPage.errors = [
    {keyword: "evenPage", params: {limit: enabled}, message: `must be an even page (<= ${enabled})`},
  ];
  return false;
}

function definitions() {
  return [
    {keyword: "count", type: "number", errors: true, validate: checkCount},
    {keyword: "normalize", modifying: true, validate: normalizeText},
    {
      keyword: "lowercase",
      errors: false,
      validate: (enabled, value) => typeof value !== "string" || value === value.toLowerCase(),
    },
    {
      keyword: "evenPage",
      type: "number",
      errors: true,
      validate: uniformPage,
    },
    {
      keyword: "prefixed",
      type: "string",
      compile(prefix) {
        return (value) => typeof value === "string" && value.startsWith(prefix);
      },
    },
    {keyword: "multipleOfThree", type: "number", macro: () => ({multipleOf: 3})},
  ];
}

function create(options) {
  if (registration === "constructor") return new Ajv({...options, keywords: definitions()});
  const ajv = new Ajv(options);
  for (const definition of definitions()) ajv.addKeyword(definition);
  return ajv;
}

const schema = {
  type: "object",
  required: ["count", "label"],
  properties: {
    count: {type: "number", count: {limit: 4, even: true}},
    label: {type: "string", normalize: true, lowercase: true},
    pages: {type: "number", evenPage: 3},
    steps: {type: "array", items: {type: "number", count: {limit: 2}}},
    code: {type: "string", prefixed: "AB"},
    total: {type: "number", multipleOfThree: true},
  },
};

const documents = [
  {
    case: "accepted",
    data: {count: 2, label: "  Main  ", pages: 2, steps: [1, 2], code: "AB-1", total: 3},
  },
  {
    case: "rejected",
    data: {count: 5, label: "Mixed  Case", pages: 5, steps: [3, 4], code: "ZZ", total: 4},
  },
  {
    case: "rewritten",
    data: {count: 2, label: "  MIXED  Case ", pages: 2, steps: [1, 2], code: "AB", total: 3},
  },
  {
    case: "several",
    data: {count: 0, label: "ok", pages: 1, steps: [3, 4], code: "AB", total: 6},
  },
  {
    case: "missing",
    data: {label: "  Bare ", pages: 2, steps: [], code: "AB", total: 3},
  },
  {
    case: "wrong types",
    data: {count: "five", label: 7, pages: "x", steps: "none", code: 4, total: "x"},
  },
];

const modes = [
  ["all errors", {strict: true, allErrors: true}],
  ["first error", {strict: true}],
  ["message-free", {strict: true, allErrors: true, messages: false}],
  ["verbose", {strict: true, allErrors: true, verbose: true}],
];

const results = [];
for (const [mode, options] of modes) {
  const ajv = create(options);
  const validate = ajv.compile(schema);
  for (const document of documents) {
    const data = structuredClone(document.data);
    const valid = validate(data);
    results.push({
      case: `${mode}: ${document.case}`,
      mode,
      valid,
      data,
      errors: validate.errors,
      text: ajv.errorsText(validate.errors),
    });
  }
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
