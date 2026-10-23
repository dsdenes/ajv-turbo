// The public type surface ajv publishes from its package root. A project that
// annotates schemas, keywords, formats, and options with ajv's types must
// compile against this file unchanged; `dist/2019.d.ts`, `dist/2020.d.ts`, and
// `dist/jtd.d.ts` re-export the same names from their own entry points.

import {CodeGen, Name, _, str, stringify, nil} from "./dist/compile/codegen";
import type {Code, CodeGenOptions, ValueScope} from "./dist/compile/codegen";
import type {JSONSchemaType} from "./dist/types/json-schema";
import type {JTDSchemaType, SomeJTDSchemaType, JTDDataType} from "./dist/types/jtd-schema";

export {CodeGen, Name, _, str, stringify, nil};
export type {Code, CodeGenOptions} from "./dist/compile/codegen";
export type {JSONSchemaType} from "./dist/types/json-schema";

export type JSONType = "string" | "number" | "integer" | "boolean" | "null" | "object" | "array";

interface _SchemaObject {
  id?: string;
  $id?: string;
  $schema?: string;
  [x: string]: any;
}

export interface SchemaObject extends _SchemaObject {
  $async?: false;
}

export interface AsyncSchema extends _SchemaObject {
  $async: true;
}

export type AnySchemaObject = SchemaObject | AsyncSchema;
export type Schema = SchemaObject | boolean;
export type AnySchema = Schema | AsyncSchema;

export type SchemaMap = {
  [Key in string]?: AnySchema;
};

/** Where a compiled validator's source came from, as ajv reports it. */
export interface SourceCode {
  validateName: any;
  validateCode: string;
  scopeValues: Record<string, any>;
  evaluated?: any;
  [key: string]: any;
}

/** The source record exposed on validators this package compiles. */
export interface ValidateSource {
  validateName: string;
  validateCode: string;
  scopeValues: Record<string, unknown>;
}

export interface DataValidationCxt<T extends string | number = string | number> {
  instancePath: string;
  parentData: {
    [K in T]: any;
  };
  parentDataProperty: T;
  rootData: Record<string, any> | any[];
  dynamicAnchors: {
    [Ref in string]?: ValidateFunction;
  };
}

export type EvaluatedProperties = {
  [K in string]?: true;
} | true;

export type EvaluatedItems = number | true;

export interface Evaluated {
  props?: EvaluatedProperties;
  items?: EvaluatedItems;
  dynamicProps: boolean;
  dynamicItems: boolean;
}

export type LocalRefs = {
  [Ref in string]?: AnySchemaObject;
};

export interface SchemaCxt {
  readonly gen: CodeGen;
  readonly allErrors?: boolean;
  readonly data: Name;
  readonly parentData: Name;
  readonly parentDataProperty: Code | number;
  readonly dataNames: Name[];
  readonly dataPathArr: (Code | number)[];
  readonly dataLevel: number;
  dataTypes: JSONType[];
  definedProperties: Set<string>;
  readonly topSchemaRef: Code;
  readonly validateName: Name;
  evaluated?: Name;
  readonly ValidationError?: Name;
  readonly schema: AnySchema;
  readonly schemaEnv: SchemaEnv;
  readonly rootId: string;
  baseId: string;
  readonly schemaPath: Code;
  readonly errSchemaPath: string;
  readonly errorPath: Code;
  readonly propertyName?: Name;
  readonly compositeRule?: boolean;
  props?: EvaluatedProperties | Name;
  items?: EvaluatedItems | Name;
  jtdDiscriminator?: string;
  jtdMetadata?: boolean;
  readonly createErrors?: boolean;
  readonly opts: InstanceOptions;
  readonly self: Ajv;
}

export interface SchemaObjCxt extends SchemaCxt {
  readonly schema: AnySchemaObject;
}

interface SchemaEnvArgs {
  readonly schema: AnySchema;
  readonly schemaId?: "$id" | "id";
  readonly root?: SchemaEnv;
  readonly baseId?: string;
  readonly schemaPath?: string;
  readonly localRefs?: LocalRefs;
  readonly meta?: boolean;
}

export type SchemaRefs = {
  [Ref in string]?: SchemaEnv | AnySchema;
};

