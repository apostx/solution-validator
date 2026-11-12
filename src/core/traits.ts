import Type from "typebox";
import { LevelName, Name, PropertyName } from "./ids";

/**
 * The version of the trait vocabulary this library implements. A pack declares the version it
 * needs; loading fails if it is newer. The vocabulary grows: new traits and new optional
 * parameters raise the version, and the meaning of implemented behavior does not change.
 *
 * - 1: all nine traits; behavior for endpoint, forwarder, principal and access-controlled.
 * - 2: behavior for the network traits (zone, gateway, router, traffic-filter, group);
 *   `endpoint.via`, `router.zones` and `traffic-filter.targets` added; `group.zones` removed
 *   (placement says where a group runs). Version 1 packs used no network trait behavior.
 * - 3: `gateway.services`: gateways that give private access to provider services, used by
 *   routes whose destination is such a service.
 * - 4: `zone.failureDomain` and the `redundancy` trait, for the availability analysis.
 * - 5: `zone.directInternet`, `gateway.implicit`, `traffic-filter.baseRules`, the `network`
 *   rule peer, a bindable `redundancy.managed` and `redundancy.domains`, for networks whose
 *   internet access and failure domains belong to components rather than routes and zones.
 */
export const TRAIT_VOCABULARY_VERSION = 5;

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
export const ENDPOINT_LOCATIONS = ["placement", "provider"] as const;
export const FILTER_DIRECTIONS = ["inbound", "outbound"] as const;
/** Rule peers that are keywords rather than ids or address ranges. */
export const PEER_KEYWORDS = ["any", "internet", "network"] as const;

/**
 * A traffic filter rule that a type applies itself (`traffic-filter.baseRules`). Its peer is a
 * keyword or an IPv4 range, never a component id.
 */
