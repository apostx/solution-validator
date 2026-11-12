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
| `NETWORK_REFERENCE_INVALID` | error | {path} must refer to {expected}; {id} does not qualify. | A router, gateway, traffic filter or rule refers to a component of the wrong kind: for example a route to a component that is not a gateway. |
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
| `ACCESS_PORT_UNKNOWN` | warning | Intent {intent} cannot be decided: a traffic filter limits ports, and the intent's port is not known. | The intent states no port, its target's endpoint lists none, and a filter on the way only allows some ports. |
| `ACCESS_NOT_REACHABLE` | error | Intent {intent}: {to} cannot be reached from {from}. | The target's endpoint does not let the source reach it: it is private or has none, or it does not listen on the intent's port. |
| `ACCESS_PERMISSION_MISSING` | error | Intent {intent}: {from} has no permission to {action} {to}. | The target controls access, and neither a grant, a forwarder's route nor public access allows the action. |
| `ACCESS_PROPERTY_UNSET` | warning | Intent {intent} cannot be decided: {component} does not set {property}. | Under the strict assumption policy, a property the verdict depends on is not set. The pack-defaults policy would use the pack's documented default. |
| `ACCESS_ACTION_MISSING` | warning | Intent {intent} cannot be decided: {to} controls access per action, but the intent states no action. | Authorization is decided per action, and the intent only states a port. |
| `ACCESS_ADDRESS_UNDECIDABLE` | warning | Intent {intent} cannot be decided: an address range in a traffic filter or route cannot be matched with the addresses given. | A rule or route uses an address range, and the level or the known addresses are not enough to tell whether it applies. |
| `EXPOSED_TO_INTERNET` | info | {component} is directly accessible from the internet. | An anonymous caller outside the solution can reach the component and is allowed to use it. |

## Analysis: address-plan (detailed level)

Checks the address plan: zones' IPv4 address spaces, their nesting and overlaps, and route destinations.

| Code | Severity | Message template | Meaning |
|---|---|---|---|
| `ADDRESS_SPACE_MISSING` | warning | Zone {zone} has no address space, so its address plan cannot be checked. | The detailed level needs the zone's address space. |
| `ADDRESS_SPACE_INVALID` | error | Zone {zone} has the address space {value}, which is not an IPv4 range such as 10.0.0.0/16. | Address spaces are IPv4 ranges in CIDR notation; IPv6 is not supported yet. |
| `IPV6_SPACE_INVALID` | error | Zone {zone} has the IPv6 address space {value}, which is not an IPv6 range such as 2001:db8::/56. | The zone's IPv6 address space must be an IPv6 range in CIDR notation. |
| `IPV6_SPACE_WITHOUT_PARENT` | error | Zone {zone} has the IPv6 address space {space}, but {parent}, the zone it is placed in, has none. | A zone can only have IPv6 addresses when the zone it is placed in has an IPv6 address space. |
| `ADDRESS_SPACE_HOST_BITS` | warning | The address space {value} of zone {zone} is not a network address; it stands for {network}. | The range has host bits set; most providers reject it. |
| `ADDRESS_SPACE_OUTSIDE_PARENT` | error | The address space {space} of zone {zone} is not within {parentSpace}, the address space of {parent}. | A zone's address space must lie within the address space of the zone it is placed in. |
| `ADDRESS_SPACE_OVERLAP` | error | {zone} ({space}) overlaps {other} ({otherSpace}), which is placed in the same zone. | Zones placed in the same zone must not share addresses. |
| `NETWORK_OVERLAP` | warning | The networks {zone} ({space}) and {other} ({otherSpace}) overlap, so they cannot be connected directly. | Overlapping networks cannot be peered or routed to each other. |
| `ROUTE_DESTINATION_INVALID` | error | Route {index} of {router} has the destination {destination}, which is neither internet, an address range nor a service. | Route destinations are `internet`, IPv4 or IPv6 ranges in CIDR notation, or the ids of services. |
| `ROUTE_SHADOWED` | warning | Route {destination} of {router} lies within {space}, the address space of {network}; the local route takes that traffic. | A route inside the network's own address space never applies. |

## Analysis: availability

Failure domains per component, single points of failure on the paths of passing intents, and zones tied to another failure domain.

