# CLAUDE.md

Guidance for AI coding sessions in this repository. Development runs in online sessions that see only the repository, so every requirement and decision must be recorded here or in `docs/`. Nothing may live only in chat history.

## Read first

1. [docs/product-vision.md](docs/product-vision.md): what the product is and is not. Its "Guidance for the developer AI" section is binding.
2. [docs/design.md](docs/design.md): the technical design. Items marked **Decided** are settled. Items marked **Proposed** are not requirements yet. Where a decision here explicitly supersedes the vision (for example, that the library does not score), design.md wins.
3. [docs/component-model.md](docs/component-model.md): traits, component types and packs.
4. [docs/roadmap.md](docs/roadmap.md): the iterations. Work only within the scope of the current approved iteration.
5. [docs/formats.md](docs/formats.md) and [docs/finding-codes.md](docs/finding-codes.md): the implemented formats and finding codes (reference).

## Rules

- **English only:** code, identifiers, comments, documentation, commit messages and PR descriptions. The product owner may write in Hungarian; reply in the language they use.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`, `build:`). Choose the type deliberately, because the SemVer bump is derived from it. Breaking changes use `!` or a `BREAKING CHANGE:` footer.
- **Scope:** do not add features, use cases, component types or analyses beyond the vision and the current iteration. If something seems essential, propose it separately with a short justification and wait for approval.
- **Ask first** when a decision would change user-visible behavior, the scope, or evaluation results.
- **Record decisions:** when a proposal or open question is decided, update `docs/design.md` (status and §12) and `docs/roadmap.md` in the same pull request.
- **Provider-neutral engine:** no AWS, Azure or other provider-specific logic in `src/`. Provider knowledge lives in JSON packs (`packs/`). If a pack cannot express a behavior, propose a new trait; do not special-case a type in engine code.
- **No scoring:** the library returns verdicts, metadata and facts. Weights, points and complexity metrics belong to consumers.
- **Determinism:** library code uses no randomness, clock, locale-dependent formatting or network access. Output ordering is stable.
- **Browser and Node:** no Node-only APIs in `src/`. Consumers run on GitHub Pages without a backend.
- **No AI** in analysis, scoring or explanations.
- **Three-state verdicts:** never collapse `undecidable` into `pass` or `fail`. Never claim more than the input supports.

## Commands

Requires Node.js 22.18 or newer (see `.nvmrc`). Run everything from the repository root. The root package is the library; `demo/` is an npm workspace, so one `npm ci` installs both.

| Command | What it does |
|---|---|
| `npm ci` | Install dependencies |
| `npm run check` | Everything CI runs, in order: the commands below |
| `npm run typecheck` | `tsc --build` over `tsconfig.lib.json` (`src/`), `tsconfig.node.json` (tests, scripts, configs) and `demo/tsconfig.json` |
| `npm run lint` | Biome lint and format check. `npm run format` applies fixes. CI runs `npx biome ci .` |
| `npm test` | Vitest, once. `npm run test:watch` keeps watching. Tests live in `test/**/*.test.ts`. |
| `npx vitest run -u` | Regenerate golden files (`test/fixtures/expected/`), `schemas/*.json` and `docs/finding-codes.md`. Review the diff before committing. |
| `npm run build` | tsup builds `src/index.ts` into `dist/` (ESM and `.d.ts`) |
| `npm run check:package` | Imports the built package by name and checks its `exports`. Run after `build`. |
| `npm run demo:dev` / `npm run demo:build` | Demo dev server / production build into `demo/dist/` |
| `npx commitlint --from origin/main` | Check commit messages locally (CI checks every PR commit and the PR title) |

Guards that enforce the rules above; do not loosen them:

- `src/` is type-checked with ES2022 built-ins only: no Node.js or DOM types.
- Biome rejects Node.js modules and the `Date`, `Intl`, `process`, `Buffer` and `fetch` globals in `src/`.
- Determinism rules that tooling cannot catch (for example `Math.random()`, `localeCompare` or `toLocaleString`) still apply.

Generated files: `schemas/*.json`, `docs/finding-codes.md` and `test/fixtures/expected/*.json` come from the code; regenerate them instead of editing. A new finding code goes into `src/messages/codes.ts`.

Release files: release-please owns `CHANGELOG.md`, `.release-please-manifest.json` and the version in `package.json` and `src/version.ts`. Do not edit them by hand. Release and repository setup are described in [README.md](README.md#releases).
