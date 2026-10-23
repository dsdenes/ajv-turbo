// Compile-time checks for the package's type surface:
//
// 1. Every type name ajv publishes from an entry point is importable from the
//    same entry point of this package (the export tuples below).
// 2. Types whose shapes are independent of ajv's internal classes are mutually
//    assignable across the two packages, so a value of either is accepted
//    where the other is expected.
// 3. The remaining public types are usable exactly the way a project uses
//    ajv's: schema annotations, keyword definitions, plugin registration,
//    options, and narrowing on defined errors.

import type * as Repl from "ajv";
import type * as Real from "ajv-reference";
import type * as Repl2019 from "ajv/dist/2019";
import type * as Real2019 from "ajv-reference/dist/2019";
import type * as Repl2020 from "ajv/dist/2020";
import type * as Real2020 from "ajv-reference/dist/2020";
import type * as ReplJTD from "ajv/dist/jtd";
import type * as RealJTD from "ajv-reference/dist/jtd";
import type * as ReplStandaloneModule from "ajv/dist/standalone";
import type * as RealStandaloneModule from "ajv-reference/dist/standalone";
import type * as ReplStandaloneIndexModule from "ajv/dist/standalone/index";
import type ReplPack from "ajv/dist/standalone/instance";
import type {
  Block,
  Code as ReplCodegenCode,
  CodeGen as ReplCodegenCodeGen,
  CodeGenOptions as ReplCodegenCodeGenOptions,
  Name as ReplCodegenName,
  SafeExpr,
  Scope,
  ScopeStore,
  ScopeValueSets,
  ValueScope,
  ValueScopeName,
} from "ajv/dist/compile/codegen";

interface Data {
  id: number;
  name: string;
  tags: string[];
}

interface JtdData {
  id: number;
  name: string;
}

// 1. Entry-point export surface.

type RootExports = [
  Repl.Format,
  Repl.FormatDefinition<string>,
  Repl.AsyncFormatDefinition<string>,
  Repl.KeywordDefinition,
  Repl.KeywordErrorDefinition,
  Repl.CodeKeywordDefinition,
  Repl.MacroKeywordDefinition,
  Repl.FuncKeywordDefinition,
  Repl.Vocabulary,
  Repl.Schema,
  Repl.SchemaObject,
  Repl.AnySchemaObject,
  Repl.AsyncSchema,
  Repl.AnySchema,
  Repl.ValidateFunction,
  Repl.AsyncValidateFunction,
  Repl.SchemaValidateFunction,
  Repl.ErrorObject,
  Repl.ErrorNoParams<"anyOf">,
  Repl.Plugin<object>,
  Repl.Options,
  Repl.CodeOptions,
  Repl.InstanceOptions,
  Repl.Logger,
  Repl.ErrorsTextOptions,
  Repl.SchemaCxt,
  Repl.SchemaObjCxt,
  Repl.KeywordCxt,
  Repl.DefinedError,
  Repl.JSONType,
  Repl.JSONSchemaType<Data>,
  Repl.Name,
  Repl.Code,
  Repl.CodeGen,
  Repl.CodeGenOptions,
  Repl.ValidationError,
  Repl.MissingRefError,
  Repl.Ajv,
];
declare const rootExports: RootExports;
void rootExports;

