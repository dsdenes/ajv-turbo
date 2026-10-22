# ajv-compatible JSON Schema validator

A dependency-free replacement for the `ajv` package on Node.js 24. It exposes the
`ajv` API and, for schemas that use the core validation keywords of ajv's default
schema dialect (JSON Schema draft-07), the formats and the custom keywords the
host project registers, returns the same valid or invalid verdict and the same
error report as ajv. Schemas marked `$async: true`, asynchronous custom
validation rules, and asynchronous format rules produce the same settled
outcomes, reports, and validated data as ajv; schemas that do not request
asynchronous validation keep validating synchronously and immediately.

## Covered subset

Schemas may use these draft-07 keywords and the annotations that do not affect a
verdict:

`$schema`, `$id`, `$ref`, `$comment`, `$async`, `title`, `description`, `default`,
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
ajv.addFormat("reserved", {                          // asynchronous rule
  type: "string",
  async: true,
  validate: async (value) => (await lookup(value)) === null,
});
const ajv = new Ajv({formats: {initial: /^i/}});       // constructor option
```

An asynchronous format may only be used by a schema marked `$async: true`; ajv
rejects the schema at compile time otherwise with `async format in sync schema`,
and this package does the same.

A definition without `type` applies to strings. A definition with `type:
"number"` applies to numbers (including integers) and leaves strings untouched;
a string definition leaves non-strings untouched. `validateFormats: false`
disables every format rule, including the check for formats the project never
registered.

## Custom keywords

Keywords the host registers as a validation rule — synchronous or asynchronous —
are enforced with ajv's calling convention, placement, and error report:

```js
ajv.addKeyword({
  keyword: "port",                                     // schema value: the limit
  type: "number",                                      // only numbers are checked
  validate: (limit, value, parentSchema, dataCxt) =>
    Number.isInteger(value) && value >= 1 && value <= limit,
});

ajv.addKeyword({
  keyword: "available",                                // asynchronous rule
  type: "string",
  async: true,
  validate: async (required, value) => !(await taken(value)),
});

