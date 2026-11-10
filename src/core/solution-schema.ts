import Type from "typebox";
import { ElementId, Meta } from "./ids";

const closed = { additionalProperties: false } as const;
const Reference = Type.String({ minLength: 1 });

/** The solution format version this library reads. */
export const SOLUTION_SCHEMA_VERSION = 1;

export const Component = Type.Object(
  {
    id: ElementId,
    /** A type id from a loaded pack, for example `aws.lambda`. */
    type: Reference,
    label: Type.Optional(Type.String()),
    /** Ids of the zones the component is placed in. */
    placement: Type.Optional(Type.Array(Reference)),
    /** Values for the properties the type defines. */
    properties: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    meta: Type.Optional(Meta),
  },
  closed,
);
export type Component = Type.Static<typeof Component>;

/** "`from` must be able to reach `to`" for an action, a port, or both. */
export const Intent = Type.Object(
  {
    id: ElementId,
    from: Reference,
    to: Reference,
    /** A service-level action, for example `invoke` or `write`. */
    action: Type.Optional(Reference),
    /** A symbolic port name such as `https`, or a port number. */
    port: Type.Optional(Type.Union([Reference, Type.Integer({ minimum: 1, maximum: 65535 })])),
    meta: Type.Optional(Meta),
  },
  closed,
);
export type Intent = Type.Static<typeof Intent>;

/** A designed solution: components, their placement and properties, and intents. */
export const Solution = Type.Object(
  {
    $schema: Type.Optional(Type.String()),
    schemaVersion: Type.Literal(SOLUTION_SCHEMA_VERSION),
    /** Ids of the packs the solution needs. */
    packs: Type.Array(Type.String({ minLength: 1 })),
    components: Type.Array(Component),
    intents: Type.Optional(Type.Array(Intent)),
    meta: Type.Optional(Meta),
  },
  { ...closed, title: "SolutionValidator solution" },
);
export type Solution = Type.Static<typeof Solution>;
