/** How serious a finding is. */
export type Severity = "error" | "warning" | "info";

/** Where a finding code comes from. */
export type FindingSource =
  | "schema"
  | "registry"
  | "model-validity"
  | "connection-validity"
  | "access"
  | "address-plan"
  | "availability"
  | "requirements";

export interface FindingCodeDefinition {
  /** Severity of every finding with this code. */
  readonly severity: Severity;
  /** Which part of the library reports it. */
  readonly source: FindingSource;
  /** English message template. `{name}` is replaced by the parameter `name`. */
  readonly template: string;
  /** One-sentence explanation for the documentation. */
  readonly description: string;
}

/**
 * Every finding code with its severity and English message template. Codes are stable: a code
 * is never reused for a different meaning. `docs/finding-codes.md` is generated from this list.
 */
export const FINDING_CODES = {
  // Schema validation (parseSolution, createRegistry and component properties)
  JSON_INVALID: {
    severity: "error",
    source: "schema",
    template: "The input is not valid JSON.",
    description: "Text passed to the parser could not be read as JSON.",
  },
  SCHEMA_REQUIRED: {
    severity: "error",
    source: "schema",
    template: "{path} is missing the required field {field}.",
    description: "A required field is missing.",
  },
  SCHEMA_UNKNOWN_FIELD: {
    severity: "error",
    source: "schema",
    template: "{path} has an unknown field {field}.",
    description: "A field is not defined by the schema.",
  },
  SCHEMA_TYPE: {
    severity: "error",
    source: "schema",
    template: "{path} must be of type {expected}.",
    description: "A value has the wrong JSON type.",
  },
  SCHEMA_ENUM: {
    severity: "error",
    source: "schema",
    template: "{path} must be one of: {allowed}.",
    description: "A value is not one of the allowed values.",
  },
  SCHEMA_FORM: {
    severity: "error",
    source: "schema",
    template: "{path} does not match any of the allowed forms.",
    description: "A value matches none of the alternatives the schema allows.",
  },
  SCHEMA_CONSTRAINT: {
    severity: "error",
    source: "schema",
    template: "{path} does not satisfy the constraint {constraint} {limit}.",
    description: "A value violates a constraint such as a pattern, a length or a range.",
  },

  // Registry (createRegistry)
  PACK_DUPLICATE: {
    severity: "error",
    source: "registry",
    template: "Pack {pack} is loaded more than once.",
    description: "Two loaded packs have the same id.",
  },
  PACK_VOCABULARY_UNSUPPORTED: {
    severity: "error",
    source: "registry",
    template:
      "Pack {pack} needs trait vocabulary version {required}, but this library provides version {provided}.",
    description: "A pack needs a newer trait vocabulary than this library version implements.",
  },
  PACK_REQUIREMENT_MISSING: {
    severity: "error",
    source: "registry",
    template: "Pack {pack} requires pack {required}, which is not loaded.",
    description: "A pack depends on a pack that was not passed to the registry.",
  },
  PACK_REQUIREMENT_VERSION: {
    severity: "error",
    source: "registry",
    template: "Pack {pack} requires {required} {range}, but version {version} is loaded.",
    description: "A required pack is loaded in a version outside the requested range.",
  },
  PACK_NAMESPACE: {
    severity: "error",
    source: "registry",
    template: "The {kind} {id} in pack {pack} must start with {prefix}.",
    description: "A pack defines an id outside its own namespace.",
  },
  PACK_DEFINITION_DUPLICATE: {
    severity: "error",
    source: "registry",
    template: "The {kind} {id} is defined more than once.",
    description: "The same id is defined twice, in one pack or across packs.",
  },
  PACK_REFERENCE_UNKNOWN: {
    severity: "error",
    source: "registry",
    template: "{path} in pack {pack} refers to an unknown {kind} {id}.",
    description:
      "A pack refers to a type, category, action, port, trait or property that is not defined in the pack or in the packs it requires.",
  },
  PACK_BINDING_MISMATCH: {
    severity: "error",
    source: "registry",
    template:
      "{path} in pack {pack} binds the trait parameter {trait}.{parameter} to property {property}, which must be {expected}.",
    description: "A trait parameter is bound to a property whose schema does not fit it.",
  },
  PACK_PROPERTY_DEFAULT_INVALID: {
    severity: "error",
    source: "registry",
    template: "The default of property {property} of type {type} does not match its schema.",
    description: "A documented default value is not valid for its own property schema.",
  },

  // Analysis: model-validity
  SOLUTION_PACK_UNKNOWN: {
    severity: "error",
    source: "model-validity",
    template: "The solution needs pack {pack}, which is not loaded.",
    description: "The solution lists a pack that the registry does not contain.",
  },
  SOLUTION_PACK_DUPLICATE: {
    severity: "warning",
    source: "model-validity",
    template: "Pack {pack} is listed more than once.",
    description: "The solution lists the same pack twice.",
  },
  ID_DUPLICATE: {
    severity: "error",
    source: "model-validity",
    template: "The id {id} is used by more than one component or intent.",
    description: "Component and intent ids must be unique within a solution.",
  },
  TYPE_UNKNOWN: {
    severity: "error",
    source: "model-validity",
    template: "Component {component} has the unknown type {type}.",
    description: "A component's type is not defined by any loaded pack.",
  },
  TYPE_PACK_NOT_LISTED: {
    severity: "error",
    source: "model-validity",
    template:
      "Component {component} uses type {type} from pack {pack}, which the solution does not list.",
    description:
      "A component's type comes from a pack that is neither listed in the solution's packs nor required by a listed pack.",
  },
  PROPERTY_UNKNOWN: {
    severity: "error",
    source: "model-validity",
    template: "Component {component} sets property {property}, which type {type} does not define.",
    description: "A component sets a property that its type does not declare.",
  },
  NETWORK_REFERENCE_INVALID: {
    severity: "error",
    source: "model-validity",
    template: "{path} must refer to {expected}; {id} does not qualify.",
    description:
      "A router, gateway, traffic filter or rule refers to a component of the wrong kind: for example a route to a component that is not a gateway.",
  },
  REFERENCE_UNKNOWN: {
    severity: "error",
    source: "model-validity",
    template: "{path} refers to {id}, which is not a component of the solution.",
    description:
      "An intent, a placement or a property refers to a component id that does not exist.",
  },
  PLACEMENT_NOT_ZONE: {
    severity: "error",
    source: "model-validity",
    template: "Component {component} is placed in {zone}, which is not a zone.",
    description: "A component can only be placed in components that have the zone trait.",
  },
  PLACEMENT_CYCLE: {
    severity: "error",
    source: "model-validity",
    template: "Component {component} is placed inside itself: {chain}.",
    description: "Placements form a cycle.",
  },
  INTENT_SELF: {
    severity: "warning",
    source: "model-validity",
    template: "Intent {intent} goes from {component} to itself.",
    description: "An intent's source and target are the same component.",
  },
  INTENT_PURPOSE_MISSING: {
    severity: "error",
    source: "model-validity",
    template: "Intent {intent} states neither an action nor a port.",
    description: "An intent must say what is needed: an action, a port, or both.",
  },
  ACTION_UNKNOWN: {
    severity: "error",
    source: "model-validity",
    template: "Intent {intent} uses the unknown action {action}.",
    description: "An intent's action is not defined by the solution's packs.",
  },
  PORT_UNKNOWN: {
    severity: "error",
    source: "model-validity",
    template: "Intent {intent} uses the unknown port {port}.",
    description: "An intent's symbolic port is not defined by the solution's packs.",
  },

  // Analysis: connection-validity
  CONNECTION_NOT_ACCEPTED: {
    severity: "error",
    source: "connection-validity",
    template: "Intent {intent}: {toType} does not accept {purpose} from {fromType}.",
    description:
      "No accepts rule of the target's type allows the intent's action and port from the source's type.",
  },
  CONNECTION_RULES_MISSING: {
    severity: "warning",
    source: "connection-validity",
    template:
      "Intent {intent} cannot be checked: type {type} does not declare which interactions it accepts.",
    description:
      "The target's type has no accepts rules in its pack, so the intent's compatibility is undecidable.",
  },

  // Analysis: access
  ACCESS_ROUTE_MISSING: {
    severity: "error",
    source: "access",
    template: "Intent {intent}: {from} has no route to {to}.",
    description: "The source forwards requests, but none of its routes leads to the target.",
  },
  ACCESS_PORT_UNKNOWN: {
    severity: "warning",
    source: "access",
    template:
      "Intent {intent} cannot be decided: a traffic filter limits ports, and the intent's port is not known.",
    description:
      "The intent states no port, its target's endpoint lists none, and a filter on the way only allows some ports.",
  },
  ACCESS_NOT_REACHABLE: {
    severity: "error",
    source: "access",
    template: "Intent {intent}: {to} cannot be reached from {from}.",
    description:
      "The target's endpoint does not let the source reach it: it is private or has none, or it does not listen on the intent's port.",
  },
  ACCESS_PERMISSION_MISSING: {
    severity: "error",
    source: "access",
    template: "Intent {intent}: {from} has no permission to {action} {to}.",
    description:
      "The target controls access, and neither a grant, a forwarder's route nor public access allows the action.",
  },
  ACCESS_PROPERTY_UNSET: {
    severity: "warning",
    source: "access",
    template: "Intent {intent} cannot be decided: {component} does not set {property}.",
    description:
      "Under the strict assumption policy, a property the verdict depends on is not set. The pack-defaults policy would use the pack's documented default.",
  },
  ACCESS_ACTION_MISSING: {
    severity: "warning",
    source: "access",
    template:
      "Intent {intent} cannot be decided: {to} controls access per action, but the intent states no action.",
    description: "Authorization is decided per action, and the intent only states a port.",
  },
  ACCESS_ADDRESS_UNDECIDABLE: {
    severity: "warning",
    source: "access",
    template:
      "Intent {intent} cannot be decided: an address range in a traffic filter or route cannot be matched with the addresses given.",
    description:
      "A rule or route uses an address range, and the level or the known addresses are not enough to tell whether it applies.",
  },
  EXPOSED_TO_INTERNET: {
    severity: "info",
    source: "access",
    template: "{component} is directly accessible from the internet.",
    description:
      "An anonymous caller outside the solution can reach the component and is allowed to use it.",
  },

  // Analysis: address-plan (detailed level)
  ADDRESS_SPACE_MISSING: {
    severity: "warning",
    source: "address-plan",
    template: "Zone {zone} has no address space, so its address plan cannot be checked.",
    description: "The detailed level needs the zone's address space.",
  },
  ADDRESS_SPACE_INVALID: {
    severity: "error",
    source: "address-plan",
    template:
      "Zone {zone} has the address space {value}, which is not an IPv4 range such as 10.0.0.0/16.",
    description: "Address spaces are IPv4 ranges in CIDR notation; IPv6 is not supported yet.",
  },
  IPV6_SPACE_INVALID: {
    severity: "error",
    source: "address-plan",
    template:
      "Zone {zone} has the IPv6 address space {value}, which is not an IPv6 range such as 2001:db8::/56.",
    description: "The zone's IPv6 address space must be an IPv6 range in CIDR notation.",
  },
  IPV6_SPACE_WITHOUT_PARENT: {
    severity: "error",
    source: "address-plan",
    template:
      "Zone {zone} has the IPv6 address space {space}, but {parent}, the zone it is placed in, has none.",
    description:
      "A zone can only have IPv6 addresses when the zone it is placed in has an IPv6 address space.",
  },
  ADDRESS_SPACE_HOST_BITS: {
    severity: "warning",
    source: "address-plan",
    template:
      "The address space {value} of zone {zone} is not a network address; it stands for {network}.",
    description: "The range has host bits set; most providers reject it.",
  },
  ADDRESS_SPACE_OUTSIDE_PARENT: {
    severity: "error",
    source: "address-plan",
    template:
      "The address space {space} of zone {zone} is not within {parentSpace}, the address space of {parent}.",
    description:
      "A zone's address space must lie within the address space of the zone it is placed in.",
  },
  ADDRESS_SPACE_OVERLAP: {
    severity: "error",
    source: "address-plan",
    template: "{zone} ({space}) overlaps {other} ({otherSpace}), which is placed in the same zone.",
    description: "Zones placed in the same zone must not share addresses.",
  },
  NETWORK_OVERLAP: {
    severity: "warning",
    source: "address-plan",
    template:
      "The networks {zone} ({space}) and {other} ({otherSpace}) overlap, so they cannot be connected directly.",
    description: "Overlapping networks cannot be peered or routed to each other.",
  },
  ROUTE_DESTINATION_INVALID: {
    severity: "error",
    source: "address-plan",
    template:
      "Route {index} of {router} has the destination {destination}, which is neither internet, an address range nor a service.",
    description:
      "Route destinations are `internet`, IPv4 or IPv6 ranges in CIDR notation, or the ids of services.",
  },
  ROUTE_SHADOWED: {
    severity: "warning",
    source: "address-plan",
    template:
      "Route {destination} of {router} lies within {space}, the address space of {network}; the local route takes that traffic.",
    description: "A route inside the network's own address space never applies.",
  },

  // Analysis: availability
  AVAILABILITY_SINGLE_POINT: {
    severity: "warning",
    source: "availability",
    template:
      "{component} runs in a single failure domain ({domain}), and intents depend on it: {intents}.",
    description: "A component that passing intents depend on would fail with its failure domain.",
  },
  AVAILABILITY_CROSS_DOMAIN: {
    severity: "warning",
    source: "availability",
    template:
      "{zone} ({domain}) reaches the internet through {gateway} in {gatewayDomain}; if {gatewayDomain} fails, {zone} loses its outbound connections.",
    description: "An outbound-only gateway in another failure domain ties the zone to that domain.",
  },

  // Tasks and requirement checks
  TASK_PACK_UNKNOWN: {
    severity: "error",
    source: "requirements",
    template: "The task needs pack {pack}, which is not loaded.",
    description: "The task lists a pack that the registry does not contain.",
  },
  TASK_ID_DUPLICATE: {
    severity: "error",
    source: "requirements",
    template: "The id {id} is used by more than one provided component or requirement.",
    description: "Provided component and requirement ids must be unique within a task.",
  },
  TASK_REFERENCE_UNKNOWN: {
    severity: "error",
    source: "requirements",
    template: "{path} refers to an unknown {kind} {id}.",
    description:
      "A provided component or a selector refers to a type, category, trait, action or port that the task's packs do not define.",
  },
  TASK_SELECTOR_NOT_PROVIDED: {
    severity: "error",
    source: "requirements",
    template: "{path} selects {id}, which the task does not provide.",
    description:
      "Requirements select by id only components the task provides, because the solver chooses every other id.",
  },
  TASK_PROVIDED_MISSING: {
    severity: "error",
    source: "requirements",
    template: "The solution does not contain {component}, which the task provides.",
    description: "A provided component was removed from the solution.",
  },
  TASK_PROVIDED_CHANGED: {
    severity: "error",
    source: "requirements",
    template:
      "{component} has type {actual} in the solution, but the task provides type {expected}.",
    description: "A provided component's type was changed in the solution.",
  },
  REQUIREMENT_FAILED: {
    severity: "error",
    source: "requirements",
    template: "Requirement {requirement} is not met.",
    description: "The requirement's verdict is fail; its evidence says why.",
  },
  REQUIREMENT_UNDECIDABLE: {
    severity: "warning",
    source: "requirements",
    template: "Requirement {requirement} cannot be decided.",
    description: "The requirement's verdict is undecidable; its evidence says what is missing.",
  },
} as const satisfies Record<string, FindingCodeDefinition>;

