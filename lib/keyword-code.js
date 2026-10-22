"use strict";

// Support for custom keywords defined with ajv's `code` function: the
// definition contributes generated validation code instead of a rule function.
// ajv compiles such a keyword by handing the definition's `code` function a
// KeywordCxt, which builds JavaScript through a small code generator. This
// module provides the same compile-time surface and turns the generated
// program into a function the interpreter calls at validation time.

const {Code, Name, nil} = require("./codegen");
const {isObject, isDataReference, checkDataTypes} = require("./util");
const {escapePointerToken} = require("./uri");

const IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;

// The runtime variables the generated program may use. They are also reserved
// so a generated name never shadows one of them.
const RUNTIME_NAMES = [
  "data",
  "schema",
  "parentData",
  "parentDataProperty",
  "rootData",
  "parentSchema",
  "__rootSchema",
  "__report",
  "__scope",
  "__errors",
];

function sourceOf(value) {
  if (value instanceof Code || value instanceof Name) return value.toString();
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  return String(value);
}

// A value interpolated into a code expression. Code and Name objects are
// source; everything else is a JavaScript literal.
function literalOf(value) {
  if (value instanceof Code || value instanceof Name) return value.toString();
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  return JSON.stringify(value);
}

// An object literal whose values may be code expressions, as ajv builds for a
// keyword's error params.
function objectLiteral(value) {
  if (value instanceof Code || value instanceof Name) return value.toString();
  if (Array.isArray(value)) return "[" + value.map(objectLiteral).join(",") + "]";
  if (isObject(value)) {
    const parts = Object.keys(value).map(
      (key) => JSON.stringify(key) + ":" + objectLiteral(value[key]),
    );
    return "{" + parts.join(",") + "}";
  }
  return literalOf(value);
}

// The small code generator ajv's KeywordCxt exposes. Statements are collected
// as source lines; `if` and loop bodies open a block that later statements
// join until the block closes. ajv leaves a non-`allErrors` failure's else
// branch open, so the generator also closes every open block at the end.
class CodeGen {
  constructor(opts = {}) {
    this.opts = opts;
    this._buffers = [[]];
    this._stack = [];
    this._reserved = new Set(RUNTIME_NAMES);
    this._nameIndex = 0;
    this._scope = Object.create(null);
    this._scopeValues = new Map();
  }

  get scope() {
    return this._scope;
  }

  emit(text) {
    this._buffers[this._buffers.length - 1].push(text);
    return this;
  }

  source() {
    return this._buffers[0].join("\n");
  }

  _open(header) {
    this.emit(header + " {");
    this._buffers.push([]);
    this._stack.push(header);
    return this;
  }

  _flush() {
    const buffer = this._buffers.pop();
    for (const line of buffer) this.emit(line);
  }

  _close() {
    this._flush();
    this.emit("}");
    this._stack.pop();
    return this;
  }

  endAll() {
    while (this._stack.length > 0) this._close();
    return this.source();
  }

  name(prefix) {
    const base = typeof prefix === "string" && IDENTIFIER.test(prefix) ? prefix : "v";
    let name;
    do {
      name = base + this._nameIndex++;
    } while (this._reserved.has(name) || this._scope[name] !== undefined);
    return new Name(name);
  }

  _toName(nameOrPrefix) {
    return nameOrPrefix instanceof Name ? nameOrPrefix : this.name(nameOrPrefix);
  }

  _def(kind, nameOrPrefix, rhs) {
    const name = this._toName(nameOrPrefix);
    this.emit(`${kind} ${name}${rhs === undefined ? "" : " = " + literalOf(rhs)};`);
    return name;
  }

  const(nameOrPrefix, rhs) {
    return this._def("const", nameOrPrefix, rhs);
  }

  let(nameOrPrefix, rhs) {
    return this._def("let", nameOrPrefix, rhs);
  }

  var(nameOrPrefix, rhs) {
    return this._def("var", nameOrPrefix, rhs);
  }