type DialectExports<M> = M extends {
  Format: infer F;
  FormatDefinition: infer FD;
  AsyncFormatDefinition: infer AFD;
  KeywordDefinition: infer KD;
  KeywordErrorDefinition: infer KED;
  CodeKeywordDefinition: infer CKD;
  MacroKeywordDefinition: infer MKD;
  FuncKeywordDefinition: infer FKD;
  Vocabulary: infer V;
  Schema: infer S;
  SchemaObject: infer SO;
  AnySchemaObject: infer ASO;
  AsyncSchema: infer AS;
  AnySchema: infer A;
  ValidateFunction: infer VF;
  AsyncValidateFunction: infer AVF;
  ErrorObject: infer EO;
  ErrorNoParams: infer ENP;
  Plugin: infer P;
  Options: infer O;
  CodeOptions: infer CO;
  InstanceOptions: infer IO;
  Logger: infer L;
  ErrorsTextOptions: infer ETO;
  SchemaCxt: infer SC;
  SchemaObjCxt: infer SOC;
  KeywordCxt: infer KC;
  DefinedError: infer DE;
  JSONType: infer JT;
  JSONSchemaType: infer JST;
  Code: infer C;
  CodeGen: infer CG;
  CodeGenOptions: infer CGO;
  Name: infer N;
  ValidationError: infer VE;
  MissingRefError: infer MRE;
}
  ? [
      F,
      FD,
      AFD,
      KD,
      KED,
      CKD,
      MKD,
      FKD,
      V,
      S,
      SO,
      ASO,
      AS,
      A,
      VF,
      AVF,
      EO,
      ENP,
      P,
      O,
      CO,
      IO,
      L,
      ETO,
      SC,
      SOC,
      KC,
      DE,
      JT,
      JST,
      C,
      CG,
      CGO,
      N,
      VE,
      MRE,
    ]
  : never;

declare const repl2019Exports: DialectExports<typeof Repl2019>;
void repl2019Exports;
declare const repl2020Exports: DialectExports<typeof Repl2020>;
void repl2020Exports;
declare const real2019Exports: DialectExports<typeof Real2019>;
void real2019Exports;
declare const real2020Exports: DialectExports<typeof Real2020>;
void real2020Exports;

// The JTD entry point publishes the common names plus the JTD-specific ones.
declare const replJtdCommon: DialectExports<typeof ReplJTD>;
void replJtdCommon;
declare const realJtdCommon: DialectExports<typeof RealJTD>;
void realJtdCommon;

declare const repl2019Class: Repl2019.Ajv2019;
const repl2019Base: Repl.Ajv = repl2019Class;
void repl2019Base;
declare const repl2020Class: Repl2020.Ajv2020;
const repl2020Base: Repl.Ajv = repl2020Class;
void repl2020Base;
declare const replJtdClass: ReplJTD.Ajv;
const replJtdBase: Repl.Ajv = replJtdClass;
void replJtdBase;

type JtdExports = [
  ReplJTD.JTDOptions,
  ReplJTD.JTDParser,
  ReplJTD.JTDErrorObject,
  ReplJTD.JTDSchemaType<JtdData>,
  ReplJTD.SomeJTDSchemaType,
  ReplJTD.JTDDataType<{properties: {id: {type: "int32"}}}>,
];
declare const jtdExports: JtdExports;
void jtdExports;

// 2. Cross-package assignability for shapes that do not depend on ajv's
// internal classes.

declare const replSchema: Repl.JSONSchemaType<Data>;
const realSchema: Real.JSONSchemaType<Data> = replSchema;
declare const realSchemaIn: Real.JSONSchemaType<Data>;
const replSchemaIn: Repl.JSONSchemaType<Data> = realSchemaIn;

declare const replJtdSchema: ReplJTD.JTDSchemaType<JtdData>;
const realJtdSchema: RealJTD.JTDSchemaType<JtdData> = replJtdSchema;
declare const replSomeJtd: ReplJTD.SomeJTDSchemaType;
const realSomeJtd: RealJTD.SomeJTDSchemaType = replSomeJtd;

type JtdSchema = {properties: {id: {type: "int32"}}};
declare const replJtdData: ReplJTD.JTDDataType<JtdSchema>;
const realJtdData: RealJTD.JTDDataType<JtdSchema> = replJtdData;

declare const replValidate: Repl.ValidateFunction<Data>;
const realValidate: Real.ValidateFunction<Data> = replValidate;
declare const realValidateIn: Real.ValidateFunction<Data>;
const replValidateIn: Repl.ValidateFunction<Data> = realValidateIn;

declare const replAsyncValidate: Repl.AsyncValidateFunction<Data>;
const realAsyncValidate: Real.AsyncValidateFunction<Data> = replAsyncValidate;
declare const realAsyncValidateIn: Real.AsyncValidateFunction<Data>;
const replAsyncValidateIn: Repl.AsyncValidateFunction<Data> = realAsyncValidateIn;

declare const replSchemaValidate: Repl.SchemaValidateFunction;
const realSchemaValidate: Real.SchemaValidateFunction = replSchemaValidate;

