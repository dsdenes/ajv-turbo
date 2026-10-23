// The code-generation surface ajv publishes at `ajv/dist/compile/codegen`
// and the package root. `lib/codegen-index.js` implements it; every name
// declared here is a runtime export of that module.

export type SafeExpr = Code | number | boolean | null;
export type Block = Code | (() => void);

export interface CodeGenOptions {
  es5?: boolean;
  lines?: boolean;
  ownProperties?: boolean;
}

/** A code identifier. */
export declare class Name {
  readonly str: string;
  readonly names: Record<string, number | undefined>;
  constructor(name: string);
  toString(): string;
  emptyStr(): boolean;
}

/** A code expression built from literal pieces and interpolated values. */
declare class _Code {
  readonly _items: readonly unknown[];
  readonly str: string;
  readonly names: Record<string, number | undefined>;
  constructor(parts: string | readonly unknown[]);
  toString(): string;
  emptyStr(): boolean;
}

export type Code = _Code | Name;

export declare const nil: _Code;

/** Tagged template that builds a code expression, as ajv's `_` does. */
export declare function _(
  strings: TemplateStringsArray | readonly string[],
  ...values: unknown[]
): _Code;
export declare function str(
  strings: TemplateStringsArray | readonly string[],
  ...values: unknown[]
): _Code;
export declare function strConcat(left: Code, right: Code): Code;
export declare function stringify(value: unknown): _Code;
export declare function getProperty(key: Code | string | number): _Code;
export declare function regexpCode(rx: RegExp): _Code;

export declare function not<T extends Code | SafeExpr>(x: T): T;
export declare function and(...args: Code[]): Code;
export declare function or(...args: Code[]): Code;

export declare const operators: {
  GT: _Code;
  GTE: _Code;
  LT: _Code;
  LTE: _Code;
  EQ: _Code;
  NEQ: _Code;
  NOT: _Code;
  OR: _Code;
  AND: _Code;
  ADD: _Code;
};

export type ValueReference = unknown;

export interface NameValue {
  ref: ValueReference;
  key?: unknown;
  code?: Code;
}

export type ScopeStore = Record<string, ValueReference[] | undefined>;

type ScopeValues = {
  [Prefix in string]?: Map<unknown, ValueScopeName>;
};

export type ScopeValueSets = {
  [Prefix in string]?: Set<ValueScopeName>;
};

declare enum UsedValueState {
  Started = 0,
  Completed = 1,
}

type UsedScopeValues = {
  [Prefix in string]?: Map<ValueScopeName, UsedValueState | undefined>;
};

export interface ScopeOptions {
  prefixes?: Set<string>;
  parent?: Scope;
}

interface ValueScopeOptions extends ScopeOptions {
  scope: ScopeStore;
  es5?: boolean;
  lines?: boolean;
}

export declare const varKinds: {
  const: Name;
  let: Name;
  var: Name;
};

/** A name allocator. */
export declare class Scope {
  constructor(opts?: ScopeOptions);
  toName(nameOrPrefix: Name | string): Name;
  name(prefix: string): Name;
}

/** A name bound to a value in the generated scope. */
export declare class ValueScopeName extends Name {
  readonly prefix: string;
  value?: NameValue;
  scopePath?: Code;
  constructor(prefix: string, nameStr: string);
  setValue(value: NameValue, {property, itemIndex}: {property: string; itemIndex: number}): void;
}

/** The generated-code scope. */
export declare class ValueScope extends Scope {
  readonly opts: ValueScopeOptions & {_n: Code};
  constructor(opts: ValueScopeOptions);
  get(): ScopeStore;
  name(prefix: string): ValueScopeName;
  value(nameOrPrefix: ValueScopeName | string, value: NameValue): ValueScopeName;
  getValue(prefix: string, keyOrRef: unknown): ValueScopeName | undefined;
  scopeRefs(scopeName: Name, values?: ScopeValues | ScopeValueSets): Code;
  scopeCode(
    values?: ScopeValues | ScopeValueSets,
    usedValues?: UsedScopeValues,
    getCode?: (n: ValueScopeName) => Code | undefined,
  ): Code;
}

/** The code generator a code keyword's `gen` property exposes. */
export declare class CodeGen {
  readonly _scope: Scope;
  readonly _extScope: ValueScope;
  readonly _values: ScopeValueSets;
  constructor(extScope: ValueScope, opts?: CodeGenOptions);
  toString(): string;
  name(prefix: string): Name;
  scopeName(prefix: string): ValueScopeName;
  scopeValue(prefixOrName: ValueScopeName | string, value: NameValue): Name;
  getScopeValue(prefix: string, keyOrRef: unknown): ValueScopeName | undefined;
  scopeRefs(scopeName: Name): Code;
  scopeCode(): Code;
  const(nameOrPrefix: Name | string, rhs: SafeExpr, _constant?: boolean): Name;
  let(nameOrPrefix: Name | string, rhs?: SafeExpr, _constant?: boolean): Name;
  var(nameOrPrefix: Name | string, rhs?: SafeExpr, _constant?: boolean): Name;
  assign(lhs: Code, rhs: SafeExpr, sideEffects?: boolean): CodeGen;
  add(lhs: Code, rhs: SafeExpr): CodeGen;
  code(c: Block | SafeExpr): CodeGen;
  object(...keyValues: [Name | string, SafeExpr | string][]): _Code;
  if(condition: Code | boolean, thenBody?: Block, elseBody?: Block): CodeGen;
  elseIf(condition: Code | boolean): CodeGen;
  else(): CodeGen;
  endIf(): CodeGen;
  for(iteration: Code, forBody?: Block): CodeGen;
  forRange(
    nameOrPrefix: Name | string,
    from: SafeExpr,
    to: SafeExpr,
    forBody: (index: Name) => void,
    varKind?: Code,
  ): CodeGen;
  forOf(
    nameOrPrefix: Name | string,
    iterable: Code,
    forBody: (item: Name) => void,
    varKind?: Code,
  ): CodeGen;
  forIn(
    nameOrPrefix: Name | string,
    obj: Code,
    forBody: (item: Name) => void,
    varKind?: Code,
  ): CodeGen;
  endFor(): CodeGen;
  label(label: Name): CodeGen;
  break(label?: Code): CodeGen;
  return(value: Block | SafeExpr): CodeGen;
  try(tryBody: Block, catchCode?: (e: Name) => void, finallyCode?: Block): CodeGen;
  throw(error: Code): CodeGen;
  block(body?: Block, nodeCount?: number): CodeGen;
  endBlock(nodeCount?: number): CodeGen;
  func(name: Name, args?: Code, async?: boolean, funcBody?: Block): CodeGen;
  endFunc(): CodeGen;
  optimize(n?: number): void;
}
