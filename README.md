# SolutionValidator

A deterministic, provider-neutral library that analyzes designed software and infrastructure solutions. It answers two questions: does the solution work, and does it meet a task's requirements?

> **Status: 0.x.** Iterations 1–5 of the [roadmap](docs/roadmap.md) are implemented: the model and pack format, the `model-validity`, `connection-validity` and `access` analyses (including networks: zones, routes, gateways, security groups and network ACLs), the opt-in detailed level with IPv4 address plans, requirement checks and the metadata query. The API may change before 1.0.

## What it does

- Checks relationships, not just components. A connection between an application and a database does not prove that the application can reach it. An API route, a permission or a public access setting decides that.
- Returns three-state verdicts: `pass`, `fail` or `undecidable`. It never claims more than the input supports.
- Takes component types from JSON packs. The `aws` pack covers serverless (API Gateway, Lambda, DynamoDB, S3), web tiers (CloudFront, Application Load Balancer, EC2, Auto Scaling, RDS) and networking (VPC, subnets, internet and NAT gateways, VPC endpoints, route tables, security groups, network ACLs). The engine itself contains no provider-specific logic.
- Runs in browsers and in Node.js, with no backend.
- Is deterministic: no randomness, clock, network access or AI. It does not score; consumers build scoring from its verdicts, metadata and facts.

## Usage

```sh
npm install solution-validator
```

```ts
import { analyze, createRegistry, parseSolution } from "solution-validator";
import awsPack from "solution-validator/packs/aws";
import corePack from "solution-validator/packs/core";

const registry = createRegistry([corePack, awsPack]); // throws a RegistryError for invalid packs

const parsed = parseSolution(
  {
    schemaVersion: 1,
    packs: ["core", "aws"],
    components: [
      { id: "orders-fn", type: "aws.lambda",
        properties: { permissions: [{ resource: "orders-table", access: "read-write" }] } },
      { id: "orders-table", type: "aws.dynamodb" },
    ],
    intents: [{ id: "i1", from: "orders-fn", to: "orders-table", action: "write" }],
  },
  registry,
);

if (parsed.ok) {
  const result = analyze(parsed.model);
  for (const report of result.analyses) {
    for (const finding of report.findings) console.log(finding.code, finding.message);
  }
} else {
  console.log(parsed.findings); // schema findings; parseSolution never throws for bad input
}
```

Check a task's requirements and collect facts for your own scoring:

```ts
import { checkRequirements, collect, parseTask } from "solution-validator";

const task = parseTask(taskJson, registry); // { ok, task } or { ok: false, findings }
if (parsed.ok && task.ok) {
  const analysis = analyze(parsed.model, { assumptions: "pack-defaults" });
  const requirements = checkRequirements(parsed.model, analysis, task.task);
  console.log(requirements.verdict); // "pass" | "fail" | "undecidable"
  const facts = collect(parsed.model, analysis); // meta, counts and verdicts; no scores
}
```

The formats are described in [docs/formats.md](docs/formats.md) and every finding code in [docs/finding-codes.md](docs/finding-codes.md). JSON Schemas for editors and other tools are exported as `solution-validator/schemas/solution.schema.json` and `solution-validator/schemas/pack.schema.json`.

## Documentation

- [Product vision](docs/product-vision.md): what the product is and is not
- [Technical design](docs/design.md): architecture, model, results and tooling
- [Component model](docs/component-model.md): traits, component types and packs
- [Roadmap](docs/roadmap.md): iterations and their scope
- [Formats](docs/formats.md): solution, pack and result formats
- [Finding codes](docs/finding-codes.md): every finding code and its message

## Demo

The visual sandbox is deployed to GitHub Pages: <https://apostx.github.io/solution-validator/>. Build a solution from the packs' palette, draw intents between components, edit properties, and see the findings as you go. It is a tech demo, not a product.

## Development

Requires Node.js 22.18 or newer (see `.nvmrc`) and npm.

```sh
npm ci          # install the library and the demo workspace
npm run check   # everything CI runs
```

| Command | What it does |
|---|---|
| `npm run typecheck` | Type-checks the library, the tests and tooling, and the demo (`tsc --build`) |
| `npm run lint` | Lints and checks formatting with Biome. `npm run format` applies fixes. |
| `npm test` | Runs the tests once with Vitest. `npm run test:watch` keeps watching. |
| `npm run build` | Builds the library into `dist/` with tsup (ESM and type declarations) |
| `npm run check:package` | Imports the built package by name and checks its exports. Run it after `build`. |
| `npm run demo:dev` | Starts the demo dev server |
| `npm run demo:build` | Builds the demo into `demo/dist/` |
| `npm run check` | All of the above, in CI order |

### Repository layout

```
src/              library source (browser and Node.js compatible)
packs/            official packs (core, aws) as JSON
schemas/          JSON Schemas generated from the library's TypeBox definitions
test/             tests; example models and golden results in test/fixtures/
demo/             visual sandbox, an npm workspace that imports the library from source
scripts/          repository scripts (not published)
docs/             vision, design, component model and roadmap
.github/workflows CI, commit message checks, releases and the demo deployment
```

Inside `src/`: `core/` (schemas, registry, parsing), `analysis/`, `messages/` (finding codes), `packs/` (pack module wrappers) and `util/`. See [design.md §10](docs/design.md#10-repository-tooling-and-releases).

### Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). commitlint checks every commit in a pull request and the pull request title, because a squash merge uses the title as the commit message. The type decides the version bump, so choose it deliberately:

- `feat:` adds a minor version;
- `fix:` adds a patch version;
- a breaking change (`feat!:` or a `BREAKING CHANGE:` footer) also adds a minor version while the version is below 1.0;
- `docs:`, `test:`, `refactor:`, `chore:`, `ci:` and `build:` do not trigger a release.

## Releases

[release-please](https://github.com/googleapis/release-please) runs on every push to `main`. When releasable commits (`feat`, `fix`) are on `main`, it opens or updates a release pull request with the next version and the changelog. Merging that pull request tags the release, creates a GitHub release and, once enabled, publishes to npm.

- The first release is `0.1.0`. Versions stay at `0.x`, one minor version per iteration, until the API is declared stable.
- Merge the release pull request only when an iteration is complete, and release an iteration before merging the next one.
- Merge iteration pull requests with **rebase and merge** (or squash). release-please walks `main` back to the last release commit, so commits that are older than that commit and only reachable through a merge commit are not seen.
- npm publishing starts with the first functional release. It runs only when the `NPM_PUBLISH` repository variable is `true`.

### One-time repository setup

These settings live on GitHub, not in the repository:

1. **Pages:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. **Release pull requests:** Settings → Actions → General → Workflow permissions: enable **Allow GitHub Actions to create and approve pull requests**.
3. **Optional, CI on release pull requests:** pull requests opened with the default `GITHUB_TOKEN` do not trigger workflows. If the release pull request must pass required checks, add a `RELEASE_PLEASE_TOKEN` secret: a fine-grained token with read and write access to contents and pull requests on this repository.
4. **Before the first functional release:** configure npm credentials, either a trusted publisher on npmjs.com for this repository's `release.yml` workflow or an `NPM_TOKEN` secret. Then set the repository variable `NPM_PUBLISH` to `true` (Settings → Secrets and variables → Actions → Variables).

## License

[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).
