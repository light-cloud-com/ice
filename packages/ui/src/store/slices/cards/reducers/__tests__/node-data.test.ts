/**
 * Tests for `cards/reducers/node-data.ts` — the three reducers covering
 * the fold toggle (`toggleCardNodeFold`), reparent (`updateCardNodeParent`),
 * and `node.data` patch merge (`updateCardNodeData`).
 *
 * Each reducer is exercised through Immer's `produce` to mirror RTK's runtime
 * behavior — the reducer body is allowed to mutate a draft, and the produced
 * result is structurally equal to the post-mutation draft. This avoids
 * dragging in `configureStore` for what is fundamentally a pure
 * `(state, action) => void` shape.
 *
 * `pushSnapshot` from `../../snapshot` is the real implementation. The two
 * snapshotting reducers (`updateCardNodeParent`, `updateCardNodeData`) call
 * it WITHOUT an actionType, so coalescing is bypassed regardless of the
 * module-level `_lastSnapshotAction` value. `toggleCardNodeFold` does NOT
 * call `pushSnapshot` at all (RISK: blueprint flag — fold is presentational
 * state, not undoable). `beforeEach` still calls `pushSnapshot` with a
 * sentinel "reset-coalesce" against a null-active state to keep parity with
 * sibling test files (cheap insurance against module-level `let` leakage —
 * see `pushsnapshot-coalescing-needs-explicit-reset-between-tests`).
 *
 * Coverage targets:
 * - `toggleCardNodeFold`: flips `node.data.folded` (false → true, true →
 *   false); creates the field when absent (undefined → true); pushSnapshot
 *   NOT recorded (history stays empty); no-op when no active card; no-op
 *   when nodeId is missing; no-op when node has no `data` field.
 * - `updateCardNodeParent`: assigns parentId on the truthy branch; uses
 *   `delete node.parentId` on the null branch (the property is absent
 *   afterward, NOT present-with-undefined); pushSnapshot recorded; no-op
 *   when no active card; no-op when nodeId is missing.
 * - `updateCardNodeData`: shallow-merges patch via spread; sibling fields
 *   preserved; new fields added; existing fields overwritten by patch;
 *   pushSnapshot recorded; no-op when no active card; no-op when nodeId is
 *   missing.
 *
 * @see rf-cards-9
 */

import { produce } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import { nodeDataReducers } from '../node-data';
import { pushSnapshot } from '../../snapshot';
import type { Card, CardEdge, CardNode, CardsState } from '../../types';
import type { PayloadAction } from '@reduxjs/toolkit';

// -----------------------------------------------------------------------------
// Fixture builders
// -----------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<CardNode> = {}): CardNode {
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    width: 240,
    height: 56,
    data: {},
    ...overrides,
  };
}

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    name: id,
    nodes: [],
    edges: [] as CardEdge[],
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
// Coalesce-state reset
// -----------------------------------------------------------------------------
//
// `pushSnapshot` keeps `_lastSnapshotAction` at module scope. The two
// snapshotting reducers in this file call `pushSnapshot(state)` without an
// actionType, so coalescing wouldn't fire, but a stale value from another
// test could in theory affect downstream tests. The "reset-coalesce" sentinel
// is cheap insurance — a no-op call against a null-active state, see
// `reset-module-let-via-synthetic-call-not-vi-resetModules`.

beforeEach(() => {
  pushSnapshot({ cards: [], activeCardId: null, history: {} } as CardsState, 'reset-coalesce');
});

// -----------------------------------------------------------------------------
// toggleCardNodeFold
// -----------------------------------------------------------------------------

