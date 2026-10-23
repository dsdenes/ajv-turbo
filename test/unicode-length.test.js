"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const standaloneReference = require("ajv-reference/dist/standalone");
const standaloneReplacement = require("../dist/standalone");
const {ROOT} = require("./lib/project");

const REFERENCE = path.dirname(require.resolve("ajv-reference/package.json"));
const WORK = path.join(ROOT, ".tmp", "unicode-length");

const DIALECTS = [
  {
    name: "draft-07",
    reference: require("ajv-reference"),
    replacement: require("../"),
  },
  {
    name: "2019-09",
    reference: require("ajv-reference/dist/2019"),
    replacement: require("../lib/ajv2019"),
  },
  {
    name: "2020-12",
    reference: require("ajv-reference/dist/2020"),
    replacement: require("../lib/ajv2020"),
  },
];

// A two-character bound separates every counting rule: "ab" is two code units
// and two code points; one astral character is two code units but one code
// point; one astral character plus "a" is three code units but two code
// points. The lone high surrogate is one code unit and one code point.
const STRINGS = [
  "ab",
  "\u{1F600}",
  "\u{1F600}a",
  "a\u{1F600}",
  "\u{1F600}\u{1F600}",
  "\uD800",
  "abc",
];

const SCHEMAS = {
  literal: {type: "string", minLength: 2, maxLength: 2},
  data: {
    type: "object",
    properties: {
      value: {type: "string", minLength: {$data: "1/min"}, maxLength: {$data: "1/max"}},
    },
    required: ["value"],
  },
};

const DATA = [
  {min: 2, max: 2, value: "ab"},
  {min: 2, max: 2, value: "\u{1F600}"},
  {min: 2, max: 2, value: "\u{1F600}a"},
  {min: 3, max: 3, value: "a\u{1F600}"},
  {min: 1, max: 1, value: "\uD800"},
];

const ASYNC_SCHEMA = {...SCHEMAS.literal, $async: true};

function optionsFor(kind, unicode) {
  const options = {logger: false, code: {source: true}};
  if (unicode !== undefined) options.unicode = unicode;
  if (kind === "data") options.$data = true;
  return options;
}

function documents(kind) {
  return kind === "data" ? DATA : STRINGS;
}

function snapshot(validate, data) {
  const valid = validate(data);
  return {valid, errors: valid ? null : JSON.parse(JSON.stringify(validate.errors))};
}

async function asyncSnapshot(validate, data) {
  try {
    await validate(data);
    return {valid: true, errors: null};
  } catch (error) {
    return {valid: false, errors: JSON.parse(JSON.stringify(error.errors))};
  }
}

function prepareModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(WORK + path.sep)) delete require.cache[key];
  }
  fs.rmSync(WORK, {recursive: true, force: true});
  const sides = {};
  for (const side of ["reference", "replacement"]) {
    const dir = path.join(WORK, side);
    fs.mkdirSync(path.join(dir, "node_modules"), {recursive: true});
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({name: side + "-validators", private: true}),
    );
    sides[side] = {dir, counter: 0};
  }
  fs.symlinkSync(REFERENCE, path.join(WORK, "reference", "node_modules", "ajv"), "dir");
  fs.symlinkSync(ROOT, path.join(WORK, "replacement", "node_modules", "ajv"), "dir");
  return sides;
}

function load(side, code) {
  const file = path.join(side.dir, "validate" + side.counter++ + ".js");
  fs.writeFileSync(file, code);
  try {
    return require(file);
  } catch (error) {
    delete require.cache[file];
    throw error;
  }
}

test("unicode: false counts UTF-16 code units like ajv in every dialect", async () => {
  const mismatches = [];
  for (const dialect of DIALECTS) {
    for (const unicode of [undefined, false]) {
      for (const kind of ["literal", "data"]) {
        const options = optionsFor(kind, unicode);
        const reference = new dialect.reference(options);
        const replacement = new dialect.replacement(options);
        const referenceValidate = reference.compile(SCHEMAS[kind]);
        const replacementValidate = replacement.compile(SCHEMAS[kind]);
        for (const document of documents(kind)) {
          const expected = snapshot(referenceValidate, document);
          const actual = snapshot(replacementValidate, document);
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            mismatches.push({dialect: dialect.name, unicode, kind, document, expected, actual});
          }
        }
      }

      const options = optionsFor("literal", unicode);
      const referenceValidate = new dialect.reference(options).compile(ASYNC_SCHEMA);
      const replacementValidate = new dialect.replacement(options).compile(ASYNC_SCHEMA);
      for (const document of STRINGS) {
        const expected = await asyncSnapshot(referenceValidate, document);
        const actual = await asyncSnapshot(replacementValidate, document);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          mismatches.push({
            dialect: dialect.name,
            unicode,
            kind: "async",
            document,
            expected,
            actual,
          });
        }
      }
    }
  }
  assert.deepStrictEqual(mismatches, []);
});

test("unicode: false reaches generated standalone validators in every dialect", () => {
  const sides = prepareModules();
  const mismatches = [];
  for (const dialect of DIALECTS) {
    for (const unicode of [undefined, false]) {
      for (const kind of ["literal", "data"]) {
        const options = optionsFor(kind, unicode);
        const referenceAjv = new dialect.reference(options);
        const replacementAjv = new dialect.replacement(options);
        const referenceValidate = referenceAjv.compile(SCHEMAS[kind]);
        const replacementValidate = replacementAjv.compile(SCHEMAS[kind]);
        const referenceModule = load(
          sides.reference,
          standaloneReference(referenceAjv, referenceValidate),
        );
        const replacementModule = load(
          sides.replacement,
          standaloneReplacement(replacementAjv, replacementValidate),
        );
        for (const document of documents(kind)) {
          const expected = snapshot(referenceModule, document);
          const actual = snapshot(replacementModule, document);
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            mismatches.push({dialect: dialect.name, unicode, kind, document, expected, actual});
          }
        }
      }
    }
  }
  assert.deepStrictEqual(mismatches, []);
});
