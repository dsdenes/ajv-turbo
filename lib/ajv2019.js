"use strict";

const Ajv = require("./ajv");
const {ValidationError, MissingRefError} = require("./compile");

// Ajv's public 2019-09 entry point: `ajv/dist/2019`. The class enables the
// vocabularies that are new in 2019-09 (dependent requirements, bounded
// contains, unevaluated properties and items) and the dynamic-reference
// vocabulary, and registers the 2019-09 meta-schema instead of draft-07's.
class Ajv2019 extends Ajv {
  constructor(options = {}) {
    super({
      ...options,
      next: true,
      unevaluated: true,
      dynamicRef: true,
      metaDialect: "2019",
    });
  }
}

Ajv2019.ValidationError = ValidationError;
Ajv2019.MissingRefError = MissingRefError;
Ajv2019.default = Ajv2019;
Ajv2019.Ajv2019 = Ajv2019;

module.exports = Ajv2019;