declare const replError: Repl.ErrorObject<"required", {missingProperty: string}, string[]>;
const realError: Real.ErrorObject<"required", {missingProperty: string}, string[]> = replError;
const realErrorIn: Real.ErrorObject<"required", {missingProperty: string}, string[]> = replError;
const replErrorIn: Repl.ErrorObject<"required", {missingProperty: string}, string[]> = realErrorIn;

declare const replNoParams: Repl.ErrorNoParams<"anyOf", Repl.AnySchema[]>;
const realNoParams: Real.ErrorNoParams<"anyOf", Real.AnySchema[]> = replNoParams;

declare const replSchemaObject: Repl.SchemaObject;
const realSchemaObject: Real.SchemaObject = replSchemaObject;
declare const realSchemaObjectIn: Real.SchemaObject;
const replSchemaObjectIn: Repl.SchemaObject = realSchemaObjectIn;

declare const replSchemaValue: Repl.Schema;
const realSchemaValue: Real.Schema = replSchemaValue;
declare const realSchemaValueIn: Real.Schema;
const replSchemaValueIn: Repl.Schema = realSchemaValueIn;

declare const replAsyncSchema: Repl.AsyncSchema;
const realAsyncSchema: Real.AsyncSchema = replAsyncSchema;

declare const replAnySchemaObject: Repl.AnySchemaObject;
const realAnySchemaObject: Real.AnySchemaObject = replAnySchemaObject;

declare const replAnySchema: Repl.AnySchema;
const realAnySchema: Real.AnySchema = replAnySchema;

declare const replJsonType: Repl.JSONType;
const realJsonType: Real.JSONType = replJsonType;
declare const realJsonTypeIn: Real.JSONType;
const replJsonTypeIn: Repl.JSONType = realJsonTypeIn;

declare const replLogger: Repl.Logger;
const realLogger: Real.Logger = replLogger;
const realLoggerIn: Real.Logger = replLogger;
const replLoggerIn: Repl.Logger = realLoggerIn;

declare const replErrorsText: Repl.ErrorsTextOptions;
const realErrorsText: Real.ErrorsTextOptions = replErrorsText;

declare const replFormat: Repl.Format;
const realFormat: Real.Format = replFormat;
const realFormatIn: Real.Format = replFormat;
const replFormatIn: Repl.Format = realFormatIn;

declare const replFormatDefinition: Repl.FormatDefinition<string>;
const realFormatDefinition: Real.FormatDefinition<string> = replFormatDefinition;

declare const replAsyncFormatDefinition: Repl.AsyncFormatDefinition<string>;
const realAsyncFormatDefinition: Real.AsyncFormatDefinition<string> = replAsyncFormatDefinition;

declare const replValidationError: Repl.ValidationError;
const realValidationError: Real.ValidationError = replValidationError;
const realValidationErrorIn: Real.ValidationError = replValidationError;
const replValidationErrorIn: Repl.ValidationError = realValidationErrorIn;

declare const replMissingRefError: Repl.MissingRefError;
const realMissingRefError: Real.MissingRefError = replMissingRefError;
const realMissingRefErrorIn: Real.MissingRefError = replMissingRefError;
const replMissingRefErrorIn: Repl.MissingRefError = realMissingRefErrorIn;

declare const replJtdParser: ReplJTD.JTDParser<JtdData>;
const realJtdParser: RealJTD.JTDParser<JtdData> = replJtdParser;

// 3. Usage in the places a project exercises these types.

const replOptions = {
  allErrors: true,
  strict: "log",
  code: {esm: true, lines: true},
  formats: {handle: /^[a-z]+$/},
  keywords: [] as Repl.KeywordDefinition[],
  schemas: [] as Repl.AnySchema[],
} satisfies Repl.Options;
void replOptions;

const replCodeOptions: Repl.CodeOptions = {esm: true, source: true, optimize: 2};
void replCodeOptions;

const replCodeKeyword = {
  keyword: "customCode",
  schemaType: "boolean",
  code(cxt: Repl.KeywordCxt): void {
    cxt.fail();
  },
} satisfies Repl.CodeKeywordDefinition;
void replCodeKeyword;

