"use strict";

// An existing service that validates with ajv and loads ajv's official
// keyword-extension plugin. It never names the validator implementation: the
// same script runs against ajv and against the replacement installed in ajv's
// place, and every printed line must match.

const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");
const addKeywords = require("ajv-keywords");
const addFormats = require("ajv-formats");

const results = [];
const record = (line) => results.push(line);

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function report(label, ajv, validate, data) {
  const document = clone(data);
  let valid;
  let thrown;
  try {
    valid = validate(document);
  } catch (error) {
    thrown = error.message;
  }
  const line = {
    label,
    valid,
    errors: validate.errors,
    text: ajv.errorsText(validate.errors),
    document,
  };
  if (thrown !== undefined) line.thrown = thrown;
  record(line);
}

function compile(label, ajv, schema) {
  try {
    const validate = ajv.compile(clone(schema));
    record({label, compiled: true, schema: validate.schema});
    return validate;
  } catch (error) {
    record({label, compiled: false, message: error.message});
    return undefined;
  }
}

const DIALECTS = [
  ["draft-07", Ajv, false],
  ["2019-09", Ajv2019, true],
  ["2020-12", Ajv2020, true],
];

const CASES = [
  {
    name: "typeof",
    schema: {type: "object", properties: {v: {typeof: ["string", "number"]}}},
    docs: [{v: "x"}, {v: 1}, {v: true}, {}],
  },
  {
    name: "typeof-string",
    schema: {typeof: "string"},
    docs: ["x", 1, null],
  },
  {
    name: "instanceof",
    schema: {type: "object", properties: {v: {instanceof: ["Array", "Date"]}}},
    docs: [{v: []}, {v: {}}, {v: "x"}, {}],
  },
  {
    name: "range",
    schema: {type: "number", range: [2, 4]},
    docs: [1, 2, 3, 4, 5, "x"],
  },
  {
    name: "range-nested",
    schema: {type: "object", properties: {a: {type: "number", range: [1, 3]}}},
    docs: [{a: 2}, {a: 0}],
  },
  {
    name: "exclusiveRange",
    schema: {type: "number", exclusiveRange: [2, 4]},
    docs: [1, 2, 3, 4, 5],
  },
  {
    name: "regexp",
    schema: {
      type: "object",
      properties: {a: {regexp: "/^a+$/i"}, b: {regexp: {pattern: "^b", flags: "i"}}},
    },
    docs: [{a: "AAA", b: "Bee"}, {a: "zzz", b: "ant"}, {}],
  },
  {
    name: "transform",
    schema: {
      type: "object",
      properties: {
        a: {type: "string", transform: ["trim", "toLowerCase"], enum: ["abc"]},
        b: {type: "string", transform: ["trimStart", "toUpperCase"], enum: ["ABC"]},
        c: {type: "string", transform: ["trimEnd"], enum: ["x"]},
        d: {type: "string", transform: ["trim"]},
      },
    },
    docs: [{a: " AbC ", b: "abc", c: "x  ", d: " y "}, {a: " abd ", b: "abc"}, {}],
  },
  {
    name: "transform-nested",
    schema: {
      type: "object",
      properties: {
        outer: {
          type: "object",
          properties: {
            list: {type: "array", items: {type: "string", transform: ["trim"], const: "a"}},
            extra: {
              type: "object",
              additionalProperties: {type: "string", transform: ["trim"], enum: ["a"]},
            },
            pattern: {
              type: "object",
              patternProperties: {"^p": {type: "string", transform: ["trim"], enum: ["a"]}},
            },
          },
        },
      },
    },
    docs: [{outer: {list: [" a ", "a"], extra: {k: " a "}, pattern: {p1: " a "}}}],
  },
  {
    name: "transform-ref",
    schema: {
      type: "object",
      properties: {s: {$ref: "#/definitions/trimmed"}},
      definitions: {trimmed: {type: "string", transform: ["trim"], enum: ["a"]}},
    },
    docs: [{s: " a "}],
  },
  {
    name: "transform-enum-case",
    schema: {
      type: "object",
      properties: {
        s: {type: "string", transform: ["toEnumCase"], enum: ["one", "two"]},
      },
    },
    docs: [{s: "ONE"}, {s: "Two"}, {s: "three"}],
  },
  {
    name: "uniqueItemProperties",
    schema: {type: "array", uniqueItemProperties: ["id", "meta"]},
    docs: [
      [{id: 1, meta: {a: 1}}, {id: 2, meta: {a: 1}}],
      [{id: 1, meta: {a: 1}}, {id: 1, meta: {a: 2}}],
      [{id: 1, meta: {a: 1}}, {id: 2, meta: {a: 1}}],
      [],
    ],
  },
  {
    name: "allRequired",
    schema: {type: "object", properties: {a: {}, b: {}}, allRequired: true},
    docs: [{a: 1, b: 2}, {a: 1}, {}],
  },
  {
    name: "allRequired-off",
    schema: {type: "object", properties: {a: {}}, allRequired: false},
    docs: [{}],
  },
  {
    name: "anyRequired",
    schema: {type: "object", anyRequired: ["a", "b"]},
    docs: [{a: 1}, {b: 1}, {a: 1, b: 2}, {c: 1}, {}],
  },
  {
    name: "oneRequired",
    schema: {type: "object", oneRequired: ["a", "b"]},
    docs: [{a: 1}, {b: 1}, {a: 1, b: 2}, {}],
  },
  {
    name: "patternRequired",
    schema: {type: "object", patternRequired: ["^x", "y$"]},
    docs: [{x: 1, ay: 2}, {x: 1}, {q: 1}, {}],
  },
  {
    name: "prohibited",
    schema: {type: "object", prohibited: ["a", "b"]},
    docs: [{c: 1}, {a: 1}, {b: 1}, {a: 1, b: 2}],
  },
  {
    name: "deepProperties",
    schema: {
      type: "object",
      deepProperties: {
        "/a/b": {type: "string"},
        "/list/0/id": {type: "number"},
        "/x~1y/~0z": {type: "boolean"},
      },
    },
    docs: [
      {a: {b: "s"}, list: [{id: 1}], "x/y": {"~z": true}},
      {a: {b: 2}, list: [{id: "x"}], "x/y": {"~z": "no"}},
      {a: {}},
    ],
  },
  {
    name: "deepRequired",
    schema: {type: "object", deepRequired: ["/a/b", "/list/0", "/x~1y"]},
    docs: [{a: {b: 1}, list: [1], "x/y": 2}, {a: {}}, {a: {b: 1}, list: [], "x/y": 2}],
  },
  {
    name: "select",
    schema: {
      type: "object",
      select: "a",
      selectCases: {
        a: {properties: {a: {type: "number"}}, required: ["a"]},
        b: {properties: {b: {type: "number"}}},
      },
      selectDefault: {properties: {d: {type: "number"}}, required: ["d"]},
    },
    docs: [{a: 1}, {a: "x"}, {b: 1}, {d: 1}, {}],
  },
  {
    name: "select-number",
    schema: {select: 1, selectCases: {1: {required: ["a"]}, true: {required: ["b"]}}},
    docs: [{a: 1}, {b: 1}, {}],
  },
  {
    name: "select-data",
    options: {$data: true},
    schema: {
      type: "object",
      properties: {
        kind: {},
        v: {},
        w: {},
      },
      select: {$data: "/kind"},
      selectCases: {
        num: {properties: {kind: {}, v: {type: "number"}}, required: ["v"]},
        str: {properties: {kind: {}, v: {type: "string"}}},
      },
      selectDefault: {properties: {kind: {}, w: {type: "boolean"}}, required: ["w"]},
    },
    docs: [
      {kind: "num", v: 1},
      {kind: "num", v: "x"},
      {kind: "str", v: "x"},
      {kind: "other", w: true},
      {kind: "other", w: 1},
      {kind: "other"},
      {},
    ],
  },
  {
    name: "select-data-relative",
    options: {$data: true},
    schema: {
      type: "object",
      properties: {
        tag: {},
        o: {
          type: "object",
          properties: {v: {}},
          select: {$data: "1/tag"},
          selectCases: {
            num: {properties: {v: {type: "number"}}},
            str: {properties: {v: {type: "string"}}},
          },
          selectDefault: {properties: {v: {const: true}}},
        },
      },
    },
    docs: [
      {tag: "num", o: {v: 1}},
      {tag: "num", o: {v: "x"}},
      {tag: "str", o: {v: "x"}},
      {tag: "other", o: {v: true}},
      {tag: "other", o: {v: 1}},
      {},
    ],
  },
  {
    name: "select-unevaluated",
    options: {$data: true},
    schema: {
      type: "object",
      select: {$data: "/kind"},
      selectCases: {
        a: {properties: {kind: {}, a: {type: "number"}}, required: ["a"]},
        b: {properties: {kind: {}, b: {type: "number"}}},
      },
      selectDefault: {properties: {kind: {}, d: {type: "number"}}},
      unevaluatedProperties: false,
    },
    docs: [
      {kind: "a", a: 1},
      {kind: "a", b: 1},
      {kind: "b", b: 1},
      {kind: "z", d: 1},
      {kind: "z", a: 1},
    ],
  },
  {
    name: "select-nested-errors",
    schema: {
      type: "object",
      properties: {
        o: {
          select: "a",
          selectCases: {
            a: {properties: {"x/y": {type: "number"}, "t~n": {type: "string"}}, required: ["x/y"]},
            "b c": {properties: {z: {type: "number"}}},
          },
          selectDefault: {properties: {q: {type: "number"}}},
        },
      },
    },
    docs: [
      {o: {"x/y": "no", "t~n": 3}},
      {o: {z: "no"}},
      {o: {q: "no"}},
    ],
  },
  {
    name: "select-reports",
    options: {verbose: true},
    schema: {
      type: "object",
      select: "a",
      selectCases: {a: {properties: {a: {type: "number"}}, required: ["a"]}},
      selectDefault: false,
    },
    docs: [{a: "x"}, {}],
  },
];

