# ajv-turbo — drop-in `ajv` replacement, faster

`@dsdenes/ajv-turbo` replaces `ajv` 8.20 on Node.js 24 with no runtime
dependencies. It exposes ajv's API and entry points — draft-07 by default,
2019-09, 2020-12, and JSON Type Definition — and returns ajv's verdict and error
report for the covered surface, including formats, custom keywords, `$data`,
discriminators, asynchronous validation, and standalone validators.

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

`ajv/dist/2019`, `ajv/dist/2020`, `ajv/dist/jtd`, and `ajv/dist/standalone`
resolve the same way through the alias.

## Entry points

| Import | Dialect |
|---|---|
| `@dsdenes/ajv-turbo` | draft-07 (ajv's default) |
| `@dsdenes/ajv-turbo/dist/2019` | 2019-09 |
| `@dsdenes/ajv-turbo/dist/2020` | 2020-12 |
| `@dsdenes/ajv-turbo/dist/jtd` | JSON Type Definition |

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
  `nullable`, `unicodeRegExp`, `discriminator`, `$data`, and `logger`.
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
loads missing references during asynchronous compilation. It also runs the
complete published 2019-09 and 2020-12 conformance corpora, every published
benchmark case, and each JSON Type Definition serializer, parser, and generated
module against ajv's.

## Layout

- `index.js`, `index.mjs`, `index.d.ts` — CommonJS, ESM, and TypeScript entries.
- `dist/` — published entry points (`2019`, `2020`, `jtd`, `standalone`),
  runtime helpers, and mirrored meta-schemas.
- `lib/` — dialect classes, compiler, reference resolution, fast path,
  discriminator, keyword code surface, and JTD validator/parser/serializer.
- `bench/runner.js` — benchmark comparison; results in `bench/REPORT.md`.
- `test/` — verification scripts and unchanged project fixtures.

MIT licensed.
