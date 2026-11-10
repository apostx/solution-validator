/** How serious a finding is. */
export type Severity = "error" | "warning" | "info";

/** Where a finding code comes from. */
export type FindingSource = "schema" | "registry" | "model-validity";

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
} as const satisfies Record<string, FindingCodeDefinition>;

/** A stable finding code. */
export type FindingCode = keyof typeof FINDING_CODES;
