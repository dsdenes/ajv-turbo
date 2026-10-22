"use strict";

// An unchanged ajv project whose custom keywords are defined with the
// generated-validation-code form ajv documents: each definition supplies a
// `code` function that builds its rule through the KeywordCxt and the `_`
// helpers. Every verdict and every error report is printed as one JSON line,
// so running the project with ajv and with the replacement in its place must
// produce identical output. DIALECT selects the entry point the same way a
// project on that dialect would: "draft7" (the default), "2019", or "2020".

const dialect = process.env.DIALECT || "draft7";

const Ajv =
  dialect === "2019"
    ? require("ajv/dist/2019")
    : dialect === "2020"
      ? require("ajv/dist/2020")
      : require("ajv");

const {_, nil, str} = Ajv;

const results = [];

function registerKeywords(instance) {
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

  // A number rule, declared for numbers only.
  instance.addKeyword({
    keyword: "even",
    type: "number",
    schemaType: "boolean",
    code(cxt) {
      const {data, schema} = cxt;
      const op = schema ? _`!==` : _`===`;
      cxt.fail(_`${data} % 2 ${op} 0`);
    },
  });

  // A keyword whose definition supplies its own message and params.
  instance.addKeyword({
    keyword: "atMost",
    type: "string",
    schemaType: "number",
    error: {
      message: ({keyword, schemaCode}) => str`${keyword} allows at most ${schemaCode}`,
      params: ({schemaCode}) => _`{limit: ${schemaCode}}`,
    },
    code(cxt) {
      const {data, schemaCode} = cxt;
      cxt.fail(_`${data}.length > ${schemaCode}`);
    },
  });

  // A rule built with the generator: it walks the document and reports each
  // character outside the allowed set, stopping at the first one in default
  // reporting mode.
  instance.addKeyword({
    keyword: "onlyChars",
    type: "string",
    schemaType: "string",
    error: {
      message: ({params}) => str`${params.bad} is not allowed`,
      params: ({params}) => _`{bad: ${params.bad}}`,
    },
    code(cxt) {
      const {gen, data, schemaCode} = cxt;
      gen.forOf("ch", data, (ch) => {
        gen.if(_`${schemaCode}.indexOf(${ch}) < 0`, () => {
          cxt.setParams({bad: ch});
          cxt.error();
          if (!cxt.allErrors) gen.break();
        });
      });
    },
  });

  // A rule using pass and the parent schema.
  instance.addKeyword({
    keyword: "range",
    type: "number",
    schemaType: "array",
    metaSchema: {
      type: "array",
      items: {type: "number"},
      minItems: 2,
      maxItems: 2,
    },
    code(cxt) {
      const {schema, parentSchema, data} = cxt;
      const [min, max] = schema;
      const eq = parentSchema.exclusiveRange ? _`=` : nil;
      cxt.fail(_`${data} <${eq} ${min} || ${data} >${eq} ${max}`);
    },
  });

  // A value schema and a declared schema type the definition enforces.
  instance.addKeyword({
    keyword: "port",
    type: "number",
    schemaType: "number",
    metaSchema: {type: "integer", minimum: 1, maximum: 65535},
    code(cxt) {
      cxt.fail(_`${cxt.data} < ${cxt.schemaCode}`);
    },
  });

  // A keyword whose declared schema type is the only restriction on its value.
  instance.addKeyword({
    keyword: "typedValue",
    type: "number",
    schemaType: "number",
    code(cxt) {
      cxt.fail(_`${cxt.data} < ${cxt.schemaCode}`);
    },
  });

  // A document-sourced value, checked where the generated code asks for it.
  instance.addKeyword({
    keyword: "maxChars",
    type: "string",
    schemaType: "number",
    $data: true,
    code(cxt) {
      const {data, schemaCode} = cxt;
      cxt.fail$data(_`${data}.length > ${schemaCode}`);
    },
  });
}