  assign(lhs, rhs) {
    this.emit(`${sourceOf(lhs)} = ${literalOf(rhs)};`);
    return this;
  }

  add(lhs, rhs) {
    this.emit(`${sourceOf(lhs)} += ${literalOf(rhs)};`);
    return this;
  }

  code(value) {
    if (typeof value === "function") {
      value();
      return this;
    }
    if (value === undefined || value === nil) return this;
    this.emit(sourceOf(value) + ";");
    return this;
  }

  object(...keyValues) {
    const parts = [];
    for (const [key, value] of keyValues) {
      const keySource =
        key instanceof Code || key instanceof Name ? key.toString() : JSON.stringify(key);
      parts.push(key === value ? keySource : keySource + ":" + literalOf(value));
    }
    return new Code("{" + parts.join(",") + "}");
  }

  ternary(condition, ifTrue, ifFalse) {
    return new Code(
      "(" + sourceOf(condition) + " ? " + sourceOf(ifTrue) + " : " + sourceOf(ifFalse) + ")",
    );
  }

  if(condition, thenBody, elseBody) {
    this._open("if (" + sourceOf(condition) + ")");
    if (thenBody && elseBody) {
      this.code(thenBody);
      this.else();
      this.code(elseBody);
      this.endIf();
    } else if (thenBody) {
      this.code(thenBody);
      this.endIf();
    } else if (elseBody) {
      throw new Error('CodeGen: "else" body without "then" body');
    }
    return this;
  }

  elseIf(condition) {
    this._flush();
    this.emit("} else if (" + sourceOf(condition) + ") {");
    this._buffers.push([]);
    return this;
  }

  else() {
    this._flush();
    this.emit("} else {");
    this._buffers.push([]);
    return this;
  }

  endIf() {
    return this._close();
  }

  forOf(nameOrPrefix, iterable, forBody, varKind) {
    const name = this._toName(nameOrPrefix);
    this._open(`for (${varKind || "const"} ${name} of ${sourceOf(iterable)})`);
    if (forBody) {
      if (typeof forBody === "function") forBody(name);
      else this.code(forBody);
    }
    return this._close();
  }

  forIn(nameOrPrefix, object, forBody, varKind) {
    if (this.opts.ownProperties === true) {
      return this.forOf(nameOrPrefix, new Code(`Object.keys(${sourceOf(object)})`), forBody);
    }
    const name = this._toName(nameOrPrefix);
    this._open(`for (${varKind || "const"} ${name} in ${sourceOf(object)})`);
    if (forBody) {
      if (typeof forBody === "function") forBody(name);
      else this.code(forBody);
    }
    return this._close();
  }

  forRange(nameOrPrefix, from, to, forBody, varKind) {
    const name = this._toName(nameOrPrefix);
    const kind = varKind || "let";
    this._open(
      `for (${kind} ${name} = ${sourceOf(from)}; ${name} < ${sourceOf(to)}; ${name}++)`,
    );
    if (forBody) forBody(name);
    return this._close();
  }

  endFor() {
    return this._close();
  }

  break(label) {
    this.emit("break" + (label === undefined ? "" : " " + label) + ";");
    return this;
  }

  continue(label) {
    this.emit("continue" + (label === undefined ? "" : " " + label) + ";");
    return this;
  }

  return(value) {
    this.emit("return" + (value === undefined ? "" : " " + sourceOf(value)) + ";");
    return this;
  }

  throw(value) {
    this.emit("throw " + sourceOf(value) + ";");
    return this;
  }

  try(tryBody, catchCode, finallyCode) {
    this._open("try");
    this.code(tryBody);
    this._flush();
    this.emit("} catch (__e) {");
    this._buffers.push([]);
    if (catchCode) catchCode(new Name("__e"));
    else this.emit("throw __e;");
    if (finallyCode) {
      this._flush();
      this.emit("} finally {");
      this._buffers.push([]);
      this.code(finallyCode);
    }
    return this._close();
  }

