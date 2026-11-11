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

### Trait parameters (vocabulary 1)

| Trait | Parameters |
|---|---|
| `endpoint` | `visibility`: `public`, `private` or `none` (bindable); `ports`: port ids it listens on (omitted: any) |
| `forwarder` | `routes`: binding to the routes array; `targetField` (default `target`); `authorizes`: a route also authorizes the forwarder on its target |
| `principal` | `grants`: binding to the grants array; `resourceField` (default `resource`); `accessField` (default `access`) |
| `access-controlled` | `levels`: access level → actions it allows; `public`: anonymous access (bindable boolean); `publicActions`: actions allowed when public |
| `zone` | `addressSpace` (bindable string, detailed level) |
| `gateway` | `direction`: `both` or `outbound-only` (bindable); `connects`: binding to an array of component references |
| `router` | `routes`: binding to the routes array |
| `traffic-filter` | `stateful`; `attachTo`: `component`, `zone` and/or `self`; `rules`: binding; `default`: `{ inbound, outbound }` of `allow` or `deny` |
| `group` | `members`: binding to component references; `size` (bindable integer); `zones`: binding to component references |

Behavior arrives per iteration: `endpoint`, `forwarder`, `principal` and `access-controlled` in Iteration 3; the network traits are a candidate for Iteration 5, and their parameters may change before then.

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
| `connectivity` | B has an `endpoint` | `public`: reachable from anywhere. `private`: only from inside a private network; components are not in one until zones are analyzed, so this fails, and placed components are `undecidable`. `none`: only through a forwarder whose routes target B. If B lists `ports`, the intent's port must be one of them. |
| `authorization` | B is `access-controlled` | Allowed if A is a forwarder that `authorizes` its routes and routes to B; or A is a `principal` with a grant on B whose access level allows the action; or B's `public` access is on and `publicActions` includes the action. An intent without an action is `undecidable` here. |

**Exposure.** A component is `exposed` when an anonymous caller from outside can reach and use it: its endpoint is public, and it does not control access or its public access is on (`actions` lists what is allowed). Components with a private endpoint or none, or without public access, are `not-exposed`. Unset settings make it `undecidable` under `strict`. Components of the `external` category stand for the outside parties themselves and are not listed.

```json
{ "component": "uploads", "exposure": "exposed", "actions": ["read"], "evidence": [ … ] }
```

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

- components: `id`, `type`, `category`, `traits`, `meta` (the type's `meta` merged with the component's, the component winning), `incoming` and `outgoing` intent counts, and `exposure` when an access analysis is given;
- intents: `id`, `from`, `to`, `action`, `port`, `meta`, and the verdict of the most complete intent analysis given;
- `totals`: component and intent counts, counts by type and by category, and intent counts by verdict when an analysis is given.

The library does not score: points, costs and complexity measures are computed by the consumer from these facts and the requirement verdicts.
