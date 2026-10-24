"use strict";

// ajv lets a project rewrite the source of the validators it compiles through
// the `code.process` option: compilation hands the option the generated source
// and the schema environment, evaluates the returned source, and uses the
// function that source defines as the validator. This package compiles
// validators into an interpreter, so the source it hands the project is the
// small program that produces the compiled validator from the implementation
// the interpreter built. The rewrite still receives a real program and its
// result is still what validates documents, so a rewrite that changes or
// replaces the source changes the validator.
//
// The source runs with ajv's evaluation contract: `self` names the Ajv
// instance and `scope` holds the values the generated program refers to, as
// ajv's own generated source does. A synchronous validator keeps ajv's
// `vErrors`/`errors` shape and reports its verdict through `errors === 0`, so
// a rewrite written against ajv's generated validators applies here too.

const SYNC_SOURCE = [
  'const validateImpl = scope["validateImpl"];',
  "return function validate(data, dataCxt) {",
  "  const valid = validateImpl.call(this, data, dataCxt);",
  "  let vErrors = validateImpl.errors;",
  "  let errors =",
  "    vErrors === null || vErrors === undefined ? (valid ? 0 : 1) : vErrors.length;",
  "  validate.errors = vErrors;",
  "  return errors === 0;",
  "};",
  "",
].join("\n");

const ASYNC_SOURCE = [
  'const validateImpl = scope["validateImpl"];',
  "return function validate(data, dataCxt) {",
  "  return validateImpl.call(this, data, dataCxt);",
  "};",
  "",
].join("\n");

// A schema environment in the shape ajv passes to `code.process`: the schema
// the validator validates, the identifier it was compiled under, the root
// environment its references resolve against, and the flags a rewrite can
// read. Fields ajv leaves undefined for ordinary compilations stay undefined.
function schemaEnvironment(schema, baseId, rootSchema, isAsync, meta) {
  const environment = {
    schema,
    baseId,
    schemaPath: undefined,
    localRefs: undefined,
    meta: meta === true,
    $async: isAsync === true,
    refs: {},
    dynamicAnchors: {},
  };
  environment.root = environment;
  if (rootSchema !== undefined && rootSchema !== schema) {
    const root = {
      schema: rootSchema,
      baseId,
      schemaPath: undefined,
      localRefs: undefined,
      meta: meta === true,
      $async: isAsync === true,
      refs: {},
      dynamicAnchors: {},
    };
    root.root = root;
    environment.root = root;
  }
  return environment;
}

// Hands the compiled validator's source to the project's rewrite and evaluates
// the result with ajv's own call contract. Without a rewrite the validator is
// returned untouched, so compilation stays exactly as it was.
function applyCodeProcess(ajv, validate, schemaEnv) {
  const code = ajv.opts.code;
  if (code === undefined || code === null || !code.process) return validate;

  let sourceCode = schemaEnv.$async === true ? ASYNC_SOURCE : SYNC_SOURCE;
  try {
    // Called as ajv calls it, with the code options as the receiver.
    sourceCode = code.process(sourceCode, schemaEnv);
    const makeValidate = new Function("self", "scope", sourceCode);
    return makeValidate(ajv, {validateImpl: validate});
  } catch (error) {
    // ajv reports the source that failed to compile through the project's
    // logger and lets the original error reach the caller.
    ajv.logger.error("Error compiling schema, function code:", sourceCode);
    throw error;
  }
}

module.exports = {applyCodeProcess, schemaEnvironment};
