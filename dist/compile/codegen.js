"use strict";

// ajv publishes its code-generation helpers as a directory entry point,
// `ajv/dist/compile/codegen`; this package's export map resolves that path to
// this file. It holds exactly the directory's index surface.
module.exports = require("../../lib/codegen-index");
