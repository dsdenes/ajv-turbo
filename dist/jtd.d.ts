import Ajv from "../index";

export {ValidationError, MissingRefError} from "../index";
export type SerializeFunction<T = unknown> = (data: T) => string;
export declare class AjvJTD extends Ajv {
  compileSerializer<T = unknown>(schema: unknown): SerializeFunction<T>;
}
export {AjvJTD as Ajv};
export default AjvJTD;
