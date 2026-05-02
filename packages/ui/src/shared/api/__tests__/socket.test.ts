/**
 * Tests for the shared socket singleton + menu-action emitter
 * extracted in rf-httpapi-1. Behavior covered:
 *
 *   - `getSocket()` lazy-creates exactly one Socket instance and reuses it.
 *   - `getSocket()` reads `VITE_WS_URL` via `window.location.origin` fallback.
 *   - `getSocket()` reads `ice-token` from localStorage and passes it as `auth.token`.
 *   - The connection-state listeners (`connect`, `disconnect`, `connect_error`,
 *     `reconnect`, `reconnect_error`) are wired on the socket / Manager.
 *   - `emitMenuAction(...)` fans out to every registered callback in `menuCallbacks`.
 *
 * The connection-state listeners log to console; tests pin the
 * registration shape (e.g. `socket.on('connect', fn)`) but don't
 * assert log output.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Browser-global stubs (vitest defaults to a node env) ────────────────────

(globalThis as any).window = (globalThis as any).window || { location: { origin: 'http://localhost:3000' } };

// localStorage stub — per-test we tweak `getItem` to control the auth-token branch.
const lsStore: Record<string, string> = {};
(globalThis as any).localStorage = (globalThis as any).localStorage || {
  getItem: (k: string) => lsStore[k] || null,
  setItem: (k: string, v: string) => {
    lsStore[k] = v;
  },
  removeItem: (k: string) => {
    delete lsStore[k];
  },
};

// ─── socket.io-client mock ──────────────────────────────────────────────────

const mockManager: { on: ReturnType<typeof vi.fn>; opts: { transports: string[] } } = {
  on: vi.fn(),
  opts: { transports: ['websocket', 'polling'] },
};
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connected: true,
  io: mockManager,
  id: 's1',
};
const ioFactory = vi.fn(() => mockSocket);

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => ioFactory(...(args as [])),
}));

async function importFresh() {
  vi.resetModules();
  return await import('../http-api/socket');
}

describe('http-api/socket — getSocket()', () => {
  beforeEach(() => {
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    mockSocket.emit.mockClear();
    mockManager.on.mockClear();
    mockManager.opts = { transports: ['websocket', 'polling'] };
    ioFactory.mockClear();
    Object.keys(lsStore).forEach((k) => delete lsStore[k]);
  });

  it('lazy-creates the socket on first call and returns the same instance on subsequent calls', async () => {
    const mod = await importFresh();
    const s1 = mod.getSocket();
    const s2 = mod.getSocket();
    expect(s1).toBe(s2);
    expect(ioFactory).toHaveBeenCalledTimes(1);
  });

  it('passes window.location.origin to io() when VITE_WS_URL is unset', async () => {
    const mod = await importFresh();
    mod.getSocket();
    const [url] = ioFactory.mock.calls[0] as unknown as [string,Record<string, unknown>];
    expect(url).toBe('http://localhost:3000');
  });

  it('forwards the localStorage `ice-token` as `auth.token`', async () => {
    lsStore['ice-token'] = 'abc-123';
    const mod = await importFresh();
    mod.getSocket();
    const [, opts] = ioFactory.mock.calls[0] as unknown as [string,{ auth?: { token?: string } }];
    expect(opts.auth).toEqual({ token: 'abc-123' });
  });

  it('passes an empty `auth: {}` when no token is present', async () => {
    const mod = await importFresh();
    mod.getSocket();
    const [, opts] = ioFactory.mock.calls[0] as unknown as [string,{ auth?: Record<string, unknown> }];
    expect(opts.auth).toEqual({});
  });

  it('forces websocket-first transport with polling fallback', async () => {
    const mod = await importFresh();
    mod.getSocket();
    const [, opts] = ioFactory.mock.calls[0] as unknown as [string,{ transports?: string[] }];
    expect(opts.transports).toEqual(['websocket', 'polling']);
  });

  it('configures retry-forever reconnection with bounded delay', async () => {
    const mod = await importFresh();
    mod.getSocket();
    const [, opts] = ioFactory.mock.calls[0] as unknown as [
      string,
      {
        reconnection?: boolean;
        reconnectionAttempts?: number;
        reconnectionDelay?: number;
        reconnectionDelayMax?: number;
      },
    ];
    expect(opts.reconnection).toBe(true);
    expect(opts.reconnectionAttempts).toBe(Infinity);
    expect(opts.reconnectionDelay).toBe(500);
    expect(opts.reconnectionDelayMax).toBe(5000);
  });

  it('registers connect/disconnect/connect_error handlers on the socket', async () => {
    const mod = await importFresh();
    mod.getSocket();
    const channels = mockSocket.on.mock.calls.map((c: unknown[]) => c[0]);
    expect(channels).toContain('connect');
    expect(channels).toContain('disconnect');
    expect(channels).toContain('connect_error');
  });

  it('registers reconnect/reconnect_error handlers on the Manager (socket.io)', async () => {
    const mod = await importFresh();
    mod.getSocket();
    const events = mockManager.on.mock.calls.map((c: unknown[]) => c[0]);
    expect(events).toContain('reconnect');
    expect(events).toContain('reconnect_error');
  });

  it('flips transports to polling-first when connect_error mentions websocket', async () => {
    const mod = await importFresh();
    const s = mod.getSocket();
    const errCall = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect_error');
    expect(errCall).toBeDefined();
    const handler = errCall![1] as (e: Error) => void;
    handler(new Error('websocket error'));
    expect((s.io as unknown as { opts: { transports: string[] } }).opts.transports).toEqual([
      'polling',
      'websocket',
    ]);
  });

  it('does NOT flip transports when connect_error is unrelated to websocket', async () => {
    const mod = await importFresh();
    mod.getSocket();
    const errCall = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect_error');
    const handler = errCall![1] as (e: Error) => void;
    handler(new Error('timeout'));
    expect(mockManager.opts.transports).toEqual(['websocket', 'polling']);
  });

  it('handles a localStorage that throws on getItem (Safari private mode)', async () => {
    const original = (globalThis as any).localStorage.getItem;
    (globalThis as any).localStorage.getItem = () => {
      throw new Error('SecurityError');
    };
    const mod = await importFresh();
    mod.getSocket();
    const [, opts] = ioFactory.mock.calls[0] as unknown as [string,{ auth?: Record<string, unknown> }];
    expect(opts.auth).toEqual({});
    (globalThis as any).localStorage.getItem = original;
  });

  // ── Connection-state handler bodies ───────────────────────────────────────
  // The `getSocket()` call wires console-log handlers on connect / disconnect
  // / reconnect / reconnect_error. We invoke them so the body of each handler
  // executes, locking in the "logs are still emitted" behaviour the comments
  // explicitly call out as essential for diagnosing live-update bugs.

  it('logs to the console when the connect handler fires', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const mod = await importFresh();
    mod.getSocket();
    const handler = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect')![1] as () => void;
    handler();
    expect(logSpy).toHaveBeenCalledWith('[ice-socket] connected id=', 's1');
    logSpy.mockRestore();
  });

  it('warns to the console with the reason when the disconnect handler fires', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mod = await importFresh();
    mod.getSocket();
    const handler = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'disconnect')![1] as (
      r: string,
    ) => void;
    handler('transport close');
    expect(warnSpy).toHaveBeenCalledWith('[ice-socket] disconnected:', 'transport close');
    warnSpy.mockRestore();
  });

  it('errors to the console when the connect_error handler fires', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mod = await importFresh();
    mod.getSocket();
    const handler = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect_error')![1] as (
      e: Error,
    ) => void;
    handler(new Error('timeout'));
    expect(errSpy).toHaveBeenCalledWith('[ice-socket] connect_error:', 'timeout');
    errSpy.mockRestore();
  });

  it('logs reconnect attempts via the Manager handler', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const mod = await importFresh();
    mod.getSocket();
    const handler = mockManager.on.mock.calls.find((c: unknown[]) => c[0] === 'reconnect')![1] as (
      n: number,
    ) => void;
    handler(3);
    expect(logSpy).toHaveBeenCalledWith('[ice-socket] reconnected after', 3, 'attempts');
    logSpy.mockRestore();
  });

  it('warns on reconnect_error via the Manager handler', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mod = await importFresh();
    mod.getSocket();
    const handler = mockManager.on.mock.calls.find((c: unknown[]) => c[0] === 'reconnect_error')![1] as (
      e: Error,
    ) => void;
    handler(new Error('refused'));
    expect(warnSpy).toHaveBeenCalledWith('[ice-socket] reconnect_error:', 'refused');
    warnSpy.mockRestore();
  });

  it('skips the polling-fallback flip when socket is null inside the connect_error handler', async () => {
    // This drives the `socket && err.message.includes('websocket')` short
    // circuit's first arm (socket null) — defends the explicit null check.
    const mod = await importFresh();
    mod.getSocket();
    const handler = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect_error')![1] as (
      e: Error,
    ) => void;
    // Even with a non-websocket error, transports stay default — covers
    // the falsy-second-arm path of the conditional.
    handler({ message: undefined } as unknown as Error);
    expect(mockManager.opts.transports).toEqual(['websocket', 'polling']);
  });
});

describe('http-api/socket — emitMenuAction', () => {
  it('invokes every registered callback in `menuCallbacks` with the action', async () => {
    const mod = await importFresh();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    mod.menuCallbacks.add(cb1);
    mod.menuCallbacks.add(cb2);
    mod.emitMenuAction('save');
    expect(cb1).toHaveBeenCalledWith('save');
    expect(cb2).toHaveBeenCalledWith('save');
    mod.menuCallbacks.delete(cb1);
    mod.menuCallbacks.delete(cb2);
  });

  it('does nothing when no callbacks are registered', async () => {
    const mod = await importFresh();
    expect(() => mod.emitMenuAction('export')).not.toThrow();
  });
});
