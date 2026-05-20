/**
 * pdl-7 — `applyDeployEvent` is the route-by-discriminator function used
 * by both the live socket listener and the deploy-tape replay loop.
 * Centralising this means replay reproduces live state byte-for-byte.
 *
 * Tests assert that for each `event.type`:
 *   - the right slice action(s) are dispatched
 *   - the canvas overlay (`updateCardNodeData`) is dispatched with the
 *     right `deploy_status` / `deploy_progress` / `deploy_error` fields
 *   - the requirement_verified branch only mirrors managed-cert state
 */

// ─── Hoisted mocks (must come before SUT import) ───────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface CapturedEffect {
  cb: () => void | (() => void);
  deps: unknown[] | undefined;
  cleanup: void | (() => void);
}

const mocks = vi.hoisted(() => ({
  effects: [] as CapturedEffect[],
  api: {
    deploy: {
      getNodeOutputs: vi.fn(),
      getCurrentDeploy: vi.fn(),
      getDeployments: vi.fn(),
      getDeployStream: vi.fn(),
      getResources: vi.fn(),
    },
    onDeployEvent: vi.fn(
      (..._args: any[]) =>
        () =>
          undefined,
    ),
    subscribeDeployProgress: vi.fn(() => () => undefined),
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
      const cleanup = cb();
      mocks.effects.push({ cb, deps, cleanup });
    }),
  };
});

vi.mock('../../../../shared/api/api-adapter', () => ({
  getApi: () => mocks.api,
}));

import cardsReducer from '../../../../store/slices/cards-slice';
import deployReducer from '../../../../store/slices/deploy-slice';
import {
  applyDeployEvent,
  mapWireStatusToOverlay,
  overlayToWireStatus,
  useDeploySubscription,
} from '../use-deploy-subscription';
import type {
  DeployCompleteEvent,
  DeployEvent,
  DeployLogEvent,
  DeployNodeProgressEvent,
  DeployNodeStatusEvent,
  DeployRequirementVerifiedEvent,
} from '@ice/types';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const CARD = 'card-1';
const N1 = 'node-1';

type DispatchedAction = { type: string; payload?: any };

function makeDispatch(): { dispatch: (action: any) => any; calls: DispatchedAction[] } {
  const calls: DispatchedAction[] = [];
  const dispatch = vi.fn((action: any) => {
    calls.push(action);
    return action;
  });
  return { dispatch: dispatch as any, calls };
}

function findActions(calls: DispatchedAction[], typeSuffix: string): DispatchedAction[] {
  return calls.filter((a) => a.type === typeSuffix);
}

describe('mapWireStatusToOverlay', () => {
  it('maps every DeployNodeStatus to the canvas overlay string', () => {
    expect(mapWireStatusToOverlay('queued')).toBe('queued');
    expect(mapWireStatusToOverlay('applying')).toBe('deploying');
    expect(mapWireStatusToOverlay('succeeded')).toBe('active');
    expect(mapWireStatusToOverlay('failed')).toBe('error');
    expect(mapWireStatusToOverlay('skipped')).toBe('skipped');
    expect(mapWireStatusToOverlay('cancelled-due-to-dep')).toBe('cancelled');
  });
});

describe('overlayToWireStatus', () => {
  it('inverts every overlay back to the wire DeployNodeStatus', () => {
    expect(overlayToWireStatus('queued')).toBe('queued');
    expect(overlayToWireStatus('deploying')).toBe('applying');
    expect(overlayToWireStatus('active')).toBe('succeeded');
    expect(overlayToWireStatus('error')).toBe('failed');
    expect(overlayToWireStatus('skipped')).toBe('skipped');
    expect(overlayToWireStatus('cancelled')).toBe('cancelled-due-to-dep');
  });

  it('returns null for overlay strings that do not correspond to a wire status', () => {
    // pre-pdl-10 destroy paths wrote 'destroying' / 'gone' overlays that
    // never existed on the wire — the warm-seed must skip them rather
    // than guess. Phase 2.5 replay fills them in from the event tape.
    expect(overlayToWireStatus('destroying')).toBeNull();
    expect(overlayToWireStatus('gone')).toBeNull();
    expect(overlayToWireStatus('')).toBeNull();
    expect(overlayToWireStatus('whatever')).toBeNull();
  });

  it('round-trips through mapWireStatusToOverlay', () => {
    const all = ['queued', 'applying', 'succeeded', 'failed', 'skipped', 'cancelled-due-to-dep'] as const;
    for (const w of all) {
      expect(overlayToWireStatus(mapWireStatusToOverlay(w))).toBe(w);
    }
  });
});

