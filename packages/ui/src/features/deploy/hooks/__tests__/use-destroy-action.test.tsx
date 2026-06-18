/**
 * rf-pdpl-22 — useDestroyAction hook.
 *
 * Single callback hook that wraps the destroy modal's `onConfirm`. Tests
 * follow the rf-props-8 capture-ref-after-render pattern: render the hook
 * through a Provider-wrapped Probe, capture the returned object via a ref,
 * then invoke the callback in async test code so we can drive every branch
 * (destroyEverything success/error/no-deleted, single-card success/error,
 * null-response short-circuit, throw path).
 *
 * RISK #4 from the rf-pdpl blueprint: dispatch ordering is observable to
 * the canvas overlay. The "RISK #4 dispatch order" test pins the trace
 * `[startDestroying, ..., clearCardDeployOverlay, setDeployedResources,
 * resetDeploy]` so any future reordering surfaces immediately. A separate
 * "modal close before dispatch" test pins setDestroyModalOpen(false)
 * happening BEFORE the first dispatch.
 */

import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper to inspect dispatched actions. Redux Toolkit types its dispatch
// argument as `UnknownAction` which doesn't expose `.payload`; cast through
// `unknown` to a structural shape for assertions
// (cf. learnings.md `redux-toolkit-unknown-action-payload-needs-double-cast-via-unknown`).
type DispatchedAction<P = unknown> = { type: string; payload?: P };
function asAction<P = unknown>(call: unknown): DispatchedAction<P> {
  return call as unknown as DispatchedAction<P>;
}

// ─── Mocks (must be before the hook import) ─────────────────────────────────

const mockDeployApi = {
  destroy: vi.fn(),
  destroyAll: vi.fn(),
};

vi.mock('../../../../shared/api/api-adapter', () => ({
  getApi: () => ({ deploy: mockDeployApi }),
}));

import cardsReducer, { type Card } from '../../../../store/slices/cards-slice';
import deployReducer, { type DeployState } from '../../../../store/slices/deploy-slice';
import { useDestroyAction, type UseDestroyActionReturn } from '../use-destroy-action';

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
  actions: UseDestroyActionReturn;
  setDestroyModalOpen: ReturnType<typeof vi.fn>;
}

interface CaptureArgs {
  activeCard?: Card | null;
  deploy?: Partial<DeployState>;
  store: TestStore;
}

