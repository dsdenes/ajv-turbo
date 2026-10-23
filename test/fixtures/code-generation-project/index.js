"use strict";

// An unchanged ajv project whose custom keywords are built from the
// code-generation helpers ajv publishes at `ajv/dist/compile/codegen`, plus a
// direct exercise of the generator itself. Every observation is printed as one
// JSON line, so running the project with ajv and then with the replacement in
// ajv's place must produce identical output.

const Ajv = require("ajv");
const {
  CodeGen,
  Name,
  ValueScope,
  _,
  and,
  getProperty,
  nil,
  not,
  operators,
  or,
  str,
  strConcat,
  stringify,
} = require("ajv/dist/compile/codegen");

const results = [];

// The generator and its scope, used directly instead of through a keyword.
const scope = new ValueScope({scope: {}, prefixes: new Set(["v"])});
const scopeName = scope.value("v", {ref: 41});
const gen = new CodeGen(scope);
const sum = gen.const("sum", _`${2} + ${3}`);
gen.if(_`${sum} === 5`, () => gen.return(_`${"five"}`));
gen.return(_`${"other"}`);
const generated = String(gen);

results.push({
  case: "generated source",
  source: generated,
  value: new Function(generated)(),
  scopeName: String(scopeName),
});

results.push({
  case: "helper expressions",
  str: String(str`a${new Name("b")}c`),
  stringify: String(stringify({a: 1})),
  property: String(getProperty("length")),
  bracket: String(getProperty("a-b")),
  and: String(and(_`x`, _`y`)),
  or: String(or(_`x`, _`y`)),
  not: String(not(_`x`)),
  strConcat: String(strConcat(new Name("a"), new Name("b"))),
  nil: String(nil),
  comparison: String(operators.GTE),
  sameGenerator: Ajv.CodeGen === CodeGen,
  sameUnderscore: Ajv._ === _,
  sameName: Ajv.Name === Name,
});

function registerKeywords(instance) {
  // A string rule whose condition is assembled from the published helpers.
  instance.addKeyword({
    keyword: "startsWithCodegen",
    type: "string",
    schemaType: "string",
    code(cxt) {
      const {data, schemaCode} = cxt;
      const atStart = _`${data}.indexOf(${schemaCode}) ${operators.EQ} 0`;
      cxt.fail(not(atStart));
    },
  });

  // A numeric range assembled from and/or/not.
  instance.addKeyword({
    keyword: "between",
    type: "number",
    schemaType: "array",
    code(cxt) {
      const {data, schema} = cxt;
      const inside = and(_`${data} >= ${schema[0]}`, _`${data} <= ${schema[1]}`);
      cxt.fail(not(inside));
    },
  });

  // A property read through getProperty, with its own message built by `str`.
  instance.addKeyword({
    keyword: "shortEnough",
    type: "string",
    schemaType: "number",
    error: {
      message: ({keyword, schemaCode}) => str`${keyword} allows at most ${schemaCode}`,
      params: ({schemaCode}) => _`{limit: ${schemaCode}}`,
    },
    code(cxt) {
      cxt.fail(_`${cxt.data}${getProperty("length")} > ${cxt.schemaCode}`);
    },
  });

  // A rule that reports each character outside the allowed set.
  instance.addKeyword({
    keyword: "onlyCharsCodegen",
    type: "string",
    schemaType: "string",
    error: {
      message: ({params}) => str`${params.bad} is not allowed`,
      params: ({params}) => _`{bad: ${params.bad}}`,
    },
    code(cxt) {
      const {gen, data, schemaCode} = cxt;
      gen.forOf("ch", data, (ch) => {
        gen.if(_`${schemaCode}.indexOf(${ch}) ${operators.LT} 0`, () => {
          cxt.setParams({bad: ch});
          cxt.error();
          if (!cxt.allErrors) gen.break();
        });
      });
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
  const instance = new Ajv({strict: false, ...options});
  registerKeywords(instance);

  report(instance, `${mode} string rule`, {
    type: "object",
    properties: {value: {type: "string", startsWithCodegen: "ab"}},
  }, [
    ["valid", {value: "abc"}],
    ["fails", {value: "xbc"}],
    ["other type", {value: 5}],
  ]);

  report(instance, `${mode} range`, {
    type: "object",
    properties: {value: {type: "number", between: [2, 4]}},
  }, [
    ["valid", {value: 3}],
    ["low", {value: 1}],
    ["high", {value: 5}],
    ["other type", {value: "3"}],
  ]);

  report(instance, `${mode} property rule`, {
    type: "object",
    properties: {value: {type: "string", shortEnough: 3}},
  }, [
    ["valid", {value: "abc"}],
    ["fails", {value: "abcd"}],
  ]);

  report(instance, `${mode} generated loop`, {
    type: "object",
    properties: {value: {type: "string", onlyCharsCodegen: "abc"}},
  }, [
    ["valid", {value: "abca"}],
    ["several fail", {value: "abxy"}],
    ["one fails", {value: "aZc"}],
  ]);
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
