// @vitest-environment jsdom
/**
 * tour-12 — TourRunner orchestrator tests.
 *
 * Per `state/decisions.md` (2026-05-08) "Test environment ceiling for the
 * tour engine": React + Redux + react-router + Radix children + portals
 * → jsdom. Mock the visual children (TourOverlay, TourPopover) as
 * marker components so we can observe runner-driven prop flow without
 * pulling in Radix internals.
 *
 * What's mocked:
 *   - `useNavigate` / `useLocation` from react-router-dom — replaced by
 *     a tiny harness that the tests drive directly. (Avoids needing a
 *     <BrowserRouter> wrapper in every test.)
 *   - `TourOverlay` / `TourPopover` — marker components capture props.
 *   - The in-tree `tours` config — replaced with a controlled set so
 *     register-call assertions are deterministic.
 *
 * NOT mocked: the real registry (`utils/tour-registry`), the real slice
 * (with thunks short-circuited via axios mock), the real hooks (resolver,
 * position, keyboard, route). The runner's job is to orchestrate THOSE
 * units, not re-implement them; mocking them out turns the tests into a
 * tautology check.
 */

import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks ───────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { pathname: '/', search: '', hash: '', state: null, key: 'k' } as {
    pathname: string;
    search: string;
    hash: string;
    state: unknown;
    key: string;
  },
  axiosPut: vi.fn(),
  overlayProps: [] as Array<{ rect: DOMRect | null; pad: number | undefined }>,
  popoverProps: [] as Array<{
    stepId: string;
    stepIdx: number;
    totalSteps: number;
    anchor: Element | null;
  }>,
  tours: [] as Array<{ id: string; title: string; steps: Array<unknown> }>,
}));

// react-router-dom — minimal stub. TourRunner only reads useNavigate +
// useLocation (via use-tour-route).
vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.location,
}));

// Axios — silent no-op so persistCompletedTour doesn't try to PUT.
vi.mock('../../../../shared/api/axios-instance', () => ({
  default: {
    put: (...args: unknown[]) => {
      mocks.axiosPut(...args);
      return Promise.resolve({ data: {} });
    },
  },
}));

// Tours config — the runner registers these on mount. Tests push to
// `mocks.tours` BEFORE rendering.
vi.mock('../../config/tours', () => ({
  get tours() {
    return mocks.tours;
  },
}));

// Children — marker components, capture props for assertions.
vi.mock('../tour-overlay', () => ({
  TourOverlay: (props: { rect: DOMRect | null; pad?: number; onSkip: () => void }) => {
    mocks.overlayProps.push({ rect: props.rect, pad: props.pad });
    return React.createElement('div', {
      'data-testid': 'tour-overlay-mock',
      onClick: props.onSkip,
    });
  },
}));

vi.mock('../tour-popover', () => ({
  TourPopover: (props: {
    step: { id: string };
    stepIdx: number;
    totalSteps: number;
    anchor: Element | null;
    onAdvance: () => void;
    onPrevious: () => void;
    onSkip: () => void;
    onClose: () => void;
  }) => {
    mocks.popoverProps.push({
      stepId: props.step.id,
      stepIdx: props.stepIdx,
      totalSteps: props.totalSteps,
      anchor: props.anchor,
    });
    return React.createElement(
      'div',
      { 'data-testid': 'tour-popover-mock' },
      React.createElement('button', { 'data-testid': 'mock-advance', onClick: props.onAdvance }, 'next'),
      React.createElement('button', { 'data-testid': 'mock-previous', onClick: props.onPrevious }, 'back'),
      React.createElement('button', { 'data-testid': 'mock-skip', onClick: props.onSkip }, 'skip'),
      React.createElement('button', { 'data-testid': 'mock-close', onClick: props.onClose }, 'close'),
    );
  },
}));

