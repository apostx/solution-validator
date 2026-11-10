# Formats

> **Status:** Implemented in 0.1.0 (initial). The formats may still change while the version is below 1.0. JSON Schemas: [`schemas/solution.schema.json`](../schemas/solution.schema.json) and [`schemas/pack.schema.json`](../schemas/pack.schema.json), also exported by the package (`solution-validator/schemas/*.json`).

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
- **`accepts`** lists the interactions the type accepts. An intent matches a rule when its source matches `from` (by `type`, `category` and/or `trait`; omitted means any source), and the rule lists the intent's action and port, if the intent states them.
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
const result = analyze(model, { level: "logical", analyses: ["model-validity"] });
```

| Field | Meaning |
|---|---|
| `library` | Name and version of the library that produced the result. |
| `vocabulary` | The trait vocabulary version. |
| `packs` | The packs the solution uses, with versions, sorted by id. |
| `options` | The effective level and analyses. |
| `analyses[]` | One report per analysis, in a fixed order. The `model-validity` report has `valid` and `findings`. |

Findings are described in [finding-codes.md](finding-codes.md). Lists are sorted by stable keys, so the same input and options always give the same JSON.
