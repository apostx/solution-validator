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

## Analysis: access

Logical access: forwarding, connectivity and authorization for every intent, and exposure to the internet. Failures are reported per failing check; undecidable intents report what is missing. Compatibility failures come from `connection-validity`, which always runs with `access`.

| Code | Severity | Message template | Meaning |
|---|---|---|---|
| `ACCESS_ROUTE_MISSING` | error | Intent {intent}: {from} has no route to {to}. | The source forwards requests, but none of its routes leads to the target. |
| `ACCESS_NOT_REACHABLE` | error | Intent {intent}: {to} cannot be reached from {from}. | The target's endpoint does not let the source reach it: it is private or has none, or it does not listen on the intent's port. |
| `ACCESS_PERMISSION_MISSING` | error | Intent {intent}: {from} has no permission to {action} {to}. | The target controls access, and neither a grant, a forwarder's route nor public access allows the action. |
| `ACCESS_PROPERTY_UNSET` | warning | Intent {intent} cannot be decided: {component} does not set {property}. | Under the strict assumption policy, a property the verdict depends on is not set. The pack-defaults policy would use the pack's documented default. |
| `ACCESS_ACTION_MISSING` | warning | Intent {intent} cannot be decided: {to} controls access per action, but the intent states no action. | Authorization is decided per action, and the intent only states a port. |
| `ACCESS_ZONES_UNSUPPORTED` | warning | Intent {intent} cannot be decided: placement in zones is not analyzed yet. | A private endpoint or a placed component needs the network traits, which are not implemented yet. |
| `EXPOSED_TO_INTERNET` | info | {component} is directly accessible from the internet. | An anonymous caller outside the solution can reach the component and is allowed to use it. |

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
| `PROPERTY_UNSET` | {component} does not set {property}. | A property the check depends on is not set (strict policy). |
| `PROPERTY_ASSUMED` | {component} does not set {property}; the pack default {value} is assumed. | The pack-defaults policy used a documented default. |
| `PROPERTY_INVALID` | {component} sets {property} to a value the check cannot use. | The value does not match the property's schema; model-validity reports why. |
| `ROUTE_FOUND` | {from} has a route to {to}. | One of the forwarder's routes targets the intent's target. |
| `ROUTE_MISSING` | {from} has no route to {to}. | None of the forwarder's routes targets the intent's target. |
| `ENDPOINT_PUBLIC` | {to} has a public endpoint. | The target can be reached from anywhere. |
| `ENDPOINT_PRIVATE` | {to} has a private endpoint, and {from} is not inside a private network. | A private endpoint can only be reached from inside a private network. |
| `ENDPOINT_NONE` | {to} has no network endpoint. | The target cannot be called over the network. |
| `ENDPOINT_FORWARDED` | {to} has no network endpoint of its own, but {from} forwards to it. | A component without an endpoint is reached through a forwarder's integration. |
| `PORT_OPEN` | {to} listens on port {port}. | The intent's port is one of the endpoint's ports. |
| `PORT_CLOSED` | {to} does not listen on port {port}; it listens on {ports}. | The intent's port is not one of the endpoint's ports. |
| `ZONES_UNSUPPORTED` | Placement in zones is not analyzed yet. | The network traits are not implemented yet. |
| `FORWARDER_AUTHORIZED` | {from}'s route to {to} also authorizes it. | A forwarder whose routes authorize their targets may use them. |
| `GRANT_FOUND` | {from} has {access} access to {to}, which allows {action}. | A grant of the source allows the action on the target. |
| `GRANT_MISSING` | {from} has no grant on {to} that allows {action}. | None of the source's grants allows the action on the target. |
| `NOT_PRINCIPAL` | {from} has no identity that can be granted access. | The source is not a principal, so only public access could allow the action. |
| `PUBLIC_ALLOWED` | {to} allows public {action}. | Public access is on and covers the action. |
| `PUBLIC_DENIED` | {to} does not allow public {action}. | Public access is off, or it does not cover the action. |
| `ACTION_REQUIRED` | {to} controls access per action, but the intent states no action. | Authorization needs the intent's action. |
| `ANONYMOUS_ALLOWED` | {component} does not control access. | Anyone who can reach the component may use it. |
| `ENDPOINT_NOT_PUBLIC` | {component} has no public endpoint. | Its endpoint is private or it has none, so it cannot be reached from outside. |
| `PUBLIC_ACCESS_ON` | {component} allows public {actions}. | Anonymous callers may perform these actions. |
| `PUBLIC_ACCESS_OFF` | {component} does not allow public access. | Anonymous callers may not use the component. |
