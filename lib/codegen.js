"use strict";

// The small part of ajv's code-generation surface a project needs to name the
// code a standalone validator resolves at run time, chiefly `code.formats`.
// ajv exports these helpers from its package root; a project that passes
// `_`require("./formats")`` to the constructor must run unchanged here, so the
// same names produce the same source expression.

function quote(value) {
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function interpolate(value) {
  if (value instanceof Code || value instanceof Name) return value.toString();
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  if (Array.isArray(value)) return quote(value.join(","));
  return quote(value);
}

class Name {
  constructor(name) {
    this.name = name;
  }

  toString() {
    return this.name;
  }
}

// A code expression: `text` pieces are source, `{value}` items are the values
// interpolated into it.
class Code {
  constructor(text) {
    this.items = typeof text === "string" ? [text] : text;
  }

  toString() {
    let source = "";
    for (const item of this.items) {
      if (typeof item === "string") source += item;
      else source += interpolate(item.value);
    }
    return source;
  }
}

// Tagged template: `_`require("./formats")`` and `_`${name}[${index}]``.
function _(strings, ...values) {
  if (!Array.isArray(strings)) return new Code(String(strings));
  const items = [strings[0]];
  for (let index = 0; index < values.length; index++) {
    items.push({value: values[index]}, strings[index + 1]);
  }
  return new Code(items);
}

// Tagged template: builds a string expression, as ajv's `str` does.
function str(strings, ...values) {
  let text = "(" + quote(strings[0]);
  for (let index = 0; index < values.length; index++) {
    text += " + " + interpolate(values[index]) + " + " + quote(strings[index + 1]);
  }
  return new Code(text + ")");
}

function stringify(value) {
  return new Code(quote(value));
}

const nil = new Code("");

// ajv's `getProperty`: the member expression that reads `key` from an object,
// a dot when the name is an identifier and brackets otherwise.
const IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;

function getProperty(key) {
  return IDENTIFIER.test(key) ? new Code("." + key) : new Code("[" + quote(key) + "]");
}

function par(value) {
  return value instanceof Name ? value.toString() : "(" + interpolate(value) + ")";
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
  const l = interpolate(left);
  const r = interpolate(right);
  if (l === '""' || l === "") return new Code(r);
  if (r === '""' || r === "") return new Code(l);
  return new Code("(" + l + " + " + r + ")");
}

// The operator expressions ajv exposes for keyword code.
const operators = {
  GT: new Code(">"),
  GTE: new Code(">="),
  LT: new Code("<"),
  LTE: new Code("<="),
  EQ: new Code("==="),
  NEQ: new Code("!=="),
  NOT: new Code("!"),
  OR: new Code("||"),
  AND: new Code("&&"),
  ADD: new Code("+"),
};

module.exports = {
  _,
  str,
  strConcat,
  stringify,
  nil,
  getProperty,
  operators,
  not,
  and,
  or,
  Name,
  Code,
};
