"use strict";

const path = require("node:path");
const Module = require("node:module");
const Ajv = require("../ajv");
const standaloneCode = require("../../lib/standalone");

// ajv's `AjvPack`: an Ajv instance whose compiled validators are generated and
// then evaluated, so a test exercises the generated code rather than the
// in-memory compiler.
function requireFromString(code, filename, parent) {
  const loaded = new Module(filename, parent);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(code, filename);
  return loaded.exports;
}

class AjvPack {
  constructor(ajv) {
    this.ajv = ajv;
  }

  validate(schemaKeyRef, data) {
    return Ajv.prototype.validate.call(this, schemaKeyRef, data);
  }

  compile(schema, meta) {
    return this.getStandalone(this.ajv.compile(schema, meta));
  }

  getSchema(keyRef) {
    const validate = this.ajv.getSchema(keyRef);
    return validate === undefined ? undefined : this.getStandalone(validate);
  }

  getStandalone(validate) {
    const code = standaloneCode(this.ajv, validate);
    return requireFromString(code, path.join(__dirname, "generated.js"), module);
  }

  addSchema(...args) {
    this.ajv.addSchema(...args);
    return this;
  }

  addKeyword(...args) {
    this.ajv.addKeyword(...args);
    return this;
  }
}

module.exports = AjvPack;
module.exports.default = AjvPack;
