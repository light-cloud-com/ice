/**
 * Per-node deploy event emitters (pdl-2).
 *
 * Locks down the wire contract for the five typed helpers that replace the
 * legacy `emitDeployProgress`. Three things matter and are asserted:
 *
 *   1. Every emit goes to room `deploy:<cardId>` over the EVENT NAME
 *      `DEPLOY_EVENT_CHANNEL` (the imported constant — never a string
 *      literal — a typo in either the emitter or the listener silently
 *      drops every event).
 *   2. The `_io === null` guard fires before any listener-set lookup, so
 *      callers that emit before `setupSocketService` has run (tests,
 *      early-boot code) don't throw.
 *   3. The listener-count debug line is preserved from the legacy
 *      emitter — invaluable for "why aren't events reaching my client"
 *      debugging. We seed the fake `rooms` map with two members and
 *      assert `listeners=2` in the log.
 *
 * The compile-time check that each helper accepts only its own variant of
 * the discriminated union is implicit — the test body constructs literal
 * payloads matching each variant exactly, so a future change to a payload
 * shape (or a wrong helper accepting any union member) would fail tsc.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEPLOY_EVENT_CHANNEL,
  type DeployCompleteEvent,
  type DeployLogEvent,
  type DeployNodeProgressEvent,
  type DeployNodeStatusEvent,
  type DeployRequirementVerifiedEvent,
} from '@ice/types';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-for-socket-deploy-events';
});

interface FakeIo {
  use: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  sockets: { adapter: { rooms: Map<string, Set<string>> } };
  to: ReturnType<typeof vi.fn>;
}

function makeFakeIo(rooms: Map<string, Set<string>> = new Map()): {
  io: FakeIo;
  emit: ReturnType<typeof vi.fn>;
} {
  const emit = vi.fn();
  const io: FakeIo = {
    use: vi.fn(),
    on: vi.fn(),
    sockets: { adapter: { rooms } },
    to: vi.fn(() => ({ emit })),
  };
  return { io, emit };
}

/**
 * The socket service module is stateful (a module-scoped `let _io`). Each
 * test wants its own fresh server, so we clear the module registry and
 * re-import. Without `vi.resetModules`, a prior test's `_io` would leak
 * across — and the `_io === null` guard test in particular requires a
 * pristine module state.
 */
async function freshSocketService() {
  vi.resetModules();
  return import('../socket/service.js');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('deploy event emitters — wire contract', () => {
  it('emitDeployNodeStatus emits to deploy:<cardId> over DEPLOY_EVENT_CHANNEL with the exact payload', async () => {
    const { setupSocketService, emitDeployNodeStatus } = await freshSocketService();
    const rooms = new Map<string, Set<string>>([['deploy:abc', new Set(['s1', 's2'])]]);
    const { io, emit } = makeFakeIo(rooms);
    setupSocketService(io as unknown as Parameters<typeof setupSocketService>[0]);

    const payload: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: 'abc',
      node_id: 'canvas-node-1',
      resource_name: 'ice-foo-prod-instance-abc123',
      resource_type: 'gcp.sql.databaseInstance',
      action: 'create',
      status: 'failed',
      // exercise the optional fields
      error: { code: 'GCP_QUOTA', message: 'quota exceeded', recoverable: false },
      duration_ms: 32_000,
      at: '2026-04-28T22:00:00.000Z',
      seq: 7,
    };
    emitDeployNodeStatus('abc', payload);

    expect(io.to).toHaveBeenCalledWith('deploy:abc');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(DEPLOY_EVENT_CHANNEL, payload);
  });

  it('emitDeployNodeProgress emits the node_progress variant unchanged', async () => {
    const { setupSocketService, emitDeployNodeProgress } = await freshSocketService();
    const { io, emit } = makeFakeIo();
    setupSocketService(io as unknown as Parameters<typeof setupSocketService>[0]);

    const payload: DeployNodeProgressEvent = {
      type: 'node_progress',
      card_id: 'abc',
      node_id: 'canvas-node-1',
      resource_name: 'ice-foo-prod-instance-abc123',
      step: { label: 'creating instance', index: 1, total: 3 },
      at: '2026-04-28T22:00:01.000Z',
      seq: 8,
    };
    emitDeployNodeProgress('abc', payload);

    expect(io.to).toHaveBeenCalledWith('deploy:abc');
    expect(emit).toHaveBeenCalledWith(DEPLOY_EVENT_CHANNEL, payload);
  });

  it('emitDeployComplete emits the terminal complete event with totals', async () => {
    const { setupSocketService, emitDeployComplete } = await freshSocketService();
    const { io, emit } = makeFakeIo();
    setupSocketService(io as unknown as Parameters<typeof setupSocketService>[0]);

    const payload: DeployCompleteEvent = {
      type: 'complete',
      card_id: 'abc',
      outcome: 'partial',
      totals: {
        queued: 0,
        applying: 0,
        succeeded: 5,
        failed: 1,
        skipped: 0,
        cancelled: 0,
      },
      at: '2026-04-28T22:05:00.000Z',
      seq: 42,
    };
    emitDeployComplete('abc', payload);

    expect(io.to).toHaveBeenCalledWith('deploy:abc');
    expect(emit).toHaveBeenCalledWith(DEPLOY_EVENT_CHANNEL, payload);
  });

  it('emitDeployLog emits the log variant (deploy-scoped, no node_id)', async () => {
    const { setupSocketService, emitDeployLog } = await freshSocketService();
    const { io, emit } = makeFakeIo();
    setupSocketService(io as unknown as Parameters<typeof setupSocketService>[0]);

    const payload: DeployLogEvent = {
      type: 'log',
      card_id: 'abc',
      level: 'info',
      message: 'deploy started',
      at: '2026-04-28T22:00:00.000Z',
      seq: 1,
    };
    emitDeployLog('abc', payload);

    expect(io.to).toHaveBeenCalledWith('deploy:abc');
    expect(emit).toHaveBeenCalledWith(DEPLOY_EVENT_CHANNEL, payload);
  });

  it('emitDeployRequirementVerified emits the requirement_verified variant', async () => {
    const { setupSocketService, emitDeployRequirementVerified } = await freshSocketService();
    const { io, emit } = makeFakeIo();
    setupSocketService(io as unknown as Parameters<typeof setupSocketService>[0]);

    const payload: DeployRequirementVerifiedEvent = {
      type: 'requirement_verified',
      card_id: 'abc',
      requirement: 'ssl-cert-ready',
      status: 'satisfied',
      at: '2026-04-28T22:10:00.000Z',
      seq: 100,
    };
    emitDeployRequirementVerified('abc', payload);

    expect(io.to).toHaveBeenCalledWith('deploy:abc');
    expect(emit).toHaveBeenCalledWith(DEPLOY_EVENT_CHANNEL, payload);
  });
});

