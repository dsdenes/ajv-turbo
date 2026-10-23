"use strict";

const AjvJTD = require("../lib/jtd");
const {KeywordCxt} = require("../lib/keyword-code");
const {_, str, stringify, nil, Name, CodeGen} = require("../lib/codegen");

// ajv's JSON Type Definition entry point: `ajv/dist/jtd`. The same class and
// the code-generation helpers ajv re-exports from its dialect entry points.
module.exports = AjvJTD;
module.exports.default = AjvJTD;
module.exports.Ajv = AjvJTD;
module.exports.ValidationError = AjvJTD.ValidationError;
module.exports.MissingRefError = AjvJTD.MissingRefError;
module.exports.KeywordCxt = KeywordCxt;
module.exports._ = _;
module.exports.str = str;
module.exports.stringify = stringify;
module.exports.nil = nil;
module.exports.Name = Name;
module.exports.CodeGen = CodeGen;