| Code | Severity | Message template | Meaning |
|---|---|---|---|
| `AVAILABILITY_SINGLE_POINT` | warning | {component} runs in a single failure domain ({domain}), and intents depend on it: {intents}. | A component that passing intents depend on would fail with its failure domain. |
| `AVAILABILITY_CROSS_DOMAIN` | warning | {zone} ({domain}) reaches the internet through {gateway} in {gatewayDomain}; if {gatewayDomain} fails, {zone} loses its outbound connections. | An outbound-only gateway in another failure domain ties the zone to that domain. |

## Terraform export

Reported by `exportTerraform` for what it could not export and for what the configuration still needs.

| Code | Severity | Message template | Meaning |
|---|---|---|---|
| `TERRAFORM_NOT_MAPPED` | info | {component} ({type}) has no Terraform mapping, so it is not exported. | The component's type has no `terraform` mapping in its pack. |
| `TERRAFORM_NOTE` | info | {component} ({resource}): {note} | Something the configuration still needs that the model does not hold, as the pack describes it. |
| `TERRAFORM_REFERENCE_UNMAPPED` | warning | {component} refers to {target}, which is not exported, so {argument} leaves it out. | A reference to a component without a Terraform mapping cannot be exported. |
| `TERRAFORM_ITEM_SKIPPED` | warning | {component}: item {index} of {property} has no Terraform equivalent here, so it is left out of {target}. | A rule, route or association uses something the mapping cannot express, such as a rule peer that names a component. |
| `TERRAFORM_PORT_UNKNOWN` | warning | {component}: port {port} is not known, so {argument} is left out. | A rule names a port that no loaded pack defines. |

## Tasks and requirements

Reported by `parseTask` for invalid tasks and by `checkRequirements` for provided components and requirement verdicts.

