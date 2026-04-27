# Decisions log

Append-only log of architectural and process decisions for the multi-agent ICE workflow.

**Rules**

- New decisions: append a dated entry. Never edit past entries.
- Supersede an old decision by adding a new entry that references it under "Related".
- The only allowed edit to a past entry elsewhere in `.claude/state/` is appending a `_Promoted to: /docs/<path>_` line on a learning that's been promoted. That rule does not apply to entries in this file — `decisions.md` entries are never edited.

---

## 2026-04-27 — Adopt persistent state system

**Context.** The multi-agent ICE workflow (planner, implementer, critic, ux-tester) needs cross-session memory. Without it, each agent starts cold and re-derives the same conclusions, the orchestrator can't see what's in flight, and post-mortem learnings vanish at the end of a session.

**Decision.** Adopt a three-file markdown state system under `.claude/state/`:

- `decisions.md` — append-only log of architectural and process choices.
- `progress.md` — living document, owned exclusively by the orchestrator (main session).
- `learnings.md` — append-only log of non-obvious gotchas and patterns.

State files live in `.claude/state/` (agent-managed operational state) and are cross-linked from `/docs/agents.md` (human entry point). Stabilized learnings — cited 3+ times or generalizing beyond one unit — get promoted into `/docs` as proper documentation, and the original learning entry is annotated with a `_Promoted to:_` back-reference.

**Alternatives considered.**

- *Single `state.json`.* Rejected. Markdown reads well in diffs, tolerates partial writes, and surfaces in `git blame`. JSON encourages whole-file overwrites; we want append-only.
- *Per-agent memory frontmatter inside each `.claude/agents/*.md`.* Rejected. Couples state to the agent definition (so editing an agent's role would churn its memory), prevents cross-agent reads (the critic should see what the implementer learned), and fragments the orchestrator's view.
- *State in `/docs/state/`.* Rejected. `/docs` is human-authored documentation that ships with the repo; mixing agent-managed operational state into it muddies that contract. We cross-link from `/docs/agents.md` instead of co-locating.

**Consequences.**

- Every agent reads `decisions.md` and `learnings.md` before acting (see learning `read-state-first`).
- The orchestrator owns `progress.md` exclusively. Subagents never write to it.
- Quarterly compaction: cluster duplicates in `learnings.md`, archive the prior version to `.claude/state/archive/learnings-YYYY-Qn.md`.
- Stabilized learnings get promoted to `/docs`; the original entry gets a `_Promoted to:_` line appended (the only legal post-hoc edit).

**Related.** [`/docs/agents.md`](../../docs/agents.md)
