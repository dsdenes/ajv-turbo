import BaseAjv from "../index";

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
  DefinedError,
  JSONType,
  JSONSchemaType,
  Code,
  CodeGenOptions,
} from "../index";
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

export declare class Ajv2020 extends BaseAjv {}
export {Ajv2020 as Ajv};
export default Ajv2020;
