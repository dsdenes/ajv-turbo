export interface ErrorObject {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}

export type ValidateFunction = ((data: unknown) => boolean) & {
  errors?: ErrorObject[] | null;
  schema: unknown;
};

export interface Options {
  allErrors?: boolean;
  strict?: boolean | "log";
  strictNumbers?: boolean;
  coerceTypes?: boolean | "array";
  useDefaults?: boolean | "empty";
  removeAdditional?: boolean | "all" | "failing";
  ownProperties?: boolean;
  unicodeRegExp?: boolean;
  validateFormats?: boolean;
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

export default class Ajv {
  static ValidationError: typeof ValidationError;
  static MissingRefError: typeof MissingRefError;
  static default: typeof Ajv;
  static Ajv: typeof Ajv;

  opts: Options;
  errors: ErrorObject[] | null;
  schemas: Record<string, unknown>;

  constructor(opts?: Options);

  compile<T = unknown>(schema: unknown): ValidateFunction;
  validate(schema: unknown, data: unknown): boolean;
  compileAsync<T = unknown>(schema: unknown): Promise<ValidateFunction>;
  addSchema(schema: unknown, key?: string): this;
  getSchema(ref: string): ValidateFunction | undefined;
  removeSchema(ref?: string | RegExp): this;
  validateSchema(schema: unknown, throwOrLogError?: boolean): boolean | Promise<unknown>;
  addKeyword(keyword: string | Record<string, unknown>, definition?: unknown): this;
  removeKeyword(keyword: string): this;
  addFormat(name: string, format: unknown): this;
  addVocabulary(vocabulary: readonly unknown[]): this;
  addMetaSchema(schema: unknown, key?: string, validate?: boolean): this;
  errorsText(errors?: ErrorObject[] | null, options?: {separator?: string; dataVar?: string}): string;
}
