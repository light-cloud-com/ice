/**
 * rf-pdpl-20 — useDeployActions hook.
 *
 * Six callback-returning useCallbacks that dispatch slice actions and call
 * the deploy API. Tests follow the rf-props-8 capture-ref-after-render
 * pattern: render the hook through a Provider-wrapped Probe, capture the
 * returned object via a ref, then invoke the callbacks directly in async
 * test code so we can drive every branch of plan/deploy + the
 * retry-after-auth re-dispatch path.
 *
 * RISK #2 from the rf-pdpl blueprint: handlePlan and handleDeploy
 * re-dispatch `startPlanning` / `startDeploying` BEFORE the retry call after
 * a successful auth. The retry-after-auth tests assert the type-ordered
 * dispatch trace explicitly so this contract stays observable.
 */

import React, { useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Helper to inspect dispatched actions. Redux Toolkit types its dispatch
// argument as `UnknownAction` which doesn't expose `.payload`; cast through
// `unknown` to a structural shape for assertions.
type DispatchedAction<P = unknown> = { type: string; payload?: P };
function asAction<P = unknown>(call: unknown): DispatchedAction<P> {
  return call as unknown as DispatchedAction<P>;
}

// Microtask flush — equivalent to setImmediate but works in both Node and
// browser test envs without a setImmediate global.
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Mocks (must be before the hook import) ─────────────────────────────────

const mockDeployApi = {
  authenticate: vi.fn(),
  requirements: vi.fn(),
  plan: vi.fn(),
  apply: vi.fn(),
  getResources: vi.fn(),
};

vi.mock('../../../../shared/api/api-adapter', () => ({
  getApi: () => ({ deploy: mockDeployApi }),
}));

import cardsReducer, { type Card } from '../../../../store/slices/cards-slice';
import deployReducer, { type DeployState } from '../../../../store/slices/deploy-slice';
import { useDeployActions, type UseDeployActionsReturn } from '../use-deploy-actions';

// ─── Store + capture helpers ────────────────────────────────────────────────

const makeStore = () =>
  configureStore({
    reducer: {
      deploy: deployReducer,
      cards: cardsReducer,
    },
  });

type TestStore = ReturnType<typeof makeStore>;

const ACTIVE_CARD: Card = {
  id: 'card-1',
  name: 'Test card',
  nodes: [{ id: 'n1', type: 'resource', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} }],
  edges: [],
  viewport: { panX: 0, panY: 0, scale: 1 },
  createdAt: 0,
};

interface Captured {
  actions: UseDeployActionsReturn;
  pendingRetryRef: React.MutableRefObject<'plan' | 'deploy' | null>;
}

