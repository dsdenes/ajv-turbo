"use strict";

// A project that rewrites the source of every validator it compiles and then
// validates documents through the rewritten validators. The same program runs
// with ajv and with the replacement installed in its place.

const fs = require("node:fs");
const path = require("node:path");

const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");
const AjvJTD = require("ajv/dist/jtd");
const standalone = require("ajv/dist/standalone");

const NAMESPACE = "https://example.test/code-process/";
const GENERATED = path.join(__dirname, "generated");

const NOTHING = "return function validate() { return false; };";
const EVERYTHING = "return function validate() { return true; };";
const ASYNC_FAILURE =
  'return function validate() { return Promise.reject(new Error("rewritten async failure")); };';

const DIALECTS = [
  {
    name: "draft7",
    Ajv,
    schema: {
      type: "object",
      properties: {value: {type: "integer"}},
      required: ["value"],
    },
    valid: {value: 3},
    invalid: {},
    malformed: "not an object",
  },
  {
    name: "2019",
    Ajv: Ajv2019,
    schema: {
      type: "object",
      properties: {value: {type: "integer"}},
      required: ["value"],
    },
    valid: {value: 3},
    invalid: {},
    malformed: "not an object",
  },
  {
    name: "2020",
    Ajv: Ajv2020,
    schema: {
      type: "object",
      properties: {value: {type: "integer"}},
      required: ["value"],
    },
    valid: {value: 3},
    invalid: {},
    malformed: "not an object",
  },
  {
    name: "jtd",
    Ajv: AjvJTD,
    schema: {
      properties: {value: {type: "int32"}},
      optionalProperties: {note: {type: "string"}},
    },
    valid: {value: 3},
    invalid: {},
    malformed: "not an object",
  },
];

