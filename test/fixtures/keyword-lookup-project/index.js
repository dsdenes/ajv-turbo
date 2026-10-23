"use strict";

// An unchanged project that inspects the validator's keyword vocabulary the
// way ajv publishes it. It registers rules of its own, asks about them, about
// a built-in keyword, and about a name it never registered, compiles and
// validates documents through its rules before and after the queries, then
// removes a rule and asks again. Every answer, verdict, report, and rewritten
// document is printed as one JSON line.

const ENTRY_POINTS = [
  {
    name: "draft7",
    module: "ajv",
    schema: () => ({
      type: "object",
      properties: {
        count: {type: "number", even: true},
        label: {type: "string", upper: true},
      },
      required: ["count", "label"],
    }),
  },
  {
    name: "2019",
    module: "ajv/dist/2019",
    schema: () => ({
      type: "object",
      properties: {
        count: {type: "number", even: true},
        label: {type: "string", upper: true},
      },
      required: ["count", "label"],
    }),
  },
  {
    name: "2020",
    module: "ajv/dist/2020",
    schema: () => ({
      type: "object",
      properties: {
        count: {type: "number", even: true},
        label: {type: "string", upper: true},
      },
      required: ["count", "label"],
    }),
  },
  {
    name: "jtd",
    module: "ajv/dist/jtd",
    // The JSON Type Definition meta-schema admits only its own vocabulary, so
    // a project extending it turns schema validation off, as ajv requires.
    options: {validateSchema: false},
    schema: () => ({
      properties: {
        count: {type: "float64", even: true},
        label: {type: "string", upper: true},
      },
    }),
  },
];

// Modifying rules, as a project validates with. The functions are plain
// declarations so a generated standalone validator can embed them.
function evenRule() {
  return {
    keyword: "even",
    type: "number",
    schemaType: "boolean",
    modifying: true,
    validate(enabled, value, parentSchema, dataCxt) {
      if (!enabled) return true;
      if (!Number.isInteger(value) || value % 2 !== 0) return false;
      if (dataCxt && dataCxt.parentData !== undefined) {
        dataCxt.parentData[dataCxt.parentDataProperty] = value * 10;
      }
      return true;
    },
  };
}

function upperRule() {
  return {
    keyword: "upper",
    type: "string",
    schemaType: "boolean",
    modifying: true,
    validate(enabled, value, parentSchema, dataCxt) {
      if (!enabled) return true;
      if (dataCxt && dataCxt.parentData !== undefined) {
        dataCxt.parentData[dataCxt.parentDataProperty] = value.toUpperCase();
      }
      return true;
    },
  };
}

// A rule that declares a value schema, so the registration reports the
// validator compiled for it.
function boundedRule() {
  return {
    keyword: "bounded",
    type: "number",
    schemaType: "number",
    metaSchema: {type: "number", minimum: 1},
    validate(limit, value) {
      return value <= limit;
    },
  };
}

const DOCUMENTS = [
  ["accepted", {count: 2, label: "ada"}],
  ["rejected", {count: 3, label: "ada"}],
  ["wrong types", {count: "2", label: 7}],
  ["missing count", {label: "ada"}],
  ["accepted second", {count: 4, label: "bob"}],
];

// The answer in the shape both runs print: functions are reported by their
// presence, and object keys are sorted so declarations compare by content.
function describe(value) {
  if (typeof value === "function") return "[function]";
  if (Array.isArray(value)) return value.map(describe);
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = describe(value[key]);
    return result;
  }
  return value;
}

function emit(row) {
  process.stdout.write(JSON.stringify(row) + "\n");
}

for (const entry of ENTRY_POINTS) {
  const Ajv = require(entry.module);
  const ajv = new Ajv({strict: false, allErrors: true, ...entry.options});

  const even = evenRule();
  const upper = upperRule();
  for (const definition of [even, upper]) ajv.addKeyword(definition);
  const bounded = entry.name === "jtd" ? undefined : boundedRule();
  if (bounded) ajv.addKeyword(bounded);

  const validateDocuments = (step) => {
    const validate = ajv.compile(entry.schema());
    for (const [name, document] of DOCUMENTS) {
      const data = JSON.parse(JSON.stringify(document));
      const valid = validate(data);
      emit({
        dialect: entry.name,
        kind: "validation",
        step,
        case: name,
        valid,
        errors: validate.errors,
        data,
      });
    }
  };

  const emitAnswers = (step) => {
    const names = ["even", "upper", "type", "maximum", "not", "neverRegisteredKeyword"];
    if (bounded) names.push("bounded");
    for (const name of names) {
      emit({
        dialect: entry.name,
        kind: "answer",
        step,
        keyword: name,
        answer: describe(ajv.getKeyword(name)),
      });
    }
    const registration = ajv.getKeyword("even");
    emit({
      dialect: entry.name,
      kind: "registration",
      step,
      keyword: "even",
      sameValidate: registration.validate === even.validate,
      hasValidateSchema: Object.prototype.hasOwnProperty.call(registration, "validateSchema"),
    });
    if (bounded) {
      const boundedRegistration = ajv.getKeyword("bounded");
      emit({
        dialect: entry.name,
        kind: "registration",
        step,
        keyword: "bounded",
        sameValidate: boundedRegistration.validate === bounded.validate,
        hasValidateSchema: Object.prototype.hasOwnProperty.call(
          boundedRegistration,
          "validateSchema",
        ),
      });
    }
  };

  validateDocuments("before queries");
  emitAnswers("before removal");
  validateDocuments("after queries");
  ajv.removeKeyword("even");
  emitAnswers("after removal");
}
