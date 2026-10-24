"use strict";

// The variable names ajv's generated validators and keyword extensions share,
// published at `ajv/dist/compile/names`. A keyword written against ajv's code
// API refers to the validator's own error state through these names, so this
// module must expose the same `Name` instances builder-for-builder: comparing
// a foreign `Name` with one of these would never match.
//
// The generated keyword program receives these variables as parameters; see
// `compileKeywordCode` in `keyword-code.js`.

const {Name} = require("./codegen-code");

const names = {
  // validation function arguments
  data: new Name("data"),
  // args passed from referencing schema
  valCxt: new Name("valCxt"),
  instancePath: new Name("instancePath"),
  parentData: new Name("parentData"),
  parentDataProperty: new Name("parentDataProperty"),
  rootData: new Name("rootData"),
  dynamicAnchors: new Name("dynamicAnchors"),
  // function scoped variables
  vErrors: new Name("vErrors"),
  errors: new Name("errors"),
  this: new Name("this"),
  // "globals"
  self: new Name("self"),
  scope: new Name("scope"),
  // JTD serialize/parse name for JSON string and position
  json: new Name("json"),
  jsonPos: new Name("jsonPos"),
  jsonLen: new Name("jsonLen"),
  jsonPart: new Name("jsonPart"),
};

exports.__esModule = true;
exports.default = names;
