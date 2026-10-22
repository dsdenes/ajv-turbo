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

export type KeywordCompile = (
  schema: unknown,
  parentSchema?: Record<string, unknown>,
  context?: unknown,
) => KeywordValidate | undefined;

export interface KeywordErrorContext {
  keyword: string;
  schemaType: readonly JSONType[];
  schema: unknown;
  schemaValue?: unknown;
  schemaCode?: unknown;
  parentSchema: Record<string, unknown>;
  data: unknown;
  params: Record<string, unknown>;
}

export interface KeywordErrorDefinition {
  message?: string | ((context: KeywordErrorContext) => string | Code);
  params?:
    | Record<string, unknown>
    | ((context: KeywordErrorContext) => Record<string, unknown> | Code);
}

/** The code generator a code keyword's `gen` property exposes. */
export interface CodeGen {
  const(nameOrPrefix: string | Name, rhs?: unknown): Name;
  let(nameOrPrefix: string | Name, rhs?: unknown): Name;
  var(nameOrPrefix: string | Name, rhs?: unknown): Name;
  assign(lhs: unknown, rhs: unknown): CodeGen;
  add(lhs: unknown, rhs: unknown): CodeGen;
  code(value: unknown): CodeGen;
  if(condition: unknown, thenBody?: () => void, elseBody?: () => void): CodeGen;
  elseIf(condition: unknown): CodeGen;
  else(): CodeGen;
  endIf(): CodeGen;
  forOf(nameOrPrefix: string | Name, iterable: unknown, body: (name: Name) => void, varKind?: unknown): CodeGen;
  forIn(nameOrPrefix: string | Name, object: unknown, body: (name: Name) => void, varKind?: unknown): CodeGen;
  forRange(nameOrPrefix: string | Name, from: unknown, to: unknown, body: (name: Name) => void, varKind?: unknown): CodeGen;
  endFor(): CodeGen;
  break(label?: string): CodeGen;
  continue(label?: string): CodeGen;
  return(value?: unknown): CodeGen;
  throw(value: unknown): CodeGen;
  try(tryBody: () => void, catchCode?: (error: Name) => void, finallyCode?: () => void): CodeGen;
  block(body: () => void): CodeGen;
  name(prefix: string): Name;
  scopeValue(prefixOrName: string | Name, value: {ref?: unknown; key?: unknown; code?: unknown}): Name;
  object(...keyValues: [unknown, unknown][]): Code;
  ternary(condition: unknown, ifTrue: unknown, ifFalse: unknown): Code;
}

/** The compile-time context ajv hands a code keyword's `code` function. */
export interface KeywordCxt {
  gen: CodeGen;
  allErrors: boolean;
  keyword: string;
  data: Name;
  schema: unknown;
  schemaValue: unknown;
  schemaCode: unknown;
  schemaType: readonly JSONType[];
  parentSchema: Record<string, unknown>;
  params: Record<string, unknown>;
  def: KeywordDefinition;
  it: Record<string, unknown>;
  errsCount?: number;
  result(condition: unknown, successAction?: () => void, failAction?: () => void): void;
  failResult(condition: unknown, successAction?: () => void, failAction?: () => void): void;
  pass(condition: unknown, failAction?: () => void): void;
  fail(condition?: unknown): void;
  fail$data(condition?: unknown): void;
  error(append?: boolean, errorParams?: Record<string, unknown>, errorPaths?: unknown): void;
  $dataError(): void;
  reset(): void;
  ok(condition: unknown): void;
  setParams(params: Record<string, unknown>, assign?: boolean): void;
  block$data(valid: unknown, codeBlock: () => void, $dataValid?: unknown): void;
  check$data(valid?: unknown, $dataValid?: unknown): void;
  invalid$data(): unknown;
  subschema(appl: Record<string, unknown>, valid: unknown): unknown;
  mergeEvaluated(schemaCxt: unknown, toName?: unknown): void;
  mergeValidEvaluated(schemaCxt: unknown, valid: unknown): boolean | undefined;
}

/** A keyword whose definition contributes generated validation code. */
export interface CodeKeywordDefinition extends KeywordDefinition {
  code(cxt: KeywordCxt, ruleType?: string): void;
  trackErrors?: boolean;
  allowUndefined?: boolean;
}

export interface KeywordDefinition {
  keyword?: string | readonly string[];
  type?: JSONType | readonly JSONType[];
  schemaType?: JSONType | readonly JSONType[];
  $data?: boolean;
  validate?: KeywordValidate;
  compile?: KeywordCompile;
  macro?: KeywordMacro;
  code?: (cxt: KeywordCxt, ruleType?: string) => void;
  error?: KeywordErrorDefinition;
  trackErrors?: boolean;
  allowUndefined?: boolean;
  metaSchema?: unknown;
  post?: boolean;
  before?: string;
  implements?: readonly string[];
  $dataError?: KeywordErrorDefinition;
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
  keywords?: readonly (KeywordDefinition | string)[] | Record<string, KeywordDefinition>;
  $data?: boolean;
  discriminator?: boolean;
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
  addVocabulary(vocabulary: readonly (KeywordDefinition | string)[]): this;
  addMetaSchema(schema: unknown, key?: string, validate?: boolean): this;
  errorsText(
    errors?: ErrorObject[] | null,
    options?: {separator?: string; dataVar?: string},
  ): string;
}

export {Ajv};
