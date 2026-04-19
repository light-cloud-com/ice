---
type: entity
entity-type: other
name: CanvasDeployment
aliases: []
tags:
  - llm-wiki/entity
  - llm-wiki/entity/other
source-count: 4
date-updated: 2026-04-19
cssclasses: []
---


# CanvasDeployment

## Facts

- Added index on card_id, status, created_at; Added user_id field with relation
- A canvas-only concept block that provides a downstream log viewer.
- Contains serialized canvas state and deployment results
- Deploy history record model
- Contains information about deployed resources and their state

## Connections

- [[userid]] *(part-of)*
- [[deployjob]] *(uses)*
- [[log-terminal]] *(part-of)*
- [[deployment-context-in-ai-prompt]] *(uses)*
- [[deployment-context]] *(part-of)*

## Sources

- [[raw/backlog/database.md]]
- [[raw/backlog/concepts-palette-implementation.md]]
- [[raw/backlog/ai-read-capabilities.md]]
- [[raw/database.md]]