function report(instance, label, schema, documents) {
  const validate = instance.compile(schema);
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

for (const [mode, options] of [
  ["all errors", {allErrors: true}],
  ["first error", {}],
  ["verbose", {allErrors: true, verbose: true}],
  ["message-free", {allErrors: true, messages: false}],
]) {
  const instance = new Ajv({strict: false, $data: true, ...options});
  registerKeywords(instance);

  report(instance, `${mode} string rule`, {
    type: "object",
    properties: {value: {type: "string", startsWith: "ab"}},
  }, [
    ["valid", {value: "abc"}],
    ["fails", {value: "xbc"}],
    ["other type", {value: 5}],
  ]);

  report(instance, `${mode} number rule`, {
    type: "object",
    properties: {value: {type: "number", even: true}},
  }, [
    ["valid", {value: 4}],
    ["fails", {value: 3}],
    ["other type", {value: "3"}],
  ]);

  report(instance, `${mode} custom report`, {
    type: "object",
    properties: {value: {type: "string", atMost: 3}},
  }, [
    ["valid", {value: "abc"}],
    ["fails", {value: "abcd"}],
  ]);

  report(instance, `${mode} generated loop`, {
    type: "object",
    properties: {value: {type: "string", onlyChars: "abc"}},
  }, [
    ["valid", {value: "abca"}],
    ["several fail", {value: "abxy"}],
    ["one fails", {value: "aZc"}],
  ]);

  report(instance, `${mode} range`, {
    type: "object",
    properties: {value: {type: "number", range: [2, 4], exclusiveRange: true}},
  }, [
    ["valid", {value: 3}],
    ["low", {value: 2}],
    ["high", {value: 5}],
    ["other type", {value: "3"}],
  ]);

  report(instance, `${mode} document value`, {
    type: "object",
    properties: {
      limit: {type: "number"},
      value: {type: "string", maxChars: {$data: "/limit"}},
    },
  }, [
    ["valid", {limit: 3, value: "abc"}],
    ["fails", {limit: 3, value: "abcd"}],
    ["absent", {value: "abcd"}],
    ["wrong type", {limit: "x", value: "abcd"}],
  ]);

  for (const [label, value] of [
    ["port accepted", 8080],
    ["port too large", 70000],
    ["port wrong type", "8080"],
  ]) {
    try {
      instance.compile({type: "object", properties: {p: {type: "number", port: value}}});
      results.push({case: `${mode} ${label}`, error: null});
    } catch (error) {
      results.push({case: `${mode} ${label}`, error: error.message});
    }
  }

  for (const [label, value] of [
    ["typed value accepted", 2],
    ["typed value wrong type", "2"],
  ]) {
    try {
      instance.compile({type: "number", typedValue: value});
      results.push({case: `${mode} ${label}`, error: null});
    } catch (error) {
      results.push({case: `${mode} ${label}`, error: error.message});
    }
  }

  for (const [label, value] of [
    ["range accepted", [2, 4]],
    ["range too short", [2]],
    ["range wrong shape", [2, 4, 6]],
  ]) {
    try {
      instance.compile({type: "number", range: value});
      results.push({case: `${mode} ${label}`, error: null});
    } catch (error) {
      results.push({case: `${mode} ${label}`, error: error.message});
    }
  }
}

// A validator that logs an inadmissible keyword value instead of throwing.
const logging = new Ajv({strict: false, validateSchema: "log"});
logging.addKeyword({
  keyword: "port",
  type: "number",
  schemaType: "number",
  metaSchema: {type: "integer", minimum: 1, maximum: 65535},
  code(cxt) {
    cxt.fail(_`${cxt.data} < ${cxt.schemaCode}`);
  },
});
try {
  const validate = logging.compile({type: "number", port: 70000});
  results.push({case: "logged value compiled", error: null, valid: validate(80000)});
} catch (error) {
  results.push({case: "logged value compiled", error: error.message});
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