// Imports come AFTER vi.mock setups so the mocks are in place.
import tourReducer, { startTour, setStep, setPhase } from '../../store/tour-slice';
import { TourRunner, __clearTourRunnerRegisteredIds } from '../tour-runner';
import {
  registerTour,
  clearRegistry,
  getTour,
} from '../../utils/tour-registry';
import type { Tour } from '../../tour.types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: { tour: tourReducer },
  });
}

type TestStore = ReturnType<typeof makeStore>;

let container: HTMLDivElement;
let root: Root;

function render(ui: React.ReactElement): void {
  act(() => {
    root.render(ui);
  });
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
}

function mountRunner(store: TestStore): void {
  render(
    <Provider store={store}>
      <TourRunner />
    </Provider>,
  );
}

function makeAnchor(id: string, rect: { left: number; top: number; width: number; height: number } = { left: 10, top: 20, width: 30, height: 40 }): HTMLDivElement {
  const el = document.createElement('div');
  el.id = id;
  el.getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  } as DOMRect);
  document.body.appendChild(el);
  return el;
}

function makeTour(overrides: Partial<Tour> = {}): Tour {
  return {
    id: overrides.id ?? 'test-tour',
    title: overrides.title ?? 'tour.test.title',
    steps: overrides.steps ?? [
      { id: 'step-1', target: '#anchor-1', title: 'tour.t1', body: 'tour.b1' },
      { id: 'step-2', target: '#anchor-2', title: 'tour.t2', body: 'tour.b2' },
    ],
  };
}

