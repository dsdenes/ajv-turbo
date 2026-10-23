"use strict";

// The timestamp runtime ajv's generated JSON Type Definition validators
// require by path. It is the check the dialect's `timestamp` type applies, so
// a validator ajv generated keeps validating timestamps the same way after
// this package takes ajv's place.
const {_validTimestamp} = require("../../lib/jtd");

const validTimestamp = _validTimestamp;

validTimestamp.code = 'require("ajv/dist/runtime/timestamp").default';

module.exports = validTimestamp;
module.exports.default = validTimestamp;
