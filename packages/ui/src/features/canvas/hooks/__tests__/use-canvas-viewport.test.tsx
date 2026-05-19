/**
 * rf-canv-19 — useCanvasViewport hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Provider +
 * capture-ref + sync-useEffect pattern from rf-props-7/8/19 and rf-canv-18:
 * render once with `<Provider store><Probe /></Provider>`, capture the
 * hook's return value into a ref, then assert against the captured value
 * + a `vi.spyOn(store, 'dispatch')`.
 *
 * `useEffect` is mocked to fire synchronously on render so the
 * `autoOrganizeOnZoom` debounce branch dispatches inside the FC body
 * rather than waiting for a renderer commit phase that never runs here.
 *
 * `useRef` is mocked with a hoisted ref-container so the test can
 * pre-prime `prevAutoZoomRef.current` to a value different from the
 * current `viewport.zoom`, which is the only way to fire the
 * `scaleLayoutForZoom` dispatch on a single render — `useRef(initial)`
 * normally initializes equal to `initial` on the first render, so the
 * delta would be 0.
 *
 * `ZOOM_STEP = 0.05` so the half-step debounce threshold is `0.025`.
 * `LOD_THRESHOLD_L3 = 0.7`, `LOD_THRESHOLD_L2 = 0.35`.
 */

import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
// `prevAutoZoomRefValue` lets each test pre-prime the ref's `.current` before
// the hook's first render. The mocked `useRef` returns a stable object that
// closes over this value on its first call, so subsequent reads inside the
// effect see the test-supplied value.
const mocks = vi.hoisted(() => ({
  prevAutoZoomRefValue: { current: undefined as number | undefined },
  // We need a single "blessed" ref object identity per render so the
  // hook's mutations to `.current` survive across the synchronous-effect
  // run. The `setRefForNextRender` helper lets each test point this at a
  // fresh `{ current: <value> }` BEFORE rendering.
  refForNextRender: { current: undefined as number | undefined },
}));

// Mock React's useEffect to run synchronously, and useRef to return the
// hoisted refForNextRender so tests can pre-prime its value.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn((cb: () => void | (() => void), _deps?: unknown[]) => {
      cb();
    }),
    useRef: vi.fn(<T,>(initial: T) => {
      // Only the first useRef call in the hook (prevAutoZoomRef) flows
      // through this mock — the hook makes exactly one `useRef` call. The
      // mock seeds the ref with the test-supplied value if present;
      // otherwise it falls through to the real `initial`.
      if (mocks.refForNextRender.current === undefined) {
        return { current: initial };
      }
      const ref = { current: mocks.refForNextRender.current as unknown as T };
      // Reset so subsequent renders use the real initial.
      mocks.refForNextRender.current = undefined;
      return ref;
    }),
  };
});

// Import after the react mock is registered so the hook closes over the
// mocked useEffect / useRef.
import cardsReducer, { type CardNode, type CardEdge } from '../../../../store/slices/cards-slice';
import uiReducer from '../../../../store/slices/ui-slice';
import { useCanvasViewport } from '../use-canvas-viewport';
import type { UseCanvasViewportResult } from '../use-canvas-viewport';

// ─── Store builder ──────────────────────────────────────────────────────────

interface MakeStoreOpts {
  cards?: Array<{
    id: string;
    name?: string;
    nodes?: CardNode[];
    edges?: CardEdge[];
    viewport?: { panX: number; panY: number; scale: number };
    createdAt?: number;
  }>;
  activeCardId?: string;
  panes?: Array<{
    id: string;
    cardId: string;
    openCardIds: string[];
    viewport: { panX: number; panY: number; scale: number };
  }>;
  splitViewEnabled?: boolean;
  activePaneId?: string;
  autoOrganizeOnZoom?: boolean;
}