async function flushAsync(): Promise<void> {
  // jsdom polyfills requestAnimationFrame on top of setTimeout(~16ms).
  // The resolver schedules at least one rAF before resolving; pumping
  // for ~32 ms covers two tick passes. Tests that need more (the
  // 30-frame "missing" budget) call this in a loop.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

// jsdom doesn't ship ResizeObserver / IntersectionObserver — the
// element-position hook (tour-4) constructs them on placed steps. The
// runner's tests don't care about observer firing, just that the
// constructor is callable.
class StubObserver {
  observe(): void { /* no-op */ }
  unobserve(): void { /* no-op */ }
  disconnect(): void { /* no-op */ }
  takeRecords(): unknown[] { return []; }
}

beforeEach(() => {
  // React 19 act-environment flag (per existing tour-popover tests).
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Stub observers — silently absent in jsdom.
  vi.stubGlobal('ResizeObserver', StubObserver as unknown as typeof ResizeObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver as unknown as typeof IntersectionObserver);
  mocks.navigate.mockReset();
  mocks.location = { pathname: '/', search: '', hash: '', state: null, key: 'k' };
  mocks.axiosPut.mockReset();
  mocks.overlayProps = [];
  mocks.popoverProps = [];
  mocks.tours = [];
  clearRegistry();
  __clearTourRunnerRegisteredIds();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  unmount();
  document.body.innerHTML = '';
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ─── Tests: registration ────────────────────────────────────────────────────

describe('TourRunner — registration', () => {
  it('registers each tour from config/tours.ts on mount', () => {
    const t1 = makeTour({ id: 'a-tour' });
    const t2 = makeTour({ id: 'b-tour' });
    mocks.tours = [t1, t2];
    const store = makeStore();
    mountRunner(store);
    expect(getTour('a-tour')).toBeDefined();
    expect(getTour('b-tour')).toBeDefined();
  });

  it('StrictMode-style double-mount does not throw on duplicate register', () => {
    const t = makeTour({ id: 'dup-tour' });
    mocks.tours = [t];
    const store = makeStore();
    mountRunner(store);
    // Unmount + re-mount the runner. The registry still has `dup-tour`
    // (clearRegistry only fires in beforeEach); the runner must not throw.
    unmount();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    expect(() => mountRunner(store)).not.toThrow();
  });

  it('register failure logs but does not crash', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Bad tour: empty steps. registerTour throws synchronously.
    const bad = { id: 'bad-tour', title: 'x', steps: [] } as unknown as Tour;
    mocks.tours = [bad];
    const store = makeStore();
    expect(() => mountRunner(store)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to register tour'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });
});

// ─── Tests: idle render gate ────────────────────────────────────────────────

describe('TourRunner — idle / render gate', () => {
  it('returns null when no tour is active', () => {
    mocks.tours = [];
    const store = makeStore();
    mountRunner(store);
    expect(document.querySelector('[data-testid="tour-overlay-mock"]')).toBeNull();
    expect(document.querySelector('[data-testid="tour-popover-mock"]')).toBeNull();
  });

  it('does not render overlay until phase==="placed"', async () => {
    const t = makeTour({ id: 'gate-tour' });
    mocks.tours = [t];
    registerTour(t);
    // Anchor only appears after we render — so phase will be 'resolving'.
    const store = makeStore();
    mountRunner(store);
    // Start the tour. Anchor is NOT in DOM yet, so resolver is still
    // hunting → phase stays at navigating/resolving, no overlay yet.
    act(() => {
      store.dispatch(startTour({ tourId: 'gate-tour', totalSteps: 2 }));
    });
    expect(document.querySelector('[data-testid="tour-overlay-mock"]')).toBeNull();
    expect(document.querySelector('[data-testid="tour-popover-mock"]')).toBeNull();
  });
});

// ─── Tests: phase progression ───────────────────────────────────────────────

describe('TourRunner — phase progression', () => {
  it('navigating with no route → resolving (anchor in DOM) → placed', async () => {
    const anchor = makeAnchor('anchor-1');
    const t = makeTour({ id: 'p-tour' });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'p-tour', totalSteps: 2 }));
    });
    // Wait for rAF + effects to settle.
    await flushAsync();
    await flushAsync();
    expect(store.getState().tour.phase).toBe('placed');
    expect(document.querySelector('[data-testid="tour-overlay-mock"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="tour-popover-mock"]')).not.toBeNull();
    // Popover got the right anchor.
    const last = mocks.popoverProps[mocks.popoverProps.length - 1];
    expect(last.anchor).toBe(anchor);
    expect(last.stepId).toBe('step-1');
  });

  it('resolver missing → auto-advances to next step (warns in console)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Neither anchor is in the DOM — both steps will fail and advance.
    // We assert the warn fires with the step id and the auto-advance
    // takes the tour past step 1 (stepIdx flips at least once).
    const t = makeTour({ id: 'm-tour' });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'm-tour', totalSteps: 2 }));
    });
    // Wait long enough for both rAF budgets to exhaust. Budget is ~30
    // frames each → ~500ms at 60Hz; jsdom backs rAF onto ~16ms
    // setTimeout, so the real elapsed is closer to 500ms × 30 = ~16s
    // worst case, but rAF throttling under jsdom is usually faster.
    // We poll for the stepIdx flip + completion.
    for (let i = 0; i < 100; i++) {
      // eslint-disable-next-line no-await-in-loop
      await flushAsync();
      // Either we've advanced (stepIdx > 0) or the tour completed
      // (activeTourId nulled out).
      if (
        store.getState().tour.stepIdx >= 1 ||
        store.getState().tour.activeTourId === null
      ) {
        break;
      }
    }
    // Warn fired for at least step-1.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('target missing'),
    );
    // The advance from step-1 transitions through step-2's auto-advance
    // and may complete the tour. Either way, we are no longer on step-1.
    const finalState = store.getState().tour;
    expect(finalState.stepIdx === 1 || finalState.activeTourId === null).toBe(true);
    warnSpy.mockRestore();
  });
});

// ─── Tests: lifecycle hooks ─────────────────────────────────────────────────

