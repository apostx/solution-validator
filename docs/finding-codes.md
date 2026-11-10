# Finding codes

> Generated from `src/messages/codes.ts` by `test/docs.test.ts`. Do not edit by hand; run `npx vitest run -u` after changing the catalog.

Every finding has a stable `code`, a `severity`, the `subjects` it is about (component, intent, pack or type ids), `params`, and a default English `message` rendered from the template below. `{name}` stands for the parameter `name`. Consumers may translate messages from the code and the parameters.

## Schema validation

Reported by `parseSolution` for the solution document, by `createRegistry` for packs, and by the `model-validity` analysis for component properties. `path` is a JSON Pointer.

| Code | Severity | Message template | Meaning |
|---|---|---|---|
| `JSON_INVALID` | error | The input is not valid JSON. | Text passed to the parser could not be read as JSON. |
| `SCHEMA_REQUIRED` | error | {path} is missing the required field {field}. | A required field is missing. |
| `SCHEMA_UNKNOWN_FIELD` | error | {path} has an unknown field {field}. | A field is not defined by the schema. |
| `SCHEMA_TYPE` | error | {path} must be of type {expected}. | A value has the wrong JSON type. |
| `SCHEMA_ENUM` | error | {path} must be one of: {allowed}. | A value is not one of the allowed values. |
| `SCHEMA_FORM` | error | {path} does not match any of the allowed forms. | A value matches none of the alternatives the schema allows. |
| `SCHEMA_CONSTRAINT` | error | {path} does not satisfy the constraint {constraint} {limit}. | A value violates a constraint such as a pattern, a length or a range. |

## Registry

Thrown by `createRegistry` in a `RegistryError` when packs are invalid.

| Code | Severity | Message template | Meaning |
|---|---|---|---|
| `PACK_DUPLICATE` | error | Pack {pack} is loaded more than once. | Two loaded packs have the same id. |
| `PACK_VOCABULARY_UNSUPPORTED` | error | Pack {pack} needs trait vocabulary version {required}, but this library provides version {provided}. | A pack needs a newer trait vocabulary than this library version implements. |
| `PACK_REQUIREMENT_MISSING` | error | Pack {pack} requires pack {required}, which is not loaded. | A pack depends on a pack that was not passed to the registry. |
| `PACK_REQUIREMENT_VERSION` | error | Pack {pack} requires {required} {range}, but version {version} is loaded. | A required pack is loaded in a version outside the requested range. |
| `PACK_NAMESPACE` | error | The {kind} {id} in pack {pack} must start with {prefix}. | A pack defines an id outside its own namespace. |
| `PACK_DEFINITION_DUPLICATE` | error | The {kind} {id} is defined more than once. | The same id is defined twice, in one pack or across packs. |
| `PACK_REFERENCE_UNKNOWN` | error | {path} in pack {pack} refers to an unknown {kind} {id}. | A pack refers to a type, category, action, port, trait or property that is not defined in the pack or in the packs it requires. |
| `PACK_BINDING_MISMATCH` | error | {path} in pack {pack} binds the trait parameter {trait}.{parameter} to property {property}, which must be {expected}. | A trait parameter is bound to a property whose schema does not fit it. |
| `PACK_PROPERTY_DEFAULT_INVALID` | error | The default of property {property} of type {type} does not match its schema. | A documented default value is not valid for its own property schema. |

## Analysis: model-validity

Semantic checks of a parsed solution.

| Code | Severity | Message template | Meaning |
|---|---|---|---|
| `SOLUTION_PACK_UNKNOWN` | error | The solution needs pack {pack}, which is not loaded. | The solution lists a pack that the registry does not contain. |
| `SOLUTION_PACK_DUPLICATE` | warning | Pack {pack} is listed more than once. | The solution lists the same pack twice. |
| `ID_DUPLICATE` | error | The id {id} is used by more than one component or intent. | Component and intent ids must be unique within a solution. |
| `TYPE_UNKNOWN` | error | Component {component} has the unknown type {type}. | A component's type is not defined by any loaded pack. |
| `TYPE_PACK_NOT_LISTED` | error | Component {component} uses type {type} from pack {pack}, which the solution does not list. | A component's type comes from a pack that is neither listed in the solution's packs nor required by a listed pack. |
| `PROPERTY_UNKNOWN` | error | Component {component} sets property {property}, which type {type} does not define. | A component sets a property that its type does not declare. |
| `REFERENCE_UNKNOWN` | error | {path} refers to {id}, which is not a component of the solution. | An intent, a placement or a property refers to a component id that does not exist. |
| `PLACEMENT_NOT_ZONE` | error | Component {component} is placed in {zone}, which is not a zone. | A component can only be placed in components that have the zone trait. |
| `PLACEMENT_CYCLE` | error | Component {component} is placed inside itself: {chain}. | Placements form a cycle. |
| `INTENT_SELF` | warning | Intent {intent} goes from {component} to itself. | An intent's source and target are the same component. |
| `INTENT_PURPOSE_MISSING` | error | Intent {intent} states neither an action nor a port. | An intent must say what is needed: an action, a port, or both. |
| `ACTION_UNKNOWN` | error | Intent {intent} uses the unknown action {action}. | An intent's action is not defined by the solution's packs. |
| `PORT_UNKNOWN` | error | Intent {intent} uses the unknown port {port}. | An intent's symbolic port is not defined by the solution's packs. |

## Analysis: connection-validity

Whether the target's type accepts each intent from the source's type. Intents that cannot be checked because the model is invalid get an `undecidable` verdict without a finding; `model-validity` reports the cause.

| Code | Severity | Message template | Meaning |
|---|---|---|---|
| `CONNECTION_NOT_ACCEPTED` | error | Intent {intent}: {toType} does not accept {purpose} from {fromType}. | No accepts rule of the target's type allows the intent's action and port from the source's type. |
| `CONNECTION_RULES_MISSING` | warning | Intent {intent} cannot be checked: type {type} does not declare which interactions it accepts. | The target's type has no accepts rules in its pack, so the intent's compatibility is undecidable. |

## Evidence codes

Evidence explains an intent's verdict: each check lists the evidence it used. Evidence has a `code`, `params` and a default English `message`, like a finding, but no severity.

| Code | Message template | Meaning |
|---|---|---|
| `COMPONENT_MISSING` | {component} is not a component of the solution. | An end of the intent does not exist, so nothing can be decided. |
| `TYPE_MISSING` | The type {type} of {component} is not available. | The component's type is unknown or its pack is not used by the solution. |
| `PURPOSE_MISSING` | The intent states neither an action nor a port. | Without an action or a port there is nothing to check. |
| `ACTION_UNDEFINED` | The action {action} is not defined by the solution's packs. | The intent's action is unknown. |
| `PORT_UNDEFINED` | The port {port} is not defined by the solution's packs. | The intent's symbolic port is unknown. |
| `ACCEPTS_UNDECLARED` | Type {type} does not declare which interactions it accepts. | The target's pack has no accepts rules for the type. |
| `ACCEPTED` | {toType} accepts {purpose} from {fromType} (accepts rule {rule}). | An accepts rule of the target's type matches the intent. |
| `NOT_ACCEPTED` | {toType} does not accept {purpose} from {fromType}. | No accepts rule of the target's type matches the intent. |
