# @ice/ui

The React app: canvas, palette, properties panel, deploy panel, cost panel, AI chat, onboarding, tour. Built on Vite + Tailwind + Radix UI + Redux Toolkit.

Where to start reading:

- `src/features/canvas/` — the SVG canvas, nodes, edges, interactions.
- `src/features/palette/` — block palette, concept browser.
- `src/features/deploy/` — plan/apply UI, live progress, environment switcher.
- `src/features/onboarding/` and `src/features/tour/` — first-run flow.
- `src/store/slices/` — Redux state. `cards-slice.ts` is the canvas of record.
- `src/shared/` — design tokens, common UI primitives, API adapter.

Component conventions are documented in [docs/frontend.md](../../docs/frontend.md).
