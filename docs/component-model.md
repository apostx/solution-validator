# Component Model

> **Status:** Decided (initial) · 2026-11-10
>
> **Decided** by the product owner:
> - AWS is not the target.
> - Component types are configuration, not code.
> - Types are delivered in loadable packs (AWS, Azure, custom).
>
> This document answers whether that works, that is, whether behavior can still be validated from configuration. It also defines the vocabulary, accepted as an initial version that grows when packs need it. See [design.md](design.md) for the rest of the architecture.

## 1. Short answer

**Yes, with one boundary.**

The engine implements a small, fixed vocabulary of behaviors in code. These are called **traits**: for example "filters traffic by rules" or "needs a permission grant".

A **component type** is pure JSON configuration. Each type, such as AWS Lambda, Azure Function or an on-premises app server:
- composes traits;
- declares its properties and documented defaults;
- says which interactions it accepts.

Types are distributed in **packs**. New types and new providers can be added as packs without a library release.

The boundary is that configuration can only *combine* behaviors the engine knows. A genuinely new *kind* of behavior that no trait covers needs a new trait in code, and that means a library release. This should become rare once the vocabulary covers networking, exposure, forwarding and permissions.

## 2. Concepts

| Concept | What it is | Defined in |
|---|---|---|
| **Trait** | A behavior the engine can evaluate, with a parameter schema. | Library code (versioned with the library) |
| **Category** | A functional classification: `compute`, `data-store`, `network`, `edge`, `messaging`, `external`, … It has no behavior. Palettes, selectors and statistics use it. | Packs |
| **Action** | A kind of interaction an intent asks for: `invoke`, `read`, `write`, `connect`, … | Packs (`core` pack for common ones) |
| **Component type** | Id, label, category, traits with parameters, property schema, defaults, `accepts` rules, `meta`. | Packs |
| **Pack** | A versioned JSON bundle of types, categories, actions and port names. | JSON file |

## 3. Packs

- **Core pack.** It holds the provider-neutral basics: `core.internet`, common actions (`invoke`, `read`, `write`, `connect`) and well-known port names (`http`, `https`, …).
- **Official packs.** `aws` comes first; `azure` and `on-prem` can follow. Each pack is a JSON file that ships with the library. Consumers import only the packs they need.
- **Custom packs.** A consumer loads any JSON pack at runtime, for example from a file, from a URL on GitHub Pages, or built in code. A pack can extend another pack, for example a company pack that adds its own types on top of `aws`.
- **Namespaces.** Each pack owns one id prefix (`aws.*`, `azure.*`, `acme.*`). Loading two packs that define the same id is an error, never a silent override.
- **Compatibility.** A pack declares its own version and the trait vocabulary version it needs. If the library does not provide the needed version, loading fails with a clear error.
- **Determinism.** Results list the packs and versions used. The same input with the same packs gives the same result.

```ts
const registry = createRegistry([corePack, awsPack, myCustomPack]); // validated on load
const parsed = parseSolution(json, registry);
```

## 4. Trait vocabulary

| Trait | What the engine evaluates | Key parameters / properties |
|---|---|---|
| `zone` | A network area that contains components. Members can reach each other at the routing level, subject to filters. | parent zone (through placement); address space (detailed level); failure domain; direct internet access for public endpoints |
| `gateway` | Connects a zone to another zone or to an external network. | direction: `both` or `outbound-only`; what it connects; services it reaches privately; whether the zones it connects use it without a route |
| `router` | Decides which gateway traffic leaving a zone uses. | routes: destination → gateway; the zones it serves |
| `traffic-filter` | Allows or denies traffic by source, destination and port. | stateful or stateless; attaches to `component`, `zone` or `self` (traffic passing through it); what it is attached to; rules; base rules of the type; default policy |
| `endpoint` | How a component can be called from outside. | visibility: `public`, `private` or `none`; protocols and ports; reached in its placement or at the provider (`via`) |
| `forwarder` | Receives requests and forwards them to targets. | routes or targets |
| `principal` | Has an identity that can be granted access. | grants: resource + access level |
| `access-controlled` | Requires a grant, a resource policy or a public setting before others can use it. | public access; logical resource policy |
| `group` | A set of equivalent instances. | members or size; zones spanned |
| `redundancy` | Whether a component survives the loss of one failure domain on its own. | managed by the provider (fixed or a setting); one instance or spread over its placements; its own failure domains |

### How an intent is verified

For an intent `A → B` with action `X`, the engine runs four checks, each driven by the traits:

1. **Compatibility.** B's type `accepts` action X from A's type, category or trait.
2. **Forwarding.** If A is a `forwarder`, its routes must lead to B.
3. **Connectivity.** A network path must exist. It is built from endpoint visibility, zone membership, routers, gateways and traffic filters on the way, with stateful and stateless filters treated correctly.
4. **Authorization.** If B is `access-controlled`, either A is a `principal` with a matching grant, or B allows the access through a resource policy or a public setting.

