"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const AjvReference = require("ajv-reference/dist/jtd");
const AjvReplacement = require("../dist/jtd");
const standaloneReference = require("ajv-reference/dist/standalone");
const standaloneReplacement = require("../dist/standalone");
const {ROOT, runWithBothValidators} = require("./lib/project");

const WORK = path.join(ROOT, ".tmp", "jtd-standalone");
const PROJECT = path.join(__dirname, "fixtures", "jtd-standalone-project");
const WORK_PROJECT = path.join(ROOT, ".tmp", "jtd-standalone-project");

function clone(value) {
  return value === undefined ? value : structuredClone(value);
}

// Generated modules load from their own directory so a module a package
// generated resolves that package's runtime helpers, not this checkout.
function prepareSides() {
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
  fs.symlinkSync(
    path.dirname(require.resolve("ajv-reference/package.json")),
    path.join(WORK, "reference", "node_modules", "ajv"),
    "dir",
  );
  fs.symlinkSync(ROOT, path.join(WORK, "replacement", "node_modules", "ajv"), "dir");
  return sides;
}

function load(side, code) {
  const file = path.join(side.dir, "validate" + side.counter++ + ".js");
  fs.writeFileSync(file, code);
  try {
    return {module: require(file), file};
  } catch (error) {
    delete require.cache[file];
    throw error;
  }
}

function unload(loaded) {
  delete require.cache[loaded.file];
}

// Every JSON Type Definition form ajv's dialect knows, plus schemas that
// combine forms and reach definitions through `ref`.
const CASES = [
  {name: "empty", schema: {}},
  {name: "metadata only", schema: {metadata: {}}},
  {name: "type string", schema: {type: "string"}},
  {name: "type boolean", schema: {type: "boolean"}},
  {name: "type timestamp", schema: {type: "timestamp"}},
  {name: "type float32", schema: {type: "float32"}},
  {name: "type float64", schema: {type: "float64"}},
  {name: "type int8", schema: {type: "int8"}},
  {name: "type uint8", schema: {type: "uint8"}},
  {name: "type int16", schema: {type: "int16"}},
  {name: "type uint16", schema: {type: "uint16"}},
  {name: "type int32", schema: {type: "int32"}},
  {name: "type uint32", schema: {type: "uint32"}},
  {name: "enumeration", schema: {enum: ["a", "b"]}},
  {name: "enumeration nullable", schema: {enum: ["a"], nullable: true}},
  {name: "nullable type", schema: {type: "string", nullable: true}},
  {name: "elements", schema: {elements: {type: "string"}}},
  {name: "elements nullable", schema: {elements: {type: "string"}, nullable: true}},
  {name: "elements of empty schemas", schema: {elements: {}}},
  {name: "nested elements", schema: {elements: {elements: {type: "int8"}}}},
  {name: "properties", schema: {properties: {x: {type: "string"}}}},
  {
    name: "properties with optional members",
    schema: {properties: {x: {type: "string"}}, optionalProperties: {y: {type: "int8"}}},
  },
  {name: "optional properties", schema: {optionalProperties: {y: {type: "int8"}}}},
  {
    name: "additional properties allowed",
    schema: {properties: {x: {type: "string"}}, additionalProperties: true},
  },
  {
    name: "additional properties refused",
    schema: {properties: {x: {type: "string"}}, additionalProperties: false},
  },
  {name: "properties with always-valid member", schema: {properties: {x: {}}}},
  {name: "properties nullable", schema: {properties: {x: {type: "string"}}, nullable: true}},
  {
    name: "nested properties",
    schema: {properties: {x: {properties: {y: {type: "string"}}}}},
  },
  {name: "values", schema: {values: {type: "string"}}},
  {name: "values of empty schemas", schema: {values: {}}},
  {name: "values nullable", schema: {values: {type: "string"}, nullable: true}},
  {name: "ref", schema: {definitions: {s: {type: "string"}}, ref: "s"}},
  {name: "ref nullable", schema: {definitions: {s: {type: "string"}}, ref: "s", nullable: true}},
  {
    name: "ref to nullable definition",
    schema: {definitions: {s: {type: "string", nullable: true}}, ref: "s"},
  },
  {name: "definitions only", schema: {definitions: {s: {type: "string"}}}},
  {
    name: "recursive ref",
    schema: {
      definitions: {
        node: {
          properties: {id: {type: "string"}},
          optionalProperties: {children: {elements: {ref: "node"}}},
        },
      },
      ref: "node",
    },
  },
  {
    name: "recursive ref through properties",
    schema: {
      definitions: {
        node: {
          properties: {id: {type: "string"}},
          optionalProperties: {next: {ref: "node"}},
        },
      },
      properties: {root: {ref: "node"}},
    },
  },
  {name: "ref chain", schema: {definitions: {a: {ref: "b"}, b: {type: "string"}}, ref: "a"}},
  {
    name: "discriminator",
    schema: {
      discriminator: "t",
      mapping: {
        a: {properties: {x: {type: "string"}}},
        b: {properties: {y: {type: "int8"}}},
      },
    },
  },
  {
    name: "discriminator with optional members",
    schema: {discriminator: "t", mapping: {a: {optionalProperties: {x: {type: "string"}}}}},
  },
  {
    name: "discriminator allowing additional properties",
    schema: {
      discriminator: "t",
      mapping: {a: {properties: {x: {type: "string"}}, additionalProperties: true}},
    },
  },
  {
    name: "discriminator nullable",
    schema: {
      discriminator: "t",
      mapping: {a: {properties: {x: {type: "string"}}}},
      nullable: true,
    },
  },
  {name: "empty discriminator mapping", schema: {discriminator: "t", mapping: {}}},
  {name: "metadata union", schema: {metadata: {union: [{type: "string"}, {type: "int8"}]}}},
  {
    name: "metadata union of forms",
    schema: {metadata: {union: [{properties: {a: {type: "string"}}}, {values: {type: "int8"}}]}},
  },
  {
    name: "metadata with an empty union member",
    schema: {metadata: {union: [{}, {type: "string"}]}},
  },
  {name: "metadata empty", schema: {metadata: {}, type: "string"}},
  {
    name: "metadata in a subschema",
    schema: {properties: {x: {metadata: {union: [{type: "string"}]}}}},
  },
  {
    name: "metadata union nullable",
    schema: {metadata: {union: [{type: "string"}]}, nullable: true},
  },
  {
    name: "metadata union over a ref",
    schema: {definitions: {s: {type: "string"}}, metadata: {union: [{ref: "s"}, {type: "int8"}]}},
  },
  {
    name: "combined forms",
    schema: {
      definitions: {
        stamp: {
          properties: {at: {type: "timestamp"}},
          optionalProperties: {zone: {enum: ["utc", "local"]}},
        },
      },
      properties: {name: {type: "string"}, stamps: {elements: {ref: "stamp"}}},
      optionalProperties: {
        labels: {values: {type: "string"}},
        note: {type: "string", nullable: true},
      },
    },
  },
  {
    name: "discriminator over a recursive definition",
    schema: {
      definitions: {
        tree: {
          discriminator: "kind",
          mapping: {
            leaf: {properties: {value: {type: "int8"}}},
            branch: {properties: {left: {ref: "tree"}, right: {ref: "tree"}}},
          },
        },
      },
      ref: "tree",
    },
  },
];