describe('TourRunner — onEnter / onExit lifecycle', () => {
  it('awaits step.onEnter before tracking the step as entered', async () => {
    makeAnchor('anchor-1');
    const calls: string[] = [];
    const t = makeTour({
      id: 'le-tour',
      steps: [
        {
          id: 'step-1',
          target: '#anchor-1',
          title: 'tour.t1',
          body: 'tour.b1',
          onEnter: async () => {
            await new Promise((r) => setTimeout(r, 0));
            calls.push('onEnter:step-1');
          },
        },
      ],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'le-tour', totalSteps: 1 }));
    });
    await flushAsync();
    await flushAsync();
    expect(calls).toEqual(['onEnter:step-1']);
  });

  it('errors thrown by onEnter are caught and warned', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    makeAnchor('anchor-1');
    const t = makeTour({
      id: 'err-tour',
      steps: [
        {
          id: 'step-1',
          target: '#anchor-1',
          title: 'tour.t1',
          body: 'tour.b1',
          onEnter: () => {
            throw new Error('boom');
          },
        },
      ],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'err-tour', totalSteps: 1 }));
    });
    await flushAsync();
    await flushAsync();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('onEnter("step-1") threw'),
      expect.any(Error),
    );
    // Tour did NOT abort — phase still placed.
    expect(store.getState().tour.phase).toBe('placed');
    warnSpy.mockRestore();
  });

  it('awaits step.onExit before next step transitions', async () => {
    makeAnchor('anchor-1');
    makeAnchor('anchor-2');
    const calls: string[] = [];
    const t = makeTour({
      id: 'lex-tour',
      steps: [
        {
          id: 'step-1',
          target: '#anchor-1',
          title: 'tour.t1',
          body: 'tour.b1',
          onExit: async () => {
            await new Promise((r) => setTimeout(r, 0));
            calls.push('onExit:step-1');
          },
        },
        {
          id: 'step-2',
          target: '#anchor-2',
          title: 'tour.t2',
          body: 'tour.b2',
          onEnter: () => {
            calls.push('onEnter:step-2');
          },
        },
      ],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'lex-tour', totalSteps: 2 }));
    });
    await flushAsync();
    await flushAsync();
    // Now advance to step 2.
    act(() => {
      store.dispatch(setStep(1));
      store.dispatch(setPhase('navigating'));
    });
    await flushAsync();
    await flushAsync();
    // Both lifecycle hooks fired in the right order: onExit before onEnter.
    expect(calls).toEqual(['onExit:step-1', 'onEnter:step-2']);
  });

  it('overlay does NOT render until onEnter resolves (paint gates on entering→placed)', async () => {
    makeAnchor('anchor-1');
    let resolveEnter!: () => void;
    const enterPromise = new Promise<void>((r) => {
      resolveEnter = r;
    });
    const t = makeTour({
      id: 'gate-onenter-tour',
      steps: [
        {
          id: 'step-1',
          target: '#anchor-1',
          title: 'tour.t1',
          body: 'tour.b1',
          onEnter: () => enterPromise,
        },
      ],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'gate-onenter-tour', totalSteps: 1 }));
    });
    // Pump enough rAF for the resolver to land — phase should now be
    // 'entering' (NOT 'placed'), and the overlay/popover MUST NOT have
    // rendered yet because onEnter is still pending.
    await flushAsync();
    await flushAsync();
    expect(store.getState().tour.phase).toBe('entering');
    expect(mocks.overlayProps.length).toBe(0);
    expect(mocks.popoverProps.length).toBe(0);
    expect(document.querySelector('[data-testid="tour-overlay-mock"]')).toBeNull();

    // Resolve the onEnter promise — the runner should flip phase to
    // 'placed' and the overlay/popover should mount.
    await act(async () => {
      resolveEnter();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(store.getState().tour.phase).toBe('placed');
    expect(mocks.overlayProps.length).toBeGreaterThan(0);
    expect(document.querySelector('[data-testid="tour-overlay-mock"]')).not.toBeNull();
  });

  it("phase transitions: idle → navigating → resolving → entering → placed", async () => {
    makeAnchor('anchor-1');
    let resolveEnter!: () => void;
    const enterPromise = new Promise<void>((r) => {
      resolveEnter = r;
    });
    const t = makeTour({
      id: 'phase-tour',
      steps: [
        {
          id: 'step-1',
          target: '#anchor-1',
          title: 'tour.t1',
          body: 'tour.b1',
          onEnter: () => enterPromise,
        },
      ],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    // Subscribe BEFORE the tour starts so we capture every phase
    // transition the runner drives. React batches effect dispatches
    // tightly under act, so polling AFTER each act-block can miss
    // intermediate phases — the subscription log is the reliable
    // ordering oracle.
    const seen: string[] = [store.getState().tour.phase];
    const unsub = store.subscribe(() => {
      const p = store.getState().tour.phase;
      if (seen[seen.length - 1] !== p) seen.push(p);
    });
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'phase-tour', totalSteps: 1 }));
    });
    // Pump for resolver — should land in 'entering', NOT 'placed'.
    await flushAsync();
    await flushAsync();
    expect(store.getState().tour.phase).toBe('entering');
    // Resolve onEnter → phase flips to 'placed'.
    await act(async () => {
      resolveEnter();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(store.getState().tour.phase).toBe('placed');
    unsub();
    // The subscription log captures the full ordering. We assert each
    // phase appeared in order; intermediate duplicates are tolerated
    // (React/effect re-renders can resample without changing phase).
    const expected = ['idle', 'navigating', 'resolving', 'entering', 'placed'];
    let cursor = 0;
    for (const p of seen) {
      if (cursor < expected.length && p === expected[cursor]) cursor++;
    }
    expect(cursor).toBe(expected.length);
  });

  it('advancing during onEnter cancels the pending placement', async () => {
    makeAnchor('anchor-1');
    makeAnchor('anchor-2');
    let resolveEnter1!: () => void;
    const enterPromise1 = new Promise<void>((r) => {
      resolveEnter1 = r;
    });
    const calls: string[] = [];
    const t = makeTour({
      id: 'cancel-tour',
      steps: [
        {
          id: 'step-1',
          target: '#anchor-1',
          title: 'tour.t1',
          body: 'tour.b1',
          onEnter: () => {
            calls.push('onEnter:step-1');
            return enterPromise1;
          },
        },
        {
          id: 'step-2',
          target: '#anchor-2',
          title: 'tour.t2',
          body: 'tour.b2',
          onEnter: () => {
            calls.push('onEnter:step-2');
          },
        },
      ],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'cancel-tour', totalSteps: 2 }));
    });
    await flushAsync();
    await flushAsync();
    // step-1 is in 'entering' with onEnter pending.
    expect(store.getState().tour.phase).toBe('entering');
    expect(calls).toEqual(['onEnter:step-1']);
    // No overlay yet — the gate is closed.
    expect(mocks.overlayProps.length).toBe(0);
    // User advances mid-await. The slice flips to step-2 / 'navigating'.
    act(() => {
      store.dispatch(setStep(1));
      store.dispatch(setPhase('navigating'));
    });
    // Now resolve the stale onEnter — the runner must NOT flip the
    // phase back to 'placed' for step-1 (the active step is step-2).
    await act(async () => {
      resolveEnter1();
      await new Promise((r) => setTimeout(r, 20));
    });
    // After settling, we should be on step-2 (resolved + entered).
    await flushAsync();
    await flushAsync();
    const finalState = store.getState().tour;
    expect(finalState.stepIdx).toBe(1);
    // Step-2 should have entered cleanly.
    expect(calls).toContain('onEnter:step-2');
    expect(finalState.phase).toBe('placed');
    // The popover is showing step-2 (NOT step-1).
    const lastPopover = mocks.popoverProps[mocks.popoverProps.length - 1];
    expect(lastPopover.stepId).toBe('step-2');
  });

  it('onExit errors are caught and warned', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    makeAnchor('anchor-1');
    makeAnchor('anchor-2');
    const t = makeTour({
      id: 'exitErr-tour',
      steps: [
        {
          id: 'step-1',
          target: '#anchor-1',
          title: 'tour.t1',
          body: 'tour.b1',
          onExit: () => {
            throw new Error('exit-boom');
          },
        },
        {
          id: 'step-2',
          target: '#anchor-2',
          title: 'tour.t2',
          body: 'tour.b2',
        },
      ],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'exitErr-tour', totalSteps: 2 }));
    });
    await flushAsync();
    await flushAsync();
    act(() => {
      store.dispatch(setStep(1));
      store.dispatch(setPhase('navigating'));
    });
    await flushAsync();
    await flushAsync();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('onExit("step-1") threw'),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});

