/**
 * Cards slice — card-lifecycle reducers.
 *
 * Six reducers that operate on the `Card` object directly (not on a card's
 * nodes/edges). Spread into `createSlice`'s `reducers` block in the
 * orchestrator (`cards-slice.ts`) so RTK still owns the action type strings
 * (`'cards/setActiveCard'` etc.).
 *
 * - `setActiveCard` — switch which card is active.
 * - `createCard` — append a fresh card with a unique name; activate it.
 * - `deleteCard` — splice a card; fall back to a neighbour or `''` for
 *   `activeCardId`.
 * - `renameCard` — patch a card's `name`.
 * - `setCardViewport` — write the active card's viewport.
 * - `setCardViewportById` — write a specific card's viewport (split-view).
 *
 * None of these call `pushSnapshot`: the undo stack tracks a card's
 * nodes/edges, not the card-list shape. They are not coalesced either.
 *
 * @see rf-cards-6
 */

import { DEFAULT_VIEWPORT } from '../types';
import type { Card, CardViewport, CardsState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const cardLifecycleReducers = {
  // Set active card
  setActiveCard: (state: CardsState, action: PayloadAction<string>) => {
    if (state.cards.some((c) => c.id === action.payload)) {
      state.activeCardId = action.payload;
    }
  },

  // Create new card
  createCard: (
    state: CardsState,
    action: PayloadAction<{ name?: string; id?: string; projectId?: string; environmentId?: string } | undefined>,
  ) => {
    const id = action.payload?.id || `card-${Date.now()}`;
    const existingNames = state.cards.map((c) => c.name);
    const name = action.payload?.name || 'New Card';

    // Ensure unique name
    let counter = 1;
    let uniqueName = name;
    while (existingNames.includes(uniqueName)) {
      uniqueName = `${name} ${counter++}`;
    }

    const newCard: Card = {
      id,
      name: uniqueName,
      nodes: [],
      edges: [],
      viewport: { ...DEFAULT_VIEWPORT },
      createdAt: Date.now(),
      projectId: action.payload?.projectId,
      environmentId: action.payload?.environmentId,
    };

    state.cards.push(newCard);
    state.activeCardId = id;
  },

  // Delete card
  deleteCard: (state: CardsState, action: PayloadAction<string>) => {
    const cardId = action.payload;
    const cardIndex = state.cards.findIndex((c) => c.id === cardId);

    if (cardIndex === -1) return;

    state.cards.splice(cardIndex, 1);

    // If we deleted the active card, switch to another or clear
    if (state.activeCardId === cardId) {
      state.activeCardId = state.cards.length > 0 ? state.cards[Math.max(0, cardIndex - 1)].id : '';
    }
  },

  // Rename card
  renameCard: (state: CardsState, action: PayloadAction<{ cardId: string; name: string }>) => {
    const card = state.cards.find((c) => c.id === action.payload.cardId);
    if (card) {
      card.name = action.payload.name;
    }
  },

  // Update viewport for active card
  setCardViewport: (state: CardsState, action: PayloadAction<CardViewport>) => {
    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      card.viewport = action.payload;
    }
  },

  // Update viewport for a specific card (used by split view)
  setCardViewportById: (state: CardsState, action: PayloadAction<{ cardId: string; viewport: CardViewport }>) => {
    const card = state.cards.find((c) => c.id === action.payload.cardId);
    if (card) {
      card.viewport = action.payload.viewport;
    }
  },
} as const;
