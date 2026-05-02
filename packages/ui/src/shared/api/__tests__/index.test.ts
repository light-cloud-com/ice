/**
 * Tests for `shared/api/index.ts` — the public barrel for the api
 * package.
 *
 * The barrel re-exports `getApi`, `setApiAdapter`, the `IceAPI` type,
 * `createHttpApiAdapter`, `emitMenuAction`, the default axios instance,
 * and everything from `auth.ts`. It owns no behaviour itself — these
 * assertions exist to lock the surface so a future accidental rename
 * or remove (e.g. dropping `emitMenuAction` from the barrel) breaks a
 * test instead of silently breaking every consumer.
 */

import { describe, it, expect, vi } from 'vitest';

(globalThis as any).window = (globalThis as any).window || { location: { origin: 'http://localhost:3000' } };
(globalThis as any).localStorage = (globalThis as any).localStorage || {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

vi.mock('axios', () => ({
  default: {
    create: () => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    }),
  },
}));

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true, io: { on: vi.fn(), opts: {} } }),
}));

describe('shared/api — public barrel', () => {
  it('re-exports the api-adapter slot helpers', async () => {
    const mod = await import('../index');
    expect(typeof mod.getApi).toBe('function');
    expect(typeof mod.setApiAdapter).toBe('function');
  });

  it('re-exports createHttpApiAdapter and emitMenuAction', async () => {
    const mod = await import('../index');
    expect(typeof mod.createHttpApiAdapter).toBe('function');
    expect(typeof mod.emitMenuAction).toBe('function');
  });

  it('re-exports the axios instance under axiosInstance', async () => {
    const mod = await import('../index');
    expect(mod.axiosInstance).toBeDefined();
  });

  it('re-exports every auth helper', async () => {
    const mod = await import('../index');
    expect(typeof mod.isAuthenticated).toBe('function');
    expect(typeof mod.getCurrentUser).toBe('function');
    expect(typeof mod.logout).toBe('function');
    expect(typeof mod.login).toBe('function');
    expect(typeof mod.register).toBe('function');
    expect(typeof mod.refreshToken).toBe('function');
    expect(typeof mod.setAccessToken).toBe('function');
    expect(typeof mod.getAccessToken).toBe('function');
  });
});