describe('applyDeployEvent — node_status', () => {
  it('dispatches startDeploying, applyNodeStatusEvent, and updateCardNodeData', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: CARD,
      node_id: N1,
      resource_name: 'foo-redis-1',
      resource_type: 'gcp.redis.instance',
      action: 'create',
      status: 'applying',
      at: '2026-04-28T10:00:00.000Z',
      seq: 1,
    };
    applyDeployEvent(dispatch, event, CARD);

    expect(findActions(calls, 'deploy/startDeploying').length).toBe(1);
    expect(findActions(calls, 'deploy/applyNodeStatusEvent').length).toBe(1);

    const overlayCalls = findActions(calls, 'cards/updateCardNodeData');
    expect(overlayCalls).toHaveLength(1);
    expect(overlayCalls[0].payload).toEqual({
      nodeId: N1,
      data: { deploy_status: 'deploying' },
    });
  });

  it('passes a failed-event error through to deploy_error on the canvas', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: CARD,
      node_id: N1,
      resource_name: 'foo-redis-1',
      resource_type: 'gcp.redis.instance',
      action: 'create',
      status: 'failed',
      error: { code: 'QUOTA', message: 'Quota exceeded' },
      at: '2026-04-28T10:00:00.000Z',
      seq: 5,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload).toEqual({
      nodeId: N1,
      data: {
        deploy_status: 'error',
        deploy_error: 'Quota exceeded',
        deploy_progress: undefined,
      },
    });
  });

  it('clears deploy_progress on a terminal succeeded event and stamps last_deployed_at', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: CARD,
      node_id: N1,
      resource_name: 'foo-redis-1',
      resource_type: 'gcp.redis.instance',
      action: 'create',
      status: 'succeeded',
      duration_ms: 12345,
      at: '2026-04-28T10:00:00.000Z',
      seq: 5,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload.data).toMatchObject({
      deploy_status: 'active',
      deploy_progress: undefined,
      deploy_error: undefined,
      last_deployed_at: '2026-04-28T10:00:00.000Z',
    });
  });

  it('does not overwrite deploy_progress on a non-terminal status flip', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: CARD,
      node_id: N1,
      resource_name: 'foo-redis-1',
      resource_type: 'gcp.redis.instance',
      action: 'create',
      status: 'queued',
      at: '2026-04-28T10:00:00.000Z',
      seq: 1,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload.data).toEqual({ deploy_status: 'queued' });
    expect(overlay.payload.data).not.toHaveProperty('deploy_progress');
  });
});

describe('applyDeployEvent — node_progress', () => {
  it('dispatches applyNodeProgressEvent and mirrors deploy_progress to the canvas', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployNodeProgressEvent = {
      type: 'node_progress',
      card_id: CARD,
      node_id: N1,
      resource_name: 'foo-redis-1',
      step: { label: 'Provisioning instance', index: 1, total: 4 },
      at: '2026-04-28T10:00:00.000Z',
      seq: 2,
    };
    applyDeployEvent(dispatch, event, CARD);

    expect(findActions(calls, 'deploy/applyNodeProgressEvent').length).toBe(1);
    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload).toEqual({
      nodeId: N1,
      data: {
        deploy_progress: {
          step_label: 'Provisioning instance',
          step_index: 1,
          step_total: 4,
        },
      },
    });
  });
});

describe('applyDeployEvent — log', () => {
  it('appends the message to deploy.logs', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployLogEvent = {
      type: 'log',
      card_id: CARD,
      level: 'info',
      message: 'Configuring backend service…',
      at: '2026-04-28T10:00:00.000Z',
      seq: 3,
    };
    applyDeployEvent(dispatch, event, CARD);

    const appendLogs = findActions(calls, 'deploy/appendLog');
    expect(appendLogs).toHaveLength(1);
    expect(appendLogs[0].payload).toBe('Configuring backend service…');
  });
});

describe('applyDeployEvent — complete', () => {
  it('dispatches applyDeployCompleteEvent (success outcome)', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployCompleteEvent = {
      type: 'complete',
      card_id: CARD,
      outcome: 'success',
      totals: { queued: 0, applying: 0, succeeded: 5, failed: 0, skipped: 0, cancelled: 0 },
      at: '2026-04-28T10:05:00.000Z',
      seq: 99,
    };
    applyDeployEvent(dispatch, event, CARD);

    expect(findActions(calls, 'deploy/applyDeployCompleteEvent').length).toBe(1);
  });

  it('dispatches applyDeployCompleteEvent (partial outcome → status error)', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployCompleteEvent = {
      type: 'complete',
      card_id: CARD,
      outcome: 'partial',
      totals: { queued: 0, applying: 0, succeeded: 3, failed: 2, skipped: 0, cancelled: 0 },
      at: '2026-04-28T10:05:00.000Z',
      seq: 99,
    };
    applyDeployEvent(dispatch, event, CARD);

    const dispatched = findActions(calls, 'deploy/applyDeployCompleteEvent');
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].payload.outcome).toBe('partial');
  });
});