describe('deploy event emitters — _io null guard', () => {
  it('does not throw when called before setupSocketService has run', async () => {
    const {
      emitDeployNodeStatus,
      emitDeployNodeProgress,
      emitDeployComplete,
      emitDeployLog,
      emitDeployRequirementVerified,
    } = await freshSocketService();
    // No setupSocketService call — _io is undefined inside the module.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      emitDeployNodeStatus('abc', {
        type: 'node_status',
        card_id: 'abc',
        node_id: 'n',
        resource_name: 'r',
        resource_type: 't',
        action: 'create',
        status: 'queued',
        at: 'now',
        seq: 1,
      }),
    ).not.toThrow();

    expect(() =>
      emitDeployNodeProgress('abc', {
        type: 'node_progress',
        card_id: 'abc',
        node_id: 'n',
        resource_name: 'r',
        step: { label: 'x', index: 0, total: 1 },
        at: 'now',
        seq: 1,
      }),
    ).not.toThrow();

    expect(() =>
      emitDeployComplete('abc', {
        type: 'complete',
        card_id: 'abc',
        outcome: 'success',
        totals: {
          queued: 0,
          applying: 0,
          succeeded: 1,
          failed: 0,
          skipped: 0,
          cancelled: 0,
        },
        at: 'now',
        seq: 1,
      }),
    ).not.toThrow();

    expect(() =>
      emitDeployLog('abc', {
        type: 'log',
        card_id: 'abc',
        level: 'info',
        message: 'x',
        at: 'now',
        seq: 1,
      }),
    ).not.toThrow();

    expect(() =>
      emitDeployRequirementVerified('abc', {
        type: 'requirement_verified',
        card_id: 'abc',
        requirement: 'x',
        status: 'satisfied',
        at: 'now',
        seq: 1,
      }),
    ).not.toThrow();

    // Each call should have logged the same warn line — confirms the guard
    // ran for every helper rather than one helper bypassing the guard.
    expect(warn).toHaveBeenCalledTimes(5);
    expect(warn.mock.calls[0]?.[0]).toContain('_io is null');
  });
});

describe('deploy event emitters — listener count logging', () => {
  it('logs `[socket] emit deploy:event type=<type> → deploy:<cardId> listeners=<n>` exactly once per emit', async () => {
    const { setupSocketService, emitDeployNodeStatus } = await freshSocketService();
    // Seed the fake's rooms map with 2 members for `deploy:abc`. The emitter
    // reads `_io.sockets.adapter.rooms.get('deploy:abc')?.size ?? 0` — so we
    // expect `listeners=2` on the log line.
    const rooms = new Map<string, Set<string>>([['deploy:abc', new Set(['s1', 's2'])]]);
    const { io } = makeFakeIo(rooms);
    setupSocketService(io as unknown as Parameters<typeof setupSocketService>[0]);

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const payload: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: 'abc',
      node_id: 'canvas-node-1',
      resource_name: 'r',
      resource_type: 't',
      action: 'create',
      status: 'applying',
      at: 'now',
      seq: 1,
    };
    emitDeployNodeStatus('abc', payload);

    // Filter to the emit-debug line — the spy captures every console.log
    // (e.g. setupSocketService also logs 'setupSocketService installed').
    const emitLogs = log.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).startsWith('[socket] emit '),
    );
    expect(emitLogs).toHaveLength(1);
    // Use the imported constant in the assertion — never a string literal —
    // to keep the test honest about what wire name is in play.
    expect(emitLogs[0]?.[0]).toBe(
      `[socket] emit ${DEPLOY_EVENT_CHANNEL} type=node_status → deploy:abc listeners=2`,
    );
  });

  it('logs `listeners=0` when no clients are subscribed', async () => {
    const { setupSocketService, emitDeployLog } = await freshSocketService();
    const { io } = makeFakeIo(); // empty rooms map
    setupSocketService(io as unknown as Parameters<typeof setupSocketService>[0]);

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    emitDeployLog('abc', {
      type: 'log',
      card_id: 'abc',
      level: 'warn',
      message: 'no listeners',
      at: 'now',
      seq: 1,
    });

    const emitLogs = log.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).startsWith('[socket] emit '),
    );
    expect(emitLogs).toHaveLength(1);
    expect(emitLogs[0]?.[0]).toBe(
      `[socket] emit ${DEPLOY_EVENT_CHANNEL} type=log → deploy:abc listeners=0`,
    );
  });
});