// ─── Tests: focus restoration ───────────────────────────────────────────────

describe('TourRunner — focus restoration', () => {
  it('restores focus to the previously-focused element on tour end', async () => {
    makeAnchor('anchor-1');
    const trigger = document.createElement('button');
    trigger.id = 'pre-focus';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const t = makeTour({ id: 'focus-tour', steps: [
      { id: 'step-1', target: '#anchor-1', title: 'tour.t1', body: 'tour.b1' },
    ] });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'focus-tour', totalSteps: 1 }));
    });
    await flushAsync();
    // Stop the tour — focus should be restored to `trigger`.
    act(() => {
      // Reach into the popover skip mock button.
      const close = document.querySelector('[data-testid="mock-close"]') as HTMLButtonElement | null;
      close?.click();
    });
    await flushAsync();
    expect(document.activeElement).toBe(trigger);
  });

  it('null active-element on start is safe (no throw)', async () => {
    makeAnchor('anchor-1');
    // Ensure nothing is focused (jsdom default).
    if (document.activeElement instanceof HTMLElement) {
      (document.activeElement as HTMLElement).blur();
    }
    const t = makeTour({ id: 'null-focus-tour', steps: [
      { id: 'step-1', target: '#anchor-1', title: 'tour.t1', body: 'tour.b1' },
    ] });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    expect(() =>
      act(() => {
        store.dispatch(startTour({ tourId: 'null-focus-tour', totalSteps: 1 }));
      }),
    ).not.toThrow();
  });
});