describe('applyDeployEvent — requirement_verified', () => {
  it('mirrors managed-cert ACTIVE status onto the canvas when satisfied', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployRequirementVerifiedEvent = {
      type: 'requirement_verified',
      card_id: CARD,
      node_id: N1,
      environment: 'production',
      requirement: 'managed-cert-issuance',
      status: 'satisfied',
      details: { managed_status: 'ACTIVE', domain_statuses: { 'foo.example.com': 'OK' } },
      at: '2026-04-28T11:00:00.000Z',
      seq: 1700000000000,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay).toBeDefined();
    expect(overlay.payload).toEqual({
      nodeId: N1,
      data: {
        cert_status: 'ACTIVE',
        cert_domain_statuses: { 'foo.example.com': 'OK' },
      },
    });
  });

  it("falls back to details.managed_status when status='unsatisfied'", () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployRequirementVerifiedEvent = {
      type: 'requirement_verified',
      card_id: CARD,
      node_id: N1,
      environment: 'staging',
      requirement: 'managed-cert-issuance',
      status: 'unsatisfied',
      details: { managed_status: 'PROVISIONING' },
      at: '2026-04-28T11:00:00.000Z',
      seq: 1700000000001,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload.data.cert_status).toBe('PROVISIONING');
  });

  it('uses PROVISIONING fallback when details is missing', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployRequirementVerifiedEvent = {
      type: 'requirement_verified',
      card_id: CARD,
      node_id: N1,
      environment: 'staging',
      requirement: 'managed-cert-issuance',
      status: 'unsatisfied',
      at: '2026-04-28T11:00:00.000Z',
      seq: 1700000000002,
    };
    applyDeployEvent(dispatch, event, CARD);

    const overlay = findActions(calls, 'cards/updateCardNodeData')[0];
    expect(overlay.payload.data.cert_status).toBe('PROVISIONING');
  });

  it('does not dispatch for other requirement ids', () => {
    const { dispatch, calls } = makeDispatch();
    const event: DeployRequirementVerifiedEvent = {
      type: 'requirement_verified',
      card_id: CARD,
      node_id: N1,
      environment: 'staging',
      requirement: 'dns-verification',
      status: 'satisfied',
      at: '2026-04-28T11:00:00.000Z',
      seq: 1700000000003,
    };
    applyDeployEvent(dispatch, event, CARD);

    expect(findActions(calls, 'cards/updateCardNodeData')).toHaveLength(0);
  });
});