/** A stable finding code. */
export type FindingCode = keyof typeof FINDING_CODES;

export interface EvidenceCodeDefinition {
  /** English message template. `{name}` is replaced by the parameter `name`. */
  readonly template: string;
  /** One-sentence explanation for the documentation. */
  readonly description: string;
}

/**
 * Evidence explains a verdict: which check was made and which setting allowed or blocked it.
 * `docs/finding-codes.md` lists these codes as well.
 */
export const EVIDENCE_CODES = {
  COMPONENT_MISSING: {
    template: "{component} is not a component of the solution.",
    description: "An end of the intent does not exist, so nothing can be decided.",
  },
  TYPE_MISSING: {
    template: "The type {type} of {component} is not available.",
    description: "The component's type is unknown or its pack is not used by the solution.",
  },
  PURPOSE_MISSING: {
    template: "The intent states neither an action nor a port.",
    description: "Without an action or a port there is nothing to check.",
  },
  ACTION_UNDEFINED: {
    template: "The action {action} is not defined by the solution's packs.",
    description: "The intent's action is unknown.",
  },
  PORT_UNDEFINED: {
    template: "The port {port} is not defined by the solution's packs.",
    description: "The intent's symbolic port is unknown.",
  },
  ACCEPTS_UNDECLARED: {
    template: "Type {type} does not declare which interactions it accepts.",
    description: "The target's pack has no accepts rules for the type.",
  },
  ACCEPTED: {
    template: "{toType} accepts {purpose} from {fromType} (accepts rule {rule}).",
    description: "An accepts rule of the target's type matches the intent.",
  },
  NOT_ACCEPTED: {
    template: "{toType} does not accept {purpose} from {fromType}.",
    description: "No accepts rule of the target's type matches the intent.",
  },
  PROPERTY_UNSET: {
    template: "{component} does not set {property}.",
    description: "A property the check depends on is not set (strict policy).",
  },
  PROPERTY_ASSUMED: {
    template: "{component} does not set {property}; the pack default {value} is assumed.",
    description: "The pack-defaults policy used a documented default.",
  },
  PROPERTY_INVALID: {
    template: "{component} sets {property} to a value the check cannot use.",
    description: "The value does not match the property's schema; model-validity reports why.",
  },
  ROUTE_FOUND: {
    template: "{from} has a route to {to}.",
    description: "One of the forwarder's routes targets the intent's target.",
  },
  ROUTE_MISSING: {
    template: "{from} has no route to {to}.",
    description: "None of the forwarder's routes targets the intent's target.",
  },
  ENDPOINT_PUBLIC: {
    template: "{to} has a public endpoint.",
    description: "The target can be reached from anywhere.",
  },
  ENDPOINT_PRIVATE: {
    template: "{to} has a private endpoint, and {from} is not inside its network.",
    description: "A private endpoint can only be reached from inside the same network.",
  },
  ENDPOINT_NONE: {
    template: "{to} has no network endpoint.",
    description: "The target cannot be called over the network.",
  },
  ENDPOINT_FORWARDED: {
    template: "{to} has no network endpoint of its own, but {from} forwards to it.",
    description: "A component without an endpoint is reached through a forwarder's integration.",
  },
  PORT_OPEN: {
    template: "{to} listens on port {port}.",
    description: "The intent's port is one of the endpoint's ports.",
  },
  PORT_CLOSED: {
    template: "{to} does not listen on port {port}; it listens on {ports}.",
    description: "The intent's port is not one of the endpoint's ports.",
  },
  FORWARDER_AUTHORIZED: {
    template: "{from}'s route to {to} also authorizes it.",
    description: "A forwarder whose routes authorize their targets may use them.",
  },
  GRANT_FOUND: {
    template: "{from} has {access} access to {to}, which allows {action}.",
    description: "A grant of the source allows the action on the target.",
  },
  GRANT_MISSING: {
    template: "{from} has no grant on {to} that allows {action}.",
    description: "None of the source's grants allows the action on the target.",
  },
  NOT_PRINCIPAL: {
    template: "{from} has no identity that can be granted access.",
    description: "The source is not a principal, so only public access could allow the action.",
  },
  PUBLIC_ALLOWED: {
    template: "{to} allows public {action}.",
    description: "Public access is on and covers the action.",
  },
  PUBLIC_DENIED: {
    template: "{to} does not allow public {action}.",
    description: "Public access is off, or it does not cover the action.",
  },
  ACTION_REQUIRED: {
    template: "{to} controls access per action, but the intent states no action.",
    description: "Authorization needs the intent's action.",
  },
  PLACEMENT_INVALID: {
    template: "{component} is placed in {zone}, which is not a zone of the solution.",
    description: "The component's placement is invalid, so its network position is unknown.",
  },
  SAME_NETWORK: {
    template: "{from} and {to} are in the same network, {network}.",
    description:
      "Both sides are placed in zones of the same outermost zone; local routes connect them.",
  },
  LOCAL_ROUTES_ONLY: {
    template: "{zone} has no router, so it only has local routes.",
    description: "No router serves the zone or the zones it is placed in.",
  },
  INTERNET_ROUTE_MISSING: {
    template: "{router}, the router of {zone}, has no route to the internet.",
    description: "The zone's router has no route with the destination internet.",
  },
  INTERNET_ROUTE: {
    template: "{zone} reaches the internet through {gateway}.",
    description: "The zone's internet route uses a gateway that allows both directions.",
  },
  NAT_ROUTE: {
    template: "{zone} reaches the internet through {gateway}, for outbound connections only.",
    description: "The zone's internet route uses an outbound-only gateway.",
  },
  GATEWAY_SERVICES_ONLY: {
    template:
      "{gateway} only reaches provider services, so it cannot carry internet traffic from {zone}.",
    description: "A gateway with `services` is not a route to the internet.",
  },
  GATEWAY_FAMILY_UNSUPPORTED: {
    template: "{gateway} does not carry {family} traffic.",
    description:
      "The gateway's `families` do not include the traffic's address family (detailed level).",
  },
  ADDRESS_FAMILY: {
    template: "Over {family}:",
    description:
      "Both ends have IPv4 and IPv6 at the detailed level; the evidence that follows is for this address family.",
  },
  DIRECT_INTERNET: {
    template: "{component} reaches the internet through its public address in {zone}.",
    description:
      "The zone's network routes internet traffic to and from public endpoints without gateway components (`zone.directInternet`).",
  },
  NO_PUBLIC_ADDRESS: {
    template:
      "{component} has no public endpoint, and {zone} has no internet route or outbound gateway for it.",
    description:
      "In a network with direct internet access, a component without a public endpoint needs a route or an implicit gateway, such as a NAT gateway, to open connections to the internet.",
  },
  GATEWAY_INVALID: {
    template: "{gateway} is not a gateway.",
    description: "A route points to a component without the gateway trait.",
  },
  GATEWAY_NOT_ATTACHED: {
    template: "{gateway} is not attached to the network {network}.",
    description: "A route points to a gateway of another network.",
  },
  GATEWAY_OUTBOUND_ONLY: {
    template:
      "{gateway} only allows outbound connections, so {zone} cannot be reached from the internet.",
    description: "Inbound traffic needs a gateway that allows both directions.",
  },
  PRIVATE_SERVICE_ROUTE: {
    template: "{zone} reaches {service} privately through {gateway}.",
    description:
      "A route names the service, and its gateway reaches the service without the internet.",
  },
  SERVICE_NOT_SERVED: {
    template: "{gateway} does not reach {service}.",
    description: "A route sends traffic for a service to a gateway that does not list it.",
  },
  NAT_WITHOUT_INTERNET: {
    template:
      "{gateway} sits in {zone}, which has no route to the internet through a gateway that allows both directions.",
    description: "An outbound-only gateway needs a route to the internet itself.",
  },
  FILTER_ALLOWS: {
    template: "{filter} allows {direction} traffic with {peer} (rule {rule}).",
    description: "The first matching rule of a traffic filter allows the traffic.",
  },
  FILTER_DENIES: {
    template: "{filter} denies {direction} traffic with {peer} (rule {rule}).",
    description: "The first matching rule of a traffic filter denies the traffic.",
  },
  FILTER_DEFAULT_ALLOWS: {
    template: "No rule of {filter} matches {direction} traffic with {peer}; its default allows it.",
    description: "No rule matches, and the filter's default policy allows.",
  },
  FILTER_DEFAULT_DENIES: {
    template: "No rule of {filter} matches {direction} traffic with {peer}; its default denies it.",
    description: "No rule matches, and the filter's default policy denies.",
  },
  FILTER_PORT_UNKNOWN: {
    template: "Rule {rule} of {filter} limits ports, but the traffic's port is not known.",
    description: "The intent states no port and the target's endpoint lists none.",
  },
  FILTER_BASE_ALLOWS: {
    template: "{filter} allows {direction} traffic with {peer} (base rule {rule} of its type).",
    description:
      "No rule of the filter matches; the first matching base rule of its type allows the traffic.",
  },
  FILTER_BASE_DENIES: {
    template: "{filter} denies {direction} traffic with {peer} (base rule {rule} of its type).",
    description:
      "No rule of the filter matches; the first matching base rule of its type denies the traffic.",
  },
  FILTER_BASE_PORT_UNKNOWN: {
    template: "Base rule {rule} of {filter} limits ports, but the traffic's port is not known.",
    description: "The intent states no port and the target's endpoint lists none.",
  },
  STATELESS_RETURN: {
    template: "{filter} is stateless, so the return traffic needs a rule of its own.",
    description: "Stateless filters check the replies as well, on any port.",
  },
  CIDR_NEEDS_DETAILED: {
    template:
      "A rule names the address range {cidr}; comparing it with {party} needs the detailed level.",
    description: "Address ranges other than 0.0.0.0/0 are only matched at the detailed level.",
  },
  PEER_ADDRESS_UNKNOWN: {
    template: "The address of {party} is not known, so it cannot be compared with {cidr}.",
    description: "The party is outside every zone, or its zones have no address space.",
  },
  CIDR_PARTLY_COVERS: {
    template: "{cidr} covers only part of {zone} ({space}).",
    description: "Some addresses of the zone match the rule and some do not.",
  },
  ROUTE_AMBIGUOUS: {
    template:
      "{router}, the router of {zone}, sends some public address ranges to another gateway, and the destination's address is not known.",
    description: "A more specific route may catch the traffic.",
  },
  NOT_REACHABLE_FROM_INTERNET: {
    template: "{component} cannot be reached from the internet on any port.",
    description: "Routes, gateways or traffic filters keep outside callers out.",
  },
  ANONYMOUS_ALLOWED: {
    template: "{component} does not control access.",
    description: "Anyone who can reach the component may use it.",
  },
  ENDPOINT_NOT_PUBLIC: {
    template: "{component} has no public endpoint.",
    description: "Its endpoint is private or it has none, so it cannot be reached from outside.",
  },
  PUBLIC_ACCESS_ON: {
    template: "{component} allows public {actions}.",
    description: "Anonymous callers may perform these actions.",
  },
  PUBLIC_ACCESS_OFF: {
    template: "{component} does not allow public access.",
    description: "Anonymous callers may not use the component.",
  },
  MANAGED_SERVICE: {
    template: "The provider runs {component} across failure domains.",
    description: "The type, or the component's setting, makes it a managed, multi-domain service.",
  },
  NOT_MANAGED: {
    template: "The provider runs {component} in one failure domain.",
    description:
      "The component's setting turns off the provider's redundancy, for example zone redundancy.",
  },
  NO_FAILURE_DOMAIN: {
    template: "{component} is not assigned to failure domains, so it runs in one.",
    description:
      "The component's own list of failure domains is empty, as for a VM without an availability zone.",
  },
  NOT_PLACED: {
    template: "{component} is not placed in any zone, so its failure domains are not known.",
    description: "Only placed components have failure domains.",
  },
  FAILURE_DOMAIN_UNKNOWN: {
    template: "{zone}, where {component} is placed, has no failure domain.",
    description: "Neither the zone nor a zone it is placed in declares a failure domain.",
  },
  SINGLE_INSTANCE: {
    template: "{component} runs one instance, in one of the zones it is placed in.",
    description: "The type's redundancy spread is off, for example a database without a standby.",
  },
  FAILURE_DOMAINS: {
    template: "{component} runs in: {domains}.",
    description: "The failure domains the component spans.",
  },
  REDUNDANT: {
    template: "{component} survives the loss of a failure domain ({availability}).",
    description: "The component is managed by the provider or runs in two or more failure domains.",
  },
  NOT_REDUNDANT: {
    template: "{component} runs in a single failure domain.",
    description: "The component would fail with its failure domain.",
  },
  REDUNDANCY_UNKNOWN: {
    template: "The failure domains of {component} are not known.",
    description: "The availability analysis could not decide.",
  },
  SELECTOR_EMPTY: {
    template: "No component matches {selector}.",
    description: "The selector matches nothing in the solution.",
  },
  ANALYSIS_MISSING: {
    template: "The analysis result has no {analysis} report.",
    description: "The requirement needs an analysis that was not run.",
  },
  PATH_FOUND: {
    template: "Reachable: {path}.",
    description: "A chain of intents with a pass verdict leads from a source to a target.",
  },
  PATH_UNDECIDABLE: {
    template: "A chain exists, {path}, but these intents are undecidable: {intents}.",
    description: "The only chains include intents whose verdict is undecidable.",
  },
  PATH_MISSING: {
    template: "No chain of intents leads from {from} to {to}{purpose}.",
    description: "No chain of passing or undecidable intents connects a source to a target.",
  },
  ACCESSIBLE: {
    template: "{to} is directly accessible from {from}{purpose}.",
    description: "The connectivity and authorization checks pass for this pair.",
  },
  MAYBE_ACCESSIBLE: {
    template: "Whether {to} is directly accessible from {from}{purpose} is undecidable.",
    description: "The checks for this pair are undecidable.",
  },
  NOT_ACCESSIBLE: {
    template:
      "No matching target is directly accessible from a matching source ({pairs} pairs checked).",
    description: "The connectivity or authorization check fails for every pair.",
  },
  ACCESS_UNMODELED: {
    template:
      "{to} has neither an endpoint nor access control, so direct access cannot be decided.",
    description: "The target's type does not model how it is reached.",
  },
  USES_COUNT: {
    template: "{count} component(s) match {selector}; at least {min} required.",
    description: "How many components match the selector.",
  },
} as const satisfies Record<string, EvidenceCodeDefinition>;

/** A stable evidence code. */
export type EvidenceCode = keyof typeof EVIDENCE_CODES;
