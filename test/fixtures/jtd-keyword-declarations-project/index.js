"use strict";

// An unchanged ajv project on the JSON Type Definition entry point whose
// custom keyword definitions use every optional declaration ajv honours
// beyond a plain rule or macro: a rule prepared once for each schema
// location, a schema the keyword's value must satisfy, placement before
// another keyword and after every keyword, names the keyword stands in for,
// and companion keywords the parent schema must carry. Every verdict, every
// error report, and every compile-time refusal is printed as one JSON line,
// so running the project with ajv and with the replacement in its place must
// produce identical output. Registered keywords are used inside `metadata`,
// the schema location ajv's JSON Type Definition meta-schema admits them in,
// and — with `validateSchema: false`, as a project that extends the dialect
// does — beside the built-in keywords.

const Ajv = require("ajv/dist/jtd");

const results = [];
const prepared = {multiple: 0, values: []};

function attempt(label, run) {
  try {
    const value = run();
    results.push({case: label, error: null, value});
  } catch (error) {
    results.push({case: label, error: error.message});
  }
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

function register(instance) {
  // Prepared once for each schema location, from the keyword's value.
  instance.addKeyword({
    keyword: "multiple",
    compile(divisor) {
      prepared.multiple++;
      prepared.values.push(divisor);
      return (value) => typeof value !== "number" || value % divisor === 0;
    },
  });

  // The keyword's value must fit this schema or the schema is refused.
  instance.addKeyword({
    keyword: "port",
    metaSchema: {type: "uint16"},
    validate: () => true,
  });

  // Placement: `first` runs before `second`, `last` after every keyword.
  instance.addKeyword({
    keyword: "second",
    validate: (limit, value) => value >= limit,
  });
  instance.addKeyword({
    keyword: "first",
    before: "second",
    validate: (limit, value) => value >= limit,
  });
  instance.addKeyword({
    keyword: "last",
    post: true,
    validate: (limit, value) => value >= limit,
  });

  // Stands in for the two keyword names a project may use instead.
  instance.addKeyword({
    keyword: "bounded",
    implements: ["lowerBound", "upperBound"],
    validate: (bound, value) =>
      typeof value !== "number" || (value >= (bound === undefined ? 0 : bound) && value <= 100),
  });

  // The keyword is only legal when both companions are declared.
  instance.addKeyword({
    keyword: "owned",
    dependencies: ["tenant", "role"],
    validate: () => true,
  });
}

// --- a prepared rule, its report, and its preparation count -----------------
{
  const instance = new Ajv({strict: false, allErrors: true});
  register(instance);
  const schema = {
    type: "int32",
    metadata: {multiple: 3},
  };
  const validate = instance.compile(schema);
  for (const [name, document] of [
    ["valid", 9],
    ["rule fails", 10],
    ["wrong type", "9"],
    ["null", null],
  ]) {
    const valid = validate(document);
    results.push({
      case: `prepared rule ${name}`,
      valid,
      errors: validate.errors,
      text: instance.errorsText(validate.errors),
    });
  }
  results.push({case: "preparation count", count: prepared.multiple, values: prepared.values});
}

// A prepared rule can report its own entries, which ajv places at the
// keyword's location with the document's path.
{
  const instance = new Ajv({strict: false, allErrors: true});
  instance.addKeyword({
    keyword: "divisible",
    compile(divisor) {
      function validate(value) {
        if (typeof value !== "number" || value % divisor === 0) return true;
        validate.errors = [
          {
            keyword: "divisible",
            params: {divisor, remainder: value % divisor},
            message: `must be divisible by ${divisor}`,
          },
        ];
        return false;
      }
      validate.errors = null;
      return validate;
    },
  });
  report(
    instance,
    "prepared rule errors",
    {properties: {n: {type: "int32", metadata: {divisible: 3}}}},
    [
      ["valid", {n: 9}],
      ["fails", {n: 10}],
    ],
  );
}

// The same rule at two schema locations is prepared once for each of them.
{
  let calls = 0;
  const instance = new Ajv({strict: false});
  instance.addKeyword({
    keyword: "even",
    compile(enabled) {
      calls++;
      return (value) => typeof value !== "number" || !enabled || value % 2 === 0;
    },
  });
  const validate = instance.compile({
    properties: {
      a: {type: "int32", metadata: {even: true}},
      b: {type: "int32", metadata: {even: true}},
    },
  });
  results.push({case: "two locations count", count: calls});
  for (const [name, document] of [
    ["both even", {a: 2, b: 4}],
    ["second odd", {a: 2, b: 3}],
  ]) {
    const valid = validate(document);
    results.push({case: `two locations ${name}`, valid, errors: validate.errors});
  }
}

// --- a value schema ---------------------------------------------------------
{
  const instance = new Ajv({strict: false});
  register(instance);

  report(
    instance,
    "value schema accepted",
    {type: "int32", metadata: {port: 8080}},
    [
      ["valid", 8080],
      ["wrong type", "8080"],
    ],
  );

  for (const value of [0, 70000, -1, "8080", null, {type: "integer", minimum: 1}]) {
    attempt(`value schema ${JSON.stringify(value)}`, () =>
      instance.compile({type: "int32", metadata: {port: value}}),
    );
  }

  attempt("value schema nested", () =>
    instance.compile({properties: {p: {type: "int32", metadata: {port: 70000}}}}),
  );

  // A value schema written with another dialect's keywords is refused when
  // the definition is registered.
  attempt("value schema dialect", () =>
    instance.addKeyword({
      keyword: "count",
      metaSchema: {type: "integer", minimum: 1},
      validate: () => true,
    }),
  );
}

// A value schema is checked against the value as written: the options that
// rewrite a document do not apply to it.
{
  const instance = new Ajv({strict: false, removeAdditional: true});
  instance.addKeyword({
    keyword: "shape",
    metaSchema: {
      properties: {a: {type: "uint8"}},
      optionalProperties: {b: {type: "uint8"}},
      additionalProperties: false,
    },
    validate: () => true,
  });
  const value = {a: 1, c: 2};
  attempt("value schema additional", () => {
    instance.compile({type: "int32", metadata: {shape: value}});
    return value;
  });
  attempt("value schema without additional", () =>
    instance.compile({type: "int32", metadata: {shape: {a: 1, b: 2}}}),
  );
}

// --- placement --------------------------------------------------------------
for (const [mode, options] of [
  ["all errors", {allErrors: true}],
  ["first error", {}],
]) {
  const instance = new Ajv({strict: false, ...options});
  register(instance);
  report(
    instance,
    `${mode} metadata placement`,
    {type: "int32", metadata: {first: 10, second: 20, last: 30}},
    [
      ["all fail", 5],
      ["first passes", 15],
      ["first and second pass", 25],
      ["valid", 35],
    ],
  );

  const topLevel = new Ajv({strict: false, validateSchema: false, ...options});
  topLevel.addKeyword({
    keyword: "owner",
    before: "type",
    validate: (enabled, value) => !enabled || typeof value === "number",
  });
  topLevel.addKeyword({
    keyword: "approved",
    post: true,
    validate: (enabled, value) =>
      !enabled || (typeof value === "number" && value > 10),
  });
  report(topLevel, `${mode} builtin placement`, {type: "int32", owner: true, approved: true}, [
    ["owner and type fail", "x"],
    ["post fails", -5],
    ["valid", 20],
  ]);

  attempt(`${mode} typed post`, () =>
    topLevel.addKeyword({keyword: "typedPost", post: true, type: "number", validate: () => true}),
  );
}

// --- stand-in names ---------------------------------------------------------
{
  const instance = new Ajv({strict: false, allErrors: true});
  register(instance);

  report(instance, "stand-in declared name", {type: "int32", metadata: {bounded: 50}}, [
    ["valid", 50],
    ["fails", 150],
  ]);

  // A stand-in name alone is an annotation; beside another keyword it makes
  // the owner's rule run, with the owner's own value absent.
  report(
    instance,
    "stand-in name alone",
    {type: "int32", metadata: {lowerBound: 10, upperBound: 20}},
    [
      ["valid", 150],
    ],
  );
  report(
    instance,
    "stand-in name with another keyword",
    {type: "int32", metadata: {lowerBound: 10, multiple: 5}},
    [
      ["fails owner", 150],
      ["valid", 20],
    ],
  );

  const topLevel = new Ajv({strict: false, validateSchema: false});
  topLevel.addKeyword({
    keyword: "bounded",
    implements: ["lowerBound", "upperBound"],
    validate: (bound, value) =>
      typeof value !== "number" || (value >= (bound === undefined ? 0 : bound) && value <= 100),
  });
  report(topLevel, "stand-in beside builtin", {type: "int32", lowerBound: 10}, [
    ["fails", 150],
    ["valid", 50],
  ]);

  // The stand-in name belongs to the keyword that implements it.
  attempt("stand-in declared again", () =>
    instance.addKeyword({keyword: "lowerBound", validate: () => true}),
  );
}

// --- required companions ----------------------------------------------------
{
  const instance = new Ajv({strict: false});
  register(instance);

  report(instance, "companions present", {type: "int32", metadata: {owned: true, tenant: "t", role: "r"}}, [
    ["valid", 5],
    ["wrong type", "5"],
  ]);
  for (const metadata of [
    {owned: true},
    {owned: true, tenant: "t"},
    {owned: true, role: "r"},
  ]) {
    attempt(`companions ${JSON.stringify(metadata)}`, () =>
      instance.compile({type: "int32", metadata}),
    );
  }
}

// --- a project that registers no custom keyword -----------------------------
{
  const instance = new Ajv({strict: false});
  const validate = instance.compile({
    properties: {name: {type: "string"}},
    optionalProperties: {age: {type: "uint8"}},
  });
  for (const [name, document] of [
    ["valid", {name: "a", age: 7}],
    ["missing", {age: 7}],
    ["wrong type", {name: 1}],
    ["extra", {name: "a", other: true}],
  ]) {
    const valid = validate(document);
    results.push({
      case: `regression ${name}`,
      valid,
      errors: validate.errors,
      text: instance.errorsText(validate.errors),
    });
  }
}

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