// ─── Tests: keyboard ────────────────────────────────────────────────────────

describe('TourRunner — keyboard', () => {
  it('Escape stops the tour (focus restored, popover hidden)', async () => {
    makeAnchor('anchor-1');
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const t = makeTour({ id: 'esc-tour', steps: [
      { id: 'step-1', target: '#anchor-1', title: 'tour.t1', body: 'tour.b1' },
    ] });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'esc-tour', totalSteps: 1 }));
    });
    await flushAsync();
    await flushAsync();
    expect(store.getState().tour.phase).toBe('placed');

    // Dispatch Escape on window.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await flushAsync();
    expect(store.getState().tour.activeTourId).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

// ─── Tests: registry coexistence ────────────────────────────────────────────

describe('TourRunner — multi-tour registry', () => {
  it('multiple tours coexist in registry; only one is active at a time', async () => {
    makeAnchor('anchor-1');
    const t1 = makeTour({ id: 'a-tour' });
    const t2 = makeTour({ id: 'b-tour' });
    mocks.tours = [t1, t2];
    const store = makeStore();
    mountRunner(store);
    expect(getTour('a-tour')).toBeDefined();
    expect(getTour('b-tour')).toBeDefined();
    act(() => {
      store.dispatch(startTour({ tourId: 'a-tour', totalSteps: 2 }));
    });
    await flushAsync();
    await flushAsync();
    expect(store.getState().tour.activeTourId).toBe('a-tour');
    expect(store.getState().tour.phase).toBe('placed');
  });
});

// ─── Tests: live rect updates ───────────────────────────────────────────────

