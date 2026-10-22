import Ajv from "../index";

export {ValidationError, MissingRefError} from "../index";
export type SerializeFunction<T = unknown> = (data: T) => string;
export interface JTDParser<T = unknown> {
  (json: string): T | undefined;
  message?: string;
  position?: number;
}
export declare class AjvJTD extends Ajv {
  compileSerializer<T = unknown>(schema: unknown): SerializeFunction<T>;
  compileParser<T = unknown>(schema: unknown): JTDParser<T>;
}
export {AjvJTD as Ajv};
export default AjvJTD;
