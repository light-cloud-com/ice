# Contributing

The normative contributor document is [`../CONTRIBUTING.md`](../CONTRIBUTING.md) at the repo root — it has the install steps, the PR workflow, and what we will and won't merge. This page adds things that don't fit in the CONTRIBUTING guide: the typical dev loop, where to start reading, and how issues are triaged.

## The typical dev loop

```bash
pnpm install                          # once per clone
pnpm dev:all                          # terminal 1 — runs gateway + web
# ... make code changes ...
pnpm typecheck                        # before opening a PR
pnpm lint:check                       # errors block; warnings allowed
pnpm format:check                     # must pass
pnpm test:unit                        # must pass
```

Web changes hot-reload; gateway changes restart automatically via `tsx watch`. For desktop development, `pnpm dev:desktop` and Electron's built-in renderer reload.

CI runs the same four gates (`typecheck`, `lint:check`, `format:check`, `test:unit`) on every PR. We don't merge red builds.

## Where to start reading

If you want to get oriented quickly:

- [architecture.md](architecture.md) — the one-page mental model.
- [`packages/core/src/index.ts`](../packages/core/src/index.ts) — top-level export surface of the engine.
- [`packages/ui/src/features/canvas/`](../packages/ui/src/features/canvas/) — the canvas component, edges, nodes.
- [`packages/ui/src/store/slices/`](../packages/ui/src/store/slices/) — Redux state shape.
- [`services/deploy/src/services/deploy.service.ts`](../services/deploy/src/services/deploy.service.ts) — deploy orchestration.
- [`apps/gateway/src/index.ts`](../apps/gateway/src/index.ts) — how the services are composed.

## Good first issues

Issues tagged `good-first-issue` on GitHub are sized for someone new to the project:

- Adding or improving a cloud resource block in `packages/blocks/`.
- Adding or improving a GCP/AWS/Azure handler in `packages/providers/<cloud>/`.
- Frontend polish tasks in `packages/ui/`.
- Documentation gaps in `docs/`.

Bigger projects (multi-week) live in [ROADMAP.md](../ROADMAP.md) — please open an issue to discuss approach before writing code.

## Where things are documented

| Topic | Doc |
|---|---|
| Commit messages, PR shape, what-we-wont-merge | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| How to run the test suites | [testing.md](testing.md) |
| Reporting a security vulnerability | [`../SECURITY.md`](../SECURITY.md) |
| Licensing of contributions | Apache 2.0, section 5 — no CLA |
| Conduct | [`../CONTRIBUTING.md#conduct`](../CONTRIBUTING.md#conduct) — be kind, call out behaviour not people |

## Writing docs

Contributions to `docs/` are as welcome as code contributions. A few preferences:

- **Code is source of truth.** If docs disagree with code, update the docs (or open an issue if you're not sure which is right).
- **Prefer concrete over abstract.** `packages/core/src/deploy/card-translator.ts:517` beats "the translator module."
- **Link to code paths with `path#Lnn`** where useful.
- **Short mermaid diagrams welcome.** Keep them under ~15 nodes so they render legibly.
- **Don't write aspirational docs.** If a feature is planned but not shipped, put it on the [roadmap](../ROADMAP.md) instead of documenting it as if it worked.

## Filing bugs

Bug reports go through the GitHub issue tracker with the bug template. Please include:

- OS, Node version, and whether you hit it in web or desktop mode.
- ICE version (root `package.json` → `version`, currently `0.1.x`).
- Minimal repro — ideally a canvas export, or the exact steps.
- Logs / stack traces where relevant.

## Proposing features

Open an issue with the feature template *before* writing code. A short problem statement beats a long design — we'd rather have a 10-minute conversation about approach than review a 2,000-line PR that doesn't fit. If a feature is already on the roadmap, add your use case to the existing issue.

## See also

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md)
- [testing.md](testing.md)
- [ROADMAP.md](../ROADMAP.md)
