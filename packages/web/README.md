# @ice/web

The web shell that mounts `@ice/ui` into a real browser. Owns Vite config, global styles, design tokens, route entry.

Where to start reading:

- `index.html` and `src/main.tsx` — entry points.
- `src/styles/globals.css` — design tokens (`--ice-*` CSS vars) and theme classes.
- `vite.config.ts` — bundler config, dev proxy to the gateway.

Run locally: `pnpm dev:web` (port 5174 by default). The dev server proxies `/api/*` and `/socket.io/*` to the gateway running on the configured port.