const DOCUMENTS = [
  undefined,
  null,
  true,
  false,
  0,
  1,
  -1,
  1.5,
  127,
  128,
  -128,
  -129,
  255,
  256,
  65535,
  65536,
  2147483647,
  3000000000,
  "",
  "a",
  "b",
  "abc",
  "2020-01-01T00:00:00Z",
  "2020-01-01",
  "nope",
  new Date("2020-01-01T00:00:00Z"),
  [],
  [1],
  ["a"],
  [1, "a"],
  [null],
  [[1]],
  [{}],
  {},
  {x: 1},
  {x: "a"},
  {y: 1},
  {x: "a", y: 1},
  {x: 1, y: "a"},
  {x: "a", z: 1},
  {t: "a"},
  {t: "a", x: "s"},
  {t: "b", y: 1},
  {t: "c"},
  {t: 5},
  {a: 1, b: 2},
  {k1: {a: "s"}, k2: {a: 1}},
  {kind: "leaf", value: 1},
  {kind: "branch", left: {kind: "leaf", value: 1}, right: {kind: "leaf", value: "x"}},
  {name: "a", stamps: [{at: "2020-01-01T00:00:00Z"}], labels: {k: "v"}},
  {name: 1, stamps: [{at: "nope", zone: "nowhere"}], labels: {k: 1}, note: 2},
  {root: {id: "a", next: {id: 1}}},
];

function buildPair(options) {
  return {
    reference: new AjvReference({code: {source: true}, ...options}),
    replacement: new AjvReplacement({code: {source: true}, ...options}),
  };
}

