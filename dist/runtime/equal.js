"use strict";

// Mirror ajv's compiled modules: the marker makes TypeScript's default-import
// interop unwrap `.default` instead of handing back the exports object.
Object.defineProperty(exports, "__esModule", {value: true});

// The equality runtime ajv's generated validators require by path. Its
// semantics are fast-deep-equal's, which is what ajv uses for `enum`, `const`,
// and `uniqueItems`, so a validator ajv generated keeps deciding equality the
// same way after this package takes ajv's place.
function equal(a, b) {
  if (a === b) return true;

  if (a && b && typeof a === "object" && typeof b === "object") {
    if (a.constructor !== b.constructor) return false;

    let length;
    let i;
    let keys;
    if (Array.isArray(a)) {
      length = a.length;
      if (length !== b.length) return false;
      for (i = length; i-- !== 0; ) if (!equal(a[i], b[i])) return false;
      return true;
    }

    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();

    keys = Object.keys(a);
    length = keys.length;
    if (length !== Object.keys(b).length) return false;

    for (i = length; i-- !== 0; ) {
      if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
    }
    for (i = length; i-- !== 0; ) {
      const key = keys[i];
      if (!equal(a[key], b[key])) return false;
    }

    return true;
  }

  // true if both NaN, false otherwise
  return a !== a && b !== b;
}

equal.code = 'require("ajv/dist/runtime/equal").default';

exports.default = equal;
