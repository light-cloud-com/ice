# Contributing to ICE

Thanks for taking the time to contribute. This doc covers how to get the project running, where things live, and what we expect from pull requests.

## Quick start

```bash
# Prerequisites: Node >= 22, pnpm >= 10
git clone https://github.com/light-cloud-com/ice.git
cd ice
pnpm install
pnpm schemas:build      # Generate provider schemas (~10-15 min first time)
pnpm dev:all            # Web on localhost:5173, gateway on 15173
# or
pnpm dev:desktop        # Electron app
```

## Project layout

See [README.md](README.md#architecture) for the full tree. The short version:

- `packages/core` - graph engine, schemas, deploy translator
- `packages/blocks` - cloud resource block definitions (AWS/GCP/Azure/K8s)
- `packages/ui` - React components (canvas, panels, palette, AI chat)
- `packages/web` - Vite web app shell
- `packages/providers/{gcp,aws,azure}` - per-cloud deployer implementations
- `services/{canvas,deploy,ai,iam,credentials,engine}` - backend express routers
- `apps/gateway` - composes all services
- `apps/desktop` - Electron wrapper with embedded gateway

## Development workflow

Before opening a PR, run these locally:

```bash
pnpm typecheck          # TypeScript across all packages
pnpm lint:check         # ESLint (errors block; warnings allowed)
pnpm format:check       # Prettier
pnpm test:unit          # Vitest unit tests
pnpm --filter @ice/web build
```

CI runs the same commands on every push and PR. We don't ship red builds.

Integration tests that need a live SQLite DB live in `**/*.int.test.ts` and run separately:

```bash
pnpm dev:setup          # Create the dev DB once
pnpm test:int           # Run integration tests
```

E2E tests use Playwright against a running app:

```bash
pnpm test:e2e           # Headless
pnpm test:dashboard     # Interactive GCP test dashboard at :15200
```

## Reporting bugs

Open an issue using the [bug template](.github/ISSUE_TEMPLATE/bug.yml). Include:

- What you did (ideally a minimal repro)
- What you expected
- What happened (logs, screenshots, stack traces)
- Your OS, Node version, and whether it's the web app or desktop
- The ICE version (`pnpm --filter ice exec node -p "require('./package.json').version"`)

Security issues: **do not** open a public issue. See [SECURITY.md](SECURITY.md).

## Proposing features

Open an issue using the [feature template](.github/ISSUE_TEMPLATE/feature.yml) before writing code. Describe the use case - not the implementation. We'd rather discuss approach once than review a large PR that doesn't fit.

## Pull requests

- One logical change per PR. Split refactors from behaviour changes.
- Commit messages: use imperative mood ("Add X", not "Added X"). Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`) are welcome but not required.
- Rebase on `main` before opening a PR. We merge with squash by default.
- Keep the diff focused. If you notice unrelated cleanup, open a separate PR.
- Add tests for new behaviour. Bug fixes should include a regression test.
- Don't regress CI. If your change touches something CI doesn't cover, add coverage in the same PR.

### What we won't merge

- Features without a clear user problem ("might be useful someday").
- Rewrites of working code without a behavioural reason.
- Dependencies added for a single one-liner.
- Anything that weakens the Electron security model (nodeIntegration, contextIsolation, sandbox).

## Licensing

ICE is released under the [PolyForm Noncommercial License 1.0.0](LICENSE) — free for personal, research, educational, and other noncommercial use; commercial use is not permitted. By contributing, you agree that your contribution will be licensed under the same terms. No separate CLA is required.

## Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Short version: be kind, call out behaviour not people.
