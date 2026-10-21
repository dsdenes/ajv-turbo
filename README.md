# ajv-compatible JSON Schema validator

A dependency-free replacement for the `ajv` package on Node.js 24. It exposes the
`ajv` API and, for schemas that use only the core validation keywords of ajv's
default schema dialect (JSON Schema draft-07), returns the same valid or invalid
verdict and the same error report as ajv.

## Covered subset

Schemas may use these draft-07 keywords and the annotations that do not affect a
verdict:

`$schema`, `$id`, `$ref`, `$comment`, `title`, `description`, `default`,
`examples`, `readOnly`, `writeOnly`, `definitions`, `type`, `enum`, `const`,
`multipleOf`, `maximum`, `exclusiveMaximum`, `minimum`, `exclusiveMinimum`,
`maxLength`, `minLength`, `pattern`, `items`, `additionalItems`, `maxItems`,
`minItems`, `uniqueItems`, `contains`, `maxProperties`, `minProperties`,
`required`, `properties`, `patternProperties`, `additionalProperties`,
`dependencies`, `propertyNames`, `if`, `then`, `else`, `allOf`, `anyOf`,
`oneOf`, `not`.

Boolean schemas and references are supported, including `$id` base changes,
location-independent anchors, JSON pointers, recursive schemas, and schemas
registered with `addSchema` (for example the remote schemas used by the published
benchmark suite). The Ajv options that affect verdicts or error reports are
honoured: `allErrors`, `strictNumbers`, `unicodeRegExp`, `ownProperties`,
`coerceTypes`, `useDefaults`, `removeAdditional`, `multipleOfPrecision`, and
`nullable`.

Out of scope, and not claimed to match ajv: `format` validation, custom keywords
and formats, asynchronous validation, standalone validators, schema dialects
other than draft-07, errors raised while compiling an invalid schema, and
throughput.

## Error reports

Error reports are identical to ajv's for the covered subset, in both modes ajv
supports:

- With default options a failing document produces the same first error ajv
  reports; with `allErrors: true` it produces the same complete list.
- Every entry has the same `instancePath`, `schemaPath`, `keyword`, `params`, and
  `message` values as ajv's corresponding entry, including entries that carry
  `propertyName`, `passingSchemas`, `i`/`j` (for `uniqueItems`), or a
  `failingKeyword`.
- Entries appear in ajv's order and in the same number, including the entries
  ajv keeps from failed `anyOf`, `oneOf`, `contains`, `if`/`then`, and
  `propertyNames` branches.
- `errorsText(errors, {separator, dataVar})` derives the same summary ajv
  derives from the same report, and returns `"No errors"` when there are none.
- `validate.errors` is `null` for valid data, exactly as ajv leaves it.

## Drop-in use

The package is named `ajv`, so it replaces ajv in a project's dependency setup
while code, schemas, and configuration stay untouched:

```sh
# in the project that already uses ajv
npm install /path/to/this/package --no-save
```

```js
const Ajv = require("ajv");
const ajv = new Ajv();
const validate = ajv.compile(schema);
validate(data);
```

`import Ajv from "ajv"` and `import {Ajv} from "ajv"` work as well.

## Verification

```sh
npm install
npm test        # verdicts, error reports, and the drop-in project scenario
npm run verify  # prints the verdict comparison
```

- `test/verdicts.test.js` compiles every covered case of the published
  `json-schema-benchmark` draft-07 corpus and the benchmark-derived schemas kept
  in ajv's repository, then validates every case's documents through both ajv and
  this package and requires identical verdicts.
- `test/errors.test.js` does the same for error reports: it requires identical
  verdicts, entries in the same order with the same locations and reasons, and
  identical `errorsText` summaries under default options, `allErrors: true`, and
  each option that rewrites data (`coerceTypes`, `useDefaults`,
  `removeAdditional`).
- `test/drop-in.test.js` copies the existing project fixture, runs its normal
  validation path with ajv, repoints `node_modules/ajv` at this package without
  editing the project's code, schemas, or configuration, runs the same path, and
  requires identical output — verdicts together with the printed error reports
  and summaries — for fully valid, partly invalid, and wholly invalid documents.
- `test/fixtures/existing-project` contains the unchanged project used by that
  check.

## Layout

- `index.js`, `index.mjs`, `index.d.ts` – CommonJS, ESM, and TypeScript entry points.
- `lib/ajv.js` – Ajv-compatible class and schema registry.
- `lib/compile.js` – reference resolution, verdict evaluation, and error reporting.
- `lib/uri.js`, `lib/util.js` – URI, pointer, and comparison helpers.
- `lib/refs/json-schema-draft-07.json` – draft-07 meta-schema used for meta refs.
- `test/` – verification scripts and unchanged third-party fixtures.
