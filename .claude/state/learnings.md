# Learnings

Append-only. Each entry has a kebab-case `##` anchor, a `_Discovered_` line, and one paragraph.

**Rules**

- New learnings: append. Never edit past entries.
- The one allowed edit to a past entry is appending a `_Promoted to: /docs/<path>_` line once the learning has stabilized — cited 3+ times, or generalizes beyond one unit — and has been written up in `/docs`.
- To supersede or contradict a past learning, append a new entry that references the old anchor.

---

## read-state-first

_Discovered: 2026-04-27 by orchestrator in unit setup_

Every agent reads `.claude/state/decisions.md` and `.claude/state/learnings.md` before acting on a brief. Without this, agents redo investigations the rest of the workflow has already settled, miss explicit decisions about how to approach a class of problem, and rediscover the same gotchas the critic flagged last week. Reading state is the cheapest step in the loop and the highest-leverage; skip it and the rest of the loop wastes effort.