function firstDifference(actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    return null;
  } catch (error) {
    return error.message;
  }
}

// Generates a standalone validator from each package for every case, loads
// both modules, and requires the same verdict, the same report in the same
// order, the same summary text, and the same rewritten document for every
// document.
function compareGenerated(options, label) {
  const sides = prepareSides();
  const {reference, replacement} = buildPair(options);
  let compared = 0;
  let generated = 0;
  const failures = [];
  const mismatches = [];

  for (const testCase of CASES) {
    let referenceValidate;
    let replacementValidate;
    try {
      referenceValidate = reference.compile(clone(testCase.schema));
    } catch {
      continue;
    }
    try {
      replacementValidate = replacement.compile(clone(testCase.schema));
    } catch (error) {
      failures.push(`${testCase.name}: compile: ${error.message}`);
      continue;
    }

    let referenceLoaded;
    let replacementLoaded;
    try {
      const referenceCode = standaloneReference(reference, referenceValidate);
      const replacementCode = standaloneReplacement(replacement, replacementValidate);
      assert.ok(
        !/\brequire\(\s*["'](?!\.)/.test(replacementCode),
        `${label}: generated module must not require an installed package`,
      );
      referenceLoaded = load(sides.reference, referenceCode);
      replacementLoaded = load(sides.replacement, replacementCode);
    } catch (error) {
      failures.push(`${testCase.name}: generate: ${error.message}`);
      continue;
    }
    generated++;

    for (const document of DOCUMENTS) {
      compared++;
      const referenceData = clone(document);
      const replacementData = clone(document);
      const referenceValid = referenceLoaded.module(referenceData);
      const replacementValid = replacementLoaded.module(replacementData);
      const diff =
        firstDifference(replacementValid, referenceValid) ||
        firstDifference(replacementLoaded.module.errors, referenceLoaded.module.errors) ||
        firstDifference(replacementData, referenceData) ||
        firstDifference(
          replacement.errorsText(replacementLoaded.module.errors),
          reference.errorsText(referenceLoaded.module.errors),
        );
      if (diff !== null && mismatches.length < 5) {
        mismatches.push({
          label,
          schema: testCase.name,
          document,
          reference: {valid: referenceValid, errors: referenceLoaded.module.errors},
          replacement: {valid: replacementValid, errors: replacementLoaded.module.errors},
          diff,
        });
      }
    }
    unload(referenceLoaded);
    unload(replacementLoaded);
  }

  assert.deepStrictEqual(failures, [], `${label}: generation failed`);
  assert.deepStrictEqual(mismatches, [], `${label}: generated validators disagree`);
  assert.strictEqual(generated, CASES.length, `${label}: expected every case to generate`);
  assert.ok(compared > 2500, `${label}: expected many documents, compared ${compared}`);
  return {generated, compared};
}

test("generated JSON Type Definition validators report the same first error as ajv's", () => {
  compareGenerated({}, "default reporting");
});

test("generated JSON Type Definition validators report the same complete report as ajv's", () => {
  compareGenerated({allErrors: true}, "complete reporting");
});

test("generated JSON Type Definition validators report the same verbose context as ajv's", () => {
  compareGenerated({verbose: true, allErrors: true}, "verbose reporting");
  compareGenerated({verbose: true}, "verbose first-error reporting");
});

test("generated JSON Type Definition validators suppress messages like ajv's", () => {
  compareGenerated({messages: false}, "message-free first-error reporting");
  compareGenerated(
    {verbose: true, messages: false, allErrors: true},
    "verbose message-free reporting",
  );
});

test("generated JSON Type Definition validators rewrite documents like ajv's", () => {
  compareGenerated({removeAdditional: true, allErrors: true}, "additional properties removed");
  compareGenerated({removeAdditional: true}, "additional properties removed, first error");
});

test("generated JSON Type Definition validators honour the dialect options", () => {
  compareGenerated({ownProperties: true, allErrors: true}, "own properties");
  compareGenerated({int32range: false, allErrors: true}, "unbounded 32-bit integers");
  compareGenerated({allowDate: true, allErrors: true}, "date-only timestamps");
  compareGenerated({timestamp: "date", allErrors: true}, "Date timestamps");
  compareGenerated({timestamp: "string", allErrors: true}, "string timestamps");
  compareGenerated({inlineRefs: false, allErrors: true}, "references not inlined");
  compareGenerated({jsPropertySyntax: true, allErrors: true}, "property-syntax reporting");
  compareGenerated({jsPropertySyntax: true}, "property-syntax first-error reporting");
});

test("generated JSON Type Definition modules export by id, by name map, and every schema", () => {
  const sides = prepareSides();
  const ajv = new AjvReplacement({code: {source: true}, allErrors: true});
  ajv.addSchema({properties: {name: {type: "string"}}}, "record");
  ajv.addSchema({definitions: {s: {type: "int8"}}, ref: "s"}, "number");
  ajv.addSchema({elements: {type: "string"}}, "list");

  const map = load(sides.replacement, standaloneReplacement(ajv, {record: "record", n: "number"}));
  assert.strictEqual(map.module.record({name: "ok"}), true);
  assert.strictEqual(map.module.record({}), false);
  assert.deepStrictEqual(map.module.record.errors, [
    {
      instancePath: "",
      schemaPath: "/properties/name",
      keyword: "properties",
      params: {error: "missing", missingProperty: "name"},
      message: "must have property 'name'",
    },
  ]);
  assert.strictEqual(map.module.n(127), true);
  assert.strictEqual(map.module.n(128), false);
  assert.strictEqual(map.module.n.errors[0].keyword, "type");
  unload(map);

  const everything = load(sides.replacement, standaloneReplacement(ajv));
  assert.deepStrictEqual(
    Object.keys(everything.module).sort(),
    ["list", "number", "record"],
    "the meta-schema is not exported",
  );
  assert.strictEqual(everything.module.record({name: "ok"}), true);
  assert.strictEqual(everything.module.list(["a", "b"]), true);
  assert.strictEqual(everything.module.number(1.5), false);
  unload(everything);
});

test("a generated JSON Type Definition module runs without a validator package", () => {
  const ajv = new AjvReplacement({code: {source: true}, allErrors: true, verbose: true});
  const schema = {
    definitions: {
      stamp: {properties: {at: {type: "timestamp"}}},
    },
    properties: {
      name: {type: "string"},
      count: {type: "uint16"},
      stamp: {ref: "stamp"},
    },
    optionalProperties: {note: {type: "string", nullable: true}},
  };
  const code = standaloneReplacement(ajv, ajv.compile(schema));
  assert.ok(
    !/\brequire\(\s*["'](?!\.)/.test(code),
    "generated module must not require an installed package",
  );
  assert.ok(!/\bimport\s/.test(code), "generated module must not import a package");

  const dir = path.join(WORK, "isolated");
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, "validate.js"), code);
  fs.writeFileSync(
    path.join(dir, "run.js"),
    [
      '"use strict";',
      'try { require("ajv"); process.exit(3); } catch {}',
      'const validate = require("./validate.js");',
      "const data = {name: \"alpha\", count: 70000, stamp: {at: \"nope\"}};",
      "process.stdout.write(JSON.stringify({valid: validate(data), errors: validate.errors}));",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(dir, "block.js"),
    [
      '"use strict";',
      'const Module = require("node:module");',
      "const original = Module._resolveFilename;",
      "Module._resolveFilename = function (request, parent, isMain, options) {",
      '  if (/^ajv($|\\/)/.test(request) || /^ajv-reference($|\\/)/.test(request)) {',
      '    throw new Error("Cannot find module \'" + request + "\'");',
      "  }",
      "  const resolved = original.call(this, request, parent, isMain, options);",
      '  if (/[\\\\/]node_modules[\\\\/]ajv([\\\\/]|$)/.test(resolved)) {',
      '    throw new Error("Cannot find module \'" + request + "\'");',
      "  }",
      "  return resolved;",
      "};",
      "",
    ].join("\n"),
  );

  const result = spawnSync(
    process.execPath,
    ["-r", path.join(dir, "block.js"), path.join(dir, "run.js")],
    {cwd: dir, encoding: "utf8"},
  );
  assert.strictEqual(result.status, 0, result.stderr);
  const outcome = JSON.parse(result.stdout);
  assert.strictEqual(outcome.valid, false);
  assert.deepStrictEqual(
    outcome.errors.map((error) => [error.instancePath, error.keyword]),
    [
      ["/count", "type"],
      ["/stamp/at", "type"],
    ],
  );
});

test("an unchanged project generates and loads standalone JSON Type Definition validators", () => {
  const {reference, replacement} = runWithBothValidators(
    PROJECT,
    WORK_PROJECT,
    {},
    ["generated"],
  );
  assert.ok(reference.length > 20, "expected every validator and document to be reported");
  assert.deepStrictEqual(replacement, reference);
});
