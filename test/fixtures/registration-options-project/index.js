"use strict";

// An existing service that configures what its validator knows: whether the
// dialect's default meta-schema is registered, a meta-schema of its own,
// whether compiled schemas are registered automatically, and which identifier
// property schemas use. It is run unchanged with ajv and with the replacement
// installed in ajv's place; every printed line must match.

const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");

const results = [];

function push(label, fields) {
  results.push({case: label, ...fields});
}

function logger() {
  const messages = [];
  return {
    messages,
    log: (...args) => messages.push(["log", ...args]),
    warn: (...args) => messages.push(["warn", ...args]),
    error: (...args) => messages.push(["error", ...args]),
  };
}

function record(label, ajv, validate, data) {
  const valid = validate(data);
  push(label, {valid, errors: validate.errors, text: ajv.errorsText(validate.errors)});
}

function attempted(label, build) {
  try {
    const value = build();
    push(label, {completed: true, value});
  } catch (error) {
    push(label, {completed: false, message: error.message});
  }
}

const DIALECTS = [
  ["draft-07", Ajv, "http://json-schema.org/draft-07/schema"],
  ["2019-09", Ajv2019, "https://json-schema.org/draft/2019-09/schema"],
  ["2020-12", Ajv2020, "https://json-schema.org/draft/2020-12/schema"],
];

for (const [dialect, Dialect, metaId] of DIALECTS) {
  // A project that disables the default meta-schema: the dialect's own
  // meta-schema is not registered, so a schema it would reject compiles, and
  // the diagnostic channel reports the missing meta-schema.
  {
    const channel = logger();
    const ajv = new Dialect({meta: false, strict: false, logger: channel});
    push(`${dialect} disabled default meta`, {
      defaultMeta: ajv.defaultMeta(),
      defaultResolves: Boolean(ajv.getSchema(metaId)),
    });
    const validate = ajv.compile({type: "object", required: ["a", "a"]});
    record(`${dialect} disabled default meta compiles`, ajv, validate, {a: 1});
    push(`${dialect} disabled default meta diagnostics`, {messages: channel.messages.slice()});
    push(`${dialect} disabled default meta validateSchema`, {
      valid: ajv.validateSchema({type: "object", required: ["a", "a"]}),
      errors: ajv.errors,
    });
    push(`${dialect} disabled default meta diagnostics after check`, {
      messages: channel.messages.slice(),
    });
  }

  // The same schema with the configuration absent is refused by the dialect's
  // meta-schema.
  attempted(`${dialect} default refuses malformed schema`, () => {
    new Dialect().compile({type: "object", required: ["a", "a"]});
    return "compiled";
  });

  // A project that supplies its own meta-schema: it is registered, used as the
  // default, and governs which schemas compile.
  {
    const customId = `https://example.com/${dialect}/meta`;
    const custom = {
      $id: customId,
      marker: true,
      type: "object",
      required: ["marker"],
    };
    const ajv = new Dialect({meta: custom, strict: false});
    push(`${dialect} custom meta`, {
      defaultMeta: ajv.defaultMeta(),
      customResolves: Boolean(ajv.getSchema(customId)),
      dialectResolves: Boolean(ajv.getSchema(metaId)),
    });
    const validate = ajv.compile({marker: true, type: "string"});
    record(`${dialect} custom meta admits marker schema`, ajv, validate, "text");
    record(`${dialect} custom meta admits marker schema on a document`, ajv, validate, 5);
    attempted(`${dialect} custom meta refuses markerless schema`, () => {
      ajv.compile({type: "string"});
      return "compiled";
    });
  }

  // A project that disables automatic registration: compiling a schema does
  // not register its identifier, so the identifier resolves to nothing and a
  // second schema may carry the same one.
  {
    const ajv = new Dialect({addUsedSchema: false});
    const first = ajv.compile({
      $id: `https://example.com/${dialect}/unregistered`,
      type: "string",
    });
    push(`${dialect} registration disabled`, {
      resolves: Boolean(ajv.getSchema(`https://example.com/${dialect}/unregistered`)),
      first: first("text"),
    });
    let second = null;
    attempted(`${dialect} registration disabled accepts duplicate identifier`, () => {
      second = ajv.compile({
        $id: `https://example.com/${dialect}/unregistered`,
        type: "number",
      });
      return second(3);
    });
    record(
      `${dialect} registration disabled second schema`,
      ajv,
      second || first,
      7,
    );
    // Explicit registration is unaffected by the option.
    ajv.addSchema(
      {$id: `https://example.com/${dialect}/explicit`, type: "boolean"},
      `name-${dialect}`,
    );
    const explicit = ajv.getSchema(`name-${dialect}`);
    record(`${dialect} registration disabled explicit schema`, ajv, explicit, false);
  }

  // With automatic registration present, the compiled identifier resolves and
  // a second schema carrying it is refused.
  {
    const ajv = new Dialect();
    const first = ajv.compile({
      $id: `https://example.com/${dialect}/registered`,
      type: "string",
    });
    push(`${dialect} registration enabled`, {
      resolves: typeof ajv.getSchema(`https://example.com/${dialect}/registered`),
      first: first("text"),
    });
    attempted(`${dialect} registration enabled refuses duplicate identifier`, () => {
      ajv.compile({$id: `https://example.com/${dialect}/registered`, type: "number"});
      return "compiled";
    });
  }

  // With none of this configuration present, the default meta-schema is
  // registered under its identifier and the alias ajv publishes.
  {
    const ajv = new Dialect();
    push(`${dialect} defaults`, {
      defaultMeta: ajv.defaultMeta(),
      metaResolves: typeof ajv.getSchema(metaId),
      aliasResolves: typeof ajv.getSchema("http://json-schema.org/schema"),
    });
    const validate = ajv.compile({type: "string"});
    record(`${dialect} defaults verdict`, ajv, validate, "text");
    record(`${dialect} defaults report`, ajv, validate, 5);
  }
}

// The legacy identifier property: a project selecting `id` keeps `$id` as an
// ordinary keyword, exactly as ajv treats it under that option, while `id`
// carries schema identity.
{
  const ajv = new Ajv({schemaId: "id", strict: false});
  const modern = ajv.compile({$id: "https://example.com/legacy/modern", type: "string"});
  push("legacy id ignores modern identifier", {
    resolves: Boolean(ajv.getSchema("https://example.com/legacy/modern")),
    verdict: modern("text"),
  });
  const again = ajv.compile({$id: "https://example.com/legacy/modern", type: "number"});
  push("legacy id modern identifier is not unique", {verdict: again(3)});
}

for (const row of results) console.log(JSON.stringify(row));