describe('toggleCardNodeFold', () => {
  it('flips folded from false to true', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { data: { folded: false } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.toggleCardNodeFold(draft, {
        type: 'cards/toggleCardNodeFold',
        payload: 'n1',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].nodes[0].data.folded).toBe(true);
  });

  it('flips folded from true to false', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { data: { folded: true } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.toggleCardNodeFold(draft, {
        type: 'cards/toggleCardNodeFold',
        payload: 'n1',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].nodes[0].data.folded).toBe(false);
  });

  it('creates folded=true when the field was absent (undefined → !undefined = true)', () => {
    // Source uses `node.data.folded = !node.data.folded` — `!undefined` is
    // `true`, so a node that never had a `folded` field collapses.
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { data: {} })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.toggleCardNodeFold(draft, {
        type: 'cards/toggleCardNodeFold',
        payload: 'n1',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].nodes[0].data.folded).toBe(true);
  });

  it('does NOT push an undo snapshot — fold is presentational state', () => {
    // RISK note from blueprint: `toggleCardNodeFold` MUST NOT call
    // pushSnapshot. Pin this so a future refactor can't quietly turn fold
    // into an undoable action.
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { data: { folded: false } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.toggleCardNodeFold(draft, {
        type: 'cards/toggleCardNodeFold',
        payload: 'n1',
      } as PayloadAction<string>);
    });
    // history.c1 is created by pushSnapshot lazily; if pushSnapshot was
    // never called, the entry stays absent.
    expect(next.history.c1).toBeUndefined();
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { data: { folded: false } })] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.toggleCardNodeFold(draft, {
        type: 'cards/toggleCardNodeFold',
        payload: 'n1',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].nodes[0].data.folded).toBe(false);
  });

  it('is a no-op when the nodeId does not match any node', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { data: { folded: false } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.toggleCardNodeFold(draft, {
        type: 'cards/toggleCardNodeFold',
        payload: 'missing',
      } as PayloadAction<string>);
    });
    expect(next.cards[0].nodes[0].data.folded).toBe(false);
  });

  it('is a no-op when the node has no `data` field (defensive guard)', () => {
    // Branch: `if (node && node.data)` — covers the data-falsy case so
    // both branches of the guard run during testing. Type-cast: a CardNode
    // without `data` violates the public type, but the runtime guard
    // exists to handle malformed legacy state.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [{ ...makeNode('n1'), data: undefined as unknown as Record<string, unknown> }],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.toggleCardNodeFold(draft, {
        type: 'cards/toggleCardNodeFold',
        payload: 'n1',
      } as PayloadAction<string>);
    });
    // No throw, no mutation: the data field stays as it was (undefined).
    expect(next.cards[0].nodes[0].data).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// updateCardNodeParent
// -----------------------------------------------------------------------------

describe('updateCardNodeParent', () => {
  it('assigns parentId when the payload parentId is truthy', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1')] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.updateCardNodeParent(draft, {
        type: 'cards/updateCardNodeParent',
        payload: { nodeId: 'n1', parentId: 'group-1' },
      } as PayloadAction<{ nodeId: string; parentId: string | null }>);
    });
    expect(next.cards[0].nodes[0].parentId).toBe('group-1');
  });

  it('overwrites an existing parentId when the payload parentId is truthy', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { parentId: 'old-group' })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.updateCardNodeParent(draft, {
        type: 'cards/updateCardNodeParent',
        payload: { nodeId: 'n1', parentId: 'new-group' },
      } as PayloadAction<{ nodeId: string; parentId: string | null }>);
    });
    expect(next.cards[0].nodes[0].parentId).toBe('new-group');
  });

  it('uses `delete node.parentId` on the null branch (field absent, NOT present-with-undefined)', () => {
    // RISK note from blueprint: this MUST be `delete`, not `= undefined`.
    // The Immer/JSON undo-clone roundtrip preserves an absent field as
    // absent, but a present-with-undefined field would diverge from the
    // CardNode type's optional contract (`parentId?: string`). Use
    // `Object.prototype.hasOwnProperty.call` to distinguish "present with
    // undefined" from "absent" — `node.parentId === undefined` would pass
    // both, so `'parentId' in node` is the load-bearing assertion here.
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { parentId: 'old-group' })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.updateCardNodeParent(draft, {
        type: 'cards/updateCardNodeParent',
        payload: { nodeId: 'n1', parentId: null },
      } as PayloadAction<{ nodeId: string; parentId: string | null }>);
    });
    const node = next.cards[0].nodes[0];
    // `delete` removed the key entirely.
    expect('parentId' in node).toBe(false);
    // And of course the value-level read returns undefined, but the above
    // assertion is the one pinning `delete` vs assignment.
    expect(node.parentId).toBeUndefined();
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { parentId: 'g0' })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.updateCardNodeParent(draft, {
        type: 'cards/updateCardNodeParent',
        payload: { nodeId: 'n1', parentId: 'g1' },
      } as PayloadAction<{ nodeId: string; parentId: string | null }>);
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    // Snapshot captures pre-mutation parentId.
    expect(next.history.c1.past[0].nodes[0].parentId).toBe('g0');
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1')] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.updateCardNodeParent(draft, {
        type: 'cards/updateCardNodeParent',
        payload: { nodeId: 'n1', parentId: 'g1' },
      } as PayloadAction<{ nodeId: string; parentId: string | null }>);
    });
    expect(next.cards[0].nodes[0].parentId).toBeUndefined();
  });

  it('is a no-op when the nodeId does not match any node', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1')] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.updateCardNodeParent(draft, {
        type: 'cards/updateCardNodeParent',
        payload: { nodeId: 'missing', parentId: 'g1' },
      } as PayloadAction<{ nodeId: string; parentId: string | null }>);
    });
    expect(next.cards[0].nodes[0].parentId).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// updateCardNodeData
