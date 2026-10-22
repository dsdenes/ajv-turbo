import type Ajv from "../../index";
import type {AnyValidateFunction, ErrorObject} from "../../index";

export default class AjvPack {
  readonly ajv: Ajv;
  errors?: ErrorObject[] | null;

  constructor(ajv: Ajv);

  validate(schemaKeyRef: unknown, data: unknown): boolean | Promise<unknown>;
  compile<T = unknown>(schema: unknown, meta?: boolean): AnyValidateFunction<T>;
  getSchema<T = unknown>(keyRef: string): AnyValidateFunction<T> | undefined;

  addSchema(...args: Parameters<Ajv["addSchema"]>): AjvPack;
  addKeyword(...args: Parameters<Ajv["addKeyword"]>): AjvPack;
}
