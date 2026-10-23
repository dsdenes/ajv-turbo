"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {escapePointerToken} = require("./uri");
const jtdMetaSchema = require("./refs/jtd-schema.json");

// The metadata `_makeValidator` attaches to every compiled validator. The
// symbol is registered globally so the two modules share it without a cycle.
const STANDALONE = Symbol.for("ajv.standalone.metadata");

const RUNTIME_FILES = [
  "./uri",
  "./util",
  "./codegen",
  "./keyword-code",
  "./compile",
  "./discriminator",
  "./standalone-runtime",
];

// The options that change a verdict, a report, or the validated document. The
// generated module needs them because they are compile-time settings in ajv.
const RUNTIME_OPTIONS = [
  "allErrors",
  "verbose",
  "messages",
  "strictNumbers",
  "unicodeRegExp",
  "ownProperties",
  "coerceTypes",
  "useDefaults",
  "removeAdditional",
  "multipleOfPrecision",
  "nullable",
  "validateFormats",
  "validateSchema",
  "strict",
  "$data",
  "next",
  "unevaluated",
  "dynamicRef",
  "metaDialect",
  "schemaId",
  "discriminator",
  "passContext",
];

const META_SCHEMA_ALIAS = "http://json-schema.org/schema";

// The modules a generated JSON Type Definition module carries. The compiler
// is inlined whole, so the generated validator compiles the schema the same
// way the package does directly. `./compile`, `./ajv`, and the meta-schema are
// synthesized below: the dialect compiler needs only the error classes from
// the first, a superclass for its unused class export from the second, and the
// schema object it never reads at run time.
const JTD_RUNTIME_FILES = [
  "./uri",
  "./util",
  "./codegen",
  "./keyword-code",
  "./vocabulary",
  "./jtd",
  "./jtd-standalone-runtime",
];

// The options that change a JSON Type Definition verdict, report, or validated
// document. They are compile-time settings in ajv and are baked into the
// generated module.
const JTD_RUNTIME_OPTIONS = [
  "allErrors",
  "verbose",
  "messages",
  "strictNumbers",
  "ownProperties",
  "removeAdditional",
  "int32range",
  "timestamp",
  "allowDate",
  "inlineRefs",
  "strictSchema",
  "passContext",
  "validateSchema",
];

let runtimeSource;
let jtdRuntimeSource;

function runtimeOptions(opts) {
  const picked = {};
  for (const key of RUNTIME_OPTIONS) {
    if (opts[key] !== undefined) picked[key] = opts[key];
  }
  return picked;
}

// The interpreter, inlined into every generated module. Reading the sources at
// generation time keeps one implementation: a generated validator validates
// exactly the way the package validates directly.
function runtimeModules() {
  if (runtimeSource !== undefined) return runtimeSource;
  let source = "";
  for (const id of RUNTIME_FILES) {
    const file = path.join(__dirname, id.slice(2) + ".js");
    const body = fs.readFileSync(file, "utf8");
    source += `__modules[${JSON.stringify(id)}] = {exports: {}};\n`;
    source += `(function (module, exports, require) {\n${body}\n})`;
    source += `(__modules[${JSON.stringify(id)}], __modules[${JSON.stringify(id)}].exports, __require);\n`;
  }
  runtimeSource = source;
  return source;
}

