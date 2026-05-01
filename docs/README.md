# ICE Documentation

This folder is the long-form documentation for ICE. For the 30-second pitch and install instructions, start at the [repo root README](../README.md).

## Where to start

| I want to… | Read |
|---|---|
| Install ICE and run a first deploy | [getting-started.md](getting-started.md) |
| Understand how the whole system fits together | [architecture.md](architecture.md) |
| Deploy a real app to GCP | [deploying-to-gcp.md](deploying-to-gcp.md) |
| Contribute code or file a bug | [contributing.md](contributing.md) → [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| Run the test suites | [testing.md](testing.md) |
| Understand what "Community Edition" means | [community-edition.md](community-edition.md) |
| Use the multi-agent workflow with Claude Code | [agents.md](agents.md) |

## Reference

Shorter pages that describe one subsystem each. Each ends with pointers to the code — treat them as entry points into the source, not replacements for it.

| Page | What it covers |
|---|---|
| [core-engine.md](core-engine.md) | Graph, schemas, deploy plan/apply, importers |
| [frontend.md](frontend.md) | React web app, SVG canvas, Redux state, feature modules |
| [services.md](services.md) | The six backend services composed by the gateway |
| [database.md](database.md) | Prisma schema, SQLite for dev, Postgres for prod |
| [desktop.md](desktop.md) | Electron wrapper, embedded gateway, packaging status |
| [ai-assistant.md](ai-assistant.md) | Claude integration, SSE streaming, what it can do |
| [blocks-reference.md](blocks-reference.md) | The concept palette and the provider blocks behind it |
| [refactoring-patterns.md](refactoring-patterns.md) | Six proven decomposition patterns + common test patterns + gotchas distilled from Phase 1+2 refactors |

## How these docs are maintained

These pages are hand-written and versioned with the code. When docs and code disagree, **code wins** — open an issue or PR to fix the docs. There is no auto-generated or LLM-generated content under `docs/` (that's a deliberate choice after a brief Obsidian-plugin experiment).

## See also

- [ROADMAP.md](../ROADMAP.md) — what's shipped, in progress, and planned.
- [CHANGELOG.md](../CHANGELOG.md) *(planned)* — release notes once we start cutting tagged releases.
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — contributor workflow.
- [../SECURITY.md](../SECURITY.md) — how to report vulnerabilities.
- [../COMMUNITY_PLEDGE.md](../COMMUNITY_PLEDGE.md) — commitments around ICE Cloud for non-profits.