describe('TourRunner — overlay rect prop', () => {
  it('overlay receives a non-null rect once the step is placed', async () => {
    makeAnchor('anchor-1', { left: 50, top: 60, width: 70, height: 80 });
    const t = makeTour({ id: 'rect-tour', steps: [
      { id: 'step-1', target: '#anchor-1', title: 'tour.t1', body: 'tour.b1' },
    ] });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'rect-tour', totalSteps: 1 }));
    });
    await flushAsync();
    await flushAsync();
    const last = mocks.overlayProps[mocks.overlayProps.length - 1];
    expect(last.rect).not.toBeNull();
    expect(last.rect!.left).toBe(50);
    expect(last.rect!.top).toBe(60);
  });

  it('step.pad is forwarded to TourOverlay', async () => {
    makeAnchor('anchor-1');
    const t = makeTour({
      id: 'pad-tour',
      steps: [{ id: 'step-1', target: '#anchor-1', title: 'tour.t1', body: 'tour.b1', pad: 24 }],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'pad-tour', totalSteps: 1 }));
    });
    await flushAsync();
    await flushAsync();
    const last = mocks.overlayProps[mocks.overlayProps.length - 1];
    expect(last.pad).toBe(24);
  });

  it('overlay rect reflects live anchor position when scroll fires', async () => {
    const anchor = makeAnchor('anchor-1', { left: 50, top: 60, width: 70, height: 80 });
    const t = makeTour({
      id: 'live-rect-tour',
      steps: [{ id: 'step-1', target: '#anchor-1', title: 'tour.t1', body: 'tour.b1' }],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'live-rect-tour', totalSteps: 1 }));
    });
    await flushAsync();
    await flushAsync();
    const beforeRect = mocks.overlayProps[mocks.overlayProps.length - 1].rect!;
    expect(beforeRect.left).toBe(50);

    anchor.getBoundingClientRect = () =>
      ({
        x: 200,
        y: 300,
        left: 200,
        top: 300,
        width: 70,
        height: 80,
        right: 270,
        bottom: 380,
        toJSON: () => ({}),
      }) as DOMRect;

    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, 20));
    });
    const afterRect = mocks.overlayProps[mocks.overlayProps.length - 1].rect!;
    expect(afterRect.left).toBe(200);
    expect(afterRect.top).toBe(300);
  });
});

// ─── Tests: completion + skip + close ──────────────────────────────────────

describe('TourRunner — terminal-step advance + skip', () => {
  it('advance on the last step marks the tour completed', async () => {
    makeAnchor('anchor-1');
    const t = makeTour({
      id: 'last-tour',
      steps: [{ id: 'step-1', target: '#anchor-1', title: 'tour.t1', body: 'tour.b1' }],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'last-tour', totalSteps: 1 }));
    });
    await flushAsync();
    await flushAsync();
    // Click "next" on the popover mock.
    act(() => {
      const adv = document.querySelector('[data-testid="mock-advance"]') as HTMLButtonElement | null;
      adv?.click();
    });
    await flushAsync();
    expect(store.getState().tour.completedTours).toContain('last-tour');
    expect(store.getState().tour.activeTourId).toBeNull();
    // persist thunk PUTs to /onboarding/completed-tours/:id.
    expect(mocks.axiosPut).toHaveBeenCalledWith(
      '/onboarding/completed-tours/last-tour',
    );
  });

  it('skip from popover marks tour completed and closes', async () => {
    makeAnchor('anchor-1');
    makeAnchor('anchor-2');
    const t = makeTour({ id: 'skip-tour' });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'skip-tour', totalSteps: 2 }));
    });
    await flushAsync();
    await flushAsync();
    act(() => {
      const skipBtn = document.querySelector('[data-testid="mock-skip"]') as HTMLButtonElement | null;
      skipBtn?.click();
    });
    await flushAsync();
    expect(store.getState().tour.completedTours).toContain('skip-tour');
    expect(store.getState().tour.activeTourId).toBeNull();
  });

  it('close (X) stops the tour without marking completed', async () => {
    makeAnchor('anchor-1');
    const t = makeTour({
      id: 'close-tour',
      steps: [{ id: 'step-1', target: '#anchor-1', title: 'tour.t1', body: 'tour.b1' }],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'close-tour', totalSteps: 1 }));
    });
    await flushAsync();
    await flushAsync();
    act(() => {
      const closeBtn = document.querySelector('[data-testid="mock-close"]') as HTMLButtonElement | null;
      closeBtn?.click();
    });
    await flushAsync();
    expect(store.getState().tour.activeTourId).toBeNull();
    expect(store.getState().tour.completedTours).not.toContain('close-tour');
  });

  it('overlay-shield click (onSkip on overlay) stops without completion', async () => {
    makeAnchor('anchor-1');
    const t = makeTour({
      id: 'shield-tour',
      steps: [{ id: 'step-1', target: '#anchor-1', title: 'tour.t1', body: 'tour.b1' }],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'shield-tour', totalSteps: 1 }));
    });
    await flushAsync();
    await flushAsync();
    act(() => {
      const overlay = document.querySelector('[data-testid="tour-overlay-mock"]') as HTMLDivElement | null;
      overlay?.click();
    });
    await flushAsync();
    // Overlay's onSkip is wired to `stop` (not `skip`) — does NOT mark completion.
    expect(store.getState().tour.activeTourId).toBeNull();
    expect(store.getState().tour.completedTours).not.toContain('shield-tour');
  });
});

