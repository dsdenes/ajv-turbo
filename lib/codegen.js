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

module.exports = {_, str, stringify, nil, Name, Code};
