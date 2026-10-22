# Source

`json-schema-draft-07.json` is the draft-07 meta-schema shipped by the ajv
package (ajv-validator/ajv, MIT). It is registered as the default meta-schema so
that `$ref` targets such as `http://json-schema.org/draft-07/schema#` resolve and
validate exactly as they do in ajv.

`json-schema-2019-09/` contains the 2019-09 meta-schema and its vocabulary
meta-schemas (`meta/core`, `meta/applicator`, `meta/validation`,
`meta/meta-data`, `meta/format`, `meta/content`), copied unmodified from the
same package. They are registered by the `ajv/dist/2019` entry point so that
`https://json-schema.org/draft/2019-09/schema` and its `meta/*` references
resolve and validate exactly as they do in ajv.

`json-schema-2020-12/` contains the 2020-12 meta-schema and its vocabulary
meta-schemas (`meta/core`, `meta/applicator`, `meta/unevaluated`,
`meta/validation`, `meta/meta-data`, `meta/format-annotation`, `meta/content`),
copied unmodified from the same package. They are registered by the
`ajv/dist/2020` entry point so that
`https://json-schema.org/draft/2020-12/schema` and its `meta/*` references
resolve and validate exactly as they do in ajv. The `dist/refs/` copies mirror
these files for the package's published `dist/refs/*` imports.

`jtd-schema.json` is the JSON Type Definition meta-schema ajv builds in
`dist/refs/jtd-schema.js` (ajv-validator/ajv, MIT), written out as JSON. It is
registered by the `ajv/dist/jtd` entry point under ajv's `JTD-meta-schema`
identifier and is the schema every JSON Type Definition schema is validated
against, so malformed schemas are rejected at the same point and with the same
message as in ajv.
