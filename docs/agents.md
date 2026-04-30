# Agents

ICE uses a four-agent workflow for non-trivial changes: a planner, an implementer, a critic, and a UX tester. The agents share state through three markdown files under `state/`, so decisions, in-flight progress, and learnings persist across sessions.

This page is the human entry point. The live state files are under [`state/`](../state/); the agent definitions are under [`.claude/agents/`](../.claude/agents/).

## The four agents

| Agent | Role |
|---|---|
| **planner** | Reads the brief and existing state, surveys the relevant code, and produces a unit-by-unit plan. Records architectural choices in `decisions.md`. |
| **implementer** | Executes one unit of the plan: edits code, runs tests, reports back. Reads relevant learnings before touching a package; appends new ones when a non-obvious gotcha surfaces. |
| **critic** | Reviews the implementer's diff for bugs, regressions, and convention drift. Cites a learning anchor when a finding generalizes; flags stale `/docs` pages. |
| **ux-tester** | Drives the UI for any user-facing change and records UX patterns worth keeping or avoiding. |

The orchestrator (the main Claude session) routes work to these agents and is the only writer of `progress.md`.

## Persistent state

State lives under [`state/`](../state/) — agent-managed operational state, distinct from human-authored documentation. Three files:

| File | Owner | Lifecycle |
|---|---|---|
| [`decisions.md`](../state/decisions.md) | any agent (usually planner) | Append-only. Each entry: `## YYYY-MM-DD — title` with Context, Decision, Alternatives considered, Consequences, Related. |
| [`progress.md`](../state/progress.md) | orchestrator only | Living document. Sections: In flight / Done this week / Blocked / Archive. Subagents never write to it. |
| [`learnings.md`](../state/learnings.md) | any agent | Append-only. Each entry has a kebab-case `##` anchor and a `_Discovered: YYYY-MM-DD by <agent> in <unit-id>_` line. |

The append-only rule has one exception: once a learning is promoted to `/docs`, append a `_Promoted to: /docs/<path>_` line to the original entry. Don't edit anything else.

## Promotion: learnings → /docs

A learning that's been **cited 3+ times** or that **clearly generalizes beyond one unit** graduates from `learnings.md` into `/docs/` as proper documentation:

1. Write the topic up as a `/docs/*.md` page using the conventions in [contributing.md](contributing.md) ("Writing docs").
2. Add a row to the [Reference](README.md#reference) or [Where to start](README.md#where-to-start) table of `/docs/README.md`, whichever fits better.
3. Append `_Promoted to: /docs/<file>.md_` to the original `learnings.md` entry. This is the only allowed edit to a past learning.

The original entry stays in `learnings.md` for traceability — the back-reference makes the canonical home obvious.

## Quarterly compaction

`learnings.md` grows monotonically. Once per quarter, fork a session that:

1. Clusters duplicate or near-duplicate entries.
2. Archives the pre-compaction file as `state/archive/learnings-YYYY-Qn.md`.
3. Writes a compacted version back to `learnings.md`, preserving anchors that are referenced from `/docs` or from `decisions.md`.

The archive directory is under [`state/archive/`](../state/archive/).

## See also

- [`state/decisions.md`](../state/decisions.md) — live decisions log.
- [`state/learnings.md`](../state/learnings.md) — live learnings log.
- [`../CLAUDE.md`](../CLAUDE.md) — the dispatch rules and the state-system rules in normative form.
- [contributing.md](contributing.md) — for writing pages once a learning is promoted.