const makeStore = (opts: MakeStoreOpts = {}) => {
  // Build the cards/ui partial-state via the reducers' default states first,
  // then merge our overrides into the preloadedState. This avoids Immer's
  // frozen-state guard that fires when test code mutates `getState()`
  // directly.

  const initialUI = uiReducer(undefined as any, { type: '@@INIT' });

  const initialCards = cardsReducer(undefined as any, { type: '@@INIT' });

  const seededCards = opts.cards
    ? opts.cards.map((c) => ({
        id: c.id,
        name: c.name ?? c.id,
        nodes: c.nodes ?? [],
        edges: c.edges ?? [],
        viewport: c.viewport ?? { panX: 0, panY: 0, scale: 1 },
        createdAt: c.createdAt ?? 0,
      }))
    : [];

  const preloadedCards = {
    ...initialCards,
    cards: seededCards.length > 0 ? seededCards : initialCards.cards,
    activeCardId: opts.activeCardId ?? (seededCards.length > 0 ? seededCards[0].id : initialCards.activeCardId),
  };

  const preloadedUI = {
    ...initialUI,
    splitView:
      opts.panes !== undefined || opts.splitViewEnabled !== undefined
        ? {
            ...initialUI.splitView,
            panes: opts.panes ?? [],
            enabled: opts.splitViewEnabled ?? false,
            activePaneId: opts.activePaneId ?? initialUI.splitView.activePaneId,
          }
        : initialUI.splitView,
    autoOrganizeOnZoom: opts.autoOrganizeOnZoom ?? initialUI.autoOrganizeOnZoom,
  };

  return configureStore({
    reducer: {
      cards: cardsReducer,
      ui: uiReducer,
    },
    preloadedState: {
      cards: preloadedCards,
      ui: preloadedUI,
    },
    // The default RTK middleware's `serializableCheck` complains about Date /
    // Map values that some slices may carry; disable for the test harness
    // (we don't care about serializability here).
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
};

type TestStore = ReturnType<typeof makeStore>;

// ─── Probe ──────────────────────────────────────────────────────────────────

const captureHook = (args: { cardId?: string; paneId?: string }, store: TestStore): UseCanvasViewportResult => {
  const captured: { current?: UseCanvasViewportResult } = {};
  const Probe: React.FC = () => {
    captured.current = useCanvasViewport(args);
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
  mocks.prevAutoZoomRefValue.current = undefined;
  mocks.refForNextRender.current = undefined;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasViewport — viewport selection', () => {
  it('defaults to card viewport when no paneId is supplied', () => {
    const store = makeStore({
      cards: [{ id: 'card-1', viewport: { panX: 100, panY: 200, scale: 0.5 } }],
      activeCardId: 'card-1',
    });
    const result = captureHook({ cardId: 'card-1' }, store);
    expect(result.viewport).toEqual({ x: 100, y: 200, zoom: 0.5 });
    expect(result.sourceViewport).toEqual({ panX: 100, panY: 200, scale: 0.5 });
  });

  it('uses pane viewport when paneId matches an existing pane (pane wins over card)', () => {
    const store = makeStore({
      cards: [{ id: 'card-1', viewport: { panX: 100, panY: 200, scale: 0.5 } }],
      activeCardId: 'card-1',
      panes: [
        {
          id: 'pane-A',
          cardId: 'card-1',
          openCardIds: ['card-1'],
          viewport: { panX: 999, panY: 888, scale: 1.5 },
        },
      ],
      splitViewEnabled: true,
    });
    const result = captureHook({ cardId: 'card-1', paneId: 'pane-A' }, store);
    expect(result.viewport).toEqual({ x: 999, y: 888, zoom: 1.5 });
    expect(result.sourceViewport).toEqual({ panX: 999, panY: 888, scale: 1.5 });
  });

  it('falls back to default { panX: 0, panY: 0, scale: 1 } when card has no viewport', () => {
    const store = makeStore({
      // No cards seeded — `card` resolves to undefined → fallback default.
    });
    const result = captureHook({ cardId: 'missing-card' }, store);
    expect(result.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(result.sourceViewport).toEqual({ panX: 0, panY: 0, scale: 1 });
  });

  it('converts the source viewport format from { panX, panY, scale } to { x, y, zoom }', () => {
    const store = makeStore({
      cards: [{ id: 'c1', viewport: { panX: -42, panY: 17, scale: 0.8 } }],
      activeCardId: 'c1',
    });
    const result = captureHook({ cardId: 'c1' }, store);
    expect(result.viewport.x).toBe(-42);
    expect(result.viewport.y).toBe(17);
    expect(result.viewport.zoom).toBe(0.8);
  });
});

describe('useCanvasViewport — LOD threshold', () => {
  it('returns lod=3 when zoom > LOD_THRESHOLD_L3 (> 0.7)', () => {
    const store = makeStore({
      cards: [{ id: 'c1', viewport: { panX: 0, panY: 0, scale: 0.71 } }],
      activeCardId: 'c1',
    });
    const result = captureHook({ cardId: 'c1' }, store);
    expect(result.lod).toBe(3);
  });

  it('returns lod=2 when zoom is between LOD_THRESHOLD_L2 and L3 (0.35 < zoom <= 0.7)', () => {
    const store = makeStore({
      cards: [{ id: 'c1', viewport: { panX: 0, panY: 0, scale: 0.5 } }],
      activeCardId: 'c1',
    });
    const result = captureHook({ cardId: 'c1' }, store);
    expect(result.lod).toBe(2);
  });

  it('returns lod=1 when zoom <= LOD_THRESHOLD_L2 (<= 0.35)', () => {
    const store = makeStore({
      cards: [{ id: 'c1', viewport: { panX: 0, panY: 0, scale: 0.2 } }],
      activeCardId: 'c1',
    });
    const result = captureHook({ cardId: 'c1' }, store);
    expect(result.lod).toBe(1);
  });
});

describe('useCanvasViewport — persistViewport callback', () => {
  it('dispatches setPaneViewport when paneId is provided', () => {
    const store = makeStore({
      cards: [{ id: 'c1', viewport: { panX: 0, panY: 0, scale: 1 } }],
      activeCardId: 'c1',
      panes: [
        {
          id: 'pane-X',
          cardId: 'c1',
          openCardIds: ['c1'],
          viewport: { panX: 0, panY: 0, scale: 1 },
        },
      ],
      splitViewEnabled: true,
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { persistViewport } = captureHook({ cardId: 'c1', paneId: 'pane-X' }, store);
    dispatchSpy.mockClear();
    persistViewport({ x: 11, y: 22, zoom: 0.9 });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as {
      type: string;
      payload: { paneId: string; viewport: { panX: number; panY: number; scale: number } };
    };
    expect(action.type).toBe('ui/setPaneViewport');
    expect(action.payload).toEqual({
      paneId: 'pane-X',
      viewport: { panX: 11, panY: 22, scale: 0.9 },
    });
  });

  it('dispatches setCardViewportById when only cardId is provided (no paneId)', () => {
    const store = makeStore({
      cards: [{ id: 'c1', viewport: { panX: 0, panY: 0, scale: 1 } }],
      activeCardId: 'c1',
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { persistViewport } = captureHook({ cardId: 'c1' }, store);
    dispatchSpy.mockClear();
    persistViewport({ x: 5, y: -3, zoom: 1.25 });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as {
      type: string;
      payload: { cardId: string; viewport: { panX: number; panY: number; scale: number } };
    };
    expect(action.type).toBe('cards/setCardViewportById');
    expect(action.payload).toEqual({
      cardId: 'c1',
      viewport: { panX: 5, panY: -3, scale: 1.25 },
    });
  });

  it('dispatches the legacy setCardViewport (no id) when neither paneId nor cardId is provided', () => {
    const store = makeStore({
      cards: [{ id: 'c1', viewport: { panX: 0, panY: 0, scale: 1 } }],
      activeCardId: 'c1',
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { persistViewport } = captureHook({}, store);
    dispatchSpy.mockClear();
    persistViewport({ x: 7, y: 8, zoom: 0.4 });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as {
      type: string;
      payload: { panX: number; panY: number; scale: number };
    };
    expect(action.type).toBe('cards/setCardViewport');
    expect(action.payload).toEqual({ panX: 7, panY: 8, scale: 0.4 });
  });
});

describe('useCanvasViewport — autoOrganizeOnZoom debounce', () => {
  it('dispatches scaleLayoutForZoom when autoOrganizeOnZoom is on and the zoom delta exceeds ZOOM_STEP * 0.5', () => {
    // Pre-prime the ref so prevZoom = 1.0 while viewport.zoom = 1.5.
    // |1.5 - 1.0| = 0.5 > 0.025 (ZOOM_STEP * 0.5) so the dispatch fires.
    mocks.refForNextRender.current = 1.0;
    const store = makeStore({
      cards: [{ id: 'c1', viewport: { panX: 0, panY: 0, scale: 1.5 } }],
      activeCardId: 'c1',
      autoOrganizeOnZoom: true,
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ cardId: 'c1' }, store);
    const calls = dispatchSpy.mock.calls.map((c) => c[0] as { type: string; payload?: unknown });
    const scaleAction = calls.find((a) => a.type === 'cards/scaleLayoutForZoom');
    expect(scaleAction).toBeDefined();
    expect(scaleAction!.payload).toEqual({ zoom: 1.5, prevZoom: 1.0 });
  });

  it('does NOT dispatch scaleLayoutForZoom when autoOrganizeOnZoom is on but the delta is below ZOOM_STEP * 0.5', () => {
    // ZOOM_STEP = 0.05, threshold = 0.025. delta of 0.01 < 0.025 → skip.
    mocks.refForNextRender.current = 1.0;
    const store = makeStore({
      cards: [{ id: 'c1', viewport: { panX: 0, panY: 0, scale: 1.01 } }],
      activeCardId: 'c1',
      autoOrganizeOnZoom: true,
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ cardId: 'c1' }, store);
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('cards/scaleLayoutForZoom');
  });

  it('does NOT dispatch scaleLayoutForZoom when autoOrganizeOnZoom is off, regardless of delta', () => {
    // Even with a large delta, the off branch returns early after writing the
    // current zoom into the ref — no dispatch.
    mocks.refForNextRender.current = 1.0;
    const store = makeStore({
      cards: [{ id: 'c1', viewport: { panX: 0, panY: 0, scale: 1.5 } }],
      activeCardId: 'c1',
      autoOrganizeOnZoom: false,
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ cardId: 'c1' }, store);
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('cards/scaleLayoutForZoom');
  });
});
