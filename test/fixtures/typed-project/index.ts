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
  }

  for (const result of results) console.log(JSON.stringify(result));
}

void run();
