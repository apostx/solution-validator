# Roadmap

> **Status:** Approved (initial) · 2026-11-10 · **Current iteration: 10 — On-premises pack** (Iterations 7–10 approved in this order)
>
> Iterations 0–4 are approved. Only the current iteration is a commitment. The scope of later iterations may still change and is confirmed before each one starts. Open questions (Q1, Q2, …) are listed in [design.md](design.md#12-open-questions).

## Principles

- An iteration starts only after its scope is approved and the open questions it depends on are decided.
- Every iteration ends with:
  - code with tests, including golden-file tests;
  - updated documentation, including the list of finding codes;
  - the new capability visible in the demo sandbox;
  - green CI and a release through release-please.
- Releases stay at `0.x` (one minor version per iteration) until the public API is declared stable. `1.0.0` is a separate decision, most likely after ArchitectMate has integrated the library.
- Anything not listed in an approved iteration is out of scope for that iteration.
- The engine stays provider-neutral throughout. Provider knowledge goes into packs, never into engine code.

## Direction

The engine is generic: component types are JSON configuration in loadable packs, composed from a fixed set of traits (see [component-model.md](component-model.md)).

Following the product owner's suggestion, the first pack describes a minimal AWS serverless application: API Gateway, Lambda, DynamoDB and S3, plus `core.internet` from the core pack. The first traits implemented are the ones this pack needs: `endpoint`, `forwarder`, `principal` and `access-controlled`.

Why serverless first:

- It needs the fewest traits.
- The canvas needs no nested containers.
- It still shows the vision's core point. A connection does not prove access: an API route, a function permission or a bucket's public access setting decides it.

Trade-off: the vision's own example (network placement, Security Group and ACL roles) and the network concerns the product owner named (firewalls, scaling groups) need the network traits. They are the first candidate after the first version (Iteration 5).

| # | Iteration | Version | Depends on | Status |
|---|---|---|---|---|
| 0 | Foundations | — | — | Done |
| 1 | Core model, pack format, serverless pack | 0.1.0 | Q10, Q11 | Done |
| 2 | Connection validity | 0.2.0 | — | Done |
| 3 | Logical access analysis | 0.3.0 | — | Done |
| 4 | Requirement checks and metadata query | 0.4.0 | Q4, Q5, Q12 | Done |
| 5 | Network traits | 0.5.0 | Q15, Q16, Q17 | Done |
| 6 | Detailed level (IPv4) | 0.6.0 | Q18, Q19, Q20 | Done |
| 7 | More AWS types | 0.7.0 | Q21 | Done |
| 8 | Availability analysis | 0.8.0 | Q22 | Done |
| 9 | Azure pack | 0.9.0 | Q23 | Done |
| 10 | On-premises pack | 0.10.0 | to be scoped | Approved |

### Iteration 0 — Foundations

- **Library:**
  - TypeScript project, build, tests, lint/format;
  - CI on pull requests;
  - Conventional Commits check;
  - release-please, with npm publishing from the first functional release;
  - the `LICENSE` file (AGPL-3.0).
- **Demo:** Vite app scaffold in `demo/`, deployed to GitHub Pages by a workflow. Shows a placeholder page.
- **Docs:** vision, design, component model, roadmap and `CLAUDE.md` in the repository. The `README.md` gets its first version, and the Commands section of `CLAUDE.md` is filled in.
- **Done when:** CI is green on a pull request, the Pages URL serves the demo scaffold, and a release PR can be produced.

### Iteration 1 — Core model, pack format and serverless pack (0.1.0)

- **Library:**
  - solution model schema (`schemaVersion`, `packs`, components, placement, properties, intents, `meta`);
  - pack schema: type definitions with the parameter schemas of all traits, categories, actions and port names;
  - registry: loading packs, validating them, version checks, namespace conflicts;
  - `parseSolution` with structured validation errors;
  - finding codes and English message templates;
  - the `core` pack, and an `aws` pack with API Gateway, Lambda, DynamoDB and S3 (types and properties; behavior comes in Iteration 3);
  - the analysis framework (`analyze` with options) and a first `model-validity` analysis (schema, ids, references, unknown types).
- **Demo:**
  - palette generated from the loaded packs;
  - canvas with intents;
  - property panel;
  - JSON view, import and export;
  - findings panel.
- **Done when:** the example models in `test/fixtures` validate as expected, and an invalid model shows its findings in the demo.

### Iteration 2 — Connection validity (0.2.0)

- **Library:** `connection-validity` analysis, driven by the packs' `accepts` rules. It checks which intents make sense between which types and actions. For example, API Gateway → Lambda `invoke` is valid; S3 → DynamoDB `write` is not accepted.
- **Demo:** invalid arrows are marked, with the finding's message.

### Iteration 3 — Logical access analysis (0.3.0)

- **Library:** `access` analysis at the logical level. It implements the `endpoint`, `forwarder`, `principal` and `access-controlled` traits, so every intent is verified as `pass`, `fail` or `undecidable`. It also covers:
  - evidence per intent;
  - exposure facts ("what is directly accessible from the internet");
  - the `strict` and `pack-defaults` assumption policies.
- **Demo:** arrows colored by verdict, evidence shown on selection, and exposure badges.

### Iteration 4 — Requirement checks and metadata query (0.4.0)

- **Library:**
  - task schema with provided components and selectors;
  - requirement types `reachable`, `not-reachable` and `uses`, each with a verdict and evidence;
  - an overall verdict;
  - the `collect` query for metadata and structural facts;
  - no scoring.
- **Demo:** scenarios that include a task, with a requirement checklist, plus a table of the collected metadata and facts.
- After this iteration ArchitectMate can start integrating the library.

### Iteration 5 — Network traits (0.5.0)

Implements `zone`, `gateway`, `router`, `traffic-filter` and `group` at the logical level. Adds the AWS network types to the `aws` pack: VPC, subnet, internet gateway, NAT gateway, route table, security group, network ACL and Auto Scaling group, plus Lambda placed in a VPC. This covers the vision's simple-mode example. The scope below was approved after Iteration 4, with the open questions decided as Q15–Q17 in [design.md](design.md#12-open-questions).

**Scope (approved):**

- **Library:** behavior for the network traits at the logical level.
  - Zones: membership through `placement`, nested zones (subnet in VPC). A private endpoint becomes reachable from components in the same network.
  - Gateways and routers: internet access only through a route to an internet gateway; `outbound-only` gateways (NAT) allow outbound connections but not inbound ones.
  - Traffic filters: rules with symbolic sources and destinations (`internet`, a zone, a component or a filter) and ports, stateful versus stateless, attached to components, zones or themselves.
  - Groups: an intent to or from a group stands for its members.
  - The connectivity check and the exposure facts use all of the above; the detailed level (CIDR, route matching) stays out.
- **Packs:** `aws` gains VPC, subnet, internet gateway, NAT gateway, route table, security group, network ACL and Auto Scaling group; Lambda can be placed in a VPC with security groups.
- **Demo:** zones drawn as nested areas; components dragged into them; filters shown on the components or zones they attach to.
- **Decisions:** (a) the filter or router lists what it applies to (Q15); (b) rules with `direction`, `peer` (`any`, `internet`, or an id), `ports` and `effect`, first match wins (Q16); (c) a verdict through a group or several placements requires every member or placement to pass (Q17). `endpoint.via` was added so that a function placed in a VPC is still invoked through the provider.

### Iteration 6 — Detailed level (0.6.0)

Chosen by the product owner from the backlog after Iteration 5.

- **Library:** the opt-in `detailed` analysis level for IPv4 (Q18):
  - the `address-plan` analysis: valid address spaces, subnets within their network, overlaps between sibling zones and between networks, invalid and shadowed route destinations;
  - `access` at the detailed level: address ranges as rule peers, matched against address spaces (Q20); port ranges; replies through stateless filters on the ephemeral ports (Q19); longest-prefix choice of the internet route.
- **Packs:** `aws` 0.3.0 with `cidrBlock` on VPCs and subnets and IPv4 route destinations.
- **Demo:** a level switch, address spaces on zones, address plan findings.

### Iteration 7 — More AWS types (0.7.0)

The product owner approved Iterations 7–10 in this order after Iteration 6.

- **Packs:** `aws` 0.4.0 adds CloudFront (with origin access control), Application Load Balancer, EC2, RDS and gateway VPC endpoints; `core` 0.2.0 adds the `ssh`, `postgresql` and `mysql` ports.
- **Library:** trait vocabulary 3 adds `gateway.services`: a gateway that reaches provider services privately, used by routes whose destination is the service (Q21).
- **Demo:** a three-tier web app scenario.

### Iteration 8 — Availability analysis (0.8.0)

- **Library:** trait vocabulary 4 adds `zone.failureDomain` and the `redundancy` trait (Q22). The `availability` analysis lists the failure domains each running component spans and warns about single points of failure on the paths of passing intents and about zones that depend on a gateway in another failure domain. Tasks get a `redundant` requirement, and `collect` returns each component's availability.
- **Packs:** `aws` 0.5.0 binds a subnet's `availabilityZone`, marks regional services as managed, and adds RDS `multiAz`.
- **Demo:** availability badges on the canvas and a high-availability scenario.

### Iteration 9 — Azure pack (0.9.0)

- **Packs:** `azure` 0.1.0 covers Functions, API Management, Cosmos DB, Blob Storage, virtual networks, subnets, network security groups, NAT gateways, virtual machines, scale sets and Application Gateway.
- **Library:** trait vocabulary 5 adds `zone.directInternet`, `gateway.implicit`, `traffic-filter.baseRules`, the `network` rule peer, a bindable `redundancy.managed` and `redundancy.domains` (Q23). AWS results do not change.
- **Tests:** one provider-neutral task is checked against an AWS and an Azure solution.
- **Demo:** two Azure scenarios with provider-neutral tasks.

### Iteration 10 — On-premises pack (0.10.0)

LANs and VLANs, firewalls, routers, servers, load balancers and databases on premises, built on the same traits. Scoped when it starts.

## Backlog (not scheduled; each item needs approval)

- IPv6 for the detailed level
- Terraform export
- Role-tag selectors
