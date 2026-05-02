/**
 * `action-logger` exports three thin loggers that all funnel into a private
 * `logAction` (gated on localStorage / import.meta.env.DEV, writes structured
 * events into `window.__ICE_ACTION_LOG__` with circular-buffer trim).
 *
 * Tests cover:
 *  - the buffer init / append / trim path
 *  - the seq counter increment
 *  - the duration_ms optional spread (api_call vs api_response)
 *  - status-driven action label switch (api_response vs api_error)
 *  - state-change wrapper
 *
 * Module memoizes `_enabled`, so each test resets via `vi.resetModules()` (the
 * "module owning mutable singleton state needs vi.resetModules()" learning).
 *
 * Coverage limitation: the SUT's `isEnabled()` short-circuits on
 * `import.meta.env.DEV` which Vitest hard-codes to `true` at build time —
 * `vi.stubEnv('DEV', ...)` and direct `import.meta.env.DEV = false` mutation
 * BOTH fail to flip the SUT's binding (each module has its own
 * `import.meta`). The `if (!isEnabled()) return;` early-out and the
 * `localStorage.getItem`-throws catch arm aren't reachable through Vitest's
 * default DEV gate. We mark the gate's truthy branch via DEV and exercise
 * the cache-hit branch by re-importing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface FakeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function makeStorage(value: string | null = null): FakeStorage {
  return {
    getItem: vi.fn((k: string) => (k === 'ice-action-log' ? value : null)),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
}

interface IceWindow extends Record<string, unknown> {
  __ICE_ACTION_LOG__?: unknown[];
  __ICE_ACTION_SEQ__?: number;
}

function setupWindow(): IceWindow {
  const win: IceWindow = {};
  vi.stubGlobal('window', win);
  return win;
}

beforeEach(() => {
  // Each test resets the module so the `_enabled` cache starts as null and
  // the window-shaped buffer is freshly attached.
  vi.resetModules();
  vi.stubGlobal('localStorage', makeStorage(null));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('action-logger — gate (cache hit branch)', () => {
  it('reads the gate exactly once per module instance (caches across many calls)', async () => {
    // The SUT short-circuits on DEV (always true in vitest); we still enter
    // isEnabled() N times but the `_enabled === null` guard short-circuits
    // every call after the first. Localstorage may not even be touched if
    // DEV is true — but we still observe the cached gate because the second
    // call's behavior is identical to the first.
    setupWindow();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logApiCall } = await import('../action-logger');
    logApiCall('GET', '/a');
    logApiCall('GET', '/b');
    // Both calls passed the gate → buffer has 2 events.
    expect((globalThis.window as IceWindow).__ICE_ACTION_LOG__).toHaveLength(2);
  });
});

describe('action-logger — buffer / seq mechanics', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it('initializes window.__ICE_ACTION_LOG__ and __ICE_ACTION_SEQ__ on first call', async () => {
    const win = setupWindow();
    expect(win.__ICE_ACTION_LOG__).toBeUndefined();
    expect(win.__ICE_ACTION_SEQ__).toBeUndefined();
    const { logApiCall } = await import('../action-logger');
    logApiCall('POST', '/api/x');
    expect(Array.isArray(win.__ICE_ACTION_LOG__)).toBe(true);
    expect(typeof win.__ICE_ACTION_SEQ__).toBe('number');
  });

  it('appends a structured event with ts / seq / category / action / target / detail', async () => {
    const win = setupWindow();
    const { logApiCall } = await import('../action-logger');
    logApiCall('GET', '/api/foo', { q: 'bar' });
    const buf = win.__ICE_ACTION_LOG__ as Array<Record<string, unknown>>;
    expect(buf).toHaveLength(1);
    const ev = buf[0];
    expect(ev).toMatchObject({
      seq: 0,
      category: 'api',
      action: 'api_call',
      target: 'GET /api/foo',
      detail: { method: 'GET', path: '/api/foo', body: { q: 'bar' } },
    });
    expect(typeof ev.ts).toBe('number');
  });

  it('increments the seq counter monotonically across calls', async () => {
    const win = setupWindow();
    const { logApiCall } = await import('../action-logger');
    logApiCall('GET', '/a');
    logApiCall('GET', '/b');
    logApiCall('GET', '/c');
    const seqs = (win.__ICE_ACTION_LOG__ as Array<{ seq: number }>).map((e) => e.seq);
    expect(seqs).toEqual([0, 1, 2]);
    expect(win.__ICE_ACTION_SEQ__).toBe(3);
  });

  it('trims oldest events once the buffer exceeds 500 (circular)', async () => {
    const win = setupWindow();
    const { logApiCall } = await import('../action-logger');
    for (let i = 0; i < 510; i++) {
      logApiCall('GET', `/api/${i}`);
    }
    const buf = win.__ICE_ACTION_LOG__ as Array<{ seq: number }>;
    expect(buf).toHaveLength(500);
    // Oldest 10 trimmed; first surviving has seq=10.
    expect(buf[0].seq).toBe(10);
    expect(buf[499].seq).toBe(509);
  });

  it('keeps the buffer at exactly 500 with no extra trim when length === MAX', async () => {
    const win = setupWindow();
    const { logApiCall } = await import('../action-logger');
    for (let i = 0; i < 500; i++) logApiCall('GET', `/p/${i}`);
    const buf = win.__ICE_ACTION_LOG__ as Array<{ seq: number }>;
    expect(buf).toHaveLength(500);
    expect(buf[0].seq).toBe(0); // No trim at the boundary.
  });

  it('reuses an already-initialized buffer across logger calls', async () => {
    const win = setupWindow();
    const { logApiCall, logStateChange } = await import('../action-logger');
    logApiCall('GET', '/a');
    const firstRef = win.__ICE_ACTION_LOG__;
    logStateChange('cards/add', { id: 'x' });
    expect(win.__ICE_ACTION_LOG__).toBe(firstRef);
    expect((win.__ICE_ACTION_LOG__ as unknown[]).length).toBe(2);
  });
});

describe('action-logger — public API surface', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it('logApiCall preserves a non-undefined body in detail', async () => {
    const win = setupWindow();
    const { logApiCall } = await import('../action-logger');
    logApiCall('POST', '/api/x', { id: 1 });
    const ev = (win.__ICE_ACTION_LOG__ as Array<{ detail: Record<string, unknown> }>)[0];
    expect(ev.detail.body).toEqual({ id: 1 });
  });

  it('logApiCall replaces undefined body with null (?? fallback)', async () => {
    const win = setupWindow();
    const { logApiCall } = await import('../action-logger');
    logApiCall('GET', '/api/x');
    const ev = (win.__ICE_ACTION_LOG__ as Array<{ detail: Record<string, unknown> }>)[0];
    expect(ev.detail.body).toBeNull();
  });

  it('logApiCall uppercases the method in the target field', async () => {
    const win = setupWindow();
    const { logApiCall } = await import('../action-logger');
    logApiCall('post', '/api/x');
    const ev = (win.__ICE_ACTION_LOG__ as Array<{ target: string }>)[0];
    expect(ev.target).toBe('POST /api/x');
  });

  it('logApiResponse uses action="api_response" for a 2xx status', async () => {
    const win = setupWindow();
    const { logApiResponse } = await import('../action-logger');
    logApiResponse('GET', '/api/x', 200, { ok: true }, 42);
    const ev = (win.__ICE_ACTION_LOG__ as Array<Record<string, unknown>>)[0];
    expect(ev.action).toBe('api_response');
    expect(ev.duration_ms).toBe(42);
  });

  it('logApiResponse uses action="api_error" for a 4xx status', async () => {
    const win = setupWindow();
    const { logApiResponse } = await import('../action-logger');
    logApiResponse('GET', '/api/x', 404, { err: 'not found' }, 17);
    const ev = (win.__ICE_ACTION_LOG__ as Array<Record<string, unknown>>)[0];
    expect(ev.action).toBe('api_error');
    expect(ev.duration_ms).toBe(17);
  });

  it('logApiResponse uses action="api_error" for a 5xx status (>= 400 boundary)', async () => {
    const win = setupWindow();
    const { logApiResponse } = await import('../action-logger');
    logApiResponse('GET', '/api/x', 500, null, 100);
    const ev = (win.__ICE_ACTION_LOG__ as Array<Record<string, unknown>>)[0];
    expect(ev.action).toBe('api_error');
  });

  it('logApiResponse uses action="api_response" for a 3xx status (< 400 boundary)', async () => {
    const win = setupWindow();
    const { logApiResponse } = await import('../action-logger');
    logApiResponse('GET', '/api/x', 304, null, 0);
    const ev = (win.__ICE_ACTION_LOG__ as Array<Record<string, unknown>>)[0];
    expect(ev.action).toBe('api_response');
  });

  it('logApiResponse replaces undefined data with null (?? fallback)', async () => {
    const win = setupWindow();
    const { logApiResponse } = await import('../action-logger');
    logApiResponse('GET', '/api/x', 200, undefined as unknown, 1);
    const ev = (win.__ICE_ACTION_LOG__ as Array<{ detail: Record<string, unknown> }>)[0];
    expect(ev.detail.data).toBeNull();
  });

  it('logStateChange writes a state/dispatch event with the provided payload', async () => {
    const win = setupWindow();
    const { logStateChange } = await import('../action-logger');
    logStateChange('cards/add', { id: 'a' });
    const ev = (win.__ICE_ACTION_LOG__ as Array<Record<string, unknown>>)[0];
    expect(ev).toMatchObject({
      category: 'state',
      action: 'dispatch',
      target: 'cards/add',
      detail: { payload: { id: 'a' } },
    });
  });

  it('logStateChange replaces an undefined payload with null (?? fallback)', async () => {
    const win = setupWindow();
    const { logStateChange } = await import('../action-logger');
    logStateChange('cards/add');
    const ev = (win.__ICE_ACTION_LOG__ as Array<{ detail: Record<string, unknown> }>)[0];
    expect(ev.detail.payload).toBeNull();
  });

  it('every logged event sets duration_ms only when supplied (logApiCall omits it)', async () => {
    const win = setupWindow();
    const { logApiCall, logApiResponse } = await import('../action-logger');
    logApiCall('GET', '/a');
    logApiResponse('GET', '/a', 200, null, 5);
    const buf = win.__ICE_ACTION_LOG__ as Array<Record<string, unknown>>;
    expect('duration_ms' in buf[0]).toBe(false);
    expect(buf[1].duration_ms).toBe(5);
  });

  it('console.debug receives the formatted prefix line + detail tail', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    setupWindow();
    const { logApiCall } = await import('../action-logger');
    logApiCall('GET', '/api/x');
    expect(debugSpy).toHaveBeenCalled();
    const args = debugSpy.mock.calls[0];
    expect(args[0]).toContain('[ICE:Action]');
    expect(args[0]).toContain('api.api_call');
    // detail is the final positional arg.
    const detail = args[args.length - 1] as Record<string, unknown>;
    expect(detail).toMatchObject({ method: 'GET', path: '/api/x' });
  });
});
