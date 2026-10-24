"use strict";

// Runtime evaluated inside a generated standalone module. It is not loaded by
// the package itself: `lib/standalone.js` copies this file into the generated
// module together with the interpreter it depends on, so the generated
// validator has no dependency on the package at run time.
//
// `runtime` supplies `{compile, uri}`: the interpreter modules inlined next to
// this file. `entries` describes every schema environment the generated module
// needs, `targets` names the validator each entry/path pair exports.

function pointer(root, path) {
  if (path === "") return root;
  let node = root;
  for (const token of path.split("/")) {
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(node, key)) return undefined;
    node = node[key];
  }
  return node;
}

// A format whose definition the project did not supply in the code the
// generated module names. Ajv's generated module fails when the format runs,
// so this one does too instead of silently accepting every value.
function missingFormat(name, type, async) {
  return {
    type,
    async,
    validate() {
      throw new TypeError(`format "${name}" is not defined in the supplied formats`);
    },
  };
}

function createStandalone(runtime, entries, targets, extensions, externalFormats) {
  const {SchemaContext, Validator} = runtime.compile;
  const {splitUri, resolvePointer} = runtime.uri;

  const snapshots = extensions.snapshots;
  const ids = new Map();
  const roots = new Map();

  function register(map, key, ctx, node) {
    if (key === "") return;
    const existing = map.get(key);
    if (existing !== undefined) {
      if (existing.node === node) return;
      throw new Error(`reference "${key}" resolves to more than one schema`);
    }
    map.set(key, {ctx, node});
  }

  // Mirrors Ajv's global lookup: a registered identifier first, then the root
  // of a registered schema followed by a JSON pointer.
  function lookup(full) {
    const hit = ids.get(full);
    if (hit) return {ctx: hit.ctx, node: hit.node};
    const split = splitUri(full);
    const root = roots.get(split.uri);
    if (!root) return undefined;
    if (split.fragment === undefined || split.fragment === "") {
      return {ctx: root.ctx, node: root.node};
    }
    if (split.fragment[0] !== "/") return undefined;
    const node = resolvePointer(root.node, split.fragment);
    return node === undefined ? undefined : {ctx: root.ctx, node};
  }

  const contexts = [];
  for (const entry of entries) {
    const snapshot = snapshots[entry.ext];
    const formats = Object.create(null);
    for (const definition of snapshot.formats) {
      if (definition.regexp !== undefined) {
        formats[definition.name] = new RegExp(definition.regexp[0], definition.regexp[1]);
        continue;
      }
      const supplied = externalFormats === undefined ? undefined : externalFormats[definition.name];
      formats[definition.name] =
        supplied === undefined
          ? missingFormat(definition.name, definition.type, definition.async)
          : supplied;
    }
    const keywords = new Map();
    for (const definition of snapshot.keywords) {
      keywords.set(definition.keyword, {
        keyword: definition.keyword,
        types: definition.types,
        validate: definition.validate,
        macro: definition.macro,
        async: definition.async === true,
        inspectErrors: definition.inspectErrors !== false,
        modifying: definition.modifying === true,
        passSchema: definition.passSchema !== false,
      });
    }
    // The dialect registers the discriminator keyword whenever the option is
    // enabled; its generated-code rule cannot be carried as a function, so the
    // module registers the definition it inlines instead.
    if (entry.opts.discriminator === true && snapshot.discriminator !== undefined) {
      const definition = runtime.discriminator;
      keywords.set("discriminator", {
        keyword: "discriminator",
        types: snapshot.discriminator.types,
        schemaTypes: snapshot.discriminator.schemaTypes,
        $data: false,
        // The definition itself, which the generated program reads for its
        // error report and evaluated-name merge.
        definition,
        code: definition.code,
        validate: undefined,
        macro: undefined,
        compile: undefined,
      });
    }
    const view = {
      opts: entry.opts,
      formats,
      // ajv's generated module resolves a format named by the document from
      // the formats code the project supplied, not from the registered map.
      dataFormats: externalFormats,
      keywords,
      // The schema already passed compile-time strict checks when the validator
      // was compiled; rebuilding its environment must not repeat them.
      strictChecks: false,
      logger: {log() {}, warn() {}, error() {}},
      _keywordRevision: 0,
      _patternCache: new Map(),
      _lookupGlobal: lookup,
      validateSchema() {
        return true;
      },
    };
    const ctx = new SchemaContext(view, entry.schema, entry.base, false);
    contexts.push(ctx);
    for (const [key, node] of ctx.ids) register(ids, key, ctx, node);
    for (const [key, node] of ctx.roots) register(roots, key, ctx, node);
    for (const alias of entry.aliases) {
      register(ids, alias, ctx, ctx.root);
      register(roots, alias, ctx, ctx.root);
    }
  }

  const prepared = new Set();
  return targets.map((target) => {
    const ctx = contexts[target.entry];
    if (!prepared.has(ctx)) {
      ctx.prepare(ctx.root);
      prepared.add(ctx);
    }
    const node = pointer(ctx.root, target.path);
    const validator = new Validator(ctx);
    const published =
      ctx.opts.unevaluated === true ? validator.publishedFor(node, ctx) : undefined;
    if (published !== undefined) published.props = validator.publishedProps(published.props);
    const passesContext = ctx.opts.passContext === true;
    const contextOf = (self) =>
      self === null || self === undefined ? globalThis : Object(self);
    let validate;
    if (node !== null && typeof node === "object" && node.$async) {
      validate = async function (data) {
        const errors = [];
        const callerContext = passesContext ? contextOf(this) : undefined;
        const result = await validator.runAsync(node, data, ctx, errors, "", callerContext);
        if (!result.valid) throw new runtime.compile.ValidationError(errors);
        return result.data;
      };
      validate.$async = true;
    } else {
      validate = function (data) {
        const errors = [];
        const callerContext = passesContext ? contextOf(this) : undefined;
        if (!validator.run(node, data, ctx, errors, "", callerContext, published)) {
          validate.errors = errors;
          return false;
        }
        validate.errors = null;
        return true;
      };
    }
    validate.errors = null;
    validate.schema = node;
    if (published !== undefined) validate.evaluated = published;
    return validate;
  });
}

module.exports = {createStandalone};
