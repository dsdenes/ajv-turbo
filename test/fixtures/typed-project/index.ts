// An unchanged TypeScript project: it annotates its schemas with ajv's
// published schema types and imports everything from the package name. The
// test installs the replacement under that name for its type check and for one
// of its two runs, without editing this file.

import Ajv, {
  ErrorObject,
  Format,
  JSONSchemaType,
  KeywordDefinition,
  Options,
  ValidateFunction,
} from "ajv";
import equalImport from "ajv/dist/runtime/equal";
import {parseJson, parseJsonNumber, parseJsonString} from "ajv/dist/runtime/parseJson";
import quote from "ajv/dist/runtime/quote";
import validTimestamp from "ajv/dist/runtime/timestamp";
import ucs2length from "ajv/dist/runtime/ucs2length";
import uri from "ajv/dist/runtime/uri";
import ValidationError from "ajv/dist/runtime/validation_error";

// ajv's `equal` declaration is not callable under default-import interop, so a
// project that calls it casts the imported value. The cast is type-only: the
// call still exercises whatever the package's default export yields at run time.
const equal = equalImport as unknown as (a: unknown, b: unknown) => boolean;

declare const console: {log(...values: unknown[]): void};

interface LineItem {
  sku: string;
  quantity: number;
}

interface Order {
  orderId: number;
  customer: string;
  notes?: string;
  items: LineItem[];
}

const orderSchema: JSONSchemaType<Order> = {
  type: "object",
  properties: {
    orderId: {type: "number"},
    customer: {type: "string", format: "order-code"},
    notes: {type: "string", nullable: true},
    items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          sku: {type: "string", minLength: 1},
          quantity: {type: "number", even: true},
        },
        required: ["sku", "quantity"],
        additionalProperties: false,
      },
    },
  },
  required: ["orderId", "customer", "items"],
  additionalProperties: false,
};

const options: Options = {allErrors: true, strict: true};
const ajv = new Ajv(options);

const orderCodeFormat: Format = /^[A-Z]{2}-\d{3}$/;
ajv.addFormat("order-code", orderCodeFormat);

const evenKeyword: KeywordDefinition = {
  keyword: "even",
  schemaType: "boolean",
  validate: (_schema: unknown, data: unknown): boolean =>
    typeof data !== "number" || data % 2 === 0,
};
ajv.addKeyword(evenKeyword);

const validateOrder: ValidateFunction<Order> = ajv.compile(orderSchema);

const validOrderJson =
  '{"orderId":7,"customer":"AB-123","notes":"leave at door",' +
  '"items":[{"sku":"widget","quantity":2}]}';
const invalidOrderJson =
  '{"orderId":"seven","customer":"lowercase",' +
  '"items":[{"sku":"","quantity":3}]}';

const results: unknown[] = [];

function record(name: string, valid: boolean, errors: Partial<ErrorObject>[] | null | undefined): void {
  results.push({name, valid, errors: errors ?? null});
}

function validationErrors(error: unknown): Partial<ErrorObject>[] | null {
  if (error instanceof Ajv.ValidationError) return error.errors;
  return null;
}

const asyncSchema = {
  $async: true,
  type: "object",
  properties: {value: {type: "number"}},
  required: ["value"],
} as const;
const validateAsync = ajv.compile(asyncSchema);

async function run(): Promise<void> {
  const validOrder: unknown = JSON.parse(validOrderJson);
  const invalidOrder: unknown = JSON.parse(invalidOrderJson);

  record("order.valid", validateOrder(validOrder), validateOrder.errors);
  record("order.invalid", validateOrder(invalidOrder), validateOrder.errors);

  const narrowed: unknown = JSON.parse(validOrderJson);
  if (ajv.validate<Order>(orderSchema, narrowed)) {
    record("order.narrowed", narrowed.orderId === 7, null);
  } else {
    record("order.narrowed", false, ajv.errors);
  }

  try {
    await validateAsync(JSON.parse('{"value":3}'));
    record("async.valid", true, null);
  } catch (error) {
    record("async.valid", false, validationErrors(error));
  }

  try {
    await validateAsync(JSON.parse('{"value":"three"}'));
    record("async.invalid", true, null);
  } catch (error) {
    record("async.invalid", false, validationErrors(error));
    results.push({
      name: "runtime.validation-error",
      recognised: error instanceof ValidationError,
      error: error instanceof Error,
      validation: (error as ValidationError).validation,
      ajv: (error as ValidationError).ajv,
      message: (error as Error).message,
    });
  }

  results.push(
    {name: "runtime.equal.match", value: equal({a: [1, {b: 2}]}, {a: [1, {b: 2}]})},
    {name: "runtime.equal.mismatch", value: equal({a: 1}, {a: 2})},
    {name: "runtime.ucs2length.ascii", value: ucs2length("abc")},
    {name: "runtime.ucs2length.astral", value: ucs2length("a😀")},
    {name: "runtime.timestamp.valid", value: validTimestamp("2020-01-01T00:00:00Z", false)},
    {name: "runtime.timestamp.invalid", value: validTimestamp("2020-13-01T00:00:00Z", false)},
    {name: "runtime.quote", value: quote('a\n"b"')},
    {name: "runtime.uri", value: uri.normalize("HTTP://EXAMPLE.com/a/../b")},
    {name: "runtime.parse-json", value: parseJson('{"a":1}', 0)},
    {name: "runtime.parse-json-number", value: parseJsonNumber("1.5", 0)},
    {name: "runtime.parse-json-string", value: parseJsonString('"a"', 0)},
  );

  for (const result of results) console.log(JSON.stringify(result));
}

void run();