Each check gives `pass`, `fail` or `undecidable`. The intent's verdict combines them:
- `fail` if any check fails;
- otherwise `undecidable` if any check is undecidable;
- otherwise `pass`.

Checks that do not apply are skipped. For example, two serverless components outside any zone have no network path to check beyond their endpoints. The implemented rules are described in [formats.md](formats.md#access-checks-logical-level).

## 5. Example type definitions

Parameter names here are illustrative. The implemented format is described in [formats.md](formats.md): for example, `accepts` rules list `actions` and `ports`, and instance settings reach traits through `{ "property": "…" }` bindings.

```json
{
  "id": "aws.lambda",
  "label": "Lambda function",
  "category": "compute",
  "traits": {
    "principal": {},
    "endpoint": { "visibility": "none" },
    "access-controlled": { "publicAccess": false }
  },
  "accepts": [{ "action": "invoke", "from": { "type": "aws.api-gateway" } }],
  "properties": { "runtime": { "type": "string" } },
  "meta": {}
}
```

The same `traffic-filter` trait describes very different products:

```json
{ "id": "aws.security-group", "category": "network",
  "traits": { "traffic-filter": { "stateful": true, "attachTo": "component",
                                  "default": { "inbound": "deny", "outbound": "allow" } } } }

{ "id": "aws.network-acl", "category": "network",
  "traits": { "traffic-filter": { "stateful": false, "attachTo": "zone" } } }

{ "id": "azure.network-security-group", "category": "network",
  "traits": { "traffic-filter": { "stateful": true, "attachTo": ["component", "zone"] } } }

{ "id": "onprem.firewall", "category": "network",
  "traits": { "gateway": { "direction": "both" },
              "traffic-filter": { "stateful": true, "attachTo": "self",
                                  "default": { "inbound": "deny", "outbound": "deny" } } } }
```

The on-premises firewall shows that composition works: it is a `gateway` between zones and also filters what passes through it.

## 6. Cross-provider mapping

The table below checks whether the proposed vocabulary covers the components the product owner named (networking, firewalls, scaling groups) across providers. It is not a commitment to build these packs.

| Concept | AWS | Azure | On-premises | Traits |
|---|---|---|---|---|
| Network area | VPC, Subnet | VNet, Subnet | LAN, VLAN | `zone` |
| Internet access | Internet Gateway | Public IP address | Edge router | `gateway`; Azure: `zone` (`directInternet`) |
| Outbound-only internet | NAT Gateway | NAT Gateway (associated with subnets) | NAT on the edge router | `gateway` (`outbound-only`; Azure: `implicit`) |
| Private access to provider services | Gateway VPC endpoint | Service endpoint | — | `gateway` (`services`) |
| Routing | Route table | Route table (UDR) | Router | `router` |
| Instance-level firewall | Security Group | NSG on a NIC | Host firewall | `traffic-filter` (`component`) |
| Subnet-level firewall | Network ACL | NSG on a subnet (with default rules) | — | `traffic-filter` (`zone`; Azure: `baseRules`) |
| Perimeter firewall | Network Firewall | Azure Firewall | Firewall appliance | `gateway` + `traffic-filter` (`self`) |
| Function | Lambda | Azure Functions | App server | `principal` (+ zone membership when placed in a network) |
| Scaling group | Auto Scaling Group | VM Scale Set | Server cluster | `group` |
| API entry point | API Gateway | API Management | Reverse proxy | `endpoint` + `forwarder` |
| Load balancer | ALB | Application Gateway | Load balancer appliance | `endpoint` + `forwarder` |
| NoSQL database | DynamoDB | Cosmos DB | Database server | `endpoint` + `access-controlled` |
| Object storage | S3 | Blob Storage | File / object server | `endpoint` + `access-controlled` |
| Workload identity | IAM role | Managed identity | Service account | grants on `principal` |
| Failure domain | Availability zone (on a subnet) | Availability zone (on a resource) | Data center, rack | `zone` (`failureDomain`); Azure: `redundancy` (`domains`) |
| Provider-managed redundancy | S3, DynamoDB, Lambda | Zone-redundant Blob Storage, Cosmos DB, Functions, API Management | — | `redundancy` (`managed`, a setting in Azure) |

Every row maps onto the traits. No row needs provider-specific engine code.

## 7. Limits

- **Composition, not invention.** A pack cannot add behavior that no trait models. Examples are access that depends on time windows, or routing that depends on DNS resolution. When a pack needs something like this, the right step is to propose a new trait.
- **Fidelity.** A pack approximates a real service. A verdict means "works according to the model and the packs used". This matches the vision: a static feasibility check, not a guarantee of a successful deployment.
- **Versioning.** Changes to the trait vocabulary are library releases under SemVer. Pack changes are pack releases with their own version, reported in every result.

## 8. Metadata

Any component, intent, component type, requirement or the solution itself can carry a free-form `meta` object. The library never interprets it and returns it unchanged. This is how consumers attach points, costs, difficulty or anything else they need for their own scoring. Scoring is not part of the library (see [design.md](design.md#7-requirements-metadata-and-facts)).
