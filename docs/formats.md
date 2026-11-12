# Formats

> **Status:** Implemented in 0.x (initial). The formats may still change while the version is below 1.0. JSON Schemas: [`schemas/solution.schema.json`](../schemas/solution.schema.json), [`schemas/pack.schema.json`](../schemas/pack.schema.json) and [`schemas/task.schema.json`](../schemas/task.schema.json), also exported by the package (`solution-validator/schemas/*.json`).

This document describes the implemented JSON formats. The reasoning behind them is in [design.md](design.md) and [component-model.md](component-model.md).

## Solution

```json
{
  "schemaVersion": 1,
  "packs": ["core", "aws"],
  "components": [
    { "id": "users", "type": "core.internet" },
    { "id": "orders-fn", "type": "aws.lambda", "label": "Orders",
      "properties": { "permissions": [{ "resource": "orders-table", "access": "read-write" }] },
      "meta": { "points": 2 } },
    { "id": "orders-table", "type": "aws.dynamodb" }
  ],
  "intents": [
    { "id": "i1", "from": "orders-fn", "to": "orders-table", "action": "write" }
  ],
  "meta": {}
}
```

| Field | Meaning |
|---|---|
| `schemaVersion` | Always `1` for this format. |
| `packs` | Ids of the packs the solution needs. Packs they require are included automatically. |
| `components[].id` | Unique among components and intents. Letters, digits, `_`, `.` and `-`. |
| `components[].type` | A type id from a listed pack, for example `aws.lambda`. |
| `components[].label` | Optional display name. |
| `components[].placement` | Optional ids of the zones the component is placed in. Only components with the `zone` trait are zones. |
| `components[].properties` | Values for the properties the type defines. Unset properties stay unset; they are not filled with defaults. |
| `intents[]` | "`from` must be able to reach `to`" for an `action` (for example `invoke`, `write`), a `port` (a symbolic name such as `https`, or a number), or both. |
| `meta` | Free-form consumer data on the solution, components and intents. The library never interprets it. |

`parseSolution(input, registry)` checks the structure against the schema and returns `{ ok: true, model }` or `{ ok: false, findings }`. It accepts an object or JSON text and never throws for invalid input. The `model-validity` analysis then checks what the schema cannot: packs, unique ids, known types, property values, references, placement, actions and ports.

## Pack

```json
{
  "id": "aws",
  "version": "0.1.0",
  "label": "Amazon Web Services",
  "vocabulary": 1,
  "requires": { "core": "^0.1.0" },
  "categories": [],
  "actions": [],
  "ports": [],
  "types": []
}
```

| Field | Meaning |
|---|---|
| `id` | The pack's namespace: lowercase kebab case. |
| `version` | The pack's own semantic version. Results list the versions used. |
| `vocabulary` | The trait vocabulary version the pack needs. Loading fails if the library provides an older one. |
| `requires` | Packs this pack builds on, with an exact version or a caret range. A pack sees its own definitions and those of the packs it requires, transitively. |
| `categories`, `actions`, `ports` | Definitions with `id`, `label` and optional `description`. Ports also have `protocol` (`tcp` or `udp`) and `port`. |
| `types` | Component type definitions (below). |

**Namespaces.** Type ids are `<pack>.<name>`. Category, action and port ids are unprefixed only in the `core` pack (`invoke`, `https`); other packs prefix theirs (`aws.publish`). Defining an id twice, in one pack or across packs, is an error, never an override.

`createRegistry(packs)` validates the packs and throws a `RegistryError` whose `findings` list every problem.

### Type definitions

```json
{
  "id": "aws.s3",
  "label": "S3 bucket",
  "category": "data-store",
  "traits": {
    "endpoint": { "visibility": "public", "ports": ["https"] },
    "access-controlled": {
      "levels": { "read": ["read"], "write": ["write"], "read-write": ["read", "write"] },
      "public": { "property": "publicAccess" },
      "publicActions": ["read"]
    }
  },
  "accepts": [
    { "from": { "category": "compute" }, "actions": ["read", "write"] },
    { "from": { "category": "external" }, "actions": ["read"], "ports": ["https"] }
  ],
  "properties": {
    "publicAccess": { "type": "boolean", "default": false }
  },
  "required": [],
  "meta": {}
}
```

