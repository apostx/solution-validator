/** How serious a finding is. */
export type Severity = "error" | "warning" | "info";

/** Where a finding code comes from. */
export type FindingSource =
  | "schema"
  | "registry"
  | "model-validity"
  | "connection-validity"
  | "access";

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
  ACCESS_ZONES_UNSUPPORTED: {
    severity: "warning",
    source: "access",
    template: "Intent {intent} cannot be decided: placement in zones is not analyzed yet.",
    description:
      "A private endpoint or a placed component needs the network traits, which are not implemented yet.",
  },
  EXPOSED_TO_INTERNET: {
    severity: "info",
    source: "access",
    template: "{component} is directly accessible from the internet.",
    description:
      "An anonymous caller outside the solution can reach the component and is allowed to use it.",
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
    template: "{to} has a private endpoint, and {from} is not inside a private network.",
    description: "A private endpoint can only be reached from inside a private network.",
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
  ZONES_UNSUPPORTED: {
    template: "Placement in zones is not analyzed yet.",
    description: "The network traits are not implemented yet.",
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
} as const satisfies Record<string, EvidenceCodeDefinition>;

/** A stable evidence code. */
export type EvidenceCode = keyof typeof EVIDENCE_CODES;
