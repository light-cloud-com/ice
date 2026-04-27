# CLAUDE.md

Operating rules for Claude Code and the multi-agent workflow on this repo.

The human-facing entry point for the workflow is [`docs/agents.md`](docs/agents.md). The live state files are under [`.claude/state/`](.claude/state/).

## Multi-agent loop

ICE uses four agents — **planner**, **implementer**, **critic**, **ux-tester** — defined in [`.claude/agents/`](.claude/agents/). The orchestrator (the main session) dispatches work to them.

**Dispatch rules.**

- Read `.claude/state/decisions.md`, `.claude/state/learnings.md`, and skim `/docs/agents.md` before starting any unit.
- Update `progress.md` as units transition between **In flight** / **Done this week** / **Blocked**.
- Append to `learnings.md` whenever a critic or ux-tester surfaces something worth remembering.
- Promote stabilized learnings to `/docs` when they've been cited 3+ times or clearly generalize beyond the unit they came from.

The planner records architectural choices in `decisions.md`. The implementer reads learnings before editing and appends gotchas after. The critic cites the relevant learning anchor in its verdict, and flags any `/docs` page that contradicts a current finding. The ux-tester records UX patterns worth keeping or avoiding under a `ux-<topic>` anchor.

## Persistent state

Three markdown files under `.claude/state/` carry cross-session memory.

| File | Owner | Rule |
|---|---|---|
| [`decisions.md`](.claude/state/decisions.md) | any agent (usually planner) | **Append-only.** Supersede with a new dated entry that references the old one under "Related"; never edit past entries. |
| [`progress.md`](.claude/state/progress.md) | **orchestrator only** — subagents do not write here | Living document. Update as units transition between In flight / Done this week / Blocked / Archive. |
| [`learnings.md`](.claude/state/learnings.md) | any agent | **Append-only.** The only allowed edit to a past entry is appending a `_Promoted to: /docs/<path>_` line. |

### Promotion path

A learning becomes a proper doc once it's been cited 3+ times or clearly generalizes beyond one unit. Write it up under `/docs/`, add a row to the relevant table in `/docs/README.md`, and append `_Promoted to: /docs/<path>_` to the original `learnings.md` entry.

### Quarterly compaction

Once per quarter, fork a session to cluster duplicates in `learnings.md`. Archive the pre-compaction file as `.claude/state/archive/learnings-YYYY-Qn.md`, then write the compacted version back. Preserve anchors referenced from `/docs` or `decisions.md`.

See [`docs/agents.md`](docs/agents.md) for the human-facing overview of the workflow.
