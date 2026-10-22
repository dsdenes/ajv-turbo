# ajv-compatible JSON Schema validator

A dependency-free replacement for the `ajv` package on Node.js 24. It exposes the
`ajv` API and, for schemas that use ajv's default draft-07 dialect, its JSON
Schema 2019-09 and 2020-12 dialects, or its JSON Type Definition validator,
together with the formats, the custom keywords, and the discriminator option the
host project uses, returns the same valid or invalid verdict and the same error
report as ajv.
JSON Type Definition schemas also produce the same JSON text through the
serializer and read JSON text at the parser's offsets, reporting the parser's
messages and positions.
Schemas marked `$async: true`, asynchronous custom validation rules, and
asynchronous format rules produce the same settled outcomes, reports, and
validated data as ajv; schemas that do not request asynchronous validation keep
validating synchronously and immediately.

Entry points mirror ajv's:

|Import|Dialect|
|---|---|
|`require("ajv")` / `import Ajv from "ajv"`|draft-07 (ajv's default)|
|`require("ajv/dist/2019")` / `import Ajv2019 from "ajv/dist/2019"`|2019-09|
|`require("ajv/dist/2020")` / `import Ajv2020 from "ajv/dist/2020"`|2020-12|
|`require("ajv/dist/jtd")` / `import AjvJTD from "ajv/dist/jtd"`|JSON Type Definition|


## JSON Schema 2019-09

`ajv/dist/2019` exposes the 2019-09 dialect under the same class and options as
ajv's `Ajv2019`, including its default meta-schema. A project that imports that
entry point keeps its code, schemas, and configuration unchanged.

On top of the draft-07 keywords below, the 2019-09 surface implements:

`$defs`, `$anchor`, `$recursiveAnchor`, `$recursiveRef`, `$dynamicAnchor`,
`$dynamicRef`, `$vocabulary`, `dependentRequired`, `dependentSchemas`,
`minContains`, `maxContains`, `unevaluatedProperties`, and `unevaluatedItems`,
along with the 2019-09 meta-schema and its vocabulary meta-schemas
(`meta/core`, `meta/applicator`, `meta/validation`, `meta/meta-data`,
`meta/format`, `meta/content`).

- Recursive and dynamic references resolve against the dynamic anchors of the
  current validation call, exactly as ajv resolves them; an `$anchor` is a
  location-independent identifier for `$ref`.
- `contains` honours `minContains` and `maxContains`, including ajv's error
  parameters and messages, and its rule that `minContains: 0` without
  `maxContains` disables the keyword.
- Evaluated property names and item counts are tracked through `properties`,
  `patternProperties`, `additionalProperties`, `items`, `additionalItems`,
  `contains`, references, and the applicators, so `unevaluatedProperties` and
  `unevaluatedItems` see exactly what ajv sees, including through `$ref`,
  `allOf`, `anyOf`, `oneOf`, `if`/`then`/`else`, dependencies, and dependent
  schemas.
- The 2019-09 meta-schema validates schemas the way ajv's does, so malformed
  `$id`, `$anchor`, and keyword values are rejected at the same point and with
  the same message.

## JSON Schema 2020-12

`ajv/dist/2020` exposes the 2020-12 dialect under the same class and options as
ajv's `Ajv2020`, including its default meta-schema. A project that imports that
entry point keeps its code, schemas, and configuration unchanged.

The 2020-12 surface keeps the dynamic-reference, dependent-requirement,
bounded-contains, and unevaluated vocabularies that 2019-09 introduced, and adds
`prefixItems` and a schema-valued `items` that validates the items after
`prefixItems`, along with the 2020-12 meta-schema and its vocabulary
meta-schemas (`meta/core`, `meta/applicator`, `meta/unevaluated`,
`meta/validation`, `meta/meta-data`, `meta/format-annotation`, `meta/content`).

- `prefixItems` validates the tuple prefix and `items` validates every item
  after it; `additionalItems` is not part of the dialect and is ignored, as in
  ajv. A boolean `items: false` reports ajv's limit error with the same
  parameters and message, and a schema-valued `items` reports per-item errors
  at the `items` schema path.
- `$dynamicAnchor` and `$dynamicRef` resolve against the dynamic anchors of the
  current validation call, exactly as ajv resolves them, including anchors
  reached through a referenced schema.
- `dependentRequired`, `dependentSchemas`, and bounded `contains` behave as
  they do in 2019-09, with ajv's error reports.
- Evaluated property names and item counts are tracked through `prefixItems`,
  `items`, `contains`, references, and the applicators, so
  `unevaluatedProperties` and `unevaluatedItems` see exactly what ajv sees.
- Annotations (`title`, `description`, `default`, `examples`, `readOnly`,
  `writeOnly`, `deprecated`, `$comment`, `contentEncoding`,
  `contentMediaType`, `contentSchema`) never change a verdict; `default` still
  feeds `useDefaults`.
- The 2020-12 meta-schema validates schemas the way ajv's does, so malformed
  `$id`, `$anchor`, `$dynamicAnchor`, `prefixItems`, `items`, and
  out-of-range keyword values are rejected at the same point and with the same
  message.

The options that rewrite a validated document (`coerceTypes`, `useDefaults`,
`removeAdditional`) and asynchronous validation behave as they do for the other
dialects. As in ajv, `useDefaults` does not assign defaults from
`prefixItems`; only object `properties` supply defaults.

## JSON Type Definition

`ajv/dist/jtd` exposes ajv's JSON Type Definition validator under the same class
and options as ajv's `Ajv` for that dialect. A project that imports that entry
point keeps its code, schemas, and configuration unchanged.

The whole dialect is implemented: empty schemas, `type` with every JSON Type
Definition type (including `timestamp` and the ranged integer types), `enum`,
`elements`, `properties` with `optionalProperties` and `additionalProperties`,
`discriminator` with its `mapping`, `values`, `ref` with `definitions`,
`nullable`, and `metadata` (ajv's extension, whose `union` form is a schema in
its own right). Schemas are validated against ajv's JSON Type Definition
meta-schema, so a schema ajv accepts compiles here and a schema ajv rejects is
rejected with the same message, including the compile-time rules ajv applies on
top of the meta-schema:

- `enum` must have a non-empty array of unique items.
- `properties` and `optionalProperties` may not share a member.
- A discriminator tag may not be a member of the mapping's properties, and a
  mapping member may not be `nullable`.
- `ref` must name a member of `definitions`; otherwise compilation fails with
  ajv's `No definition <ref>` error.
- Keywords outside the dialect are rejected by the meta-schema, and a keyword
  used in a schema location that forbids it fails with ajv's message, for
  example `JTD: "type" cannot be used in this schema location`.

Options that affect a JSON Type Definition verdict or report are honoured:
`allErrors`, `verbose`, `messages`, `removeAdditional`, `ownProperties`,
`strictNumbers`, `int32range`, `timestamp`, `allowDate`, `inlineRefs`,
`strict`/`strictSchema`, `meta`, `validateSchema`, and `schemaId`.
`addSchema`, `getSchema`, `removeSchema`,
`validate`, `validateSchema`, `errorsText`, and `defaultMeta` behave as they do
for the other dialects, and registered custom keywords work where ajv's
meta-schema admits them — inside `metadata`.

`$async` is not part of the dialect (ajv's JSON Type Definition meta-schema
rejects it), but a schema that carries it compiles with `validateSchema: false`
and settles through a promise exactly as ajv's does: it resolves with the
validated document and rejects with a `ValidationError` carrying the report. A
synchronous schema that contains an asynchronous subschema is rejected at
compile time with ajv's message.

`compileSerializer(schema)` returns the function that turns a value into JSON
text, with ajv's text for the same schema and value:

```js
const AjvJTD = require("ajv/dist/jtd");
const serialize = new AjvJTD().compileSerializer(schema);
const text = serialize(value);
```

- Every form is written: empty schemas through `JSON.stringify`, `type` with
  `timestamp` dates as ISO strings and the remaining types as their JavaScript
  text, `enum` as a quoted string, `elements` as an array, `values` as an
  object, `properties`/`optionalProperties`/`additionalProperties`,
  `discriminator` with its mapping, and `ref` into `definitions`, including
  recursive definitions.
- Required properties are written in schema order. Optional properties are
  written only when the value is not `undefined` and the property is the
  value's own. Additional properties follow when allowed. `nullable` writes
  `null` for `null` and `undefined`; `metadata` and a schema that carries only
  `definitions` are annotations.
- `specialNumbers: "null"` writes non-finite numbers as `null`; the default and
  `"fast"` write their JavaScript text. `ownProperties` restricts dictionaries
  and additional properties to the value's own keys.
- The schema is validated where ajv validates it, so a schema ajv accepts for
  serialization compiles and a schema ajv rejects is rejected with the same
  message, including `No definition <ref>`.
- Like ajv, the serializer trusts its input: it does not validate the value,
  and a value of the wrong shape can throw a `TypeError` instead of producing
  text.

`compileParser(schema)` returns the function that reads JSON text into a value,
with ajv's parsed value, messages, and offsets for the same schema and text:

```js
const AjvJTD = require("ajv/dist/jtd");
const parse = new AjvJTD().compileParser(schema);
const value = parse(text);
if (value === undefined) {
  console.log(parse.message, parse.position);
}
```

- Every form is read: empty schemas through `JSON.parse`, `type` with strings,
  booleans, numbers, every ranged integer type, and timestamps, `enum`,
  `elements`, `values`, `properties`/`optionalProperties` with
  `additionalProperties`, `discriminator` with its mapping, `ref` into
  `definitions` including recursive definitions, `nullable`, and `metadata`
  (which, as in ajv, does not change what the parser accepts).
- The parser is not `JSON.parse`: it skips the same four whitespace characters,
  accepts the same document shapes, rejects trailing commas and whitespace
  before an otherwise empty object or array, limits integer digit counts the
  same way, and consumes strings with the same escape handling. Text that does
  not fit reports `unexpected token <character>` or `unexpected end` at the
  same offset ajv reports, and a well-formed document that does not match the
  schema reports ajv's reason at ajv's offset, for example
  `integer out of range`, `missing required properties`,
  `property <name> not allowed`, `discriminator tag not found`,
  `discriminator value not in schema`, or `invalid timestamp`.
- `parse.position` and `parse.message` describe the last call and are unset
  before a successful one. Parsing is synchronous: the value, or `undefined`
  for a failure, is returned immediately, never as a promise.
- `allowDate` and `parseDate` behave as they do in ajv; with `parseDate`,
  timestamps become `Date` values. `int32range: false` relaxes the `int32` and
  `uint32` digit limit the same way.
- The schema is validated where ajv validates it, so a schema ajv accepts for
  parsing compiles and a schema ajv rejects is rejected with the same message,
  including `No definition <ref>`. Parser compilation shares ajv's schema cache
  with `compileSerializer`, so an identified schema produces both.

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
honoured: `allErrors`, `verbose`, `messages`, `strictNumbers`, `unicodeRegExp`,
`ownProperties`, `coerceTypes`, `useDefaults`, `removeAdditional`,
`multipleOfPrecision`, `nullable`, `validateFormats`, `formats`, `$data`, and
`discriminator`.

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

### ajv's formats plugin

A project can load ajv's official `ajv-formats` plugin without changing it:

```js
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const ajv = new Ajv();
addFormats(ajv);                       // default formats and range keywords
addFormats(ajv, {mode: "fast"});       // the plugin's fast definitions
const validate = ajv.compile({type: "string", format: "email"});
```

The plugin registers its format definitions through `addFormat`, so the
`format` keyword judges every format it defines — `date`, `time`, `date-time`,
`iso-time`, `iso-date-time`, `duration`, `uri`, `uri-reference`,
`uri-template`, `url`, `email`, `hostname`,
`ipv4`, `ipv6`, `regex`, `uuid`, the JSON-pointer formats, `byte`, `int32`,
`int64`, `float`, `double`, `password`, and `binary` — with the same verdict,
error entry, and `errorsText` summary as ajv, through the draft-07, 2019-09, and
2020-12 entry points. The fast mode produces ajv's fast-mode verdicts for the
same schemas and documents.

With its default options the plugin also registers `formatMinimum`,
`formatMaximum`, `formatExclusiveMinimum`, and `formatExclusiveMaximum`. Those
compare the value against a literal or, with `$data`, against a location in the
document, including a format name read from another field; they report ajv's
error entry, params, message, and position, and accept the boundary the same
way. The values the comparison can use are the plugin's `compare` functions, so
it refuses a format without one at compile time with ajv's message. A range
keyword also enforces the plugin's `dependencies` declaration: a schema that
uses one without a `format` keyword is refused with ajv's message.

`addFormats.get(name, mode)` and its `Unknown format "<name>"` refusal work
unchanged. The plugin's own imports of `ajv` and `ajv/dist/compile/codegen`
resolve against this package: the public `KeywordCxt` and the code helpers
(`_`, `str`, `stringify`, `nil`, `Name`, `operators`, `or`, `getProperty`) are
exported where the plugin expects them. The package itself does not depend on
the plugin; a project that never loads it behaves as before.

## Data references

With ajv's `$data` option enabled, a keyword value may name a location in the
document being validated instead of holding a literal value:

```js
const ajv = new Ajv({$data: true});
const validate = ajv.compile({
  type: "object",
  properties: {
    limit: {type: "number"},
    value: {type: "number", maximum: {$data: "/limit"}},
  },
});
validate({limit: 5, value: 9});   // false: "must be <= 5"
```

- The reference is an absolute JSON pointer (`"/limit"`, `"/a/b"`, with `~0`
  and `~1` escapes) or ajv's relative form (`"1/limit"`, `"0#"`). It resolves
  against the root document, so the same location is read at every depth.
- The keywords ajv gives data-reference support are covered: `maximum`,
  `minimum`, `exclusiveMaximum`, `exclusiveMinimum`, `multipleOf`, `maxLength`,
  `minLength`, `pattern`, `format`, `maxItems`, `minItems`, `uniqueItems`,
  `maxProperties`, `minProperties`, `required`, `enum`, and `const`.
- A reference whose location is absent leaves the keyword passing, exactly as
  ajv does. A reference whose value has a type the keyword cannot use produces
  ajv's report: the keyword's ordinary error with the resolved value for the
  comparison, length, item, property, `pattern`, `format`, `const`, and
  `multipleOf` rules, and `"<keyword>" keyword must be <type> ($data)` for
  `required`, `enum`, and `uniqueItems`.
- Verdicts and reports match ajv under default, complete, extended, and
  message-free reporting, including verbose `schema` (the literal
  `{$data: "..."}` object) and `parentSchema`.
- A registered custom validation rule that declares `$data: true` receives the
  resolved value as its schema argument; a rule that does not declare support
  receives the literal schema value. A definition may also declare
  `schemaType`; ajv then reports its `$data` type error when the resolved value
  has another type.
- Without the option, a schema that uses a reference where a literal value is
  expected is rejected at compile time with ajv's message, and a project that
  never enables `$data` is unaffected.
- Standalone generation carries the option: a generated validator reads the
  same locations from the document and produces the same verdict and report as
  ajv's generated validator, including documents where the location is absent
  or holds a value of the wrong type. A `format` whose name comes from the
  document needs the formats code `code.formats` names, exactly as ajv's
  generated module does; without it generation fails with ajv's
  `CodeGen: "code" for formats… not defined` error. Validators generated for
  schemas without references are unchanged.

## Discriminators

With ajv's `discriminator` option enabled, a tagged union validates only the
`oneOf` branch its tag property selects:

```js
const Ajv = require("ajv");
const ajv = new Ajv({discriminator: true});
const validate = ajv.compile({
  type: "object",
  required: ["kind"],
  discriminator: {propertyName: "kind"},
  oneOf: [
    {properties: {kind: {const: "circle"}, radius: {type: "number"}}, required: ["radius"]},
    {properties: {kind: {const: "rect"}, width: {type: "number"}, height: {type: "number"}},
     required: ["width", "height"]},
  ],
});
validate({kind: "circle", radius: 2});   // true
validate({kind: "oval"});                // false: value of tag "kind" must be in oneOf
```

The `ajv`, `ajv/dist/2019`, and `ajv/dist/2020` constructors register the
keyword exactly as ajv does. A project keeps its constructor options, schema,
and validation code unchanged.

- A schema carrying the annotation must name `propertyName` and must have a
  `oneOf`; `mapping` is refused. Every member (or the schema its `$ref` names)
  must declare `properties[propertyName]` with a `const` or non-empty `enum` of
  distinct strings, and the tag must be required by the schema or by every
  member. A schema that breaks one of these rules is refused at compile time
  with ajv's message, and a schema ajv accepts compiles here.
- A tag that is not a string reports ajv's
  `tag "<name>" must be string`; a tag value outside the mapping reports
  `value of tag "<name>" must be in oneOf`. The selected member's own errors
  follow, at the paths ajv reports them.
- Entries carry ajv's `keyword`, `params` (`error`, `tag`, `tagValue`),
  `schemaPath`, and message under first-error and complete reporting, in the
  same order. `verbose: true` adds the same `schema`, `parentSchema`, and
  `data` context, and `messages: false` omits messages from the same entries.
- The selected member's evaluated properties and items reach the enclosing
  schema through `allOf`, `anyOf`, `oneOf`, `if`/`then`/`else`,
  `dependentSchemas`, and `$ref`, so `unevaluatedProperties` and
  `unevaluatedItems` see what ajv sees. This includes ajv's behaviour for a
  failed selected member.
- Without the option, the annotation is an ordinary unknown keyword: strict
  mode refuses the schema with `strict mode: unknown keyword: "discriminator"`,
  `strict: "log"` reports it, and with strictness off `oneOf` validates
  normally. Schemas and projects that do not use the annotation are unaffected
  whether the option is on or off.
- Generating a standalone validator for a schema that uses the annotation, and
  asynchronous validation of such a schema, are outside the covered surface.
  JSON Type Definition's own discriminator form is unchanged.

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

A keyword may instead be defined by a schema fragment that stands in for it —
ajv's macro form. The fragment is compiled at the keyword's location, so the
verdict and the report are the ones the fragment itself produces, followed by
ajv's entry for the keyword:

```js
ajv.addKeyword({
  keyword: "even",
  type: "number",
  macro: () => ({multipleOf: 2}),
});

ajv.addKeyword({
  keyword: "reuse",
  macro: (reference) => ({$ref: reference}),            // "https://example.test/even"
});
```

A keyword may also be defined by a rule compiled once from its value. The
compile step runs when the schema is compiled, once per schema location, and
returns the function that validates each document:

```js
ajv.addKeyword({
  keyword: "multiple",
  type: "number",
  compile(divisor) {                                  // runs at compile time
    return (value) => value % divisor === 0;          // runs per document
  },
});
```

A keyword may also contribute generated validation code, ajv's `code` form.
The `code` function runs once per schema location while the schema is compiled
and builds the rule with the compile-time context and ajv's code helpers:

```js
const {_, nil, str} = Ajv;

ajv.addKeyword({
  keyword: "startsWith",
  type: "string",
  schemaType: "string",
  code(cxt) {
    const {data, schema} = cxt;
    cxt.fail(_`${data}.indexOf(${schema}) !== 0`);
  },
});

ajv.addKeyword({
  keyword: "range",
  type: "number",
  schemaType: "array",
  metaSchema: {type: "array", items: {type: "number"}, minItems: 2, maxItems: 2},
  code(cxt) {
    const {schema, parentSchema, data} = cxt;
    const [min, max] = schema;
    const eq = parentSchema.exclusiveRange ? _`=` : nil;
    cxt.fail(_`${data} <${eq} ${min} || ${data} >${eq} ${max}`);
  },
});
```

The context exposes the current `data`, the keyword's `schema`, `schemaCode`
and `schemaValue`, `parentSchema`, the generator `gen`, `allErrors`, and the
schema compilation context `it`. `cxt.fail(condition)` reports the keyword's
error when the condition is true; `cxt.pass(condition)` reports it when the
condition is false; `cxt.result`, `cxt.ok`, and `cxt.error` cover the other
shapes ajv's own keywords use. `cxt.setParams(params)` supplies the values an
`error.params(context)` function reads, and an `error.message(context)`
function supplies the message. Without an `error` declaration the report is
ajv's `must pass "<keyword>" keyword validation` with empty params, at
`<schemaPath>/<keyword>`, with the same `instancePath`, `data`, `schema`, and
`parentSchema` fields as the other forms. `cxt.fail$data(condition)` folds the
document-sourced value checks into the condition, and `cxt.block$data` reports
the definition's `$dataError` for an unusable document value.

The generator `cxt.gen` provides the operations ajv's own keywords use:
`if`/`elseIf`/`else`/`endIf`, `const`/`let`/`var`, `assign`/`add`, `code`,
`forOf`/`forIn`/`forRange`, `break`/`continue`, `try`/`catch`, `name`,
`scopeValue`, `object`, and `ternary`. The `_`, `str`, `stringify`, `nil`, and
`Name` helpers are the ones exported by the package. A definition that also
declares `macro`, `compile`, or `validate` is executed as a code keyword, as in
ajv.

The remaining declarations ajv accepts on a definition are honoured as well:

```js
ajv.addKeyword({
  keyword: "port",
  metaSchema: {type: "integer", minimum: 1, maximum: 65535},  // value schema
  validate: () => true,
});

ajv.addKeyword({keyword: "owner", type: "object", before: "required", validate: check});
ajv.addKeyword({keyword: "approved", post: true, validate: check});
ajv.addKeyword({keyword: "bounded", implements: ["lowerBound", "upperBound"], validate: check});

ajv.addKeyword({
  keyword: "underLimit",
  $data: true,
  schemaType: "number",
  $dataError: {
    message: ({keyword}) => `"${keyword}" needs a number from the document`,
    params: () => ({reason: "document value"}),
  },
  validate: (limit, value) => value <= limit,
});
```

An asynchronous rule is used only by a schema marked `$async: true`; ajv rejects
a synchronous schema that uses one with `async keyword in sync schema`.

- `validate(schemaValue, data, parentSchema, dataCxt)` is called with `this` set
  to the Ajv instance, where `schemaValue` is the keyword's value in the schema
  and `dataCxt` is `{instancePath, parentData, parentDataProperty, rootData}`.
  With `schema: false` in the definition it is called as
  `validate(data, dataCxt)`.
- `compile(schemaValue, parentSchema)` is called once per schema location, with
  `this` set to the Ajv instance, when the schema is compiled. Its return value
  is the function that validates each document and is called as
  `validate(data, dataCxt)`, exactly as ajv calls a compiled rule. A keyword
  that declares both `compile` and `validate` uses the compiled rule for a
  literal value and the `validate` function when the value is a data reference.
  A compile step that returns `undefined` fails compilation with ajv's
  `keyword "<keyword>" failed to compile`.
- `metaSchema` is the schema the keyword's value must satisfy. It is compiled
  when the keyword is registered and checked when a schema that uses the keyword
  is compiled; an inadmissible value fails compilation with ajv's
  `keyword "<keyword>" value is invalid at path "<schema path>": <reason>`
  (logged instead of thrown when `validateSchema: "log"`). With the `$data`
  option, a reference stands in for the value and the resolved value is checked
  against the same schema at validation time.
- `before` names the keyword this one runs before, within the same rule group;
  a name that is not in the group appends the keyword and warns as ajv does.
  `post: true` runs the keyword after every other group, including the typed
  groups, and cannot be combined with `type`. `implements` names keywords this
  definition stands in for: they are registered as known keywords, and the rule
  runs when a schema uses any of them, receiving `undefined` as its schema
  value.
- `$dataError` supplies the report for a document-sourced value the keyword
  cannot use — a value of the wrong `schemaType`, or one its `metaSchema`
  rejects. Its `message(context)` and `params(context)` functions are called
  with `{keyword, schemaType, schema, parentSchema, data}`; without it, ajv's
  generic `"<keyword>" keyword must be <type> ($data)` (or
  `"<keyword>" keyword is invalid ($data)`) is reported.
- `macro(schemaValue, parentSchema)` is called once per schema location, with
  `this` set to the Ajv instance, when the schema is compiled. Its return value
  is validated as a schema (unless `validateSchema: false`) and compiled where
  the keyword stands: references inside it resolve as they do in any other
  subschema, including pointers into the parent schema and schemas registered
  with `addSchema`. A fragment that rejects the document reports its own entries
  under `<schemaPath>/<keyword>`, then `must pass "<keyword>" keyword validation`
  at the keyword, exactly as ajv reports a macro failure. A definition that
  carries both `macro` and `validate` is executed as a macro, as in ajv.
- `type` may be one JSON type or an array of them. A keyword declared for a type
  runs only for values of that type: other values are treated exactly as ajv
  treats them, and the schema's remaining rules are unaffected. A keyword
  declared for `integer`, `boolean`, or `null` forms its own rule group, as in
  ajv. This applies to both forms.
- Untyped keywords run after the standard untyped rules; typed keywords run at
  the end of their type's rule group. `before` moves a keyword to the named
  rule's place and `post` moves it after every group. Registration order decides
  the order among keywords in the same place, so error entries appear in ajv's
  order and first-error reporting stops at the same entry.
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
A keyword registered without a rule or a macro (`addKeyword("name")` or a
definition with neither a validate function, a compile function, nor a macro)
is known to the validator but does not take part in validation.
`removeKeyword` stops enforcing a keyword in either form; compiled validators
keep the keywords they were compiled with.

Definitions can also be supplied when the validator is created. The
constructor's `keywords` option takes an array of the same definitions — or,
for projects that still use it, ajv's deprecated name → definition map — and
`addVocabulary(definitions)` registers an array in bulk:

```js
const ajv = new Ajv({
  keywords: [
    {keyword: "port", type: "number", validate: checkPort},
    {keyword: "slug", validate: checkSlug},
  ],
});

ajv.addVocabulary(moreDefinitions);
```

Both routes register through the same path as `addKeyword`, after the dialect
meta-schemas, so rule order, placement, value schemas, rewritten values, and
error reports are identical however the project supplies its definitions.

Out of scope, and not claimed to match ajv: asynchronous keywords defined in
the generated-code form, the optional declarations described above on
the JSON Type Definition entry point, the JSON Type Definition parser, standalone
generation of those declarations (a generated validator carries the validation
rules and macros it carried before), schema dialects other than draft-07,
2019-09, 2020-12, and JSON Type Definition, errors raised while compiling an
invalid keyword definition, and throughput.

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
- With `verbose: true`, every entry also carries ajv's `schema` (the keyword's
  schema value), `parentSchema` (the schema object that contains it), and `data`
  (the value at the entry's location), with the same values and on the same
  entries as ajv. Entries a custom rule supplies through its `errors` property
  or a rejected `ValidationError` gain `schema` and `data` but no
  `parentSchema`, exactly as ajv extends them.
- With `messages: false`, entries generated from schema keywords omit
  `message`; every other property is unchanged. Entries a custom rule supplies
  keep their own `message`, as they do in ajv. `errorsText` derives the same
  summary ajv derives from the message-free report.

## Standalone validators

`ajv/dist/standalone` generates a standalone module for a compiled validator or
for registered schemas, exactly as ajv's standalone generator does:

```js
const fs = require("fs");
const Ajv = require("ajv");
const standaloneCode = require("ajv/dist/standalone");

const ajv = new Ajv({code: {source: true}});
const validate = ajv.compile(schema);

fs.writeFileSync("validate.js", standaloneCode(ajv, validate));
const validateDocument = require("./validate");   // no build step
```

- The generated module is self-contained: it carries the schema environment and
  the interpreter it validates with, and requires no package at run time.
- `standaloneCode(ajv, validate)` exports one validator as `module.exports` and
  `module.exports.default`. A map from export name to registered schema id
  exports one named validator per entry, and calling it with no second argument
  exports every schema registered on the instance (the meta-schema excluded),
  the way ajv's generator does.
- Generated validators return the same verdict, the same first error, and the
  same complete report in the same order as ajv's generated validators for the
  same schema and documents, including through references, applicators,
  conditionals, and the draft-07 keywords.
- The options the validator was compiled with are baked into the generated
  module, as they are in ajv's generated code. `allErrors` selects complete
  reporting; `verbose` and `messages` select the same extended context and
  message suppression as a directly compiled validator; `coerceTypes`,
  `useDefaults`, and `removeAdditional` rewrite the document through the
  generated validator exactly as they do through a directly compiled one.
- A `$async` schema generates an asynchronous validator that resolves with the
  validated document and rejects with an error carrying `errors`, matching
  ajv's generated asynchronous validators.
- Registered formats and registered custom keywords are carried into the
  generated module by the entry points that support them: draft-07, 2019-09,
  and 2020-12. A format defined by a RegExp or a pattern string is embedded
  directly. Any other format definition needs the code ajv's `code.formats`
  option names, and the generated module resolves its formats from that
  expression at load time; without it, generation fails with ajv's
  `CodeGen: "code" for formats… not defined` error. The `_`, `str`,
  `stringify`, `nil`, and `Name` code helpers are exported as ajv exports them,
  so a project that builds that expression keeps working. Custom validation rules,
  synchronous or asynchronous, and macro keywords are embedded as source, so
  the generated validator enforces the same rule with the same error report as
  a validator compiled on the instance. A definition that cannot be carried as
  source fails generation with ajv's error instead of being ignored. Because a
  rule travels as its own source, it must be self-contained: a function that
  closes over values defined outside its body cannot see them in the generated
  module.
- A schema compiled with ajv's `$data` option generates a validator that reads
  the referenced locations from the document at run time. Its verdict and
  report match ajv's generated validator under every reporting mode, including
  documents where the location is absent or holds a value of the wrong type. A
  `format` named by the document resolves from the `code.formats` expression at
  load time, as it does in ajv's generated module.
- `ajv/dist/standalone/instance` provides ajv's `AjvPack` wrapper, which
  generates and evaluates each compiled validator in memory.
- `dist/runtime/ucs2length`, `dist/runtime/equal`, and
  `dist/runtime/validation_error` mirror the runtime helpers ajv's generated
  modules require, so a validator that ajv generated keeps running after this
  package takes ajv's place.

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

`import Ajv from "ajv"` and `import {Ajv} from "ajv"` work as well. A project on
the 2019-09 dialect keeps importing the same entry point it already uses:

```js
const Ajv2019 = require("ajv/dist/2019");
const ajv = new Ajv2019();
```

`import Ajv2019 from "ajv/dist/2019"` and `import {Ajv2019} from "ajv/dist/2019"`
are supported too. A project on the 2020-12 dialect does the same with its entry
point:

```js
const Ajv2020 = require("ajv/dist/2020");
const ajv = new Ajv2020();
```

`import Ajv2020 from "ajv/dist/2020"` and `import {Ajv2020} from "ajv/dist/2020"`
work as well. A project on JSON Type Definition keeps its entry point too:

```js
const AjvJTD = require("ajv/dist/jtd");
const ajv = new AjvJTD();
```

`import AjvJTD from "ajv/dist/jtd"` and `import {Ajv} from "ajv/dist/jtd"` are
supported as well.

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
  identical `errorsText` summaries under default options, `allErrors: true`,
  `verbose`, `messages: false`, their combination, and each option that
  rewrites data (`coerceTypes`, `useDefaults`, `removeAdditional`).
- `test/reports.test.js` runs an unchanged project that imports `ajv`,
  `ajv/dist/2019`, `ajv/dist/2020`, `ajv/dist/jtd`, and `ajv/dist/standalone`
  and configures verbose and message-free reporting for built-in validation,
  custom rules, macros, asynchronous rules, and generated validators. The
  project runs first with ajv and then with this package in ajv's place; every
  printed report and `errorsText` summary must match.
- `test/fixtures/report-options-project` contains that unchanged project.
- `test/data-references.test.js` runs an unchanged project that enables ajv's
  `$data` option through the draft-07, 2019-09, and 2020-12 entry points. It
  compiles schemas whose keyword values are absolute and relative references,
  requires ajv's compile-time rejection when the option is off, and requires
  identical verdicts and reports for documents whose referenced value
  satisfies the keyword, violates it, is absent, or has the wrong type, under
  default, complete, extended, and message-free reporting. It also registers a
  custom rule that declares data-reference support and one that does not,
  compares the values each receives and its report entries, and repeats schemas
  without references with the option enabled, disabled, and omitted.
- `test/fixtures/data-reference-project` contains that unchanged project.
- `test/discriminator.test.js` runs an unchanged project that enables ajv's
  `discriminator` option through the draft-07, 2019-09, and 2020-12 entry
  points. It compiles tagged unions whose members each require their own
  property, validates documents through every member, an unknown tag, a
  non-string tag, a missing tag, a missing member property, an extra property,
  and non-object data, and requires identical verdicts, report entries in the
  same order, `errorsText` summaries, and extended context under first-error,
  complete, verbose, and message-free reporting. It also compares the
  compile-time refusals for every discriminator requirement, the missing
  reference report, the treatment of the annotation when the option is off
  under each strictness setting, evaluated names reaching
  `unevaluatedProperties`, and schemas that do not use the annotation with the
  option enabled.
- `test/fixtures/discriminator-project` contains that unchanged project.
- `test/conformance2019.test.js` runs the complete published JSON Schema
  2019-09 conformance corpus through `ajv/dist/2019` and this package's
  `dist/2019` entry, and requires identical verdicts for every case and
  identical error reports under both default and `allErrors` reporting.
- `test/conformance2020.test.js` does the same for the complete published JSON
  Schema 2020-12 conformance corpus through `ajv/dist/2020` and this package's
  `dist/2020` entry, and additionally requires that every schema ajv accepts
  compiles here and that every schema ajv's 2020-12 meta-schema rejects is
  rejected with the same message.
- `test/dialect2020.test.js` validates valid and invalid documents that exercise
  tuple `prefixItems` and schema-valued `items`, dynamic anchors and dynamic
  references, dependent requirements and dependent schemas, bounded contains,
  evaluated property and item tracking, and annotations that do not affect a
  verdict, plus rewriting, verbose, and message-free options and asynchronous
  validation. It also compares
  the compile-time rejection of malformed 2020-12 schemas and runs the unchanged
  2020-12 project fixture through its normal path twice — first with ajv, then
  after repointing `node_modules/ajv` at this package — and requires identical
  verdicts, reports, and rewritten documents.
- `test/dialect2019.test.js` validates documents through recursive references,
  anchors, dependent requirements, bounded contains, and unevaluated properties
  and items, combined with references and applicators, plus registered formats,
  custom keywords, asynchronous validation, and verbose and message-free
  reporting. It also runs the unchanged
  2019-09 project fixture through its normal path twice — first with ajv, then
  after repointing `node_modules/ajv` at this package — and requires identical
  verdicts, reports, and rewritten documents.
- `test/formats.test.js` registers every accepted form of format definition in
  both validators and requires identical verdicts, error reports, and summaries
  across data types and schema positions, in both reporting modes, with
  `validateFormats: false`, and for a strict-mode project.
- `test/formats-plugin.test.js` runs an unchanged project that loads ajv's
  official formats plugin and prints the verdict, report, and summary for every
  format the plugin defines — through the draft-07, 2019-09, and 2020-12 entry
  points, in both the default and fast modes, under first-error and complete
  reporting — for each range keyword's inside, outside, and boundary values,
  for a comparison value read from a sibling field, for the plugin's lookup and
  its unknown-format refusal, and for projects that never load the plugin. It
  runs the project first with ajv and then with this package in ajv's place
  without editing it, and requires every printed line to match.
- `test/fixtures/formats-plugin-project` contains that unchanged project.
- `test/keywords.test.js` registers custom keywords in both validators — untyped
  and typed, in every schema position, in composite rules, in referenced and
  registered schemas, with `errors: true`, `modifying`, and `schema: false` — and
  with both definition forms: validation functions and macros whose returned
  schema stands in for the keyword. It requires identical verdicts, error
  reports, summaries, keyword arguments, and validated data under eight option
  combinations, including verbose and message-free reporting. It also runs the project fixture through its normal validation
  path with ajv, substitutes this package for ajv without editing the project,
  and requires identical output.
- `test/programmatic-keywords.test.js` runs an unchanged project that defines
  all of its custom rules programmatically — on the validator instance and
  through the constructor's `keywords` option — through the draft-07, 2019-09,
  and 2020-12 entry points. It requires identical verdicts, reports, and
  rewritten documents under first-error, complete, message-free, and verbose
  reporting, including a rule that reports several violations at once, a rule
  whose rewrite decides a later rule's verdict, a compiled rule, and a macro.
- `test/keyword-forms.test.js` runs an unchanged project that defines custom
  keywords in both non-rule forms through the draft-07, 2019-09, and 2020-12
  entry points, with all errors and with first-error reporting, and requires the
  same verdicts and printed reports as ajv. The project exercises typed and
  untyped macros, fragments that refer to local and registered schemas, a
  function that reports its own error entries, and keyword removal.
- `test/code-keywords.test.js` runs an unchanged project whose custom keywords
  contribute generated validation code through the draft-07, 2019-09, and
  2020-12 entry points, under first-error, complete, verbose, and message-free
  reporting, and requires the same verdicts, reports, and compile-time errors
  as ajv. The project exercises a string rule, a number rule restricted to its
  type, a generated loop with its own params and messages, a rule with a value
  schema, a declared schema type, and a document-sourced value.
- `test/jtd.test.js` compiles every JSON Type Definition form — empty schemas,
  each type, enumeration, elements, properties with optional properties and
  additional properties, discriminators with their mappings, dictionaries,
  references to definitions, nullable forms, and metadata — together with
  schemas that combine forms and reach definitions through recursive `ref`, and
  requires identical verdicts, error entries, orders, and `errorsText`
  summaries from ajv's JSON Type Definition validator under default reporting,
  `allErrors`, `verbose`, `messages: false`, and `removeAdditional`. It compares
  the compile-time rejection of
  malformed schemas in both `compile` and `validateSchema`, checks the registry
  behaviour of the `ajv/dist/jtd` entry point, and runs the unchanged JSON Type
  Definition project fixture through its normal path twice — first with ajv,
  then after repointing `node_modules/ajv` at this package — requiring identical
  output. The same file drives `compileSerializer` over every form with the
  same schemas and values under default options, `specialNumbers: "null"`, and
  `ownProperties`, requiring the same text character for character, the same
  JSON value when the text is read back, the same acceptance and rejection of
  schemas with the same messages, and ajv's serializer caching and registry
  behaviour. It also drives `compileParser` over that whole schemas-and-forms
  corpus with text covering every form, malformed JSON, schema-invalid
  documents, integer limits, escapes, and whitespace quirks, under default
  options, `allowDate`, `parseDate`, and `int32range: false`, requiring the
  same parsed value, failure reason, position, and synchronous return; it
  compares parser compilation and caching with ajv's, then runs the unchanged
  parser project fixture twice and requires identical output.
- `test/fixtures/jtd-project` contains the unchanged project that imports
  `ajv/dist/jtd` and validates documents against definitions, discriminators,
  dictionaries, nested elements, recursive references, and metadata unions,
  with both first-error and complete reporting, registered schemas, and
  `ajv.validate`.
- `test/fixtures/jtd-serializer-project` contains the unchanged project that
  imports `ajv/dist/jtd` and turns telemetry values into JSON text with
  `compileSerializer`, covering empty schemas, types and timestamps (including
  in-memory `Date` values), enumerations, elements, properties with optional
  and additional members, discriminators, dictionaries, references, nullable
  forms, and metadata. It runs through its normal path with ajv and then with
  this package installed in ajv's place, requiring identical text.
- `test/fixtures/jtd-parser-project` contains the unchanged project that
  imports `ajv/dist/jtd` and reads JSON text with `compileParser`, covering
  empty and metadata schemas, every type and integer range, enumerations,
  nullable forms, arrays, records with optional and additional members,
  dictionaries, discriminators, recursive references, and dictionaries of
  records. Its inputs include valid documents, well-formed documents the schema
  rejects, and text that is not well-formed JSON; for each it prints the parsed
  value or the parser's reason and position, then validates and serializes the
  parsed value. The project also attempts schemas ajv refuses to compile for
  parsing and prints each refusal reason. It runs through its normal path with
  ajv and then with this package installed in ajv's place, requiring identical
  output.
- `test/drop-in.test.js` copies the existing project fixture, runs its normal
  validation path with ajv, repoints `node_modules/ajv` at this package without
  editing the project's code, schemas, or configuration, runs the same path, and
  requires identical output — verdicts together with the printed error reports
  and summaries — for fully valid, partly invalid, and wholly invalid documents.
  The fixture registers its formats with `addFormat` before compiling.
- `test/async.test.js` requires identical settled outcomes, error entries,
  reports, and validated data for `$async` schemas, asynchronous custom keywords
  (typed, untyped, `errors: true`, `errors: false`, `modifying`, `schema: false`,
  and rule rejections), asynchronous formats, references, and verbose and
  message-free reporting modes. It also requires synchronous validators to keep returning immediately,
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
- `test/rewrite.test.js` runs an unchanged project that combines registered
  formats, a registered custom keyword, an asynchronous `$async` schema, and the
  `coerceTypes`, `useDefaults`, and `removeAdditional` options through both
  validators, and requires the same verdicts, error reports, and rewritten data.
- `test/fixtures/benchmark-project` contains the unchanged project used by that
  check; the case list it receives is built from the published corpus.
- `test/fixtures/rewrite-project` contains the unchanged project that combines
  formats, a custom keyword, asynchronous validation, and rewriting options.
- `test/fixtures/existing-project` contains the unchanged project used by that
  check.
- `test/fixtures/keyword-project` contains the unchanged project that registers
  custom keywords, used by the keyword check.
- `test/fixtures/keyword-forms-project` contains the unchanged project whose
  custom keywords use schema fragments and validation functions; it selects the
  draft-07, 2019-09, or 2020-12 entry point from `DIALECT` and is used by the
  keyword-forms check.
- `test/fixtures/programmatic-keywords-project` contains the unchanged project
  that defines its custom rules programmatically, choosing the registration
  route (`addKeyword` or the constructor's `keywords` option) from
  `REGISTRATION` and the dialect from `DIALECT`; it is used by the programmatic
  keywords check.
- `test/fixtures/project-2019` contains the unchanged project that imports
  `ajv/dist/2019` and exercises recursive and dynamic references, dependent requirements,
  bounded contains, unevaluated tracking, formats, custom keywords,
  asynchronous validation, and rewriting options; it is used by the dialect
  and drop-in check.
- `test/fixtures/project-2020` contains the unchanged project that imports
  `ajv/dist/2020` and exercises dynamic references, prefix items and
  schema-valued items, dependent requirements, bounded contains, unevaluated
  tracking, formats, custom keywords, asynchronous validation, and rewriting
  options; it is used by the 2020-12 dialect and drop-in check.
- `test/standalone.test.js` generates standalone validators from ajv and from
  this package for the covered draft-07 corpus and the benchmark schemas,
  loads both in a plain Node.js program, and requires the same verdict, the
  same first error, the same complete report in the same order, and the same
  verbose context and message suppression for every document under default,
  complete, verbose, and message-free reporting. It also covers the export
  forms, options that rewrite data, `$async` validators, runtime-helper
  compatibility, and the unchanged project fixture below.
- `test/fixtures/standalone-project` contains the unchanged project that
  generates validators with `standaloneCode`, writes them into its own
  codebase, and requires them; it runs through its normal path first with ajv
  and then after this package takes ajv's place, and both runs must print the
  same verdicts and reports.
- `test/standalone-data-references.test.js` runs an unchanged project that
  generates standalone validators for a schema reading a numeric limit and the
  required member names from the document, and for a schema reading nothing
  from it. Both runs print every verdict, report, and `errorsText` summary
  under default, complete, verbose, and message-free reporting for documents
  the schema accepts, documents it rejects at each location it reads, and
  documents whose location is absent or holds an unusable type; every line must
  match. It also loads a generated data-reference validator in a separate
  Node.js process where the package cannot resolve.
- `test/fixtures/standalone-data-reference-project` contains that unchanged
  project.
- `test/fixtures/json-schema-test-suite-2020` holds the official 2020-12
  conformance corpus and remotes at the commit ajv's own test suite pins.

## Layout

- `index.js`, `index.mjs`, `index.d.ts` – CommonJS, ESM, and TypeScript entry points.
- `dist/jtd.js`, `dist/jtd.d.ts` – the published `ajv/dist/jtd` entry point.
- `dist/standalone.js`, `dist/standalone.d.ts` – the published
  `ajv/dist/standalone` entry point; `dist/standalone/instance.js` – `AjvPack`.
- `dist/runtime/` – runtime helpers ajv's generated modules require.
- `lib/ajv.js` – Ajv-compatible class and schema registry.
- `lib/standalone.js` – standalone module generation, and
  `lib/standalone-runtime.js` – the runtime embedded in generated modules.
- `lib/ajv2019.js` – the `ajv/dist/2019` class and its dialect switches.
- `lib/ajv2020.js` – the `ajv/dist/2020` class and its dialect switches.
- `lib/jtd.js` – the `ajv/dist/jtd` class, the JSON Type Definition compiler,
  its text generator, its text parser, and its error reporting.
- `lib/compile.js` – reference resolution, verdict evaluation, and error reporting.
- `lib/discriminator.js` – ajv's discriminator keyword, registered by the
  `discriminator` option.
- `lib/fast.js` – verdict-only code generator for the synchronous covered subset.
- `bench/runner.js` – published benchmark suite comparison and report.
- `lib/keyword-code.js` – ajv's code-keyword compile surface, including the
  `KeywordCxt` extension code builds against.
- `lib/uri.js`, `lib/util.js` – URI, pointer, and comparison helpers.
- `lib/refs/json-schema-draft-07.json` – draft-07 meta-schema used for meta refs.
- `lib/refs/json-schema-2019-09/` – the 2019-09 meta-schema and vocabulary
  meta-schemas registered by the 2019-09 class.
- `lib/refs/json-schema-2020-12/` – the 2020-12 meta-schema and vocabulary
  meta-schemas registered by the 2020-12 class; `dist/refs/` mirrors them for
  the published `dist/refs/*` imports.
- `test/` – verification scripts and unchanged third-party fixtures.