function emit(record) {
  process.stdout.write(JSON.stringify(record) + "\n");
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function summarized(validate, data) {
  const valid = validate(data);
  return {valid, errors: clone(validate.errors)};
}

// Records the identifiers of the fixture's own schemas. Internal environments
// (meta-schemas and their references) are compiled by both implementations as
// part of schema validation; the fixture compares the compilations it asked
// for, which is what a project's rewrite observes.
function recording(records) {
  return (code, env) => {
    const id = env && env.schema && env.schema.$id;
    if (typeof id === "string" && id.startsWith(NAMESPACE)) records.push(id);
    return code;
  };
}

function rewriting(name, source) {
  return (code, env) => {
    const id = env && env.schema && env.schema.$id;
    return id === NAMESPACE + name ? source : code;
  };
}

function withId(dialect, name, extra) {
  return {...clone(dialect.schema), ...extra, $id: NAMESPACE + name};
}

async function runDialect(dialect) {
  const {name} = dialect;
  const results = {};

  // A rewrite that records each compilation and changes nothing.
  {
    const calls = [];
    const ajv = new dialect.Ajv({
      strict: false,
      validateSchema: false,
      code: {process: recording(calls)},
    });
    const schema = withId(dialect, name + "-count");
    const first = ajv.compile(schema);
    const second = ajv.compile(schema);
    const next = ajv.compile(withId(dialect, name + "-count-next"));
    results.count = {
      calls,
      sameValidator: first === second,
      valid: summarized(first, dialect.valid),
      invalid: summarized(first, dialect.invalid),
      text: ajv.errorsText(first.errors),
      again: summarized(second, dialect.valid),
      next: summarized(next, dialect.valid),
    };
  }

  // A rewrite that replaces the validator with one that rejects everything.
  {
    const ajv = new dialect.Ajv({
      strict: false,
      validateSchema: false,
      code: {process: rewriting(name + "-reject", NOTHING)},
    });
    const validate = ajv.compile(withId(dialect, name + "-reject"));
    results.reject = summarized(validate, dialect.valid);
  }

  // A rewrite that replaces the validator with one that accepts everything.
  {
    const ajv = new dialect.Ajv({
      strict: false,
      validateSchema: false,
      code: {process: rewriting(name + "-accept", EVERYTHING)},
    });
    const validate = ajv.compile(withId(dialect, name + "-accept"));
    results.accept = summarized(validate, dialect.malformed);
  }

  // A rewrite written against ajv's generated validators: it replaces the
  // final verdict expression with a rejection.
  {
    const ajv = new dialect.Ajv({
      strict: false,
      validateSchema: false,
      code: {process: (code) => code.replace(/return errors === 0/g, "return false")},
    });
    const validate = ajv.compile(withId(dialect, name + "-patched"));
    results.patched = summarized(validate, dialect.valid);
  }

  // A rewrite that fails while compiling.
  {
    const ajv = new dialect.Ajv({
      strict: false,
      validateSchema: false,
      code: {
        process: (code, env) => {
          const id = env && env.schema && env.schema.$id;
          if (id === NAMESPACE + name + "-throw") throw new Error("rewrite exploded");
          return code;
        },
      },
    });
    let produced = null;
    let failure = null;
    try {
      produced = typeof ajv.compile(withId(dialect, name + "-throw"));
    } catch (error) {
      failure = error.message;
    }
    results.throwing = {produced, failure};
  }

  // The same program without a rewrite.
  {
    const ajv = new dialect.Ajv({strict: false, validateSchema: false});
    const validate = ajv.compile(withId(dialect, name + "-plain"));
    results.plain = {
      valid: summarized(validate, dialect.valid),
      invalid: summarized(validate, dialect.invalid),
    };
  }

  // An asynchronous validator whose source the rewrite records and then fails.
  {
    const calls = [];
    const ajv = new dialect.Ajv({
      strict: false,
      validateSchema: false,
      code: {process: recording(calls)},
    });
    const validate = ajv.compile(withId(dialect, name + "-async", {$async: true}));
    results.asyncCount = {calls, $async: validate.$async === true};
  }
  {
    const ajv = new dialect.Ajv({
      strict: false,
      validateSchema: false,
      code: {process: rewriting(name + "-async-rewrite", ASYNC_FAILURE)},
    });
    const validate = ajv.compile(
      withId(dialect, name + "-async-rewrite", {$async: true}),
    );
    results.asyncRewrite = {settled: "resolved"};
    try {
      await validate(dialect.valid);
    } catch (error) {
      results.asyncRewrite = {
        settled: "rejected",
        message: error.message,
        errors: clone(error.errors),
      };
    }
  }

  // Standalone modules generated from an instance that supplies a rewrite that
  // would change validation, and from the same instance without it. Both
  // modules must behave like the unrewritten validator.
  {
    const rewritten = new dialect.Ajv({
      strict: false,
      validateSchema: false,
      code: {source: true, process: rewriting(name + "-standalone", NOTHING)},
    });
    const plain = new dialect.Ajv({
      strict: false,
      validateSchema: false,
      code: {source: true},
    });
    const rewrittenValidate = rewritten.compile(withId(dialect, name + "-standalone"));
    const plainValidate = plain.compile(withId(dialect, name + "-standalone"));
    const rewrittenModule = load(
      path.join(GENERATED, name + "-rewritten.js"),
      standalone(rewritten, rewrittenValidate),
    );
    const plainModule = load(
      path.join(GENERATED, name + "-plain.js"),
      standalone(plain, plainValidate),
    );
    results.standalone = {
      rewritten: {
        valid: summarized(rewrittenModule, dialect.valid),
        invalid: summarized(rewrittenModule, dialect.invalid),
      },
      plain: {
        valid: summarized(plainModule, dialect.valid),
        invalid: summarized(plainModule, dialect.invalid),
      },
    };
  }

  return results;
}

function load(file, code) {
  fs.writeFileSync(file, code);
  return require(file);
}

async function main() {
  fs.rmSync(GENERATED, {recursive: true, force: true});
  fs.mkdirSync(GENERATED, {recursive: true});
  for (const dialect of DIALECTS) {
    emit({case: dialect.name, results: await runDialect(dialect)});
  }
}

main().catch((error) => {
  process.stderr.write(error.stack + "\n");
  process.exitCode = 1;
});
