"use strict";

// A service that reads telemetry documents from JSON text with ajv's JSON Type
// Definition parser. It reads its schemas and input files from its own
// directory and prints, for every input, the parsed value or the parser's
// message and position, together with the validation verdict and the
// serializer's text for successfully parsed documents. The same run can be
// replayed against another validator.

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv/dist/jtd");

const ajv = new Ajv();
const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");

const parsers = new Map();
const validators = new Map();
const serializers = new Map();
for (const file of fs.readdirSync(schemaDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const name = file.slice(0, -".json".length);
  const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, file), "utf8"));
  parsers.set(name, ajv.compileParser(schema));
  validators.set(name, ajv.compile(schema));
  serializers.set(name, ajv.compileSerializer(schema));
}

// JSON.stringify would turn non-finite numbers into null and lose the sign of
// negative zero, so values are encoded with a marker for those.
function encode(value) {
  return JSON.stringify(value, (key, item) => {
    if (typeof item !== "number") return item;
    if (!Number.isFinite(item)) return `__number:${item}`;
    if (Object.is(item, -0)) return "__number:-0";
    return item;
  });
}

const results = [];

// Schemas ajv refuses to compile for parsing are reported with their reason
// through the same project path as accepted schemas.
const rejectedDir = path.join(__dirname, "rejected");
if (fs.existsSync(rejectedDir)) {
  for (const file of fs.readdirSync(rejectedDir).sort()) {
    if (!file.endsWith(".json")) continue;
    const name = file.slice(0, -".json".length);
    const schema = JSON.parse(fs.readFileSync(path.join(rejectedDir, file), "utf8"));
    try {
      ajv.compileParser(schema);
      results.push({case: `rejected.${name}`, rejected: false});
    } catch (error) {
      results.push({
        case: `rejected.${name}`,
        rejected: true,
        error: `${error.constructor.name}: ${error.message}`,
      });
    }
  }
}

for (const file of fs.readdirSync(dataDir).sort()) {
  const dot = file.indexOf(".");
  if (dot < 0) continue;
  const schemaName = file.slice(0, dot);
  const caseName = file.slice(0, file.lastIndexOf("."));
  const parse = parsers.get(schemaName);
  if (!parse) throw new Error(`no schema named ${schemaName}`);

  const text = fs.readFileSync(path.join(dataDir, file), "utf8");
  const value = parse(text);
  const result = {
    case: caseName,
    promise: value instanceof Promise,
    message: parse.message,
    position: parse.position,
  };
  if (value === undefined) {
    result.parsed = null;
    result.failed = true;
  } else {
    result.failed = false;
    result.parsed = encode(value);
    const validate = validators.get(schemaName);
    const valid = validate(value);
    result.valid = valid;
    result.errors = valid ? null : validate.errors;
    result.text = valid ? serializers.get(schemaName)(value) : null;
    result.roundTrip = valid ? encode(JSON.parse(result.text)) : null;
  }
  results.push(result);
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