function captureHook(args: {
  activeCard?: Card | null;
  deploy?: Partial<DeployState>;
  store: TestStore;
}): Captured {
  const captured: { current?: Captured } = {};
  const baseDeploy: DeployState = args.store.getState().deploy;
  const deploy = { ...baseDeploy, ...args.deploy };
  const Probe: React.FC = () => {
    const ref = useRef<'plan' | 'deploy' | null>(null);
    const actions = useDeployActions({
      activeCard: args.activeCard ?? null,
      deploy,
      pendingRetryRef: ref,
    });
    captured.current = { actions, pendingRetryRef: ref };
    return null;
  };
  renderToString(
    <Provider store={args.store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('hook did not render');
  return captured.current;
}

beforeEach(() => {
  for (const fn of Object.values(mockDeployApi)) fn.mockReset();
});

// ────────────────────────────────────────────────────────────────────────────
// handleAuthenticate
// ────────────────────────────────────────────────────────────────────────────

describe('handleAuthenticate', () => {
  it('dispatches startAuthenticating, sets pendingRetryRef, and returns true on success', async () => {
    const store = makeStore();
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions, pendingRetryRef } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    const result = await actions.handleAuthenticate('plan');

    expect(result).toBe(true);
    expect(pendingRetryRef.current).toBe('plan');
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(['deploy/startAuthenticating', 'deploy/authSuccess']);
  });

  it('clears pendingRetryRef when retryAction is omitted (defaults to null)', async () => {
    const store = makeStore();
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    const { actions, pendingRetryRef } = captureHook({ activeCard: ACTIVE_CARD, store });

    pendingRetryRef.current = 'deploy';
    const result = await actions.handleAuthenticate();

    expect(result).toBe(true);
    expect(pendingRetryRef.current).toBe(null);
  });

  it('on result.success === false, dispatches authFailed (with error), clears ref, returns false', async () => {
    const store = makeStore();
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: false, error: 'no-token' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions, pendingRetryRef } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    const result = await actions.handleAuthenticate('deploy');

    expect(result).toBe(false);
    expect(pendingRetryRef.current).toBe(null);
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(['deploy/startAuthenticating', 'deploy/authFailed']);
    const failed = dispatchSpy.mock.calls[1][0] as unknown as { payload: string };
    expect(failed.payload).toBe('no-token');
  });

  it('on result.success === false without error, falls back to "Authentication failed"', async () => {
    const store = makeStore();
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: false });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleAuthenticate('plan');

    const failed = dispatchSpy.mock.calls[1][0] as unknown as { payload: string };
    expect(failed.payload).toBe('Authentication failed');
  });

  it('on throw with err.message, dispatches authFailed with the message and returns false', async () => {
    const store = makeStore();
    mockDeployApi.authenticate.mockRejectedValueOnce(new Error('network'));
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions, pendingRetryRef } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    pendingRetryRef.current = 'plan';
    const result = await actions.handleAuthenticate('plan');

    expect(result).toBe(false);
    expect(pendingRetryRef.current).toBe(null);
    const failed = dispatchSpy.mock.calls[1][0] as unknown as { type: string; payload: string };
    expect(failed.type).toBe('deploy/authFailed');
    expect(failed.payload).toBe('network');
  });

  it('on throw without err.message, falls back to "Authentication failed"', async () => {
    const store = makeStore();
    mockDeployApi.authenticate.mockRejectedValueOnce({ /* no .message */ } as any);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleAuthenticate('plan');

    const failed = dispatchSpy.mock.calls[1][0] as unknown as { payload: string };
    expect(failed.payload).toBe('Authentication failed');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// fetchRequirements
// ────────────────────────────────────────────────────────────────────────────

describe('fetchRequirements', () => {
  it('is a no-op when activeCard is null', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: null, store });
    dispatchSpy.mockClear();

    await actions.fetchRequirements();

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mockDeployApi.requirements).not.toHaveBeenCalled();
  });

  it('dispatches startRequirementsFetch + setRequirements on success with array', async () => {
    const store = makeStore();
    mockDeployApi.requirements.mockResolvedValueOnce({
      success: true,
      requirements: [{ definitionId: 'req-1', status: 'unmet' }],
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { provider: 'gcp', gcpProject: 'lc-ice', region: 'us-central1', environment: 'production' },
      store,
    });
    dispatchSpy.mockClear();

    await actions.fetchRequirements();

    expect(mockDeployApi.requirements).toHaveBeenCalledWith(
      'card-1',
      ACTIVE_CARD.nodes,
      { provider: 'gcp', gcpProject: 'lc-ice', region: 'us-central1', environment: 'production' },
    );
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(['deploy/startRequirementsFetch', 'deploy/setRequirements']);
    const setReq = dispatchSpy.mock.calls[1][0] as unknown as { payload: unknown[] };
    expect(setReq.payload).toEqual([{ definitionId: 'req-1', status: 'unmet' }]);
  });

  it('on success: false, dispatches setRequirements([]) (empty array fallback)', async () => {
    const store = makeStore();
    mockDeployApi.requirements.mockResolvedValueOnce({ success: false });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.fetchRequirements();

    const setReq = dispatchSpy.mock.calls[1][0] as unknown as { payload: unknown[] };
    expect(setReq.payload).toEqual([]);
  });

  it('on success: true but non-array requirements, dispatches setRequirements([])', async () => {
    const store = makeStore();
    mockDeployApi.requirements.mockResolvedValueOnce({ success: true, requirements: null });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.fetchRequirements();

    const setReq = dispatchSpy.mock.calls[1][0] as unknown as { payload: unknown[] };
    expect(setReq.payload).toEqual([]);
  });

  it('on throw with err.message, dispatches setRequirements([]) + appendLog', async () => {
    const store = makeStore();
    mockDeployApi.requirements.mockRejectedValueOnce(new Error('boom'));
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.fetchRequirements();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(['deploy/startRequirementsFetch', 'deploy/setRequirements', 'deploy/appendLog']);
    const log = dispatchSpy.mock.calls[2][0] as unknown as { payload: string };
    expect(log.payload).toBe('Requirements check failed: boom');
  });

  it('on throw with no err.message, falls back to coercing the error itself in the log', async () => {
    const store = makeStore();
    // Reject with an object that has no `.message` field — the source uses
    // `err?.message || err` so the appendLog ends up stringifying the object.
    mockDeployApi.requirements.mockRejectedValueOnce('raw-string-err');
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.fetchRequirements();

    const log = dispatchSpy.mock.calls[2][0] as unknown as { payload: string };
    expect(log.payload).toBe('Requirements check failed: raw-string-err');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleVerifyRequirement
// ────────────────────────────────────────────────────────────────────────────

describe('handleVerifyRequirement', () => {
  it('passthrough — calls fetchRequirements once', async () => {
    const store = makeStore();
    mockDeployApi.requirements.mockResolvedValueOnce({ success: true, requirements: [] });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleVerifyRequirement('req-1', 'n1');

    expect(mockDeployApi.requirements).toHaveBeenCalledTimes(1);
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(['deploy/startRequirementsFetch', 'deploy/setRequirements']);
  });

  it('passthrough — accepts an undefined nodeId', async () => {
    const store = makeStore();
    mockDeployApi.requirements.mockResolvedValueOnce({ success: true, requirements: [] });
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });

    await actions.handleVerifyRequirement('req-1', undefined);

    expect(mockDeployApi.requirements).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handlePlan
// ────────────────────────────────────────────────────────────────────────────

describe('handlePlan', () => {
  it('is a no-op when activeCard is null', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: null, store });
    dispatchSpy.mockClear();

    await actions.handlePlan();

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mockDeployApi.plan).not.toHaveBeenCalled();
  });

  it('on success, dispatches startPlanning + setPlan and fires fetchRequirements (fire-and-forget)', async () => {
    const store = makeStore();
    mockDeployApi.plan.mockResolvedValueOnce({ success: true, plan: { resources: [] } });
    mockDeployApi.requirements.mockResolvedValueOnce({ success: true, requirements: [] });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { provider: 'gcp', gcpProject: 'p', region: 'r', environment: 'production' },
      store,
    });
    dispatchSpy.mockClear();

    await actions.handlePlan();
    // Allow the fire-and-forget fetchRequirements promise to flush.
    await flushMicrotasks();

    expect(mockDeployApi.plan).toHaveBeenCalledWith('card-1', ACTIVE_CARD.nodes, ACTIVE_CARD.edges, {
      provider: 'gcp',
      gcpProject: 'p',
      region: 'r',
      environment: 'production',
    });
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    // First two are deterministic; the trailing requirements pair comes from fetchRequirements.
    expect(types[0]).toBe('deploy/startPlanning');
    expect(types[1]).toBe('deploy/setPlan');
    expect(types).toContain('deploy/startRequirementsFetch');
    expect(types).toContain('deploy/setRequirements');
  });

  it('swallows fetchRequirements rejections (fire-and-forget catch)', async () => {
    const store = makeStore();
    mockDeployApi.plan.mockResolvedValueOnce({ success: true, plan: { resources: [] } });
    mockDeployApi.requirements.mockRejectedValueOnce(new Error('req-boom'));
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    // Should NOT throw despite the rejected requirements promise.
    await expect(actions.handlePlan()).resolves.toBeUndefined();
    await flushMicrotasks();
  });

  it('on needsAuth → auth=true → re-dispatches startPlanning BEFORE retry → setPlan on retry success', async () => {
    const store = makeStore();
    mockDeployApi.plan
      .mockResolvedValueOnce({ success: false, needsAuth: true })
      .mockResolvedValueOnce({ success: true, plan: { resources: ['r1'] } });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handlePlan();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    // RISK #2: startPlanning must be dispatched TWICE (once before initial,
    // once before retry) — this pins the verbatim re-dispatch contract.
    const planningIdx = types.reduce<number[]>((acc, t, i) => (t === 'deploy/startPlanning' ? [...acc, i] : acc), []);
    expect(planningIdx).toHaveLength(2);
    // The auth flow + retry order: startPlanning (initial) → startAuthenticating → authSuccess → startPlanning (retry) → setPlan
    expect(types).toEqual([
      'deploy/startPlanning',
      'deploy/startAuthenticating',
      'deploy/authSuccess',
      'deploy/startPlanning',
      'deploy/setPlan',
    ]);
    expect(mockDeployApi.plan).toHaveBeenCalledTimes(2);
  });

  it('on needsAuth → auth=true → retry fails → dispatches deployError', async () => {
    const store = makeStore();
    mockDeployApi.plan
      .mockResolvedValueOnce({ success: false, needsAuth: true })
      .mockResolvedValueOnce({ success: false, error: 'still no' });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handlePlan();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as {
      type: string;
      payload: unknown;
    };
    expect(last.type).toBe('deploy/deployError');
    expect(last.payload).toBe('still no');
  });

  it('on needsAuth → auth=true → retry fails without error, falls back to "Planning failed"', async () => {
    const store = makeStore();
    mockDeployApi.plan
      .mockResolvedValueOnce({ success: false, needsAuth: true })
      .mockResolvedValueOnce({ success: false });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handlePlan();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as { payload: string };
    expect(last.payload).toBe('Planning failed');
  });

  it('on needsAuth → auth=false → does NOT retry plan or re-dispatch startPlanning', async () => {
    const store = makeStore();
    mockDeployApi.plan.mockResolvedValueOnce({ success: false, needsAuth: true });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: false, error: 'no-cred' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handlePlan();

    expect(mockDeployApi.plan).toHaveBeenCalledTimes(1);
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types.filter((t) => t === 'deploy/startPlanning')).toHaveLength(1);
    expect(types).toContain('deploy/authFailed');
  });

  it('on result.success: false && !needsAuth, dispatches deployError with error', async () => {
    const store = makeStore();
    mockDeployApi.plan.mockResolvedValueOnce({ success: false, error: 'invalid graph' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handlePlan();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as {
      type: string;
      payload: unknown;
    };
    expect(last.type).toBe('deploy/deployError');
    expect(last.payload).toBe('invalid graph');
  });

  it('on result.success: false && !needsAuth without error, falls back to "Planning failed"', async () => {
    const store = makeStore();
    mockDeployApi.plan.mockResolvedValueOnce({ success: false });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handlePlan();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as { payload: string };
    expect(last.payload).toBe('Planning failed');
  });

  it('on throw with err.message, dispatches deployError with message', async () => {
    const store = makeStore();
    mockDeployApi.plan.mockRejectedValueOnce(new Error('plan exploded'));
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handlePlan();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as {
      type: string;
      payload: unknown;
    };
    expect(last.type).toBe('deploy/deployError');
    expect(last.payload).toBe('plan exploded');
  });

  it('on throw without err.message, falls back to "Planning failed"', async () => {
    const store = makeStore();
    mockDeployApi.plan.mockRejectedValueOnce({} as any);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handlePlan();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as { payload: string };
    expect(last.payload).toBe('Planning failed');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleDeploy
// ────────────────────────────────────────────────────────────────────────────

describe('handleDeploy', () => {
  it('is a no-op when activeCard is null', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: null, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mockDeployApi.apply).not.toHaveBeenCalled();
  });

  it('async path — early return after startDeploying when result.async is true', async () => {
    const store = makeStore();
    mockDeployApi.apply.mockResolvedValueOnce({ async: true, deploymentId: 'd-1' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    // ONLY startDeploying — no deploySuccess/deployError/getResources.
    expect(types).toEqual(['deploy/startDeploying']);
    expect(mockDeployApi.getResources).not.toHaveBeenCalled();
  });

  it('sync success path — dispatches deploySuccess + getResources + setDeployedResources', async () => {
    const store = makeStore();
    mockDeployApi.apply.mockResolvedValueOnce({
      success: true,
      duration_ms: 1234,
      result: { resources: [{ type: 't', name: 'a', success: true }] },
    });
    mockDeployApi.getResources.mockResolvedValueOnce({
      success: true,
      resources: [{ id: 'r1' }],
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual([
      'deploy/startDeploying',
      'deploy/deploySuccess',
      'deploy/setDeployedResources',
    ]);
    const success = dispatchSpy.mock.calls[1][0] as unknown as {
      payload: { duration_ms: number; results: unknown[] };
    };
    expect(success.payload.duration_ms).toBe(1234);
    expect(success.payload.results).toEqual([{ type: 't', name: 'a', success: true }]);
  });

  it('sync success with duration_ms missing, falls back to 0', async () => {
    const store = makeStore();
    mockDeployApi.apply.mockResolvedValueOnce({
      success: true,
      result: { resources: [{ type: 't', name: 'a', success: true }] },
    });
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [] });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const success = dispatchSpy.mock.calls[1][0] as unknown as { payload: { duration_ms: number } };
    expect(success.payload.duration_ms).toBe(0);
  });

  it('sync partial-failure path — dispatches deployError with formatted message + results', async () => {
    const store = makeStore();
    mockDeployApi.apply.mockResolvedValueOnce({
      success: true,
      result: {
        resources: [
          { type: 'gcp.sql', name: 'db1', success: false },
          { type: 'gcp.run', name: 'svc1', success: true },
          { type: 'gcp.redis', name: 'r1', success: false },
        ],
      },
    });
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [] });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual([
      'deploy/startDeploying',
      'deploy/deployError',
      'deploy/setDeployedResources',
    ]);
    const errPayload = dispatchSpy.mock.calls[1][0] as unknown as {
      payload: { error: string; results: unknown[] };
    };
    expect(errPayload.payload.error).toBe('2 resource(s) failed: gcp.sql/db1, gcp.redis/r1');
    expect(errPayload.payload.results).toHaveLength(3);
  });

  it('sync success path — getResources throw is silently caught', async () => {
    const store = makeStore();
    mockDeployApi.apply.mockResolvedValueOnce({
      success: true,
      result: { resources: [{ type: 't', name: 'a', success: true }] },
    });
    mockDeployApi.getResources.mockRejectedValueOnce(new Error('refresh-failed'));
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    // No throw despite getResources rejecting.
    await expect(actions.handleDeploy()).resolves.toBeUndefined();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(['deploy/startDeploying', 'deploy/deploySuccess']);
    // No setDeployedResources because getResources threw.
    expect(types).not.toContain('deploy/setDeployedResources');
  });

  it('sync success path — getResources success: false skips setDeployedResources', async () => {
    const store = makeStore();
    mockDeployApi.apply.mockResolvedValueOnce({
      success: true,
      result: { resources: [{ type: 't', name: 'a', success: true }] },
    });
    mockDeployApi.getResources.mockResolvedValueOnce({ success: false });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/setDeployedResources');
  });

  it('needsAuth → auth=true → re-dispatches startDeploying BEFORE retry → deploySuccess on retry', async () => {
    const store = makeStore();
    mockDeployApi.apply
      .mockResolvedValueOnce({ success: false, needsAuth: true })
      .mockResolvedValueOnce({
        success: true,
        duration_ms: 999,
        result: { resources: [{ type: 't', name: 'a', success: true }] },
      });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [{ id: 'r' }] });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    // RISK #2: startDeploying must be dispatched TWICE (once before initial,
    // once before retry).
    const deployingIdx = types.reduce<number[]>(
      (acc, t, i) => (t === 'deploy/startDeploying' ? [...acc, i] : acc),
      [],
    );
    expect(deployingIdx).toHaveLength(2);
    expect(types).toEqual([
      'deploy/startDeploying',
      'deploy/startAuthenticating',
      'deploy/authSuccess',
      'deploy/startDeploying',
      'deploy/deploySuccess',
      'deploy/setDeployedResources',
    ]);
    expect(mockDeployApi.apply).toHaveBeenCalledTimes(2);
  });

  it('needsAuth → auth=true → retry async-path early return', async () => {
    const store = makeStore();
    mockDeployApi.apply
      .mockResolvedValueOnce({ success: false, needsAuth: true })
      .mockResolvedValueOnce({ async: true, deploymentId: 'd-1' });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    // First startDeploying, auth roundtrip, second startDeploying — then nothing.
    expect(types).toEqual([
      'deploy/startDeploying',
      'deploy/startAuthenticating',
      'deploy/authSuccess',
      'deploy/startDeploying',
    ]);
    expect(mockDeployApi.getResources).not.toHaveBeenCalled();
  });

  it('needsAuth → auth=true → retry success with partial failure → deployError on retry', async () => {
    const store = makeStore();
    mockDeployApi.apply
      .mockResolvedValueOnce({ success: false, needsAuth: true })
      .mockResolvedValueOnce({
        success: true,
        result: {
          resources: [
            { type: 'gcp.sql', name: 'db1', success: false },
            { type: 'gcp.run', name: 'svc', success: true },
          ],
        },
      });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [] });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    // The retry success-with-partial branch dispatches deployError, not deploySuccess.
    expect(types).toContain('deploy/deployError');
    expect(types).not.toContain('deploy/deploySuccess');
    const errIdx = types.indexOf('deploy/deployError');
    const errPayload = dispatchSpy.mock.calls[errIdx][0] as unknown as {
      payload: { error: string; results: unknown[] };
    };
    expect(errPayload.payload.error).toBe('1 resource(s) failed: gcp.sql/db1');
    expect(errPayload.payload.results).toHaveLength(2);
  });

  it('needsAuth → auth=true → retry success with duration_ms missing falls back to 0', async () => {
    const store = makeStore();
    mockDeployApi.apply
      .mockResolvedValueOnce({ success: false, needsAuth: true })
      .mockResolvedValueOnce({
        success: true,
        result: { resources: [{ type: 't', name: 'a', success: true }] },
      });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [] });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    const successIdx = types.indexOf('deploy/deploySuccess');
    const success = dispatchSpy.mock.calls[successIdx][0] as unknown as { payload: { duration_ms: number } };
    expect(success.payload.duration_ms).toBe(0);
  });

  it('needsAuth → auth=true → retry getResources throw is silently caught', async () => {
    const store = makeStore();
    mockDeployApi.apply
      .mockResolvedValueOnce({ success: false, needsAuth: true })
      .mockResolvedValueOnce({
        success: true,
        duration_ms: 5,
        result: { resources: [{ type: 't', name: 'a', success: true }] },
      });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    mockDeployApi.getResources.mockRejectedValueOnce(new Error('boom'));
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await expect(actions.handleDeploy()).resolves.toBeUndefined();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/setDeployedResources');
  });

  it('needsAuth → auth=true → retry success with getResources success:false skips setDeployedResources', async () => {
    const store = makeStore();
    mockDeployApi.apply
      .mockResolvedValueOnce({ success: false, needsAuth: true })
      .mockResolvedValueOnce({
        success: true,
        duration_ms: 5,
        result: { resources: [{ type: 't', name: 'a', success: true }] },
      });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    mockDeployApi.getResources.mockResolvedValueOnce({ success: false });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/setDeployedResources');
  });

  it('needsAuth → auth=true → retry fails → dispatches deployError', async () => {
    const store = makeStore();
    mockDeployApi.apply
      .mockResolvedValueOnce({ success: false, needsAuth: true })
      .mockResolvedValueOnce({ success: false, error: 'still no' });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as {
      type: string;
      payload: unknown;
    };
    expect(last.type).toBe('deploy/deployError');
    expect(last.payload).toBe('still no');
  });

  it('needsAuth → auth=true → retry fails without error → falls back to "Deployment failed"', async () => {
    const store = makeStore();
    mockDeployApi.apply
      .mockResolvedValueOnce({ success: false, needsAuth: true })
      .mockResolvedValueOnce({ success: false });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: true });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as {
      payload: string;
    };
    expect(last.payload).toBe('Deployment failed');
  });

  it('needsAuth → auth=false → does NOT retry apply or re-dispatch startDeploying', async () => {
    const store = makeStore();
    mockDeployApi.apply.mockResolvedValueOnce({ success: false, needsAuth: true });
    mockDeployApi.authenticate.mockResolvedValueOnce({ success: false, error: 'no-cred' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    expect(mockDeployApi.apply).toHaveBeenCalledTimes(1);
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types.filter((t) => t === 'deploy/startDeploying')).toHaveLength(1);
    expect(types).toContain('deploy/authFailed');
  });

  it('on result.success: false && !needsAuth, dispatches deployError with error', async () => {
    const store = makeStore();
    mockDeployApi.apply.mockResolvedValueOnce({ success: false, error: 'invalid graph' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as {
      type: string;
      payload: unknown;
    };
    expect(last.type).toBe('deploy/deployError');
    expect(last.payload).toBe('invalid graph');
  });

  it('on result.success: false && !needsAuth without error, falls back to "Deployment failed"', async () => {
    const store = makeStore();
    mockDeployApi.apply.mockResolvedValueOnce({ success: false });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as {
      payload: string;
    };
    expect(last.payload).toBe('Deployment failed');
  });

  it('on throw with err.response.data.error, dispatches deployError with axios error message', async () => {
    const store = makeStore();
    const err = Object.assign(new Error('ignored'), {
      response: { data: { error: 'API quota exceeded' } },
    });
    mockDeployApi.apply.mockRejectedValueOnce(err);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as {
      type: string;
      payload: unknown;
    };
    expect(last.type).toBe('deploy/deployError');
    expect(last.payload).toBe('API quota exceeded');
  });

  it('on throw with only err.message (no axios response), dispatches deployError with err.message', async () => {
    const store = makeStore();
    mockDeployApi.apply.mockRejectedValueOnce(new Error('socket-hangup'));
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as {
      payload: string;
    };
    expect(last.payload).toBe('socket-hangup');
  });

  it('on throw with no message at all, falls back to "Deployment failed"', async () => {
    const store = makeStore();
    mockDeployApi.apply.mockRejectedValueOnce({} as any);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDeploy();

    const last = dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0] as unknown as {
      payload: string;
    };
    expect(last.payload).toBe('Deployment failed');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleClose
// ────────────────────────────────────────────────────────────────────────────

describe('handleClose', () => {
  it('is gated when status is "deploying" — dispatches nothing', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { status: 'deploying' },
      store,
    });
    dispatchSpy.mockClear();

    actions.handleClose();

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('is gated when status is "destroying" — dispatches nothing', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { status: 'destroying' },
      store,
    });
    dispatchSpy.mockClear();

    actions.handleClose();

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('is gated when status is "authenticating" — dispatches nothing', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { status: 'authenticating' },
      store,
    });
    dispatchSpy.mockClear();

    actions.handleClose();

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('on idle status, dispatches closeDeployPanel + resetDeploy', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { status: 'idle' },
      store,
    });
    dispatchSpy.mockClear();

    actions.handleClose();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(['deploy/closeDeployPanel', 'deploy/resetDeploy']);
  });

  it('on success status, dispatches closeDeployPanel + resetDeploy (other non-gated states)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { status: 'success' },
      store,
    });
    dispatchSpy.mockClear();

    actions.handleClose();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(['deploy/closeDeployPanel', 'deploy/resetDeploy']);
  });
});
