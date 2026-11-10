import Type from "typebox";
import { LevelName, Name, PropertyName } from "./ids";

/**
 * The version of the trait vocabulary this library implements. A pack declares the version it
 * needs; loading fails if it is newer. The vocabulary only grows: new traits and new optional
 * parameters raise the version, existing meanings do not change.
 */
export const TRAIT_VOCABULARY_VERSION = 1;

/** Binds a trait parameter to a property of the component, for example its endpoint type. */
export const Binding = Type.Object({ property: PropertyName }, { additionalProperties: false });
export type Binding = Type.Static<typeof Binding>;

function bindable<T extends Type.TSchema>(schema: T) {
  return Type.Union([schema, Binding]);
}

const closed = { additionalProperties: false } as const;

export const VISIBILITIES = ["public", "private", "none"] as const;
export const GATEWAY_DIRECTIONS = ["both", "outbound-only"] as const;
export const FILTER_ATTACHMENTS = ["component", "zone", "self"] as const;

/**
 * Parameter schemas of the traits. Behavior is implemented per iteration (see the roadmap);
 * the parameters of traits without behavior yet may still change before it arrives.
 */
export const TraitParameters = {
  /** How a component can be called from outside. */
  endpoint: Type.Object(
    {
      visibility: bindable(Type.Enum([...VISIBILITIES])),
      /** Ports the endpoint listens on. Omitted: any port. */
      ports: Type.Optional(Type.Array(Name, { minItems: 1 })),
    },
    closed,
  ),
  /** Receives requests and forwards them to targets. */
  forwarder: Type.Object(
    {
      /** Array property with the routes. */
      routes: Binding,
      /** Field of a route that holds the target component id. Default: `target`. */
      targetField: Type.Optional(PropertyName),
      /** A route also authorizes the forwarder on its target, like an integration permission. */
      authorizes: Type.Optional(Type.Boolean()),
    },
    closed,
  ),
  /** Has an identity that can be granted access. */
  principal: Type.Object(
    {
      /** Array property with the grants. */
      grants: Binding,
      /** Field of a grant that holds the resource component id. Default: `resource`. */
      resourceField: Type.Optional(PropertyName),
      /** Field of a grant that holds the access level. Default: `access`. */
      accessField: Type.Optional(PropertyName),
    },
    closed,
  ),
  /** Requires a grant, a resource policy or a public setting before others can use it. */
  "access-controlled": Type.Object(
    {
      /** Access levels a grant can name, and the actions each one allows. */
      levels: Type.Record(LevelName, Type.Array(Name, { minItems: 1 }), closed),
      /** Whether anonymous callers are allowed. */
      public: Type.Optional(bindable(Type.Boolean())),
      /** Actions anonymous callers may perform when public access is on. */
      publicActions: Type.Optional(Type.Array(Name, { minItems: 1 })),
    },
    closed,
  ),
  /** A network area that contains components. */
  zone: Type.Object(
    {
      /** Address space, for the detailed level. */
      addressSpace: Type.Optional(bindable(Type.String())),
    },
    closed,
  ),
  /** Connects a zone to another zone or to an external network. */
  gateway: Type.Object(
    {
      direction: bindable(Type.Enum([...GATEWAY_DIRECTIONS])),
      /** Array property with the ids of the components the gateway connects. */
      connects: Type.Optional(Binding),
    },
    closed,
  ),
  /** Decides which gateway traffic leaving a zone uses. */
  router: Type.Object(
    {
      /** Array property with the routes (destination and gateway). */
      routes: Binding,
    },
    closed,
  ),
  /** Allows or denies traffic by source, destination and port. */
  "traffic-filter": Type.Object(
    {
      stateful: Type.Boolean(),
      attachTo: Type.Array(Type.Enum([...FILTER_ATTACHMENTS]), { minItems: 1 }),
      /** Array property with the rules. */
      rules: Type.Optional(Binding),
      default: Type.Optional(
        Type.Object(
          { inbound: Type.Enum(["allow", "deny"]), outbound: Type.Enum(["allow", "deny"]) },
          closed,
        ),
      ),
    },
    closed,
  ),
  /** A set of equivalent instances. */
  group: Type.Object(
    {
      /** Array property with the member component ids. */
      members: Type.Optional(Binding),
      size: Type.Optional(bindable(Type.Integer({ minimum: 0 }))),
      /** Array property with the ids of the zones the group spans. */
      zones: Type.Optional(Binding),
    },
    closed,
  ),
};

