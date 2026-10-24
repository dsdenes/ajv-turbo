"use strict";

// The error-reporting helper ajv publishes at `ajv/dist/compile/errors` for
// keyword extensions. A keyword's generated program normally reports through
// the `__report` runtime callback this package supplies; an extension written
// against ajv's internals instead pushes the error object into the shared
// `vErrors` array itself. Both reach the same array: a code keyword's program
// receives the validator's accumulated errors as `vErrors`, and the caller
// folds a reassigned array back into the validation state.

const {_, str, strConcat, Name, _Code} = require("./codegen-code");
const N = require("./compile-names").default;

const E = {
  keyword: new Name("keyword"),
  schemaPath: new Name("schemaPath"),
  params: new Name("params"),
  propertyName: new Name("propertyName"),
  message: new Name("message"),
  schema: new Name("schema"),
  parentSchema: new Name("parentSchema"),
};

const keywordError = {
  message: ({keyword}) => str`must pass "${keyword}" keyword validation`,
};

const keyword$DataError = {
  message: ({keyword, schemaType}) =>
    schemaType
      ? str`"${keyword}" keyword must be ${schemaType} ($data)`
      : str`"${keyword}" keyword is invalid ($data)`,
};

function reportError(cxt, error = keywordError, errorPaths) {
  const {gen, it} = cxt;
  const allErrors = it.compositeRule || it.allErrors;
  if (allErrors) {
    addError(gen, errorObjectCode(cxt, error, errorPaths));
    return;
  }
  // Default reporting ends the keyword's program with its single entry; the
  // runtime callback builds the entry the same way the shared array does.
  const params = typeof error.params === "function" ? error.params(cxt) : error.params || _`{}`;
  const message =
    it.opts.messages === false
      ? _`undefined`
      : typeof error.message === "function"
        ? error.message(cxt)
        : error.message;
  const outcome = gen.const(
    "reportOutcome",
    _`__report(${cxt.data}, ${params}, ${message}, false)`,
  );
  gen.if(_`${outcome}`, () => gen.return(outcome));
}

function errorObjectCode(cxt, error, errorPaths) {
  if (cxt.it.createErrors === false) return _`{}`;
  return errorObject(cxt, error, errorPaths);
}

function errorObject(cxt, error, errorPaths = {}) {
  const {gen, it} = cxt;
  const keyValues = [errorInstancePath(it, errorPaths), errorSchemaPath(cxt, errorPaths)];
  extraErrorProps(cxt, error, keyValues);
  return gen.object(...keyValues);
}

function errorInstancePath(it, errorPaths) {
  const instPath =
    errorPaths.instancePath !== undefined
      ? str`${it.errorPath}${errorPaths.instancePath}`
      : it.errorPath;
  return [N.instancePath, strConcat(N.instancePath, instPath)];
}

function errorSchemaPath(cxt, errorPaths) {
  const {it} = cxt;
  let schemaPath = errorPaths.parentSchema
    ? new _Code(it.errSchemaPath)
    : str`${it.errSchemaPath}/${cxt.keyword}`;
  if (errorPaths.schemaPath !== undefined) {
    schemaPath = str`${schemaPath}${errorPaths.schemaPath}`;
  }
  return [E.schemaPath, schemaPath];
}

function extraErrorProps(cxt, {params, message}, keyValues) {
  const {it} = cxt;
  keyValues.push(
    [E.keyword, cxt.keyword],
    [E.params, typeof params === "function" ? params(cxt) : params || _`{}`],
  );
  if (it.opts.messages !== false) {
    keyValues.push([E.message, typeof message === "function" ? message(cxt) : message]);
  }
  if (it.opts.verbose) {
    keyValues.push(
      [E.schema, cxt.schemaValue],
      [E.parentSchema, _`${it.topSchemaRef}${it.schemaPath}`],
      [N.data, cxt.data],
    );
  }
  if (it.propertyName !== undefined) keyValues.push([E.propertyName, it.propertyName]);
}

function addError(gen, errorObjectCodeValue) {
  const err = gen.const("err", errorObjectCodeValue);
  gen.if(
    _`${N.vErrors} === null`,
    () => gen.assign(N.vErrors, _`[${err}]`),
    _`${N.vErrors}.push(${err})`,
  );
  gen.code(_`${N.errors}++`);
}

exports.keywordError = keywordError;
exports.keyword$DataError = keyword$DataError;
exports.reportError = reportError;
