"use strict";

const Ajv2020 = require("../lib/ajv2020");
const {KeywordCxt} = require("../lib/keyword-code");
const {_, str, stringify, nil, Name, CodeGen} = require("../lib/codegen");

module.exports = Ajv2020;
module.exports.default = Ajv2020;
module.exports.Ajv2020 = Ajv2020;
module.exports.ValidationError = Ajv2020.ValidationError;
module.exports.MissingRefError = Ajv2020.MissingRefError;
module.exports.KeywordCxt = KeywordCxt;
module.exports._ = _;
module.exports.str = str;
module.exports.stringify = stringify;
module.exports.nil = nil;
module.exports.Name = Name;
module.exports.CodeGen = CodeGen;