  block(body) {
    const depth = this._stack.length;
    if (body) this.code(body);
    while (this._stack.length > depth) this._close();
    return this;
  }

  endBlock() {
    return this;
  }

  label(label) {
    this.emit(label + ":");
    return this;
  }

  scopeValue(prefixOrName, value) {
    const ref = value === undefined ? undefined : value.ref;
    const key = value === undefined ? undefined : value.key;
    const cacheKey = key !== undefined ? key : ref;
    if (cacheKey !== undefined && this._scopeValues.has(cacheKey)) {
      return this._scopeValues.get(cacheKey);
    }
    const index = Object.keys(this._scope).length;
    const name = new Name("__scope.v" + index);
    this._scope["v" + index] = ref !== undefined ? ref : value;
    if (cacheKey !== undefined) this._scopeValues.set(cacheKey, name);
    return name;
  }

  getScopeValue(prefix, keyOrRef) {
    return this._scopeValues.get(keyOrRef);
  }

  scopeRefs() {
    return nil;
  }
}

function par(value) {
  return value instanceof Name ? value.toString() : "(" + sourceOf(value) + ")";
}

function not(condition) {
  if (typeof condition === "boolean" || typeof condition === "number" || condition === null) {
    return !condition;
  }
  return new Code("!" + par(condition));
}

function isEmptyCode(value) {
  return value === nil || (value instanceof Code && value.toString() === "");
}

function and(...conditions) {
  const parts = conditions.filter((condition) => !isEmptyCode(condition));
  if (parts.length === 0) return nil;
  return new Code(parts.map((condition) => par(condition)).join(" && "));
}

function or(...conditions) {
  const parts = conditions.filter((condition) => !isEmptyCode(condition));
  if (parts.length === 0) return nil;
  return new Code(parts.map((condition) => par(condition)).join(" || "));
}

function strConcat(left, right) {
  const l = sourceOf(left);
  const r = sourceOf(right);
  if (l === '""' || l === "") return new Code(r);
  if (r === '""' || r === "") return new Code(l);
  return new Code("(" + l + " + " + r + ")");
}

function validSchemaType(schema, schemaTypes, allowUndefined = false) {
  if (schemaTypes.length === 0) return true;
  return schemaTypes.some((type) => {
    if (type === "array") return Array.isArray(schema);
    if (type === "object") return isObject(schema) && !Array.isArray(schema);
    return typeof schema === type || (allowUndefined && typeof schema === "undefined");
  });
}

const keywordError = {
  message: ({keyword}) => `must pass "${keyword}" keyword validation`,
};

function keywordDataError(keyword, schemaTypes) {
  return schemaTypes.length
    ? `"${keyword}" keyword must be ${schemaTypes.join(",")} ($data)`
    : `"${keyword}" keyword is invalid ($data)`;
}

function messageCode(errorDefinition, cxt, fallback) {
  if (errorDefinition === undefined || errorDefinition.message === undefined) {
    return literalOf(fallback);
  }
  const message =
    typeof errorDefinition.message === "function"
      ? errorDefinition.message(cxt)
      : errorDefinition.message;
  return message === undefined ? literalOf(fallback) : literalOf(message);
}

function paramsCode(errorDefinition, cxt) {
  if (errorDefinition === undefined || errorDefinition.params === undefined) return "{}";
  const params =
    typeof errorDefinition.params === "function" ? errorDefinition.params(cxt) : errorDefinition.params;
  return params === undefined ? "{}" : objectLiteral(params);
}

