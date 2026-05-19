/**
 * Tests for the three top-level selectors exported by cards-slice.ts
 * (selectActiveCard, selectCanUndo, selectCanRedo). The slice's
 * reducers are exhaustively covered in cards-slice-group.test.ts and
 * the cards/{import,reducers}/__tests__ suites; this file fills in
 * the selector branches.
 */

import { describe, it, expect } from 'vitest';
import {
  selectActiveCard,
  selectCanUndo,
  selectCanRedo,
  type CardsState,
  type Card,
} from '../cards-slice';

function emptyState(activeId: string | null = null, cards: Card[] = []): CardsState {
  return {
    cards,
    activeCardId: activeId,
    history: {},
  };
}

const card = (id: string): Card =>
  ({
    id,
    name: id,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }) as unknown as Card;

describe('selectActiveCard', () => {
  it('returns the card whose id matches activeCardId', () => {
    const state = { cards: emptyState('a', [card('a'), card('b')]) };
    expect(selectActiveCard(state)).toEqual(card('a'));
  });

  it('returns undefined when activeCardId is null', () => {
    const state = { cards: emptyState(null, [card('a')]) };
    expect(selectActiveCard(state)).toBeUndefined();
  });

  it('returns undefined when activeCardId points to a missing card', () => {
    const state = { cards: emptyState('ghost', [card('a')]) };
    expect(selectActiveCard(state)).toBeUndefined();
  });
});

describe('selectCanUndo', () => {
  it('returns false when no card is active', () => {
    const state = { cards: emptyState(null) };
    expect(selectCanUndo(state)).toBe(false);
  });

  it('returns false when the active card has no history entry', () => {
    const state = { cards: emptyState('a', [card('a')]) };
    expect(selectCanUndo(state)).toBe(false);
  });

  it('returns false when the past stack is empty', () => {
    const state: { cards: CardsState } = {
      cards: {
        cards: [card('a')],
        activeCardId: 'a',
        history: { a: { past: [], future: [] } },
      },
    };
    expect(selectCanUndo(state)).toBe(false);
  });

  it('returns true when the past stack has entries', () => {
    const state: { cards: CardsState } = {
      cards: {
        cards: [card('a')],
        activeCardId: 'a',
        history: { a: { past: [{} as any], future: [] } },
      },
    };
    expect(selectCanUndo(state)).toBe(true);
  });
});

describe('selectCanRedo', () => {
  it('returns false when no card is active', () => {
    expect(selectCanRedo({ cards: emptyState(null) })).toBe(false);
  });

  it('returns false when the active card has no history entry', () => {
    expect(selectCanRedo({ cards: emptyState('a', [card('a')]) })).toBe(false);
  });

  it('returns false when the future stack is empty', () => {
    const state: { cards: CardsState } = {
      cards: {
        cards: [card('a')],
        activeCardId: 'a',
        history: { a: { past: [], future: [] } },
      },
    };
    expect(selectCanRedo(state)).toBe(false);
  });

  it('returns true when the future stack has entries', () => {
    const state: { cards: CardsState } = {
      cards: {
        cards: [card('a')],
        activeCardId: 'a',
        history: { a: { past: [], future: [{} as any] } },
      },
    };
    expect(selectCanRedo(state)).toBe(true);
  });
});