const REWRITE_CASES = [
  {
    name: "rewrite-root",
    schema: {type: "string", transform: ["trim"], const: "a"},
    docs: [" a "],
  },
  {
    name: "rewrite-depth",
    schema: {
      type: "object",
      properties: {
        top: {type: "string", transform: ["trim"], enum: ["a"]},
        nested: {
          type: "object",
          properties: {
            list: {type: "array", items: {type: "string", transform: ["toUpperCase"], enum: ["A"]}},
            deep: {
              type: "object",
              properties: {s: {type: "string", transform: ["trimEnd"], enum: ["a"]}},
            },
          },
        },
      },
    },
    docs: [{top: " a ", nested: {list: ["a"], deep: {s: "a  "}}}],
  },
  {
    name: "rewrite-ref-allof",
    schema: {
      type: "object",
      properties: {
        s: {allOf: [{$ref: "#/definitions/trimmed"}, {enum: ["a"]}]},
      },
      definitions: {trimmed: {type: "string", transform: ["trim"]}},
    },
    docs: [{s: " a "}],
  },
  {
    name: "rewrite-additional",
    schema: {
      type: "object",
      properties: {keep: {}},
      additionalProperties: {type: "string", transform: ["trim"], enum: ["a"]},
    },
    docs: [{keep: 1, extra: " a "}],
  },
  {
    name: "rewrite-pattern",
    schema: {
      type: "object",
      patternProperties: {"^p": {type: "string", transform: ["trim"], enum: ["a"]}},
    },
    docs: [{p1: " a ", other: " x "}],
  },
  {
    name: "rewrite-select",
    schema: {
      type: "object",
      properties: {
        o: {
          select: "a",
          selectCases: {a: {properties: {s: {type: "string", transform: ["trim"], enum: ["a"]}}}},
        },
      },
    },
    docs: [{o: {select: "a", s: " a "}}],
  },
  {
    name: "dynamic-defaults",
    options: {useDefaults: true},
    schema: {
      type: "object",
      properties: {a: {type: "integer"}},
      dynamicDefaults: {a: {func: "seq", args: {name: "root"}}},
    },
    docs: [{}, {a: 3}, {}],
  },
  {
    name: "dynamic-defaults-nested",
    options: {useDefaults: true},
    schema: {
      type: "object",
      properties: {
        o: {type: "object", dynamicDefaults: {a: {func: "seq", args: {name: "nested"}}}},
        list: {
          type: "array",
          items: {
            type: "object",
            dynamicDefaults: {a: {func: "seq", args: {name: "item"}}},
          },
        },
      },
    },
    docs: [{o: {}, list: [{}, {}]}],
  },
  {
    name: "dynamic-defaults-empty",
    options: {useDefaults: "empty"},
    schema: {type: "object", dynamicDefaults: {a: {func: "seq", args: {name: "empty"}}}},
    docs: [{a: ""}, {a: null}, {a: 0}, {}],
  },
  {
    name: "dynamic-defaults-off",
    schema: {type: "object", dynamicDefaults: {a: {func: "seq", args: {name: "off"}}}},
    docs: [{}],
  },
];