/** A schema and the state compiled around it, as validators expose it. */
export declare class SchemaEnv implements SchemaEnvArgs {
  readonly schema: AnySchema;
  readonly schemaId?: "$id" | "id";
  readonly root: SchemaEnv;
  baseId: string;
  schemaPath?: string;
  localRefs?: LocalRefs;
  readonly meta?: boolean;
  readonly $async?: boolean;
  readonly refs: SchemaRefs;
  readonly dynamicAnchors: {
    [Ref in string]?: true;
  };
  validate?: AnyValidateFunction;
  validateName?: any;
  serialize?: (data: unknown) => string;
  serializeName?: any;
  parse?: (data: string) => unknown;
  parseName?: any;
  constructor(env: SchemaEnvArgs);
}

export interface ValidateFunction<T = unknown> {
  (this: Ajv | any, data: any, dataCxt?: DataValidationCxt): data is T;
  errors?: null | ErrorObject[];
  evaluated?: Evaluated;
  schema: AnySchema;
  schemaEnv: SchemaEnv;
  source?: SourceCode;
}

export interface AsyncValidateFunction<T = unknown> extends ValidateFunction<T> {
  (...args: Parameters<ValidateFunction<T>>): Promise<T>;
  $async: true;
}

export type AnyValidateFunction<T = any> = ValidateFunction<T> | AsyncValidateFunction<T>;

export interface ErrorObject<K extends string = string, P = Record<string, any>, S = unknown> {
  keyword: K;
  instancePath: string;
  schemaPath: string;
  params: P;
  propertyName?: string;
  message?: string;
  schema?: S;
  parentSchema?: AnySchemaObject;
  data?: unknown;
}

export type ErrorNoParams<K extends string, S = unknown> = ErrorObject<K, Record<string, never>, S>;

interface _KeywordDef {
  keyword: string | string[];
  type?: JSONType | JSONType[];
  schemaType?: JSONType | JSONType[];
  allowUndefined?: boolean;
  $data?: boolean;
  implements?: string[];
  before?: string;
  post?: boolean;
  metaSchema?: AnySchemaObject;
  validateSchema?: AnyValidateFunction;
  dependencies?: string[];
  error?: KeywordErrorDefinition;
  $dataError?: KeywordErrorDefinition;
}

export interface CodeKeywordDefinition extends _KeywordDef {
  code: (cxt: KeywordCxt, ruleType?: string) => void;
  trackErrors?: boolean;
}

export type MacroKeywordFunc = (schema: any, parentSchema: AnySchemaObject, it: SchemaCxt) => AnySchema;

export type CompileKeywordFunc = (
  schema: any,
  parentSchema: AnySchemaObject,
  it: SchemaObjCxt,
) => DataValidateFunction;

export interface DataValidateFunction {
  (...args: Parameters<ValidateFunction>): boolean | Promise<any>;
  errors?: Partial<ErrorObject>[];
}

export interface SchemaValidateFunction {
  (
    schema: any,
    data: any,
    parentSchema?: AnySchemaObject,
    dataCxt?: DataValidationCxt,
  ): boolean | Promise<any>;
  errors?: Partial<ErrorObject>[];
}

export interface FuncKeywordDefinition extends _KeywordDef {
  validate?: SchemaValidateFunction | DataValidateFunction;
  compile?: CompileKeywordFunc;
  schema?: boolean;
  modifying?: boolean;
  async?: boolean;
  valid?: boolean;
  errors?: boolean | "full";
}

export interface MacroKeywordDefinition extends FuncKeywordDefinition {
  macro: MacroKeywordFunc;
}

export type KeywordDefinition = CodeKeywordDefinition | FuncKeywordDefinition | MacroKeywordDefinition;

export type AddedKeywordDefinition = KeywordDefinition & {
  type: JSONType[];
  schemaType: JSONType[];
};

export interface KeywordErrorDefinition {
  message: string | Code | ((cxt: KeywordErrorCxt) => string | Code);
  params?: Code | ((cxt: KeywordErrorCxt) => Code);
}

export type Vocabulary = (KeywordDefinition | string)[];

export type KeywordCxtParams = {
  [P in string]?: Code | string | number;
};

export interface KeywordErrorCxt {
  gen: CodeGen;
  keyword: string;
  data: Name;
  $data?: string | false;
  schema: any;
  parentSchema?: AnySchemaObject;
  schemaCode: Code | number | boolean;
  schemaValue: Code | number | boolean;
  schemaType?: JSONType[];
  errsCount?: Name;
  params: KeywordCxtParams;
  it: SchemaCxt;
}

