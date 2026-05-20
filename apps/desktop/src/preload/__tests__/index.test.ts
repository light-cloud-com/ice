import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks. The preload script runs side-effects on import, so we mock
// `electron` first and reset modules per test to re-evaluate the side-effect
// with a fresh spy set.
const h = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  ipcOn: vi.fn(),
  ipcInvoke: vi.fn(),
  ipcRemoveListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: h.exposeInMainWorld,
  },
  ipcRenderer: {
    on: h.ipcOn,
    invoke: h.ipcInvoke,
    removeListener: h.ipcRemoveListener,
  },
}));

type ElectronAPI = {
  platform: NodeJS.Platform;
  onMenuAction: (cb: (action: string) => void) => () => void;
  onFullscreenChange: (cb: (isFullscreen: boolean) => void) => () => void;
  getFullscreenState: () => Promise<boolean>;
  onUpdateStatus: (cb: (status: { status: string; version?: string; percent?: number }) => void) => () => void;
  checkForUpdates: () => Promise<unknown>;
};

// The package leaves stale `.js`/`.d.ts` build artifacts next to `index.ts`
// (a prior `tsc` run without `--noEmit`). Vite's resolver prefers `.js`
// over `.ts` when both exist, so a bare `import('../index')` would
// instrument the wrong file for coverage. The `.ts` extension is required
// to disambiguate; tsc rejects it without `allowImportingTsExtensions` so
// the import goes through a string variable to dodge the static check.
const PRELOAD_TS = '../index.ts';
async function loadPreloadAndCaptureApi(): Promise<ElectronAPI> {
  await import(/* @vite-ignore */ PRELOAD_TS);
  expect(h.exposeInMainWorld).toHaveBeenCalledTimes(1);
  const [name, api] = h.exposeInMainWorld.mock.calls[0]!;
  expect(name).toBe('electronAPI');
  return api as ElectronAPI;
}

describe('preload script', () => {
  beforeEach(() => {
    h.exposeInMainWorld.mockReset();
    h.ipcOn.mockReset();
    h.ipcInvoke.mockReset();
    h.ipcRemoveListener.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('exposes electronAPI on the main world via contextBridge', async () => {
    await loadPreloadAndCaptureApi();
  });

  it('forwards process.platform onto the bridged API', async () => {
    const api = await loadPreloadAndCaptureApi();
    expect(api.platform).toBe(process.platform);
  });

  describe('onMenuAction', () => {
    it('subscribes to menu-action and forwards just the action argument to the callback', async () => {
      const api = await loadPreloadAndCaptureApi();
      const cb = vi.fn();
      api.onMenuAction(cb);
      expect(h.ipcOn).toHaveBeenCalledWith('menu-action', expect.any(Function));
      const handler = h.ipcOn.mock.calls[0]![1] as (e: unknown, action: string) => void;
      handler({ sender: 'fake-event' }, 'open-settings');
      expect(cb).toHaveBeenCalledWith('open-settings');
    });

    it('returns a disposer that removes the same handler it registered', async () => {
      const api = await loadPreloadAndCaptureApi();
      const cb = vi.fn();
      const dispose = api.onMenuAction(cb);
      const registeredHandler = h.ipcOn.mock.calls[0]![1];
      dispose();
      expect(h.ipcRemoveListener).toHaveBeenCalledWith('menu-action', registeredHandler);
    });
  });

  describe('onFullscreenChange', () => {
    it('subscribes to fullscreen-change and forwards just the boolean to the callback', async () => {
      const api = await loadPreloadAndCaptureApi();
      const cb = vi.fn();
      api.onFullscreenChange(cb);
      expect(h.ipcOn).toHaveBeenCalledWith('fullscreen-change', expect.any(Function));
      const handler = h.ipcOn.mock.calls[0]![1] as (e: unknown, isFs: boolean) => void;
      handler({}, true);
      expect(cb).toHaveBeenCalledWith(true);
      handler({}, false);
      expect(cb).toHaveBeenCalledWith(false);
    });

    it('returns a disposer that removes the registered handler', async () => {
      const api = await loadPreloadAndCaptureApi();
      const dispose = api.onFullscreenChange(vi.fn());
      const registeredHandler = h.ipcOn.mock.calls[0]![1];
      dispose();
      expect(h.ipcRemoveListener).toHaveBeenCalledWith('fullscreen-change', registeredHandler);
    });
  });

  describe('getFullscreenState', () => {
    it('invokes the get-fullscreen-state IPC channel and returns the resolved boolean', async () => {
      h.ipcInvoke.mockResolvedValueOnce(true);
      const api = await loadPreloadAndCaptureApi();
      await expect(api.getFullscreenState()).resolves.toBe(true);
      expect(h.ipcInvoke).toHaveBeenCalledWith('get-fullscreen-state');
    });
  });

  describe('onUpdateStatus', () => {
    it('subscribes to update-status and forwards the status object to the callback', async () => {
      const api = await loadPreloadAndCaptureApi();
      const cb = vi.fn();
      api.onUpdateStatus(cb);
      expect(h.ipcOn).toHaveBeenCalledWith('update-status', expect.any(Function));
      const handler = h.ipcOn.mock.calls[0]![1] as (e: unknown, status: unknown) => void;
      const payload = { status: 'downloading', percent: 42 };
      handler({}, payload);
      expect(cb).toHaveBeenCalledWith(payload);
    });

    it('returns a disposer that removes the registered handler', async () => {
      const api = await loadPreloadAndCaptureApi();
      const dispose = api.onUpdateStatus(vi.fn());
      const registeredHandler = h.ipcOn.mock.calls[0]![1];
      dispose();
      expect(h.ipcRemoveListener).toHaveBeenCalledWith('update-status', registeredHandler);
    });
  });

  describe('checkForUpdates', () => {
    it('invokes the check-for-updates IPC channel', async () => {
      h.ipcInvoke.mockResolvedValueOnce({ updateInfo: null });
      const api = await loadPreloadAndCaptureApi();
      await api.checkForUpdates();
      expect(h.ipcInvoke).toHaveBeenCalledWith('check-for-updates');
    });
  });
});
