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
| `definitions` — valid definition | 1,923,317 | 43,977,839 | **+2,187%** |
| `definitions` — invalid definition | 1,945,339 | 33,328,439 | **+1,613%** |
| `ref` — remote ref containing refs | 5,864,127 | 85,938,538 | **+1,366%** |
| `contains` — with `const` | 20,431,514 | 217,977,933 | **+967%** |
| `contains` — validation | 30,461,239 | 252,708,810 | **+730%** |
| `additionalProperties` — not through applicators | 11,026,364 | 80,330,656 | **+629%** |
| `oneOf` — boolean schemas, all false | 20,220,250 | 133,701,496 | **+561%** |
| `boolean_schema` — `false` | 76,800,216 | 505,628,783 | **+558%** |
| `type` — `null` | 94,017,358 | 393,395,996 | **+318%** |
| `properties` — object properties | 126,646,839 | 291,861,379 | **+131%** |
| `uniqueItems=false` | 1,278,361,947 | 748,383,429 | **−41.5%** |
| `dependencies` — empty array | 417,891,969 | 333,127,390 | **−20.3%** |
| `anyOf` — one empty schema | 309,099,766 | 269,887,847 | **−12.7%** |
| `pattern` — not anchored | 47,985,675 | 43,967,370 | **−8.4%** |
| `bignum` — integer comparison | 125,508,438 | 118,476,266 | **−5.6%** |
| **Whole suite** | 18,910,595 | 38,511,788 | **+104%** |

- Geometric mean of per-case ratios: **1.99× (+98.8%)**; median **+96.7%**.
- 178 of 193 cases are faster; 15 are slower, the worst five shown above.
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
installed in its place, requiring identical output. It also runs the complete
published 2019-09 and 2020-12 conformance corpora, every published benchmark
case, and each JSON Type Definition serializer, parser, and generated module
against ajv's.

## Layout

- `index.js`, `index.mjs`, `index.d.ts` — CommonJS, ESM, and TypeScript entries.
- `dist/` — published entry points (`2019`, `2020`, `jtd`, `standalone`),
  runtime helpers, and mirrored meta-schemas.
- `lib/` — dialect classes, compiler, reference resolution, fast path,
  discriminator, keyword code surface, and JTD validator/parser/serializer.
- `bench/runner.js` — benchmark comparison; results in `bench/REPORT.md`.
- `test/` — verification scripts and unchanged project fixtures.

MIT licensed.
