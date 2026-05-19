/**
 * Tests for `cards/reducers/card-lifecycle.ts` — the six reducers that
 * operate on the `Card` object directly.
 *
 * Reducers are pure case-reducers spread into the orchestrator's
 * `createSlice`, so each test exercises them through Immer's `produce`
 * to mirror RTK's runtime behavior (the reducer body is allowed to mutate
 * a draft; the produced result is structurally equal to the post-mutation
 * draft). This is the cleanest way to exercise a `(state, action) => void`
 * shape without dragging in `configureStore`.
 *
 * Covers:
 * - `setActiveCard` — match / no-op when id missing.
 * - `createCard` — id default, name default, projectId/environmentId
 *   passthrough, unique-name loop with 1, 2, and 3 collisions.
 * - `deleteCard` — happy path, missing id no-op, active-card fallback to
 *   prior neighbor (cardIndex - 1), fallback to '' when last card removed.
 * - `renameCard` — happy path, missing id no-op.
 * - `setCardViewport` — active card update, no-op when activeCardId is null.
 * - `setCardViewportById` — happy path, missing id no-op.
 *
 * @see rf-cards-6
 */

import { produce } from 'immer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cardLifecycleReducers } from '../card-lifecycle';
import type { Card, CardViewport, CardsState } from '../../types';
import type { PayloadAction } from '@reduxjs/toolkit';

// -----------------------------------------------------------------------------
// Fixture builders
// -----------------------------------------------------------------------------

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    name: id,
    nodes: [],
    edges: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
    createdAt: 0,
    ...overrides,
  };
}

function makeState(opts: { cards?: Card[]; activeCardId?: string | null } = {}): CardsState {
  return {
    cards: opts.cards ?? [makeCard('c1')],
    activeCardId: opts.activeCardId === undefined ? 'c1' : opts.activeCardId,
    history: {},
  };
}

// -----------------------------------------------------------------------------
// Date.now() control
// -----------------------------------------------------------------------------
//
// `createCard` calls `Date.now()` twice (id default + createdAt). Tests that
// assert on those values use `vi.useFakeTimers()` + `vi.setSystemTime(...)`.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

// -----------------------------------------------------------------------------
// setActiveCard
// -----------------------------------------------------------------------------

describe('setActiveCard', () => {
  it('sets state.activeCardId when the id matches an existing card', () => {
    const state = makeState({
      cards: [makeCard('c1'), makeCard('c2')],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.setActiveCard(draft, {
        type: 'cards/setActiveCard',
        payload: 'c2',
      } as PayloadAction<string>);
    });
    expect(next.activeCardId).toBe('c2');
  });

  it('is a no-op when the id does not match any card', () => {
    const state = makeState({
      cards: [makeCard('c1'), makeCard('c2')],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.setActiveCard(draft, {
        type: 'cards/setActiveCard',
        payload: 'missing',
      } as PayloadAction<string>);
    });
    expect(next.activeCardId).toBe('c1');
  });

  it('matches the action type RTK will generate from the spread key', () => {
    // The orchestrator does `reducers: { ...cardLifecycleReducers, ... }`,
    // so the key `setActiveCard` becomes the action type
    // `'cards/setActiveCard'`. The reducer is keyed under the same name.
    expect(cardLifecycleReducers).toHaveProperty('setActiveCard');
    expect(typeof cardLifecycleReducers.setActiveCard).toBe('function');
  });
});

// -----------------------------------------------------------------------------
// createCard
// -----------------------------------------------------------------------------