/** The compile-time context ajv hands a code keyword's `code` function. */
export declare class KeywordCxt implements KeywordErrorCxt {
  readonly gen: CodeGen;
  readonly allErrors?: boolean;
  readonly keyword: string;
  readonly data: Name;
  readonly $data?: string | false;
  schema: any;
  readonly schemaValue: Code | number | boolean;
  readonly schemaCode: Code | number | boolean;
  readonly schemaType: JSONType[];
  readonly parentSchema: AnySchemaObject;
  readonly errsCount?: Name;
  params: KeywordCxtParams;
  readonly it: SchemaObjCxt;
  readonly def: AddedKeywordDefinition;
  constructor(it: SchemaObjCxt, def: AddedKeywordDefinition, keyword: string);
  result(condition: Code, successAction?: () => void, failAction?: () => void): void;
  failResult(condition: Code, successAction?: () => void, failAction?: () => void): void;
  pass(condition: Code, failAction?: () => void): void;
  fail(condition?: Code): void;
  fail$data(condition: Code): void;
  error(append?: boolean, errorParams?: KeywordCxtParams, errorPaths?: ErrorPaths): void;
  $dataError(): void;
  reset(): void;
  ok(cond: Code | boolean): void;
  setParams(obj: KeywordCxtParams, assign?: true): void;
  block$data(valid: Name, codeBlock: () => void, $dataValid?: Code): void;
  check$data(valid?: Name, $dataValid?: Code): void;
  invalid$data(): Code;
  subschema(appl: SubschemaArgs, valid: Name): SchemaCxt;
  mergeEvaluated(schemaCxt: SchemaCxt, toName?: typeof Name): void;
  mergeValidEvaluated(schemaCxt: SchemaCxt, valid: Name): boolean | void;
}

/** Arguments to `KeywordCxt.subschema`. */
export type SubschemaArgs = Partial<{
  keyword: string;
  schemaProp: string | number;
  schema: AnySchema;
  schemaPath: Code;
  errSchemaPath: string;
  topSchemaRef: Code;
  data: Name | Code;
  dataProp: Code | string | number;
  dataTypes: JSONType[];
  definedProperties: Set<string>;
  propertyName: Name;
  dataPropType: string | number;
  jtdDiscriminator: string;
  jtdMetadata: boolean;
  compositeRule: true;
  createErrors: boolean;
  allErrors: boolean;
}>;

export interface ErrorPaths {
  instancePath?: Code;
  schemaPath?: string;
  parentSchema?: boolean;
}

export type FormatValidator<T extends string | number = string | number> = (data: T) => boolean;
export type FormatCompare<T extends string | number> = (data1: T, data2: T) => number | undefined;
export type AsyncFormatValidator<T extends string | number = string | number> = (
  data: T,
) => Promise<boolean>;

export interface FormatDefinition<T extends string | number = string | number> {
  type?: T extends string ? "string" | undefined : "number";
  validate: FormatValidator<T> | (T extends string ? string | RegExp : never);
  async?: false | undefined;
  compare?: FormatCompare<T>;
}

export interface AsyncFormatDefinition<T extends string | number = string | number> {
  type?: T extends string ? "string" | undefined : "number";
  validate: AsyncFormatValidator<T>;
  async: true;
  compare?: FormatCompare<T>;
}

export type AddedFormat =
  | true
  | RegExp
  | FormatValidator<string>
  | FormatDefinition<string>
  | FormatDefinition<number>
  | AsyncFormatDefinition<string>
  | AsyncFormatDefinition<number>;

export type Format = AddedFormat | string;

export interface RegExpLike {
  test: (s: string) => boolean;
}

export interface RegExpEngine {
  (pattern: string, u: string): RegExpLike;
  code: string;
}

export interface UriResolver {
  parse(uri: string): any;
  resolve(base: string, path: string): string;
  serialize(component: any): string;
}

export interface CodeOptions {
  es5?: boolean;
  esm?: boolean;
  lines?: boolean;
  optimize?: boolean | number;
  formats?: Code;
  source?: boolean;
  process?: (code: string, schema?: SchemaEnv) => string;
  regExp?: RegExpEngine;
}

interface InstanceCodeOptions extends CodeOptions {
  regExp: RegExpEngine;
  optimize: number;
}

