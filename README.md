# ajv-turbo — drop-in `ajv` replacement, faster

`@dsdenes/ajv-turbo` replaces `ajv` 8.20 on Node.js 24. It exposes ajv's API and
every entry point ajv presents to consumers — draft-07 by default, 2019-09,
2020-12, JSON Type Definition, standalone generation, the code-generation
helpers extension authors import, and the runtime helpers generated validators
require — and returns ajv's verdict and error report for the covered surface,
including formats, custom keywords, `$data`, discriminators, asynchronous
validation, and standalone validators. Its only runtime dependency is the URI
resolver `fast-uri`, the same one ajv uses.

## Benchmark

`npm run bench` runs the published
[`json-schema-benchmark`](https://github.com/ebdrup/json-schema-benchmark)
suite (commit `e9c884f9`) against ajv 8.20 on Node.js 24.18.0/V8 13.6.
Of 245 cases, 193 compiled under both validators; those cover 695 documents with
**0 verdict mismatches**. Throughput change is ajv-turbo versus ajv — positive
means faster.

| Case | ajv (docs/s) | ajv-turbo (docs/s) | Change |
|---|--:|--:|--:|
| `definitions` — valid definition | 1,845,988 | 43,921,843 | **+2,279%** |
| `definitions` — invalid definition | 1,844,438 | 32,850,370 | **+1,681%** |
| `ref` — remote ref containing refs | 4,613,063 | 57,130,940 | **+1,139%** |
| `contains` — with `const` | 21,070,465 | 216,529,640 | **+928%** |
| `contains` — validation | 29,073,038 | 251,199,111 | **+764%** |
| `additionalProperties` — not through applicators | 10,765,249 | 78,491,999 | **+629%** |
| `oneOf` — boolean schemas, all false | 20,043,606 | 140,099,516 | **+599%** |
| `boolean_schema` — `false` | 72,949,379 | 505,271,969 | **+593%** |
| `type` — `null` | 91,231,294 | 384,817,434 | **+322%** |
| `properties` — object properties | 129,903,832 | 288,108,604 | **+122%** |
| `uniqueItems=false` | 1,213,564,927 | 773,546,078 | **−36.3%** |
| `bignum` — integer comparison | 121,233,704 | 89,046,297 | **−26.5%** |
| `content` — media type | 364,825,737 | 274,901,285 | **−24.6%** |
| `required` — empty array | 151,553,096 | 117,212,036 | **−22.7%** |
| `pattern` — not anchored | 48,162,251 | 38,270,783 | **−20.5%** |
| **Whole suite** | 17,633,158 | 36,296,101 | **+106%** |

- Geometric mean of per-case ratios: **2.02× (+102.1%)**; median **+94.0%**.
- 179 of 193 cases are faster; 14 are slower, the worst five shown above.
The 52 excluded cases are schemas ajv cannot compile under the suite's strict
settings (unregistered formats and strict-mode keywords); excluded cases are
not counted in either column. Each case is one Benchmark.js run on the machine
listed in the report, so treat small differences as noise.

The [full report](bench/REPORT.md) lists every case, excluded reasons, the
machine, and the exact procedures. Re-run with
`npm run bench -- --markdown=bench/REPORT.md --json=bench/report.json`.

## Install

```sh
npm install @dsdenes/ajv-turbo
```

Existing ajv projects can install it under the `ajv` name without changing
code, schemas, or configuration:

```sh
npm install ajv@npm:@dsdenes/ajv-turbo
```

```js
const Ajv = require("ajv");          // or import Ajv from "ajv"
const validate = new Ajv().compile({type: "string"});
validate("ok");
```

`ajv/dist/ajv`, `ajv/dist/core`, `ajv/dist/2019`, `ajv/dist/2020`,
`ajv/dist/jtd`, `ajv/dist/standalone`, and every runtime, refs, type, and
codegen path in the table below resolve the same way through the alias.

## Entry points

| Import | Surface |
|---|---|
| `@dsdenes/ajv-turbo` | draft-07 (ajv's default), with ajv's codegen helpers |
| `@dsdenes/ajv-turbo/dist/ajv` | the same default entry point |
| `@dsdenes/ajv-turbo/dist/core` | the base class and codegen helpers |
| `@dsdenes/ajv-turbo/dist/2019` | 2019-09 |
| `@dsdenes/ajv-turbo/dist/2020` | 2020-12 |
| `@dsdenes/ajv-turbo/dist/jtd` | JSON Type Definition |
| `@dsdenes/ajv-turbo/dist/standalone` | `standaloneCode`, also at `/standalone/index` and `/standalone/instance` |
| `@dsdenes/ajv-turbo/dist/compile/codegen` | the helpers ajv publishes for extension authors (`_`, `str`, `Name`, `CodeGen`, `ValueScope`, …), also at `/code`, `/index`, and `/scope` |
| `@dsdenes/ajv-turbo/dist/runtime/*` | `equal`, `parseJson`, `quote`, `re2`, `timestamp`, `ucs2length`, `uri`, `validation_error` |
| `@dsdenes/ajv-turbo/dist/refs/*` | the bundled meta-schemas and the 2019-09, 2020-12, and JTD meta-schema modules |
| `@dsdenes/ajv-turbo/dist/types/*` | the type-only modules ajv ships |

Every entry point exposes the same names as ajv's, with the same kind, and the
code-generation helpers are the same objects on every entry point that re-exports
them.

Draft-06 schemas work through the default entry point after registering the
bundled meta-schema:

```js
ajv.addMetaSchema(require("@dsdenes/ajv-turbo/dist/refs/json-schema-draft-06.json"));
```

## Covered surface

- **Draft-07:** all validation keywords and annotations, boolean schemas,
  `$id`/`$ref`/`$anchor` resolution, remote and recursive schemas, constructor
  `schemas`, `meta`/`defaultMeta`/`addUsedSchema`/`schemaId` registration.
- **2019-09 and 2020-12:** dynamic references, `$recursiveRef`,
  `dependentRequired`/`dependentSchemas`, bounded `contains`,
  `unevaluatedProperties`/`unevaluatedItems` with ajv's evaluated-name
  tracking, `prefixItems`, vocabulary meta-schemas, and matching compile-time
  schema validation.
- **JSON Type Definition:** every schema form, `compileSerializer` and
  `compileParser` with ajv's messages and offsets, plus standalone generation
  for all three.
- **Formats:** every `addFormat` form, constructor `formats`,
  `validateFormats: false`, and the unmodified `ajv-formats` plugin, including
  its range keywords and fast mode.
- **Custom keywords:** `validate`, `compile`, `macro`, and generated `code`
  forms; `metaSchema`, `before`, `post`, `implements`, `$data`, `$dataError`,
  `passContext`, `getKeyword`, `removeKeyword`, constructor `keywords`, and
  `addVocabulary`. The unmodified `ajv-keywords` plugin runs.
- **Strict mode:** the same accept/refuse decisions and messages for unknown
  keywords and formats, misplaced keywords, property/pattern overlap, union
  types, tuples, and `strictRequired`.
- **Options:** `allErrors`, `verbose`, `messages`, `coerceTypes`, `useDefaults`,
  `removeAdditional`, `ownProperties`, `strictNumbers`, `multipleOfPrecision`,
  `nullable`, `unicodeRegExp`, `discriminator`, `$data`, `logger`, and
  `uriResolver`.
- **Custom identifier resolution:** a project-supplied `uriResolver` — its
  `parse`, `serialize`, and `resolve` — decides how schema identifiers and
  references are formed, resolved, and compared, including identifiers the
  strategy treats as equivalent, while stored keys and default resolution stay
  as ajv leaves them. A reference the strategy cannot resolve is refused with
  ajv's message and its `missingRef`/`missingSchema` values.
- **Errors and async:** identical first/complete reports, `errorsText`,
  `verbose` context, and `$async` promise behavior.
- **Asynchronous compilation:** `compileAsync` loads every missing reference
  through the `loadSchema` option, registers each loaded schema for ordinary
  lookup and reuse, shares one load between concurrent compilations, loads a
  missing meta-schema before checking the schema, and reports ajv's errors for
  a missing loader, an unresolvable reference, a rejected load, and a schema
  the validator refuses.
- **Standalone:** `standaloneCode` modules are self-contained and match ajv's
  verdicts and reports, including references, `$async`, rewriting options,
  registered formats/keywords, discriminators, and JSON Type Definition.
- **Public entry points:** every entry point ajv presents exposes ajv's export
  names and kinds, including the code-generation helpers, the runtime helpers
  generated validators require, and the bundled meta-schema modules.

Not covered: asynchronous keywords written in the code form, `$data` on the
JSON Type Definition entry point, standalone parser/serializer modules, and
dialects other than draft-06/07, 2019-09, 2020-12, and JSON Type Definition.

## Verification

```sh
npm install
npm test        # verdicts, reports, dialects, formats, keywords, async, JTD, standalone
npm run verify  # prints the ajv verdict comparison
```

The suite runs unchanged projects first with ajv and then with this package
installed in its place, requiring identical output, including a project that
loads missing references during asynchronous compilation and a project that
supplies its own schema identifier strategy. It also runs the complete
published 2019-09 and 2020-12 conformance corpora, every published benchmark
case, and each JSON Type Definition serializer, parser, and generated module
against ajv's.

## Layout

- `index.js`, `index.mjs`, `index.d.ts` — CommonJS, ESM, and TypeScript entries.
- `dist/` — published entry points (`ajv`, `core`, `2019`, `2020`, `jtd`,
  `standalone`), the code-generation helpers, runtime helpers, and mirrored
  meta-schemas.
- `lib/` — dialect classes, compiler, reference resolution, fast path,
  discriminator, keyword code surface, the ajv-compatible code generator, and
  the JTD validator/parser/serializer.
- `bench/runner.js` — benchmark comparison; results in `bench/REPORT.md`.
- `test/` — verification scripts and unchanged project fixtures.

MIT licensed.
