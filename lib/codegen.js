"use strict";

// The code-generation surface ajv publishes for extension authors and its own
// generated validators. `lib/codegen-*.js` hold the ajv-compatible
// implementation; this module keeps the internal module path stable and
// re-exports the same index surface ajv publishes at `dist/compile/codegen`.
module.exports = require("./codegen-index");
