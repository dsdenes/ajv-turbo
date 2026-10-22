import type Ajv from "../index";
import type {AnyValidateFunction} from "../index";

declare function standaloneCode(
  ajv: Ajv,
  refsOrFunc?: {[K in string]?: string} | AnyValidateFunction,
): string;

export default standaloneCode;
