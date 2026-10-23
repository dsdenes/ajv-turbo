"use strict";

// An existing service that supplies its own schema identifier strategy. Its
// schemas carry identifiers in a private `thing:` form, references are written
// either in that form or as a bare name, and the strategy treats every spelling
// of a name as the same identifier. It runs unchanged with ajv and with the
// replacement installed in ajv's place; every printed line must match.

const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");
const AjvJTD = require("ajv/dist/jtd");

const PRIVATE = "thing:";
const results = [];

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

// The project's strategy. Identifiers in the private form keep only their
// lowercased name; a bare name means a private identifier; every other form
// resolves as a URI would, including the meta-schemas ajv itself registers.
function makeResolver() {
  const split = (text) => {
    const body = String(text);
    const hash = body.indexOf("#");
    if (hash === -1) return {body, fragment: undefined};
    return {body: body.slice(0, hash), fragment: body.slice(hash + 1)};
  };
  return {
    parse(uri) {
      const {body, fragment} = split(uri);
      if (body.startsWith(PRIVATE)) {
        return {private: true, name: body.slice(PRIVATE.length).toLowerCase(), fragment};
      }
      return {private: false, text: body, fragment};
    },
    serialize(component) {
      const body = component.private ? PRIVATE + component.name : component.text;
      return component.fragment === undefined ? body : `${body}#${component.fragment}`;
    },
    resolve(base, ref) {
      const text = String(ref);
      if (text === "") return String(base);
      if (text.startsWith("#")) {
        const baseBody = String(base).split("#")[0];
        return baseBody === "#" ? text : baseBody + text;
      }
      if (text.startsWith(PRIVATE)) {
        const {body, fragment} = split(text);
        const out = PRIVATE + body.slice(PRIVATE.length).toLowerCase();
        return fragment === undefined ? out : `${out}#${fragment}`;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
      const baseBody = String(base).split("#")[0];
      if (text.includes("/")) {
        const slash = baseBody.lastIndexOf("/");
        return (slash === -1 ? "" : baseBody.slice(0, slash + 1)) + text;
      }
      return PRIVATE + text.toLowerCase();
    },
  };
}

const PERSON = {
  $id: "thing:person",
  type: "object",
  required: ["name"],
  properties: {
    name: {type: "string"},
    age: {type: "integer", minimum: 0},
  },
};

const ROOT = {
  $id: "thing:root",
  definitions: {
    address: {
      $id: "thing:address",
      type: "object",
      required: ["city"],
      properties: {city: {type: "string"}},
    },
  },
  properties: {
    home: {$ref: "#/definitions/address"},
  },
};

function report(label, ajv, validate, data) {
  const input = clone(data);
  const valid = validate(input);
  results.push({
    case: label,
    valid,
    errors: validate.errors,
    text: ajv.errorsText(validate.errors),
    data: input,
  });
}

function refused(label, ajv, schema) {
  try {
    ajv.compile(clone(schema));
    results.push({case: label, refused: false});
  } catch (error) {
    results.push({
      case: label,
      refused: true,
      name: error.name,
      message: error.message,
      missingRef: error.missingRef,
      missingSchema: error.missingSchema,
    });
  }
}

function lookup(label, ajv, ref) {
  results.push({case: label, found: Boolean(ajv.getSchema(ref))});
}

function runDialect(name, Dialect) {
  const ajv = new Dialect({uriResolver: makeResolver(), strict: false});
  ajv.addSchema(clone(PERSON));
  ajv.addSchema(clone(ROOT));

  // A bare reference written in the project's identifier form.
  const byBareName = ajv.compile({$ref: "Person"});
  report(`${name} bare valid`, ajv, byBareName, {name: "Ada", age: 36});
  report(`${name} bare invalid`, ajv, byBareName, {name: 7, age: -1});

  // Every spelling the strategy treats as one identifier.
  for (const spelling of ["person", "PERSON", "thing:PeRsOn", "thing:person"]) {
    const validate = ajv.compile({$ref: spelling});
    report(`${name} spelling ${spelling} valid`, ajv, validate, {name: "Ada"});
    report(`${name} spelling ${spelling} invalid`, ajv, validate, {age: 3});
  }

  // A nested identifier resolved by the strategy and reached by a bare name.
  const byNestedName = ajv.compile({$ref: "Address"});
  report(`${name} nested valid`, ajv, byNestedName, {city: "Paris"});
  report(`${name} nested invalid`, ajv, byNestedName, {city: 12});

  // The enclosing schema reached by pointer, and a reference inside it.
  const byPointer = ajv.getSchema("thing:root#/definitions/address");
  report(`${name} pointer valid`, ajv, byPointer, {city: "Rome"});
  report(`${name} pointer invalid`, ajv, byPointer, {city: 9});
  const byHome = ajv.getSchema("thing:root");
  report(`${name} root valid`, ajv, byHome, {home: {city: "Oslo"}});
  report(`${name} root invalid`, ajv, byHome, {home: {city: 1}});

  // The registry answers the canonical identifier and the project's key, but
  // not an unrelated spelling: the strategy resolves references, it does not
  // rename stored keys.
  lookup(`${name} lookup canonical`, ajv, "thing:person");
  lookup(`${name} lookup mixed case`, ajv, "THING:Person");
  lookup(`${name} lookup bare`, ajv, "Person");

  // The strategy maps this name, but no schema carries the result.
  refused(`${name} unresolved`, ajv, {$ref: "Missing"});

  // The same program without a strategy: identifiers written the same way
  // keep the outcome the package already produced.
  const plain = new Dialect({strict: false});
  plain.addSchema({$id: "thing:plain", type: "object", properties: {id: {type: "number"}}});
  const plainSelf = plain.compile({$ref: "thing:plain"});
  report(`${name} default self valid`, plain, plainSelf, {id: 1});
  report(`${name} default self invalid`, plain, plainSelf, {id: "1"});
  refused(`${name} default missing`, plain, {$ref: "thing:missing"});
  lookup(`${name} default lookup`, plain, "thing:plain");
}

function runJtd() {
  const ajv = new AjvJTD({uriResolver: makeResolver()});
  const parse = ajv.compileParser({
    discriminator: "kind",
    mapping: {a: {properties: {x: {type: "string"}}}},
  });
  results.push({case: "jtd parse", value: parse('{"kind":"a","x":"ok"}')});
  results.push({case: "jtd parse invalid", value: parse('{"kind":"a","x":1}')});
  const serialize = ajv.compileSerializer({properties: {x: {type: "int32"}}});
  results.push({case: "jtd serialize", value: serialize({x: 4})});
  try {
    ajv.compileParser({elements: {ref: "Missing"}});
    results.push({case: "jtd missing definition", refused: false});
  } catch (error) {
    results.push({
      case: "jtd missing definition",
      refused: true,
      name: error.name,
      message: error.message,
      missingRef: error.missingRef,
      missingSchema: error.missingSchema,
    });
  }
}

runDialect("draft-07", Ajv);
runDialect("2019-09", Ajv2019);
runDialect("2020-12", Ajv2020);
runJtd();

for (const result of results) console.log(JSON.stringify(result));