const REFUSALS = [
  ["range-order", {range: [4, 2]}],
  ["range-length", {range: [1]}],
  ["range-type", {range: ["a", 2]}],
  ["exclusiveRange-equal", {exclusiveRange: [2, 2]}],
  ["transform-unknown", {transform: ["explode"]}],
  ["transform-enum-missing", {transform: ["toEnumCase"]}],
  ["transform-enum-duplicate", {transform: ["toEnumCase"], enum: ["One", "one"]}],
  ["instanceof-unknown", {instanceof: "Nope"}],
  ["typeof-bad", {typeof: "symbol2"}],
  ["typeof-array-bad", {typeof: ["string", "x"]}],
  ["allRequired-bad", {allRequired: "yes"}],
  ["allRequired-dependency", {allRequired: true}],
  ["anyRequired-bad", {anyRequired: [1]}],
  ["oneRequired-bad", {oneRequired: "a"}],
  ["patternRequired-bad", {patternRequired: "x"}],
  ["prohibited-bad", {prohibited: "x"}],
  ["uniqueItemProperties-bad", {uniqueItemProperties: [1]}],
  ["regexp-unparsable", {regexp: "abc"}],
  ["regexp-type", {regexp: 3}],
  ["deepProperties-bad", {deepProperties: []}],
  ["deepRequired-empty", {deepRequired: [""]}],
  ["select-cases-only", {selectCases: {a: {}}}],
  ["select-without-cases", {select: "a"}],
  ["select-default-only", {selectDefault: {}}],
  ["select-bad-type", {select: {}, selectCases: {a: {}}}],
  ["select-bad-case", {select: "a", selectCases: {a: 3}}],
];