class KeywordCxt {
  constructor(options) {
    const {
      gen,
      keyword,
      def,
      entry,
      node,
      value,
      opts,
      self,
      errSchemaPath,
      baseId,
      root,
      ruleType,
      ValidationError,
      compileContext,
      subschemas,
    } = options;
    this.gen = gen;
    this.allErrors = opts.allErrors === true;
    this.keyword = keyword;
    this.data = new Name("data");
    this.schema = value;
    this.$data = options.dataReference ? options.dataReference : false;
    // For a document-sourced value ajv keeps `schemaValue` pointing at the
    // keyword's schema entry and `schemaCode` at the resolved value.
    this.schemaValue = options.dataReference
      ? new Code(`parentSchema[${JSON.stringify(keyword)}]`)
      : options.schemaCode;
    this.schemaCode = options.schemaCode;
    this.schemaType = entry.schemaTypes;
    this.parentSchema = node;
    this.params = {};
    this.it = {
      gen,
      opts,
      self,
      schema: node,
      root,
      baseId,
      errSchemaPath,
      schemaPath: options.schemaPath,
      dataLevel: options.dataLevel || 0,
      dataNames: [],
      dataPathArr: [],
      errorPath: new Name("instancePath"),
      allErrors: opts.allErrors === true,
      compositeRule: false,
      createErrors: true,
      topSchemaRef: new Name("__rootSchema"),
      schemaEnv: {baseId, root: {schema: root}, $async: false},
      ValidationError,
      definedProperties: new Set(isObject(node.properties) ? Object.keys(node.properties) : []),
      props: undefined,
      items: undefined,
      dataTypes: [],
      propertyName: undefined,
      ruleType,
    };
    this.def = def;
    this.entry = entry;
    this.compileContext = compileContext;
    this.subschemas = subschemas;
    // ajv only tracks the error count for a code keyword that asks for it.
    this.errsCount = def !== undefined && def.trackErrors === true ? 0 : undefined;
  }

  result(condition, successAction, failAction) {
    this.failResult(not(condition), successAction, failAction);
  }

  failResult(condition, successAction, failAction) {
    this.gen.if(sourceOf(condition));
    if (failAction) failAction();
    else this.error();
    if (successAction) {
      this.gen.else();
      successAction();
      if (this.allErrors) this.gen.endIf();
    } else if (this.allErrors) {
      this.gen.endIf();
    } else {
      this.gen.else();
    }
  }

  pass(condition, failAction) {
    this.failResult(not(condition), undefined, failAction);
  }

  fail(condition) {
    if (condition === undefined) {
      this.error();
      if (!this.allErrors) this.gen.if(false);
      return;
    }
    this.gen.if(sourceOf(condition));
    this.error();
    if (this.allErrors) this.gen.endIf();
    else this.gen.else();
  }

  fail$data(condition) {
    if (!this.$data) return this.fail(condition);
    this.fail(
      new Code(
        `${sourceOf(this.schemaCode)} !== undefined && (${sourceOf(or(this.invalid$data(), condition))})`,
      ),
    );
  }

  error(append, errorParams, errorPaths) {
    if (errorParams) {
      this.setParams(errorParams);
      this._error(append, errorPaths);
      this.setParams({});
      return;
    }
    this._error(append, errorPaths);
  }

  _error(append, errorPaths) {
    const definition = this.def === undefined ? undefined : this.def.error;
    this._report(definition, append, errorPaths);
  }

  $dataError() {
    const definition = this.def === undefined ? undefined : this.def.$dataError;
    this._report(
      definition || {
        message: () => keywordDataError(this.keyword, this.schemaType),
      },
      false,
      undefined,
    );
  }

  _report(definition, append, errorPaths) {
    const message =
      this.it.opts.messages === false
        ? "undefined"
        : messageCode(definition, this, keywordError.message(this));
    const params = paramsCode(definition, this);
    const instancePath =
      errorPaths !== undefined && errorPaths.instancePath !== undefined
        ? sourceOf(errorPaths.instancePath)
        : "undefined";
    const schemaPath =
      errorPaths !== undefined && errorPaths.schemaPath !== undefined
        ? sourceOf(errorPaths.schemaPath)
        : "undefined";
    const parentSchema =
      errorPaths !== undefined && errorPaths.parentSchema === true ? "true" : "false";
    this.gen.emit(
      `if (__report(data, ${params}, ${message}, ${append === true}, ${instancePath}, ${schemaPath}, ${parentSchema})) return __errors;`,
    );
  }

