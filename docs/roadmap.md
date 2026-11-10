# Roadmap

> **Status:** Approved (initial) · 2026-11-10 · **Current iteration: 4 — Requirement checks and metadata query**
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
| 4 | Requirement checks and metadata query | 0.4.0 | Q4, Q5, Q12 | Approved |
| 5 | Network traits (candidate) | 0.5.0 | to be scoped | Candidate |

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

### Iteration 5 (candidate) — Network traits

Implements `zone`, `gateway`, `router`, `traffic-filter` and `group` at the logical level. Adds the AWS network types to the `aws` pack: VPC, subnet, internet gateway, NAT gateway, route table, security group, network ACL and Auto Scaling group, plus Lambda placed in a VPC. This covers the vision's simple-mode example. To be scoped when Iteration 4 is done.

## Backlog (not scheduled; each item needs approval)

- A second pack (Azure or on-premises), to prove in practice that the model is generic
- Detailed level: CIDR, route matching, port and CIDR rules
- More AWS types: CloudFront, ALB, EC2, RDS, VPC endpoints
- Availability analysis: multi-AZ, single points of failure
- Terraform export
- Role-tag selectors
