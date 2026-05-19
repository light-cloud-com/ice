# Desktop App

The Electron desktop app is a fully self-contained ICE: no separate server, no Docker, no external database. It embeds the gateway in the Electron main process and uses a local SQLite file for storage. The renderer loads the same bundle that `packages/web` produces.

## Status

- Works for daily dev.
- Build pipeline is wired (`pnpm dist:desktop`, `dist:desktop:mac`, `:win`, `:linux`).
- **v0.1 binaries are not yet code-signed or notarized.** First-run on macOS shows the standard "unidentified developer" prompt; Windows shows SmartScreen. See "First-run instructions" below.
- Auto-update is wired through `electron-updater` against GitHub Releases - will activate once signed binaries are published.

## First-run instructions for v0.1 (unsigned)

### macOS

1. Download the `.dmg` from the GitHub release.
2. Drag ICE to Applications.
3. The first time you double-click, macOS will refuse and say it can't verify the developer. **Right-click → Open** → confirm the dialog. After the first run macOS remembers the choice.
4. Alternative: System Settings → Privacy & Security → scroll to the "ICE was blocked" message → **Open Anyway**.

### Windows

1. Download the `.exe` installer from the GitHub release.
2. On first launch SmartScreen will show "Windows protected your PC". Click **More info → Run anyway**.
3. After that, Windows remembers the choice and launches normally.

### Linux

`.AppImage` and `.deb` builds are unsigned but Linux distros generally don't gate on that. If the AppImage refuses to launch, install `libfuse2` (`sudo apt install libfuse2` on Debian/Ubuntu).

## v0.2 code-signing plan

Targets for v0.2:

- **macOS**: Apple Developer ID Application certificate + notarytool submission. Removes the "unidentified developer" prompt and activates Gatekeeper trust on first launch.
- **Windows**: EV (Extended Validation) certificate from a recognized CA, signing both `.exe` and `.msi`. EV is what gets SmartScreen to trust the binary without the "more info" prompt.
- **Linux**: keep `.AppImage` + `.deb` as the primary distribution; explore `flathub` and Snap once usage justifies it.

Once those certs are in place, `electron-updater` activates and the in-app updater takes over - no more "go to GitHub Releases" step for end users.

Code-signing cost is part of the project's operational budget; the ROADMAP entry tracks the procurement timeline.

## Package layout

```
apps/desktop/
├── electron.vite.config.ts         electron-vite build config
├── electron-builder.yml            Packaging + publish config
├── src/
│   ├── main/
│   │   └── index.ts                Main process: windows, IPC, gateway startup
│   ├── preload/
│   │   └── index.ts                Preload bridge (contextIsolation)
│   └── ambient.d.ts                Module shims
├── resources/                      Icons, splash
├── scripts/                        Copy-prisma helper, etc.
└── package.json
```

## Architecture in one diagram

```mermaid
flowchart LR
    electron[Electron main<br/>Node.js runtime]
    gateway[@ice/gateway<br/>embedded Express]
    sqlite[(SQLite<br/>~/Library/Application Support/ICE/)]
    renderer[Renderer<br/>same bundle as web]
    webview((BrowserWindow))

    electron -->|dynamic import| gateway
    gateway --> sqlite
    electron --> webview
    webview --> renderer
    renderer -->|HTTP + WS via localhost| gateway
```

- Main process boots, dynamically imports `@ice/gateway`, which listens on `localhost:15173`.
- Main process creates a `BrowserWindow` that loads `http://localhost:15173/` (or the dev Vite server in `pnpm dev:desktop`).
- Renderer hits the gateway as if it were running in a browser. Same codebase as `packages/web`.
- All DB writes land in the local SQLite file under the platform's app-data directory.

## Security model

- `nodeIntegration: false` in all `BrowserWindow` instances.
- `contextIsolation: true`.
- `sandbox: true` where possible.
- Preload scripts expose a typed, deliberate IPC surface. No `remote`, no unrestricted `ipcMain` handlers.
- The renderer cannot import Node modules; everything it needs comes via HTTP to the embedded gateway.
- **We will not merge** any PR that weakens these defaults - see `../CONTRIBUTING.md`.

## Building

```bash
pnpm dev:desktop                     # dev loop, hot reload renderer
pnpm build:desktop                   # build main + preload + renderer
pnpm dist:desktop                    # produce distributable packages for current platform
pnpm dist:desktop:mac                # macOS .dmg + .zip (ARM64)
pnpm dist:desktop:win                # Windows NSIS installer
pnpm dist:desktop:linux              # AppImage + .deb
```

The `prebuild` script runs `@ice/gateway build` and `@ice/web build` and copies the Prisma client - all three are required because the distributable has to carry the gateway source, the web bundle, and the native Prisma bindings.

## Packaging configuration

`apps/desktop/electron-builder.yml` controls what ships:

- `dist/**/*` - main + preload bundle.
- `node_modules/.prisma/**/*` - Prisma engine + generated client.
- `resources/prisma-client` - copied Prisma runtime.
- `../../packages/web/dist` → packaged as `web-dist`.
- `resources/icons` → packaged as `icons`.

`.env` files are explicitly excluded (`!**/.env`, `!**/.env.*`).

Targets per platform:

- **macOS:** DMG + ZIP, ARM64 only today (Apple Silicon). x64 is easy to add when needed.
- **Windows:** NSIS installer, x64.
- **Linux:** AppImage (x64 + ARM64), Debian package (x64).

## Auto-update

`electron-updater` is configured to publish to `github.com/light-cloud-com/ice`. When a signed release is published, running desktop apps will fetch updates on startup. Until we sign, publishing is stubbed - follow the [roadmap](../ROADMAP.md) for signing milestones.

## SQLite file location

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/ICE/ice.db` |
| Windows | `%APPDATA%/ICE/ice.db` |
| Linux | `~/.config/ICE/ice.db` |

Delete the file to reset the app to first-run state.

## Known limitations

- No code signing yet (see status at the top).
- macOS binary is ARM64-only; Intel Mac support is a config flip away but not currently produced.
- The app ships a full Chromium bundle - expect ~150-200 MB installed size. There is no plan to move to a WebView-based alternative.
- Prisma's native binary is the largest single dependency in the bundle; stripping it is not trivial since we rely on Prisma's query engine.

## Entry points worth reading

- [`apps/desktop/src/main/index.ts`](../apps/desktop/src/main/index.ts) - window management, gateway startup, IPC.
- [`apps/desktop/src/preload/index.ts`](../apps/desktop/src/preload/index.ts) - preload bridge.
- [`apps/desktop/electron-builder.yml`](../apps/desktop/electron-builder.yml) - packaging rules.

## See also

- [architecture.md](architecture.md) - how the embedded gateway fits.
- [database.md](database.md) - the SQLite schema the desktop uses.
- [ROADMAP.md](../ROADMAP.md) - signing + notarization status.
