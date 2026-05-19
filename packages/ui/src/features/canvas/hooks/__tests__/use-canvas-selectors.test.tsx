/**
 * rf-canv2-7 — useCanvasSelectors hook tests.
 *
 * Pure read-side hook — bundles 11 useSelector calls + the
 * cardId-vs-active-card derivation. Tests use the Provider+Probe pattern
 * with a real Redux store so each selector's slice access is exercised
 * end-to-end without per-selector mocking.
 */

import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect } from 'vitest';
import aiReducer from '../../../../store/slices/ai-slice';
import cardsReducer from '../../../../store/slices/cards-slice';
import pipelineReducer from '../../../../store/slices/pipeline-slice';
import selectionReducer from '../../../../store/slices/selection-slice';
import uiReducer from '../../../../store/slices/ui-slice';
import validationReducer from '../../../../store/slices/validation-slice';
import viewReducer from '../../../../store/slices/view-slice';
import { useCanvasSelectors, type UseCanvasSelectorsResult } from '../use-canvas-selectors';
import type { Card } from '../../../../store/slices/cards-slice';

// ─── Store builder ──────────────────────────────────────────────────────────

const makeStore = (cards: Card[] = [], extra: Record<string, unknown> = {}) => {
  const initialCards = cardsReducer(undefined as any, { type: '@@INIT' });

  const initialSelection = selectionReducer(undefined as any, { type: '@@INIT' });

  const initialView = viewReducer(undefined as any, { type: '@@INIT' });

  const initialAi = aiReducer(undefined as any, { type: '@@INIT' });

  const initialPipeline = pipelineReducer(undefined as any, { type: '@@INIT' });

  const initialUi = uiReducer(undefined as any, { type: '@@INIT' });

  const initialValidation = validationReducer(undefined as any, { type: '@@INIT' });
  return configureStore({
    reducer: {
      cards: cardsReducer,
      selection: selectionReducer,
      view: viewReducer,
      ai: aiReducer,
      pipeline: pipelineReducer,
      ui: uiReducer,
      validation: validationReducer,
    },
    preloadedState: {
      cards: { ...initialCards, cards, activeCardId: cards[0]?.id ?? null },
      selection: initialSelection,
      view: initialView,
      ai: initialAi,
      pipeline: initialPipeline,
      ui: initialUi,
      validation: initialValidation,
      ...extra,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
};

type TestStore = ReturnType<typeof makeStore>;

// ─── Probe ──────────────────────────────────────────────────────────────────

const captureHook = (store: TestStore, cardId?: string): UseCanvasSelectorsResult => {
  const captured: { current?: UseCanvasSelectorsResult } = {};
  const Probe: React.FC = () => {
    captured.current = useCanvasSelectors({ cardId });
    return React.createElement('div', null, 'probe');
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

// ─── Fixtures ───────────────────────────────────────────────────────────────

const makeCard = (overrides: Partial<Card> = {}): Card => ({
  id: 'card-1',
  name: 'Card',
  nodes: [],
  edges: [],
  viewport: { panX: 0, panY: 0, scale: 1 },
  createdAt: Date.now(),
  ...overrides,
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasSelectors — card resolution', () => {
  it('returns the active card when cardId is undefined', () => {
    const cardA = makeCard({ id: 'a', name: 'A' });
    const cardB = makeCard({ id: 'b', name: 'B' });
    const store = makeStore([cardA, cardB]);
    const result = captureHook(store);
    expect(result.activeCard?.id).toBe('a');
    expect(result.card?.id).toBe('a');
  });

  it('returns the explicit card when cardId matches a known card', () => {
    const cardA = makeCard({ id: 'a' });
    const cardB = makeCard({ id: 'b' });
    const store = makeStore([cardA, cardB]);
    const result = captureHook(store, 'b');
    expect(result.card?.id).toBe('b');
    // activeCard remains the active selector's result (independent of cardId).
    expect(result.activeCard?.id).toBe('a');
  });

  it('returns undefined for card when cardId does not match any card', () => {
    const cardA = makeCard({ id: 'a' });
    const store = makeStore([cardA]);
    const result = captureHook(store, 'missing');
    expect(result.card).toBeUndefined();
  });
});

describe('useCanvasSelectors — selection slice', () => {
  it('exposes selectedNodes and selectedEdges from state.selection', () => {
    const result = captureHook(makeStore());
    expect(Array.isArray(result.selectedNodes)).toBe(true);
    expect(Array.isArray(result.selectedEdges)).toBe(true);
  });
});

describe('useCanvasSelectors — view / ai / pipeline / ui / validation slices', () => {
  it('exposes viewLevel from state.view', () => {
    const result = captureHook(makeStore());
    expect([1, 2]).toContain(result.viewLevel);
  });

  it('exposes animating flags from state.ai', () => {
    const result = captureHook(makeStore());
    expect(typeof result.animatingNodes).toBe('object');
    expect(typeof result.animatingEdges).toBe('object');
  });

  it('exposes aiCurrentIntent from state.ai', () => {
    const result = captureHook(makeStore());
    expect('aiCurrentIntent' in result).toBe(true);
  });

  it('exposes pipelineNodeStatus from state.pipeline', () => {
    const result = captureHook(makeStore());
    expect(typeof result.pipelineNodeStatus).toBe('object');
  });

  it('exposes edgeStyle / snapToGrid / canvasLocked from state.ui', () => {
    const result = captureHook(makeStore());
    expect(typeof result.edgeStyle).toBe('string');
    expect(typeof result.snapToGrid).toBe('boolean');
    expect(typeof result.canvasLocked).toBe('boolean');
  });

  it('exposes validationIssues from state.validation', () => {
    const result = captureHook(makeStore());
    expect(Array.isArray(result.validationIssues)).toBe(true);
  });
});

describe('useCanvasSelectors — return surface', () => {
  it('exposes 13 fields on the result shape', () => {
    const result = captureHook(makeStore());
    expect(Object.keys(result).length).toBeGreaterThanOrEqual(13);
    expect('card' in result).toBe(true);
    expect('activeCard' in result).toBe(true);
  });
});
