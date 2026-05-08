/**
 * tour-6 — Reducer + thunk tests for tour-slice.
 *
 * Pure RTK; node env per decision 2026-05-08 (slice has no DOM
 * dependency beyond a `localStorage` global which we stub via
 * `vi.stubGlobal`). Covers blueprint §6/tour-6's required cases plus
 * edge paths: dup id idempotence, parse-error fallback, thunk
 * dispatched without active tour, thunk failure logging.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  axiosPut: vi.fn(),
  // Registry stub — let each test push tours in without touching the
  // real module-scoped Map. The slice imports `getTour` from the
  // registry; we mock that path so unregistered-tour branches are
  // deterministic.
  registry: new Map<string, { id: string; title: string; steps: { id: string }[] }>(),
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: {
    put: (...args: unknown[]) => mocks.axiosPut(...args),
  },
}));

vi.mock('../../utils/tour-registry', () => ({
  getTour: (id: string) => mocks.registry.get(id),
  registerTour: (t: { id: string; title: string; steps: { id: string }[] }) => {
    mocks.registry.set(t.id, t);
  },
  unregisterTour: (id: string) => {
    mocks.registry.delete(id);
  },
  allTours: () => Array.from(mocks.registry.values()),
}));

import { configureStore } from '@reduxjs/toolkit';
import tourReducer, {
  COMPLETED_TOURS_STORAGE_KEY,
  flagSkipped,
  hydrateFromUser,
  markCompleted,
  persistCompletedTour,
  recordAdvance,
  resetTour,
  setPhase,
  setStep,
  startTour,
  stopTour,
  selectActiveTourId,
  selectCompletedTours,
  selectHydrated,
  selectIsCompleted,
  selectPhase,
  selectStepIdx,
  type TourState,
} from '../tour-slice';

// ---------------------------------------------------------------------------
// localStorage stub. Real `localStorage` doesn't exist in vitest's default
// node env; we stub a Map-backed fake at the start of every test and
// tear it down after.
// ---------------------------------------------------------------------------
let storage: Map<string, string>;

function installStorage(initial: Record<string, string> = {}): void {
  storage = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, String(v));
    },
    removeItem: (k: string) => {
      storage.delete(k);
    },
    clear: () => {
      storage.clear();
    },
    key: (i: number) => Array.from(storage.keys())[i] ?? null,
    get length() {
      return storage.size;
    },
  });
}

/** Re-seed storage and re-stub for the fast-path-read tests. */
function seedAndStub(initial: Record<string, string>): void {
  installStorage(initial);
}

