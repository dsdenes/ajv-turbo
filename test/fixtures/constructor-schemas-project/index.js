"use strict";

// An existing service that hands its schemas to ajv when it builds the
// validator, then validates through them by identifier, by key, and through
// references between them. It also builds the collections ajv refuses. It is
// run unchanged with ajv and with the replacement installed in ajv's place;
// every printed line must match.

const Ajv = require("ajv");
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");
const AjvJTD = require("ajv/dist/jtd");

const results = [];

function record(label, ajv, validate, data) {
  const valid = validate(data);
  results.push({
    case: label,
    valid,
    errors: validate.errors,
    text: ajv.errorsText(validate.errors),
  });
}

function lookup(ajv, ref) {
  const validate = ajv.getSchema(ref);
  if (!validate) throw new Error(`schema ${ref} was not registered`);
  return validate;
}

const person = {
  $id: "https://example.com/person",
  type: "object",
  required: ["name", "age"],
  additionalProperties: false,
  properties: {
    name: {type: "string", minLength: 2},
    age: {type: "integer", minimum: 0},
    email: {type: "string", pattern: "^[^@]+@[^@]+$"},
  },
};
const tag = {
  $id: "https://example.com/tag",
  type: "string",
  pattern: "^[a-z][a-z0-9-]*$",
  maxLength: 12,
};
const pair = {
  $id: "https://example.com/pair",
  type: "array",
  minItems: 2,
  maxItems: 2,
  items: {type: "number"},
};
const address = {
  $id: "https://example.com/address",
  type: "object",
  required: ["city", "zip"],
  additionalProperties: false,
  properties: {
    city: {type: "string", minLength: 3},
    zip: {type: "string", pattern: "^[0-9]{5}$"},
  },
};
const order = {
  $id: "https://example.com/order",
  type: "object",
  required: ["id", "shipTo"],
  properties: {
    id: {type: "integer"},
    shipTo: {$ref: "https://example.com/address"},
    notes: {type: "string"},
  },
};

const DOCUMENTS = {
  person: [{name: "Ada", age: 36}, {name: "A", age: -1, email: "bad", extra: true}],
  tag: ["release-1", "Release"],
  pair: [[1, 2], [1], [1, 2, 3]],
  order: [
    {id: 1, shipTo: {city: "Paris", zip: "75001"}},
    {id: 1, shipTo: {city: "Pa", zip: "75"}},
    {id: 1, shipTo: "nowhere"},
    {id: "x", shipTo: {city: "Berlin", zip: "10115"}, notes: 5},
  ],
};

for (const [dialect, Dialect] of [
  ["draft-07", Ajv],
  ["2019-09", Ajv2019],
  ["2020-12", Ajv2020],
]) {
  const listed = new Dialect({allErrors: true, schemas: [person, tag, pair]});
  for (const schema of [person, tag, pair]) {
    const validate = lookup(listed, schema.$id);
    for (const data of DOCUMENTS[schema.$id.split("/").pop()]) {
      record(`${dialect} list ${schema.$id}`, listed, validate, data);
    }
  }

  const named = new Dialect({
    verbose: true,
    schemas: {contact: person, label: tag, coordinates: pair},
  });
  record(`${dialect} name contact valid`, named, lookup(named, "contact"), DOCUMENTS.person[0]);
  record(`${dialect} name contact invalid`, named, lookup(named, "contact"), DOCUMENTS.person[1]);
  record(`${dialect} name label invalid`, named, lookup(named, "label"), DOCUMENTS.tag[1]);
  record(
    `${dialect} name coordinates invalid`,
    named,
    lookup(named, "coordinates"),
    DOCUMENTS.pair[1],
  );

  const crossReference = new Dialect({allErrors: true, schemas: [order, address]});
  for (const data of DOCUMENTS.order) {
    record(
      `${dialect} cross-reference`,
      crossReference,
      lookup(crossReference, order.$id),
      data,
    );
  }
  record(
    `${dialect} cross-reference target`,
    crossReference,
    lookup(crossReference, address.$id),
    DOCUMENTS.order[0].shipTo,
  );

  const single = new Dialect({schemas: [person, tag, pair]});
  record(
    `${dialect} validate by identifier`,
    single,
    lookup(single, person.$id),
    DOCUMENTS.person[1],
  );
  record(`${dialect} validate method`, single, lookup(single, person.$id), DOCUMENTS.person[0]);

  const byMethod = single.validate(person.$id, DOCUMENTS.person[0]);
  results.push({
    case: `${dialect} validate by identifier method`,
    valid: byMethod,
    errors: single.errors,
    text: single.errorsText(single.errors),
  });
  const failingByMethod = single.validate(tag.$id, DOCUMENTS.tag[1]);
  results.push({
    case: `${dialect} validate by identifier method invalid`,
    valid: failingByMethod,
    errors: single.errors,
    text: single.errorsText(single.errors),
  });
}

const jtd = new AjvJTD({
  allErrors: true,
  schemas: {
    word: {type: "string"},
    point: {properties: {x: {type: "float64"}, y: {type: "float64"}}},
  },
});
record("jtd name word valid", jtd, lookup(jtd, "word"), "hello");
record("jtd name word invalid", jtd, lookup(jtd, "word"), 5);
record("jtd name point valid", jtd, lookup(jtd, "point"), {x: 1, y: 2});
record("jtd name point invalid", jtd, lookup(jtd, "point"), {x: 1});

function refuse(label, build) {
  try {
    build();
    results.push({case: label, constructed: true});
  } catch (error) {
    results.push({case: label, constructed: false, message: error.message});
  }
}

refuse("refuse duplicate list", () =>
  new Ajv({
    schemas: [
      {$id: "https://example.com/duplicate", type: "number"},
      {$id: "https://example.com/duplicate", type: "string"},
    ],
  }),
);
refuse("refuse duplicate names", () =>
  new Ajv({
    schemas: {
      first: {$id: "https://example.com/duplicate", type: "number"},
      second: {$id: "https://example.com/duplicate", type: "string"},
    },
  }),
);
refuse("refuse invalid member", () =>
  new Ajv({schemas: [{$id: "https://example.com/broken", type: 5}]}),
);
refuse("refuse invalid required", () =>
  new Ajv2020({schemas: [{$id: "https://example.com/broken", required: "name"}]}),
);

for (const result of results) process.stdout.write(JSON.stringify(result) + "\n");
