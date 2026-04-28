/**
 * pdl-7 — channel-name flip from legacy `deploy:progress` to the typed
 * `deploy:event` channel exported as `DEPLOY_EVENT_CHANNEL` from
 * `@ice/types`.
 *
 * The contract: `onDeployEvent` registers its listener on the channel
 * named by the imported `DEPLOY_EVENT_CHANNEL` constant — never a
 * literal `'deploy:event'` string. A typo in any of the three places
 * (constant in @ice/types, listener in http-api-adapter, test below)
 * silently drops every event; this test is the safety net.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEPLOY_EVENT_CHANNEL } from '@ice/types';

// Stub the browser globals the adapter touches at module load time.
// Vitest defaults to a node env; the adapter reads `window.location.origin`
// inside `getSocket()` for the WS URL fallback.
(globalThis as any).window = (globalThis as any).window || {
  location: { origin: 'http://localhost:3000' },
};
(globalThis as any).localStorage = (globalThis as any).localStorage || {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

// Mock socket.io-client BEFORE importing the adapter so the module-level
// `getSocket()` returns our spy. The adapter also registers handlers on
// `socket.io.on('reconnect', ...)` for connection-state observability —
// the inner `socket.io` Manager needs an `on` spy too.
const mockManager = { on: vi.fn() };
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connected: true,
  io: mockManager,
};

vi.mock('socket.io-client', () => ({
  io: () => mockSocket,
}));

vi.mock('../axios-instance', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// Lazy-import after mocks are set up so the module captures the spies.
async function importAdapter() {
  const mod = await import('../http-api-adapter');
  return mod.createHttpApiAdapter();
}

describe('http-api-adapter — onDeployEvent channel name', () => {
  beforeEach(() => {
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    mockSocket.emit.mockClear();
  });

  it('registers its listener on the DEPLOY_EVENT_CHANNEL constant from @ice/types', async () => {
    const adapter = await importAdapter();
    const callback = vi.fn();

    const cleanup = adapter.onDeployEvent(callback);

    expect(mockSocket.on).toHaveBeenCalled();
    // Find the call that registered against the deploy event channel.
    // The adapter also installs other listeners (logs, pipeline, etc.)
    // when their own factories run — but only `onDeployEvent` should hit
    // DEPLOY_EVENT_CHANNEL, and exactly once.
    const deployCalls = mockSocket.on.mock.calls.filter((c) => c[0] === DEPLOY_EVENT_CHANNEL);
    expect(deployCalls).toHaveLength(1);

    // Cleanup unsubscribes from the same channel.
    cleanup();
    expect(mockSocket.off).toHaveBeenCalledWith(DEPLOY_EVENT_CHANNEL, expect.any(Function));
  });

  it('forwards events from the socket to the callback unchanged', async () => {
    const adapter = await importAdapter();
    const callback = vi.fn();

    adapter.onDeployEvent(callback);
    const deployCalls = mockSocket.on.mock.calls.filter((c) => c[0] === DEPLOY_EVENT_CHANNEL);
    const wrapped = deployCalls.at(-1)![1] as (e: unknown) => void;

    const event = {
      type: 'node_status' as const,
      card_id: 'c1',
      node_id: 'n1',
      resource_name: 'foo',
      resource_type: 'gcp.redis.instance',
      action: 'create' as const,
      status: 'applying' as const,
      at: '2026-04-28T10:00:00.000Z',
      seq: 1,
    };
    wrapped(event);

    expect(callback).toHaveBeenCalledWith(event);
  });

  it('does NOT register on the legacy `deploy:progress` channel name', async () => {
    const adapter = await importAdapter();
    adapter.onDeployEvent(vi.fn());

    const allChannels = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(allChannels).not.toContain('deploy:progress');
  });
});
