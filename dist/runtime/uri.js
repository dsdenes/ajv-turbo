"use strict";

// Ported from ajv 8.20.0 (MIT): the runtime helper ajv's generated
// validators require by path.
Object.defineProperty(exports, "__esModule", { value: true });
const uri = require("fast-uri");
uri.code = 'require("ajv/dist/runtime/uri").default';
exports.default = uri;
