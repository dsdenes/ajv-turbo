"use strict";

// The timestamp runtime ajv's generated JSON Type Definition validators
// require by path. It is the check the dialect's `timestamp` type applies, so
// a validator ajv generated keeps validating timestamps the same way after
// this package takes ajv's place.
const validTimestamp = require("../../lib/jtd")._internals.validTimestamp;

validTimestamp.code = 'require("ajv/dist/runtime/timestamp").default';

exports.default = validTimestamp;