- **`traits`** compose behavior from the trait vocabulary. Each trait has a parameter schema (see `TraitParameters` in the library and the pack schema).
- **Bindings.** A trait parameter can be a fixed value or `{ "property": "<name>" }`, which takes the value from the component's property. The registry checks that the bound property fits the parameter. For example, `forwarder.routes` must be bound to an array of objects whose `target` field is a component reference.
- **`accepts`** lists the interactions the type accepts. An intent matches a rule when its source matches `from` (by `type`, `category` and/or `trait`; omitted means any source), the rule's `actions` include the intent's action (if the intent states one), and the rule's `ports`, if listed, include the intent's port. A rule without `ports` does not restrict the port; which ports a component listens on is the `endpoint` trait's concern. A numeric port matches a port id with that number. A type without `accepts` makes the check undecidable; `"accepts": []` accepts nothing.
- **`properties`** use a subset of JSON Schema: `string` (with `enum`, `minLength`, `maxLength`, `pattern`), `number`, `integer`, `boolean`, arrays of those or of objects, and objects whose fields are scalars or arrays of scalars. Objects are closed. `default` documents the value the `pack-defaults` assumption policy uses. `"x-component-ref": true` marks a string as a component id; references are checked.
- **`required`** lists properties every component of the type must set. Most properties are optional: a missing property limits what can be decided but does not make the model invalid.

### Trait parameters (vocabulary 4)

| Trait | Parameters |
|---|---|
| `endpoint` | `visibility`: `public`, `private` or `none` (bindable); `ports`: port ids it listens on (omitted: any); `via`: `placement` (default) or `provider`, see below |
| `forwarder` | `routes`: binding to the routes array; `targetField` (default `target`); `authorizes`: a route also authorizes the forwarder on its target |
| `principal` | `grants`: binding to the grants array; `resourceField` (default `resource`); `accessField` (default `access`) |
| `access-controlled` | `levels`: access level → actions it allows; `public`: anonymous access (bindable boolean); `publicActions`: actions allowed when public |
| `zone` | `addressSpace` (bindable string, detailed level); `failureDomain` (bindable string): the failure domain the zone is in, such as an availability zone |
| `gateway` | `direction`: `both` or `outbound-only` (bindable); `connects`: binding to the zones it is attached to (without it, the gateway belongs to the network of the zone it is placed in); `services`: binding to the provider services it reaches privately |
| `router` | `routes`: binding to routes `{ destination, gateway }`, where the destination is `internet`, an IPv4 range, or the id of a service; `zones`: binding to the zones it serves |
| `traffic-filter` | `stateful`; `attachTo`: `component`, `zone` and/or `self`; `rules`: binding to the rules (below); `targets`: binding to what it is attached to; `default`: `{ inbound, outbound }` of `allow` or `deny` (default: deny) |
| `group` | `members`: binding to component references; `size` (bindable integer, informational) |
| `redundancy` | `managed`: the provider spreads the component across failure domains; `spread` (bindable boolean, default `true`): `false` means one instance runs in only one of the zones it is placed in |