// The JSON Type Definition compiler reads only the error classes from
// `./compile`; everything else that module carries belongs to JSON Schema
// compilation and is not embedded. `./ajv` only has to exist because the
// compiler file defines its class export, which a generated module never
// constructs.
function jtdRuntimeModules() {
  if (jtdRuntimeSource !== undefined) return jtdRuntimeSource;
  const modules = (ids) =>
    ids
      .map((id) => {
        const file = path.join(__dirname, id.slice(2) + ".js");
        const body = fs.readFileSync(file, "utf8");
        return (
          `__modules[${JSON.stringify(id)}] = {exports: {}};\n` +
          `(function (module, exports, require) {\n${body}\n})` +
          `(__modules[${JSON.stringify(id)}], __modules[${JSON.stringify(id)}].exports, __require);\n`
        );
      })
      .join("");
  let source = "";
  // The error-class stub resolves its identifier helpers from `./uri`, so that
  // module is registered first.
  source += modules(["./uri"]);
  source += `__modules[${JSON.stringify("./ajv")}] = {exports: {}};\n`;
  source +=
    "(function (module) {\n" +
    "module.exports = class Ajv {};\n" +
    `})(${`__modules[${JSON.stringify("./ajv")}]`});\n`;
  source += `__modules[${JSON.stringify("./refs/jtd-schema.json")}] = {exports: ${JSON.stringify(
    jtdMetaSchema,
  )}};\n`;
  source += `__modules[${JSON.stringify("./compile")}] = {exports: {}};\n`;
  source +=
    "(function (module, exports, require) {\n" +
    'const {normalizeId, resolveUri, splitUri} = require("./uri");\n' +
    "class MissingRefError extends Error {\n" +
    "  constructor(baseId, ref, message) {\n" +
    "    const missingRef = normalizeId(resolveUri(baseId, ref));\n" +
    "    super(message || `can't resolve reference ${ref} from id ${baseId}`);\n" +
    "    this.missingRef = missingRef;\n" +
    "    this.missingSchema = splitUri(missingRef).uri;\n" +
    "  }\n" +
    "}\n" +
    "class ValidationError extends Error {\n" +
    "  constructor(errors) {\n" +
    '    super("validation failed");\n' +
    "    this.errors = errors;\n" +
    "    this.ajv = this.validation = true;\n" +
    "  }\n" +
    "}\n" +
    "module.exports = {MissingRefError, ValidationError};\n" +
    `})(${`__modules[${JSON.stringify("./compile")}]`}, ${`__modules[${JSON.stringify(
      "./compile",
    )}].exports`}, __require);\n`;
  source += modules(JTD_RUNTIME_FILES.filter((id) => id !== "./uri"));
  jtdRuntimeSource = source;
  return source;
}

