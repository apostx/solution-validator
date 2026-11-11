# SolutionValidator — Technical Design

> **Status:** Approved for the first version (initial) · 2026-11-10
>
> - **Decided**: approved by the product owner. "Initial" marks a recommendation accepted for now that may be revisited once real work shows how it holds up.
> - **Proposed**: a suggestion awaiting a decision. Not a requirement until it is approved.
>
> Related documents:
> - Product intent: [product-vision.md](product-vision.md)
> - Component types, traits and packs: [component-model.md](component-model.md)
> - Iteration plan: [roadmap.md](roadmap.md)
>
> Open questions are listed in [§12](#12-open-questions) and referenced by ID (Q1, Q2, …).

## 1. Context

SolutionValidator is a deterministic, provider-neutral validator. It analyzes a designed software or infrastructure solution: does it work, and does it meet a task's requirements? This document describes how we intend to build it. Where a decision here explicitly supersedes the vision, this document takes precedence. Otherwise it does not extend the product scope.

## 2. Decisions so far

| Topic | Decision | Status |
|---|---|---|
| Language and runtime | TypeScript. Runs in the browser and in Node.js, with no server component. Consumer apps (first: ArchitectMate) are hosted on GitHub Pages. | Decided |
| Distribution | This repository contains the library and its official packs, published to npm as `solution-validator`. ArchitectMate lives in a separate repository and uses the npm package. | Decided |
| Input format | JSON, described by TypeScript types and validated with JSON Schema. | Decided |
| Relationship semantics | A relationship is an *intent*: "A must be able to reach B for purpose P". The engine proves or disproves it. | Decided |
| Generic component model | AWS is not the target. Component types are JSON configuration that composes a fixed vocabulary of behaviors (*traits*) implemented in the engine. See [component-model.md](component-model.md). | Decided (vocabulary initial, Q10; version 2 since Iteration 5) |
| Packs | Component types come in loadable packs: AWS, Azure, on-premises and custom packs. A consumer pulls in the packs it needs. | Decided (distribution initial, Q11) |
| Scoring | Not part of the library. The library validates: things work, fail or cannot be decided. Consumers decide how to score. This supersedes the vision's mentions of task-specific scoring. | Decided |
| Metadata | Components, intents, types, requirements and the solution can carry free-form `meta`. The library never interprets it; a query returns it together with structural facts. | Decided (query API initial, Q12) |
| Explanations | Every finding has a stable code, parameters, and a default English message rendered from a template. Consumers may translate the message. | Decided |
| Project language | All code, identifiers, comments, documentation, commit messages and PR descriptions are in English. | Decided |
| Versioning | Semantic Versioning, with commits in the Conventional Commits format (`feat:`, `fix:`, `docs:`, …). | Decided |
| License | AGPL-3.0, the strictest license GitHub's license picker offers. | Decided |
| AI | No AI in analysis, requirement checks or explanations. | Decided (vision) |
| Where decisions live | Requirements, decisions and the iteration plan are kept in this repository. Development continues in online (cloud) sessions that only see the repository. | Decided |
| Demo | A minimal visual sandbox, strictly a tech demo, deployed to this repository's GitHub Pages. See [§9](#9-demo-sandbox). | Decided |
| Working defaults | All recommendations (Q1–Q12) are accepted for now. They are revisited if real work shows they need to change. | Decided (initial) |

## 3. Architecture

```
packs (JSON) ──▶ createRegistry ──┐
                                  ▼
solution (JSON) ──▶ parseSolution ──▶ model ──▶ analyze ──▶ AnalysisResult
                                                               │
                   task (JSON) ──▶ checkRequirements ◀─────────┤
                                                               │
                                   collect ◀───────────────────┘
```

- **Packs and registry.** Packs are JSON bundles of component types (see [component-model.md](component-model.md)). The registry loads and validates them and resolves type ids.
- **Core model.** A provider-neutral graph of typed components, their placement (containment), intents and metadata. It knows nothing about any provider.
- **Traits.** The only place where behavior is implemented. Engine code contains no provider-specific logic; provider knowledge lives in packs.
- **Analysis.** Runs a configurable set of analyses. It is useful on its own, without a task.
- **Requirements.** Checks a task's requirements against an analysis result. It only reads analysis results and never analyzes again.
- **Query.** Returns metadata and structural facts so consumers can build their own scoring or metrics.

Public API sketch (names are not final):

```ts
const registry = createRegistry([corePack, awsPack]);          // validated on load
const parsed = parseSolution(json, registry);                   // returns errors instead of throwing
const analysis = analyze(parsed.model, {
  level: "logical",
  analyses: ["connection-validity", "access"],
});
const requirements = checkRequirements(parsed.model, analysis, task); // optional
const facts = collect(parsed.model, analysis);                  // optional: meta + structural facts
```

## 4. Description model

The example below is a minimal serverless application at the logical level, using types from the AWS pack. It shows the shape of the model. The implemented format is described in [formats.md](formats.md).

```json
{
  "schemaVersion": 1,
  "packs": ["core", "aws"],
  "components": [
    { "id": "users", "type": "core.internet" },
    { "id": "api", "type": "aws.api-gateway",
      "properties": { "endpoint": "public",
                      "routes": [{ "path": "/orders", "target": "orders-fn" }] } },
    { "id": "orders-fn", "type": "aws.lambda",
      "properties": { "permissions": [{ "resource": "orders-table", "access": "read-write" }] },
      "meta": { "points": 2 } },
    { "id": "orders-table", "type": "aws.dynamodb" },
    { "id": "uploads", "type": "aws.s3", "properties": { "publicAccess": false } }
  ],
  "intents": [
    { "id": "i1", "from": "users", "to": "api", "port": "https" },
    { "id": "i2", "from": "api", "to": "orders-fn", "action": "invoke" },
    { "id": "i3", "from": "orders-fn", "to": "orders-table", "action": "write" },
    { "id": "i4", "from": "orders-fn", "to": "uploads", "action": "write" }
  ]
}
```

Here `i4` would `fail`. The function is connected to the bucket, but it has no permission on it. This is the vision's core point: a connection alone does not prove access.

Key points:

- `packs` lists the packs the solution needs, so the input is self-describing.
- `properties` are defined by the component type's pack. They are optional unless the type says otherwise. Missing properties limit what can be decided; they do not make the model invalid.
- An intent states what is needed: a network `port` (or protocol), a service-level `action` (`invoke`, `read`, `write`), or both.
- Permissions are **logical** ("this function may write this table"). Policy documents (IAM, Azure RBAC) are not modeled.
- `placement` says where a component lives, for example a subnet inside a VPC. It is a list because some components span several zones. The serverless types of the first pack have no placement; placement becomes relevant with network zones (see [roadmap.md](roadmap.md)).
- The same fields accept **symbolic** values at the logical level (`"internet"`, `"https"`) and **concrete** values at the detailed level (`"0.0.0.0/0"`, `443`, `"10.0.1.0/24"`).
- `meta` is free-form consumer data. It is allowed on the solution, components and intents.

## 5. Results and verdicts

A verdict always has one of three states. It is never a boolean.

| State | Meaning |
|---|---|
| `pass` | Proven from the given data. |
| `fail` | Disproven from the given data. |
| `undecidable` | The given data, the packs or the supported analyses are not enough. The result lists what is missing. |

Every finding has this shape:

```ts
interface Finding {
  code: string;                  // stable, e.g. "ACCESS_PERMISSION_MISSING"
  severity: "error" | "warning" | "info";
  subjects: string[];            // component and intent ids
  params: Record<string, string | number>;
  message: string;               // default English text rendered from a template
}
```

For each intent the analysis reports the verdict and its evidence: the checks that were made (see [component-model.md §4](component-model.md#how-an-intent-is-verified)) and the setting that allowed or blocked each one. For `i4` above: "`orders-fn` has no permission on `uploads`" → `fail`, code `ACCESS_PERMISSION_MISSING`.

**Decided (Q3, initial): explicit assumptions.** For unspecified settings, the caller chooses a policy per analysis run:

- `strict`: anything unspecified makes the affected verdict `undecidable`.
- `pack-defaults`: the documented defaults declared in the pack are applied, and every assumption used is listed in the result. For example, a new S3 bucket blocks public access by default.

ArchitectMate would likely use `pack-defaults`, and detailed feasibility checks would use `strict`. In both cases the result never hides an assumption.

## 6. Analysis levels

- **Logical** (default): which component may call or access which, decided from logical settings:
  - in the first scope: public or private endpoints, API routes, function permissions and bucket public access;
  - once network traits are implemented: zone placement, public vs. private reachability through routers and gateways, and the role of traffic filters with symbolic sources and ports.

  No IP addresses are needed.
- **Detailed** (opt-in, implemented in Iteration 6 for IPv4): CIDR containment and overlaps, longest-prefix route matching, and port and CIDR rule evaluation, using the concrete values given. See [formats.md](formats.md#detailed-level).

The detailed level is a static feasibility check of the planned configuration. It does not simulate runtime behavior or guarantee a successful deployment.

The caller chooses which analyses run and at which level. Each analysis declares which levels it supports.

**Decided (Q2, initial):** the first version includes the `model-validity`, `connection-validity` and logical `access` analyses. The detailed level comes later.

## 7. Requirements, metadata and facts

**Decided:** the library does not score. It has no weights, points or complexity metrics. Consumers build those from requirement verdicts, metadata and facts.

### Requirement checks

**Decided (Q5, initial):** requirement checks stay in the library, because they are validation: a requirement passes, fails or cannot be decided. A task accepts many valid solutions, so requirements must not refer to component ids that the solver chose. **Decided (Q4, initial):** requirements select components with selectors:

- by the id of a component the task itself provides (for example a fixed "Users" endpoint);
- by component type (for example any `aws.dynamodb`);
- by category or trait (for example any `data-store`). This keeps tasks provider-neutral.

Role tags assigned by the solver are an alternative, deferred unless needed.

| Type | Meaning | Example |
|---|---|---|
| `reachable` | At least one matching target can be reached from the source through a chain of `pass` intents. | Users on the internet can write to a data store. |
| `not-reachable` | No matching target is directly accessible from the source, whether or not an intent exists. | No object storage is directly accessible from the internet. |
| `uses` | The solution contains at least *n* matching components. Lets a task prescribe a service or approach. | The solution uses `aws.lambda`. |

```json
{
  "schemaVersion": 1,
  "id": "orders-api",
  "packs": ["core", "aws"],
  "provided": [{ "id": "users", "type": "core.internet", "locked": true }],
  "requirements": [
    { "id": "r1", "type": "reachable", "from": { "id": "users" },
      "to": { "category": "data-store" }, "action": "write", "meta": { "points": 3 } },
    { "id": "r2", "type": "not-reachable", "from": { "id": "users" },
      "to": { "type": "aws.s3" } },
    { "id": "r3", "type": "uses", "select": { "type": "aws.lambda" } }
  ]
}
```

The result has one verdict per requirement, with evidence, and an overall verdict:
- `fail` if any requirement fails;
- otherwise `undecidable` if any requirement is undecidable;
- otherwise `pass`.

Requirement `meta` is returned unchanged, so a consumer can weight requirements as it likes.

### Metadata and facts query

**Decided (Q12, initial):** `collect(model, analysis?)` returns a deterministic list of every component and intent. Each entry has:
- id, type, category and traits;
- `meta`: the type's `meta` merged with the instance's `meta`, the instance winning;
- the verdict, if an analysis is given;
- the number of incoming and outgoing intents.

It also returns totals: counts by type, category and verdict, and the number of intents. Points, cost, complexity and similar measures are computed by the consumer from this data.

## 8. Determinism

- Library code uses no randomness, clock, locale-dependent formatting or network access. Packs are passed in by the caller; the library never fetches them itself.
- Output lists are sorted by stable keys (ids, codes).
- Results include the library version, the packs and their versions, and the analysis options, so "same input and same conditions" can be checked.
- Golden-file tests compare example models with their expected JSON results.

## 9. Demo sandbox

**Decided (Q8, initial).** A minimal visual sandbox where a small solution can be assembled, similar in spirit to the planned ArchitectMate. It is strictly a tech demo of the library and is deployed to this repository's GitHub Pages.

- **What it does**
  - A canvas with a palette generated from the loaded packs. A new component type in a pack appears without demo code changes.
  - Intents are drawn as arrows between components. Containers (zones) become nested areas once network traits are supported.
  - A side panel edits the selected component's properties.
  - The analysis runs on every change. Its findings and verdicts are shown in a panel and on the canvas (for example, a red arrow for a failed intent).
  - The model can be viewed, imported and exported as JSON.
  - The first scenario is a minimal serverless app: API Gateway → Lambda → DynamoDB, plus an S3 bucket.
- **Sandbox configuration.** The demo loads *scenarios*. A scenario is a JSON file with the packs, an optional starting model and an optional task. It reuses the library's formats and adds no new model.
- **What it does not do.** No levels, progression, scoring, accounts, persistence beyond the browser, or game design. Those belong to ArchitectMate.
- **Tech.** Vite + React + React Flow (`@xyflow/react`) for the canvas. It lives in `demo/`, imports the library from source, is not published to npm, and is deployed by a GitHub Actions workflow.
- **Timing.** The demo grows with the library. Each iteration makes its new capability visible in the demo (see [roadmap.md](roadmap.md)).

## 10. Repository, tooling and releases

**Decided (Q6, Q7, initial):**

| Area | Choice |
|---|---|
| Package | `solution-validator` on npm. ESM only, with `.d.ts` types. No runtime dependencies except schema validation. Targets ES2022 browsers and Node.js 22 or newer. |
| License | AGPL-3.0 (`LICENSE`). As copyright holder, the owner may still use the code in their own projects such as ArchitectMate under any terms. Third parties that ship it must comply with the AGPL. Accepting outside contributions without a contributor agreement would limit the owner's own freedom later. |
| Schemas | TypeBox: one definition produces both the TypeScript types and standard JSON Schema. The JSON Schemas are exported in the package for consumers, including the pack schema. |
| Build | tsup |
| Tests | Vitest, including golden-file tests |
| Lint and format | Biome |
| Commits | Conventional Commits, checked by commitlint in CI |
| Releases | release-please GitHub Action: derives the SemVer bump from the commits, writes `CHANGELOG.md`, tags the release and publishes to npm. Versions stay at `0.x` until the API is declared stable. |
| CI | GitHub Actions on every PR: typecheck, lint, test, build. A separate workflow deploys the demo to GitHub Pages from `main`. |

Layout:

```
src/
  core/          model types, schemas, parsing, registry
  traits/        trait implementations (the behavior vocabulary)
  analysis/      analysis engine and analyses
  requirements/  task specification and requirement checks
  query/         metadata and structural facts
  messages/      finding codes and English templates
packs/           official JSON packs (core, aws; later azure, on-prem)
test/fixtures/   example models and expected results
schemas/         JSON Schemas generated from the TypeBox definitions
demo/            visual sandbox (not published)
scripts/         repository scripts (not published)
docs/            vision, design, component model, roadmap
```

### Implementation notes (Iteration 0)

These details implement the decisions above. They are not product decisions; open points are listed in §12.

- **TypeScript 6.0.** tsup builds the type declarations through the TypeScript compiler API, which TypeScript 7 no longer provides.
- **npm workspaces.** The root package is the library. `demo/` is a private workspace that imports the library from source through a Vite alias.
- **Guards in `src/`.** Library code is type-checked with ES2022 built-ins only, without Node.js or DOM types. Biome also rejects Node.js modules and the `Date`, `Intl`, `process`, `Buffer` and `fetch` globals there.
- **Versions.** release-please starts at `0.1.0` (`initial-version`; otherwise its first version would be `1.0.0`). Below 1.0, a breaking change bumps the minor version (`bump-minor-pre-major`). The exported `VERSION` constant is kept in sync with `package.json` by release-please.
- **npm publishing** runs only when the `NPM_PUBLISH` repository variable is `true`. The owner sets it for the first functional release, together with npm credentials (trusted publishing or an `NPM_TOKEN` secret). See [README.md](../README.md#releases).
- **Commit checks.** commitlint checks every commit in a pull request and the pull request title, because a squash merge uses the title as the commit message.
- **Package license field:** `AGPL-3.0-only` (see Q14).

### Implementation notes (Iteration 1)

- **Formats** are described in [formats.md](formats.md); finding codes in [finding-codes.md](finding-codes.md). Both, and the JSON Schemas in `schemas/`, are checked against the code by tests, so they cannot drift.
- **Validation.** TypeBox validates the library's own schemas and also the property schemas packs declare, which are plain JSON Schema (a documented subset). TypeBox's error limit is raised only for the duration of a validation call.
- **Parsing versus model validity.** `parseSolution` checks structure only and returns findings instead of throwing. Semantic checks (packs, ids, types, property values, references, placement, actions, ports) are the `model-validity` analysis, so they appear in the analysis result.
- **Pack namespaces.** Type ids are `<pack>.<name>`. Unprefixed category, action and port ids belong to the `core` pack; other packs prefix theirs. A pack sees the definitions of the packs it requires, transitively.
- **Bindings.** Trait parameters are fixed values or `{ "property": "<name>" }` bindings to the component's properties. This is how instance settings (an API's endpoint type, a function's permissions) drive trait behavior without provider-specific code.
- **Distribution (Q11).** Official packs are exported as modules (`solution-validator/packs/aws`) and as raw JSON (`solution-validator/packs/aws.json`); the schemas as `solution-validator/schemas/*.json`.
- **Programming errors.** `analyze` throws a `TypeError` for an unknown analysis id or an unsupported level; `createRegistry` throws a `RegistryError` with findings. Invalid solutions never throw.
- **Golden files** use Vitest file snapshots (`npx vitest run -u` updates them). The library version is replaced by a placeholder in golden results, so releases do not change them.

### Implementation notes (Iteration 2)

- **Verdicts and evidence.** Intent-level analyses report `{ intent, verdict, checks: [{ check, verdict, evidence }] }`. Evidence has a stable code, parameters and an English message, like findings, from a separate catalog. Checks that do not apply are left out.
- **Compatibility semantics.** A rule's `actions` must include the intent's action. A rule's `ports`, when listed, must include the intent's port; a rule without `ports` does not restrict the port, because which ports a component listens on belongs to the `endpoint` trait (connectivity). A numeric port matches a port id with that number.
- **Honest undecidability.** A type that omits `accepts` makes the check `undecidable` (with a warning), while `"accepts": []` accepts nothing (`fail`). Intents whose ends, types or purpose are invalid are `undecidable` without an extra finding, since `model-validity` already reports the cause.

### Implementation notes (Iteration 3)

- **Default policy.** `strict` is the default assumption policy, so a result never relies on a default unless the caller asks for `pack-defaults`. Both policies are covered by the golden files.
- **Dependencies between analyses.** An analysis can require others; `access` adds `connection-validity`, which reports compatibility failures, so the same failure is not reported twice.
- **Connectivity without zones.** Until the network traits exist, a component is not inside any private network: a private endpoint is unreachable (`fail`), and placed components are `undecidable`. A component without an endpoint is reached only through a forwarder's route.
- **Authorization paths.** A forwarder route that `authorizes` (for example an API Gateway integration), a principal's grant, or public access. Authorization is per action, so a port-only intent to an access-controlled target is `undecidable`.
- **Exposure** is computed for every component with an endpoint, whether or not an intent exists. Components of the core `external` category represent outside parties and are not reported.
- **Findings** name the decisive problem: failing checks for a failed intent, missing settings for an undecidable one. Evidence carries the full reasoning.
- **Releases in practice.** Pull requests opened by GitHub Actions need the repository setting that allows it; until it is enabled, the release pull request is opened from release-please's branch by hand, with the `autorelease: pending` label, and release-please tags and releases it on merge. Iteration pull requests are rebase-merged, because release-please does not see commits that are older than the last release and only reachable through a merge commit (this hid Iteration 2's commits, so the 0.2.0 release commit was written by hand in release-please's format).

### Implementation notes (Iteration 4)

- **Signature.** `checkRequirements(model, analysis, task)` takes the model as well, because selectors need component types and categories. It reads intent verdicts from the `access` report and does not re-run analyses.
- **`not-reachable`** evaluates hypothetical direct access (forwarding, connectivity, authorization) between each matching source and target with the same checks and the assumption policy recorded in the analysis result. This is what "whether or not an intent exists" requires.
- **Provided components.** A missing or retyped provided component is a finding and makes the overall verdict `fail`, so removing the source cannot make a `not-reachable` requirement pass. `locked` is enforced by consumers (the demo does).
- **`collect`** merges the type's `meta` with the instance's, reports exposure and the most complete intent verdict, and sorts every list and key. It never interprets `meta`.

### Implementation notes (Iteration 5)

- **Trait vocabulary 2.** The network traits got their behavior. `router.zones` and `traffic-filter.targets` were added (Q15), `group.zones` was removed because placement already says where a group runs, and `endpoint.via` was added: a provider-managed endpoint (`via: "provider"`) is reached outside every zone even when the component is placed, so a function attached to a private network is still invoked through the provider's API while its outbound traffic goes through the network. The version 1 network parameters had no behavior, as documented, so no pack relied on them.
- **Logical routing.** Routes only distinguish `internet`; traffic inside a network uses the implicit local routes. Inbound internet traffic needs a `both` gateway attached to the network; outbound traffic may use an `outbound-only` gateway that is placed in a zone with such a route. Detailed addresses, route matching and other destinations (peering, VPN, private service endpoints) stay out of scope.
- **Filters** follow Q16. Zone filters apply to the zones the traffic leaves or enters, not to traffic that stays inside one zone. Component filters also apply to the members of a group they are attached to.
- **Honest verdicts.** An invalid placement, unset routes, targets or rules (under `strict`), or a port-limited filter when the port is unknown make connectivity `undecidable`, never `pass`.
- **Model validity** checks network wiring: routes to gateways, routers and gateways on zones, filters attached to the kinds their `attachTo` allows, and rule peers that exist.

### Implementation notes (Iteration 6)

- **The detailed level** adds the `address-plan` analysis and makes `access` use address spaces, address ranges and port ranges (Q18–Q20). `analyze(model, { level: "detailed" })` runs all four analyses by default; `address-plan` does not run at the logical level.
- **No new trait parameters.** `zone.addressSpace` already existed; rule peers and ports and route destinations accept more value forms. The `aws` pack 0.3.0 binds `cidrBlock` on VPCs and subnets and accepts IPv4 route destinations.
- **Logical results are unchanged** except that an address range other than `0.0.0.0/0` in a rule is `undecidable` at the logical level, where it was an unknown reference before.
- **IPv4 arithmetic** uses plain integers, so results are identical in every runtime.

## 11. Out of scope for the first version

- Scoring, weighting and complexity metrics (consumers build these; see [§7](#7-requirements-metadata-and-facts))
- Terraform import or export
- Azure and on-premises packs (the model is designed for them; see [component-model.md §6](component-model.md#6-cross-provider-mapping))
- Policy documents (IAM, RBAC), cost estimation and runtime simulation
- AI of any kind
- ArchitectMate itself (separate repository)

## 12. Open questions

| ID | Question | Status | Where |
|---|---|---|---|
| Q1 | First pack scope: minimal AWS serverless (API Gateway, Lambda, DynamoDB, S3); network types next. | Decided (initial) | [roadmap.md](roadmap.md) |
| Q2 | Analyses in the first version: model validity, connection validity and logical access; the detailed level comes later. | Decided (initial) | §6 |
| Q3 | Policy for unspecified settings: `strict` / `pack-defaults`. | Decided (initial) | §5 |
| Q4 | How requirements select components: provided ids, types, categories or traits. | Decided (initial) | §7 |
| Q5 | Requirement checks stay in the library, without any scoring. | Decided (initial) | §7 |
| Q6 | npm name `solution-validator`; license AGPL-3.0. | Decided | §10 |
| Q7 | Tooling choices. | Decided (initial) | §10 |
| Q8 | Demo sandbox scope, scenario format, tech and timing. | Decided (initial) | §9 |
| Q9 | Iteration plan. | Decided (initial) | [roadmap.md](roadmap.md) |
| Q10 | Trait vocabulary, type definition and pack format. | Decided (initial) | [component-model.md](component-model.md) |
| Q11 | Pack distribution: official packs ship inside the `solution-validator` package as subpath exports (`solution-validator/packs/aws`); custom packs are any JSON the consumer loads. Split them into separate npm packages only if their release cycles diverge. | Decided (initial) | [component-model.md §3](component-model.md#3-packs) |
| Q12 | Shape of the metadata and facts query. | Decided (initial) | §7 |
| Q13 | Build tool: tsup's README now says it is no longer actively maintained and recommends tsdown. tsup 9 works, with TypeScript 6. Proposal: switch to tsdown when the build needs more than tsup offers, or before TypeScript 6 stops being supported. | Proposed | §10 |
| Q14 | SPDX license identifier in `package.json`. `AGPL-3.0-only` is implemented. `AGPL-3.0-or-later` would let users apply later AGPL versions. To confirm before the first npm release. | Proposed | §10 |
| Q15 | How traffic filters and routers are attached: the filter or router lists what it applies to (`traffic-filter.targets`, `router.zones`), keeping all network wiring in the network traits; this matches how AWS associates network ACLs and route tables. | Decided (initial) | [formats.md](formats.md#trait-parameters-vocabulary-2) |
| Q16 | Filter rule vocabulary: `direction`, `peer` (`any`, `internet` or the id of a component, zone or filter), optional `ports` and `effect`; rules in order, first match decides, then the default policy; stateless filters also check the return traffic. | Decided (initial) | [formats.md](formats.md#trait-parameters-vocabulary-2) |
| Q18 | Address family for the detailed level: IPv4 only for now; IPv6 can follow as its own step. | Decided (initial) | §6 |
| Q19 | Return traffic through stateless filters at the detailed level uses the ephemeral ports 1024–65535; a rule must cover the whole range. | Decided (initial) | [formats.md](formats.md#detailed-level) |
| Q20 | Matching address ranges when an address is unknown (parties outside every zone, or a range that covers part of a zone): `undecidable`, never a guess; route choice for internet traffic is `undecidable` when a more specific public route leads elsewhere. | Decided (initial) | [formats.md](formats.md#detailed-level) |
| Q17 | Groups and multiple placements: an intent through a group or a component in several zones passes only if every member or placement passes. | Decided (initial) | [formats.md](formats.md#access-checks-logical-level) |
