"use strict";

const Ajv2019 = require("../lib/ajv2019");
const {KeywordCxt} = require("../lib/keyword-code");
const {_, str, stringify, nil, Name, CodeGen} = require("../lib/codegen");

module.exports = Ajv2019;
module.exports.default = Ajv2019;
module.exports.Ajv2019 = Ajv2019;
module.exports.ValidationError = Ajv2019.ValidationError;
module.exports.MissingRefError = Ajv2019.MissingRefError;
module.exports.KeywordCxt = KeywordCxt;
module.exports._ = _;
module.exports.str = str;
module.exports.stringify = stringify;
module.exports.nil = nil;
module.exports.Name = Name;
module.exports.CodeGen = CodeGen;
