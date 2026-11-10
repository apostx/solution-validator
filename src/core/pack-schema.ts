import Type from "typebox";
import {
  Meta,
  Name,
  PackId,
  PropertyName,
  TypeId,
  VERSION_PATTERN,
  VERSION_RANGE_PATTERN,
} from "./ids";
import { PropertySchema } from "./property-schema";
import { Traits } from "./traits";

const closed = { additionalProperties: false } as const;
const Label = Type.String({ minLength: 1 });
const Description = Type.Optional(Type.String());

/**
 * Selects component types by type id, category or trait. Every given field must match; an
 * empty selector matches every type.
 */
export const TypeSelector = Type.Object(
  {
    type: Type.Optional(TypeId),
    category: Type.Optional(Name),
    trait: Type.Optional(Type.String({ minLength: 1 })),
  },
  closed,
);
export type TypeSelector = Type.Static<typeof TypeSelector>;

/**
 * An interaction a component type accepts. An intent matches the rule when its source matches
 * `from` (omitted: any source), the rule's `actions` include the intent's action (if it states
 * one), and the rule's `ports`, if listed, include the intent's port.
 */
export const AcceptRule = Type.Object(
  {
    from: Type.Optional(TypeSelector),
    actions: Type.Optional(Type.Array(Name, { minItems: 1 })),
    ports: Type.Optional(Type.Array(Name, { minItems: 1 })),
  },
  closed,
);
export type AcceptRule = Type.Static<typeof AcceptRule>;

export const TypeDefinition = Type.Object(
  {
    id: TypeId,
    label: Label,
    description: Description,
    category: Name,
    traits: Type.Optional(Traits),
    accepts: Type.Optional(Type.Array(AcceptRule)),
    properties: Type.Optional(Type.Record(PropertyName, PropertySchema, closed)),
    /** Properties every component of this type must set. */
    required: Type.Optional(Type.Array(PropertyName)),
    meta: Type.Optional(Meta),
  },
  closed,
);
export type TypeDefinition = Type.Static<typeof TypeDefinition>;

export const CategoryDefinition = Type.Object(
  { id: Name, label: Label, description: Description },
  closed,
);
export type CategoryDefinition = Type.Static<typeof CategoryDefinition>;

export const ActionDefinition = Type.Object(
  { id: Name, label: Label, description: Description },
  closed,
);
export type ActionDefinition = Type.Static<typeof ActionDefinition>;

export const PortDefinition = Type.Object(
  {
    id: Name,
    label: Label,
    description: Description,
    protocol: Type.Enum(["tcp", "udp"]),
    port: Type.Integer({ minimum: 1, maximum: 65535 }),
  },
  closed,
);
export type PortDefinition = Type.Static<typeof PortDefinition>;

/** A versioned bundle of component types, categories, actions and ports. */
export const Pack = Type.Object(
  {
    $schema: Type.Optional(Type.String()),
    id: PackId,
    version: Type.String({ pattern: VERSION_PATTERN }),
    label: Label,
    description: Description,
    /** The trait vocabulary version the pack needs. */
    vocabulary: Type.Integer({ minimum: 1 }),
    /** Packs this pack builds on, with a version or caret range, for example `^0.1.0`. */
    requires: Type.Optional(
      Type.Record(PackId, Type.String({ pattern: VERSION_RANGE_PATTERN }), closed),
    ),
    categories: Type.Optional(Type.Array(CategoryDefinition)),
    actions: Type.Optional(Type.Array(ActionDefinition)),
    ports: Type.Optional(Type.Array(PortDefinition)),
    types: Type.Optional(Type.Array(TypeDefinition)),
    meta: Type.Optional(Meta),
  },
  { ...closed, title: "SolutionValidator pack" },
);
export type Pack = Type.Static<typeof Pack>;
