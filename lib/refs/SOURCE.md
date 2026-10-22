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