ajv.addKeyword("slug", {validate: (enabled, value) => /^[a-z0-9-]+$/.test(value)});
// the deprecated two-argument form is accepted and warns as ajv does
```

An asynchronous rule is used only by a schema marked `$async: true`; ajv rejects
a synchronous schema that uses one with `async keyword in sync schema`.

- `validate(schemaValue, data, parentSchema, dataCxt)` is called with `this` set
  to the Ajv instance, where `schemaValue` is the keyword's value in the schema
  and `dataCxt` is `{instancePath, parentData, parentDataProperty, rootData}`.
  With `schema: false` in the definition it is called as
  `validate(data, dataCxt)`.
- `type` may be one JSON type or an array of them. A keyword declared for a type
  runs only for values of that type: other values are treated exactly as ajv
  treats them, and the schema's remaining rules are unaffected. A keyword
  declared for `integer`, `boolean`, or `null` forms its own rule group, as in
  ajv.
- Untyped keywords run after the standard untyped rules; typed keywords run at
  the end of their type's rule group. Registration order decides the order among
  keywords in the same group, so error entries appear in ajv's order.
- A failing keyword reports `{keyword, params: {}, message: must pass "<keyword>
  keyword validation"}` at the keyword's `schemaPath`. With `errors: true` the
  rule may assign an array of error objects to the validate function's `errors`
  property; they are merged with the same `instancePath`/`schemaPath` fill-in
  ajv applies. An asynchronous rule with `errors: true` must instead reject with
  `new ValidationError(errors)` to supply its own entries; ajv ignores an
  `errors` property assigned by an asynchronous rule and reports the generic
  failure, and this package does the same. Rejections that are not a
  `ValidationError` propagate to the caller. `modifying: true` re-reads the value
  the rule wrote through `dataCxt.parentData`.
- A keyword registered without a rule (`addKeyword("name")` or a definition
  without a validate function) is known to the validator but does not take part
  in validation. `removeKeyword` stops enforcing a keyword; compiled validators
  keep the keywords they were compiled with.

Out of scope, and not claimed to match ajv: custom keyword forms other than a
validation rule (`code`, `macro`, `compile`, `post`, `before`, `implements`,
`$data`), standalone validators, schema dialects other than draft-07, errors
raised while compiling an invalid schema or an invalid keyword definition, and
throughput.

## Asynchronous validation

A schema marked `$async: true` validates through a promise, like ajv's:

```js
const validate = ajv.compile({$async: true, type: "object", required: ["id"]});
try {
  const data = await validate(document);   // resolves with the validated data
} catch (error) {
  if (error instanceof Ajv.ValidationError) {
    console.log(error.errors);             // same entries, order, and mode as ajv
  }
}
```

- A valid document resolves to the validated data, including values changed by
  `coerceTypes`, `useDefaults`, or a `modifying` rule. An invalid document rejects
  with a `ValidationError` whose `errors` carries the report; `validate.errors`
  stays `null`, exactly as ajv leaves it for asynchronous validators.
- `ajv.validate(schema, data)` returns that promise for an asynchronous schema
  and returns a boolean for a synchronous one.
- `allErrors` behaves as it does for synchronous validation: the default mode
  reports the first failure, and `allErrors: true` reports the complete list in
  ajv's order and number.
- `$async` may appear on a schema that references other schemas. A referenced
  schema that itself contains references compiles as its own schema, exactly as
  in ajv, so its `$async` flag decides whether asynchronous rules are legal
  inside it. A synchronous schema may not contain `$async`, reference an
  asynchronous schema, or use an asynchronous keyword or format; each fails at
  compile time with ajv's message.
- Schemas that do not request asynchronous validation are unaffected: they
  return their verdict immediately, never as a promise.

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

## Benchmark

`npm run bench` measures this package against the published ajv benchmark suite
and writes a report. The suite is
[`json-schema-benchmark`](https://github.com/ebdrup/json-schema-benchmark) at
commit `e9c884f9edd38438a150fef0e9a2a1173c0fcc50`, the performance benchmark
referenced from ajv's README, together with its JSON-Schema-Test-Suite submodule
pinned at commit `bcf1dc81ae099ade2a9642c672c06ee1af1bb489`. Both validators are
constructed the way the suite constructs ajv (`{schemaId: "auto"}` with every
remote schema registered under `localhost:1234`), and every case is measured
with Benchmark.js using the suite's own procedure: one iteration validates every
document of the case, and each target runs under the library's default
minTime/maxTime/minSamples settings.

The runner:

- compiles every published case with both validators and excludes, as the
  published runner does for a validator that fails a test, the cases whose
  schema one of them cannot compile (the report lists them);
- validates every document of every included case with both validators and
  fails if any verdict differs;
- reports per-case throughput for both validators, the per-case ratio, the
  geometric mean of those ratios, and whole-suite throughput;
- records the exact Node.js and V8 version, both suite commits, the replacement
  commit, the machine, and the measurement settings.

The final measurement is kept in [`bench/REPORT.md`](bench/REPORT.md). Use
`--markdown=<path>` and `--json=<path>` to write the results elsewhere, and
`--minimum=<ratio>` to change the required geometric mean (default `1.2`).

```sh
npm run bench -- --markdown=bench/REPORT.md --json=bench/report.json
```

## Verification

```sh
npm install
npm test        # verdicts, error reports, formats, keywords, async validation, and the drop-in projects
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
- `test/keywords.test.js` registers custom keywords in both validators — untyped
  and typed, in every schema position, in composite rules, in referenced and
  registered schemas, with `errors: true`, `modifying`, and `schema: false` — and
  requires identical verdicts, error reports, summaries, keyword arguments, and
  validated data under five option combinations. It also runs the project fixture
  through its normal validation path with ajv, substitutes this package for ajv
  without editing the project, and requires identical output.
- `test/drop-in.test.js` copies the existing project fixture, runs its normal
  validation path with ajv, repoints `node_modules/ajv` at this package without
  editing the project's code, schemas, or configuration, runs the same path, and
  requires identical output — verdicts together with the printed error reports
  and summaries — for fully valid, partly invalid, and wholly invalid documents.
  The fixture registers its formats with `addFormat` before compiling.
- `test/async.test.js` requires identical settled outcomes, error entries,
  reports, and validated data for `$async` schemas, asynchronous custom keywords
  (typed, untyped, `errors: true`, `errors: false`, `modifying`, `schema: false`,
  and rule rejections), asynchronous formats, references, and both reporting
  modes. It also requires synchronous validators to keep returning immediately,
  and it repeats the drop-in substitution for three unchanged projects that
  validate asynchronously:
  `test/fixtures/async-project` (schemas marked `$async`, including a
  synchronous schema in the same service), `test/fixtures/async-keyword-project`
  (asynchronous custom keywords), and `test/fixtures/async-format-project`
  (asynchronous formats registered through `addFormat` and the constructor
  option).
- `test/benchmark.test.js` validates every document of every published benchmark
  case through an unchanged project that imports `ajv`, then repoints
  `node_modules/ajv` at this package without editing the project, its schemas,
  or its documents, and requires the same verdict for every case and document.
- `test/fixtures/benchmark-project` contains the unchanged project used by that
  check; the case list it receives is built from the published corpus.
- `test/fixtures/existing-project` contains the unchanged project used by that
  check.
- `test/fixtures/keyword-project` contains the unchanged project that registers
  custom keywords, used by the keyword check.

## Layout

- `index.js`, `index.mjs`, `index.d.ts` – CommonJS, ESM, and TypeScript entry points.
- `lib/ajv.js` – Ajv-compatible class and schema registry.
- `lib/compile.js` – reference resolution, verdict evaluation, and error reporting.
- `lib/fast.js` – verdict-only code generator for the synchronous covered subset.
- `bench/runner.js` – published benchmark suite comparison and report.
- `lib/uri.js`, `lib/util.js` – URI, pointer, and comparison helpers.
- `lib/refs/json-schema-draft-07.json` – draft-07 meta-schema used for meta refs.
- `test/` – verification scripts and unchanged third-party fixtures.
