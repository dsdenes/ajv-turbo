export interface ErrorObject {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
  schema?: unknown;
  parentSchema?: unknown;
  data?: unknown;
}

export interface ValidateSource {
  validateName: string;
  validateCode: string;
  scopeValues: Record<string, unknown>;
}

export interface ValidateFunction<T = unknown> {
  (data: T): boolean;
  errors?: ErrorObject[] | null;
  schema: unknown;
  source?: ValidateSource;
  $async?: false;
}

export interface AsyncValidateFunction<T = unknown> {
  (data: T): Promise<T>;
  errors?: ErrorObject[] | null;
  schema: unknown;
  source?: ValidateSource;
  $async: true;
}

export type AnyValidateFunction<T = unknown> = ValidateFunction<T> | AsyncValidateFunction<T>;

export type FormatValidator =
  | ((data: string) => boolean | Promise<boolean>)
  | ((data: number) => boolean | Promise<boolean>);

export type JSONType = "string" | "number" | "integer" | "boolean" | "null" | "object" | "array";

export interface DataValidationCxt {
  instancePath: string;
  parentData: unknown;
  parentDataProperty: string | number | undefined;
  rootData: unknown;
}

export type KeywordValidate = (
  schema: unknown,
  data: unknown,
  parentSchema?: Record<string, unknown>,
  dataCxt?: DataValidationCxt,
) => boolean | Promise<boolean>;

export type KeywordMacro = (
  schema: unknown,
  parentSchema?: Record<string, unknown>,
  context?: unknown,
) => unknown;

export interface KeywordDefinition {
  keyword?: string | readonly string[];
  type?: JSONType | readonly JSONType[];
  schemaType?: JSONType | readonly JSONType[];
  $data?: boolean;
  validate?: KeywordValidate;
  macro?: KeywordMacro;
  async?: boolean;
  errors?: boolean;
  modifying?: boolean;
  schema?: boolean;
  [key: string]: unknown;
}

export interface FormatDefinition {
  type?: "string" | "number";
  validate: string | RegExp | FormatValidator;
  async?: boolean;
}

export type Format = RegExp | string | FormatValidator | FormatDefinition | true;

export interface Options {
  allErrors?: boolean;
  verbose?: boolean;
  messages?: boolean;
  strict?: boolean | "log";
  strictNumbers?: boolean;
  coerceTypes?: boolean | "array";
  useDefaults?: boolean | "empty";
  removeAdditional?: boolean | "all" | "failing";
  ownProperties?: boolean;
  unicodeRegExp?: boolean;
  validateFormats?: boolean;
  formats?: Record<string, Format>;
  $data?: boolean;
  [key: string]: unknown;
}

export declare class ValidationError extends Error {
  errors: ErrorObject[];
  ajv: boolean;
  validation: boolean;
}

export declare class MissingRefError extends Error {
  missingRef: string;
  missingSchema: string;
}

/** A code identifier, accepted by the code helpers. */
export declare class Name {
  constructor(name: string);
  toString(): string;
}

/** A code expression, accepted by the code helpers. */
export declare class Code {
  constructor(parts: string | readonly unknown[]);
  toString(): string;
}

/** Builds a code expression from a template, as ajv's `_` does. */
export declare function _(
  strings: TemplateStringsArray | readonly string[],
  ...values: unknown[]
): Code;
export declare function str(
  strings: TemplateStringsArray | readonly string[],
  ...values: unknown[]
): Code;
export declare function stringify(value: unknown): Code;
export declare const nil: Code;

export default class Ajv {
  static ValidationError: typeof ValidationError;
  static MissingRefError: typeof MissingRefError;
  static _: typeof _;
  static str: typeof str;
  static stringify: typeof stringify;
  static nil: typeof nil;
  static Name: typeof Name;
  static default: typeof Ajv;
  static Ajv: typeof Ajv;

  opts: Options;
  errors: ErrorObject[] | null;
  schemas: Record<string, unknown>;
  formats: Record<string, Format>;

  constructor(opts?: Options);

  compile<T = unknown>(schema: {$async: true; [key: string]: unknown}): AsyncValidateFunction<T>;
  compile<T = unknown>(schema: unknown): ValidateFunction<T>;
  validate(schema: unknown, data: unknown): boolean | Promise<unknown>;
  compileAsync<T = unknown>(schema: {$async: true; [key: string]: unknown}): Promise<AsyncValidateFunction<T>>;
  compileAsync<T = unknown>(schema: unknown): Promise<ValidateFunction<T>>;
  addSchema(schema: unknown, key?: string): this;
  getSchema<T = unknown>(ref: string): AnyValidateFunction<T> | undefined;
  removeSchema(ref?: string | RegExp): this;
  validateSchema(schema: unknown, throwOrLogError?: boolean): boolean | Promise<unknown>;
  addKeyword(keyword: string, definition?: KeywordDefinition): this;
  addKeyword(definition: KeywordDefinition): this;
  removeKeyword(keyword: string): this;
  addFormat(name: string, format: Format): this;
  addVocabulary(vocabulary: readonly unknown[]): this;
  addMetaSchema(schema: unknown, key?: string, validate?: boolean): this;
  errorsText(
    errors?: ErrorObject[] | null,
    options?: {separator?: string; dataVar?: string},
  ): string;
}

export {Ajv};
