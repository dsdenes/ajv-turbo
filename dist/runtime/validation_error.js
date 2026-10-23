"use strict";

// The error ajv's asynchronous validators reject with. ajv's generated
// asynchronous validators require this module by path.
class ValidationError extends Error {
  constructor(errors) {
    super("validation failed");
    this.errors = errors;
    this.ajv = this.validation = true;
  }
}

ValidationError.code = 'require("ajv/dist/runtime/validation_error").default';

exports.default = ValidationError;
