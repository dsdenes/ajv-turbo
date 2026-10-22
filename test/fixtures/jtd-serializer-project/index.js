"use strict";

// A service that turns telemetry values into JSON text with ajv's JSON Type
// Definition serializer. It reads its schemas and data from its own files,
// renders one line per case, and can be replayed against another package
// installed as `ajv`.

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv/dist/jtd");

const ajv = new Ajv();

const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");

const schemas = new Map();
for (const file of fs.readdirSync(schemaDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const name = file.slice(0, -".json".length);
  schemas.set(name, JSON.parse(fs.readFileSync(path.join(schemaDir, file), "utf8")));
}

const cases = [];
for (const file of fs.readdirSync(dataDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const [name, kind] = file.split(".");
  cases.push({
    case: `${name}.${kind}`,
    schema: schemas.get(name),
    data: JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")),
  });
}

// Values a service builds in memory rather than reading from a JSON file.
cases.push({
  case: "telemetry.date",
  schema: schemas.get("telemetry"),
  data: {
    name: "probe",
    stamps: [{at: new Date("2020-01-01T00:00:00.000Z")}, {at: new Date(0), zone: "utc"}],
    labels: {},
    note: undefined,
    extra: {nested: true},
  },
});
cases.push({
  case: "event.date",
  schema: schemas.get("event"),
  data: {kind: "started", at: new Date("2020-01-02T03:04:05.678Z"), id: "abc"},
});

for (const {case: name, schema, data} of cases) {
  if (!schema) throw new Error(`no schema named ${name.split(".")[0]}`);
  const serialize = ajv.compileSerializer(schema);
  process.stdout.write(JSON.stringify({case: name, text: serialize(data)}) + "\n");
}
