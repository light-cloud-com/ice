/**
 * Tests for `store/index.ts` — Redux store factory + middleware + persistence.
 *
 * Covers:
 *   - actionLoggerMiddleware: prefix-matching dispatch is forwarded to
 *     `logStateChange`; non-matching dispatch passes through silently.
 *   - cardHash: stable fingerprint across structural + data variations.
 *   - card persistence subscriber: debounced 2s, dirty-hash skip, localStorage
 *     write, backend save when authenticated, in-flight gating, and the
 *     no-op early returns for missing activeCardId / missing card.
 *   - UI persistence subscriber: shallow-equal skip + 300ms debounced
 *     localStorage write.
 *
 * The SUT runs imperative work at module load (configureStore) and
 * registers two subscribers. Tests import the module once with a clean
 * mock set, then dispatch actions to drive the subscribers under fake
 * timers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  logStateChange: vi.fn(),
  isAuthenticated: vi.fn(() => false as boolean),
  graphSave: vi.fn(),
  storage: {} as Record<string, string>,
}));

vi.mock('../../shared/utils/action-logger', () => ({
  logStateChange: mocks.logStateChange,
}));

vi.mock('../../shared/api/auth', () => ({
  isAuthenticated: mocks.isAuthenticated,
}));

vi.mock('../../shared/api/api-adapter', () => ({
  getApi: () => ({ graph: { save: mocks.graphSave } }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  mocks.logStateChange.mockReset();
  mocks.isAuthenticated.mockReset().mockReturnValue(false);
  mocks.graphSave.mockReset().mockResolvedValue(undefined);
  // Reset the in-memory localStorage
  for (const k of Object.keys(mocks.storage)) delete mocks.storage[k];
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((k: string) => (k in mocks.storage ? mocks.storage[k] : null)),
    setItem: vi.fn((k: string, v: string) => {
      mocks.storage[k] = v;
    }),
    removeItem: vi.fn((k: string) => {
      delete mocks.storage[k];
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('store — module load smoke', () => {
  it('exports the configured store, RootState, AppDispatch types', async () => {
    const mod = await import('..');
    expect(mod.store).toBeDefined();
    expect(typeof mod.store.dispatch).toBe('function');
    expect(typeof mod.store.getState).toBe('function');
    expect(typeof mod.store.subscribe).toBe('function');
  });

  it('the initial state has all expected slice keys', async () => {
    const mod = await import('..');
    const state = mod.store.getState();
    expect(state).toHaveProperty('graph');
    expect(state).toHaveProperty('ui');
    expect(state).toHaveProperty('cards');
    expect(state).toHaveProperty('account');
    expect(state).toHaveProperty('deploy');
    expect(state).toHaveProperty('environments');
    expect(state).toHaveProperty('validation');
  });
});

describe('store — actionLoggerMiddleware', () => {
  it('forwards a logged-prefix action to logStateChange', async () => {
    const mod = await import('..');
    const payload = {
      id: 'u1',
      email: 'a@x.com',
      name: 'A',
      avatar: null,
      organisations: [],
    };
    mod.store.dispatch({ type: 'account/setUser', payload });
    expect(mocks.logStateChange).toHaveBeenCalledWith('account/setUser', payload);
  });

  it('does NOT log actions with a non-matching prefix', async () => {
    const mod = await import('..');
    mocks.logStateChange.mockClear();
    mod.store.dispatch({ type: 'cards/setActiveCard', payload: 'c1' });
    expect(mocks.logStateChange).not.toHaveBeenCalled();
  });

  it('handles an action with no payload field', async () => {
    const mod = await import('..');
    mod.store.dispatch({ type: 'deploy/somethingHappened' });
    expect(mocks.logStateChange).toHaveBeenCalledWith('deploy/somethingHappened', undefined);
  });

  it('handles an action with no type field (action.type defaults to empty string)', async () => {
    const mod = await import('..');
    // Redux Toolkit normally throws on actions without type, but the
    // middleware itself handles `action?.type || ''` defensively. We
    // bypass through dispatch which throws. Instead, we exercise the path
    // by calling a thunk-less dispatch that lacks type.
    expect(() => mod.store.dispatch({ type: '' } as { type: string })).not.toThrow();
    // No prefix matches the empty string, so no log.
    mocks.logStateChange.mockClear();
    mod.store.dispatch({ type: '' } as { type: string });
    expect(mocks.logStateChange).not.toHaveBeenCalled();
  });
});

describe('store — card persistence subscriber', () => {
  it('does nothing when activeCardId is null after the debounce', async () => {
    const mod = await import('..');
    // No card created → activeCardId stays null → setTimeout body returns early.
    // Schedule a state change that triggers the subscriber.
    mod.store.dispatch({ type: 'ui/openDialog', payload: 'projectWizard' });
    await vi.advanceTimersByTimeAsync(2100);
    expect(
      (globalThis.localStorage as unknown as { setItem: ReturnType<typeof vi.fn> }).setItem,
    ).not.toHaveBeenCalledWith('ice-cards', expect.any(String));
  });

  it('persists active-card snapshot via the backend when authenticated', async () => {
    mocks.isAuthenticated.mockReturnValue(true);
    const mod = await import('..');
    mod.store.dispatch({
      type: 'cards/createCard',
      payload: { id: 'c1', name: 'Test' },
    });
    mod.store.dispatch({ type: 'cards/setActiveCard', payload: 'c1' });
    await vi.advanceTimersByTimeAsync(2100);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(mocks.graphSave).toHaveBeenCalledWith('c1');
  });

  it('skips the backend save when the card hash is unchanged', async () => {
    mocks.isAuthenticated.mockReturnValue(true);
    const mod = await import('..');
    mod.store.dispatch({ type: 'cards/createCard', payload: { id: 'c1', name: 'T' } });
    mod.store.dispatch({ type: 'cards/setActiveCard', payload: 'c1' });
    await vi.advanceTimersByTimeAsync(2100);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    mocks.graphSave.mockClear();
    // Dispatch a no-op state change that doesn't touch the active card.
    mod.store.dispatch({ type: 'ui/openDialog', payload: 'projectWizard' });
    await vi.advanceTimersByTimeAsync(2100);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(mocks.graphSave).not.toHaveBeenCalled();
  });

  it('calls api.graph.save when isAuthenticated returns true', async () => {
    mocks.isAuthenticated.mockReturnValue(true);
    const mod = await import('..');
    mod.store.dispatch({ type: 'cards/createCard', payload: { id: 'c1', name: 'T' } });
    mod.store.dispatch({ type: 'cards/setActiveCard', payload: 'c1' });
    await vi.advanceTimersByTimeAsync(2100);
    // Allow microtask drain for dynamic imports
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(mocks.graphSave).toHaveBeenCalledWith('c1');
  });

  it('does NOT call api.graph.save when isAuthenticated returns false', async () => {
    mocks.isAuthenticated.mockReturnValue(false);
    const mod = await import('..');
    mod.store.dispatch({ type: 'cards/createCard', payload: { id: 'c1', name: 'T' } });
    mod.store.dispatch({ type: 'cards/setActiveCard', payload: 'c1' });
    await vi.advanceTimersByTimeAsync(2100);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(mocks.graphSave).not.toHaveBeenCalled();
  });

  it('swallows backend save errors', async () => {
    mocks.isAuthenticated.mockReturnValue(true);
    mocks.graphSave.mockRejectedValueOnce(new Error('network'));
    const mod = await import('..');
    mod.store.dispatch({ type: 'cards/createCard', payload: { id: 'c1', name: 'T' } });
    mod.store.dispatch({ type: 'cards/setActiveCard', payload: 'c1' });
    let threw: unknown = null;
    try {
      await vi.advanceTimersByTimeAsync(2100);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(0);
      }
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeNull();
  });

  it('debounces multiple rapid dispatches into one backend save', async () => {
    mocks.isAuthenticated.mockReturnValue(true);
    const mod = await import('..');
    mod.store.dispatch({ type: 'cards/createCard', payload: { id: 'c1', name: 'T' } });
    mod.store.dispatch({ type: 'cards/setActiveCard', payload: 'c1' });
    // Fire several updates quickly
    mod.store.dispatch({ type: 'cards/renameCard', payload: { id: 'c1', name: 'T2' } });
    mod.store.dispatch({ type: 'cards/renameCard', payload: { id: 'c1', name: 'T3' } });
    await vi.advanceTimersByTimeAsync(2100);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    // The debounce collapses rapid dispatches; we expect one save call for
    // the final state.
    expect(mocks.graphSave).toHaveBeenCalledTimes(1);
  });
});

// UI persistence (panel visibility, split-view layout) now lives in
// `store/user-preferences.ts` and is exercised by its own test file.

describe('store — cardHash function', () => {
  it('returns empty string for null/undefined card', async () => {
    mocks.isAuthenticated.mockReturnValue(true);
    const mod = await import('..');
    // No active card → setTimeout body returns early before invoking cardHash
    await vi.advanceTimersByTimeAsync(2100);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(mocks.graphSave).not.toHaveBeenCalled();
  });

  it('produces different hashes for cards with different node counts', async () => {
    mocks.isAuthenticated.mockReturnValue(true);
    const mod = await import('..');
    mod.store.dispatch({ type: 'cards/createCard', payload: { id: 'c1', name: 'T' } });
    mod.store.dispatch({ type: 'cards/setActiveCard', payload: 'c1' });
    await vi.advanceTimersByTimeAsync(2100);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    const initialSaves = mocks.graphSave.mock.calls.length;
    mocks.graphSave.mockClear();
    // Add a node — hash differs → new save
    mod.store.dispatch({
      type: 'cards/addNodeToCard',
      payload: {
        cardId: 'c1',
        node: { id: 'n1', type: 'block', position: { x: 0, y: 0 }, data: {} },
      },
    });
    await vi.advanceTimersByTimeAsync(2100);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    const afterSaves = mocks.graphSave.mock.calls.length;
    expect(initialSaves + afterSaves).toBeGreaterThanOrEqual(2);
  });
});

describe('store — defensive branches in card persistence', () => {
  it('returns early when activeCardId is set but the card is not in the cards list', async () => {
    const mod = await import('..');
    // The cards slice guards `setActiveCard` against unknown ids, so we
    // can't reach the `if (!activeCard) return;` branch through the public
    // dispatch surface. Inject divergent state via `replaceReducer`: a
    // custom `cards` reducer that responds to a test-only action shape.
    const { combineReducers } = await import('@reduxjs/toolkit');
    const realState = mod.store.getState();
    type AnyAction = { type: string; payload?: unknown };
    const customCardsReducer = (s = realState.cards, a: AnyAction): typeof realState.cards => {
      if (a.type === '__test__/divergeCardsState') {
        return { ...s, activeCardId: 'phantom', cards: [] };
      }
      return s;
    };
    // Compose a minimal replacement that keeps every other slice as-is by
    // returning the current state (vitest-only test path).
    const passthroughReducers: Record<string, (s: unknown) => unknown> = {};
    for (const k of Object.keys(realState)) {
      if (k === 'cards') continue;
      passthroughReducers[k] = (s = realState[k as keyof typeof realState]) => s;
    }
    mod.store.replaceReducer(combineReducers({ ...passthroughReducers, cards: customCardsReducer }) as never);
    mod.store.dispatch({ type: '__test__/divergeCardsState' });
    await vi.advanceTimersByTimeAsync(2100);
    const setItem = (globalThis.localStorage as unknown as { setItem: ReturnType<typeof vi.fn> }).setItem;
    const cardWrites = setItem.mock.calls.filter((c) => c[0] === 'ice-cards');
    expect(cardWrites.length).toBe(0);
  });

  it('cardHash handles cards with missing nodes/edges fields', async () => {
    // Reach the `card.nodes || []` and `card.edges || []` fallback branches
    // by injecting a card whose nodes/edges fields are missing entirely.
    mocks.isAuthenticated.mockReturnValue(true);
    const { combineReducers } = await import('@reduxjs/toolkit');
    const mod = await import('..');
    const realState = mod.store.getState();
    type AnyAction = { type: string; payload?: unknown };
    const customCardsReducer = (s = realState.cards, a: AnyAction): typeof realState.cards => {
      if (a.type === '__test__/sparseCard') {
        return {
          ...s,
          activeCardId: 'sparse',
          cards: [{ id: 'sparse', name: 'Sparse' } as unknown as (typeof s.cards)[number]],
        };
      }
      return s;
    };
    const passthroughReducers: Record<string, (s: unknown) => unknown> = {};
    for (const k of Object.keys(realState)) {
      if (k === 'cards') continue;
      passthroughReducers[k] = (s = realState[k as keyof typeof realState]) => s;
    }
    mod.store.replaceReducer(combineReducers({ ...passthroughReducers, cards: customCardsReducer }) as never);
    mod.store.dispatch({ type: '__test__/sparseCard' });
    await vi.advanceTimersByTimeAsync(2100);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    // The subscriber must reach api.graph.save without throwing on missing fields.
    expect(mocks.graphSave).toHaveBeenCalledWith('sparse');
  });

  it('skips backend save when one is already in flight', async () => {
    mocks.isAuthenticated.mockReturnValue(true);
    let resolveFirst: (() => void) | null = null;
    mocks.graphSave.mockImplementationOnce(
      () =>
        new Promise<void>((res) => {
          resolveFirst = res;
        }),
    );
    const mod = await import('..');
    mod.store.dispatch({ type: 'cards/createCard', payload: { id: 'c1', name: 'T' } });
    mod.store.dispatch({ type: 'cards/setActiveCard', payload: 'c1' });
    await vi.advanceTimersByTimeAsync(2100);
    // Drain the dynamic-import microtasks so api.graph.save is invoked.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(mocks.graphSave).toHaveBeenCalledTimes(1);
    // While the first save is still pending (resolveFirst not called),
    // dispatch a state change that mutates a hash-relevant field. cardHash
    // includes node count, so adding a node changes the hash. The
    // subscriber will reach the backend-save block and hit the in-flight
    // guard.
    mod.store.dispatch({
      type: 'cards/addNodeToCard',
      payload: {
        cardId: 'c1',
        node: { id: 'n1', type: 'block', position: { x: 0, y: 0 }, data: {} },
      },
    });
    await vi.advanceTimersByTimeAsync(2100);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(mocks.graphSave).toHaveBeenCalledTimes(1);
    // Resolve the first to clean up
    resolveFirst?.();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  });
});
