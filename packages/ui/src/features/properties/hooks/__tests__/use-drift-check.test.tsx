/**
 * rf-props-8 — use-drift-check hook + applyDriftStatus pure helper.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). Pure helper `applyDriftStatus` carries the
 * status-mapping branches and is exercised directly. The hook itself runs
 * via a `Provider`-wrapped `renderToString` smoke + a captured-ref pattern
 * (per the rf-props-7 learning) so we can invoke `checkDrift` outside of
 * render and observe the dispatch + axios behavior.
 *
 * `axiosInstance` is mocked via `vi.mock` with a factory whose default export
 * holds a `post` spy. We rebuild a real Redux store with the actual `deploy`
 * + `cards` slice reducers so dispatches flow through reducer logic and the
 * `setDriftResults` reducer's implicit `driftCheckLoading = false` reset
 * stays observable end-to-end.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock axiosInstance BEFORE the hook import ──────────────────────────────
// The relative path goes up one level more than the source: this test file
// lives in `hooks/__tests__/`, so `../../../../shared/...` resolves to
// `packages/ui/src/shared/api/axios-instance.ts`.

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: { post: vi.fn() },
}));

import axiosInstance from '../../../../shared/api/axios-instance';
import cardsReducer from '../../../../store/slices/cards-slice';
import deployReducer from '../../../../store/slices/deploy-slice';
import { applyDriftStatus, useDriftCheck } from '../use-drift-check';
import type { AppDispatch } from '../../../../store';

// ─── Store builder ──────────────────────────────────────────────────────────

const makeStore = () =>
  configureStore({
    reducer: {
      deploy: deployReducer,
      cards: cardsReducer,
    },
  });

type TestStore = ReturnType<typeof makeStore>;

// ─── applyDriftStatus — pure-helper exhaustive coverage ─────────────────────

describe('applyDriftStatus', () => {
  it('does not dispatch for an empty input array', () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    applyDriftStatus([], dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches updateCardNodeData with status=drifted for "drifted"', () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    applyDriftStatus([{ nodeId: 'n1', status: 'drifted' }], dispatch);
    expect((dispatch as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    const action = (dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.type).toBe('cards/updateCardNodeData');
    expect(action.payload).toEqual({ nodeId: 'n1', data: { status: 'drifted' } });
  });

  it('dispatches updateCardNodeData with status=drifted for "missing"', () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    applyDriftStatus([{ nodeId: 'n2', status: 'missing' }], dispatch);
    const action = (dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.payload).toEqual({ nodeId: 'n2', data: { status: 'drifted' } });
  });

  it('dispatches updateCardNodeData with status=active for "in_sync"', () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    applyDriftStatus([{ nodeId: 'n3', status: 'in_sync' }], dispatch);
    const action = (dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.payload).toEqual({ nodeId: 'n3', data: { status: 'active' } });
  });

  it('skips entries whose status is none of drifted | missing | in_sync', () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    applyDriftStatus(
      [
        { nodeId: 'n4', status: 'unknown' },
        { nodeId: 'n5', status: '' },
        { nodeId: 'n6', status: 'pending' },
      ],
      dispatch,
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('preserves order across mixed statuses', () => {
    const dispatch = vi.fn() as unknown as AppDispatch;
    applyDriftStatus(
      [
        { nodeId: 'a', status: 'drifted' },
        { nodeId: 'b', status: 'unknown' }, // skipped
        { nodeId: 'c', status: 'in_sync' },
        { nodeId: 'd', status: 'missing' },
      ],
      dispatch,
    );
    const calls = (dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][0].payload).toEqual({ nodeId: 'a', data: { status: 'drifted' } });
    expect(calls[1][0].payload).toEqual({ nodeId: 'c', data: { status: 'active' } });
    expect(calls[2][0].payload).toEqual({ nodeId: 'd', data: { status: 'drifted' } });
  });
});

// ─── useDriftCheck — Provider-wrapped renderToString smoke + capture ─────────

interface Captured {
  isLoading: boolean;
  checkDrift: () => Promise<void>;
}

const captureHook = (cardId: string, nodes: any[], store: TestStore): Captured => {
  const captured: { current?: Captured } = {};
  const Probe: React.FC = () => {
    captured.current = useDriftCheck(cardId, nodes);
    return <div>{String(captured.current.isLoading)}</div>;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('hook did not render');
  return captured.current;
};

describe('useDriftCheck (smoke + capture, renderToString)', () => {
  beforeEach(() => {
    (axiosInstance.post as ReturnType<typeof vi.fn>).mockReset();
  });

  it('returns isLoading=false on initial render with default deploy state', () => {
    const store = makeStore();
    const { isLoading, checkDrift } = captureHook('card-1', [], store);
    expect(isLoading).toBe(false);
    expect(typeof checkDrift).toBe('function');
  });

  it('flips driftCheckLoading=true synchronously when checkDrift is invoked', () => {
    const store = makeStore();
    // Hold the request pending so we can observe the synchronous loading flip
    // before the await resolves.
    let resolvePost: (v: unknown) => void = () => {};
    (axiosInstance.post as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    const { checkDrift } = captureHook('card-1', [{ id: 'n1' }], store);

    expect(store.getState().deploy.driftCheckLoading).toBe(false);
    const p = checkDrift();
    // setDriftCheckLoading(true) should have fired before the first microtask awaits.
    expect(store.getState().deploy.driftCheckLoading).toBe(true);

    // Resolve with no driftResults so the success branch finishes cleanly.
    resolvePost({ data: {} });
    return p;
  });

  it('on successful POST with driftResults, dispatches setDriftResults and runs applyDriftStatus per result', async () => {
    const store = makeStore();
    (axiosInstance.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        driftResults: [
          { nodeId: 'n1', status: 'drifted', changes: [] },
          { nodeId: 'n2', status: 'in_sync', changes: [] },
          { nodeId: 'n3', status: 'unknown' },
        ],
      },
    });

    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { checkDrift } = captureHook('card-42', [{ id: 'n1' }], store);
    dispatchSpy.mockClear();

    await checkDrift();

    // Verify the POST was sent with the correct payload.
    expect(axiosInstance.post).toHaveBeenCalledWith('/canvas/deploy/drift-check', {
      cardId: 'card-42',
      nodes: [{ id: 'n1' }],
    });

    const dispatchedTypes = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(dispatchedTypes).toEqual([
      'deploy/setDriftCheckLoading',
      'deploy/setDriftResults',
      'cards/updateCardNodeData', // n1 -> drifted
      'cards/updateCardNodeData', // n2 -> active (in_sync)
      // n3 is skipped because 'unknown' is not a recognized status
    ]);

    // setDriftResults reducer also resets driftCheckLoading = false (deploy-slice L724).
    expect(store.getState().deploy.driftCheckLoading).toBe(false);
    expect(store.getState().deploy.driftByNode).toEqual({
      n1: { nodeId: 'n1', status: 'drifted', changes: [] },
      n2: { nodeId: 'n2', status: 'in_sync', changes: [] },
      n3: { nodeId: 'n3', status: 'unknown' },
    });
  });

  it('on successful POST without driftResults field, dispatches only the loading=true action', async () => {
    const store = makeStore();
    (axiosInstance.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: {} });

    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { checkDrift } = captureHook('card-7', [], store);
    dispatchSpy.mockClear();

    await checkDrift();

    const dispatchedTypes = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(dispatchedTypes).toEqual(['deploy/setDriftCheckLoading']);
    // Loading flag stays TRUE because neither setDriftResults nor the catch path ran.
    // This is verbatim behavior from the inline implementation.
    expect(store.getState().deploy.driftCheckLoading).toBe(true);
  });

  it('on POST rejection, catch path resets driftCheckLoading to false', async () => {
    const store = makeStore();
    (axiosInstance.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('network'),
    );

    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { checkDrift } = captureHook('card-x', [], store);
    dispatchSpy.mockClear();

    await checkDrift();

    const dispatchedActions = dispatchSpy.mock.calls.map((c) => c[0] as { type: string; payload?: unknown });
    expect(dispatchedActions.map((a) => a.type)).toEqual([
      'deploy/setDriftCheckLoading',
      'deploy/setDriftCheckLoading',
    ]);
    // First call sets true, second resets to false.
    expect(dispatchedActions[0].payload).toBe(true);
    expect(dispatchedActions[1].payload).toBe(false);
    expect(store.getState().deploy.driftCheckLoading).toBe(false);
  });
});