beforeEach(() => {
  mocks.axiosPut.mockReset();
  mocks.registry.clear();
  installStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function init(): TourState {
  return tourReducer(undefined, { type: '@@INIT' });
}

function registerTour(id: string, totalSteps = 3): void {
  mocks.registry.set(id, {
    id,
    title: `${id}.title`,
    steps: Array.from({ length: totalSteps }, (_, i) => ({ id: `step-${i}` })),
  });
}

// ---------------------------------------------------------------------------
// Initial state + localStorage fast-path
// ---------------------------------------------------------------------------
describe('tour-slice — initial state', () => {
  it('seeds idle / no active tour / empty completedTours when storage is empty', () => {
    expect(init()).toEqual({
      activeTourId: null,
      stepIdx: 0,
      phase: 'idle',
      completedTours: [],
      perTour: {},
      hydrated: false,
    });
  });

  it('reads localStorage fast-path on initial state computation', async () => {
    // Must re-stub BEFORE importing the module under test so the slice
    // file's top-level `readCompletedFromStorage()` runs with the
    // seeded value. `vi.resetModules` busts the import cache so the
    // re-import re-evaluates the slice's top-level expressions.
    seedAndStub({ [COMPLETED_TOURS_STORAGE_KEY]: JSON.stringify(['canvas-tour', 'palette-tour']) });
    vi.resetModules();
    const mod = await import('../tour-slice');
    const fresh = mod.default(undefined, { type: '@@INIT' });
    expect(fresh.completedTours).toEqual(['canvas-tour', 'palette-tour']);
  });

  it('localStorage parse error falls back to empty array', async () => {
    seedAndStub({ [COMPLETED_TOURS_STORAGE_KEY]: '{not-json' });
    vi.resetModules();
    const mod = await import('../tour-slice');
    const fresh = mod.default(undefined, { type: '@@INIT' });
    expect(fresh.completedTours).toEqual([]);
  });

  it('non-array stored payload falls back to empty array', async () => {
    seedAndStub({ [COMPLETED_TOURS_STORAGE_KEY]: JSON.stringify({ huh: true }) });
    vi.resetModules();
    const mod = await import('../tour-slice');
    const fresh = mod.default(undefined, { type: '@@INIT' });
    expect(fresh.completedTours).toEqual([]);
  });

  it('filters non-string entries when reading the fast-path', async () => {
    seedAndStub({ [COMPLETED_TOURS_STORAGE_KEY]: JSON.stringify(['ok', 42, null, 'good']) });
    vi.resetModules();
    const mod = await import('../tour-slice');
    const fresh = mod.default(undefined, { type: '@@INIT' });
    expect(fresh.completedTours).toEqual(['ok', 'good']);
  });
});

// ---------------------------------------------------------------------------
// startTour / setStep / setPhase
// ---------------------------------------------------------------------------
describe('startTour', () => {
  it('sets activeTourId, stepIdx=0, phase=navigating', () => {
    registerTour('canvas-tour', 5);
    const s = tourReducer(init(), startTour({ tourId: 'canvas-tour', totalSteps: 5 }));
    expect(s.activeTourId).toBe('canvas-tour');
    expect(s.stepIdx).toBe(0);
    expect(s.phase).toBe('navigating');
  });

  it('seeds perTour telemetry counter to {stepsAdvanced: 0, skipped: false}', () => {
    registerTour('canvas-tour', 3);
    const s = tourReducer(init(), startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    expect(s.perTour['canvas-tour']).toEqual({ stepsAdvanced: 0, skipped: false });
  });

  it('with unregistered tour: no-op + warn in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = init();
    const s = tourReducer(before, startTour({ tourId: 'nope', totalSteps: 1 }));
    expect(s).toEqual(before);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nope"'));
    warn.mockRestore();
  });

  it('resets stepIdx when starting a new tour after stop()', () => {
    registerTour('canvas-tour', 3);
    let s = tourReducer(init(), startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    s = tourReducer(s, setStep(2));
    s = tourReducer(s, stopTour());
    s = tourReducer(s, startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    expect(s.stepIdx).toBe(0);
  });
});

describe('setStep / setPhase', () => {
  it('setStep writes the value verbatim', () => {
    const s = tourReducer(init(), setStep(7));
    expect(s.stepIdx).toBe(7);
  });

  it('setPhase writes the phase verbatim', () => {
    const s = tourReducer(init(), setPhase('placed'));
    expect(s.phase).toBe('placed');
  });
});

// ---------------------------------------------------------------------------
// markCompleted
// ---------------------------------------------------------------------------
describe('markCompleted', () => {
  it('appends id, resets active state, writes localStorage', () => {
    registerTour('canvas-tour', 3);
    let s = tourReducer(init(), startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    s = tourReducer(s, setStep(2));
    s = tourReducer(s, markCompleted('canvas-tour'));
    expect(s.activeTourId).toBeNull();
    expect(s.stepIdx).toBe(0);
    expect(s.phase).toBe('idle');
    expect(s.completedTours).toEqual(['canvas-tour']);
    expect(JSON.parse(storage.get(COMPLETED_TOURS_STORAGE_KEY) ?? '[]')).toEqual(['canvas-tour']);
  });

  it('is idempotent on duplicate ids (no second push)', () => {
    let s = tourReducer(init(), markCompleted('canvas-tour'));
    s = tourReducer(s, markCompleted('canvas-tour'));
    expect(s.completedTours).toEqual(['canvas-tour']);
  });

  it('preserves insertion order across multiple completions', () => {
    let s = tourReducer(init(), markCompleted('a'));
    s = tourReducer(s, markCompleted('b'));
    s = tourReducer(s, markCompleted('c'));
    expect(s.completedTours).toEqual(['a', 'b', 'c']);
  });

  it('localStorage write tolerates a throwing setItem (does not crash)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    });
    expect(() => tourReducer(init(), markCompleted('canvas-tour'))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// stopTour
// ---------------------------------------------------------------------------
describe('stopTour', () => {
  it('closes without marking completed', () => {
    registerTour('canvas-tour', 3);
    let s = tourReducer(init(), startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    s = tourReducer(s, setStep(1));
    s = tourReducer(s, stopTour());
    expect(s.activeTourId).toBeNull();
    expect(s.stepIdx).toBe(0);
    expect(s.phase).toBe('idle');
    expect(s.completedTours).toEqual([]);
  });

  it('preserves perTour telemetry (stepsAdvanced kept for analytics)', () => {
    registerTour('canvas-tour', 3);
    let s = tourReducer(init(), startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    s = tourReducer(s, recordAdvance());
    s = tourReducer(s, recordAdvance());
    s = tourReducer(s, stopTour());
    expect(s.perTour['canvas-tour']).toEqual({ stepsAdvanced: 2, skipped: false });
  });
});

// ---------------------------------------------------------------------------
// flagSkipped + skip semantics (slice + use-tour orchestration)
// ---------------------------------------------------------------------------
describe('flagSkipped', () => {
  it('flips perTour[id].skipped to true', () => {
    registerTour('canvas-tour', 3);
    let s = tourReducer(init(), startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    s = tourReducer(s, flagSkipped('canvas-tour'));
    expect(s.perTour['canvas-tour'].skipped).toBe(true);
  });

  it('creates the entry when no tour was active (defensive)', () => {
    const s = tourReducer(init(), flagSkipped('foo'));
    expect(s.perTour['foo']).toEqual({ stepsAdvanced: 0, skipped: true });
  });
});

// ---------------------------------------------------------------------------
// hydrateFromUser
// ---------------------------------------------------------------------------
describe('hydrateFromUser', () => {
  it('merges arrays + dedupes; server ids appended in their order', () => {
    let s = tourReducer(init(), markCompleted('local-1'));
    s = tourReducer(s, hydrateFromUser({ completedTours: ['server-1', 'local-1', 'server-2'] }));
    expect(s.completedTours).toEqual(['local-1', 'server-1', 'server-2']);
    expect(s.hydrated).toBe(true);
  });

  it('writes merged set back to localStorage', () => {
    const s = tourReducer(init(), hydrateFromUser({ completedTours: ['alpha', 'beta'] }));
    expect(JSON.parse(storage.get(COMPLETED_TOURS_STORAGE_KEY) ?? '[]')).toEqual(['alpha', 'beta']);
    expect(s.completedTours).toEqual(['alpha', 'beta']);
  });

  it('handles missing payload field gracefully', () => {
    const s = tourReducer(init(), hydrateFromUser({ completedTours: undefined as unknown as string[] }));
    expect(s.completedTours).toEqual([]);
    expect(s.hydrated).toBe(true);
  });

  it('filters non-string entries from the server payload', () => {
    const s = tourReducer(
      init(),
      hydrateFromUser({ completedTours: ['ok', 42 as unknown as string, 'good'] }),
    );
    expect(s.completedTours).toEqual(['ok', 'good']);
  });

  it('flips hydrated=true even when both sides are empty', () => {
    const s = tourReducer(init(), hydrateFromUser({ completedTours: [] }));
    expect(s.hydrated).toBe(true);
    expect(s.completedTours).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// recordAdvance + resetTour
// ---------------------------------------------------------------------------
describe('recordAdvance', () => {
  it('increments perTour[activeTourId].stepsAdvanced', () => {
    registerTour('canvas-tour', 3);
    let s = tourReducer(init(), startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    s = tourReducer(s, recordAdvance());
    s = tourReducer(s, recordAdvance());
    expect(s.perTour['canvas-tour'].stepsAdvanced).toBe(2);
  });

  it('is a no-op when no active tour', () => {
    const s = tourReducer(init(), recordAdvance());
    expect(s.perTour).toEqual({});
  });
});

describe('resetTour', () => {
  it('clears active state but preserves completedTours', () => {
    registerTour('canvas-tour', 3);
    let s = tourReducer(init(), markCompleted('canvas-tour'));
    s = tourReducer(s, startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    s = tourReducer(s, setStep(2));
    s = tourReducer(s, resetTour());
    expect(s.activeTourId).toBeNull();
    expect(s.stepIdx).toBe(0);
    expect(s.phase).toBe('idle');
    expect(s.completedTours).toEqual(['canvas-tour']);
  });
});

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------
describe('selectors', () => {
  function fromState(state: TourState) {
    return { tour: state };
  }

  it('selectActiveTourId / selectStepIdx / selectPhase / selectHydrated', () => {
    registerTour('canvas-tour', 3);
    let s = tourReducer(init(), startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    s = tourReducer(s, setStep(2));
    s = tourReducer(s, setPhase('placed'));
    s = tourReducer(s, hydrateFromUser({ completedTours: [] }));
    expect(selectActiveTourId(fromState(s))).toBe('canvas-tour');
    expect(selectStepIdx(fromState(s))).toBe(2);
    expect(selectPhase(fromState(s))).toBe('placed');
    expect(selectHydrated(fromState(s))).toBe(true);
  });

  it('selectCompletedTours + selectIsCompleted(id)', () => {
    let s = tourReducer(init(), markCompleted('canvas-tour'));
    s = tourReducer(s, markCompleted('palette-tour'));
    expect(selectCompletedTours(fromState(s))).toEqual(['canvas-tour', 'palette-tour']);
    expect(selectIsCompleted('canvas-tour')(fromState(s))).toBe(true);
    expect(selectIsCompleted('nope')(fromState(s))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// persistCompletedTour thunk (success + failure)
// ---------------------------------------------------------------------------
describe('persistCompletedTour thunk', () => {
  function makeStore() {
    return configureStore({ reducer: { tour: tourReducer } });
  }

  it('PUTs /onboarding/completed-tours/:id on success', async () => {
    mocks.axiosPut.mockResolvedValue({ data: { completed_tours: ['canvas-tour'] } });
    const store = makeStore();
    await store.dispatch(persistCompletedTour('canvas-tour') as never);
    expect(mocks.axiosPut).toHaveBeenCalledWith('/onboarding/completed-tours/canvas-tour');
  });

  it('encodes the id in the URL (handles ":" / "/" without breaking the route)', async () => {
    mocks.axiosPut.mockResolvedValue({ data: {} });
    const store = makeStore();
    await store.dispatch(persistCompletedTour('weird/id:1') as never);
    expect(mocks.axiosPut).toHaveBeenCalledWith('/onboarding/completed-tours/weird%2Fid%3A1');
  });

  it('failure path: warns but does NOT throw (optimistic — slice keeps state)', async () => {
    mocks.axiosPut.mockRejectedValue(new Error('network down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = makeStore();
    // Slice has already optimistically marked the tour completed; thunk
    // failure should not roll that back.
    store.dispatch(markCompleted('canvas-tour'));
    await expect(store.dispatch(persistCompletedTour('canvas-tour') as never)).resolves.toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('canvas-tour'), expect.any(Error));
    expect(store.getState().tour.completedTours).toEqual(['canvas-tour']);
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// End-to-end advance/skip/stop sequences via configureStore
// ---------------------------------------------------------------------------
describe('end-to-end sequences (configureStore)', () => {
  function makeStore() {
    return configureStore({ reducer: { tour: tourReducer } });
  }

  it('advance not-last → stepIdx + 1, phase navigating (orchestrated by useTour)', () => {
    registerTour('canvas-tour', 3);
    const store = makeStore();
    store.dispatch(startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    store.dispatch(setStep(1));
    store.dispatch(setPhase('navigating'));
    expect(store.getState().tour.stepIdx).toBe(1);
    expect(store.getState().tour.phase).toBe('navigating');
  });

  it('advance last-step → markCompleted, slice closes', () => {
    registerTour('canvas-tour', 3);
    const store = makeStore();
    store.dispatch(startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    store.dispatch(setStep(2));
    store.dispatch(markCompleted('canvas-tour'));
    expect(store.getState().tour.activeTourId).toBeNull();
    expect(store.getState().tour.completedTours).toEqual(['canvas-tour']);
  });

  it('previous: stepIdx > 0 → stepIdx - 1', () => {
    registerTour('canvas-tour', 3);
    const store = makeStore();
    store.dispatch(startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    store.dispatch(setStep(2));
    store.dispatch(setStep(1));
    expect(store.getState().tour.stepIdx).toBe(1);
  });

  it('skip: closes + adds to completedTours', () => {
    registerTour('canvas-tour', 3);
    const store = makeStore();
    store.dispatch(startTour({ tourId: 'canvas-tour', totalSteps: 3 }));
    store.dispatch(flagSkipped('canvas-tour'));
    store.dispatch(markCompleted('canvas-tour'));
    expect(store.getState().tour.activeTourId).toBeNull();
    expect(store.getState().tour.completedTours).toEqual(['canvas-tour']);
    expect(store.getState().tour.perTour['canvas-tour'].skipped).toBe(true);
  });
});