export const BaseRule = Type.Object(
  {
    direction: Type.Enum([...FILTER_DIRECTIONS]),
    peer: Type.String({ minLength: 1 }),
    ports: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
    effect: Type.Optional(Type.Enum(["allow", "deny"])),
  },
  { additionalProperties: false },
);
export type BaseRule = Type.Static<typeof BaseRule>;

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
      /**
       * Where the endpoint is reached. `placement` (default): inside the zones the component is
       * placed in. `provider`: at a provider-managed service endpoint outside every zone, even
       * when the component is placed; placement then only affects the component's own outbound
       * traffic (for example a function attached to a private network).
       */
      via: Type.Optional(Type.Enum([...ENDPOINT_LOCATIONS])),
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
      /**
       * The failure domain the zone lies in, for example an availability zone. Zones placed in
       * it inherit it unless they declare their own.
       */
      failureDomain: Type.Optional(bindable(Type.String())),
      /**
       * The provider routes traffic between the internet and components in the zone that have a
       * public endpoint, without router or gateway components (as with public IP addresses in
       * Azure). Zones placed in it inherit it.
       */
      directInternet: Type.Optional(bindable(Type.Boolean())),
    },
    closed,
  ),
  /**
   * Connects networks to the internet. `both`: traffic may enter and leave. `outbound-only`:
   * connections may only be opened from inside (network address translation).
   */
  gateway: Type.Object(
    {
      direction: bindable(Type.Enum([...GATEWAY_DIRECTIONS])),
      /**
       * Array property with the ids of the zones the gateway is attached to. A gateway without it
       * belongs to the network of the zone it is placed in.
       */
      connects: Type.Optional(Binding),
      /**
       * Array property with the ids of the provider services (components outside every zone)
       * the gateway reaches privately, without the internet. A route whose destination is one of
       * them sends that traffic through the gateway.
       */
      services: Type.Optional(Binding),
      /**
       * The zones the gateway `connects` send their internet traffic through it without a
       * route, unless their router has an internet route (as with an Azure NAT gateway
       * associated with a subnet). An implicit `outbound-only` gateway reaches the internet
       * itself.
       */
      implicit: Type.Optional(Type.Boolean()),
    },
    closed,
  ),
  /** Decides which gateway traffic leaving a zone uses. */
  router: Type.Object(
    {
      /**
       * Array property with the routes: objects with `destination` (`internet`) and `gateway`
       * (a component id).
       */
      routes: Binding,
      /**
       * Array property with the ids of the zones the router serves. A zone without its own router
       * uses the router of the nearest zone it is placed in.
       */
      zones: Type.Optional(Binding),
    },
    closed,
  ),
  /** Allows or denies traffic by source, destination and port. */
  "traffic-filter": Type.Object(
    {
      /** Stateful filters allow the return traffic of allowed connections. */
      stateful: Type.Boolean(),
      /** What the filter can be attached to; `self` filters traffic passing through it. */
      attachTo: Type.Array(Type.Enum([...FILTER_ATTACHMENTS]), { minItems: 1 }),
      /**
       * Array property with the rules, evaluated in order, the first match deciding: objects with
       * `direction` (`inbound` or `outbound`), `peer` (`any`, `internet`, `network`, an IPv4
       * range, or the id of a component, zone or filter), optional `ports` (port ids, numbers or
       * ranges; omitted: all ports) and optional `effect` (`allow`, the default, or `deny`).
       */
      rules: Type.Optional(Binding),
      /**
       * Rules the type applies after the component's own rules and before the default policy,
       * such as the default security rules of an Azure network security group.
       */
      baseRules: Type.Optional(Type.Array(BaseRule)),
      /** Array property with the ids of the components or zones the filter is attached to. */
      targets: Type.Optional(Binding),
      /** What happens to traffic no rule matches. Default: deny in both directions. */
      default: Type.Optional(
        Type.Object(
          { inbound: Type.Enum(["allow", "deny"]), outbound: Type.Enum(["allow", "deny"]) },
          closed,
        ),
      ),
    },
    closed,
  ),
  /**
   * How a component survives the loss of a failure domain. Without it, a component runs in
   * every zone it is placed in.
   */
  redundancy: Type.Object(
    {
      /**
       * The provider runs it across failure domains itself, for example a regional service.
       * `false`: the provider runs it in one failure domain.
       */
      managed: Type.Optional(bindable(Type.Boolean())),
      /**
       * Whether instances run in every zone the component is placed in. `false`: one instance
       * runs in one of them, as for a single virtual machine or a database without a standby.
       * Default: `true`.
       */
      spread: Type.Optional(bindable(Type.Boolean())),
      /**
       * Array property with the failure domains the component runs in, when the provider assigns
       * them per component rather than per zone (as with Azure availability zones). When set, it
       * is used instead of the failure domains of the zones it is placed in.
       */
      domains: Type.Optional(Binding),
    },
    closed,
  ),
  /** A set of equivalent instances. */
  group: Type.Object(
    {
      /**
       * Array property with the member component ids. An intent to or from the group stands for
       * every member. Without members, the group runs its instances in the zones it is placed
       * in.
       */
      members: Type.Optional(Binding),
      /** Number of instances; informational. */
      size: Type.Optional(bindable(Type.Integer({ minimum: 0 }))),
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
    redundancy: Type.Optional(TraitParameters.redundancy),
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
  | { kind: "strings" }
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
  if (t.zone) {
    add("zone", "addressSpace", t.zone.addressSpace, { kind: "string" });
    add("zone", "failureDomain", t.zone.failureDomain, { kind: "string" });
    add("zone", "directInternet", t.zone.directInternet, { kind: "boolean" });
  }
  if (t.redundancy) {
    add("redundancy", "managed", t.redundancy.managed, { kind: "boolean" });
    add("redundancy", "spread", t.redundancy.spread, { kind: "boolean" });
    add("redundancy", "domains", t.redundancy.domains, { kind: "strings" });
  }
  if (t.gateway) {
    add("gateway", "direction", t.gateway.direction, { kind: "enum", values: GATEWAY_DIRECTIONS });
    add("gateway", "connects", t.gateway.connects, { kind: "references" });
    add("gateway", "services", t.gateway.services, { kind: "references" });
  }
  if (t.router) {
    add("router", "routes", t.router.routes, {
      kind: "objects",
      fields: [
        { name: "destination", reference: false },
        { name: "gateway", reference: true },
      ],
    });
    add("router", "zones", t.router.zones, { kind: "references" });
  }
  const filter = t["traffic-filter"];
  if (filter) {
    add("traffic-filter", "rules", filter.rules, {
      kind: "objects",
      fields: [
        { name: "direction", reference: false },
        { name: "peer", reference: false },
      ],
    });
    add("traffic-filter", "targets", filter.targets, { kind: "references" });
  }
  if (t.group) {
    add("group", "members", t.group.members, { kind: "references" });
    add("group", "size", t.group.size, { kind: "integer" });
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
    case "strings":
      return "an array of strings";
    case "objects":
      return expectation.fields.length === 0
        ? "an array of objects"
        : `an array of objects with the fields ${expectation.fields
            .map((field) => (field.reference ? `${field.name} (component reference)` : field.name))
            .join(", ")}`;
  }
}
