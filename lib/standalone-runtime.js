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

function createStandalone(runtime, entries, targets) {
  const {SchemaContext, Validator} = runtime.compile;
  const {splitUri, resolvePointer} = runtime.uri;

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
    const view = {
      opts: entry.opts,
      formats: Object.create(null),
      keywords: new Map(),
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
    let validate;
    if (node !== null && typeof node === "object" && node.$async) {
      validate = async (data) => {
        const errors = [];
        const result = await validator.runAsync(node, data, ctx, errors, "");
        if (!result.valid) throw new runtime.compile.ValidationError(errors);
        return result.data;
      };
      validate.$async = true;
    } else {
      validate = (data) => {
        const errors = [];
        if (!validator.run(node, data, ctx, errors, "")) {
          validate.errors = errors;
          return false;
        }
        validate.errors = null;
        return true;
      };
    }
    validate.errors = null;
    validate.schema = node;
    return validate;
  });
}

module.exports = {createStandalone};