// ─── Tests: previous (back) ─────────────────────────────────────────────────

describe('TourRunner — previous', () => {
  it('previous from step 2 returns to step 1', async () => {
    makeAnchor('anchor-1');
    makeAnchor('anchor-2');
    const t = makeTour({ id: 'back-tour' });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'back-tour', totalSteps: 2 }));
    });
    await flushAsync();
    await flushAsync();
    // Advance to step 2.
    act(() => {
      store.dispatch(setStep(1));
      store.dispatch(setPhase('navigating'));
    });
    await flushAsync();
    await flushAsync();
    expect(store.getState().tour.stepIdx).toBe(1);
    // Click "back" button.
    act(() => {
      const back = document.querySelector('[data-testid="mock-previous"]') as HTMLButtonElement | null;
      back?.click();
    });
    await flushAsync();
    expect(store.getState().tour.stepIdx).toBe(0);
  });
});

// ─── Tests: route navigation ────────────────────────────────────────────────

describe('TourRunner — route navigation', () => {
  it('step with route triggers navigate when pathname mismatches', async () => {
    makeAnchor('anchor-1');
    mocks.location = { pathname: '/other', search: '', hash: '', state: null, key: 'k' };
    const t = makeTour({
      id: 'route-tour',
      steps: [
        {
          id: 'step-1',
          target: '#anchor-1',
          title: 'tour.t1',
          body: 'tour.b1',
          route: '/canvas',
        },
      ],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'route-tour', totalSteps: 1 }));
    });
    await flushAsync();
    expect(mocks.navigate).toHaveBeenCalledWith('/canvas');
  });

  it('step with route already matching pathname does NOT navigate', async () => {
    makeAnchor('anchor-1');
    mocks.location = { pathname: '/canvas/proj1', search: '', hash: '', state: null, key: 'k' };
    const t = makeTour({
      id: 'noroute-tour',
      steps: [
        {
          id: 'step-1',
          target: '#anchor-1',
          title: 'tour.t1',
          body: 'tour.b1',
          route: '/canvas',
        },
      ],
    });
    mocks.tours = [t];
    registerTour(t);
    const store = makeStore();
    mountRunner(store);
    act(() => {
      store.dispatch(startTour({ tourId: 'noroute-tour', totalSteps: 1 }));
    });
    await flushAsync();
    await flushAsync();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(store.getState().tour.phase).toBe('placed');
  });
});
