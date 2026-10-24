"use strict";

const Ajv = require("../lib/ajv");
const {KeywordCxt} = require("../lib/keyword-code");
const {_, str, stringify, nil, Name, CodeGen} = require("../lib/codegen");

// `ajv/dist/core` exports the base class without the draft-07 vocabulary or
// meta-schema that `dist/ajv` adds. The implementation keeps one class; this
// subclass starts it without a dialect and keeps the entry point's export
// surface separate from the default entry point.
class AjvCore extends Ajv {
  constructor(options = {}) {
    super(options, {core: true});
  }
}

module.exports = AjvCore;
module.exports.default = AjvCore;
module.exports.KeywordCxt = KeywordCxt;
module.exports._ = _;
module.exports.str = str;
module.exports.stringify = stringify;
module.exports.nil = nil;
module.exports.Name = Name;
module.exports.CodeGen = CodeGen;
