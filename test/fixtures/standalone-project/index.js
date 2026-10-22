"use strict";

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const standaloneCode = require("ajv/dist/standalone");

const schemaDir = path.join(__dirname, "schemas");
const dataDir = path.join(__dirname, "data");
const generatedDir = path.join(__dirname, "generated");

const catalog = JSON.parse(fs.readFileSync(path.join(schemaDir, "catalog.json"), "utf8"));
const coupon = JSON.parse(fs.readFileSync(path.join(schemaDir, "coupon.json"), "utf8"));

const options = {strict: true, code: {source: true}};
const ajv = new Ajv(options);
const allErrorsAjv = new Ajv({...options, allErrors: true});

for (const instance of [ajv, allErrorsAjv]) {
  instance.addSchema(coupon);
  instance.addSchema(catalog);
}

// One standalone module per validator, plus one module exporting both
// registered schemas by name. Generation writes plain CommonJS; the service
// requires it immediately, without a build step.
fs.mkdirSync(generatedDir, {recursive: true});
function generate(file, code) {
  fs.writeFileSync(path.join(generatedDir, file), code);
}
generate("catalog.js", standaloneCode(ajv, ajv.getSchema(catalog.$id)));
generate("catalog-all.js", standaloneCode(allErrorsAjv, allErrorsAjv.getSchema(catalog.$id)));
generate("registry.js", standaloneCode(allErrorsAjv, {catalog: catalog.$id, coupon: coupon.$id}));

const generated = {
  catalog: require(path.join(generatedDir, "catalog.js")),
  catalogAll: require(path.join(generatedDir, "catalog-all.js")),
  registry: require(path.join(generatedDir, "registry.js")),
};

const results = [];
function record(entry) {
  results.push(entry);
}

const validators = [
  {mode: "first", validate: generated.catalog, instance: ajv},
  {mode: "all", validate: generated.catalogAll, instance: allErrorsAjv},
  {mode: "registry", validate: generated.registry.catalog, instance: allErrorsAjv},
];

for (const file of fs.readdirSync(dataDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const name = file.slice(0, -".json".length);
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
  for (const {mode, validate, instance} of validators) {
    const valid = validate(data);
    record({
      case: name,
      mode,
      valid,
      errors: validate.errors,
      text: instance.errorsText(validate.errors),
    });
  }
}

for (const couponValue of [null, "SAVE20", "bad coupon", 12, "TOOLONGCOUPON1"]) {
  const valid = generated.registry.coupon(couponValue);
  record({
    case: "coupon." + JSON.stringify(couponValue),
    mode: "registry",
    valid,
    errors: generated.registry.coupon.errors,
    text: allErrorsAjv.errorsText(generated.registry.coupon.errors),
  });
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