  reset() {
    if (this.errsCount === undefined) {
      throw new Error('add "trackErrors" to keyword definition');
    }
    this.gen.emit("__errors.length = 0;");
  }

  ok(condition) {
    if (!this.allErrors) this.gen.if(sourceOf(condition));
  }

  setParams(object, assign) {
    if (assign) Object.assign(this.params, object);
    else this.params = object;
  }

  block$data(valid, codeBlock, $dataValid) {
    this.gen.block(() => {
      this.check$data(valid, $dataValid);
      codeBlock();
    });
  }

  check$data(valid = nil, $dataValid = nil) {
    if (!this.$data) return;
    const schema = sourceOf(this.schemaCode);
    this.gen.if(or(new Code(`${schema} === undefined`), $dataValid));
    if (valid !== nil) this.gen.assign(valid, true);
    if (this.schemaType.length > 0 || this.entry.validateSchema !== undefined) {
      this.gen.elseIf(this.invalid$data());
      this.$dataError();
      if (valid !== nil) this.gen.assign(valid, false);
    }
    this.gen.else();
  }

  invalid$data() {
    const checks = [];
    if (this.schemaType.length > 0) {
      const types = this.schemaType;
      const strictNumbers = this.it.opts.strictNumbers;
      const name = this.gen.scopeValue("invalid$dataType", {
        ref: (value) => !checkDataTypes(types, value, strictNumbers),
      });
      checks.push(new Code(`${name}(${sourceOf(this.schemaCode)})`));
    }
    if (this.entry.validateSchema !== undefined) {
      const name = this.gen.scopeValue("validate$data", {ref: this.entry.validateSchema});
      checks.push(new Code(`!${name}(${sourceOf(this.schemaCode)})`));
    }
    if (checks.length === 0) return nil;
    return checks.length === 1 ? checks[0] : or(...checks);
  }

  // Compiles a subschema at the keyword's location and assigns its verdict to
  // `valid`, the way ajv's own applicator keywords validate a child schema.
  subschema(appl, valid) {
    if (appl.keyword !== undefined && appl.schema !== undefined) {
      throw new Error('both "keyword" and "schema" passed, only one allowed');
    }
    if (appl.data !== undefined && appl.dataProp !== undefined) {
      throw new Error('both "data" and "dataProp" passed, only one allowed');
    }
    let schema;
    let errSchemaPath;
    if (appl.keyword !== undefined) {
      schema = this.parentSchema[appl.keyword];
      if (appl.schemaProp !== undefined) {
        schema = schema[appl.schemaProp];
        errSchemaPath =
          `${this.it.errSchemaPath}/${appl.keyword}/` +
          encodeURIComponent(escapePointerToken(appl.schemaProp));
      } else {
        errSchemaPath = `${this.it.errSchemaPath}/${appl.keyword}`;
      }
    } else if (appl.schema !== undefined) {
      if (
        appl.schemaPath === undefined ||
        appl.errSchemaPath === undefined ||
        appl.topSchemaRef === undefined
      ) {
        throw new Error(
          '"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"',
        );
      }
      schema = appl.schema;
      errSchemaPath = appl.errSchemaPath;
    } else {
      throw new Error('either "keyword" or "schema" must be passed');
    }
    const compositeRule =
      appl.compositeRule !== undefined ? appl.compositeRule : this.it.compositeRule === true;
    const plan = {
      schema,
      context: this.compileContext,
      schemaPath: errSchemaPath,
      compositeRule,
    };
    const index = this.subschemas.length;
    this.subschemas.push(plan);
    if (isObject(schema)) {
      this.compileContext.visit(schema, this.it.baseId, "", false);
      this.compileContext.prepare(schema);
    }
    let data;
    let instanceSuffix = "undefined";
    if (appl.data !== undefined) {
      data = appl.data;
    } else if (appl.dataProp !== undefined) {
      data = new Code(`${sourceOf(this.data)}[${sourceOf(appl.dataProp)}]`);
      instanceSuffix = sourceOf(appl.dataProp);
    } else {
      data = this.data;
    }
    const propertyName =
      appl.propertyName === undefined ? "undefined" : sourceOf(appl.propertyName);
    const call = new Code(
      `__subschema(${index}, ${sourceOf(data)}, ${propertyName}, ${instanceSuffix})`,
    );
    const stop = !this.allErrors && !compositeRule;
    if (valid !== undefined && valid !== nil) {
      this.gen.var(valid, call);
      if (stop) {
        this.gen.if(new Code(`!${sourceOf(valid)}`));
        this.gen.return(new Code("__errors"));
        this.gen.endIf();
      }
    } else if (stop) {
      const result = this.gen.const("subschemaValid", call);
      this.gen.if(new Code(`!${sourceOf(result)}`));
      this.gen.return(new Code("__errors"));
      this.gen.endIf();
    } else {
      this.gen.code(call);
    }
  }

