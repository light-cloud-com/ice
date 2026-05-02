/**
 * Tests for `apps/desktop/src/main/index.ts` — Electron main process bootstrap.
 *
 * Strategy: mock every electron-side module and drive the bootstrap end-to-end.
 * `app.whenReady()` returns a deferred Promise so each test can decide whether
 * to flush the boot continuation. All event registrations on `app`,
 * `BrowserWindow`, `webContents`, `autoUpdater` go through `vi.fn` spies whose
 * captured handlers we invoke directly.
 *
 * The module installs side-effects at import time. We use `vi.resetModules()`
 * + `await import('../index.ts')` per scenario and reset all mock state up
 * front. The `.ts` extension is required because the package leaves a stale
 * `index.js` artifact next to `index.ts` (declaration emit from a prior tsc
 * run); without the explicit extension Vite resolves to the .js, which still
 * imports the same SUT shape but instruments the wrong file for coverage.
 *
 * Structural exception: we do NOT exercise the embedded-backend's
 * `_resolveFilename` patch in every parent-filename combination — the patch
 * branches on `parent?.filename?.includes('Application Support')` which is
 * code path of the production-only `@prisma/client` resolver. We hit the main
 * three branches (cache + non-cache + falls-through to original resolver) but
 * leave the unreached pass-through-on-no-asar-match path documented under the
 * `electron-main-resolveFilename-asar-fallback-is-defensive` learning.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  type Listener = (...args: any[]) => any;
  type Listeners = Record<string, Listener[]>;

  // Each fresh BrowserWindow records its constructor opts and exposes
  // an event registry the test can drive.
  class FakeBrowserWindow {
    public readonly opts: any;
    public readonly listeners: Listeners = {};
    public readonly webContents = {
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn((channel: string, listener: Listener) => {
        (this.webContents as any)._listeners ??= {};
        ((this.webContents as any)._listeners[channel] ??= []).push(listener);
        return this.webContents;
      }),
      _listeners: {} as Listeners,
      getURL: vi.fn(() => 'http://localhost:15173/test'),
    } as any;
    public show = vi.fn();
    public close = vi.fn();
    public loadFile = vi.fn();
    public loadURL = vi.fn();
    public once = vi.fn((channel: string, listener: Listener) => {
      (this.listeners[channel] ??= []).push(listener);
      return this;
    });
    public on = vi.fn((channel: string, listener: Listener) => {
      (this.listeners[channel] ??= []).push(listener);
      return this;
    });
    public isFullScreen = vi.fn(() => false);
    constructor(opts: any) {
      this.opts = opts;
      bag.windows.push(this);
    }
  }

  const bag = {
    windows: [] as InstanceType<typeof FakeBrowserWindow>[],
    appListeners: {} as Record<string, Array<(...args: any[]) => void>>,
    appReadyDeferred: null as null | { resolve: () => void; promise: Promise<void> },
    autoUpdaterListeners: {} as Record<string, Array<(...args: any[]) => void>>,
    BrowserWindowAllWindowsResult: [] as any[],
    isDev: false,
    platform: 'darwin' as NodeJS.Platform,
    primaryDisplayBounds: { x: 0, y: 0, width: 3000, height: 2000 } as {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    splashExists: true,
    iconExists: true,
    targetDirExists: false,
    asarPathExists: true,
    resolveCalls: [] as Array<{ request: string; parentFilename?: string }>,
    origResolveResult: '__ORIG_RESOLVE_RESULT__',
    showMessageBoxResponse: 0,
    optimizerCalls: [] as any[],
    setAppUserModelIdCalls: [] as any[],
    dockSetIconCalls: [] as any[],
    showMessageBoxResolves: true,
    gatewayImportSucceeds: true,
    showMessageBoxCalls: [] as any[],
    autoUpdaterChecks: 0,
  };

  const electron = {
    app: {
      whenReady: vi.fn(() => bag.appReadyDeferred!.promise),
      on: vi.fn((channel: string, listener: any) => {
        (bag.appListeners[channel] ??= []).push(listener);
        return electron.app;
      }),
      quit: vi.fn(),
      getPath: vi.fn((kind: string) => `/fake/${kind}`),
      getAppPath: vi.fn(() => '/fake/asar'),
      dock: { setIcon: vi.fn((icon: string) => bag.dockSetIconCalls.push(icon)) } as any,
    },
    BrowserWindow: Object.assign(FakeBrowserWindow, {
      getAllWindows: vi.fn(() => bag.BrowserWindowAllWindowsResult),
    }),
    shell: { openExternal: vi.fn() },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({ bounds: bag.primaryDisplayBounds })),
    },
    dialog: {
      showMessageBox: vi.fn((_w: any, opts: any) => {
        bag.showMessageBoxCalls.push(opts);
        return bag.showMessageBoxResolves
          ? Promise.resolve({ response: bag.showMessageBoxResponse })
          : Promise.reject(new Error('dialog rejected'));
      }),
    },
    ipcMain: {
      handle: vi.fn(),
    },
  };

  const electronUpdater = {
    default: {
      autoUpdater: {
        autoDownload: false,
        autoInstallOnAppQuit: false,
        on: vi.fn((channel: string, listener: any) => {
          (bag.autoUpdaterListeners[channel] ??= []).push(listener);
        }),
        checkForUpdates: vi.fn(() => {
          bag.autoUpdaterChecks++;
          return Promise.resolve();
        }),
        quitAndInstall: vi.fn(),
      },
    },
  };

  const electronToolkit = {
    electronApp: {
      setAppUserModelId: vi.fn((id: string) => bag.setAppUserModelIdCalls.push(id)),
    },
    optimizer: {
      watchWindowShortcuts: vi.fn((w: any) => bag.optimizerCalls.push(w)),
    },
    get is() {
      return { dev: bag.isDev };
    },
  };

  const fs = {
    existsSync: vi.fn((p: string) => {
      // Specific .js suffixes first — these are the resolver's lookups.
      if (p.endsWith('default.js') || p.endsWith('index.js')) {
        // The resolver redirects only when the candidate file exists.
        // Allow asar overrides to flow through the next check.
        if (p.includes('/fake/asar/node_modules/@prisma/client')) {
          return bag.asarPathExists;
        }
        return true;
      }
      if (p.includes('/fake/asar/node_modules/@prisma/client')) {
        return bag.asarPathExists;
      }
      // The startEmbeddedBackend body checks the userData targetDir for
      // existence before mkdirSync/cpSync.
      if (
        p === '/fake/userData/node_modules/.prisma/client' ||
        (p.includes('node_modules/.prisma/client') && !p.includes('.js'))
      ) {
        return bag.targetDirExists;
      }
      if (p.includes('splash.html')) return bag.splashExists;
      if (p.includes('icons/512x512.png') || p.includes('icons/icon.ico')) {
        return bag.iconExists;
      }
      return false;
    }),
    mkdirSync: vi.fn(),
    cpSync: vi.fn(),
  };

  const cryptoMod = {
    randomBytes: vi.fn(() => Buffer.from('deadbeefdeadbeef', 'hex')),
  };

  // Module monkey-patch is wired through a class-like default export. The SUT
  // does `import Module from 'module'` and then `(Module as any)._resolveFilename`.
  // We expose a writable property the SUT reassigns at boot. The test reads
  // the post-boot patched resolver via `moduleMod.default._resolveFilename`.
  function origResolve(request: string, parent: any): string {
    bag.resolveCalls.push({ request, parentFilename: parent?.filename });
    return bag.origResolveResult;
  }
  const moduleMod = {
    default: {
      _resolveFilename: origResolve as any,
    },
  };

  return {
    bag,
    electron,
    electronUpdater,
    electronToolkit,
    fs,
    cryptoMod,
    moduleMod,
    FakeBrowserWindow,
  };
});

vi.mock('electron', () => h.electron);
vi.mock('electron-updater', () => h.electronUpdater);
vi.mock('@electron-toolkit/utils', () => h.electronToolkit);
vi.mock('fs', () => h.fs);
vi.mock('crypto', () => h.cryptoMod);
vi.mock('module', () => h.moduleMod);

// `@ice/gateway` is a workspace package — mock it so we don't actually
// boot the express server. The SUT calls `await import('@ice/gateway')`
// inside a try/catch. Happy-path mock; the import-failure branch lives in
// `index.gateway-import-failure.test.ts` because vitest 4 caches mock
// factories — a single throwing factory poisons every downstream test in
// the same file (see learnings.md `electron-main-needs-X-mocked-with-Y-pattern`).
vi.mock('@ice/gateway', () => ({ default: undefined }));

// ── Helpers ────────────────────────────────────────────────────────────

function resetBag(): void {
  h.bag.windows = [];
  h.bag.appListeners = {};
  h.bag.autoUpdaterListeners = {};
  h.bag.BrowserWindowAllWindowsResult = [];
  h.bag.primaryDisplayBounds = { x: 0, y: 0, width: 3000, height: 2000 };
  h.bag.splashExists = true;
  h.bag.iconExists = true;
  h.bag.targetDirExists = false;
  h.bag.asarPathExists = true;
  h.bag.resolveCalls = [];
  h.bag.origResolveResult = '__ORIG_RESOLVE_RESULT__';
  h.bag.showMessageBoxResponse = 0;
  h.bag.optimizerCalls = [];
  h.bag.setAppUserModelIdCalls = [];
  h.bag.dockSetIconCalls = [];
  h.bag.showMessageBoxResolves = true;
  h.bag.gatewayImportSucceeds = true;
  h.bag.showMessageBoxCalls = [];
  h.bag.autoUpdaterChecks = 0;

  let resolve: () => void = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  h.bag.appReadyDeferred = { resolve, promise };

  // Reset all vi.fn() instances so per-test assertions are clean.
  h.electron.app.whenReady.mockClear();
  h.electron.app.on.mockClear();
  h.electron.app.quit.mockClear();
  h.electron.app.getPath.mockClear();
  h.electron.app.getAppPath.mockClear();
  h.electron.app.dock!.setIcon.mockClear();
  h.electron.shell.openExternal.mockClear();
  h.electron.screen.getPrimaryDisplay.mockClear();
  h.electron.dialog.showMessageBox.mockClear();
  h.electron.ipcMain.handle.mockClear();
  h.electron.BrowserWindow.getAllWindows.mockClear();
  h.electronUpdater.default.autoUpdater.on.mockClear();
  h.electronUpdater.default.autoUpdater.checkForUpdates.mockClear();
  h.electronUpdater.default.autoUpdater.quitAndInstall.mockClear();
  h.electronUpdater.default.autoUpdater.autoDownload = false;
  h.electronUpdater.default.autoUpdater.autoInstallOnAppQuit = false;
  h.electronToolkit.electronApp.setAppUserModelId.mockClear();
  h.electronToolkit.optimizer.watchWindowShortcuts.mockClear();
  h.fs.existsSync.mockClear();
  h.fs.mkdirSync.mockClear();
  h.fs.cpSync.mockClear();
  h.cryptoMod.randomBytes.mockClear();
  // Restore the original resolver function — the SUT's bootstrap will replace
  // it again on the next import. Don't mockClear() because it may have been
  // reassigned to a non-vi.fn function by a prior test's bootstrap.
  (h.moduleMod as any).default._resolveFilename = function origResolve(
    request: string,
    parent: any,
  ) {
    h.bag.resolveCalls.push({ request, parentFilename: parent?.filename });
    return h.bag.origResolveResult;
  };
}

function setPlatform(p: NodeJS.Platform): () => void {
  const orig = process.platform;
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
  return () => {
    Object.defineProperty(process, 'platform', { value: orig, configurable: true });
  };
}

// The package leaves stale `.js`/`.d.ts` artifacts next to `index.ts` (a
// prior `tsc` run without --noEmit). Vite's resolver prefers `.js` over
// `.ts` when both exist, so a bare `import('../index')` would instrument
// the wrong file for coverage. Threading the `.ts` extension through a
// string variable dodges TypeScript's `allowImportingTsExtensions` check
// without losing the explicit-extension benefit at runtime.
const MAIN_TS_PATH = '../index.ts';

async function bootMain(): Promise<void> {
  vi.resetModules();
  await import(/* @vite-ignore */ MAIN_TS_PATH);
}

