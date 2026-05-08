// @vitest-environment jsdom
/**
 * tour-13 — `useTourAutostart` hook tests.
 *
 * Per decision 2026-05-08 ("Test environment ceiling for the tour
 * engine"): hooks that consume react-router-dom + react-redux + run
 * under a real `useEffect` lifecycle live under jsdom. The hook
 * dispatches Redux thunks (`start(id)` → `startTour`) AND drives a
 * `navigate(...)` call, both of which need a real React render to
 * exercise.
 *
 * Test harness (small footprint):
 *   - Mounts a tiny `<Probe>` FC inside `<Provider>` + `<MemoryRouter>`.
 *   - The Probe just calls `useTourAutostart()` (no render output).
 *   - The Memory router is initialized with the test's URL; we observe
 *     the navigate side-effect via the router's `useLocation` snapshot
 *     reflected back into the store, OR via a sibling `<NavWatcher>`
 *     that records `useLocation()` per render.
 *
 * The real registry + real slice are used; only `axios-instance` is
 * stubbed so `persistCompletedTour` doesn't fire a network call.
 */

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: {
    put: () => Promise.resolve({ data: {} }),
  },
}));

import tourReducer, { hydrateFromUser } from '../../store/tour-slice';
import { clearRegistry, registerTour } from '../../utils/tour-registry';
import type { Tour } from '../../tour.types';
import { useTourAutostart } from '../use-tour-autostart';

// ─── Harness ────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { tour: tourReducer } });
}
type TestStore = ReturnType<typeof makeStore>;

let container: HTMLDivElement;
let root: Root;

/**
 * Live snapshot of `useLocation()` — updated every time a child renders
 * inside the router. Tests assert against this AFTER the hook's
 * `useEffect` fires its `navigate(...)` strip-call.
 */
let lastLocation: { pathname: string; search: string; hash: string } = {
  pathname: '/',
  search: '',
  hash: '',
};

const NavWatcher: React.FC = () => {
  const loc = useLocation();
  lastLocation = { pathname: loc.pathname, search: loc.search, hash: loc.hash };
  return null;
};

const Probe: React.FC = () => {
  useTourAutostart();
  return null;
};

function mount(initialEntry: string, store: TestStore): void {
  act(() => {
    root.render(
      // `React.createElement` typings on Provider/MemoryRouter want `children`
      // in the props bag. We pass children via the variadic args (the
      // documented runtime pattern) and silence the strict-mode mismatch
      // with a narrow `as any`.
      React.createElement(
        Provider as React.JSXElementConstructor<{ store: TestStore; children?: React.ReactNode }>,
        { store },
        React.createElement(
          MemoryRouter,
          { initialEntries: [initialEntry] },
          React.createElement(Probe, null),
          React.createElement(NavWatcher, null),
        ),
      ),
    );
  });
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
}

function makeTour(id: string): Tour {
  return {
    id,
    title: `tour.${id}.title`,
    steps: [{ id: 'step-1', target: '#anchor-1', title: 'tour.t1', body: 'tour.b1' }],
  };
}

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearRegistry();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  lastLocation = { pathname: '/', search: '', hash: '' };
});

afterEach(() => {
  unmount();
  document.body.innerHTML = '';
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useTourAutostart — registered tour', () => {
  it('?tour=canvas-tour → start dispatched, param stripped from URL', () => {
    registerTour(makeTour('canvas-tour'));
    const store = makeStore();
    mount('/projects/foo?tour=canvas-tour', store);
    expect(store.getState().tour.activeTourId).toBe('canvas-tour');
    expect(lastLocation.search).toBe('');
    expect(lastLocation.pathname).toBe('/projects/foo');
  });

  it('preserves other query params when stripping ?tour', () => {
    registerTour(makeTour('canvas-tour'));
    const store = makeStore();
    mount('/p?foo=bar&tour=canvas-tour', store);
    expect(store.getState().tour.activeTourId).toBe('canvas-tour');
    expect(lastLocation.search).toBe('?foo=bar');
  });

  it('preserves hash when stripping ?tour', () => {
    registerTour(makeTour('canvas-tour'));
    const store = makeStore();
    mount('/p?tour=canvas-tour#section-2', store);
    expect(store.getState().tour.activeTourId).toBe('canvas-tour');
    expect(lastLocation.hash).toBe('#section-2');
  });
});

describe('useTourAutostart — unknown tour id', () => {
  it('?tour=unknown → no start, dev-warn fires, param stripped', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = makeStore();
    mount('/p?tour=unknown', store);
    expect(store.getState().tour.activeTourId).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown tour id: unknown'),
    );
    expect(lastLocation.search).toBe('');
    warnSpy.mockRestore();
  });
});