function captureHook(args: CaptureArgs): Captured {
  const captured: { current?: Captured } = {};
  const baseDeploy: DeployState = args.store.getState().deploy;
  const deploy = { ...baseDeploy, ...args.deploy };
  const setDestroyModalOpen = vi.fn();
  const Probe: React.FC = () => {
    const actions = useDestroyAction({
      activeCard: args.activeCard ?? null,
      deploy,
      setDestroyModalOpen,
    });
    captured.current = { actions, setDestroyModalOpen };
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

// Console spies — the source uses `console.log('[destroy] ...')` four times
// and `console.error('[destroy] ...')` once on the catch path. Typed loosely
// because vi.spyOn's return type is awkward to express; we only ever read
// `.mock.calls` off these.
interface ConsoleSpyLike {
  mock: { calls: unknown[][] };
  mockRestore: () => void;
  toHaveBeenCalledWith?: (...args: unknown[]) => void;
}
let consoleLogSpy: ConsoleSpyLike;
let consoleErrorSpy: ConsoleSpyLike;

beforeEach(() => {
  for (const fn of Object.values(mockDeployApi)) fn.mockReset();
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined) as unknown as ConsoleSpyLike;
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined) as unknown as ConsoleSpyLike;
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

// ────────────────────────────────────────────────────────────────────────────
// activeCard null guard
// ────────────────────────────────────────────────────────────────────────────

describe('handleDestroyConfirm — activeCard null guard', () => {
  it('is a no-op when activeCard is null (true)', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions, setDestroyModalOpen } = captureHook({ activeCard: null, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(setDestroyModalOpen).not.toHaveBeenCalled();
    expect(mockDeployApi.destroyAll).not.toHaveBeenCalled();
    expect(mockDeployApi.destroy).not.toHaveBeenCalled();
  });

  it('is a no-op when activeCard is null (false)', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions, setDestroyModalOpen } = captureHook({ activeCard: null, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(false);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(setDestroyModalOpen).not.toHaveBeenCalled();
    expect(mockDeployApi.destroyAll).not.toHaveBeenCalled();
    expect(mockDeployApi.destroy).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// destroyAll path — success
// ────────────────────────────────────────────────────────────────────────────

describe('handleDestroyConfirm — destroyAll path success', () => {
  it('closes modal first, dispatches startDestroying BEFORE the API call (RISK #4)', async () => {
    const store = makeStore();
    // Use a deferred promise so we can assert on the pre-await state.
    let resolveApi: (value: unknown) => void = () => undefined;
    mockDeployApi.destroyAll.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveApi = resolve;
      }),
    );
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions, setDestroyModalOpen } = captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { gcpProject: 'lc-ice' },
      store,
    });
    dispatchSpy.mockClear();

    const pending = actions.handleDestroyConfirm(true);

    // Pre-await: modal already closed and startDestroying dispatched.
    expect(setDestroyModalOpen).toHaveBeenCalledTimes(1);
    expect(setDestroyModalOpen).toHaveBeenCalledWith(false);

    // Modal close happened before any dispatch (assert via call ordering
    // implied by spy mock state — at this point startDestroying has fired
    // synchronously while no API await has yet been resolved).
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const first = asAction(dispatchSpy.mock.calls[0][0]);
    expect(first.type).toBe('deploy/startDestroying');
    expect(first.payload).toEqual({ cardId: 'card-1' });

    // Now resolve the API and let the rest of the flow run.
    resolveApi({ success: true, deleted: [{ id: 'r1' }, { id: 'r2' }], failed: [] });
    await pending;
  });

  it('calls destroyAll with the right gcpProject and logs request/response', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockResolvedValueOnce({
      success: true,
      deleted: [{ id: 'r1' }],
      failed: [],
    });
    const { actions } = captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { gcpProject: 'lc-ice' },
      store,
    });

    await actions.handleDestroyConfirm(true);

    expect(mockDeployApi.destroyAll).toHaveBeenCalledWith('card-1', { gcpProject: 'lc-ice' });
    // [destroy] prefix preserved in start + response logs
    const startCall = consoleLogSpy.mock.calls.find((c) => c[0] === '[destroy] destroyAll starting');
    expect(startCall).toBeDefined();
    expect(startCall?.[1]).toEqual({ cardId: 'card-1', gcpProject: 'lc-ice' });
    const respCall = consoleLogSpy.mock.calls.find((c) => c[0] === '[destroy] destroyAll response');
    expect(respCall).toBeDefined();
  });

  it('appendLog summary uses singular form for exactly 1 deleted', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockResolvedValueOnce({
      success: true,
      deleted: [{ id: 'r1' }],
      failed: [],
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const logCall = dispatchSpy.mock.calls
      .map((c) => asAction<string>(c[0]))
      .find((a) => a.type === 'deploy/appendLog');
    expect(logCall?.payload).toBe('Destroyed 1 resource across all historical deploys.');
  });

  it('appendLog summary uses plural form for 0 deleted', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockResolvedValueOnce({
      success: true,
      deleted: [],
      failed: [],
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const logCall = dispatchSpy.mock.calls
      .map((c) => asAction<string>(c[0]))
      .find((a) => a.type === 'deploy/appendLog');
    expect(logCall?.payload).toBe('Destroyed 0 resources across all historical deploys.');
  });

  it('appendLog summary uses plural form for 2 deleted', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockResolvedValueOnce({
      success: true,
      deleted: [{ id: 'r1' }, { id: 'r2' }],
      failed: [],
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const logCall = dispatchSpy.mock.calls
      .map((c) => asAction<string>(c[0]))
      .find((a) => a.type === 'deploy/appendLog');
    expect(logCall?.payload).toBe('Destroyed 2 resources across all historical deploys.');
  });

  it('falls back to 0 when deleted is missing on success path', async () => {
    const store = makeStore();
    // success: true but no `deleted` key — should still hit the success branch
    // because `(res.success || res.deleted)` is truthy via res.success.
    mockDeployApi.destroyAll.mockResolvedValueOnce({ success: true });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const logCall = dispatchSpy.mock.calls
      .map((c) => asAction<string>(c[0]))
      .find((a) => a.type === 'deploy/appendLog');
    expect(logCall?.payload).toBe('Destroyed 0 resources across all historical deploys.');
  });

  it('per-failed entry: appendLog uses type/name/error format', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockResolvedValueOnce({
      success: true,
      deleted: [{ id: 'r1' }],
      failed: [
        { type: 'cloudrun', name: 'svc-a', error: 'permission denied' },
        { type: 'storage', name: 'bucket-b', error: 'not empty' },
      ],
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const logPayloads = dispatchSpy.mock.calls
      .map((c) => asAction<string>(c[0]))
      .filter((a) => a.type === 'deploy/appendLog')
      .map((a) => a.payload);
    expect(logPayloads).toEqual([
      'Destroyed 1 resource across all historical deploys.',
      'Failed to delete cloudrun/svc-a: permission denied',
      'Failed to delete storage/bucket-b: not empty',
    ]);
  });

  it('skips the per-failed loop when failed is missing', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockResolvedValueOnce({
      success: true,
      deleted: [{ id: 'r1' }],
      // no failed key
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const logPayloads = dispatchSpy.mock.calls
      .map((c) => asAction<string>(c[0]))
      .filter((a) => a.type === 'deploy/appendLog')
      .map((a) => a.payload);
    // Only the summary, no per-failed entries.
    expect(logPayloads).toEqual(['Destroyed 1 resource across all historical deploys.']);
  });

  it('cleanup dispatches fire in order: clearCardDeployOverlay → setDeployedResources → resetDeploy (RISK #4)', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockResolvedValueOnce({
      success: true,
      deleted: [{ id: 'r1' }],
      failed: [],
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const types = dispatchSpy.mock.calls.map((c) => asAction(c[0]).type);
    // Full ordered trace pin: startDestroying must be FIRST, cleanup
    // dispatches must be LAST and in order.
    expect(types).toEqual([
      'deploy/startDestroying',
      'deploy/appendLog',
      'cards/clearCardDeployOverlay',
      'deploy/setDeployedResources',
      'deploy/resetDeploy',
    ]);
    // setDeployedResources fires with empty array.
    const setDeployed = dispatchSpy.mock.calls
      .map((c) => asAction<unknown[]>(c[0]))
      .find((a) => a.type === 'deploy/setDeployedResources');
    expect(setDeployed?.payload).toEqual([]);
    // clearCardDeployOverlay fires with the active card id.
    const clear = dispatchSpy.mock.calls
      .map((c) => asAction<{ cardId: string }>(c[0]))
      .find((a) => a.type === 'cards/clearCardDeployOverlay');
    expect(clear?.payload).toEqual({ cardId: 'card-1' });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// destroyAll path — error / no-deleted
// ────────────────────────────────────────────────────────────────────────────

describe('handleDestroyConfirm — destroyAll path error', () => {
  it('on success: false && !deleted, dispatches deployError and early-returns (no cleanup)', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockResolvedValueOnce({
      success: false,
      error: 'tf apply timeout',
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const types = dispatchSpy.mock.calls.map((c) => asAction(c[0]).type);
    expect(types).toEqual(['deploy/startDestroying', 'deploy/deployError']);
    const errorAction = asAction<string>(dispatchSpy.mock.calls[1][0]);
    expect(errorAction.payload).toBe('tf apply timeout');
    // Crucially: NO cleanup dispatches.
    expect(types).not.toContain('cards/clearCardDeployOverlay');
    expect(types).not.toContain('deploy/setDeployedResources');
    expect(types).not.toContain('deploy/resetDeploy');
  });

  // DE5 — a partial destroy (some deleted, some failed) must NOT fall through
  // to resetDeploy (which wiped the failure logs); it surfaces an error + keeps
  // the logs/overlay so the failure stays visible.
  it('on partial destroy (some failed), surfaces an error and skips the log-wiping cleanup', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockResolvedValueOnce({
      success: true,
      deleted: [{ id: 'r1' }],
      failed: [{ type: 'gcp.sql.instance', name: 'db', error: 'still has dependents' }],
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const types = dispatchSpy.mock.calls.map((c) => asAction(c[0]).type);
    // summary log + failure log + error; NO cleanup (logs preserved).
    expect(types).toEqual(['deploy/startDestroying', 'deploy/appendLog', 'deploy/appendLog', 'deploy/deployError']);
    expect(types).not.toContain('deploy/resetDeploy');
    expect(types).not.toContain('cards/clearCardDeployOverlay');
    expect(types).not.toContain('deploy/setDeployedResources');
    const errorAction = asAction<string>(dispatchSpy.mock.calls[dispatchSpy.mock.calls.length - 1][0]);
    expect(errorAction.type).toBe('deploy/deployError');
    expect(errorAction.payload).toContain('1 resource could not be destroyed');
  });

  it('on success: false && !deleted with no error, falls back to "Destroy failed with no details"', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockResolvedValueOnce({ success: false });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const errorAction = asAction<string>(dispatchSpy.mock.calls[1][0]);
    expect(errorAction.type).toBe('deploy/deployError');
    expect(errorAction.payload).toBe('Destroy failed with no details');
  });

  it('on a response with neither success: false nor deleted (e.g. success: undefined), the success-or-deleted branch is skipped but cleanup still runs', async () => {
    const store = makeStore();
    // No `success` and no `deleted` — passes the first guard (success !== false)
    // and the second branch (success || deleted) is also falsy, so neither
    // appendLog fires; cleanup still runs because we did not early-return.
    mockDeployApi.destroyAll.mockResolvedValueOnce({});
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const types = dispatchSpy.mock.calls.map((c) => asAction(c[0]).type);
    // No appendLog (success-or-deleted is false), but cleanup fires.
    expect(types).toEqual([
      'deploy/startDestroying',
      'cards/clearCardDeployOverlay',
      'deploy/setDeployedResources',
      'deploy/resetDeploy',
    ]);
  });

  it('on success: false but deleted present (and no failures), falls through to cleanup (the success-or-deleted branch)', async () => {
    const store = makeStore();
    // DE5 — with NO failures, a deleted-present result still runs the cleanup.
    // (The with-failures case is covered separately above: error + no wipe.)
    mockDeployApi.destroyAll.mockResolvedValueOnce({
      success: false,
      deleted: [{ id: 'r1' }],
      failed: [],
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const types = dispatchSpy.mock.calls.map((c) => asAction(c[0]).type);
    // Important: NO deployError, but full cleanup (one appendLog — the summary).
    expect(types).toEqual([
      'deploy/startDestroying',
      'deploy/appendLog',
      'cards/clearCardDeployOverlay',
      'deploy/setDeployedResources',
      'deploy/resetDeploy',
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// destroy (single-card) path
// ────────────────────────────────────────────────────────────────────────────

describe('handleDestroyConfirm — single-card destroy path success', () => {
  it('calls destroy with provider/region/environment and logs request/response', async () => {
    const store = makeStore();
    mockDeployApi.destroy.mockResolvedValueOnce({ success: true });
    const { actions } = captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { provider: 'gcp', region: 'us-central1', environment: 'staging' },
      store,
    });

    await actions.handleDestroyConfirm(false);

    expect(mockDeployApi.destroy).toHaveBeenCalledWith('card-1', {
      provider: 'gcp',
      region: 'us-central1',
      environment: 'staging',
    });
    const startCall = consoleLogSpy.mock.calls.find((c) => c[0] === '[destroy] destroy starting');
    expect(startCall).toBeDefined();
    expect(startCall?.[1]).toEqual({
      cardId: 'card-1',
      provider: 'gcp',
      environment: 'staging',
    });
    const respCall = consoleLogSpy.mock.calls.find((c) => c[0] === '[destroy] destroy response');
    expect(respCall).toBeDefined();
  });

  it('cleanup dispatches fire in order on success', async () => {
    const store = makeStore();
    mockDeployApi.destroy.mockResolvedValueOnce({ success: true });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(false);

    const types = dispatchSpy.mock.calls.map((c) => asAction(c[0]).type);
    // Single-card success path: NO appendLog (those are destroyAll-only).
    expect(types).toEqual([
      'deploy/startDestroying',
      'cards/clearCardDeployOverlay',
      'deploy/setDeployedResources',
      'deploy/resetDeploy',
    ]);
  });
});

describe('handleDestroyConfirm — single-card destroy path error', () => {
  it('on success: false, dispatches deployError with res.error and early-returns', async () => {
    const store = makeStore();
    mockDeployApi.destroy.mockResolvedValueOnce({ success: false, error: 'gateway 500' });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(false);

    const types = dispatchSpy.mock.calls.map((c) => asAction(c[0]).type);
    expect(types).toEqual(['deploy/startDestroying', 'deploy/deployError']);
    const errorAction = asAction<string>(dispatchSpy.mock.calls[1][0]);
    expect(errorAction.payload).toBe('gateway 500');
  });

  it('on success: false with no error, falls back to "Destroy failed"', async () => {
    const store = makeStore();
    mockDeployApi.destroy.mockResolvedValueOnce({ success: false });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(false);

    const errorAction = asAction<string>(dispatchSpy.mock.calls[1][0]);
    expect(errorAction.type).toBe('deploy/deployError');
    expect(errorAction.payload).toBe('Destroy failed');
  });

  it('on null response, the `res?.success === false` check short-circuits and falls through to cleanup', async () => {
    const store = makeStore();
    // Null response — `res?.success` evaluates to undefined, NOT false, so
    // the early-return is skipped and the cleanup dispatches fire.
    mockDeployApi.destroy.mockResolvedValueOnce(null);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(false);

    const types = dispatchSpy.mock.calls.map((c) => asAction(c[0]).type);
    expect(types).toEqual([
      'deploy/startDestroying',
      'cards/clearCardDeployOverlay',
      'deploy/setDeployedResources',
      'deploy/resetDeploy',
    ]);
  });

  it('on undefined response, also falls through to cleanup', async () => {
    const store = makeStore();
    mockDeployApi.destroy.mockResolvedValueOnce(undefined);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(false);

    const types = dispatchSpy.mock.calls.map((c) => asAction(c[0]).type);
    expect(types).toEqual([
      'deploy/startDestroying',
      'cards/clearCardDeployOverlay',
      'deploy/setDeployedResources',
      'deploy/resetDeploy',
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// catch path
// ────────────────────────────────────────────────────────────────────────────

describe('handleDestroyConfirm — catch path', () => {
  it('on thrown error in destroyAll, console.errors with [destroy] prefix and dispatches deployError', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockRejectedValueOnce(new Error('network'));
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[destroy] caught error', expect.any(Error));
    const types = dispatchSpy.mock.calls.map((c) => asAction(c[0]).type);
    expect(types).toEqual(['deploy/startDestroying', 'deploy/deployError']);
    const errorAction = asAction<string>(dispatchSpy.mock.calls[1][0]);
    expect(errorAction.payload).toBe('network');
  });

  it('on thrown error in destroy, console.errors with [destroy] prefix and dispatches deployError', async () => {
    const store = makeStore();
    mockDeployApi.destroy.mockRejectedValueOnce(new Error('boom'));
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(false);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[destroy] caught error', expect.any(Error));
    const errorAction = asAction<string>(dispatchSpy.mock.calls[1][0]);
    expect(errorAction.type).toBe('deploy/deployError');
    expect(errorAction.payload).toBe('boom');
  });

  it('on throw without err.message, falls back to "Destroy failed"', async () => {
    const store = makeStore();
    // Reject with an object that has no `.message` field — the source uses
    // `err.message || 'Destroy failed'`.
    mockDeployApi.destroyAll.mockRejectedValueOnce({
      /* no .message */
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { actions } = captureHook({ activeCard: ACTIVE_CARD, store });
    dispatchSpy.mockClear();

    await actions.handleDestroyConfirm(true);

    const errorAction = asAction<string>(dispatchSpy.mock.calls[1][0]);
    expect(errorAction.type).toBe('deploy/deployError');
    expect(errorAction.payload).toBe('Destroy failed');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// RISK #4 pinning — modal close before any dispatch
// ────────────────────────────────────────────────────────────────────────────

describe('handleDestroyConfirm — modal-close-before-dispatch ordering', () => {
  it('setDestroyModalOpen(false) is called BEFORE the first dispatch', async () => {
    const store = makeStore();
    mockDeployApi.destroyAll.mockResolvedValueOnce({
      success: true,
      deleted: [{ id: 'r1' }],
      failed: [],
    });

    // Capture an interleaved trace: every call to setDestroyModalOpen and
    // every dispatch lands in the same array, so we can verify that the
    // modal-close happens before any dispatch.
    const trace: Array<{ kind: 'modal' | 'dispatch'; detail: unknown }> = [];
    const setDestroyModalOpen = vi.fn((v: boolean) => trace.push({ kind: 'modal', detail: v }));
    const origDispatch = store.dispatch.bind(store);
    vi.spyOn(store, 'dispatch').mockImplementation((action: unknown) => {
      trace.push({ kind: 'dispatch', detail: asAction(action).type });

      return origDispatch(action as any);
    });

    // Render with the custom setDestroyModalOpen — captureHook wires its own,
    // so we render directly here to control both pieces.
    let actions: UseDestroyActionReturn | null = null;
    const baseDeploy: DeployState = store.getState().deploy;
    const Probe: React.FC = () => {
      actions = useDestroyAction({
        activeCard: ACTIVE_CARD,
        deploy: baseDeploy,
        setDestroyModalOpen,
      });
      return null;
    };
    renderToString(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
    if (!actions) throw new Error('hook did not render');

    // After capture, clear the trace so we only assert on what happens
    // inside handleDestroyConfirm itself.
    trace.length = 0;
    await (actions as UseDestroyActionReturn).handleDestroyConfirm(true);

    // First entry: modal-close. Second entry: startDestroying dispatch.
    expect(trace.length).toBeGreaterThanOrEqual(2);
    expect(trace[0]).toEqual({ kind: 'modal', detail: false });
    expect(trace[1]).toEqual({ kind: 'dispatch', detail: 'deploy/startDestroying' });
  });
});
