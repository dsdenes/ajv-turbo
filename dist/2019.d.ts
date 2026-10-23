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
  KeywordCxt,
  DefinedError,
  JSONType,
  JSONSchemaType,
  Code,
  CodeGen,
  CodeGenOptions,
  Name,
} from "../index";
export {ValidationError, MissingRefError} from "../index";

export declare class Ajv2019 extends BaseAjv {}
export {Ajv2019 as Ajv};
export default Ajv2019;
