"use strict";

// `ajv/dist/compile/names`: the variable names a generated validator and a
// keyword extension share. Extensions import these to read the validator's
// error state from their generated code.
module.exports = require("../../lib/compile-names");
