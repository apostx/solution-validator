# SolutionValidator

A deterministic, provider-neutral library that analyzes designed software and infrastructure solutions. It answers two questions: does the solution work, and does it meet a task's requirements?

> **Status: early development.** Iteration 0 (foundations) sets up the project. The package has no functional API yet. The first functional release is planned as `0.1.0`. See the [roadmap](docs/roadmap.md).

## What it does

- Checks relationships, not just components. A connection between an application and a database does not prove that the application can reach it. An API route, a permission or a public access setting decides that.
- Returns three-state verdicts: `pass`, `fail` or `undecidable`. It never claims more than the input supports.
- Takes component types from JSON packs. The first pack describes a minimal AWS serverless application. The engine itself contains no provider-specific logic.
- Runs in browsers and in Node.js, with no backend.
- Is deterministic: no randomness, clock, network access or AI. It does not score; consumers build scoring from its verdicts, metadata and facts.

## Documentation

- [Product vision](docs/product-vision.md): what the product is and is not
- [Technical design](docs/design.md): architecture, model, results and tooling
- [Component model](docs/component-model.md): traits, component types and packs
- [Roadmap](docs/roadmap.md): iterations and their scope

## Demo

The visual sandbox is deployed to GitHub Pages: <https://apostx.github.io/solution-validator/>. It is a placeholder until Iteration 1.

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
test/             tests; example models and expected results go in test/fixtures/
demo/             visual sandbox, an npm workspace that imports the library from source
scripts/          repository scripts (not published)
docs/             vision, design, component model and roadmap
.github/workflows CI, commit message checks, releases and the demo deployment
```

The other folders planned in [design.md §10](docs/design.md#10-repository-tooling-and-releases) (`packs/`, `src/core/`, `src/analysis/` and so on) arrive with the iterations that need them.

### Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). commitlint checks every commit in a pull request and the pull request title, because a squash merge uses the title as the commit message. The type decides the version bump, so choose it deliberately:

- `feat:` adds a minor version;
- `fix:` adds a patch version;
- a breaking change (`feat!:` or a `BREAKING CHANGE:` footer) also adds a minor version while the version is below 1.0;
- `docs:`, `test:`, `refactor:`, `chore:`, `ci:` and `build:` do not trigger a release.

## Releases

[release-please](https://github.com/googleapis/release-please) runs on every push to `main`. When releasable commits (`feat`, `fix`) are on `main`, it opens or updates a release pull request with the next version and the changelog. Merging that pull request tags the release, creates a GitHub release and, once enabled, publishes to npm.

- The first release is `0.1.0`. Versions stay at `0.x`, one minor version per iteration, until the API is declared stable.
- Merge the release pull request only when an iteration is complete.
- npm publishing starts with the first functional release. It runs only when the `NPM_PUBLISH` repository variable is `true`.

### One-time repository setup

These settings live on GitHub, not in the repository:

1. **Pages:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. **Release pull requests:** Settings → Actions → General → Workflow permissions: enable **Allow GitHub Actions to create and approve pull requests**.
3. **Optional, CI on release pull requests:** pull requests opened with the default `GITHUB_TOKEN` do not trigger workflows. If the release pull request must pass required checks, add a `RELEASE_PLEASE_TOKEN` secret: a fine-grained token with read and write access to contents and pull requests on this repository.
4. **Before the first functional release:** configure npm credentials, either a trusted publisher on npmjs.com for this repository's `release.yml` workflow or an `NPM_TOKEN` secret. Then set the repository variable `NPM_PUBLISH` to `true` (Settings → Secrets and variables → Actions → Variables).

## License

[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).