function makeValidator(Dialect, options) {
  return new Dialect({strict: false, logger: false, ...options});
}

for (const [dialect, Dialect, unevaluated] of DIALECTS) {
  for (const allErrors of [false, true]) {
    for (const testCase of CASES) {
      let ajv;
      let validate;
      try {
        ajv = makeValidator(Dialect, {...testCase.options, allErrors, unevaluated});
        addKeywords(ajv);
        validate = ajv.compile(clone(testCase.schema));
      } catch (error) {
        record({label: `${dialect} ${testCase.name} compile-error`, message: error.message});
        continue;
      }
      for (let index = 0; index < testCase.docs.length; index++) {
        report(`${dialect} ${testCase.name} ${index}`, ajv, validate, testCase.docs[index]);
      }
    }
    for (const testCase of REWRITE_CASES) {
      const ajv = makeValidator(Dialect, {...testCase.options, allErrors, logger: false});
      addKeywords(ajv);
      const validate = ajv.compile(clone(testCase.schema));
      for (let index = 0; index < testCase.docs.length; index++) {
        report(`${dialect} ${testCase.name} ${index}`, ajv, validate, testCase.docs[index]);
      }
    }
  }

  // The plugin's refusals happen while the project compiles its schema.
  for (const [name, schema] of REFUSALS) {
    const ajv = makeValidator(Dialect, {});
    addKeywords(ajv);
    compile(`${dialect} refuse ${name}`, ajv, schema);
  }
  // A default the plugin cannot construct is refused when defaults are on.
  {
    const ajv = makeValidator(Dialect, {useDefaults: true});
    addKeywords(ajv);
    compile(`${dialect} refuse dynamicDefaults-bad`, ajv, {dynamicDefaults: {a: "nope"}});
  }

  // The formats plugin loaded alongside the keyword plugin.
  for (const order of ["formats-first", "keywords-first"]) {
    for (const [name, schema, docs] of [
      [
        "formats",
        {
          type: "object",
          properties: {
            d: {type: "string", format: "date", transform: ["trim"], enum: ["2020-01-01"]},
            p: {type: "string", format: "json-pointer", regexp: {pattern: "^/"}},
            s: {
              select: "a",
              selectCases: {a: {required: ["a"]}},
              selectDefault: {required: ["z"]},
            },
          },
          required: ["d"],
          deepProperties: {"/p": {type: "string"}},
        },
        [
          {d: " 2020-01-01 ", p: "/a", s: "a", a: 1},
          {d: "not-a-date", p: "/a", s: "a", a: 1},
          {d: "2020-01-01", p: "no", s: "z", z: 1},
          {d: "2020-01-01"},
        ],
      ],
    ]) {
      for (const allErrors of [false, true]) {
        const ajv = makeValidator(Dialect, {allErrors});
        if (order === "formats-first") {
          addFormats(ajv);
          addKeywords(ajv);
        } else {
          addKeywords(ajv);
          addFormats(ajv);
        }
        const validate = ajv.compile(clone(schema));
        for (let index = 0; index < docs.length; index++) {
          report(`${dialect} ${order} ${name} ${allErrors} ${index}`, ajv, validate, docs[index]);
        }
      }
    }
    // A meta-schema format the keyword plugin declares: with formats loaded,
    // an invalid regex is refused by the plugin's own value schema.
    const ajv = makeValidator(Dialect, {});
    if (order === "formats-first") {
      addFormats(ajv);
      addKeywords(ajv);
    } else {
      addKeywords(ajv);
      addFormats(ajv);
    }
    compile(`${dialect} ${order} patternRequired-format`, ajv, {patternRequired: ["["]});
  }

  // Individual registration and the plugin's lookup.
  {
    const ajv = makeValidator(Dialect, {});
    addKeywords(ajv, "range");
    const validate = ajv.compile({type: "number", range: [1, 2]});
    report(`${dialect} single range`, ajv, validate, 3);
    compile(`${dialect} single unknown-keyword`, ajv, {transform: ["trim"]});
  }
  {
    const ajv = makeValidator(Dialect, {});
    addKeywords(ajv, ["transform", "select"]);
    const validate = ajv.compile({
      type: "object",
      properties: {s: {type: "string", transform: ["trim"], enum: ["a"]}},
      select: "x",
      selectCases: {x: {required: ["s"]}},
    });
    report(`${dialect} array registered`, ajv, validate, {s: " a ", select: "x"});
  }
  {
    const ajv = makeValidator(Dialect, {});
    addKeywords.get("deepRequired")(ajv);
    const validate = ajv.compile({type: "object", deepRequired: ["/a"]});
    report(`${dialect} get deepRequired`, ajv, validate, {});
  }
  try {
    addKeywords.get("nope");
    record({label: `${dialect} lookup nope`, threw: false});
  } catch (error) {
    record({label: `${dialect} lookup nope`, threw: true, message: error.message});
  }
  try {
    const ajv = makeValidator(Dialect, {});
    addKeywords(ajv);
    addKeywords(ajv);
    record({label: `${dialect} twice`, twice: "compiled"});
  } catch (error) {
    record({label: `${dialect} twice`, twice: "refused", message: error.message});
  }

  // Strict mode still makes ajv's decisions around the registered keywords.
  {
    const logs = [];
    const ajv = new Dialect({
      logger: {
        log() {},
        warn: (message) => logs.push(message),
        error: (message) => logs.push(message),
      },
    });
    addKeywords(ajv);
    const validate = ajv.compile({
      type: "object",
      properties: {a: {type: "number", range: [1, 2]}},
    });
    report(`${dialect} strict`, ajv, validate, {a: 3});
    record({label: `${dialect} strict-logs`, strictLogs: logs});
  }
  {
    const logs = [];
    const ajv = new Dialect({
      strict: "log",
      logger: {
        log() {},
        warn: (message) => logs.push(message),
        error: (message) => logs.push(message),
      },
    });
    addKeywords(ajv);
    compile(`${dialect} strict-log`, ajv, {type: "number", range: [1, 2], unknownWord: 1});
    record({label: `${dialect} strict-log-logs`, strictLogMessages: logs});
  }
}

async function main() {
  // Asynchronous validation keeps the plugin's synchronous rules in its flow.
  for (const [dialect, Dialect] of DIALECTS) {
    const ajv = makeValidator(Dialect, {allErrors: true});
    addKeywords(ajv);
    const validate = ajv.compile({
      $async: true,
      type: "object",
      properties: {
        s: {type: "string", transform: ["trim"], enum: ["a"]},
        v: {typeof: "number"},
      },
      select: "x",
      selectCases: {x: {required: ["s"]}},
      selectDefault: {required: ["z"]},
    });
    for (const [index, document] of [
      {s: " a ", v: 1, select: "x"},
      {s: " b ", v: "x", select: "x"},
      {select: "z"},
    ].entries()) {
      const input = clone(document);
      try {
        const data = await validate(input);
        record({label: `${dialect} async ${index}`, data, errors: null, document: input});
      } catch (error) {
        record({
          label: `${dialect} async ${index}`,
          rejected: error.errors,
          name: error.name,
          document: input,
        });
      }
    }
  }
  for (const line of results) console.log(JSON.stringify(line));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
