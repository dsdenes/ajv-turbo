"use strict";

const fs = require("fs");
const path = require("path");
const {_} = require("ajv");

const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");
const generatedDir = path.join(__dirname, "generated");

const account = JSON.parse(fs.readFileSync(path.join(schemaDir, "account.json"), "utf8"));

// The project registers a format and a custom keyword the way its own code
// always has, names the module a generated validator resolves its non-pattern
// formats from, and generates one validator per dialect entry point.
const entryPoints = [
  {name: "draft7", module: "ajv"},
  {name: "2019", module: "ajv/dist/2019"},
  {name: "2020", module: "ajv/dist/2020"},
];

fs.mkdirSync(generatedDir, {recursive: true});
const results = [];

for (const entry of entryPoints) {
  const Ajv = require(entry.module);
  const standaloneCode = require("ajv/dist/standalone");
  const ajv = new Ajv({
    strict: true,
    code: {source: true, formats: _`require("../formats")`},
  });
  ajv.addFormat("hex", /^[0-9a-f]+$/);
  ajv.addFormat("slug", "^[a-z]+(-[a-z]+)*$");
  ajv.addFormat("positive", {type: "number", validate: (value) => value > 0});
  ajv.addKeyword({keyword: "even", type: "number", macro: () => ({multipleOf: 2})});
  const validate = ajv.compile(account);
  const file = path.join(generatedDir, entry.name + ".js");
  fs.writeFileSync(file, standaloneCode(ajv, validate));
  const generated = require(file);

  for (const name of fs.readdirSync(dataDir).sort()) {
    if (!name.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
    const valid = generated(data);
    results.push({
      dialect: entry.name,
      case: name.slice(0, -".json".length),
      valid,
      errors: generated.errors,
      text: ajv.errorsText(generated.errors),
    });
  }
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