Vocabulary 2 added `endpoint.via`, `router.zones` and `traffic-filter.targets`, removed `group.zones` (placement says where a group runs), and gave the network traits their behavior. Vocabulary 3 added `gateway.services`. Vocabulary 4 added `zone.failureDomain` and the `redundancy` trait for the [availability analysis](#availability). Packs declare the version they need, for example `"vocabulary": 4`.

**Traffic filter rules** are objects, checked in order; the first rule that matches the traffic's direction, peer and ports decides, and the `default` policy decides when none matches:

| Field | Meaning |
|---|---|
| `direction` | `inbound` or `outbound`, seen from what the filter protects |
| `peer` | `any`; `internet` (anything outside the protected side's network); the id of a component, a zone (anything placed in it, at any depth) or a filter (anything it is attached to); or an IPv4 range such as `10.0.0.0/16` (see [the detailed level](#detailed-level)) |
| `ports` | Port ids (`https`), port numbers (`"443"`) or ranges (`"1024-65535"`). Omitted: all ports |
| `effect` | `allow` (default) or `deny` |

Stateless filters (`stateful: false`) also check the return traffic in the opposite direction, on any port, so they need a rule without `ports` for the replies.

## Analysis result

```ts
const result = analyze(model, {
  level: "logical", // default
  analyses: ["model-validity", "connection-validity", "access"], // default: all for the level
  assumptions: "strict", // default; or "pack-defaults"
});
```

`access` always brings `connection-validity` along, which reports compatibility failures. Under `strict`, an unset property that a verdict depends on makes it `undecidable`. Under `pack-defaults`, the property's documented `default` is used, and every such assumption is listed in the access report and in the evidence.

| Field | Meaning |
|---|---|
| `library` | Name and version of the library that produced the result. |
| `vocabulary` | The trait vocabulary version. |
| `packs` | The packs the solution uses, with versions, sorted by id. |
| `options` | The effective level and analyses. |
| `analyses[]` | One report per analysis, in a fixed order (below). |

Findings and evidence codes are described in [finding-codes.md](finding-codes.md). Lists are sorted by stable keys, so the same input and options always give the same JSON.

### Reports

| Analysis | Report fields |
|---|---|
| `model-validity` | `valid` (no error findings), `findings` |
| `connection-validity` | `intents` (one verdict per intent, sorted by id), `summary` (count per verdict), `findings` |
| `access` | `intents` (with every check that applies), `summary`, `exposure` (one fact per component with an endpoint, sorted by id), `assumptions` (pack defaults used), `findings` |
| `address-plan` | `zones` (address space and size per zone, sorted by id), `findings`; detailed level only |
| `availability` | `components` (one fact per running component, sorted by id), `findings`; see [Availability](#availability) |

An intent verdict has the shape below. A verdict is never a boolean: `pass` is proven from the data, `fail` is disproven, and `undecidable` means the data, the packs or the supported analyses are not enough. A check's evidence says why.

```json
{
  "intent": "i2",
  "verdict": "pass",
  "checks": [
    {
      "check": "compatibility",
      "verdict": "pass",
      "evidence": [
        {
          "code": "ACCEPTED",
          "params": { "fromType": "aws.api-gateway", "toType": "aws.lambda", "purpose": "invoke", "rule": 0 },
          "message": "aws.lambda accepts invoke from aws.api-gateway (accepts rule 0)."
        }
      ]
    }
  ]
}
```

`connection-validity` runs the compatibility check. It is `undecidable` when an end of the intent, a type, the action, the port or the purpose is missing (the `model-validity` findings say why), or when the target's type declares no `accepts` rules.

### Access checks (logical level)

`access` runs the checks that apply to an intent from A to B and combines them: `fail` if any fails, otherwise `undecidable` if any is, otherwise `pass`.

| Check | Applies when | Decides |
|---|---|---|
| `compatibility` | always | B's type accepts the intent from A's type. |
| `forwarding` | A is a `forwarder` | One of A's routes targets B. |
| `connectivity` | B has an `endpoint` | See below. If B lists `ports`, the intent's port must be one of them. |
| `authorization` | B is `access-controlled` | Allowed if A is a forwarder that `authorizes` its routes and routes to B; or A is a `principal` with a grant on B whose access level allows the action; or B's `public` access is on and `publicActions` includes the action. An intent without an action is `undecidable` here. |

**Connectivity.** A component's position is the zone it is placed in; components without placement are outside every zone (the internet, and provider services such as object storage). The outermost zone of a position is its network.

- **Same network:** public and private endpoints are reachable through the local routes.
- **Private service routes:** traffic from a network to a service outside it uses a route whose destination is that service, if the zone's router has one; its gateway must be attached to the network and list the service in `services`. No internet route is needed then.
- **Between networks, or with the outside:** the endpoint must be public. A source inside a network needs a route to the internet in its router: through a `both` gateway attached to its network, or through an `outbound-only` gateway placed in a zone that itself routes to a `both` gateway. A target inside a network needs a route to the internet through a `both` gateway; `outbound-only` gateways do not let traffic in. A zone without a router uses the router of the nearest zone it is placed in; with none, it only has local routes.
- **Traffic filters on the way:** the filters attached to the source and to the target, and the zone filters of every zone the traffic leaves or enters, must allow it; `self` filters on a gateway the traffic passes apply too.
- **`none`:** reachable only through a forwarder whose routes target B.
- **`via: provider`:** the endpoint is reached at the provider's service endpoint, outside every zone, even when the component is placed. Its placement then only decides its own outbound traffic, as for a function attached to a private network.
- **Several placements and groups:** a component placed in several zones, and a group with `members`, stand for every placement or member; each combination must pass.
- **Undecidable:** under `strict`, unset routes, targets or rules; an invalid placement; a filter that limits ports when the intent states no port and the endpoint lists none.

**Exposure.** A component is `exposed` when an anonymous caller from outside can reach and use it: its endpoint is public, it is reachable from outside (inside a network, on at least one port through a `both` gateway and the filters; `ports` lists which), and it does not control access or its public access is on (`actions` lists what is allowed). Otherwise it is `not-exposed`. Unset settings make it `undecidable` under `strict`. Components of the `external` category stand for the outside parties themselves and are not listed.

```json
{ "component": "uploads", "exposure": "exposed", "actions": ["read"], "evidence": [ … ] }
```

## Detailed level

`analyze(model, { level: "detailed" })` uses concrete values as well. It is a static feasibility check of the planned configuration; it does not simulate runtime behavior. Only IPv4 is supported.

| What | Detailed behavior |
|---|---|
| Address spaces | A zone's `addressSpace` (for example a VPC's `cidrBlock`) is an IPv4 range. The `address-plan` analysis checks it. |
| Rule peers with ranges | A range covers a party inside a zone when it contains the address space of the party's innermost zone that has one; it does not when they do not overlap; it is `undecidable` when it covers only part of it. Parties outside every zone have unknown public addresses: `0.0.0.0/0` covers them, ranges without public addresses do not, and other ranges are `undecidable`. At the logical level only `0.0.0.0/0` decides; other ranges are `undecidable`. |
| Port ranges | Rules may list ranges such as `"8080-8090"`, at both levels. |
| Return traffic | Stateless filters must allow the replies on the ephemeral ports `1024-65535`: a rule matches when its ports cover that whole range or it lists no ports. (At the logical level only rules without ports match.) |
| Route destinations | `internet` and `0.0.0.0/0` are default routes at both levels. At the detailed level a more specific route whose range contains public addresses may catch internet traffic; since the destination's address is not known, such a route to a different gateway makes the verdict `undecidable`. Ranges without public addresses never carry internet traffic, and the local route always wins inside the network's own address space. |

The `address-plan` report lists every zone with its `space` and `size`, and these findings:

- `ADDRESS_SPACE_MISSING`, `ADDRESS_SPACE_INVALID` and `ADDRESS_SPACE_HOST_BITS`;
- `ADDRESS_SPACE_OUTSIDE_PARENT`: a subnet outside its VPC's range;
- `ADDRESS_SPACE_OVERLAP`: zones in the same zone that overlap;
- `NETWORK_OVERLAP`: networks that overlap and so cannot be connected;
- `ROUTE_DESTINATION_INVALID` and `ROUTE_SHADOWED`: a route inside the network's own range, which the local route overrides.

## Availability

The `availability` analysis runs at both levels. A failure domain is a part of the infrastructure that can fail on its own, such as an availability zone or a data center; zone types name theirs with `zone.failureDomain`, and a zone whose type declares none is in the failure domain of the zone it is placed in. Under `strict`, an unset `failureDomain` property makes the components in that zone `undecidable`.

It lists a fact for every running component: one with an `endpoint`, a `gateway` or a `group`, except `external` components.

| `availability` | Meaning |
|---|---|
| `managed` | The type's `redundancy.managed` says the provider spreads it across failure domains (for example S3 or DynamoDB). |
| `redundant` | Its placements, or its group's members, run in two or more failure domains. |
| `single` | They all run in one failure domain, or `redundancy.spread` is `false` (one instance, for example an EC2 instance or a single-AZ database). |
| `undecidable` | It is not placed, a zone it runs in has no failure domain, or a setting it depends on is unset under `strict`. |

```json
{ "component": "app", "availability": "redundant", "domains": ["eu-west-1a", "eu-west-1b"], "evidence": [ … ] }
```

Findings (warnings):

- `AVAILABILITY_SINGLE_POINT`: a `single` component that intents with a `pass` verdict depend on: their ends, and the gateways the access check routed them through.
- `AVAILABILITY_CROSS_DOMAIN`: a zone in one failure domain that reaches the internet through an outbound-only gateway placed in another, so it loses that access when the other domain fails.

The analysis states what the model supports and nothing more: it does not model failover, health checks or capacity.

## Task

```json
{
  "schemaVersion": 1,
  "id": "orders-api",
  "title": "Orders API",
  "packs": ["core", "aws"],
  "provided": [{ "id": "users", "type": "core.internet", "locked": true }],
  "requirements": [
    { "id": "r1", "type": "reachable", "from": { "id": "users" },
      "to": { "category": "data-store" }, "action": "write", "meta": { "points": 3 } },
    { "id": "r2", "type": "not-reachable", "from": { "id": "users" }, "to": { "type": "aws.s3" } },
    { "id": "r3", "type": "uses", "select": { "type": "aws.lambda" }, "min": 1 }
  ],
  "meta": {}
}
```

| Field | Meaning |
|---|---|
| `provided` | Components every solution gets, such as the users on the internet. `locked` tells consumers not to let the solver change or remove them. |
| Selectors (`from`, `to`, `select`) | `{ id, type, category, trait }`; every given field must match. `id` may only name a provided component, because the solver chooses every other id. Selecting by category or trait keeps tasks provider-neutral. |
| `reachable` | A matching target can be reached from a matching source through a chain of intents whose `access` verdict is `pass`. `action` and `port`, if given, apply to the last intent of the chain. |
| `not-reachable` | No matching target is directly accessible from a matching source, whether or not an intent exists. Direct access means the forwarding, connectivity and authorization checks pass for a hypothetical intent, under the assumption policy of the analysis. Without `action`, every action the target controls access for is tried. |
| `uses` | At least `min` (default 1) components match `select`. |
| `redundant` | Every component that matches `select` is `managed` or `redundant` in the `availability` report. It fails when nothing matches or one is `single`, and is `undecidable` when one is `undecidable` or the result has no `availability` report. |
| `meta` | Returned unchanged with each result, so consumers can weight requirements. |

`parseTask(input, registry)` validates the task and its references and never throws for invalid input. `checkRequirements(model, analysis, task)` returns:

| Field | Meaning |
|---|---|
| `verdict` | `fail` if any requirement fails or a provided component is missing or changed; otherwise `undecidable` if any requirement is; otherwise `pass`. |
| `requirements[]` | `{ requirement, type, verdict, evidence, meta }`, in the task's order. |
| `summary`, `findings`, `meta` | Counts per verdict, task findings (`TASK_PROVIDED_MISSING`, `REQUIREMENT_FAILED`, …) and the task's `meta`. |

A `reachable` requirement fails when no chain exists, and is `undecidable` when the only chains include undecidable intents or the result has no `access` report. A `not-reachable` requirement is `undecidable` when its source matches nothing.

## Metadata and facts

`collect(model, analysis?)` returns every component and intent, sorted by id, for consumers that compute their own scores or metrics:

- components: `id`, `type`, `category`, `traits`, `meta` (the type's `meta` merged with the component's, the component winning), `incoming` and `outgoing` intent counts, `exposure` when an access analysis is given, and `availability` when an availability analysis is given;
- intents: `id`, `from`, `to`, `action`, `port`, `meta`, and the verdict of the most complete intent analysis given;
- `totals`: component and intent counts, counts by type and by category, and intent counts by verdict when an analysis is given.

The library does not score: points, costs and complexity measures are computed by the consumer from these facts and the requirement verdicts.
