"use strict";

// Runtime evaluated inside a generated module for a JSON Type Definition
// validator. It is not loaded by the package itself: `lib/standalone.js`
// copies this file into the generated module together with the dialect
// compiler it depends on (`lib/jtd.js`) and that compiler's runtime helpers,
// so the generated validator compiles and validates without the package.

const jtd = require("./jtd");

// Each entry describes one exported validator: the schema, the options the
// validator was compiled with, and the custom keyword definitions the schema
// was compiled against. The definitions arrive with their functions already
// attached by lib/standalone.js, which embeds each one as source.
function createStandalone(entries) {
  return entries.map((entry) => {
    const env = jtd._createStandaloneEnvironment(entry.keywords);
    env.opts = entry.opts;
    return jtd._buildValidator(env, entry.schema, entry.opts);
  });
}

module.exports = {createStandalone};
