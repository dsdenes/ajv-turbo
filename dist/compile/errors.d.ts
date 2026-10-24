import type {KeywordErrorCxt, KeywordErrorDefinition} from "../types";
import {Code} from "./codegen";

export declare const keywordError: KeywordErrorDefinition;
export declare const keyword$DataError: KeywordErrorDefinition;

export interface ErrorPaths {
  instancePath?: Code;
  schemaPath?: string;
  parentSchema?: boolean;
}

export declare function reportError(
  cxt: KeywordErrorCxt,
  error?: KeywordErrorDefinition,
  errorPaths?: ErrorPaths,
  overrideAllErrors?: boolean,
): void;
