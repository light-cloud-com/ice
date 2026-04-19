---
type: entity
entity-type: tool
name: "@ice/desktop"
aliases: []
tags:
  - llm-wiki/entity
  - llm-wiki/entity/tool
source-count: 5
date-updated: 2026-04-19
cssclasses: []
---


# @ice/desktop

## Facts

- A tool for developing the ICE desktop app, which now embeds the full web app + backend inside Electron.
- Auto-starts flash-moe on boot, stops on shutdown.
- Used in the full Electron desktop app setup.
- The ICE desktop app is an Electron application that embeds the entire web app + backend — same code, zero duplication.
- Desktop Electron app running the same code as @ice/web

## Connections

- [[ice]] *(part-of)*
- [[icegateway]] *(uses)*
- [[sqlite]] *(uses)*
- [[electron-store]] *(related-to)*
- [[electron-toolkitutils]] *(related-to)*
- [[iceui]] *(part-of)*

## Sources

- [[raw/backlog/desktop-app.md]]
- [[raw/backlog/ai-native-features.md]]
- [[raw/development.md]]
- [[raw/desktop.md]]
- [[raw/architecture.md]]
