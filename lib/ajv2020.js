"use strict";

const Ajv = require("./ajv");
const {ValidationError, MissingRefError} = require("./compile");

// Ajv's public 2020-12 entry point: `ajv/dist/2020`. The class enables the
// vocabularies that are new in 2019-09 (dependent requirements, bounded
// contains, unevaluated properties and items), the dynamic-reference
// vocabulary, and the 2020-12 array applicators (`prefixItems` and the
// schema-valued `items`), and registers the 2020-12 meta-schema instead of
// draft-07's or 2019-09's.
class Ajv2020 extends Ajv {
  constructor(options = {}) {
    super({
      ...options,
      next: true,
      unevaluated: true,
      dynamicRef: true,
      metaDialect: "2020",
    });
  }
}

Ajv2020.ValidationError = ValidationError;
Ajv2020.MissingRefError = MissingRefError;
Ajv2020.default = Ajv2020;
Ajv2020.Ajv = Ajv2020;
Ajv2020.Ajv2020 = Ajv2020;

module.exports = Ajv2020;