| Code | Severity | Message template | Meaning |
|---|---|---|---|
| `TASK_PACK_UNKNOWN` | error | The task needs pack {pack}, which is not loaded. | The task lists a pack that the registry does not contain. |
| `TASK_ID_DUPLICATE` | error | The id {id} is used by more than one provided component or requirement. | Provided component and requirement ids must be unique within a task. |
| `TASK_REFERENCE_UNKNOWN` | error | {path} refers to an unknown {kind} {id}. | A provided component or a selector refers to a type, category, trait, action or port that the task's packs do not define. |
| `TASK_SELECTOR_NOT_PROVIDED` | error | {path} selects {id}, which the task does not provide. | Requirements select by id only components the task provides, because the solver chooses every other id. |
| `TASK_PROVIDED_MISSING` | error | The solution does not contain {component}, which the task provides. | A provided component was removed from the solution. |
| `TASK_PROVIDED_CHANGED` | error | {component} has type {actual} in the solution, but the task provides type {expected}. | A provided component's type was changed in the solution. |
| `REQUIREMENT_FAILED` | error | Requirement {requirement} is not met. | The requirement's verdict is fail; its evidence says why. |
| `REQUIREMENT_UNDECIDABLE` | warning | Requirement {requirement} cannot be decided. | The requirement's verdict is undecidable; its evidence says what is missing. |

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
| `ENDPOINT_PRIVATE` | {to} has a private endpoint, and {from} is not inside its network. | A private endpoint can only be reached from inside the same network. |
| `ENDPOINT_NONE` | {to} has no network endpoint. | The target cannot be called over the network. |
| `ENDPOINT_FORWARDED` | {to} has no network endpoint of its own, but {from} forwards to it. | A component without an endpoint is reached through a forwarder's integration. |
| `PORT_OPEN` | {to} listens on port {port}. | The intent's port is one of the endpoint's ports. |
| `PORT_CLOSED` | {to} does not listen on port {port}; it listens on {ports}. | The intent's port is not one of the endpoint's ports. |
| `FORWARDER_AUTHORIZED` | {from}'s route to {to} also authorizes it. | A forwarder whose routes authorize their targets may use them. |
| `GRANT_FOUND` | {from} has {access} access to {to}, which allows {action}. | A grant of the source allows the action on the target. |
| `GRANT_MISSING` | {from} has no grant on {to} that allows {action}. | None of the source's grants allows the action on the target. |
| `NOT_PRINCIPAL` | {from} has no identity that can be granted access. | The source is not a principal, so only public access could allow the action. |
| `PUBLIC_ALLOWED` | {to} allows public {action}. | Public access is on and covers the action. |
| `PUBLIC_DENIED` | {to} does not allow public {action}. | Public access is off, or it does not cover the action. |
| `ACTION_REQUIRED` | {to} controls access per action, but the intent states no action. | Authorization needs the intent's action. |
| `PLACEMENT_INVALID` | {component} is placed in {zone}, which is not a zone of the solution. | The component's placement is invalid, so its network position is unknown. |
| `SAME_NETWORK` | {from} and {to} are in the same network, {network}. | Both sides are placed in zones of the same outermost zone; local routes connect them. |
| `LOCAL_ROUTES_ONLY` | {zone} has no router, so it only has local routes. | No router serves the zone or the zones it is placed in. |
| `INTERNET_ROUTE_MISSING` | {router}, the router of {zone}, has no route to the internet. | The zone's router has no route with the destination internet. |
| `INTERNET_ROUTE` | {zone} reaches the internet through {gateway}. | The zone's internet route uses a gateway that allows both directions. |
| `NAT_ROUTE` | {zone} reaches the internet through {gateway}, for outbound connections only. | The zone's internet route uses an outbound-only gateway. |
| `GATEWAY_SERVICES_ONLY` | {gateway} only reaches provider services, so it cannot carry internet traffic from {zone}. | A gateway with `services` is not a route to the internet. |
| `GATEWAY_FAMILY_UNSUPPORTED` | {gateway} does not carry {family} traffic. | The gateway's `families` do not include the traffic's address family (detailed level). |
| `ADDRESS_FAMILY` | Over {family}: | Both ends have IPv4 and IPv6 at the detailed level; the evidence that follows is for this address family. |
| `DIRECT_INTERNET` | {component} reaches the internet through its public address in {zone}. | The zone's network routes internet traffic to and from public endpoints without gateway components (`zone.directInternet`). |
| `NO_PUBLIC_ADDRESS` | {component} has no public endpoint, and {zone} has no internet route or outbound gateway for it. | In a network with direct internet access, a component without a public endpoint needs a route or an implicit gateway, such as a NAT gateway, to open connections to the internet. |
| `GATEWAY_INVALID` | {gateway} is not a gateway. | A route points to a component without the gateway trait. |
| `GATEWAY_NOT_ATTACHED` | {gateway} is not attached to the network {network}. | A route points to a gateway of another network. |
| `GATEWAY_OUTBOUND_ONLY` | {gateway} only allows outbound connections, so {zone} cannot be reached from the internet. | Inbound traffic needs a gateway that allows both directions. |
| `PRIVATE_SERVICE_ROUTE` | {zone} reaches {service} privately through {gateway}. | A route names the service, and its gateway reaches the service without the internet. |
| `SERVICE_NOT_SERVED` | {gateway} does not reach {service}. | A route sends traffic for a service to a gateway that does not list it. |
| `NAT_WITHOUT_INTERNET` | {gateway} sits in {zone}, which has no route to the internet through a gateway that allows both directions. | An outbound-only gateway needs a route to the internet itself. |
| `FILTER_ALLOWS` | {filter} allows {direction} traffic with {peer} (rule {rule}). | The first matching rule of a traffic filter allows the traffic. |
| `FILTER_DENIES` | {filter} denies {direction} traffic with {peer} (rule {rule}). | The first matching rule of a traffic filter denies the traffic. |
| `FILTER_DEFAULT_ALLOWS` | No rule of {filter} matches {direction} traffic with {peer}; its default allows it. | No rule matches, and the filter's default policy allows. |
| `FILTER_DEFAULT_DENIES` | No rule of {filter} matches {direction} traffic with {peer}; its default denies it. | No rule matches, and the filter's default policy denies. |
| `FILTER_PORT_UNKNOWN` | Rule {rule} of {filter} limits ports, but the traffic's port is not known. | The intent states no port and the target's endpoint lists none. |
| `FILTER_BASE_ALLOWS` | {filter} allows {direction} traffic with {peer} (base rule {rule} of its type). | No rule of the filter matches; the first matching base rule of its type allows the traffic. |
| `FILTER_BASE_DENIES` | {filter} denies {direction} traffic with {peer} (base rule {rule} of its type). | No rule of the filter matches; the first matching base rule of its type denies the traffic. |
| `FILTER_BASE_PORT_UNKNOWN` | Base rule {rule} of {filter} limits ports, but the traffic's port is not known. | The intent states no port and the target's endpoint lists none. |
| `STATELESS_RETURN` | {filter} is stateless, so the return traffic needs a rule of its own. | Stateless filters check the replies as well, on any port. |
| `CIDR_NEEDS_DETAILED` | A rule names the address range {cidr}; comparing it with {party} needs the detailed level. | Address ranges other than 0.0.0.0/0 are only matched at the detailed level. |
| `PEER_ADDRESS_UNKNOWN` | The address of {party} is not known, so it cannot be compared with {cidr}. | The party is outside every zone, or its zones have no address space. |
| `CIDR_PARTLY_COVERS` | {cidr} covers only part of {zone} ({space}). | Some addresses of the zone match the rule and some do not. |
| `ROUTE_AMBIGUOUS` | {router}, the router of {zone}, sends some public address ranges to another gateway, and the destination's address is not known. | A more specific route may catch the traffic. |
| `NOT_REACHABLE_FROM_INTERNET` | {component} cannot be reached from the internet on any port. | Routes, gateways or traffic filters keep outside callers out. |
| `ANONYMOUS_ALLOWED` | {component} does not control access. | Anyone who can reach the component may use it. |
| `ENDPOINT_NOT_PUBLIC` | {component} has no public endpoint. | Its endpoint is private or it has none, so it cannot be reached from outside. |
| `PUBLIC_ACCESS_ON` | {component} allows public {actions}. | Anonymous callers may perform these actions. |
| `PUBLIC_ACCESS_OFF` | {component} does not allow public access. | Anonymous callers may not use the component. |
| `MANAGED_SERVICE` | The provider runs {component} across failure domains. | The type, or the component's setting, makes it a managed, multi-domain service. |
| `NOT_MANAGED` | The provider runs {component} in one failure domain. | The component's setting turns off the provider's redundancy, for example zone redundancy. |
| `NO_FAILURE_DOMAIN` | {component} is not assigned to failure domains, so it runs in one. | The component's own list of failure domains is empty, as for a VM without an availability zone. |
| `NOT_PLACED` | {component} is not placed in any zone, so its failure domains are not known. | Only placed components have failure domains. |
| `FAILURE_DOMAIN_UNKNOWN` | {zone}, where {component} is placed, has no failure domain. | Neither the zone nor a zone it is placed in declares a failure domain. |
| `SINGLE_INSTANCE` | {component} runs one instance, in one of the zones it is placed in. | The type's redundancy spread is off, for example a database without a standby. |
| `FAILURE_DOMAINS` | {component} runs in: {domains}. | The failure domains the component spans. |
| `REDUNDANT` | {component} survives the loss of a failure domain ({availability}). | The component is managed by the provider or runs in two or more failure domains. |
| `NOT_REDUNDANT` | {component} runs in a single failure domain. | The component would fail with its failure domain. |
| `REDUNDANCY_UNKNOWN` | The failure domains of {component} are not known. | The availability analysis could not decide. |
| `SELECTOR_EMPTY` | No component matches {selector}. | The selector matches nothing in the solution. |
| `ANALYSIS_MISSING` | The analysis result has no {analysis} report. | The requirement needs an analysis that was not run. |
| `PATH_FOUND` | Reachable: {path}. | A chain of intents with a pass verdict leads from a source to a target. |
| `PATH_UNDECIDABLE` | A chain exists, {path}, but these intents are undecidable: {intents}. | The only chains include intents whose verdict is undecidable. |
| `PATH_MISSING` | No chain of intents leads from {from} to {to}{purpose}. | No chain of passing or undecidable intents connects a source to a target. |
| `ACCESSIBLE` | {to} is directly accessible from {from}{purpose}. | The connectivity and authorization checks pass for this pair. |
| `MAYBE_ACCESSIBLE` | Whether {to} is directly accessible from {from}{purpose} is undecidable. | The checks for this pair are undecidable. |
| `NOT_ACCESSIBLE` | No matching target is directly accessible from a matching source ({pairs} pairs checked). | The connectivity or authorization check fails for every pair. |
| `ACCESS_UNMODELED` | {to} has neither an endpoint nor access control, so direct access cannot be decided. | The target's type does not model how it is reached. |
| `USES_COUNT` | {count} component(s) match {selector}; at least {min} required. | How many components match the selector. |
