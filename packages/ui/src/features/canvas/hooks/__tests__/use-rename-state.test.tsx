/**
 * rf-canv-20 — useRenameState hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Provider +
 * capture-ref pattern from rf-canv-18/19: render `<Provider><Probe /></Provider>`
 * with `renderToString`, capture the hook's return value into a ref, then
 * invoke its callbacks and assert against `vi.spyOn(store, 'dispatch')`.
 *
 * `useState` is mocked with a hoisted slot so the test can drive
 * `renamingNodeId` updates manually — the renderer-less harness has no
 * post-setState re-render, so each callback's effect on the slot is
 * verified by re-rendering the Probe and re-capturing the result.
 */

import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
// `renamingSlot` is the mutable backing store for the hook's single
// `useState` slot. Each render reads `slot.current`; calling the setter
// writes to it. Tests re-render the Probe to observe the updated value.
const mocks = vi.hoisted(() => ({
  renamingSlot: { current: null as string | null },
  setRenamingSpy: vi.fn<(next: string | null) => void>(),
}));

// Mock React's useState so the slot is observable across the test boundary.
// `useCallback` is left untouched (real impl) — we want the hook's
// reference-stable callback identities to behave normally.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(initial: T | (() => T)) => {
      // The hook has exactly one `useState` slot (`renamingNodeId`). On the
      // first render, honor the initializer if the slot is still at its
      // default null value. The setter spy both records calls AND writes
      // through to the slot so a re-render observes the new value.
      void initial;
      const setter = (next: T) => {
        mocks.setRenamingSpy(next as unknown as string | null);
        mocks.renamingSlot.current = next as unknown as string | null;
      };
      return [mocks.renamingSlot.current as unknown as T, setter as unknown];
    }),
  };
});

// Import AFTER the react mock is registered so the hook closes over the
// mocked useState.
import cardsReducer from '../../../../store/slices/cards-slice';
import { useRenameState } from '../use-rename-state';
import type { UseRenameStateResult } from '../use-rename-state';

// ─── Store builder ──────────────────────────────────────────────────────────
// The hook only needs `useDispatch`; `useSelector` is not called. A minimal
// store with the cards reducer is sufficient — `preloadedState` matches the
// rf-canv-19 pattern (avoid Immer's frozen-state guard by never mutating
// `getState()` directly).

const makeStore = () => {
  const initialCards = cardsReducer(undefined as any, { type: '@@INIT' });
  return configureStore({
    reducer: { cards: cardsReducer },
    preloadedState: { cards: initialCards },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
};

type TestStore = ReturnType<typeof makeStore>;

// ─── Probe ──────────────────────────────────────────────────────────────────

const captureHook = (store: TestStore): UseRenameStateResult => {
  const captured: { current?: UseRenameStateResult } = {};
  const Probe: React.FC = () => {
    captured.current = useRenameState();
    return <div>probe</div>;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.renamingSlot.current = null;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useRenameState — initial render', () => {
  it('starts with renamingNodeId === null', () => {
    const store = makeStore();
    const result = captureHook(store);
    expect(result.renamingNodeId).toBeNull();
  });

  it('exposes all four members on the result shape', () => {
    const store = makeStore();
    const result = captureHook(store);
    expect(result).toHaveProperty('renamingNodeId');
    expect(typeof result.handleNodeDoubleClick).toBe('function');
    expect(typeof result.handleRenameCommit).toBe('function');
    expect(typeof result.handleRenameCancel).toBe('function');
  });
});

describe('useRenameState — handleNodeDoubleClick', () => {
  it('sets renamingNodeId to the supplied id', () => {
    const store = makeStore();
    const result = captureHook(store);
    result.handleNodeDoubleClick('node-A');
    // Setter spy records the new value.
    expect(mocks.setRenamingSpy).toHaveBeenCalledTimes(1);
    expect(mocks.setRenamingSpy).toHaveBeenCalledWith('node-A');
    // Slot is updated; the next render observes the new value.
    expect(mocks.renamingSlot.current).toBe('node-A');
    const next = captureHook(store);
    expect(next.renamingNodeId).toBe('node-A');
  });

  it('does NOT dispatch any action on double-click', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();
    result.handleNodeDoubleClick('node-X');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

describe('useRenameState — handleRenameCommit', () => {
  it('dispatches updateCardNodeData with the trimmed name and clears renamingNodeId', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Pre-prime the slot so we can verify the clear-on-commit transition.
    mocks.renamingSlot.current = 'node-1';
    const result = captureHook(store);
    dispatchSpy.mockClear();
    mocks.setRenamingSpy.mockClear();

    result.handleRenameCommit('node-1', 'newName');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as {
      type: string;
      payload: { nodeId: string; data: Record<string, unknown> };
    };
    expect(action.type).toBe('cards/updateCardNodeData');
    expect(action.payload).toEqual({ nodeId: 'node-1', data: { name: 'newName' } });
    // Editing state always clears on commit.
    expect(mocks.setRenamingSpy).toHaveBeenCalledWith(null);
    expect(mocks.renamingSlot.current).toBeNull();
  });

  it('trims surrounding whitespace from the new label before dispatching', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    result.handleRenameCommit('node-2', '  spaces  ');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as {
      type: string;
      payload: { nodeId: string; data: Record<string, unknown> };
    };
    expect(action.payload).toEqual({ nodeId: 'node-2', data: { name: 'spaces' } });
  });

  it('does NOT dispatch when the new label is an empty string, but still clears renamingNodeId', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mocks.renamingSlot.current = 'node-3';
    const result = captureHook(store);
    dispatchSpy.mockClear();
    mocks.setRenamingSpy.mockClear();

    result.handleRenameCommit('node-3', '');

    expect(dispatchSpy).not.toHaveBeenCalled();
    // Still clears the editing state — empty trim is treated as a cancel.
    expect(mocks.setRenamingSpy).toHaveBeenCalledTimes(1);
    expect(mocks.setRenamingSpy).toHaveBeenCalledWith(null);
    expect(mocks.renamingSlot.current).toBeNull();
  });

  it('does NOT dispatch when the new label is whitespace-only, but still clears renamingNodeId', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mocks.renamingSlot.current = 'node-4';
    const result = captureHook(store);
    dispatchSpy.mockClear();
    mocks.setRenamingSpy.mockClear();

    result.handleRenameCommit('node-4', '   ');

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mocks.setRenamingSpy).toHaveBeenCalledTimes(1);
    expect(mocks.setRenamingSpy).toHaveBeenCalledWith(null);
    expect(mocks.renamingSlot.current).toBeNull();
  });
});

describe('useRenameState — handleRenameCancel', () => {
  it('clears renamingNodeId and does NOT dispatch', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mocks.renamingSlot.current = 'node-5';
    const result = captureHook(store);
    dispatchSpy.mockClear();
    mocks.setRenamingSpy.mockClear();

    result.handleRenameCancel();

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mocks.setRenamingSpy).toHaveBeenCalledTimes(1);
    expect(mocks.setRenamingSpy).toHaveBeenCalledWith(null);
    expect(mocks.renamingSlot.current).toBeNull();
  });
});
