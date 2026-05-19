/**
 * Sibling test file for the gateway-import-failure branch in
 * `apps/desktop/src/main/index.ts`. Lives separately from `index.test.ts`
 * because vitest 4 caches `vi.mock` factory invocations — a throwing
 * factory in the happy-path file would poison every downstream test that
 * needs the mocked module to import cleanly. See `state/learnings.md`
 * `electron-main-needs-X-mocked-with-Y-pattern` once the lesson is
 * promoted; for now this layout mirrors the precedent set by
 * `services/engine` (learning anchor `vitest-4-strict-mock-surface…`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  type Listener = (...args: any[]) => any;
  type Listeners = Record<string, Listener[]>;

  class FakeBrowserWindow {
    public readonly opts: any;
    public readonly listeners: Listeners = {};
    public readonly webContents = {
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn((channel: string, listener: Listener) => {
        ((this.webContents as any)._listeners ??= {} as Listeners);
        (((this.webContents as any)._listeners as Listeners)[channel] ??= []).push(listener);
        return this.webContents;
      }),
      once: vi.fn((channel: string, listener: Listener) => {
        ((this.webContents as any)._listeners ??= {} as Listeners);
        (((this.webContents as any)._listeners as Listeners)[channel] ??= []).push(listener);
        return this.webContents;
      }),
      executeJavaScript: vi.fn(() => Promise.resolve()),
      _listeners: {} as Listeners,
      getURL: vi.fn(() => 'http://localhost:15173/'),
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
    isDev: false,
    targetDirExists: true,
    splashExists: false,
    iconExists: false,
    asarPathExists: false,
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
      getVersion: vi.fn(() => '0.0.0-test'),
      dock: { setIcon: vi.fn() } as any,
    },
    BrowserWindow: Object.assign(FakeBrowserWindow, {
      getAllWindows: vi.fn(() => []),
    }),
    shell: { openExternal: vi.fn() },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({
        bounds: { x: 0, y: 0, width: 1500, height: 1000 },
      })),
    },
    dialog: {
      showMessageBox: vi.fn(() => Promise.resolve({ response: 1 })),
    },
    ipcMain: { handle: vi.fn() },
  };

  const electronUpdater = {
    default: {
      autoUpdater: {
        autoDownload: false,
        autoInstallOnAppQuit: false,
        on: vi.fn((channel: string, listener: any) => {
          (bag.autoUpdaterListeners[channel] ??= []).push(listener);
        }),
        checkForUpdates: vi.fn(() => Promise.resolve()),
        quitAndInstall: vi.fn(),
      },
    },
  };

  const electronToolkit = {
    electronApp: { setAppUserModelId: vi.fn() },
    optimizer: { watchWindowShortcuts: vi.fn() },
    get is() {
      return { dev: bag.isDev };
    },
  };

  const fs = {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    cpSync: vi.fn(),
  };

  const cryptoMod = { randomBytes: vi.fn(() => Buffer.from('beef', 'hex')) };

  const moduleMod = {
    default: {
      _resolveFilename: vi.fn((req: string) => `__orig_${req}`),
    },
  };

  return { bag, electron, electronUpdater, electronToolkit, fs, cryptoMod, moduleMod };
});

vi.mock('electron', () => h.electron);
vi.mock('electron-updater', () => h.electronUpdater);
vi.mock('@electron-toolkit/utils', () => h.electronToolkit);
vi.mock('fs', () => h.fs);
vi.mock('crypto', () => h.cryptoMod);
vi.mock('module', () => h.moduleMod);

// THE failure factory — throws synchronously when the SUT does
// `await import('@ice/gateway')`. Vitest 4 catches the throw and surfaces
// a wrapped error to the dynamic import; the SUT's try/catch handles it.
vi.mock('@ice/gateway', () => {
  throw new Error('gateway boom');
});

describe('main process bootstrap — gateway import failure', () => {
  const origResourcesPath = (process as any).resourcesPath;
  const origEnv = { ...process.env };

  beforeEach(() => {
    h.bag.windows = [];
    h.bag.appListeners = {};
    h.bag.autoUpdaterListeners = {};
    h.bag.isDev = false;
    h.bag.targetDirExists = true;
    let resolve: () => void = () => {};
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    h.bag.appReadyDeferred = { resolve, promise };
    process.env = { ...origEnv };
    (process as any).resourcesPath = '/fake/resources';
    h.electron.app.whenReady.mockClear();
    h.electron.app.on.mockClear();
    h.electronUpdater.default.autoUpdater.on.mockClear();
    h.fs.existsSync.mockClear();
  });

  afterEach(() => {
    process.env = { ...origEnv };
    (process as any).resourcesPath = origResourcesPath;
    vi.useRealTimers();
  });

  it('logs the gateway error and continues booting (creates the main window) instead of crashing', async () => {
    vi.useFakeTimers();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    // String-variable import to dodge tsc's allowImportingTsExtensions
    // check while still pointing vite at `.ts` (stale `.js` is sibling).
    const sutPath = '../index.ts';
    await import(/* @vite-ignore */ sutPath);
    h.bag.appReadyDeferred!.resolve();
    for (let i = 0; i < 32; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    // The catch arm logged with the documented preamble. The second arg
    // is whatever vitest reports for the wrapped factory throw, so we
    // just assert the preamble.
    const preambles = errSpy.mock.calls.map((c) => c[0]);
    expect(preambles).toContain('[desktop] Gateway start error:');
    // Boot did not abort: at least the splash + main window were created.
    expect(h.bag.windows.length).toBeGreaterThanOrEqual(2);
    errSpy.mockRestore();
  });
});
