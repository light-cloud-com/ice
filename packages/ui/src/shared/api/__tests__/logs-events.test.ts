/**
 * Tests for the `logs` (mixed HTTP+socket) adapter and the top-level
 * Socket.IO event listeners + room subscriptions extracted in
 * rf-httpapi-6. The shared socket from `socket.ts` is mocked at the
 * module level so each builder's `getSocket()` call returns the same
 * spy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEPLOY_EVENT_CHANNEL } from '@ice/types';

(globalThis as any).window = (globalThis as any).window || { location: { origin: 'http://localhost:3000' } };
(globalThis as any).localStorage = (globalThis as any).localStorage || {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const mockAxios = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};
vi.mock('../axios-instance', () => ({ default: mockAxios }));

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connected: true,
};

const menuCallbacks = new Set<(action: string) => void>();

vi.mock('../http-api/socket', () => ({
  getSocket: () => mockSocket,
  menuCallbacks,
  emitMenuAction: (a: string) => menuCallbacks.forEach((cb) => cb(a)),
}));

beforeEach(() => {
  mockAxios.post.mockReset();
  mockSocket.on.mockClear();
  mockSocket.off.mockClear();
  mockSocket.emit.mockClear();
  menuCallbacks.clear();
});

// ─── logs adapter ───────────────────────────────────────────────────────────

describe('http-api/logs', () => {
  it('subscribe() POSTs /canvas/logs/subscribe with the args', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { subscriptionId: 's1' } });
    const { createLogsAdapter } = await import('../http-api/logs');
    const a = createLogsAdapter();
    await a.subscribe({
      cardId: 'c1',
      terminalNodeId: 't1',
      sourceNodeIdOverride: 's1',
      environmentId: 'e1',
      mode: 'tail',
    });
    expect(mockAxios.post).toHaveBeenCalledWith('/canvas/logs/subscribe', {
      cardId: 'c1',
      terminalNodeId: 't1',
      sourceNodeIdOverride: 's1',
      environmentId: 'e1',
      mode: 'tail',
    });
  });

  it('unsubscribe() POSTs /canvas/logs/unsubscribe with subscriptionId + cardId', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createLogsAdapter } = await import('../http-api/logs');
    const a = createLogsAdapter();
    await a.unsubscribe('s1', 'c1');
    expect(mockAxios.post).toHaveBeenCalledWith('/canvas/logs/unsubscribe', { subscriptionId: 's1', cardId: 'c1' });
  });

  it('joinRoom() emits subscribe:logs immediately + on every reconnect, and unsubscribes on cleanup', async () => {
    const { createLogsAdapter } = await import('../http-api/logs');
    const a = createLogsAdapter();
    const cleanup = a.joinRoom('t1');
    expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:logs', 't1');

    // a `connect` listener was registered to replay the subscribe on reconnect
    const connectCall = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect');
    expect(connectCall).toBeDefined();
    const replay = connectCall![1] as () => void;
    mockSocket.emit.mockClear();
    replay();
    expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:logs', 't1');

    // cleanup → unsubscribe + remove the connect listener
    mockSocket.emit.mockClear();
    mockSocket.off.mockClear();
    cleanup();
    expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribe:logs', 't1');
    expect(mockSocket.off).toHaveBeenCalledWith('connect', replay);
  });

  it.each([
    ['onEntry', 'logs:entry'],
    ['onError', 'logs:error'],
    ['onResumed', 'logs:resumed'],
    ['onSourceResolved', 'logs:source-resolved'],
  ] as const)('%s registers on %s channel and the cleanup unregisters it', async (method, channel) => {
    const { createLogsAdapter } = await import('../http-api/logs');
    const a = createLogsAdapter();
    const callback = vi.fn();
    const cleanup = (a[method] as (cb: typeof callback) => () => void)(callback);
    expect(mockSocket.on).toHaveBeenCalledWith(channel, callback);
    cleanup();
    expect(mockSocket.off).toHaveBeenCalledWith(channel, callback);
  });
});

// ─── events module ──────────────────────────────────────────────────────────

describe('http-api/events — onMenuAction', () => {
  it('adds the callback to menuCallbacks and the cleanup removes it', async () => {
    const { createOnMenuAction } = await import('../http-api/events');
    const onMenu = createOnMenuAction();
    const cb = vi.fn();
    expect(menuCallbacks.size).toBe(0);
    const cleanup = onMenu(cb);
    expect(menuCallbacks.has(cb)).toBe(true);
    cleanup();
    expect(menuCallbacks.has(cb)).toBe(false);
  });
});

describe('http-api/events — onDeployEvent', () => {
  it('registers a wrapper on DEPLOY_EVENT_CHANNEL that forwards to the callback', async () => {
    const { createOnDeployEvent } = await import('../http-api/events');
    const onDeploy = createOnDeployEvent();
    const cb = vi.fn();
    onDeploy(cb);
    expect(mockSocket.on).toHaveBeenCalledWith(DEPLOY_EVENT_CHANNEL, expect.any(Function));
    const wrapped = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === DEPLOY_EVENT_CHANNEL)![1] as (
      e: any,
    ) => void;
    const event = { type: 'log' as const, card_id: 'c1', at: '2026-01-01T00:00:00Z', seq: 1, level: 'info', message: 'hi' };
    wrapped(event);
    expect(cb).toHaveBeenCalledWith(event);
  });

  it('cleanup unsubscribes the same wrapped function from DEPLOY_EVENT_CHANNEL', async () => {
    const { createOnDeployEvent } = await import('../http-api/events');
    const onDeploy = createOnDeployEvent();
    const cleanup = onDeploy(vi.fn());
    const wrapped = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === DEPLOY_EVENT_CHANNEL)![1];
    cleanup();
    expect(mockSocket.off).toHaveBeenCalledWith(DEPLOY_EVENT_CHANNEL, wrapped);
  });

  it('logs "?" for type and "" for ids when the event is null/undefined or sparse', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { createOnDeployEvent } = await import('../http-api/events');
    const onDeploy = createOnDeployEvent();
    const cb = vi.fn();
    onDeploy(cb);
    const wrapped = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === DEPLOY_EVENT_CHANNEL)![1] as (
      e: any,
    ) => void;

    // Drive the `event?.type ?? '?'` and id fallback chain — both
    // branches of every `?.` and `??` operator.
    wrapped(null);
    expect(cb).toHaveBeenCalledWith(null);
    expect(logSpy).toHaveBeenLastCalledWith(
      `[ice-socket] ${DEPLOY_EVENT_CHANNEL}`,
      '?',
      '',
    );

    wrapped({});
    expect(logSpy).toHaveBeenLastCalledWith(
      `[ice-socket] ${DEPLOY_EVENT_CHANNEL}`,
      '?',
      '',
    );

    // node_id arm — present, resource_name absent
    wrapped({ type: 'node_status', node_id: 'n1' });
    expect(logSpy).toHaveBeenLastCalledWith(
      `[ice-socket] ${DEPLOY_EVENT_CHANNEL}`,
      'node_status',
      'n1',
    );

    // resource_name arm — used when node_id is absent (?? falls through)
    wrapped({ type: 'resource_status', resource_name: 'redis' });
    expect(logSpy).toHaveBeenLastCalledWith(
      `[ice-socket] ${DEPLOY_EVENT_CHANNEL}`,
      'resource_status',
      'redis',
    );

    logSpy.mockRestore();
  });
});

describe('http-api/events — pipeline listeners', () => {
  it.each([
    ['createOnPipelineUpdate', 'pipeline:update'],
    ['createOnCardPipelineUpdate', 'card-pipeline:update'],
  ] as const)('%s registers on %s and cleanup unregisters', async (factory, channel) => {
    const mod = (await import('../http-api/events')) as unknown as Record<
      string,
      () => (cb: (e: any) => void) => () => void
    >;
    const builder = mod[factory]!;
    const fn = builder();
    const cb = vi.fn();
    const cleanup = fn(cb);
    expect(mockSocket.on).toHaveBeenCalledWith(channel, cb);
    cleanup();
    expect(mockSocket.off).toHaveBeenCalledWith(channel, cb);
  });
});

describe('http-api/events — subscribeDeployProgress', () => {
  it('emits subscribe:deploy immediately + on every reconnect, unsubscribes on cleanup', async () => {
    const { createSubscribeDeployProgress } = await import('../http-api/events');
    const fn = createSubscribeDeployProgress()!;
    const cleanup = fn('c1');
    expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:deploy', 'c1');

    const connectCall = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect');
    const replay = connectCall![1] as () => void;
    mockSocket.emit.mockClear();
    replay();
    expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:deploy', 'c1');

    mockSocket.emit.mockClear();
    cleanup();
    expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribe:deploy', 'c1');
    expect(mockSocket.off).toHaveBeenCalledWith('connect', replay);
  });
});

describe('http-api/events — subscribePipeline / subscribeCardPipeline', () => {
  it.each([
    ['createSubscribePipeline', 'subscribe:pipeline', 'unsubscribe:pipeline'],
    ['createSubscribeCardPipeline', 'subscribe:card-pipeline', 'unsubscribe:card-pipeline'],
  ] as const)(
    '%s emits %s on call and %s on cleanup, no reconnect-replay',
    async (factory, subscribeEvent, unsubscribeEvent) => {
      const mod = (await import('../http-api/events')) as unknown as Record<
        string,
        () => (id: string) => () => void
      >;
      const fn = mod[factory]!();
      const cleanup = fn('id1');
      expect(mockSocket.emit).toHaveBeenCalledWith(subscribeEvent, 'id1');
      // No `connect` listener installed (fire-and-forget)
      expect(mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect')).toBeUndefined();
      cleanup();
      expect(mockSocket.emit).toHaveBeenCalledWith(unsubscribeEvent, 'id1');
    },
  );
});
