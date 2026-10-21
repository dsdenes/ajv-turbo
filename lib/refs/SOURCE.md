# Source

`json-schema-draft-07.json` is the draft-07 meta-schema shipped by the ajv
package (ajv-validator/ajv, MIT). It is registered as the default meta-schema so
that `$ref` targets such as `http://json-schema.org/draft-07/schema#` resolve and
validate exactly as they do in ajv.
