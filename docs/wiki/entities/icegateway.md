---
type: entity
entity-type: tool
name: "@ice/gateway"
aliases: []
tags:
  - llm-wiki/entity
  - llm-wiki/entity/tool
source-count: 2
date-updated: 2026-04-19
cssclasses: []
---


# @ice/gateway

## Facts

- The main process sets up an Express gateway that starts on port 15173, serving as both a gateway and running all seven services.
- Express server used in both Gateway and Desktop apps

## Connections

- [[express]] *(uses)*
- [[in-memory-queue]] *(uses)*
- [[icedesktop]] *(uses)*

## Sources

- [[raw/desktop.md]]
- [[raw/architecture.md]]
