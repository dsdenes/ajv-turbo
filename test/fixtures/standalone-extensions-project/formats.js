"use strict";

// The definitions a generated validator resolves for formats that are not
// plain patterns. The project names this module through ajv's `code.formats`.
module.exports = {
  positive: {
    type: "number",
    validate: (value) => value > 0,
  },
};
