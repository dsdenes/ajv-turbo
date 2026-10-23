import type Ajv from "../../index";
import type {AnySchema, AnyValidateFunction, ErrorObject} from "../../index";

export default class AjvPack {
  readonly ajv: Ajv;
  errors?: ErrorObject[] | null;

  constructor(ajv: Ajv);

  validate(schemaKeyRef: AnySchema | string, data: unknown): boolean | Promise<unknown>;
  compile<T = unknown>(schema: AnySchema, meta?: boolean): AnyValidateFunction<T>;
  getSchema<T = unknown>(keyRef: string): AnyValidateFunction<T> | undefined;

  addSchema(...args: Parameters<Ajv["addSchema"]>): AjvPack;
  addKeyword(...args: Parameters<Ajv["addKeyword"]>): AjvPack;
}
