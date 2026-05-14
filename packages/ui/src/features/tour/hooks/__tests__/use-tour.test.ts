/**
 * tour-6 — useTour hook tests.
 *
 * Drives the hook via a mocked react-redux pair so we exercise the
 * dispatch + selector wiring without spinning up a React renderer.
 * The slice itself is mocked too — these tests assert that `useTour`'s
 * orchestration (start → advance → previous → skip → stop) dispatches
 * the right actions in the right order; slice behavior is covered in
 * `tour-slice.test.ts`.
 *
 * Per decision 2026-05-08, this is node-env / no-DOM (the hook calls
 * react-redux's `useDispatch` / `useSelector`, both of which we stub).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn<(action: unknown) => unknown>(),
  selectorState: {
    activeTourId: null as string | null,
    stepIdx: 0,
    completedTours: [] as string[],
  },
  registry: new Map<string, { id: string; steps: { id: string }[] }>(),
}));

// Stub `react` so `useCallback` is identity — we're driving the hook
// outside a renderer (no React component tree, no fiber). The hook
// only consumes `useCallback`; mocking that one symbol keeps the
// implementation ergonomic without pulling in @testing-library.
vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: (s: { tour: typeof mocks.selectorState }) => unknown) =>
    sel({ tour: mocks.selectorState }),
}));

vi.mock('../../utils/tour-registry', () => ({
  getTour: (id: string) => mocks.registry.get(id),
}));

// Slice mock — preserve identity so dispatch-call assertions match by
// reference. We export plain action-creator stubs that return shape-
// compatible objects.
vi.mock('../../store/tour-slice', () => {
  return {
    startTour: (payload: { tourId: string; totalSteps: number }) => ({
      type: 'tour/startTour',
      payload,
    }),
    setStep: (payload: number) => ({ type: 'tour/setStep', payload }),
    setPhase: (payload: string) => ({ type: 'tour/setPhase', payload }),
    markCompleted: (payload: string) => ({ type: 'tour/markCompleted', payload }),
    stopTour: () => ({ type: 'tour/stopTour' }),
    flagSkipped: (payload: string) => ({ type: 'tour/flagSkipped', payload }),
    hydrateFromUser: (payload: { completedTours: string[] }) => ({
      type: 'tour/hydrateFromUser',
      payload,
    }),
    recordAdvance: () => ({ type: 'tour/recordAdvance' }),
    resetTour: () => ({ type: 'tour/resetTour' }),
    persistCompletedTour: (id: string) => ({ type: 'tour/persistCompletedTour', payload: id }),
  };
});

import { useTour } from '../use-tour';

beforeEach(() => {
  mocks.dispatch.mockReset();
  mocks.registry.clear();
  mocks.selectorState.activeTourId = null;
  mocks.selectorState.stepIdx = 0;
  mocks.selectorState.completedTours = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function registerTour(id: string, totalSteps = 3): void {
  mocks.registry.set(id, {
    id,
    steps: Array.from({ length: totalSteps }, (_, i) => ({ id: `step-${i}` })),
  });
}

interface MockAction {
  type: string;
  payload?: unknown;
}

function dispatchedTypes(): string[] {
  return mocks.dispatch.mock.calls.map((call) => (call[0] as MockAction).type);
}

describe('useTour — selectors', () => {
  it('exposes activeTourId / stepIdx / totalSteps from registry+slice', () => {
    registerTour('canvas-tour', 5);
    mocks.selectorState.activeTourId = 'canvas-tour';
    mocks.selectorState.stepIdx = 2;
    const t = useTour();
    expect(t.activeTourId).toBe('canvas-tour');
    expect(t.stepIdx).toBe(2);
    expect(t.totalSteps).toBe(5);
  });

  it('totalSteps === 0 when no active tour', () => {
    const t = useTour();
    expect(t.totalSteps).toBe(0);
    expect(t.isFirst).toBe(true);
    expect(t.isLast).toBe(false);
  });

  it('isFirst / isLast computed from stepIdx + totalSteps', () => {
    registerTour('canvas-tour', 3);
    mocks.selectorState.activeTourId = 'canvas-tour';
    mocks.selectorState.stepIdx = 0;
    let t = useTour();
    expect(t.isFirst).toBe(true);
    expect(t.isLast).toBe(false);

    mocks.selectorState.stepIdx = 2;
    t = useTour();
    expect(t.isFirst).toBe(false);
    expect(t.isLast).toBe(true);
  });

  it('isCompleted predicate against completedTours', () => {
    mocks.selectorState.completedTours = ['canvas-tour'];
    const t = useTour();
    expect(t.isCompleted('canvas-tour')).toBe(true);
    expect(t.isCompleted('palette-tour')).toBe(false);
  });
});

describe('useTour.start', () => {
  it('dispatches startTour with totalSteps from the registry', () => {
    registerTour('canvas-tour', 4);
    const t = useTour();
    t.start('canvas-tour');
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'tour/startTour',
      payload: { tourId: 'canvas-tour', totalSteps: 4 },
    });
  });

  it('unregistered id: no-op + warn in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = useTour();
    t.start('nope');
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nope"'));
    warn.mockRestore();
  });

  it('re-launches a previously completed tour (Help button path)', () => {
    // After completion the autostart predicate filters this id out, but
    // a manual `start()` call from the Help button must still fire.
    registerTour('canvas-tour', 4);
    mocks.selectorState.completedTours = ['canvas-tour'];
    const t = useTour();
    t.start('canvas-tour');
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'tour/startTour',
      payload: { tourId: 'canvas-tour', totalSteps: 4 },
    });
  });
});

describe('useTour.advance', () => {
  it('not-last step → recordAdvance + setStep + setPhase(navigating)', () => {
    registerTour('canvas-tour', 3);
    mocks.selectorState.activeTourId = 'canvas-tour';
    mocks.selectorState.stepIdx = 0;
    const t = useTour();
    t.advance();
    expect(dispatchedTypes()).toEqual(['tour/recordAdvance', 'tour/setStep', 'tour/setPhase']);
    const setStepCall = mocks.dispatch.mock.calls[1][0] as MockAction;
    expect(setStepCall.payload).toBe(1);
    const setPhaseCall = mocks.dispatch.mock.calls[2][0] as MockAction;
    expect(setPhaseCall.payload).toBe('navigating');
  });

  it('last step → recordAdvance + markCompleted + persistCompletedTour', () => {
    registerTour('canvas-tour', 3);
    mocks.selectorState.activeTourId = 'canvas-tour';
    mocks.selectorState.stepIdx = 2; // 0-based, last of 3
    const t = useTour();
    t.advance();
    expect(dispatchedTypes()).toEqual([
      'tour/recordAdvance',
      'tour/markCompleted',
      'tour/persistCompletedTour',
    ]);
    expect(
      (mocks.dispatch.mock.calls[1][0] as MockAction).payload,
    ).toBe('canvas-tour');
    expect(
      (mocks.dispatch.mock.calls[2][0] as MockAction).payload,
    ).toBe('canvas-tour');
  });

  it('no active tour: no-op', () => {
    const t = useTour();
    t.advance();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});

describe('useTour.previous', () => {
  it('stepIdx > 0 → setStep(idx-1) + setPhase(navigating)', () => {
    registerTour('canvas-tour', 3);
    mocks.selectorState.activeTourId = 'canvas-tour';
    mocks.selectorState.stepIdx = 2;
    const t = useTour();
    t.previous();
    expect(dispatchedTypes()).toEqual(['tour/setStep', 'tour/setPhase']);
    expect((mocks.dispatch.mock.calls[0][0] as MockAction).payload).toBe(1);
  });

  it('stepIdx === 0 → no-op', () => {
    registerTour('canvas-tour', 3);
    mocks.selectorState.activeTourId = 'canvas-tour';
    mocks.selectorState.stepIdx = 0;
    const t = useTour();
    t.previous();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('no active tour → no-op', () => {
    const t = useTour();
    t.previous();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});

describe('useTour.skip', () => {
  it('flagSkipped + markCompleted + persistCompletedTour', () => {
    registerTour('canvas-tour', 3);
    mocks.selectorState.activeTourId = 'canvas-tour';
    mocks.selectorState.stepIdx = 1;
    const t = useTour();
    t.skip();
    expect(dispatchedTypes()).toEqual([
      'tour/flagSkipped',
      'tour/markCompleted',
      'tour/persistCompletedTour',
    ]);
  });

  it('no active tour → no-op', () => {
    const t = useTour();
    t.skip();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});

describe('useTour.stop', () => {
  it('active tour → stopTour dispatched (no completion)', () => {
    registerTour('canvas-tour', 3);
    mocks.selectorState.activeTourId = 'canvas-tour';
    mocks.selectorState.stepIdx = 1;
    const t = useTour();
    t.stop();
    expect(dispatchedTypes()).toEqual(['tour/stopTour']);
  });

  it('no active tour → no-op (avoids action-log noise)', () => {
    const t = useTour();
    t.stop();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('on last step → markCompleted + persist (user saw every step)', () => {
    registerTour('canvas-tour', 3);
    mocks.selectorState.activeTourId = 'canvas-tour';
    mocks.selectorState.stepIdx = 2;
    const t = useTour();
    t.stop();
    expect(dispatchedTypes()).toEqual([
      'tour/markCompleted',
      'tour/persistCompletedTour',
    ]);
  });
});

describe('useTour.hydrate', () => {
  it('dispatches hydrateFromUser with the supplied list', () => {
    const t = useTour();
    t.hydrate(['canvas-tour', 'palette-tour']);
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'tour/hydrateFromUser',
      payload: { completedTours: ['canvas-tour', 'palette-tour'] },
    });
  });
});