describe('useTourAutostart — already-completed tour', () => {
  it('id is in completedTours → no start, param stripped silently (no warn)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerTour(makeTour('canvas-tour'));
    const store = makeStore();
    // Hydrate the slice with the id already completed.
    act(() => {
      store.dispatch(hydrateFromUser({ completedTours: ['canvas-tour'] }));
    });
    mount('/p?tour=canvas-tour', store);
    expect(store.getState().tour.activeTourId).toBeNull();
    expect(lastLocation.search).toBe('');
    // No warn — silent strip.
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('useTourAutostart — no param', () => {
  it('absent param → no-op, no navigate', () => {
    registerTour(makeTour('canvas-tour'));
    const store = makeStore();
    mount('/p?other=1', store);
    // No tour started.
    expect(store.getState().tour.activeTourId).toBeNull();
    // search left as-is.
    expect(lastLocation.search).toBe('?other=1');
  });
});

describe('useTourAutostart — duplicate effect guard', () => {
  it('StrictMode-style double-effect → start dispatched only once', () => {
    registerTour({
      ...makeTour('canvas-tour'),
      steps: [
        { id: 's1', target: '#a', title: 't1', body: 'b1' },
        { id: 's2', target: '#b', title: 't2', body: 'b2' },
      ],
    });
    const store = makeStore();
    // Mount under StrictMode — every effect runs twice in dev. The
    // hook's `useRef` gate suppresses the second dispatch.
    act(() => {
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(
            Provider as React.JSXElementConstructor<{ store: TestStore; children?: React.ReactNode }>,
            { store },
            React.createElement(
              MemoryRouter,
              { initialEntries: ['/p?tour=canvas-tour'] },
              React.createElement(Probe, null),
              React.createElement(NavWatcher, null),
            ),
          ),
        ),
      );
    });
    // Advance once — stepIdx is now 1.
    act(() => {
      store.dispatch({ type: 'tour/setStep', payload: 1 });
    });
    expect(store.getState().tour.stepIdx).toBe(1);
    // If the hook re-fired `start`, the reducer would reset stepIdx
    // back to 0. Force one more render cycle and assert stepIdx
    // stayed at 1.
    act(() => {
      // Trigger a no-op redux action to force a render pass.
      store.dispatch({ type: 'tour/__noop' });
    });
    expect(store.getState().tour.stepIdx).toBe(1);
  });
});

describe('useTourAutostart — multiple tour params', () => {
  it('?tour=a&tour=b → uses the first; strips both', () => {
    registerTour(makeTour('a'));
    registerTour(makeTour('b'));
    const store = makeStore();
    mount('/p?tour=a&tour=b', store);
    expect(store.getState().tour.activeTourId).toBe('a');
    expect(lastLocation.search).toBe('');
  });
});

describe('useTourAutostart — empty value', () => {
  it('?tour= (empty value) → no-op (treated as absent)', () => {
    registerTour(makeTour('canvas-tour'));
    const store = makeStore();
    mount('/p?tour=', store);
    expect(store.getState().tour.activeTourId).toBeNull();
    // Empty `tour` is no-op — leave search as-is per the empty-id branch.
    expect(lastLocation.search).toBe('?tour=');
  });
});

describe('useTourAutostart — re-paste behavior', () => {
  it('navigating to the same id again after a strip → re-fires (re-paste = fresh request)', () => {
    registerTour(makeTour('canvas-tour'));
    const store = makeStore();
    // Initial mount with the param — fires once + strips.
    mount('/p?tour=canvas-tour', store);
    expect(store.getState().tour.activeTourId).toBe('canvas-tour');
    expect(lastLocation.search).toBe('');
    // Now simulate the user finishing the tour (slice clears
    // activeTourId on stopTour). A re-paste with the same id in the
    // URL should re-fire because the param vanished after the first
    // strip and is now reappearing.
    act(() => {
      // Stop the active tour without marking complete (Esc path).
      store.dispatch({ type: 'tour/stopTour' });
    });
    expect(store.getState().tour.activeTourId).toBeNull();
    // Force a fresh router with the param again.
    unmount();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mount('/p?tour=canvas-tour', store);
    expect(store.getState().tour.activeTourId).toBe('canvas-tour');
  });
});

describe('useTourAutostart — completed-but-known still strips', () => {
  it('completed id strips the param without a console warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerTour(makeTour('canvas-tour'));
    const store = makeStore();
    act(() => {
      store.dispatch(hydrateFromUser({ completedTours: ['canvas-tour'] }));
    });
    mount('/projects/x?keep=1&tour=canvas-tour&also=2', store);
    // search stripped to remaining params, order preserved.
    expect(lastLocation.search).toBe('?keep=1&also=2');
    // No warn (silent strip path).
    expect(warnSpy).not.toHaveBeenCalled();
    // No tour started.
    expect(store.getState().tour.activeTourId).toBeNull();
    warnSpy.mockRestore();
  });
});

describe('useTourAutostart — non-production warn gate', () => {
  it('unknown id under NODE_ENV=test (non-prod) emits the warn', () => {
    // Vitest sets NODE_ENV=test by default — verify the warn fires.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = makeStore();
    mount('/p?tour=does-not-exist', store);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown tour id: does-not-exist'),
    );
    warnSpy.mockRestore();
  });
});