describe('createCard', () => {
  it('appends a new card with default name and Date.now()-based id', () => {
    const state = makeState({ cards: [], activeCardId: null });
    const fakeNow = Date.now();
    const next = produce(state, (draft) => {
      cardLifecycleReducers.createCard(draft, {
        type: 'cards/createCard',
        payload: undefined,
      } as PayloadAction<undefined>);
    });
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0]).toMatchObject({
      id: `card-${fakeNow}`,
      name: 'New Card',
      nodes: [],
      edges: [],
      viewport: { panX: 0, panY: 0, scale: 1 },
      createdAt: fakeNow,
    });
    expect(next.activeCardId).toBe(`card-${fakeNow}`);
  });

  it('uses the provided id when payload.id is set', () => {
    const state = makeState({ cards: [], activeCardId: null });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.createCard(draft, {
        type: 'cards/createCard',
        payload: { id: 'custom-id' },
      } as PayloadAction<{ id: string }>);
    });
    expect(next.cards[0].id).toBe('custom-id');
    expect(next.activeCardId).toBe('custom-id');
  });

  it('uses the provided name when payload.name is set', () => {
    const state = makeState({ cards: [], activeCardId: null });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.createCard(draft, {
        type: 'cards/createCard',
        payload: { name: 'My Card' },
      } as PayloadAction<{ name: string }>);
    });
    expect(next.cards[0].name).toBe('My Card');
  });

  it('passes through projectId and environmentId from payload', () => {
    const state = makeState({ cards: [], activeCardId: null });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.createCard(draft, {
        type: 'cards/createCard',
        payload: { projectId: 'p1', environmentId: 'e1' },
      } as PayloadAction<{ projectId: string; environmentId: string }>);
    });
    expect(next.cards[0].projectId).toBe('p1');
    expect(next.cards[0].environmentId).toBe('e1');
  });

  it('appends " 1" when the default name collides once', () => {
    const state = makeState({
      cards: [makeCard('c1', { name: 'New Card' })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.createCard(draft, {
        type: 'cards/createCard',
        payload: undefined,
      } as PayloadAction<undefined>);
    });
    expect(next.cards).toHaveLength(2);
    expect(next.cards[1].name).toBe('New Card 1');
  });

  it('walks the counter when "Foo" and "Foo 1" both exist — uses "Foo 2"', () => {
    const state = makeState({
      cards: [
        makeCard('c1', { name: 'Foo' }),
        makeCard('c2', { name: 'Foo 1' }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.createCard(draft, {
        type: 'cards/createCard',
        payload: { name: 'Foo' },
      } as PayloadAction<{ name: string }>);
    });
    expect(next.cards).toHaveLength(3);
    expect(next.cards[2].name).toBe('Foo 2');
  });

  it('walks the counter through three collisions — uses "Foo 3"', () => {
    const state = makeState({
      cards: [
        makeCard('c1', { name: 'Foo' }),
        makeCard('c2', { name: 'Foo 1' }),
        makeCard('c3', { name: 'Foo 2' }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.createCard(draft, {
        type: 'cards/createCard',
        payload: { name: 'Foo' },
      } as PayloadAction<{ name: string }>);
    });
    expect(next.cards[3].name).toBe('Foo 3');
  });

  it('keeps the supplied name unchanged when no other card has it', () => {
    const state = makeState({
      cards: [makeCard('c1', { name: 'Other' })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.createCard(draft, {
        type: 'cards/createCard',
        payload: { name: 'Unique' },
      } as PayloadAction<{ name: string }>);
    });
    expect(next.cards[1].name).toBe('Unique');
  });
});

// -----------------------------------------------------------------------------
// deleteCard
// -----------------------------------------------------------------------------

describe('deleteCard', () => {
  it('removes the card with the matching id', () => {
    const state = makeState({
      cards: [makeCard('c1'), makeCard('c2')],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.deleteCard(draft, {
        type: 'cards/deleteCard',
        payload: 'c2',
      } as PayloadAction<string>);
    });
    expect(next.cards.map((c) => c.id)).toEqual(['c1']);
  });

  it('is a no-op when the cardId is not found', () => {
    const state = makeState({
      cards: [makeCard('c1'), makeCard('c2')],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.deleteCard(draft, {
        type: 'cards/deleteCard',
        payload: 'missing',
      } as PayloadAction<string>);
    });
    expect(next.cards).toHaveLength(2);
    expect(next.activeCardId).toBe('c1');
  });

  it('falls back to prior neighbor (cardIndex - 1) when the active card is deleted', () => {
    const state = makeState({
      cards: [makeCard('c1'), makeCard('c2'), makeCard('c3')],
      activeCardId: 'c2',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.deleteCard(draft, {
        type: 'cards/deleteCard',
        payload: 'c2',
      } as PayloadAction<string>);
    });
    expect(next.cards.map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(next.activeCardId).toBe('c1');
  });

  it('uses cards[0] when deleting the active first card via Math.max(0, -1)', () => {
    // cardIndex - 1 would be -1 when the first card is removed; Math.max
    // floors that to 0, so the new active card is the new cards[0].
    const state = makeState({
      cards: [makeCard('c1'), makeCard('c2'), makeCard('c3')],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.deleteCard(draft, {
        type: 'cards/deleteCard',
        payload: 'c1',
      } as PayloadAction<string>);
    });
    expect(next.cards.map((c) => c.id)).toEqual(['c2', 'c3']);
    expect(next.activeCardId).toBe('c2');
  });

  it("falls back to '' (empty string) when the only remaining card is deleted", () => {
    const state = makeState({
      cards: [makeCard('c1')],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.deleteCard(draft, {
        type: 'cards/deleteCard',
        payload: 'c1',
      } as PayloadAction<string>);
    });
    expect(next.cards).toHaveLength(0);
    expect(next.activeCardId).toBe('');
  });

  it('does not change activeCardId when deleting an inactive card', () => {
    const state = makeState({
      cards: [makeCard('c1'), makeCard('c2'), makeCard('c3')],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.deleteCard(draft, {
        type: 'cards/deleteCard',
        payload: 'c3',
      } as PayloadAction<string>);
    });
    expect(next.cards.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(next.activeCardId).toBe('c1');
  });
});

// -----------------------------------------------------------------------------
// renameCard
// -----------------------------------------------------------------------------

describe('renameCard', () => {
  it('updates the matching card name', () => {
    const state = makeState({
      cards: [makeCard('c1', { name: 'old' }), makeCard('c2', { name: 'other' })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.renameCard(draft, {
        type: 'cards/renameCard',
        payload: { cardId: 'c1', name: 'fresh' },
      } as PayloadAction<{ cardId: string; name: string }>);
    });
    expect(next.cards[0].name).toBe('fresh');
    expect(next.cards[1].name).toBe('other');
  });

  it('is a no-op when the cardId is not found', () => {
    const state = makeState({
      cards: [makeCard('c1', { name: 'untouched' })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.renameCard(draft, {
        type: 'cards/renameCard',
        payload: { cardId: 'missing', name: 'never-applied' },
      } as PayloadAction<{ cardId: string; name: string }>);
    });
    expect(next.cards[0].name).toBe('untouched');
  });
});

// -----------------------------------------------------------------------------
// setCardViewport
// -----------------------------------------------------------------------------

describe('setCardViewport', () => {
  it("updates the active card's viewport", () => {
    const state = makeState({
      cards: [makeCard('c1'), makeCard('c2')],
      activeCardId: 'c1',
    });
    const newViewport: CardViewport = { panX: 100, panY: 200, scale: 1.5 };
    const next = produce(state, (draft) => {
      cardLifecycleReducers.setCardViewport(draft, {
        type: 'cards/setCardViewport',
        payload: newViewport,
      } as PayloadAction<CardViewport>);
    });
    expect(next.cards[0].viewport).toEqual(newViewport);
    expect(next.cards[1].viewport).toEqual({ panX: 0, panY: 0, scale: 1 });
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1')],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.setCardViewport(draft, {
        type: 'cards/setCardViewport',
        payload: { panX: 99, panY: 99, scale: 2 },
      } as PayloadAction<CardViewport>);
    });
    expect(next.cards[0].viewport).toEqual({ panX: 0, panY: 0, scale: 1 });
  });

  it('is a no-op when activeCardId points to a missing card', () => {
    const state = makeState({
      cards: [makeCard('c1')],
      activeCardId: 'missing',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.setCardViewport(draft, {
        type: 'cards/setCardViewport',
        payload: { panX: 99, panY: 99, scale: 2 },
      } as PayloadAction<CardViewport>);
    });
    expect(next.cards[0].viewport).toEqual({ panX: 0, panY: 0, scale: 1 });
  });
});

// -----------------------------------------------------------------------------
// setCardViewportById
// -----------------------------------------------------------------------------

describe('setCardViewportById', () => {
  it("updates the specified card's viewport (independent of activeCardId)", () => {
    const state = makeState({
      cards: [makeCard('c1'), makeCard('c2')],
      activeCardId: 'c1',
    });
    const newViewport: CardViewport = { panX: -50, panY: 0, scale: 0.75 };
    const next = produce(state, (draft) => {
      cardLifecycleReducers.setCardViewportById(draft, {
        type: 'cards/setCardViewportById',
        payload: { cardId: 'c2', viewport: newViewport },
      } as PayloadAction<{ cardId: string; viewport: CardViewport }>);
    });
    expect(next.cards[0].viewport).toEqual({ panX: 0, panY: 0, scale: 1 });
    expect(next.cards[1].viewport).toEqual(newViewport);
    // activeCardId untouched
    expect(next.activeCardId).toBe('c1');
  });

  it('is a no-op when the cardId is not found', () => {
    const state = makeState({
      cards: [makeCard('c1')],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      cardLifecycleReducers.setCardViewportById(draft, {
        type: 'cards/setCardViewportById',
        payload: { cardId: 'missing', viewport: { panX: 99, panY: 99, scale: 2 } },
      } as PayloadAction<{ cardId: string; viewport: CardViewport }>);
    });
    expect(next.cards[0].viewport).toEqual({ panX: 0, panY: 0, scale: 1 });
  });
});
