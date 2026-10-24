"use strict";

// The helpers ajv publishes at `ajv/dist/compile/validate` for keyword
// extensions. Only `getData` is needed by the extensions this package runs
// unchanged: it turns the JSON pointer of a `${...}` message interpolation
// into an expression reading the validated document.

const {_, Name, getProperty} = require("./codegen-code");

const JSON_POINTER = /^(?:\/(?:[^~/]|~0|~1)*)*$/;
const RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;

function unescapeJsonPointerSegment(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * The expression that reads the document location named by `$data` while a
 * keyword's program runs. An absolute pointer starts at `rootData`; a relative
 * one climbs `dataLevel` levels through the data names and parent/instance
 * arrays the compiler tracks. Both forms fail at compile time, as ajv does,
 * when they cannot name a location.
 */
function getData($data, {dataLevel, dataNames, dataPathArr}) {
  let jsonPointer;
  let data;
  if ($data === "") return new Name("rootData");
  if ($data[0] === "/") {
    if (!JSON_POINTER.test($data)) throw new Error(`Invalid JSON-pointer: ${$data}`);
    jsonPointer = $data;
    data = new Name("rootData");
  } else {
    const matches = RELATIVE_JSON_POINTER.exec($data);
    if (!matches) throw new Error(`Invalid JSON-pointer: ${$data}`);
    const up = +matches[1];
    jsonPointer = matches[2];
    if (jsonPointer === "#") {
      if (up >= dataLevel) throw new Error(errorMsg("property/index", up));
      return dataPathArr[dataLevel - up];
    }
    if (up > dataLevel) throw new Error(errorMsg("data", up));
    data = dataNames[dataLevel - up];
    if (!jsonPointer) return data;
  }
  let expr = data;
  for (const segment of jsonPointer.split("/")) {
    if (!segment) continue;
    data = _`${data}${getProperty(unescapeJsonPointerSegment(segment))}`;
    expr = _`${expr} && ${data}`;
  }
  return expr;

  function errorMsg(pointerType, up) {
    return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
  }
}

exports.getData = getData;