interface DeprecatedOptions {
  /** @deprecated */
  ignoreKeywordsWithRef?: boolean;
  /** @deprecated */
  jsPropertySyntax?: boolean;
  /** @deprecated */
  unicode?: boolean;
}

export interface CurrentOptions {
  strict?: boolean | "log";
  strictSchema?: boolean | "log";
  strictNumbers?: boolean | "log";
  strictTypes?: boolean | "log";
  strictTuples?: boolean | "log";
  strictRequired?: boolean | "log";
  allowMatchingProperties?: boolean;
  allowUnionTypes?: boolean;
  validateFormats?: boolean;
  $data?: boolean;
  allErrors?: boolean;
  verbose?: boolean;
  discriminator?: boolean;
  unicodeRegExp?: boolean;
  timestamp?: "string" | "date";
  parseDate?: boolean;
  allowDate?: boolean;
  specialNumbers?: "fast" | "null";
  $comment?:
    | true
    | ((comment: string, schemaPath?: string, rootSchema?: AnySchemaObject) => unknown);
  formats?: {
    [Name in string]?: Format;
  };
  keywords?: Vocabulary;
  schemas?: AnySchema[] | {
    [Key in string]?: AnySchema;
  };
  logger?: Logger | false;
  loadSchema?: (uri: string) => Promise<AnySchemaObject>;
  removeAdditional?: boolean | "all" | "failing";
  useDefaults?: boolean | "empty";
  coerceTypes?: boolean | "array";
  next?: boolean;
  unevaluated?: boolean;
  dynamicRef?: boolean;
  schemaId?: "id" | "$id";
  jtd?: boolean;
  meta?: SchemaObject | boolean;
  defaultMeta?: string | AnySchemaObject;
  validateSchema?: boolean | "log";
  addUsedSchema?: boolean;
  inlineRefs?: boolean | number;
  passContext?: boolean;
  loopRequired?: number;
  loopEnum?: number;
  ownProperties?: boolean;
  multipleOfPrecision?: number;
  int32range?: boolean;
  messages?: boolean;
  code?: CodeOptions;
  uriResolver?: UriResolver;
  /** The dialect used when a schema names no meta-schema. */
  metaDialect?: "2019" | "2020" | "draft7";
}

export type Options = CurrentOptions & DeprecatedOptions;

type RequiredInstanceOptions = {
  [K in
    | "strictSchema"
    | "strictNumbers"
    | "strictTypes"
    | "strictTuples"
    | "strictRequired"
    | "inlineRefs"
    | "loopRequired"
    | "loopEnum"
    | "meta"
    | "messages"
    | "schemaId"
    | "addUsedSchema"
    | "validateSchema"
    | "validateFormats"
    | "int32range"
    | "unicodeRegExp"
    | "uriResolver"]: NonNullable<Options[K]>;
} & {
  code: InstanceCodeOptions;
};

export type InstanceOptions = Options & RequiredInstanceOptions;

export interface Logger {
  log(...args: unknown[]): unknown;
  warn(...args: unknown[]): unknown;
  error(...args: unknown[]): unknown;
}

export interface ErrorsTextOptions {
  separator?: string;
  dataVar?: string;
}

export interface Plugin<Opts> {
  (ajv: Ajv, options?: Opts): Ajv;
  [prop: string]: any;
}

export interface RuleGroup {
  type?: JSONType;
  rules: Rule[];
}

export interface Rule {
  keyword: string;
  definition: AddedKeywordDefinition;
}

export interface ValidationRules {
  rules: RuleGroup[];
  post: RuleGroup;
  all: {
    [Key in string]?: boolean | Rule;
  };
  keywords: {
    [Key in string]?: boolean;
  };
  types: {
    [K in JSONType]: boolean | RuleGroup | undefined;
  };
}

type LimitError = ErrorObject<
  "maxItems" | "minItems" | "minProperties" | "maxProperties" | "minLength" | "maxLength",
  {
    limit: number;
  },
  number | {
    $data: string;
  }
>;

type LimitNumberError = ErrorObject<
  "maximum" | "minimum" | "exclusiveMaximum" | "exclusiveMinimum",
  {
    limit: number;
    comparison: "<=" | ">=" | "<" | ">";
  },
  number | {
    $data: string;
  }
>;

type MultipleOfError = ErrorObject<
  "multipleOf",
  {
    multipleOf: number;
  },
  number | {
    $data: string;
  }
>;

