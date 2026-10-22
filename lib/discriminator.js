"use strict";

// ajv's discriminator keyword, registered when the `discriminator` option is
// enabled. The tag property selects exactly one oneOf branch, whose schema is
// then validated; the oneOf rule itself is skipped for a schema carrying the
// annotation, exactly as ajv skips it.
const {Code, Name} = require("./codegen");
const {isObject} = require("./util");
const {MissingRefError, schemaHasRulesButRef} = require("./compile");

const error = {
  message: ({params: {discrError, tagName}}) =>
    discrError === "tag"
      ? `tag "${tagName}" must be string`
      : `value of tag "${tagName}" must be in oneOf`,
  params: ({params: {discrError, tag, tagName}}) => ({
    error: discrError,
    tag: tagName,
    tagValue: tag,
  }),
};

// A property read with ajv's spelling: a plain identifier is read through
// member access, any other name through a computed property.
function propertyCode(name) {
  return /^[a-z$_][a-z$_0-9]*$/i.test(name)
    ? new Code(`data.${name}`)
    : new Code(`data[${JSON.stringify(name)}]`);
}

const definition = {
  keyword: "discriminator",
  type: "object",
  schemaType: "object",
  error,
  // The selected branch's evaluated properties and items are part of the
  // enclosing schema's result even when that branch fails, as ajv merges them
  // while compiling the keyword.
  mergeEvaluated: true,
  code(cxt) {
    const {gen, schema, parentSchema, it} = cxt;
    const {oneOf} = parentSchema;
    if (!it.opts.discriminator) {
      throw new Error("discriminator: requires discriminator option");
    }
    const tagName = schema.propertyName;
    if (typeof tagName !== "string") throw new Error("discriminator: requires propertyName");
    if (schema.mapping) throw new Error("discriminator: mapping is not supported");
    if (!oneOf) throw new Error("discriminator: requires oneOf keyword");
    const valid = gen.let("valid", false);
    const tag = gen.const("tag", propertyCode(tagName));
    gen.if(
      new Code(`typeof ${tag} == "string"`),
      () => validateMapping(),
      () => cxt.error(false, {discrError: "tag", tag, tagName}),
    );
    cxt.ok(valid);

    function validateMapping() {
      const mapping = getMapping();
      gen.if(false);
      for (const tagValue in mapping) {
        gen.elseIf(new Code(`${tag} === ${JSON.stringify(tagValue)}`));
        gen.assign(valid, applyTagSchema(mapping[tagValue]));
      }
      gen.else();
      cxt.error(false, {discrError: "mapping", tag, tagName});
      gen.endIf();
    }

    function applyTagSchema(schemaProp) {
      const branchValid = gen.name("valid");
      const schCxt = cxt.subschema({keyword: "oneOf", schemaProp}, branchValid);
      cxt.mergeEvaluated(schCxt, Name);
      return branchValid;
    }

    // The tag value -> oneOf branch map ajv builds at compile time, refusing
    // the schemas ajv refuses for the same reasons.
    function getMapping() {
      const oneOfMapping = {};
      const topRequired = hasRequired(parentSchema);
      let tagRequired = true;
      for (let i = 0; i < oneOf.length; i++) {
        let sch = oneOf[i];
        if (sch && sch.$ref && !schemaHasRulesButRef(sch, cxt.compileContext.keywordRules)) {
          const ref = sch.$ref;
          const target = cxt.compileContext.resolve(ref, parentSchema, false);
          if (target === undefined) {
            throw new MissingRefError(cxt.it.baseId || "#", ref);
          }
          sch = target.node;
        }
        const propSch = isObject(sch) ? (sch.properties || {})[tagName] : undefined;
        if (typeof propSch !== "object") {
          throw new Error(
            `discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`,
          );
        }
        tagRequired = tagRequired && (topRequired || hasRequired(sch));
        addMappings(propSch, i);
      }
      if (!tagRequired) throw new Error(`discriminator: "${tagName}" must be required`);
      return oneOfMapping;

      function hasRequired(schemaValue) {
        return (
          isObject(schemaValue) &&
          Array.isArray(schemaValue.required) &&
          schemaValue.required.includes(tagName)
        );
      }

      function addMappings(schemaValue, index) {
        if (schemaValue.const) {
          addMapping(schemaValue.const, index);
        } else if (schemaValue.enum) {
          for (const tagValue of schemaValue.enum) addMapping(tagValue, index);
        } else {
          throw new Error(
            `discriminator: "properties/${tagName}" must have "const" or "enum"`,
          );
        }
      }

      function addMapping(tagValue, index) {
        if (typeof tagValue !== "string" || tagValue in oneOfMapping) {
          throw new Error(`discriminator: "${tagName}" values must be unique strings`);
        }
        oneOfMapping[tagValue] = index;
      }
    }
  },
};

module.exports = definition;
