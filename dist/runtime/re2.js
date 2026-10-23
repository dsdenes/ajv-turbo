"use strict";

// Ported from ajv 8.20.0 (MIT): the runtime helper ajv's generated
// validators require by path.
Object.defineProperty(exports, "__esModule", { value: true });
const re2 = require("re2");
re2.code = 'require("ajv/dist/runtime/re2").default';
exports.default = re2;