function findPath(root, target) {
  if (root === target) return "";
  const seen = new Set();
  const walk = (node, current) => {
    if (node === null || typeof node !== "object") return undefined;
    if (seen.has(node)) return undefined;
    seen.add(node);
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (node[i] === target) return current + "/" + i;
        const found = walk(node[i], current + "/" + i);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    for (const key of Object.keys(node)) {
      const next = current + "/" + escapePointerToken(key);
      if (node[key] === target) return next;
      const found = walk(node[key], next);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(root, "") || "";
}

// A function definition carried by a generated module. The module embeds the
// function as source rather than a reference to the generator's process, so it
// runs without the package and without dynamic code evaluation. A method
// shorthand (`even(schema, data) {}`) is not an expression; it is recovered
// from an object literal instead.
function functionSource(fn) {
  if (typeof fn !== "function") return undefined;
  const source = Function.prototype.toString.call(fn);
  if (/\{\s*\[native code\]\s*\}/.test(source) || /^class\b/.test(source)) return undefined;
  try {
    new Function("return (" + source + ");");
    return {source, method: undefined};
  } catch {
    // Not an expression; try the method-shorthand form.
  }
  if (fn.name !== "") {
    try {
      new Function("return ({" + source + "});");
      return {source, method: fn.name};
    } catch {
      // Neither form parses, so the definition cannot be carried.
    }
  }
  return undefined;
}

// The extensions a generated module carries, split into the snapshots the
// compiled validators resolved. A format that is not a RegExp needs the code
// ajv's `code.formats` option names; a custom keyword's rule is carried as
// source. Definitions that cannot be carried fail generation exactly where ajv
// fails: hard, before any module is produced.
function buildExtensions(ajv, collected) {
  const fallback = {
    formats: {...ajv.formats},
    keywords: [...ajv.keywords.values()],
  };
  const codeFormats = ajv.opts.code === undefined ? undefined : ajv.opts.code.formats;
  const records = new Map();
  const order = [];
  const snapshotOf = new Map();

  for (const item of collected) {
    const snapshot = item.ctx._standaloneExtensions || fallback;
    let index = records.get(snapshot);
    if (index === undefined) {
      index = order.length;
      records.set(snapshot, index);
      order.push({
        snapshot,
        usedKeywords: new Set(),
        // Every `format` rule the environment reaches, in traversal order.
        // ajv compiles the rule once for the number group and once for the
        // string group, and each compilation creates a scope name, so the
        // scope indices advance by two per rule.
        formatRules: [],
        keywordOrder: [],
        formats: [],
        keywords: [],
      });
    }
    snapshotOf.set(item.ctx, index);
    const record = order[index];
    const ruleNames = new Set();
    for (const entry of snapshot.keywords) {
      if (entry.validate !== undefined || entry.macro !== undefined) {
        ruleNames.add(entry.keyword);
      }
    }
    for (const node of item.ctx.nodes || []) {
      if (item.opts.validateFormats !== false) {
        if (typeof node.format === "string") {
          record.formatRules.push({name: node.format});
        } else if (
          item.opts.$data === true &&
          node.format !== null &&
          typeof node.format === "object" &&
          Boolean(node.format.$data)
        ) {
          record.formatRules.push({data: true});
        }
      }
      for (const name of ruleNames) {
        if (node[name] === undefined) continue;
        if (!record.usedKeywords.has(name)) record.keywordOrder.push(name);
        record.usedKeywords.add(name);
      }
    }
  }

  const functions = [];
  function addFunction(serialized) {
    const name = "__fn" + functions.length;
    functions.push({name, ...serialized});
    return name;
  }

  let needsFormats = false;
  for (const record of order) {
    const {snapshot, usedKeywords, keywordOrder} = record;
    // ajv fails standalone generation on the first format scope value whose
    // code the project did not supply. A literal format needs the formats code
    // unless its definition is a RegExp; a format named by the document always
    // needs the whole formats map. Both are resolved from `code.formats`.
    let formatScope = 0;
    let dataScope;
    const seenFormats = new Set();
    for (const rule of record.formatRules) {
      if (rule.data) {
        if (dataScope === undefined) {
          dataScope = formatScope;
          if (codeFormats === undefined) {
            throw new Error(`CodeGen: "code" for formats${dataScope} not defined`);
          }
        }
        formatScope += 2;
        continue;
      }
      const definition = snapshot.formats[rule.name];
      if (definition === true || definition === null || definition === undefined) continue;
      if (seenFormats.has(rule.name)) {
        formatScope += 2;
        continue;
      }
      seenFormats.add(rule.name);
      if (!(definition instanceof RegExp) && codeFormats === undefined) {
        throw new Error(`CodeGen: "code" for formats${formatScope} not defined`);
      }
      formatScope += 2;
    }
    for (const name of Object.keys(snapshot.formats)) {
      const definition = snapshot.formats[name];
      if (definition === true || definition === null || definition === undefined) continue;
      if (definition instanceof RegExp) {
        record.formats.push({name, regexp: [definition.source, definition.flags]});
        continue;
      }
      if (codeFormats === undefined) continue;
      needsFormats = true;
      record.formats.push({
        name,
        external: true,
        type: definition.type === undefined ? "string" : definition.type,
        async: definition.async === true,
      });
    }
    if (dataScope !== undefined) needsFormats = true;
    for (const entry of snapshot.keywords) {
      if (entry.keyword === "discriminator" && entry.code !== undefined) {
        record.discriminator = {types: entry.types, schemaTypes: entry.schemaTypes};
        continue;
      }
      if (entry.validate === undefined && entry.macro === undefined) continue;
      const used = usedKeywords.has(entry.keyword);
      const serialized = functionSource(entry.macro !== undefined ? entry.macro : entry.validate);
      if (serialized === undefined) {
        if (used) {
          // ajv names keyword scope values in compilation order; macros do not
          // take one, so only used validation rules before this one count.
          const functionsBefore = new Set();
          for (const name of keywordOrder) {
            if (name === entry.keyword) break;
            const earlier = snapshot.keywords.find((candidate) => candidate.keyword === name);
            if (earlier !== undefined && earlier.validate !== undefined) {
              functionsBefore.add(earlier.validate);
            }
          }
          throw new Error(`CodeGen: "code" for keyword${functionsBefore.size} not defined`);
        }
        continue;
      }
      const definition = {
        keyword: entry.keyword,
        types: entry.types,
        async: entry.async === true,
        inspectErrors: entry.inspectErrors !== false,
        modifying: entry.modifying === true,
        passSchema: entry.passSchema !== false,
      };
      definition[entry.macro !== undefined ? "macro" : "validate"] = addFunction(serialized);
      record.keywords.push(definition);
    }
  }

  return {snapshots: order, snapshotOf, functions, needsFormats};
}

function functionCode(serialized) {
  return serialized.method === undefined
    ? `(${serialized.source})`
    : `({${serialized.source}})[${JSON.stringify(serialized.method)}]`;
}

function extensionsCode(plan) {
  const snapshots = plan.snapshots.map((record) => {
    const formats = JSON.stringify(record.formats);
    const keywords = record.keywords.map((definition) => {
      const parts = [
        `keyword:${JSON.stringify(definition.keyword)}`,
        `types:${JSON.stringify(definition.types)}`,
        `async:${definition.async}`,
        `inspectErrors:${definition.inspectErrors}`,
        `modifying:${definition.modifying}`,
        `passSchema:${definition.passSchema}`,
      ];
      if (definition.macro !== undefined) parts.push(`macro:${definition.macro}`);
      else parts.push(`validate:${definition.validate}`);
      return "{" + parts.join(",") + "}";
    });
    return (
      `{formats:${formats},keywords:[${keywords.join(",")}],` +
      `discriminator:${JSON.stringify(record.discriminator)}}`
    );
  });
  return `{snapshots:[${snapshots.join(",")}]}`;
}

// Builds the schema environments the generated module registers. Every
// registered meta-schema and every schema added to the instance is included, so
// references keep resolving exactly as they did at generation time.
function collectEntries(ajv, contexts) {
  const collected = [];
  const pending = new WeakSet();
  const add = (ctx) => {
    if (!ctx || pending.has(ctx)) return;
    pending.add(ctx);
    const aliases = new Set(ctx.aliases || []);
    if (ajv._metaContext !== undefined && ctx === ajv._metaContext) aliases.add(META_SCHEMA_ALIAS);
    collected.push({
      ctx,
      schema: ctx.root,
      base: ctx.base,
      aliases,
      opts: runtimeOptions(ctx.opts),
    });
  };
  for (const ctx of ajv._metaContexts || []) add(ctx);
  for (const ctx of ajv._contexts || []) add(ctx);
  for (const ctx of contexts) add(ctx);

  const entries = [];
  const entryContexts = [];
  const byKey = new Map();
  const indexOf = new Map();
  for (const item of collected) {
    const key = item.base + "\u0000" + JSON.stringify(item.schema);
    const existing = byKey.get(key);
    if (existing !== undefined) {
      for (const alias of item.aliases) entries[existing].aliases.push(alias);
      entryContexts[existing].push(item.ctx);
      indexOf.set(item.ctx, existing);
      continue;
    }
    const index = entries.length;
    entries.push({
      schema: item.schema,
      base: item.base,
      aliases: [...item.aliases],
      opts: item.opts,
    });
    entryContexts.push([item.ctx]);
    byKey.set(key, index);
    indexOf.set(item.ctx, index);
  }
  return {entries, entryContexts, indexOf, collected};
}

function targetFor(validate) {
  const metadata = validate[STANDALONE];
  if (metadata === undefined) {
    throw new Error('moduleCode: function does not have "source" property');
  }
  return metadata;
}

function jtdRuntimeOptions(opts) {
  const picked = {};
  for (const key of JTD_RUNTIME_OPTIONS) {
    if (opts[key] !== undefined) picked[key] = opts[key];
  }
  return picked;
}

// Whether a schema reaches a custom definition, either through its own name or
// through one of the names it implements. A definition the schema never uses
// does not need its functions carried, exactly as the JSON Schema generator
// only fails on a rule the schema reaches.
function jtdKeywordUsed(schema, definition) {
  const names = new Set([definition.keyword].concat(definition.implements || []));
  const walk = (node) => {
    if (node === null || typeof node !== "object") return false;
    if (Array.isArray(node)) return node.some(walk);
    for (const key of Object.keys(node)) {
      if (names.has(key)) return true;
      if (walk(node[key])) return true;
    }
    return false;
  };
  return walk(schema);
}

// The custom keyword definitions a generated JSON Type Definition module
// registers before it compiles the schema. Their rule functions travel as
// source, like the JSON Schema generator carries them; the rest of the entry
// is plain data.
function jtdKeywordCode(definitions, schema, functions) {
  return definitions.map((entry) => {
    const definition =
      entry.definition === undefined
        ? undefined
        : {
            error: entry.definition.error,
            $dataError: entry.definition.$dataError,
            mergeEvaluated: entry.definition.mergeEvaluated,
            trackErrors: entry.definition.trackErrors,
          };
    const parts = [
      `keyword:${JSON.stringify(entry.keyword)}`,
      `types:${JSON.stringify(entry.types === undefined ? [] : entry.types)}`,
      `async:${entry.async === true}`,
      `inspectErrors:${entry.inspectErrors !== false}`,
      `modifying:${entry.modifying === true}`,
      `passSchema:${entry.passSchema !== false}`,
      `allowUndefined:${entry.allowUndefined === true}`,
      `$data:${entry.$data === true}`,
      `schemaTypes:${JSON.stringify(entry.schemaTypes === undefined ? [] : entry.schemaTypes)}`,
      `schemaType:${JSON.stringify(entry.schemaType)}`,
      `rule:${entry.rule === true}`,
      `post:${entry.post === true}`,
      `before:${JSON.stringify(entry.before)}`,
      `implements:${JSON.stringify(entry.implements)}`,
      `dependencies:${JSON.stringify(entry.dependencies)}`,
      `definition:${JSON.stringify(definition)}`,
    ];
    for (const field of ["validate", "macro", "compile", "code"]) {
      const fn = entry[field];
      if (fn === undefined) continue;
      const serialized = functionSource(fn);
      if (serialized === undefined) {
        if (jtdKeywordUsed(schema, entry)) {
          throw new Error(`CodeGen: "code" for keyword${functions.length} not defined`);
        }
        continue;
      }
      const name = "__fn" + functions.length;
      functions.push({name, ...serialized});
      parts.push(`${field}:${name}`);
    }
    return "{" + parts.join(",") + "}";
  });
}

function buildJtdModule(ajv, validators, names) {
  const functions = [];
  const entries = validators.map((validate) => {
    const metadata = targetFor(validate);
    const keywords = jtdKeywordCode(metadata.keywords || [], metadata.schema, functions);
    return (
      `{schema:${JSON.stringify(metadata.schema)},` +
      `opts:${JSON.stringify(jtdRuntimeOptions(metadata.opts || {}))},` +
      `keywords:[${keywords.join(",")}]}`
    );
  });

  const esm = Boolean(ajv.opts.code && ajv.opts.code.esm);
  let code = '"use strict";\n';
  code += "const __modules = Object.create(null);\n";
  code += "function __require(id) {\n";
  code += '  const mod = __modules[id];\n';
  code += "  if (!mod) throw new Error(\"Cannot find module '\" + id + \"'\");\n";
  code += "  return mod.exports;\n";
  code += "}\n";
  code += jtdRuntimeModules();
  code += "const __standalone = __modules['./jtd-standalone-runtime'].exports;\n";
  for (const fn of functions) {
    code += `const ${fn.name} = ${functionCode(fn)};\n`;
  }
  code += `const __validators = __standalone.createStandalone([${entries.join(",")}]);\n`;

  if (names === undefined) {
    const ref = "__validators[0]";
    code += esm
      ? `export const validate = ${ref};\nexport default ${ref};\n`
      : `module.exports = ${ref};\nmodule.exports.default = ${ref};\n`;
    return code;
  }

  const exported = names.map((name, index) => {
    const ref = `__validators[${index}]`;
    if (!esm) return `module.exports[${JSON.stringify(name)}] = ${ref};\n`;
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      throw new Error(`CodeGen: invalid export name: ${name}, use explicit $id name mapping`);
    }
    return `export const ${name} = ${ref};\n`;
  });
  code += exported.join("");
  return code;
}

function buildModule(ajv, validators, names) {
  const contexts = validators.map((validate) => targetFor(validate).ctx);
  const {entries, entryContexts, indexOf, collected} = collectEntries(ajv, contexts);
  const extensions = buildExtensions(ajv, collected);
  for (let index = 0; index < entries.length; index++) {
    entries[index].ext = extensions.snapshotOf.get(entryContexts[index][0]);
  }
  const targets = [];
  for (const validate of validators) {
    const {ctx, node} = targetFor(validate);
    const entry = indexOf.get(ctx);
    const recorded = ctx.pathOf.get(node);
    const target = recorded !== undefined ? recorded : findPath(ctx.root, node);
    targets.push({entry, path: target});
  }

  const esm = Boolean(ajv.opts.code && ajv.opts.code.esm);
  let code = '"use strict";\n';
  code += "const __modules = Object.create(null);\n";
  code += "function __require(id) {\n";
  code += '  const mod = __modules[id];\n';
  code += "  if (!mod) throw new Error(\"Cannot find module '\" + id + \"'\");\n";
  code += "  return mod.exports;\n";
  code += "}\n";
  code += runtimeModules();
  code += "const __standalone = __modules['./standalone-runtime'].exports;\n";
  for (const fn of extensions.functions) {
    code += `const ${fn.name} = ${functionCode(fn)};\n`;
  }
  code += `const __extensions = ${extensionsCode(extensions)};\n`;
  let formatsArgument = "";
  if (extensions.needsFormats) {
    code += `const __formats = (${String(ajv.opts.code.formats)});\n`;
    formatsArgument = ", __formats";
  }
  code +=
    "const __validators = __standalone.createStandalone(" +
    "{compile: __modules['./compile'].exports, uri: __modules['./uri'].exports, " +
    "discriminator: __modules['./discriminator'].exports},\n";
  code += JSON.stringify(entries) + ",\n";
  code += JSON.stringify(targets) + ",\n";
  code += "__extensions" + formatsArgument + ");\n";

  if (names === undefined) {
    const ref = "__validators[0]";
    code += esm
      ? `export const validate = ${ref};\nexport default ${ref};\n`
      : `module.exports = ${ref};\nmodule.exports.default = ${ref};\n`;
    return code;
  }

  const exported = names.map((name, index) => {
    const ref = `__validators[${index}]`;
    if (!esm) return `module.exports[${JSON.stringify(name)}] = ${ref};\n`;
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      throw new Error(`CodeGen: invalid export name: ${name}, use explicit $id name mapping`);
    }
    return `export const ${name} = ${ref};\n`;
  });
  code += exported.join("");
  return code;
}

