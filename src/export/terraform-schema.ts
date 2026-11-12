import Type from "typebox";
import { PropertyName, TypeId } from "../core/ids";

const closed = { additionalProperties: false } as const;
const AttributeName = Type.String({ pattern: "^[a-z][a-z0-9_]*$" });
const ResourceType = Type.String({ pattern: "^[a-z][a-z0-9_]*$" });

/**
 * How one Terraform argument gets its value. Inside a block or an extra resource with `each`,
 * `property` and `reference` read the current item instead of the component.
 */
export const TerraformValue = Type.Union([
  /** A fixed value. */
  Type.Object({ value: Type.Unknown() }, closed),
  /**
   * A property (or the item's field). `map` replaces string values, for example `internet` with
   * `0.0.0.0/0`; `family` keeps only address ranges of that family; `list` wraps the value in a
   * list. Unset values leave the argument out.
   */
  Type.Object(
    {
      property: PropertyName,
      map: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      /** The value when the property is unset. */
      default: Type.Optional(Type.Unknown()),
      family: Type.Optional(Type.Union([Type.Literal(4), Type.Literal(6)])),
      /** Keep only address ranges and values that `map` replaced. */
      ranges: Type.Optional(Type.Boolean()),
      list: Type.Optional(Type.Boolean()),
      /** The first element of an array value. */
      first: Type.Optional(Type.Boolean()),
    },
    closed,
  ),
  /**
   * An expression that refers to the resource of another component: the component ids in a
   * property (or the item's field), `placement` (the zones the component is placed in) or `item`
   * (the current item of `each`). `network` refers to the outermost zone of the referenced
   * component instead; `types` keeps only references to components of those types; `list`
   * makes a list.
   */
  Type.Object(
    {
      reference: Type.Union([PropertyName, Type.Literal("placement"), Type.Literal("item")]),
      attribute: AttributeName,
      network: Type.Optional(Type.Boolean()),
      types: Type.Optional(Type.Array(TypeId, { minItems: 1 })),
      list: Type.Optional(Type.Boolean()),
    },
    closed,
  ),
  /** References to the components of a type whose property lists this component. */
  Type.Object(
    {
      referencedBy: Type.Object({ type: TypeId, property: PropertyName }, closed),
      attribute: AttributeName,
    },
    closed,
  ),
  /** An attribute of this component's own main resource, for extra resources. */
  Type.Object({ self: AttributeName }, closed),
  /** A Terraform input variable the pack declares, such as a region or an image id. */
  Type.Object({ variable: AttributeName }, closed),
  /** The component's id, as a name. */
  Type.Object({ id: Type.Literal(true) }, closed),
  /**
   * A port of the item's ports field: `from` and `to` as numbers (0 for all ports), `range` as
   * text (`443`, `1024-65535`, or `*` for all), `protocol` as `tcp`, `udp` or `-1` for all.
   * `map` replaces the result, for example `-1` with `*`.
   */
  Type.Object(
    {
      port: Type.Union([
        Type.Literal("from"),
        Type.Literal("to"),
        Type.Literal("range"),
        Type.Literal("protocol"),
      ]),
      property: PropertyName,
      map: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    },
    closed,
  ),
  /**
   * A number that counts the blocks of a block definition: `start`, then `start + step`, and so
   * on, for rule priorities. With `prefix`, a name such as `rule-100`.
   */
  Type.Object(
    {
      index: Type.Object(
        { start: Type.Integer({ minimum: 0 }), step: Type.Integer({ minimum: 1 }) },
        closed,
      ),
      prefix: Type.Optional(Type.String()),
    },
    closed,
  ),
]);
export type TerraformValue = Type.Static<typeof TerraformValue>;

const Attributes = Type.Record(AttributeName, TerraformValue, closed);

/** A nested block, once or for each item of an array property. */
export const TerraformBlock = Type.Object(
  {
    name: AttributeName,
    /** Array property: one block per item. Without it, one block. */
    each: Type.Optional(PropertyName),
    /** Only items whose fields have these values. */
    where: Type.Optional(Type.Record(PropertyName, Type.String(), closed)),
    /** One block per entry of this array field of the item, for example its ports. */
    expand: Type.Optional(PropertyName),
    attributes: Attributes,
    /** The block is left out, with a note, unless one of these arguments has a value. */
    requireAny: Type.Optional(Type.Array(AttributeName, { minItems: 1 })),
  },
  closed,
);
export type TerraformBlock = Type.Static<typeof TerraformBlock>;

const resourceFields = {
  /** The Terraform resource type, for example `aws_subnet`. */
  resource: ResourceType,
  attributes: Type.Optional(Attributes),
  blocks: Type.Optional(Type.Array(TerraformBlock)),
  /** The resource is left out, with a note, unless one of these arguments has a value. */
  requireAny: Type.Optional(Type.Array(AttributeName, { minItems: 1 })),
  /** Arguments the model does not hold; each one becomes a note on the export. */
  notes: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
};

/** How a component type maps to Terraform resources. */
export const TerraformMapping = Type.Object(
  {
    ...resourceFields,
    /** Further resources per component, once or for each id in an array property. */
    extra: Type.Optional(
      Type.Array(
        Type.Object(
          {
            ...resourceFields,
            each: Type.Optional(PropertyName),
            /** Appended to the component's name to name the extra resource. */
            suffix: Type.Optional(Type.String({ pattern: "^[a-z0-9_]+$" })),
          },
          closed,
        ),
      ),
    ),
  },
  closed,
);
export type TerraformMapping = Type.Static<typeof TerraformMapping>;

/** Pack-level Terraform settings: the providers and the input variables mappings use. */
export const TerraformPackSettings = Type.Object(
  {
    providers: Type.Record(
      AttributeName,
      Type.Object(
        {
          source: Type.String({ minLength: 1 }),
          /** Empty blocks the provider configuration needs, such as `features` for azurerm. */
          blocks: Type.Optional(Type.Array(AttributeName)),
        },
        closed,
      ),
      closed,
    ),
    variables: Type.Optional(
      Type.Record(
        AttributeName,
        Type.Object(
          {
            description: Type.String({ minLength: 1 }),
            type: Type.Union([
              Type.Literal("string"),
              Type.Literal("number"),
              Type.Literal("bool"),
              Type.Literal("list(string)"),
            ]),
          },
          closed,
        ),
        closed,
      ),
    ),
  },
  closed,
);
export type TerraformPackSettings = Type.Static<typeof TerraformPackSettings>;
