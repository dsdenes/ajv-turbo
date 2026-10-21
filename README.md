# ajv-compatible JSON Schema validator

A dependency-free replacement for the `ajv` package on Node.js 24. It exposes the
`ajv` API and, for schemas that use the core validation keywords of ajv's default
schema dialect (JSON Schema draft-07) and the formats the host project registers,
returns the same valid or invalid verdict and the same error report as ajv.

## Covered subset

Schemas may use these draft-07 keywords and the annotations that do not affect a
verdict:

`$schema`, `$id`, `$ref`, `$comment`, `title`, `description`, `default`,
`examples`, `readOnly`, `writeOnly`, `definitions`, `type`, `enum`, `const`,
`multipleOf`, `maximum`, `exclusiveMaximum`, `minimum`, `exclusiveMinimum`,
`maxLength`, `minLength`, `pattern`, `format`, `items`, `additionalItems`,
`maxItems`, `minItems`, `uniqueItems`, `contains`, `maxProperties`,
`minProperties`, `required`, `properties`, `patternProperties`,
`additionalProperties`, `dependencies`, `propertyNames`, `if`, `then`, `else`,
`allOf`, `anyOf`, `oneOf`, `not`.

Boolean schemas and references are supported, including `$id` base changes,
location-independent anchors, JSON pointers, recursive schemas, and schemas
registered with `addSchema` (for example the remote schemas used by the published
benchmark suite). The Ajv options that affect verdicts or error reports are
honoured: `allErrors`, `strictNumbers`, `unicodeRegExp`, `ownProperties`,
`coerceTypes`, `useDefaults`, `removeAdditional`, `multipleOfPrecision`,
`nullable`, `validateFormats`, and `formats`.

## Formats

The `format` keyword is enforced against the definitions the host registers
through ajv's extension surface, and produces ajv's verdict and error report:

```js
ajv.addFormat("handle", /^[a-z][a-z0-9_]*$/);          // pattern
ajv.addFormat("slug", "^[a-z][a-z0-9-]*$");            // string pattern
ajv.addFormat("even", (value) => value % 2 === 0);     // function
ajv.addFormat("positive", {type: "number", validate: (value) => value > 0});
ajv.addFormat("hex", {type: "string", validate: /^[0-9a-f]+$/});
const ajv = new Ajv({formats: {initial: /^i/}});       // constructor option
```

A definition without `type` applies to strings. A definition with `type:
"number"` applies to numbers (including integers) and leaves strings untouched;
a string definition leaves non-strings untouched. `validateFormats: false`
disables every format rule, including the check for formats the project never
registered.

Out of scope, and not claimed to match ajv: custom keywords, asynchronous
validation, standalone validators, schema dialects other than draft-07, errors
raised while compiling an invalid schema, and throughput.

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
npm test        # verdicts, error reports, formats, and the drop-in project
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
- `test/formats.test.js` registers every accepted form of format definition in
  both validators and requires identical verdicts, error reports, and summaries
  across data types and schema positions, in both reporting modes, with
  `validateFormats: false`, and for a strict-mode project.
- `test/drop-in.test.js` copies the existing project fixture, runs its normal
  validation path with ajv, repoints `node_modules/ajv` at this package without
  editing the project's code, schemas, or configuration, runs the same path, and
  requires identical output — verdicts together with the printed error reports
  and summaries — for fully valid, partly invalid, and wholly invalid documents.
  The fixture registers its formats with `addFormat` before compiling.
- `test/fixtures/existing-project` contains the unchanged project used by that
  check.

## Layout

- `index.js`, `index.mjs`, `index.d.ts` – CommonJS, ESM, and TypeScript entry points.
- `lib/ajv.js` – Ajv-compatible class and schema registry.
- `lib/compile.js` – reference resolution, verdict evaluation, and error reporting.
- `lib/uri.js`, `lib/util.js` – URI, pointer, and comparison helpers.
- `lib/refs/json-schema-draft-07.json` – draft-07 meta-schema used for meta refs.
- `test/` – verification scripts and unchanged third-party fixtures.