  mergeEvaluated() {}

  mergeValidEvaluated() {
    return false;
  }
}

// Compiles a code keyword use. The definition's `code` function runs now, once
// per schema location, and the program it builds becomes a function the
// interpreter calls with the current document value.
function compileKeywordCode(entry, node, options) {
  const {opts, self, errSchemaPath, baseId, root, ValidationError} = options;
  const value = node[entry.keyword];
  const dataReference =
    entry.$data === true && opts.$data === true && isDataReference(value);
  if (!dataReference && !validSchemaType(value, entry.schemaTypes, entry.allowUndefined === true)) {
    throw new Error(`${entry.keyword} value must be ${JSON.stringify(entry.schemaTypes)}`);
  }
  const gen = new CodeGen(opts);
  const subschemas = [];
  let schemaCode;
  if (dataReference) {
    schemaCode = new Name("schema");
  } else if (typeof value === "number" || typeof value === "boolean") {
    schemaCode = value;
  } else if (typeof value === "string") {
    schemaCode = new Code(JSON.stringify(value));
  } else {
    schemaCode = new Name("schema");
  }
  const cxt = new KeywordCxt({
    gen,
    keyword: entry.keyword,
    def: entry.definition,
    entry,
    node,
    value,
    opts,
    self,
    errSchemaPath,
    baseId,
    root,
    ruleType: entry.types.length === 1 ? entry.types[0] : undefined,
    ValidationError,
    dataReference,
    schemaCode,
    schemaPath: options.schemaPath,
    compileContext: options.compileContext,
    subschemas,
  });
  entry.code.call(self, cxt, cxt.it.ruleType);
  const body = gen.endAll();
  const source = `"use strict";\n${body}\nreturn __errors;`;
  const fn = new Function(
    "data",
    "schema",
    "parentData",
    "parentDataProperty",
    "rootData",
    "parentSchema",
    "__rootSchema",
    "__errors",
    "__report",
    "__scope",
    "__subschema",
    source,
  );
  const scope = gen.scope;
  return {
    subschemas,
    // A definition that declares it folds its subschemas' evaluated names into
    // the enclosing schema; ajv's discriminator is the internal case.
    mergeEvaluated: isObject(entry.definition) && entry.definition.mergeEvaluated === true,
    run(data, schema, parentData, parentDataProperty, rootData, errors, report, subschema) {
      return fn(
        data,
        schema,
        parentData,
        parentDataProperty,
        rootData,
        node,
        root,
        errors,
        report,
        scope,
        subschema,
      );
    },
  };
}

module.exports = {
  compileKeywordCode,
  validSchemaType,
  CodeGen,
  KeywordCxt,
  not,
  and,
  or,
  strConcat,
};
