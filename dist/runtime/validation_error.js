"use strict";

// Mirror ajv's compiled modules: the marker makes TypeScript's default-import
// interop unwrap `.default` instead of handing back the exports object.
Object.defineProperty(exports, "__esModule", {value: true});

// The error ajv's asynchronous validators reject with. ajv's generated
// asynchronous validators require this module by path, and ajv's `Ajv` class
// exposes the same constructor. Here the class lives in `lib/compile`, so this
// module re-exports it and `instanceof` works across both imports.
const {ValidationError} = require("../../lib/compile");

exports.default = ValidationError;