type PatternError = ErrorObject<
  "pattern",
  {
    pattern: string;
  },
  string | {
    $data: string;
  }
>;

type RequiredError = ErrorObject<
  "required",
  {
    missingProperty: string;
  },
  string[] | {
    $data: string;
  }
>;

type UniqueItemsError = ErrorObject<
  "uniqueItems",
  {
    i: number;
    j: number;
  },
  boolean | {
    $data: string;
  }
>;

type ConstError = ErrorObject<
  "const",
  {
    allowedValue: any;
  }
>;

type EnumError = ErrorObject<
  "enum",
  {
    allowedValues: any[];
  },
  any[] | {
    $data: string;
  }
>;

type TypeError = ErrorObject<
  "type",
  {
    type: string;
  }
>;

type AdditionalItemsError = ErrorObject<
  "additionalItems",
  {
    limit: number;
  },
  AnySchema
>;

type ItemsError = ErrorObject<
  "items",
  {
    limit: number;
  },
  AnySchema
>;

type ContainsError = ErrorObject<
  "contains",
  {
    minContains: number;
    maxContains?: number;
  },
  AnySchema
>;

type AdditionalPropertiesError = ErrorObject<
  "additionalProperties",
  {
    additionalProperty: string;
  },
  AnySchema
>;

type DependenciesError = ErrorObject<
  "dependencies",
  {
    property: string;
    missingProperty: string;
    depsCount: number;
    deps: string;
  },
  {
    [K in string]?: string[] | AnySchema;
  }
>;

type IfKeywordError = ErrorObject<
  "if",
  {
    failingKeyword: string;
  },
  AnySchema
>;

type AnyOfError = ErrorNoParams<"anyOf", AnySchema[]>;
type OneOfError = ErrorObject<
  "oneOf",
  {
    passingSchemas: [number, number] | null;
  },
  AnySchema[]
>;
type NotKeywordError = ErrorNoParams<"not", AnySchema>;
type PropertyNamesError = ErrorObject<
  "propertyNames",
  {
    propertyName: string;
  },
  AnySchema
>;

type FormatError = ErrorObject<
  "format",
  {
    format: string;
  },
  string | {
    $data: string;
  }
>;

type UnevaluatedPropertiesError = ErrorObject<
  "unevaluatedProperties",
  {
    unevaluatedProperty: string;
  },
  AnySchema
>;

type UnevaluatedItemsError = ErrorObject<
  "unevaluatedItems",
  {
    limit: number;
  },
  AnySchema
>;

type DependentRequiredError = ErrorObject<
  "dependentRequired",
  {
    property: string;
    missingProperty: string;
    depsCount: number;
    deps: string;
  },
  {
    [K in string]?: string[];
  }
>;

type DiscriminatorError =
  | ErrorObject<
      "discriminator",
      {
        error: "tag";
        tag: string;
        tagValue: unknown;
      },
      string
    >
  | ErrorObject<
      "discriminator",
      {
        error: "mapping";
        tag: string;
        tagValue: unknown;
      },
      string
    >;

export type DefinedError =
  | TypeError
  | AdditionalItemsError
  | ItemsError
  | ContainsError
  | AdditionalPropertiesError
  | DependenciesError
  | IfKeywordError
  | AnyOfError
  | OneOfError
  | NotKeywordError
  | PropertyNamesError
  | LimitError
  | LimitNumberError
  | MultipleOfError
  | PatternError
  | RequiredError
  | UniqueItemsError
  | ConstError
  | EnumError
  | FormatError
  | UnevaluatedPropertiesError
  | UnevaluatedItemsError
  | DependentRequiredError
  | DiscriminatorError;

export interface JTDParser<T = unknown> {
  (json: string): T | undefined;
  message?: string;
  position?: number;
}

export type KeywordValidate = SchemaValidateFunction;
export type KeywordMacro = MacroKeywordFunc;
export type KeywordCompile = CompileKeywordFunc;
export type KeywordErrorContext = KeywordErrorCxt;

export declare class ValidationError extends Error {
  readonly errors: Partial<ErrorObject>[];
  readonly ajv: true;
  readonly validation: true;
  constructor(errors: Partial<ErrorObject>[]);
}

export declare class MissingRefError extends Error {
  readonly missingRef: string;
  readonly missingSchema: string;
  constructor(baseId: string, ref: string, message?: string);
  constructor(resolver: UriResolver, baseId: string, ref: string, msg?: string);
}