const replFuncKeyword = {
  keyword: "customFunc",
  schemaType: "string",
  validate: (_schema: unknown, data: unknown): boolean => typeof data === "string",
} satisfies Repl.FuncKeywordDefinition;
void replFuncKeyword;

const replMacroKeyword = {
  keyword: "customMacro",
  macro: (): Repl.AnySchema => ({type: "string"}),
} satisfies Repl.MacroKeywordDefinition;
void replMacroKeyword;

const replKeywordError: Repl.KeywordErrorDefinition = {message: "custom keyword failed"};
void replKeywordError;

const replVocabulary: Repl.Vocabulary = [replCodeKeyword, replFuncKeyword, "customMacro"];
void replVocabulary;

const replPlugin: Repl.Plugin<{option: boolean}> = (ajv, options) => {
  void options;
  return ajv;
};
void replPlugin;

declare const replStandalone: typeof ReplStandaloneModule.default;
const replStandaloneCode: string = replStandalone({} as Repl.Ajv);
void replStandaloneCode;

declare const replStandaloneIndex: typeof ReplStandaloneIndexModule.default;
const replStandaloneIndexCode: string = replStandaloneIndex({} as Repl.Ajv);
void replStandaloneIndexCode;

declare const realStandalone: typeof RealStandaloneModule.default;
const realStandaloneCode: string = realStandalone({} as Real.Ajv);
void realStandaloneCode;

declare const replPack: ReplPack;
const replPackSchema: Repl.AnySchema | undefined = replPack.ajv.getSchema("example")?.schema;
void replPackSchema;

// Code-expression types a keyword author names.
declare const replCode: Repl.Code;
const replCodeText: string = replCode.str;
void replCodeText;
declare const replCodeGen: Repl.CodeGen;
const replCodeGenText: string = replCodeGen.toString();
void replCodeGenText;
declare const replCodeGenOptions: Repl.CodeGenOptions;
const replEs5: boolean | undefined = replCodeGenOptions.es5;
void replEs5;
declare const replExpression: Repl.Code;
const realExpression: Real.Code = replExpression;
void realExpression;
declare const replSafeExpr: SafeExpr;
declare const replBlock: Block;
declare const replValueScope: ValueScope;
declare const replScope: Scope;
declare const replScopeStore: ScopeStore;
declare const replValueScopeName: ValueScopeName;
declare const replScopeValueSets: ScopeValueSets;
declare const replCodegenCode: ReplCodegenCode;
declare const replCodegenCodeGen: ReplCodegenCodeGen;
declare const replCodegenCodeGenOptions: ReplCodegenCodeGenOptions;
declare const replCodegenName: ReplCodegenName;
void replSafeExpr;
void replBlock;
void replValueScope;
void replScope;
void replScopeStore;
void replValueScopeName;
void replScopeValueSets;
void replCodegenCode;
void replCodegenCodeGen;
void replCodegenCodeGenOptions;
void replCodegenName;

// Compilation context types are reachable from the root entry point.
declare const replSchemaCxt: Repl.SchemaCxt;
const replCxtData: Repl.Name = replSchemaCxt.data;
void replCxtData;
declare const replSchemaObjCxt: Repl.SchemaObjCxt;
const replObjSchema: Repl.AnySchemaObject = replSchemaObjCxt.schema;
void replObjSchema;
declare const replKeywordCxt: Repl.KeywordCxt;
const replCxtKeyword: string = replKeywordCxt.keyword;
void replCxtKeyword;

// Defined errors narrow the way ajv's do.
declare const replDefined: Repl.DefinedError;
if (replDefined.keyword === "required") {
  const missingProperty: string = replDefined.params.missingProperty;
  void missingProperty;
}
if (replDefined.keyword === "type") {
  const expectedType: string = replDefined.params.type;
  void expectedType;
}

declare const replJtdError: ReplJTD.JTDErrorObject;
if (replJtdError.keyword === "enum") {
  const allowedValues: string[] = replJtdError.params.allowedValues;
  void allowedValues;
}

const replJtdOptions = {
  meta: true,
  inlineRefs: true,
} satisfies ReplJTD.JTDOptions;
void replJtdOptions;
