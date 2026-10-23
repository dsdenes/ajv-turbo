// Compile-time checks for the subpath modules ajv publishes as part of its
// package: every runtime helper and reference module that ships a declaration
// must resolve from the replacement's same subpath with the same shape, so a
// project that imports them keeps type-checking unchanged.

import type Ajv from "ajv";
import type {SchemaObject} from "ajv";
import equal from "ajv/dist/runtime/equal";
import {parseJson, parseJsonNumber, parseJsonString} from "ajv/dist/runtime/parseJson";
import quote from "ajv/dist/runtime/quote";
import re2 from "ajv/dist/runtime/re2";
import validTimestamp from "ajv/dist/runtime/timestamp";
import ucs2length from "ajv/dist/runtime/ucs2length";
import uri from "ajv/dist/runtime/uri";
import ValidationError from "ajv/dist/runtime/validation_error";
import addMetaSchema2019 from "ajv/dist/refs/json-schema-2019-09";
import addMetaSchema2020 from "ajv/dist/refs/json-schema-2020-12";
import jtdMetaSchema from "ajv/dist/refs/jtd-schema";

declare const ajv: Ajv;
declare const schema: SchemaObject;

const uriCode: string = uri.code;
const quoteCode: string = quote.code;
const quoted: string = quote("a\nb");
const re2Code: string = re2.code;
const equalCode: string = equal.code;
const timestampResult: boolean = validTimestamp("2020-01-01T00:00:00Z", false);
const length: number = ucs2length("ab");
const parsed: unknown = parseJson("1", 0);
const parsedNumber: number | undefined = parseJsonNumber("1", 0);
const parsedString: string | undefined = parseJsonString('"a"', 0);
const parseMessage: string | undefined = parseJson.message;
const parsePosition: number = parseJson.position;
const numberCode: string = parseJsonNumber.code;
const stringCode: string = parseJsonString.code;

const error = new ValidationError([{message: "invalid"}]);
const errorAjv: true = error.ajv;
const errorValidation: true = error.validation;
const errorMessages: (string | undefined)[] = error.errors.map((e) => e.message);

const jtd: SchemaObject = jtdMetaSchema;
const with2019: Ajv = addMetaSchema2019.call(ajv, true);
const with2020: Ajv = addMetaSchema2020.call(ajv);

void [
  uriCode,
  quoteCode,
  quoted,
  re2Code,
  equalCode,
  timestampResult,
  length,
  parsed,
  parsedNumber,
  parsedString,
  parseMessage,
  parsePosition,
  numberCode,
  stringCode,
  errorAjv,
  errorValidation,
  errorMessages,
  jtd,
  with2019,
  with2020,
  schema,
];