export type TraitId = keyof typeof TraitParameters;

/** All trait ids, in vocabulary order. */
export const TRAIT_IDS = Object.keys(TraitParameters) as TraitId[];

export const Traits = Type.Object(
  {
    endpoint: Type.Optional(TraitParameters.endpoint),
    forwarder: Type.Optional(TraitParameters.forwarder),
    principal: Type.Optional(TraitParameters.principal),
    "access-controlled": Type.Optional(TraitParameters["access-controlled"]),
    zone: Type.Optional(TraitParameters.zone),
    gateway: Type.Optional(TraitParameters.gateway),
    router: Type.Optional(TraitParameters.router),
    "traffic-filter": Type.Optional(TraitParameters["traffic-filter"]),
    group: Type.Optional(TraitParameters.group),
  },
  closed,
);
export type Traits = Type.Static<typeof Traits>;

export function isTraitId(value: string): value is TraitId {
  return Object.hasOwn(TraitParameters, value);
}

/** What a bound property must look like. */
export type BindingExpectation =
  | { kind: "enum"; values: readonly string[] }
  | { kind: "boolean" }
  | { kind: "string" }
  | { kind: "integer" }
  | { kind: "references" }
  | { kind: "objects"; fields: readonly { name: string; reference: boolean }[] };

export interface BindingSlot {
  trait: TraitId;
  parameter: string;
  binding: Binding;
  expectation: BindingExpectation;
}

/** Lists the property bindings in a type's traits, with what each bound property must be. */
export function bindingSlots(traits: Traits): BindingSlot[] {
  const slots: BindingSlot[] = [];
  const add = (
    trait: TraitId,
    parameter: string,
    value: unknown,
    expectation: BindingExpectation,
  ) => {
    if (isBinding(value)) slots.push({ trait, parameter, binding: value, expectation });
  };
  const t = traits;
  if (t.endpoint) {
    add("endpoint", "visibility", t.endpoint.visibility, { kind: "enum", values: VISIBILITIES });
  }
  if (t.forwarder) {
    add("forwarder", "routes", t.forwarder.routes, {
      kind: "objects",
      fields: [{ name: t.forwarder.targetField ?? "target", reference: true }],
    });
  }
  if (t.principal) {
    add("principal", "grants", t.principal.grants, {
      kind: "objects",
      fields: [
        { name: t.principal.resourceField ?? "resource", reference: true },
        { name: t.principal.accessField ?? "access", reference: false },
      ],
    });
  }
  const accessControlled = t["access-controlled"];
  if (accessControlled) {
    add("access-controlled", "public", accessControlled.public, { kind: "boolean" });
  }
  if (t.zone) add("zone", "addressSpace", t.zone.addressSpace, { kind: "string" });
  if (t.gateway) {
    add("gateway", "direction", t.gateway.direction, { kind: "enum", values: GATEWAY_DIRECTIONS });
    add("gateway", "connects", t.gateway.connects, { kind: "references" });
  }
  if (t.router) add("router", "routes", t.router.routes, { kind: "objects", fields: [] });
  const filter = t["traffic-filter"];
  if (filter) add("traffic-filter", "rules", filter.rules, { kind: "objects", fields: [] });
  if (t.group) {
    add("group", "members", t.group.members, { kind: "references" });
    add("group", "size", t.group.size, { kind: "integer" });
    add("group", "zones", t.group.zones, { kind: "references" });
  }
  return slots;
}

export function isBinding(value: unknown): value is Binding {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { property?: unknown }).property === "string"
  );
}

/** Describes an expectation in English, for findings. */
export function describeExpectation(expectation: BindingExpectation): string {
  switch (expectation.kind) {
    case "enum":
      return `a string with values from: ${expectation.values.join(", ")}`;
    case "boolean":
      return "a boolean";
    case "string":
      return "a string";
    case "integer":
      return "an integer";
    case "references":
      return "an array of component references";
    case "objects":
      return expectation.fields.length === 0
        ? "an array of objects"
        : `an array of objects with the fields ${expectation.fields
            .map((field) => (field.reference ? `${field.name} (component reference)` : field.name))
            .join(", ")}`;
  }
}
