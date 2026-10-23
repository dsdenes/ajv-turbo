import BaseAjv from "../index";
import type {
  CurrentOptions,
  ErrorObject,
  JTDParser,
  SchemaObject,
} from "../index";
import type {JTDSchemaType, SomeJTDSchemaType, JTDDataType} from "./types/jtd-schema";

export type {
  Format,
  FormatDefinition,
  AsyncFormatDefinition,
  KeywordDefinition,
  KeywordErrorDefinition,
  CodeKeywordDefinition,
  MacroKeywordDefinition,
  FuncKeywordDefinition,
  Vocabulary,
  Schema,
  SchemaObject,
  AnySchemaObject,
  AsyncSchema,
  AnySchema,
  ValidateFunction,
  AsyncValidateFunction,
  ErrorObject,
  ErrorNoParams,
  Plugin,
  Options,
  CodeOptions,
  InstanceOptions,
  Logger,
  ErrorsTextOptions,
  SchemaCxt,
  SchemaObjCxt,
  JSONSchemaType,
  Code,
  CodeGenOptions,
  JTDParser,
} from "../index";
export type {JTDSchemaType, SomeJTDSchemaType, JTDDataType};
export {
  ValidationError,
  MissingRefError,
  KeywordCxt,
  Name,
  CodeGen,
  _,
  str,
  stringify,
  nil,
} from "../index";

export type JTDOptions = CurrentOptions & {
  strict?: never;
  allowMatchingProperties?: never;
  allowUnionTypes?: never;
  validateFormats?: never;
  $data?: never;
  verbose?: boolean;
  $comment?: never;
  formats?: never;
  loadSchema?: never;
  useDefaults?: never;
  coerceTypes?: never;
  next?: never;
  unevaluated?: never;
  dynamicRef?: never;
  meta?: boolean;
  defaultMeta?: never;
  inlineRefs?: boolean;
  loopRequired?: never;
  multipleOfPrecision?: never;
};

type JTDType = "boolean" | "string" | "timestamp" | "float32" | "float64" | IntType;
type IntType = "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32";

type JTDTypeError<K extends string, T extends string, S> = ErrorObject<
  K,
  {
    type: T;
    nullable: boolean;
  },
  S
>;

type JTDPropSchema = {
  [P in string]?: SchemaObject;
};

type JTDPropertiesError =
  | JTDTypeError<"properties" | "optionalProperties", "object", JTDPropSchema>
  | ErrorObject<
      "properties" | "optionalProperties",
      {
        error: "additional";
        additionalProperty: string;
      },
      JTDPropSchema
    >
  | ErrorObject<
      "properties" | "optionalProperties",
      {
        error: "missing";
        missingProperty: string;
      },
      JTDPropSchema
    >;

type JTDDiscriminatorError =
  | JTDTypeError<"discriminator", "object", string>
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

export type JTDErrorObject =
  | JTDTypeError<"type", JTDType, JTDType>
  | ErrorObject<
      "enum",
      {
        allowedValues: string[];
      },
      string[]
    >
  | JTDTypeError<"elements", "array", SchemaObject>
  | JTDPropertiesError
  | JTDTypeError<"values", "object", SchemaObject>
  | JTDDiscriminatorError;

export declare class AjvJTD extends BaseAjv {
  constructor(opts?: JTDOptions);
  compileSerializer<T = unknown>(schema: SchemaObject): (data: T) => string;
  compileSerializer<T = unknown>(schema: JTDSchemaType<T>): (data: T) => string;
  compileParser<T = unknown>(schema: SchemaObject): JTDParser<T>;
  compileParser<T = unknown>(schema: JTDSchemaType<T>): JTDParser<T>;
}

export {AjvJTD as Ajv};
export default AjvJTD;