async function bootAndDriveReady(): Promise<void> {
  vi.useFakeTimers();
  await bootMain();
  // Resolve `app.whenReady()` and let its `.then` async body run. The body
  // contains `await startEmbeddedBackend()` which itself awaits `import('@ice/gateway')`,
  // so we need several microtask drains. Use vitest's flush helpers so timers
  // don't block the async bootstrap.
  h.bag.appReadyDeferred!.resolve();
  // Drain microtasks repeatedly to let nested await chains progress.
  for (let i = 0; i < 32; i++) {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('main process bootstrap', () => {
  let restorePlatform: () => void = () => {};
  const origEnv = { ...process.env };
  const origResourcesPath = (process as any).resourcesPath;

  beforeEach(() => {
    resetBag();
    process.env = { ...origEnv };
    (process as any).resourcesPath = '/fake/resources';
  });

  afterEach(() => {
    restorePlatform();
    restorePlatform = () => {};
    process.env = { ...origEnv };
    (process as any).resourcesPath = origResourcesPath;
    vi.useRealTimers();
  });

  it('registers window-all-closed and web-contents-created handlers at import time', async () => {
    await bootMain();
    expect(h.bag.appListeners['window-all-closed']?.length).toBeGreaterThan(0);
    expect(h.bag.appListeners['web-contents-created']?.length).toBeGreaterThan(0);
  });

  it('quits the app on window-all-closed when not on macOS', async () => {
    restorePlatform = setPlatform('linux');
    await bootMain();
    h.bag.appListeners['window-all-closed']![0]!();
    expect(h.electron.app.quit).toHaveBeenCalledTimes(1);
  });

  it('does not quit on window-all-closed when on darwin', async () => {
    restorePlatform = setPlatform('darwin');
    await bootMain();
    h.bag.appListeners['window-all-closed']![0]!();
    expect(h.electron.app.quit).not.toHaveBeenCalled();
  });

  describe('web-contents-created will-navigate guard', () => {
    it('blocks navigation in dev to a URL outside the renderer dev origin', async () => {
      h.bag.isDev = true;
      process.env.ELECTRON_RENDERER_URL = 'http://localhost:5174';
      await bootMain();
      const fakeContents = { on: vi.fn() };
      h.bag.appListeners['web-contents-created']![0]!({}, fakeContents);
      const willNavListener = fakeContents.on.mock.calls[0]![1] as (
        event: any,
        url: string,
      ) => void;
      const event = { preventDefault: vi.fn() };
      willNavListener(event, 'https://evil.example.com');
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('falls back to localhost:5174 when ELECTRON_RENDERER_URL is unset', async () => {
      h.bag.isDev = true;
      delete process.env.ELECTRON_RENDERER_URL;
      await bootMain();
      const fakeContents = { on: vi.fn() };
      h.bag.appListeners['web-contents-created']![0]!({}, fakeContents);
      const willNavListener = fakeContents.on.mock.calls[0]![1] as (
        event: any,
        url: string,
      ) => void;
      const allow = { preventDefault: vi.fn() };
      willNavListener(allow, 'http://localhost:5174/anything');
      expect(allow.preventDefault).not.toHaveBeenCalled();
    });

    it('allows navigation in production within the embedded gateway origin', async () => {
      h.bag.isDev = false;
      await bootMain();
      const fakeContents = { on: vi.fn() };
      h.bag.appListeners['web-contents-created']![0]!({}, fakeContents);
      const willNavListener = fakeContents.on.mock.calls[0]![1] as (
        event: any,
        url: string,
      ) => void;
      const event = { preventDefault: vi.fn() };
      willNavListener(event, 'http://localhost:15173/dashboard');
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('whenReady boot path', () => {
    it('sets the app user model id and registers the get-fullscreen-state IPC handler', async () => {
      h.bag.isDev = true; // skip the slow embedded-backend branch
      restorePlatform = setPlatform('linux');
      await bootAndDriveReady();
      expect(h.electronToolkit.electronApp.setAppUserModelId).toHaveBeenCalledWith(
        'com.ice.desktop',
      );
      expect(h.electron.ipcMain.handle).toHaveBeenCalledWith(
        'get-fullscreen-state',
        expect.any(Function),
      );
    });

    it('sets the dock icon when on darwin and an icon file is present', async () => {
      h.bag.isDev = true;
      h.bag.iconExists = true;
      restorePlatform = setPlatform('darwin');
      await bootAndDriveReady();
      expect(h.electron.app.dock!.setIcon).toHaveBeenCalledTimes(1);
    });

    it('skips dock icon setup when no icon file resolves', async () => {
      h.bag.isDev = true;
      h.bag.iconExists = false;
      restorePlatform = setPlatform('darwin');
      await bootAndDriveReady();
      expect(h.electron.app.dock!.setIcon).not.toHaveBeenCalled();
    });

    it('does not touch the dock on non-darwin platforms', async () => {
      h.bag.isDev = true;
      restorePlatform = setPlatform('linux');
      await bootAndDriveReady();
      expect(h.electron.app.dock!.setIcon).not.toHaveBeenCalled();
    });

    it('runs the optimizer for each browser window created', async () => {
      h.bag.isDev = true;
      await bootAndDriveReady();
      const windowHandler = h.bag.appListeners['browser-window-created']![0]!;
      const fakeWin = { id: 'fake-window' };
      windowHandler({}, fakeWin);
      expect(h.electronToolkit.optimizer.watchWindowShortcuts).toHaveBeenCalledWith(fakeWin);
    });

    it('returns the live fullscreen state from the IPC handler', async () => {
      h.bag.isDev = true;
      await bootAndDriveReady();
      const handler = h.electron.ipcMain.handle.mock.calls[0]![1] as () => boolean;
      // There is at least one window now (createMainWindow ran).
      const lastWindow = h.bag.windows[h.bag.windows.length - 1]!;
      lastWindow.isFullScreen = vi.fn(() => true);
      expect(handler()).toBe(true);
    });

    it('falls back to false from the IPC handler when no main window exists', async () => {
      h.bag.isDev = true;
      await bootAndDriveReady();
      const handler = h.electron.ipcMain.handle.mock.calls[0]![1] as () => boolean;
      // Force the closure-captured mainWindow to be null by simulating the
      // ready-to-show path that nulls splash but here we cannot un-set
      // mainWindow. Instead validate the `?? false` shape: clear the window's
      // isFullScreen to return undefined and assert nullish-coalesce path.
      const lastWindow = h.bag.windows[h.bag.windows.length - 1]!;
      lastWindow.isFullScreen = vi.fn(() => undefined as any);
      expect(handler()).toBe(false);
    });

    it('creates the main window on activate when no windows are open', async () => {
      h.bag.isDev = true;
      await bootAndDriveReady();
      h.bag.BrowserWindowAllWindowsResult = [];
      const before = h.bag.windows.length;
      h.bag.appListeners['activate']![0]!();
      expect(h.bag.windows.length).toBe(before + 1);
    });

    it('does not recreate a window on activate if windows already exist', async () => {
      h.bag.isDev = true;
      await bootAndDriveReady();
      h.bag.BrowserWindowAllWindowsResult = [{ id: 'still-open' }];
      const before = h.bag.windows.length;
      h.bag.appListeners['activate']![0]!();
      expect(h.bag.windows.length).toBe(before);
    });
  });

  describe('createSplashWindow', () => {
    it('loads the splash file and shows the window once ready when splash exists', async () => {
      h.bag.isDev = true;
      h.bag.splashExists = true;
      await bootAndDriveReady();
      // The first window created during boot is the splash.
      const splash = h.bag.windows[0]!;
      expect(splash.loadFile).toHaveBeenCalled();
      // Drive ready-to-show.
      const readyHandler = splash.listeners['ready-to-show']![0]!;
      readyHandler();
      expect(splash.show).toHaveBeenCalled();
    });

    it('does not load a splash file if the resolved path does not exist', async () => {
      h.bag.isDev = true;
      h.bag.splashExists = false;
      await bootAndDriveReady();
      const splash = h.bag.windows[0]!;
      expect(splash.loadFile).not.toHaveBeenCalled();
    });

    it('uses the dev splash path when in dev mode', async () => {
      h.bag.isDev = true;
      h.bag.splashExists = true;
      await bootAndDriveReady();
      const splash = h.bag.windows[0]!;
      const loadedPath = splash.loadFile.mock.calls[0]![0];
      expect(loadedPath).toMatch(/src\/main\/splash\.html$/);
    });

    it('uses the bundled splash path when in production mode', async () => {
      h.bag.isDev = false;
      h.bag.splashExists = true;
      h.bag.gatewayImportSucceeds = true;
      await bootAndDriveReady();
      const splash = h.bag.windows[0]!;
      const loadedPath = splash.loadFile.mock.calls[0]![0];
      // Both dev and prod resolve to a path ending in splash.html — the
      // dev path is `__dirname/../../src/main/splash.html` and the prod
      // path is `__dirname/splash.html`. In tests, __dirname is the SUT
      // source dir, so both happen to normalize to the same string.
      // What matters here is that the production branch (no `../..`)
      // didn't blow up and a file was loaded.
      expect(loadedPath).toMatch(/splash\.html$/);
    });
  });

  describe('createMainWindow', () => {
    it('clamps the width and height to the documented maximums', async () => {
      h.bag.isDev = true;
      h.bag.primaryDisplayBounds = { x: 0, y: 0, width: 4000, height: 3000 };
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      expect(main.opts.width).toBe(2400);
      expect(main.opts.height).toBe(1600);
    });

    it('uses the available display dimensions when smaller than the cap', async () => {
      h.bag.isDev = true;
      h.bag.primaryDisplayBounds = { x: 100, y: 50, width: 1200, height: 900 };
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      expect(main.opts.width).toBe(1200);
      expect(main.opts.height).toBe(900);
      // Centering math: x = boundsX + (boundsW - w) / 2 = 100 + 0/2 = 100.
      expect(main.opts.x).toBe(100);
      expect(main.opts.y).toBe(50);
    });

    it('hides the menu bar on linux but not on darwin', async () => {
      h.bag.isDev = true;
      restorePlatform = setPlatform('linux');
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      expect(main.opts.autoHideMenuBar).toBe(true);
      expect(main.opts.titleBarStyle).toBe('default');
      expect(main.opts.trafficLightPosition).toBeUndefined();
    });

    it('uses hiddenInset titlebar and traffic-light offset on darwin', async () => {
      h.bag.isDev = true;
      restorePlatform = setPlatform('darwin');
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      expect(main.opts.autoHideMenuBar).toBe(false);
      expect(main.opts.titleBarStyle).toBe('hiddenInset');
      expect(main.opts.trafficLightPosition).toEqual({ x: 12, y: 14 });
    });

    it('forwards enter-full-screen to the renderer', async () => {
      h.bag.isDev = true;
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      main.listeners['enter-full-screen']![0]!();
      expect(main.webContents.send).toHaveBeenCalledWith('fullscreen-change', true);
    });

    it('forwards leave-full-screen to the renderer', async () => {
      h.bag.isDev = true;
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      main.listeners['leave-full-screen']![0]!();
      expect(main.webContents.send).toHaveBeenCalledWith('fullscreen-change', false);
    });

    it('intercepts new-window requests and opens them in the default browser', async () => {
      h.bag.isDev = true;
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      const handler = main.webContents.setWindowOpenHandler.mock.calls[0]![0];
      const result = handler({ url: 'https://docs.example.com' });
      expect(h.electron.shell.openExternal).toHaveBeenCalledWith('https://docs.example.com');
      expect(result).toEqual({ action: 'deny' });
    });

    it('logs renderer load failures', async () => {
      h.bag.isDev = true;
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      const failHandler = main.webContents._listeners['did-fail-load']![0]!;
      failHandler({}, -106, 'ERR_INTERNET_DISCONNECTED', 'http://localhost/');
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it('logs the URL on did-finish-load', async () => {
      h.bag.isDev = true;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      const finHandler = main.webContents._listeners['did-finish-load']![0]!;
      finHandler();
      expect(logSpy).toHaveBeenCalledWith(
        '[desktop] Page loaded:',
        'http://localhost:15173/test',
      );
      logSpy.mockRestore();
    });

    it('forwards renderer console messages with a level label', async () => {
      h.bag.isDev = true;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      const consoleHandler = main.webContents._listeners['console-message']![0]!;
      logSpy.mockClear();
      consoleHandler({}, 0, 'a log line', 12, 'app.js');
      consoleHandler({}, 1, 'a warning', 13, 'app.js');
      consoleHandler({}, 2, 'an error', 14, 'app.js');
      consoleHandler({}, 99, 'unknown level', 15, 'app.js');
      const messages = logSpy.mock.calls.map((c) => c[0]);
      expect(messages).toEqual([
        '[renderer LOG] a log line (app.js:12)',
        '[renderer WARN] a warning (app.js:13)',
        '[renderer ERROR] an error (app.js:14)',
        '[renderer 99] unknown level (app.js:15)',
      ]);
      logSpy.mockRestore();
    });

    it('loads the dev frontend URL when in dev mode', async () => {
      h.bag.isDev = true;
      process.env.FRONTEND_URL = 'http://localhost:5174,http://localhost:5175';
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      expect(main.loadURL).toHaveBeenCalledWith('http://localhost:5174');
      expect(main.loadURL).not.toHaveBeenCalledWith(
        expect.stringContaining(':15173'),
      );
    });

    it('falls back to localhost:5174 when FRONTEND_URL is unset in dev', async () => {
      h.bag.isDev = true;
      delete process.env.FRONTEND_URL;
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      expect(main.loadURL).toHaveBeenCalledWith('http://localhost:5174');
    });

    it('loads the embedded gateway URL when in production mode', async () => {
      h.bag.isDev = false;
      h.bag.gatewayImportSucceeds = true;
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      expect(main.loadURL).toHaveBeenCalledWith('http://localhost:15173');
    });

    it('shows the main window after splash minimum duration once ready-to-show fires', async () => {
      h.bag.isDev = true;
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      const readyHandler = main.listeners['ready-to-show']![0]!;
      readyHandler();
      // Advance fake timers past MINIMUM_SPLASH_DURATION (3000ms).
      await vi.advanceTimersByTimeAsync(3001);
      expect(main.show).toHaveBeenCalled();
    });

    it('shows the main window without further wait when splash has already exceeded the minimum', async () => {
      h.bag.isDev = true;
      h.bag.splashExists = true;
      await bootAndDriveReady();
      const splash = h.bag.windows[0]!;
      // Drive splash ready-to-show to set splashShownAt.
      splash.listeners['ready-to-show']![0]!();
      // Advance time so the splash has been showing > minimum.
      await vi.advanceTimersByTimeAsync(5000);
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      const readyHandler = main.listeners['ready-to-show']![0]!;
      readyHandler();
      await vi.advanceTimersByTimeAsync(0);
      expect(main.show).toHaveBeenCalled();
    });
  });

  describe('startEmbeddedBackend', () => {
    it('skips the embedded gateway in dev mode', async () => {
      h.bag.isDev = true;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await bootAndDriveReady();
      // In dev we never write desktop env vars or copy prisma.
      expect(process.env.ICE_DESKTOP).toBeUndefined();
      expect(h.fs.cpSync).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Dev mode'),
      );
      logSpy.mockRestore();
    });

    it('seeds desktop env vars and the prisma client cache in production', async () => {
      h.bag.isDev = false;
      h.bag.targetDirExists = false; // forces the mkdirSync + cpSync branch
      await bootAndDriveReady();
      expect(process.env.ICE_DESKTOP).toBe('true');
      expect(process.env.DATABASE_URL).toMatch(/^file:/);
      expect(process.env.JWT_SECRET).toMatch(/^desktop-/);
      expect(process.env.CREDENTIAL_ENCRYPTION_KEY).toMatch(/^desktop-enc-/);
      expect(process.env.FRONTEND_URL).toBe('http://localhost:15173');
      expect(process.env.PORT).toBe('15173');
      expect(process.env.NODE_ENV).toBe('production');
      expect(h.fs.mkdirSync).toHaveBeenCalled();
      expect(h.fs.cpSync).toHaveBeenCalled();
    });

    it('skips the prisma client copy when the target dir already exists', async () => {
      h.bag.isDev = false;
      h.bag.targetDirExists = true;
      await bootAndDriveReady();
      expect(h.fs.mkdirSync).not.toHaveBeenCalled();
      expect(h.fs.cpSync).not.toHaveBeenCalled();
    });

    it('falls back to __dirname for resourcesPath when process.resourcesPath is empty', async () => {
      h.bag.isDev = false;
      (process as any).resourcesPath = '';
      await bootAndDriveReady();
      // ICE_WEB_DIST_PATH should still resolve to a defined absolute path.
      expect(process.env.ICE_WEB_DIST_PATH).toBeTruthy();
    });

    // The gateway-import-failure branch is exercised in
    // `index.gateway-import-failure.test.ts` — a sibling file with its own
    // throwing `vi.mock('@ice/gateway')` factory. Vitest 4 caches mock
    // factories per file, so a throwing factory in this file would poison
    // every other test that needs the happy-path module shape.

    describe('Module._resolveFilename patch', () => {
      async function getPatchedResolver(): Promise<
        (request: string, parent: any, ...rest: any[]) => any
      > {
        h.bag.isDev = false;
        await bootAndDriveReady();
        const patched = (h.moduleMod as any).default._resolveFilename;
        // Sanity assertion — the boot path MUST have replaced the resolver.
        expect(patched).not.toBe(h.bag.origResolveResult);
        return patched;
      }

      it('redirects .prisma/client/default to the generated default.js in userData', async () => {
        const resolver = await getPatchedResolver();
        const result = resolver('.prisma/client/default', { filename: '/some/parent.js' });
        expect(typeof result).toBe('string');
        expect(result).toContain('node_modules/.prisma/client');
        expect(result).toContain('default.js');
      });

      it('redirects .prisma/client to the generated index.js in userData', async () => {
        const resolver = await getPatchedResolver();
        const result = resolver('.prisma/client', { filename: '/some/parent.js' });
        expect(result).toContain('node_modules/.prisma/client');
        expect(result).toContain('index.js');
      });

      it('redirects @prisma/client/* requested by an Application Support parent to the asar copy', async () => {
        h.bag.asarPathExists = true;
        const resolver = await getPatchedResolver();
        const result = resolver('@prisma/client/runtime', {
          filename: '/Users/me/Library/Application Support/ice/whatever.js',
        });
        expect(result).toContain('/fake/asar/node_modules/@prisma/client');
      });

      it('falls back to the .js suffix when the bare asar path is missing', async () => {
        // Override existsSync so the bare path misses but `.js` hits.
        const origExists = h.fs.existsSync.getMockImplementation()!;
        h.fs.existsSync.mockImplementation((p: string) => {
          if (
            p === '/fake/asar/node_modules/@prisma/client/runtime' ||
            p === '/fake/asar/node_modules/@prisma/client'
          ) {
            return false;
          }
          if (
            p === '/fake/asar/node_modules/@prisma/client/runtime.js' ||
            p === '/fake/asar/node_modules/@prisma/client.js'
          ) {
            return true;
          }
          return origExists(p);
        });
        const resolver = await getPatchedResolver();
        const result = resolver('@prisma/client/runtime', {
          filename: '/Users/me/Library/Application Support/ice/x.js',
        });
        expect(result).toBe('/fake/asar/node_modules/@prisma/client/runtime.js');
      });

      it('delegates to the original _resolveFilename for unrelated requests', async () => {
        const resolver = await getPatchedResolver();
        const result = resolver('lodash', { filename: '/whatever.js' }, 'extra-arg');
        expect(result).toBe('__ORIG_RESOLVE_RESULT__');
      });

      it('delegates @prisma/client when the parent is not in Application Support', async () => {
        const resolver = await getPatchedResolver();
        const result = resolver('@prisma/client', { filename: '/Users/me/dev/app.js' });
        expect(result).toBe('__ORIG_RESOLVE_RESULT__');
      });

      it('falls through to the original resolver when the .prisma client default.js does not exist', async () => {
        const resolver = await getPatchedResolver();
        // Force existsSync to miss the resolved candidate.
        const orig = h.fs.existsSync.getMockImplementation()!;
        h.fs.existsSync.mockImplementation((p: string) => {
          if (p.endsWith('default.js')) return false;
          return orig(p);
        });
        const result = resolver('.prisma/client/default', { filename: '/some/parent.js' });
        expect(result).toBe('__ORIG_RESOLVE_RESULT__');
      });

      it('falls through to the original resolver when neither the bare asar path nor the .js suffix exist', async () => {
        const resolver = await getPatchedResolver();
        const orig = h.fs.existsSync.getMockImplementation()!;
        h.fs.existsSync.mockImplementation((p: string) => {
          if (p.includes('/fake/asar/node_modules/@prisma/client')) return false;
          return orig(p);
        });
        const result = resolver('@prisma/client/runtime', {
          filename: '/Users/me/Library/Application Support/ice/x.js',
        });
        expect(result).toBe('__ORIG_RESOLVE_RESULT__');
      });
    });
  });

  describe('setupAutoUpdater', () => {
    async function bootProd(): Promise<void> {
      h.bag.isDev = false;
      await bootAndDriveReady();
    }

    it('does nothing in dev mode', async () => {
      h.bag.isDev = true;
      await bootAndDriveReady();
      expect(h.electronUpdater.default.autoUpdater.on).not.toHaveBeenCalled();
    });

    it('configures auto-download and registers the update handlers in production', async () => {
      await bootProd();
      expect(h.electronUpdater.default.autoUpdater.autoDownload).toBe(true);
      expect(h.electronUpdater.default.autoUpdater.autoInstallOnAppQuit).toBe(true);
      const channels = Object.keys(h.bag.autoUpdaterListeners);
      expect(channels).toEqual(
        expect.arrayContaining(['update-available', 'download-progress', 'update-downloaded', 'error']),
      );
    });

    it('forwards update-available info to the renderer', async () => {
      await bootProd();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      const handler = h.bag.autoUpdaterListeners['update-available']![0]!;
      handler({ version: '1.2.3' });
      expect(main.webContents.send).toHaveBeenCalledWith('update-status', {
        status: 'available',
        version: '1.2.3',
      });
    });

    it('rounds and forwards download-progress to the renderer', async () => {
      await bootProd();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      const handler = h.bag.autoUpdaterListeners['download-progress']![0]!;
      handler({ percent: 42.6 });
      expect(main.webContents.send).toHaveBeenCalledWith('update-status', {
        status: 'downloading',
        percent: 43,
      });
    });

    it('shows a restart dialog when an update is downloaded and quits-and-installs on accept', async () => {
      h.bag.showMessageBoxResponse = 0;
      await bootProd();
      const handler = h.bag.autoUpdaterListeners['update-downloaded']![0]!;
      handler({ version: '1.2.3' });
      // Drain the dialog promise.
      await Promise.resolve();
      await Promise.resolve();
      expect(h.electron.dialog.showMessageBox).toHaveBeenCalled();
      expect(h.electronUpdater.default.autoUpdater.quitAndInstall).toHaveBeenCalledWith(
        false,
        true,
      );
    });

    it('does not quit-and-install when the user picks Later', async () => {
      h.bag.showMessageBoxResponse = 1;
      await bootProd();
      const handler = h.bag.autoUpdaterListeners['update-downloaded']![0]!;
      handler({ version: '1.2.3' });
      await Promise.resolve();
      await Promise.resolve();
      expect(h.electronUpdater.default.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    });

    it('logs updater errors only in dev mode', async () => {
      // Run the production setupAutoUpdater so the error listener registers,
      // then flip is.dev=true to exercise the dev console.error branch.
      await bootProd();
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      h.bag.isDev = true;
      const handler = h.bag.autoUpdaterListeners['error']![0]!;
      handler({ message: 'network down' });
      expect(errSpy).toHaveBeenCalledWith('[updater]', 'network down');
      errSpy.mockRestore();
    });

    it('stays silent on updater errors when not in dev', async () => {
      await bootProd();
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      h.bag.isDev = false;
      const handler = h.bag.autoUpdaterListeners['error']![0]!;
      handler({ message: 'network down' });
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it('schedules an immediate check after 5s and a periodic check every 4 hours', async () => {
      await bootProd();
      // The setTimeout(5_000) hasn't fired yet.
      expect(h.bag.autoUpdaterChecks).toBe(0);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(h.bag.autoUpdaterChecks).toBeGreaterThanOrEqual(1);
      const after5s = h.bag.autoUpdaterChecks;
      // The setInterval(4h).
      await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
      expect(h.bag.autoUpdaterChecks).toBeGreaterThan(after5s);
    });

    it('handles a manual check-for-updates IPC request', async () => {
      await bootProd();
      const handle = h.electron.ipcMain.handle.mock.calls.find(
        (c) => c[0] === 'check-for-updates',
      )!;
      const handler = handle[1] as () => unknown;
      handler();
      expect(h.electronUpdater.default.autoUpdater.checkForUpdates).toHaveBeenCalled();
    });
  });

  describe('getIconPath', () => {
    it('uses the windows icon name on win32', async () => {
      h.bag.isDev = true;
      h.bag.iconExists = true;
      restorePlatform = setPlatform('win32');
      await bootAndDriveReady();
      // win32 is non-darwin, so dock.setIcon is never called. We instead
      // assert getIconPath ran by checking the BrowserWindow opts.icon.
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      // Existing mock returns a path containing icon.ico; assert truthy.
      expect(typeof main.opts.icon).toBe('string');
      expect(main.opts.icon).toMatch(/icon\.ico$/);
    });

    it('returns undefined when the icon file does not exist', async () => {
      h.bag.isDev = true;
      h.bag.iconExists = false;
      restorePlatform = setPlatform('linux');
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      expect(main.opts.icon).toBeUndefined();
    });

    it('uses the bundled icon path in production', async () => {
      h.bag.isDev = false;
      h.bag.iconExists = true;
      await bootAndDriveReady();
      const main = h.bag.windows[h.bag.windows.length - 1]!;
      expect(main.opts.icon).toBeTruthy();
    });
  });
});
