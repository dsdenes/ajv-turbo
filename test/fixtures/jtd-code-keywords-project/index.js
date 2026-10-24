"use strict";

// An unchanged ajv project on the JSON Type Definition entry point whose
// custom keywords are defined with the generated-validation-code form: each
// definition supplies a `code` function that builds its rule through the
// KeywordCxt and the `_`/`str` helpers. Keywords are registered where ajv's
// JSON Type Definition meta-schema admits them — inside `metadata` — and, for
// the refusal cases, where it does not. Every verdict, every error report,
// every summary, and every compile-time refusal is printed as one JSON line,
// so running the project with ajv and with the replacement in its place must
// produce identical output.

const Ajv = require("ajv/dist/jtd");

const {_, str} = Ajv;

const results = [];

function register(instance) {
  // A string rule with ajv's default error report.
  instance.addKeyword({
    keyword: "startsWith",
    type: "string",
    schemaType: "string",
    code(cxt) {
      const {data, schema} = cxt;
      cxt.fail(_`${data}.indexOf(${schema}) !== 0`);
    },
  });

  // A number rule whose definition supplies its own message and params.
  instance.addKeyword({
    keyword: "even",
    type: "number",
    schemaType: "boolean",
    error: {
      message: ({keyword}) => str`${keyword} requires an even number`,
      params: ({schema}) => _`{expected: ${schema}}`,
    },
    code(cxt) {
      const {data, schema} = cxt;
      cxt.fail(_`(${data} % 2 === 0) !== ${schema}`);
    },
  });

  // An object rule carried by a record's own metadata.
  instance.addKeyword({
    keyword: "maxKeys",
    type: "object",
    schemaType: "number",
    code(cxt) {
      const {data, schema} = cxt;
      cxt.fail(_`Object.keys(${data}).length > ${schema}`);
    },
  });

  // Both generated code and a rule function: the generated code decides.
  instance.addKeyword({
    keyword: "atLeast",
    schemaType: "number",
    validate: () => false,
    code(cxt) {
      const {data, schema} = cxt;
      cxt.fail(_`${data} < ${schema}`);
    },
  });

  // A value schema enforced while the containing schema is compiled.
  instance.addKeyword({
    keyword: "port",
    type: "number",
    schemaType: "number",
    metaSchema: {type: "uint16"},
    code(cxt) {
      const {data, schema} = cxt;
      cxt.fail(_`${data} > ${schema}`);
    },
  });
}

function report(instance, label, schema, documents) {
  let validate;
  try {
    validate = instance.compile(schema);
  } catch (error) {
    results.push({case: label, error: error.message});
    return;
  }
  for (const [name, document] of documents) {
    const valid = validate(document);
    results.push({
      case: `${label} ${name}`,
      valid,
      errors: validate.errors,
      text: instance.errorsText(validate.errors),
    });
  }
}

// --- verdicts, reports, and summaries under every reporting mode ------------
for (const [mode, options] of [
  ["all errors", {allErrors: true}],
  ["first error", {}],
  ["verbose", {allErrors: true, verbose: true}],
  ["message-free", {allErrors: true, messages: false}],
]) {
  const instance = new Ajv(options);
  register(instance);

  report(
    instance,
    `${mode} record`,
    {
      properties: {
        name: {type: "string", metadata: {startsWith: "ab"}},
        score: {type: "int32", metadata: {even: true}},
      },
      optionalProperties: {
        tag: {type: "string", metadata: {startsWith: "x"}},
      },
    },
    [
      ["valid", {name: "abcd", score: 4}],
      ["name fails", {name: "xbc", score: 4}],
      ["score fails", {name: "abcd", score: 3}],
      ["both fail", {name: "xbc", score: 3}],
      ["optional valid", {name: "ab", score: 2, tag: "xy"}],
      ["optional fails", {name: "ab", score: 2, tag: "yx"}],
      ["wrong property types", {name: 5, score: "4"}],
    ],
  );

  // A record's own metadata carries a keyword declared for objects.
  report(
    instance,
    `${mode} record metadata`,
    {properties: {a: {type: "string"}}, metadata: {maxKeys: 1}},
    [
      ["valid", {a: "x"}],
      ["fails", {a: "x", b: 2}],
      ["not an object", "x"],
    ],
  );

  // A keyword declared for one data type applies to that type only.
  report(instance, `${mode} string only`, {metadata: {startsWith: "ab"}}, [
    ["string", "abcd"],
    ["number", 42],
    ["boolean", true],
    ["object", {a: 1}],
    ["array", ["ab"]],
    ["absent", undefined],
    ["null", null],
  ]);

  // Generated code decides the verdict when the definition also supplies a
  // rule function that would decide the opposite one.
  report(instance, `${mode} generated code wins`, {metadata: {atLeast: 5}}, [
    ["below", 1],
    ["equal", 5],
    ["above", 9],
  ]);

  // A keyword that declares a value schema has it enforced at compile time.
  for (const [label, value] of [
    ["port accepted", 8080],
    ["port too large", 70000],
    ["port wrong type", "8080"],
  ]) {
    try {
      const validate = instance.compile({
        properties: {p: {type: "uint16", metadata: {port: value}}},
      });
      results.push({case: `${mode} ${label}`, error: null, valid: validate(80000)});
    } catch (error) {
      results.push({case: `${mode} ${label}`, error: error.message});
    }
  }
}