describe('applyDeployEvent — defensive', () => {
  it('returns silently for null / undefined event', () => {
    const { dispatch, calls } = makeDispatch();
    applyDeployEvent(dispatch, null);
    applyDeployEvent(dispatch, undefined);
    expect(calls).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// useDeploySubscription — Phase 1 / 2 / 2.5 / 3 hook-body tests
// ────────────────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: { deploy: deployReducer, cards: cardsReducer },
  });
}

function captureHook(store: ReturnType<typeof makeStore>, cardId: string | undefined) {
  const Probe: React.FC = () => {
    useDeploySubscription(cardId);
    return null;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
}

beforeEach(() => {
  mocks.effects.length = 0;
  vi.clearAllMocks();
  // Default safe rejections so unawaited paths don't throw
  mocks.api.deploy.getNodeOutputs.mockResolvedValue({ overlay: {} });
  mocks.api.deploy.getCurrentDeploy.mockResolvedValue({ snapshot: null });
  mocks.api.deploy.getDeployments.mockResolvedValue([]);
  mocks.api.deploy.getDeployStream.mockResolvedValue({ events: [] });
  mocks.api.deploy.getResources.mockResolvedValue({ success: true, resources: [] });
  mocks.api.onDeployEvent.mockImplementation(() => () => undefined);
  mocks.api.subscribeDeployProgress.mockImplementation(() => () => undefined);
});

// ─── Eager init effect (mount-only) ─────────────────────────────────────────

describe('useDeploySubscription — eager-init effect', () => {
  it('calls onDeployEvent with a no-op on mount and returns its cleanup', async () => {
    const cleanupSpy = vi.fn();
    mocks.api.onDeployEvent.mockImplementationOnce(() => cleanupSpy);
    const store = makeStore();
    captureHook(store, 'card-1');
    // Effect 0 is the eager-init (empty deps)
    expect(mocks.effects[0].deps).toEqual([]);
    expect(mocks.api.onDeployEvent).toHaveBeenCalled();
    // Run the effect's cleanup
    const cleanup = mocks.effects[0].cleanup;
    if (typeof cleanup === 'function') cleanup();
    expect(cleanupSpy).toHaveBeenCalled();
  });

  it('handles onDeployEvent being absent on the API (eager-init returns early)', () => {
    const original = mocks.api.onDeployEvent;
    (mocks.api as any).onDeployEvent = undefined;
    try {
      const store = makeStore();
      // Phase 3 also calls api.onDeployEvent unconditionally — to keep this test
      // focused on the eager-init guard, only inspect after one effect runs.
      expect(() => captureHook(store, undefined)).not.toThrow();
    } finally {
      mocks.api.onDeployEvent = original;
    }
  });
});

// ─── Phase 1: getNodeOutputs ────────────────────────────────────────────────

describe('useDeploySubscription — Phase 1 (getNodeOutputs)', () => {
  it('does not call getNodeOutputs when cardId is undefined', () => {
    captureHook(makeStore(), undefined);
    expect(mocks.api.deploy.getNodeOutputs).not.toHaveBeenCalled();
  });

  it('calls getNodeOutputs and dispatches updateCardNodeData per overlay entry', async () => {
    mocks.api.deploy.getNodeOutputs.mockResolvedValueOnce({
      overlay: {
        nodeA: { deploy_status: 'active', url: 'https://a' },
        nodeB: { deploy_status: 'queued' },
      },
    });
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mocks.api.deploy.getNodeOutputs).toHaveBeenCalledWith('card-1', expect.anything());
    const updates = dispatchSpy.mock.calls
      .map((c) => c[0] as { type: string; payload?: any })
      .filter((a) => a.type === 'cards/updateCardNodeData');
    expect(updates.length).toBeGreaterThanOrEqual(2);
    expect(updates.find((a) => a.payload.nodeId === 'nodeA')?.payload.data.url).toBe('https://a');
  });

  it('Phase 1 with empty overlay dispatches nothing', async () => {
    mocks.api.deploy.getNodeOutputs.mockResolvedValueOnce({ overlay: {} });
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();
    const updates = dispatchSpy.mock.calls
      .map((c) => c[0] as { type: string })
      .filter((a) => a.type === 'cards/updateCardNodeData');
    expect(updates.length).toBe(0);
  });

  it('Phase 1 with res === undefined falls back to empty overlay', async () => {
    mocks.api.deploy.getNodeOutputs.mockResolvedValueOnce(undefined);
    const store = makeStore();
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();
    // Should not throw — `res?.overlay || {}` covers it
    expect(mocks.api.deploy.getNodeOutputs).toHaveBeenCalled();
  });

  it('Phase 1 swallows getNodeOutputs rejections', async () => {
    mocks.api.deploy.getNodeOutputs.mockRejectedValueOnce(new Error('500'));
    const store = makeStore();
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();
    // No throw
    expect(true).toBe(true);
  });

  it('Phase 1 cleanup sets cancelled and skips dispatch on late resolution', async () => {
    let resolve: (v: any) => void;
    mocks.api.deploy.getNodeOutputs.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');

    // The Phase-1 effect is at index 1 (eager-init=0)
    const phase1 = mocks.effects[1];
    if (typeof phase1.cleanup === 'function') phase1.cleanup();

    resolve!({ overlay: { nodeA: { deploy_status: 'active' } } });
    await flushMicrotasks();
    await flushMicrotasks();

    const updates = dispatchSpy.mock.calls
      .map((c) => c[0] as { type: string })
      .filter((a) => a.type === 'cards/updateCardNodeData');
    expect(updates.length).toBe(0);
  });
});

// ─── Phase 2: snapshot warm-seed ────────────────────────────────────────────

describe('useDeploySubscription — Phase 2 (snapshot)', () => {
  it('does nothing when snapshot is null', async () => {
    mocks.api.deploy.getCurrentDeploy.mockResolvedValueOnce({ snapshot: null });
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/startDeploying');
  });

  it('drops a stale "deploying" snapshot when DB has terminal apply row', async () => {
    mocks.api.deploy.getCurrentDeploy.mockResolvedValueOnce({
      snapshot: { status: 'deploying', nodeStatuses: { n1: { deploy_status: 'deploying' } } },
    });
    mocks.api.deploy.getDeployments.mockResolvedValueOnce([{ action_type: 'apply', status: 'success' }]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/startDeploying');
    log.mockRestore();
  });

  it('applies deploying snapshot when no terminal DB row', async () => {
    mocks.api.deploy.getCurrentDeploy.mockResolvedValueOnce({
      snapshot: {
        status: 'deploying',
        nodeStatuses: {
          n1: { deploy_status: 'deploying', step: { label: 'apply', index: 1, total: 4 } },
          n2: { deploy_status: 'active' },
          n3: { deploy_status: 'gone' }, // no wire mapping → continue
        },
      },
    });
    mocks.api.deploy.getDeployments.mockResolvedValueOnce([
      { action_type: 'plan', status: 'success' }, // not terminal apply/rollback
    ]);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();

    const calls = dispatchSpy.mock.calls.map((c) => c[0] as { type: string; payload?: any });
    expect(calls.find((a) => a.type === 'deploy/startDeploying')).toBeDefined();
    // Synthetic node_status events for n1 and n2 (not n3 — wireStatus is null)
    const synth = calls.filter((a) => a.type === 'deploy/applyNodeStatusEvent');
    expect(synth.length).toBe(2);
    // Per-node progress for the one with step + applying
    const progressEvents = calls.filter((a) => a.type === 'deploy/applyNodeProgressEvent');
    expect(progressEvents.length).toBe(1);
  });

  it('handles snapshot.status === "planning"', async () => {
    mocks.api.deploy.getCurrentDeploy.mockResolvedValueOnce({
      snapshot: { status: 'planning', nodeStatuses: {} },
    });
    mocks.api.deploy.getDeployments.mockResolvedValueOnce([]);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('deploy/startDeploying');
  });

  it('skips snapshot with terminal status (e.g. "success")', async () => {
    mocks.api.deploy.getCurrentDeploy.mockResolvedValueOnce({
      snapshot: { status: 'success', nodeStatuses: {} },
    });
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/startDeploying');
  });

  it('catches getCurrentDeploy rejection silently', async () => {
    mocks.api.deploy.getCurrentDeploy.mockRejectedValueOnce(new Error('500'));
    const store = makeStore();
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();
    expect(true).toBe(true);
  });

  it('treats getDeployments rejection as empty history (catch in Promise.all)', async () => {
    mocks.api.deploy.getCurrentDeploy.mockResolvedValueOnce({
      snapshot: { status: 'deploying', nodeStatuses: {} },
    });
    mocks.api.deploy.getDeployments.mockRejectedValueOnce(new Error('500'));
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    // Empty history → no terminal → startDeploying still fires
    expect(types).toContain('deploy/startDeploying');
  });

  it('Phase 2 skipped entirely when cardId undefined', () => {
    captureHook(makeStore(), undefined);
    expect(mocks.api.deploy.getCurrentDeploy).not.toHaveBeenCalled();
  });

  it('Phase 2 cleanup cancels late dispatch', async () => {
    let resolve: (v: any) => void;
    mocks.api.deploy.getCurrentDeploy.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    mocks.api.deploy.getDeployments.mockResolvedValueOnce([]);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    // Phase 2 effect is at index 2 (eager=0, phase1=1, phase2=2)
    const phase2 = mocks.effects[2];
    if (typeof phase2.cleanup === 'function') phase2.cleanup();
    resolve!({ snapshot: { status: 'deploying', nodeStatuses: {} } });
    await flushMicrotasks();
    await flushMicrotasks();
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/startDeploying');
  });
});

// ─── Phase 2.5: replay ──────────────────────────────────────────────────────

describe('useDeploySubscription — Phase 2.5 (replay)', () => {
  it('replays events from the deploy stream', async () => {
    const event: DeployNodeStatusEvent = {
      type: 'node_status',
      card_id: 'card-1',
      node_id: 'n1',
      resource_name: 'r',
      resource_type: 't',
      action: 'create',
      status: 'applying',
      at: '2026-04-01T00:00:00Z',
      seq: 5,
    };
    mocks.api.deploy.getDeployStream.mockResolvedValueOnce({
      events: [{ seq: 5, type: 'node_status', payload: event }],
    });
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mocks.api.deploy.getDeployStream).toHaveBeenCalledWith('card-1', 0);
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('deploy/applyNodeStatusEvent');
  });

  it('handles getDeployStream returning undefined (defaults to empty events)', async () => {
    mocks.api.deploy.getDeployStream.mockResolvedValueOnce(undefined);
    const store = makeStore();
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();
    expect(true).toBe(true);
  });

  it('catches getDeployStream rejection silently', async () => {
    mocks.api.deploy.getDeployStream.mockRejectedValueOnce(new Error('500'));
    const store = makeStore();
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();
    expect(true).toBe(true);
  });

  it('Phase 2.5 skipped entirely when cardId undefined', () => {
    captureHook(makeStore(), undefined);
    expect(mocks.api.deploy.getDeployStream).not.toHaveBeenCalled();
  });

  it('Phase 2.5 cleanup cancels late events', async () => {
    let resolve: (v: any) => void;
    mocks.api.deploy.getDeployStream.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    // Phase 2.5 is index 3
    const phase25 = mocks.effects[3];
    if (typeof phase25.cleanup === 'function') phase25.cleanup();
    resolve!({
      events: [{ seq: 1, type: 'node_status', payload: { type: 'node_status', node_id: 'n', status: 'applying' } }],
    });
    await flushMicrotasks();
    await flushMicrotasks();
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/applyNodeStatusEvent');
  });
});

// ─── Phase 3: live socket ───────────────────────────────────────────────────

describe('useDeploySubscription — Phase 3 (live)', () => {
  it('subscribes to the deploy room and registers an onDeployEvent listener', () => {
    const store = makeStore();
    captureHook(store, 'card-1');
    // Mock returns ()=>undefined so subscribe must have been called once
    expect(mocks.api.subscribeDeployProgress).toHaveBeenCalledWith('card-1');
    // onDeployEvent is called twice — once eager-init (mount), once Phase 3
    expect(mocks.api.onDeployEvent.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('routes incoming events through applyDeployEvent', () => {
    let liveCb: ((e: DeployEvent) => void) | null = null;
    // Eager-init call returns first; Phase 3 is the SECOND onDeployEvent call
    mocks.api.onDeployEvent
      .mockImplementationOnce(() => () => undefined)
      .mockImplementationOnce((cb: any) => {
        liveCb = cb;
        return () => undefined;
      });
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');

    expect(liveCb).not.toBeNull();
    const event: DeployLogEvent = {
      type: 'log',
      card_id: 'card-1',
      level: 'info',
      message: 'hi',
      at: '2026-04-01T00:00:00Z',
      seq: 1,
    };
    liveCb!(event);
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('deploy/appendLog');
  });

  it('on success complete event, fetches resources + node outputs', async () => {
    let liveCb: ((e: DeployEvent) => void) | null = null;
    mocks.api.onDeployEvent
      .mockImplementationOnce(() => () => undefined)
      .mockImplementationOnce((cb: any) => {
        liveCb = cb;
        return () => undefined;
      });
    mocks.api.deploy.getDeployments.mockResolvedValue([
      {
        id: 'd1',
        status: 'success',
        action_type: 'apply',
        environment: 'production',
        duration_ms: 1234,
        results: { resources: [{ name: 'r1' }] },
      },
    ]);
    mocks.api.deploy.getResources.mockResolvedValueOnce({
      success: true,
      resources: [{ name: 'r1', kind: 'service' }],
    });
    mocks.api.deploy.getNodeOutputs.mockResolvedValue({
      overlay: { nodeA: { url: 'https://a' } },
    });

    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');

    const complete: DeployCompleteEvent = {
      type: 'complete',
      card_id: 'card-1',
      outcome: 'success',
      totals: { queued: 0, applying: 0, succeeded: 1, failed: 0, skipped: 0, cancelled: 0 },
      at: '2026-04-01T00:01:00Z',
      seq: 99,
    };
    liveCb!(complete);
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('deploy/applyDeployCompleteEvent');
    expect(types).toContain('deploy/hydrateDeployFromHistory');
    expect(types).toContain('deploy/setDeployedResources');
    expect(mocks.api.deploy.getResources).toHaveBeenCalledWith('card-1');
  });

  it('on partial complete event, hydrates from history but skips success-only fetches', async () => {
    let liveCb: ((e: DeployEvent) => void) | null = null;
    mocks.api.onDeployEvent
      .mockImplementationOnce(() => () => undefined)
      .mockImplementationOnce((cb: any) => {
        liveCb = cb;
        return () => undefined;
      });
    // Use mockResolvedValue (not Once) — Phase 2 also calls it
    mocks.api.deploy.getDeployments.mockResolvedValue([
      {
        id: 'd1',
        status: 'partial',
        action_type: 'apply',
        results: { resources: [] },
      },
    ]);

    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    // Wait for Phase 2 to settle (it would also see the partial row but its
    // own snapshot is null so it short-circuits before consulting history)
    await flushMicrotasks();
    await flushMicrotasks();

    const complete: DeployCompleteEvent = {
      type: 'complete',
      card_id: 'card-1',
      outcome: 'partial',
      totals: { queued: 0, applying: 0, succeeded: 1, failed: 1, skipped: 0, cancelled: 0 },
      at: '2026-04-01T00:01:00Z',
      seq: 99,
    };
    liveCb!(complete);
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('deploy/hydrateDeployFromHistory');
    expect(mocks.api.deploy.getResources).not.toHaveBeenCalled();
  });

  it('skips hydrate when history is empty array', async () => {
    let liveCb: ((e: DeployEvent) => void) | null = null;
    mocks.api.onDeployEvent
      .mockImplementationOnce(() => () => undefined)
      .mockImplementationOnce((cb: any) => {
        liveCb = cb;
        return () => undefined;
      });
    mocks.api.deploy.getDeployments.mockResolvedValueOnce([]);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');

    const complete: DeployCompleteEvent = {
      type: 'complete',
      card_id: 'card-1',
      outcome: 'failure',
      totals: { queued: 0, applying: 0, succeeded: 0, failed: 1, skipped: 0, cancelled: 0 },
      at: '2026-04-01T00:01:00Z',
      seq: 99,
    };
    liveCb!(complete);
    await flushMicrotasks();
    await flushMicrotasks();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/hydrateDeployFromHistory');
  });

  it('skips hydrate when no terminal apply/rollback found in history', async () => {
    let liveCb: ((e: DeployEvent) => void) | null = null;
    mocks.api.onDeployEvent
      .mockImplementationOnce(() => () => undefined)
      .mockImplementationOnce((cb: any) => {
        liveCb = cb;
        return () => undefined;
      });
    mocks.api.deploy.getDeployments.mockResolvedValueOnce([
      { action_type: 'plan', status: 'success' }, // not terminal-apply
    ]);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');

    const complete: DeployCompleteEvent = {
      type: 'complete',
      card_id: 'card-1',
      outcome: 'failure',
      totals: { queued: 0, applying: 0, succeeded: 0, failed: 1, skipped: 0, cancelled: 0 },
      at: '2026-04-01T00:01:00Z',
      seq: 99,
    };
    liveCb!(complete);
    await flushMicrotasks();
    await flushMicrotasks();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/hydrateDeployFromHistory');
  });

  it('treats history with non-array results as empty resources array', async () => {
    let liveCb: ((e: DeployEvent) => void) | null = null;
    mocks.api.onDeployEvent
      .mockImplementationOnce(() => () => undefined)
      .mockImplementationOnce((cb: any) => {
        liveCb = cb;
        return () => undefined;
      });
    mocks.api.deploy.getDeployments.mockResolvedValue([
      {
        id: 'd1',
        status: 'success',
        action_type: 'apply',
        results: null, // not an object with .resources
      },
    ]);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');
    await flushMicrotasks();
    await flushMicrotasks();

    const complete: DeployCompleteEvent = {
      type: 'complete',
      card_id: 'card-1',
      outcome: 'success',
      totals: { queued: 0, applying: 0, succeeded: 1, failed: 0, skipped: 0, cancelled: 0 },
      at: '2026-04-01T00:01:00Z',
      seq: 99,
    };
    liveCb!(complete);
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    const hydrate = dispatchSpy.mock.calls
      .map((c) => c[0] as { type: string; payload?: any })
      .find((a) => a.type === 'deploy/hydrateDeployFromHistory');
    expect(hydrate?.payload.results).toEqual([]);
  });

  it('non-complete events do not trigger the post-complete fetch', async () => {
    let liveCb: ((e: DeployEvent) => void) | null = null;
    mocks.api.onDeployEvent
      .mockImplementationOnce(() => () => undefined)
      .mockImplementationOnce((cb: any) => {
        liveCb = cb;
        return () => undefined;
      });
    const store = makeStore();
    captureHook(store, 'card-1');

    // Phase 2 (snapshot) also calls getDeployments. Wait for that to settle then clear.
    await flushMicrotasks();
    await flushMicrotasks();
    mocks.api.deploy.getDeployments.mockClear();

    const log: DeployLogEvent = {
      type: 'log',
      card_id: 'card-1',
      level: 'info',
      message: 'hi',
      at: '',
      seq: 1,
    };
    liveCb!(log);
    await flushMicrotasks();
    expect(mocks.api.deploy.getDeployments).not.toHaveBeenCalled();
  });

  it('catches getDeployments rejection on complete', async () => {
    let liveCb: ((e: DeployEvent) => void) | null = null;
    mocks.api.onDeployEvent
      .mockImplementationOnce(() => () => undefined)
      .mockImplementationOnce((cb: any) => {
        liveCb = cb;
        return () => undefined;
      });
    mocks.api.deploy.getDeployments.mockRejectedValueOnce(new Error('500'));
    const store = makeStore();
    captureHook(store, 'card-1');

    const complete: DeployCompleteEvent = {
      type: 'complete',
      card_id: 'card-1',
      outcome: 'failure',
      totals: { queued: 0, applying: 0, succeeded: 0, failed: 1, skipped: 0, cancelled: 0 },
      at: '',
      seq: 99,
    };
    liveCb!(complete);
    await flushMicrotasks();
    await flushMicrotasks();
    // No throw
    expect(true).toBe(true);
  });

  it('catches getResources rejection on success complete', async () => {
    let liveCb: ((e: DeployEvent) => void) | null = null;
    mocks.api.onDeployEvent
      .mockImplementationOnce(() => () => undefined)
      .mockImplementationOnce((cb: any) => {
        liveCb = cb;
        return () => undefined;
      });
    mocks.api.deploy.getDeployments.mockResolvedValue([
      { id: 'd1', status: 'success', action_type: 'apply', results: { resources: [] } },
    ]);
    mocks.api.deploy.getResources.mockRejectedValueOnce(new Error('500'));
    mocks.api.deploy.getNodeOutputs.mockResolvedValue({ overlay: {} });
    const store = makeStore();
    captureHook(store, 'card-1');

    const complete: DeployCompleteEvent = {
      type: 'complete',
      card_id: 'card-1',
      outcome: 'success',
      totals: { queued: 0, applying: 0, succeeded: 1, failed: 0, skipped: 0, cancelled: 0 },
      at: '',
      seq: 99,
    };
    liveCb!(complete);
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(true).toBe(true);
  });

  it('skips setDeployedResources when getResources returns success=false', async () => {
    let liveCb: ((e: DeployEvent) => void) | null = null;
    mocks.api.onDeployEvent
      .mockImplementationOnce(() => () => undefined)
      .mockImplementationOnce((cb: any) => {
        liveCb = cb;
        return () => undefined;
      });
    mocks.api.deploy.getDeployments.mockResolvedValue([
      { id: 'd1', status: 'success', action_type: 'apply', results: { resources: [] } },
    ]);
    mocks.api.deploy.getResources.mockResolvedValueOnce({ success: false });
    mocks.api.deploy.getNodeOutputs.mockResolvedValue({ overlay: {} });
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook(store, 'card-1');

    const complete: DeployCompleteEvent = {
      type: 'complete',
      card_id: 'card-1',
      outcome: 'success',
      totals: { queued: 0, applying: 0, succeeded: 1, failed: 0, skipped: 0, cancelled: 0 },
      at: '',
      seq: 99,
    };
    liveCb!(complete);
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/setDeployedResources');
  });

  it('Phase 3 skipped entirely when cardId undefined', () => {
    captureHook(makeStore(), undefined);
    expect(mocks.api.subscribeDeployProgress).not.toHaveBeenCalled();
  });

  it('Phase 3 cleanup invokes both unsubRoom and the listener cleanup', () => {
    const cleanupRoom = vi.fn();
    const cleanupListener = vi.fn();
    mocks.api.subscribeDeployProgress.mockReturnValueOnce(cleanupRoom);
    mocks.api.onDeployEvent
      .mockImplementationOnce(() => () => undefined) // eager
      .mockImplementationOnce(() => cleanupListener); // phase 3
    const store = makeStore();
    captureHook(store, 'card-1');

    // Phase 3 effect index = 4 (eager=0, p1=1, p2=2, p25=3, p3=4)
    const phase3 = mocks.effects[4];
    expect(typeof phase3.cleanup).toBe('function');
    if (typeof phase3.cleanup === 'function') phase3.cleanup();
    expect(cleanupRoom).toHaveBeenCalled();
    expect(cleanupListener).toHaveBeenCalled();
  });

  it('Phase 3 cleanup tolerates missing subscribeDeployProgress', () => {
    (mocks.api as any).subscribeDeployProgress = undefined;
    const cleanupListener = vi.fn();
    mocks.api.onDeployEvent.mockImplementationOnce(() => () => undefined).mockImplementationOnce(() => cleanupListener);
    const store = makeStore();
    captureHook(store, 'card-1');
    const phase3 = mocks.effects[4];
    if (typeof phase3.cleanup === 'function') phase3.cleanup();
    expect(cleanupListener).toHaveBeenCalled();
    // Restore
    mocks.api.subscribeDeployProgress = vi.fn(() => () => undefined);
  });
});
