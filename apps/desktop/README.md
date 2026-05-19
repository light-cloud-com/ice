# @ice/desktop

The Electron wrapper. Embeds the full web app + backend gateway in a single binary for offline single-user use.

Where to start reading:

- `src/main/index.ts` — main process. Bootstraps local secrets, sets desktop env vars, copies the bundled Prisma client into `userData`, starts the embedded gateway, creates the main window, wires `electron-updater`.
- `src/preload/` — preload script bridging renderer ↔ main.
- `electron-builder.yml` — packaging config for `.dmg`, `.exe`, `.AppImage`, `.deb`.

Build a distributable: `pnpm --filter @ice/desktop dist`. Signed builds are on the v0.2 roadmap — for now the binaries are unsigned and you'll need to click through the OS warnings on first launch. See [docs/desktop.md](../../docs/desktop.md).
