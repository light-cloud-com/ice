# @ice/gateway

The single Express process that composes every backend service into one HTTP + Socket.IO API. Embedded inside the desktop Electron app in production; runs standalone in dev.

Where to start reading:

- `src/index.ts` — service composition. Calls `ensureLocalSecrets()` first (auto-bootstraps `JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY`), then mounts the AI / Canvas / Credentials / Deploy / Engine / IAM routers, then starts the Socket.IO server and background workers (deploy queue, cron jobs, requirement poller).
- `src/__tests__/index.test.ts` — module-shape and lifecycle tests with all dependencies mocked.

Run locally: `pnpm dev:gateway`. Default port `5001` (or `15173` in desktop mode via `dev:all`).
