"use strict";

// ajv publishes its code-generation helpers at `ajv/dist/compile/codegen`; a
// plugin that builds code expressions for keyword definitions imports them from
// there. The same helpers live in `lib/codegen`, so a project that requires
// this path finds the names ajv exports.
module.exports = require("../../lib/codegen");
