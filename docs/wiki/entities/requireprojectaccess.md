---
type: entity
entity-type: tool
name: requireProjectAccess
aliases: []
tags:
  - llm-wiki/entity
  - llm-wiki/entity/tool
source-count: 2
date-updated: 2026-04-19
cssclasses: []
---


# requireProjectAccess

## Facts

- Middleware reads `projectId`/`cardId` from multiple sources
- Added to multiple API routes to enforce role-based access control

## Connections

- [[post-deployplan]] *(applies-to)*
- [[post-deployapply]] *(applies-to)*
- [[post-deploydestroy]] *(applies-to)*
- [[post-pipelinerules]] *(applies-to)*
- [[put-pipelinerulesruleid]] *(applies-to)*
- [[delete-pipelinerulesruleid]] *(applies-to)*
- [[rbac]] *(uses)*

## Sources

- [[raw/backlog/security.md]]
- [[raw/backlog/rbac.md]]