export default class Ajv {
  opts: InstanceOptions;
  errors?: ErrorObject[] | null;
  logger: Logger;
  readonly scope: ValueScope;
  readonly schemas: {
    [Key in string]?: SchemaEnv;
  };
  readonly refs: {
    [Ref in string]?: SchemaEnv | string;
  };
  readonly formats: {
    [Name in string]?: AddedFormat;
  };
  readonly RULES: ValidationRules;
  readonly _compilations: Set<SchemaEnv>;

  static ValidationError: typeof ValidationError;
  static MissingRefError: typeof MissingRefError;
  static _: typeof _;
  static str: typeof str;
  static stringify: typeof stringify;
  static nil: typeof nil;
  static Name: typeof Name;
  static CodeGen: typeof CodeGen;
  static KeywordCxt: typeof KeywordCxt;
  static default: typeof Ajv;
  static Ajv: typeof Ajv;

  constructor(opts?: Options);

  _addVocabularies(): void;
  _addDefaultMetaSchema(): void;
  defaultMeta(): string | AnySchemaObject | undefined;

  validate(schema: Schema | string, data: unknown): boolean;
  validate(schemaKeyRef: AnySchema | string, data: unknown): boolean | Promise<unknown>;
  validate<T>(schema: Schema | JSONSchemaType<T> | string, data: unknown): data is T;
  validate<T>(schema: JTDSchemaType<T>, data: unknown): data is T;
  validate<N extends never, T extends SomeJTDSchemaType>(
    schema: T,
    data: unknown,
  ): data is JTDDataType<T>;
  validate<T>(schema: AsyncSchema, data: unknown | T): Promise<T>;
  validate<T>(schemaKeyRef: AnySchema | string, data: unknown): data is T | Promise<T>;

  compile<T = unknown>(schema: Schema | JSONSchemaType<T>, _meta?: boolean): ValidateFunction<T>;
  compile<T = unknown>(schema: JTDSchemaType<T>, _meta?: boolean): ValidateFunction<T>;
  compile<N extends never, T extends SomeJTDSchemaType>(
    schema: T,
    _meta?: boolean,
  ): ValidateFunction<JTDDataType<T>>;
  compile<T = unknown>(schema: AsyncSchema, _meta?: boolean): AsyncValidateFunction<T>;
  compile<T = unknown>(schema: AnySchema, _meta?: boolean): AnyValidateFunction<T>;

  compileAsync<T = unknown>(
    schema: SchemaObject | JSONSchemaType<T>,
    _meta?: boolean,
  ): Promise<ValidateFunction<T>>;
  compileAsync<T = unknown>(
    schema: JTDSchemaType<T>,
    _meta?: boolean,
  ): Promise<ValidateFunction<T>>;
  compileAsync<T = unknown>(
    schema: AsyncSchema,
    meta?: boolean,
  ): Promise<AsyncValidateFunction<T>>;
  compileAsync<T = unknown>(
    schema: AnySchemaObject,
    meta?: boolean,
  ): Promise<AnyValidateFunction<T>>;

  addSchema(
    schema: AnySchema | AnySchema[],
    key?: string,
    _meta?: boolean,
    _validateSchema?: boolean | "log",
  ): this;
  addMetaSchema(schema: AnySchemaObject, key?: string, _validateSchema?: boolean | "log"): this;
  validateSchema(schema: AnySchema, throwOrLogError?: boolean): boolean | Promise<unknown>;
  getSchema<T = unknown>(keyRef: string): AnyValidateFunction<T> | undefined;
  removeSchema(schemaKeyRef?: AnySchema | string | RegExp): this;
  addVocabulary(definitions: Vocabulary): this;
  addKeyword(kwdOrDef: string | KeywordDefinition, def?: KeywordDefinition): this;
  getKeyword(keyword: string): AddedKeywordDefinition | boolean;
  removeKeyword(keyword: string): this;
  addFormat(name: string, format: Format): this;
  errorsText(errors?: ErrorObject[] | null | undefined, opts?: ErrorsTextOptions): string;
  $dataMetaSchema(metaSchema: AnySchemaObject, keywordsJsonPointers: string[]): AnySchemaObject;
  _addSchema(
    schema: AnySchema,
    meta?: boolean,
    baseId?: string,
    validateSchema?: boolean | "log",
    addSchema?: boolean,
  ): SchemaEnv;
}

export {Ajv};