function schemaValidators(ajv) {
  const validators = [];
  const names = [];
  const metaRoots = new Set(
    (ajv._metaContexts || [])
      .concat((ajv._contexts || []).filter((ctx) => ctx.meta))
      .map((ctx) => ctx.root),
  );
  const jtd = ajv.opts.jtd === true;
  for (const name of Object.keys(ajv.schemas)) {
    const registered = ajv.schemas[name];
    if (jtd) {
      // The JSON Type Definition registry wraps each schema and marks the
      // meta-schema, which a generated module never exports.
      if (registered.meta === true) continue;
      if (registered.schema === undefined) continue;
    } else if (metaRoots.has(registered)) {
      continue;
    }
    const validate = ajv.getSchema(name);
    if (!validate) continue;
    validators.push(validate);
    names.push(name);
  }
  return {validators, names};
}

// ajv's standalone surface: a function export for a compiled validator, a map
// from export name to registered schema id, or every schema registered on the
// instance when called without an argument.
function standaloneCode(ajv, refsOrFunc) {
  if (!ajv.opts.code || !ajv.opts.code.source) {
    throw new Error("moduleCode: ajv instance must have code.source option");
  }
  if (typeof refsOrFunc === "function") {
    const metadata = targetFor(refsOrFunc);
    return metadata.kind === "jtd"
      ? buildJtdModule(ajv, [refsOrFunc])
      : buildModule(ajv, [refsOrFunc]);
  }
  if (refsOrFunc !== undefined) {
    const validators = [];
    const names = [];
    for (const name of Object.keys(refsOrFunc)) {
      const id = refsOrFunc[name];
      const validate = ajv.getSchema(id);
      if (!validate) throw new Error(`moduleCode: no schema with id ${id}`);
      validators.push(validate);
      names.push(name);
    }
    return ajv.opts.jtd === true
      ? buildJtdModule(ajv, validators, names)
      : buildModule(ajv, validators, names);
  }
  const {validators, names} = schemaValidators(ajv);
  return ajv.opts.jtd === true
    ? buildJtdModule(ajv, validators, names)
    : buildModule(ajv, validators, names);
}

module.exports = standaloneCode;
module.exports.default = standaloneCode;