// --- schemas the dialect admits and refuses --------------------------------
{
  const instance = new Ajv({allErrors: true});
  register(instance);

  // A keyword used where the JSON Type Definition meta-schema does not admit
  // it is refused with ajv's message, and no validator is produced.
  for (const [label, schema] of [
    ["root keyword", {startsWith: "ab"}],
    ["beside properties", {properties: {a: {type: "string"}}, even: true}],
    ["nested metadata", {metadata: {metadata: {startsWith: "ab"}}}],
  ]) {
    try {
      instance.compile(schema);
      results.push({case: `refused ${label}`, error: null});
    } catch (error) {
      results.push({case: `refused ${label}`, error: error.message});
    }
  }

  // The same keyword carried inside `metadata` compiles and validates.
  report(instance, "accepted", {properties: {a: {type: "string", metadata: {startsWith: "ab"}}}}, [
    ["valid", {a: "abc"}],
    ["fails", {a: "xbc"}],
  ]);
}

// A value schema's own rejection leaves no validator behind.
{
  const instance = new Ajv();
  register(instance);
  try {
    instance.compile({metadata: {port: 70000}});
    results.push({case: "value schema refusal", error: null});
  } catch (error) {
    results.push({case: "value schema refusal", error: error.message});
  }
}

// --- rules that wait on asynchronous work -----------------------------------
function asyncStartsWith(value, prefix) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value.indexOf(prefix) === 0), 1);
  });
}

function asyncWords(value, count) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value.trim().split(/\s+/).length === count), 1);
  });
}

function registerAsyncKeywords(instance) {
  instance.addKeyword({
    keyword: "asyncStartsWith",
    type: "string",
    schemaType: "string",
    error: {
      message: ({keyword, schemaCode}) => str`${keyword} requires ${schemaCode}`,
      params: ({schemaCode}) => _`{prefix: ${schemaCode}}`,
    },
    code(cxt) {
      const {gen, data, schemaCode} = cxt;
      const check = gen.scopeValue("func", {ref: asyncStartsWith});
      gen.if(_`!${gen.const("ok", _`await ${check}(${data}, ${schemaCode})`)}`, () => cxt.error());
    },
  });

  instance.addKeyword({
    keyword: "asyncWords",
    type: "string",
    schemaType: "number",
    code(cxt) {
      const {gen, data, schemaCode} = cxt;
      const check = gen.scopeValue("func", {ref: asyncWords});
      gen.if(_`!${gen.const("ok", _`await ${check}(${data}, ${schemaCode})`)}`, () => cxt.error());
    },
  });

  instance.addKeyword({
    keyword: "trimmed",
    type: "string",
    schemaType: "boolean",
    code(cxt) {
      const {gen, data, schema} = cxt;
      gen.if(schema, () => {
        gen.assign(data, _`${data}.trim()`);
        gen.if(_`${cxt.it.parentData} !== undefined`, () => {
          gen.assign(_`${cxt.it.parentData}[${cxt.it.parentDataProperty}]`, data);
        });
      });
    },
  });
}

async function settle(instance, label, schema, documents) {
  let validate;
  try {
    validate = instance.compile(schema);
  } catch (error) {
    results.push({case: label, error: error.message});
    return;
  }
  for (const [name, document] of documents) {
    const value = document === undefined ? undefined : JSON.parse(JSON.stringify(document));
    try {
      const out = await validate(value);
      results.push({
        case: `${label} ${name}`,
        settled: "valid",
        out,
        document: value,
        errors: validate.errors,
        text: instance.errorsText(validate.errors),
      });
    } catch (error) {
      if (!(error instanceof Ajv.ValidationError)) throw error;
      results.push({
        case: `${label} ${name}`,
        settled: "invalid",
        errors: error.errors,
        document: value,
        text: instance.errorsText(error.errors),
      });
    }
  }
}

async function runAsyncCases() {
  for (const [mode, options] of [
    ["all errors", {allErrors: true}],
    ["first error", {}],
  ]) {
    // The JSON Type Definition meta-schema does not admit `$async`; ajv's own
    // asynchronous schemas are compiled with the check turned off.
    const instance = new Ajv({validateSchema: false, ...options});
    register(instance);
    registerAsyncKeywords(instance);

    await settle(
      instance,
      `${mode} async metadata`,
      {$async: true, properties: {name: {type: "string", metadata: {asyncStartsWith: "ab"}}}},
      [
        ["valid", {name: "abcd"}],
        ["fails", {name: "xbc"}],
        ["wrong type", {name: 5}],
      ],
    );

    await settle(
      instance,
      `${mode} async second rule`,
      {$async: true, metadata: {asyncWords: 2}, nullable: false},
      [
        ["valid", "two words"],
        ["fails", "one"],
      ],
    );

    await settle(
      instance,
      `${mode} async through definition`,
      {
        $async: true,
        definitions: {word: {type: "string", metadata: {asyncStartsWith: "ab"}}},
        ref: "word",
      },
      [
        ["valid", "abcd"],
        ["fails", "xbc"],
      ],
    );

    await settle(
      instance,
      `${mode} async rewritten`,
      {$async: true, properties: {value: {type: "string", metadata: {trimmed: true}}}},
      [
        ["valid", {value: "  padded  "}],
        ["missing", {}],
      ],
    );

    await settle(
      instance,
      `${mode} sync schema async rule`,
      {properties: {value: {type: "string", metadata: {asyncStartsWith: "ab"}}}},
      [["never", {value: "abc"}]],
    );
  }
}

runAsyncCases().then(() => {
  for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
}, (error) => {
  process.stderr.write(String(error && error.stack) + "\n");
  process.exit(1);
});
