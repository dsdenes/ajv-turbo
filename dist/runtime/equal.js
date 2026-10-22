"use strict";

const {deepEqual} = require("../../lib/util");

// Deep equality with the semantics ajv's `equal` runtime helper provides. It
// is the comparison the package already uses for `enum`, `const`, and
// `uniqueItems`, so a validator ajv generated compares values the same way
// here.
const equal = deepEqual;

equal.code = 'require("ajv/dist/runtime/equal").default';

module.exports = equal;
module.exports.default = equal;
