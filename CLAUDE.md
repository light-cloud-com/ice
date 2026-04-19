# Project knowledge source

The authoritative conceptual knowledge for this project lives in an LLM-generated wiki under `docs/wiki/`, produced by the [llm-wiki](https://github.com/domleca/llm-wiki) Obsidian plugin.

## Folder structure

1. **`docs/wiki/concepts/*.md`** — one page per concept/feature (e.g. `activity-feed.md`). Short definitions + links to related entities and raw sources. Start here for "what is X" / "how does Y work."
2. **`docs/wiki/entities/*.md`** — one page per domain entity / data model (e.g. `canvasproject.md`). Lists **Facts** and **Connections** (typed relationships: `part-of`, `related-to`, etc.).
3. **`docs/wiki/knowledge.json`** — full structured graph. Use when you need to enumerate entities/concepts programmatically.
4. **`docs/raw/*`** — raw source documentation. Wiki pages link back via `[[raw/...]]`. Use when the wiki summary omits detail.
5. **`docs/backlog/`** — in-flight work, gaps, and planned features. Treat as "what we want" rather than "what is."
6. **Code** — ground truth. If wiki and code disagree, code wins; flag the staleness.

### Link convention

Wiki pages use Obsidian `[[wikilinks]]`. Resolve them relative to `docs/wiki/` — e.g. `[[environment]]` → search for `docs/wiki/{concepts,entities}/environment.md`.

## Regenerating the wiki

The wiki is not regenerated automatically. After meaningful doc changes:

1. Open Obsidian with `docs/` as the vault.
2. Run the llm-wiki command **"Extract knowledge from vault"**.
3. Commit the updated `docs/wiki/` folder.

Extraction runs locally via Ollama (`qwen2.5:7b` + `nomic-embed-text`). No cloud calls.

## When the wiki is missing or stale

If `docs/wiki/` doesn't exist yet, fall back to `docs/*.md` and flag it — the user hasn't run the first extraction.