// -----------------------------------------------------------------------------

describe('updateCardNodeData', () => {
  it('shallow-merges the patch onto existing node.data', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1', { data: { label: 'old', color: 'red', folded: false } })],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.updateCardNodeData(draft, {
        type: 'cards/updateCardNodeData',
        payload: { nodeId: 'n1', data: { label: 'new', extra: 42 } },
      } as PayloadAction<{ nodeId: string; data: Record<string, unknown> }>);
    });
    const merged = next.cards[0].nodes[0].data;
    // Patched fields overwritten.
    expect(merged.label).toBe('new');
    // New fields added.
    expect(merged.extra).toBe(42);
    // Sibling fields preserved (NOT in the patch).
    expect(merged.color).toBe('red');
    expect(merged.folded).toBe(false);
  });

  it('preserves all existing fields when the patch is empty', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('n1', { data: { a: 1, b: 'x' } })],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.updateCardNodeData(draft, {
        type: 'cards/updateCardNodeData',
        payload: { nodeId: 'n1', data: {} },
      } as PayloadAction<{ nodeId: string; data: Record<string, unknown> }>);
    });
    expect(next.cards[0].nodes[0].data).toEqual({ a: 1, b: 'x' });
  });

  it('records an undo snapshot on the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { data: { label: 'before' } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.updateCardNodeData(draft, {
        type: 'cards/updateCardNodeData',
        payload: { nodeId: 'n1', data: { label: 'after' } },
      } as PayloadAction<{ nodeId: string; data: Record<string, unknown> }>);
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    // Snapshot captures pre-mutation data.
    expect(next.history.c1.past[0].nodes[0].data.label).toBe('before');
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { data: { label: 'old' } })] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.updateCardNodeData(draft, {
        type: 'cards/updateCardNodeData',
        payload: { nodeId: 'n1', data: { label: 'new' } },
      } as PayloadAction<{ nodeId: string; data: Record<string, unknown> }>);
    });
    expect(next.cards[0].nodes[0].data.label).toBe('old');
  });

  it('is a no-op when the nodeId does not match any node', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('n1', { data: { label: 'old' } })] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      nodeDataReducers.updateCardNodeData(draft, {
        type: 'cards/updateCardNodeData',
        payload: { nodeId: 'missing', data: { label: 'new' } },
      } as PayloadAction<{ nodeId: string; data: Record<string, unknown> }>);
    });
    expect(next.cards[0].nodes[0].data.label).toBe('old');
  });
});
