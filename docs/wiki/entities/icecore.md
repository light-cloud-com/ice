---
type: entity
entity-type: tool
name: "@ice/core"
aliases: []
tags:
  - llm-wiki/entity
  - llm-wiki/entity/tool
source-count: 3
date-updated: 2026-04-19
cssclasses: []
---


# @ice/core

## Facts

- Contains the mapping layer that translates user intents to technical config at deploy time
- The core engine is the computational heart of ICE. It handles graph processing, infrastructure diffing, deploy orchestration, and multi-cloud resource importing.
- Engine component that provides shared functionality

## Connections

- [[option-b-intent-to-config-mapping-layer]] *(created-by)*
- [[mutablegraph]] *(uses)*
- [[plan-engine]] *(uses)*
- [[diff]] *(part-of)*
- [[apply-engine]] *(uses)*
- [[iceblocks]] *(part-of)*
- [[icetemplates]] *(part-of)*
- [[ice]] *(uses)*

## Sources

- [[raw/backlog/user-friendly-properties.md]]
- [[raw/core-engine.md]]
- [[raw/architecture.md]]
