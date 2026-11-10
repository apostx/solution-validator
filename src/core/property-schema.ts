import Type from "typebox";
import { isObject, type JsonObject } from "../util/json";
import { PropertyName } from "./ids";

/**
 * Component types declare their properties with a small subset of JSON Schema. The subset keeps
 * packs simple, lets user interfaces generate editors from it, and stays valid JSON Schema.
 *
 * - Scalars: `string` (optionally with `enum`), `number`, `integer`, `boolean`.
 * - Arrays of scalars or of objects; objects whose fields are scalars or arrays of scalars.
 * - `default` documents the value used under the `pack-defaults` assumption policy.
 * - `x-component-ref: true` on a string marks it as the id of another component.
 * - Objects are closed: fields they do not list are rejected.
 */
const annotations = {
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
};
const closed = { additionalProperties: false } as const;

const StringProperty = Type.Object(
  {
    type: Type.Literal("string"),
    ...annotations,
    enum: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
    minLength: Type.Optional(Type.Integer({ minimum: 0 })),
    maxLength: Type.Optional(Type.Integer({ minimum: 0 })),
    pattern: Type.Optional(Type.String()),
    "x-component-ref": Type.Optional(Type.Boolean()),
    default: Type.Optional(Type.String()),
  },
  closed,
);

const NumberProperty = Type.Object(
  {
    type: Type.Literal("number"),
    ...annotations,
    minimum: Type.Optional(Type.Number()),
    maximum: Type.Optional(Type.Number()),
    default: Type.Optional(Type.Number()),
  },
  closed,
);

const IntegerProperty = Type.Object(
  {
    type: Type.Literal("integer"),
    ...annotations,
    minimum: Type.Optional(Type.Integer()),
    maximum: Type.Optional(Type.Integer()),
    default: Type.Optional(Type.Integer()),
  },
  closed,
);

const BooleanProperty = Type.Object(
  {
    type: Type.Literal("boolean"),
    ...annotations,
    default: Type.Optional(Type.Boolean()),
  },
  closed,
);

const ScalarProperty = Type.Union([
  StringProperty,
  NumberProperty,
  IntegerProperty,
  BooleanProperty,
]);

const arrayOptions = {
  minItems: Type.Optional(Type.Integer({ minimum: 0 })),
  maxItems: Type.Optional(Type.Integer({ minimum: 0 })),
  uniqueItems: Type.Optional(Type.Boolean()),
  default: Type.Optional(Type.Array(Type.Unknown())),
};

const ScalarArrayProperty = Type.Object(
  { type: Type.Literal("array"), ...annotations, items: ScalarProperty, ...arrayOptions },
  closed,
);

const ObjectProperty = Type.Object(
  {
    type: Type.Literal("object"),
    ...annotations,
    properties: Type.Record(
      PropertyName,
      Type.Union([ScalarProperty, ScalarArrayProperty]),
      closed,
    ),
    required: Type.Optional(Type.Array(PropertyName)),
    additionalProperties: Type.Optional(Type.Literal(false)),
    default: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  closed,
);

const ArrayProperty = Type.Object(
  {
    type: Type.Literal("array"),
    ...annotations,
    items: Type.Union([ScalarProperty, ObjectProperty]),
    ...arrayOptions,
  },
  closed,
);

export const PropertySchema = Type.Union([
  StringProperty,
  NumberProperty,
  IntegerProperty,
  BooleanProperty,
  ArrayProperty,
  ObjectProperty,
]);
export type PropertySchema = Type.Static<typeof PropertySchema>;

/** Property schemas keyed by property name. */
export type PropertySchemas = Record<string, PropertySchema>;

/**
 * Builds the JSON Schema that validates a component's `properties` object. Objects are closed,
 * so unknown fields are reported.
 */
export function propertiesValidationSchema(
  properties: PropertySchemas,
  required: readonly string[],
): JsonObject {
  const schema: JsonObject = {
    type: "object",
    properties: closeObjects(properties),
    additionalProperties: false,
  };
  if (required.length > 0) schema.required = [...required];
  return schema;
}

function closeObjects(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(closeObjects);
  if (!isObject(value)) return value;
  const copy: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    copy[key] = key === "default" || key === "enum" ? child : closeObjects(child);
  }
  if (copy.type === "object") copy.additionalProperties = false;
  return copy;
}

/** A place in a component's properties that holds a component id. */
export interface ComponentReference {
  /** JSON Pointer relative to the component's `properties`. */
  path: string;
  id: string;
}

/**
 * Finds the component ids in a property value, following the schema's `x-component-ref` marks.
 * Values that do not match the schema's shape are skipped; schema validation reports them.
 */
export function findComponentReferences(
  properties: PropertySchemas,
  values: JsonObject,
): ComponentReference[] {
  const found: ComponentReference[] = [];
  for (const [name, schema] of Object.entries(properties)) {
    if (name in values) collect(schema as JsonObject, values[name], `/${name}`, found);
  }
  return found;
}

function collect(
  schema: JsonObject,
  value: unknown,
  path: string,
  found: ComponentReference[],
): void {
  if (schema.type === "string" && schema["x-component-ref"] === true) {
    if (typeof value === "string") found.push({ path, id: value });
    return;
  }
  if (schema.type === "array" && Array.isArray(value) && isObject(schema.items)) {
    const items = schema.items;
    value.forEach((item, index) => {
      collect(items, item, `${path}/${index}`, found);
    });
    return;
  }
  if (schema.type === "object" && isObject(value) && isObject(schema.properties)) {
    for (const [name, child] of Object.entries(schema.properties)) {
      if (isObject(child) && name in value) collect(child, value[name], `${path}/${name}`, found);
    }
  }
}
