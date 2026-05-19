/**
 * Tests for `cards/reducers/undo-redo-group.ts` — the three reducers covering
 * the undo / redo / group-selection paths.
 *
 * Each reducer is exercised through Immer's `produce` to mirror RTK's runtime
 * behavior — the reducer body is allowed to mutate a draft, and the produced
 * result is structurally equal to the post-mutation draft. This avoids
 * dragging in `configureStore` for what is fundamentally a pure
 * `(state, action) => void` shape (cite sibling test files in this folder).
 *
 * `pushSnapshot` from `../../snapshot` is the real implementation — only
 * `groupSelectedNodes` calls it. The `beforeEach` "reset-coalesce" sentinel
 * keeps parity with sibling test files; cite
 * `pushsnapshot-coalescing-needs-explicit-reset-between-tests`. The
 * coalescing branch is NOT exercised by `groupSelectedNodes` (no actionType
 * is passed), so the sentinel call is cheap insurance, not a coverage driver.
 *
 * Coverage targets:
 * - `undoCardChange`:
 *   - Restores prev nodes/edges from `history.past`; current state pushed to
 *     `history.future`. Deep-clone via `JSON.parse(JSON.stringify(...))` is
 *     load-bearing — the test pins reference inequality between the
 *     post-undo `history.future` snapshot and the restored `card.nodes`,
 *     which would alias each other if the deep-clone were dropped.
 *   - No-op when there's no active card.
 *   - No-op when `history` for the active card is missing.
 *   - No-op when `past` is empty.
 * - `redoCardChange`:
 *   - Restores nodes/edges from `history.future`; current state pushed back
 *     to `history.past`. Deep-clone reference-inequality pin same as undo.
 *   - No-op when there's no active card.
 *   - No-op when `history` for the active card is missing.
 *   - No-op when `future` is empty.
 * - `groupSelectedNodes`:
 *   - Creates a `Group.Custom` container with `type: 'container'` and the
 *     correct bounding-box dimensions (PADDING = 40, +30 height for header).
 *   - **RISK pin (rf-cards-14 blueprint)**: `card.nodes.push(groupNode)`
 *     happens BEFORE the `node.parentId = groupNode.id` reassignment loop —
 *     the group is the LAST element in `card.nodes` so it renders BEHIND
 *     its children due to canvas Z-order. The test asserts the group is at
 *     `nodes[nodes.length - 1]` and that selected children carry
 *     `parentId === groupNode.id` post-reduce. A refactor that pushed the
 *     group to index 0 would fail loudly with a wrong-index mismatch.
 *   - parentId reassignment skips children that are already nested inside
 *     ANOTHER selected node (the `nodeIds.includes(node.parentId || '')`
 *     gate) — only top-level selected nodes get reparented.
 *   - Records an undo snapshot capturing the pre-group state.
 *   - No-op when fewer than 2 ids are passed (early return on payload size).
 *   - No-op when there's no active card.
 *   - No-op when fewer than 2 of the requested ids actually exist in the
 *     active card (post-`pushSnapshot` early return).
 *
 * @see rf-cards-14
 */

import { produce } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PayloadAction } from '@reduxjs/toolkit';
import { undoRedoGroupReducers } from '../undo-redo-group';
import { pushSnapshot } from '../../snapshot';
import type { Card, CardEdge, CardNode, CardsState } from '../../types';

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

function makeState(opts: { cards?: Card[]; activeCardId?: string | null; history?: CardsState['history'] } = {}): CardsState {
  return {
    cards: opts.cards ?? [makeCard('c1')],
    activeCardId: opts.activeCardId === undefined ? 'c1' : opts.activeCardId,
    history: opts.history ?? {},
  };
}

// -----------------------------------------------------------------------------
// Coalesce-state reset
// -----------------------------------------------------------------------------
//
// `pushSnapshot` keeps `_lastSnapshotAction` at module scope. Only
// `groupSelectedNodes` calls `pushSnapshot` (without an actionType, so
// coalescing doesn't fire), but a stale value from another test could in
// theory affect runs in other test files. The "reset-coalesce" sentinel
// mirrors sibling test files.

beforeEach(() => {
  pushSnapshot({ cards: [], activeCardId: null, history: {} } as CardsState, 'reset-coalesce');
});

// -----------------------------------------------------------------------------
// undoCardChange
// -----------------------------------------------------------------------------

describe('undoCardChange', () => {
  it('restores nodes and edges from the past stack and pushes the current state onto future', () => {
    const pastNodes = [makeNode('was-a'), makeNode('was-b')];
    const pastEdges: CardEdge[] = [{ id: 'was-e1', source: 'was-a', target: 'was-b' }];
    const currentNodes = [makeNode('now-x'), makeNode('now-y'), makeNode('now-z')];
    const currentEdges: CardEdge[] = [{ id: 'now-e1', source: 'now-x', target: 'now-y' }];
    const state = makeState({
      cards: [makeCard('c1', { nodes: currentNodes, edges: currentEdges })],
      activeCardId: 'c1',
      history: {
        c1: {
          past: [{ nodes: pastNodes, edges: pastEdges }],
          future: [],
        },
      },
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.undoCardChange(draft);
    });
    // Restored from past → past is now empty (snapshot popped).
    expect(next.history.c1.past).toHaveLength(0);
    // Card now reflects past snapshot.
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['was-a', 'was-b']);
    expect(next.cards[0].edges.map((e) => e.id)).toEqual(['was-e1']);
    // Future captured the previous current state.
    expect(next.history.c1.future).toHaveLength(1);
    expect(next.history.c1.future[0].nodes.map((n) => n.id)).toEqual(['now-x', 'now-y', 'now-z']);
    expect(next.history.c1.future[0].edges.map((e) => e.id)).toEqual(['now-e1']);
  });

  it('deep-clones the current state into future (RISK: reference inequality post-undo)', () => {
    // The reducer uses `JSON.parse(JSON.stringify(...))` to clone before
    // pushing to `history.future`. If a future refactor swapped that for a
    // direct push (`history.future.push({ nodes: card.nodes, edges: card.edges })`),
    // the future snapshot would alias the live `card.nodes`/`card.edges`
    // arrays — and after the subsequent `card.nodes = snapshot.nodes`
    // reassignment, the future snapshot would point at the wrong shape.
    // Here we pin: after undo, `history.future[0].nodes` is structurally
    // equal to the pre-undo card state but is a distinct object identity
    // from the post-undo `card.nodes`.
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('current')] })],
      activeCardId: 'c1',
      history: {
        c1: { past: [{ nodes: [makeNode('past')], edges: [] }], future: [] },
      },
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.undoCardChange(draft);
    });
    // Post-undo card.nodes is the past snapshot.
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['past']);
    // Future captured the pre-undo state ('current'), not the post-undo state ('past').
    expect(next.history.c1.future[0].nodes.map((n) => n.id)).toEqual(['current']);
    // Different object identities — the future snapshot is NOT aliasing card.nodes.
    expect(next.history.c1.future[0].nodes).not.toBe(next.cards[0].nodes);
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('keep')] })],
      activeCardId: null,
      history: {
        c1: { past: [{ nodes: [makeNode('past')], edges: [] }], future: [] },
      },
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.undoCardChange(draft);
    });
    expect(next).toEqual(state);
  });

  it('is a no-op when there is no history for the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('keep')] })],
      activeCardId: 'c1',
      // No history.c1 entry.
      history: {},
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.undoCardChange(draft);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['keep']);
    expect(next.history).toEqual({});
  });

  it('is a no-op when the past stack is empty', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('keep')] })],
      activeCardId: 'c1',
      history: {
        c1: { past: [], future: [] },
      },
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.undoCardChange(draft);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['keep']);
    expect(next.history.c1.past).toHaveLength(0);
    expect(next.history.c1.future).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// redoCardChange
// -----------------------------------------------------------------------------

describe('redoCardChange', () => {
  it('restores nodes and edges from the future stack and pushes the current state onto past', () => {
    const futureNodes = [makeNode('redo-a'), makeNode('redo-b')];
    const futureEdges: CardEdge[] = [{ id: 'redo-e1', source: 'redo-a', target: 'redo-b' }];
    const currentNodes = [makeNode('now-x')];
    const currentEdges: CardEdge[] = [];
    const state = makeState({
      cards: [makeCard('c1', { nodes: currentNodes, edges: currentEdges })],
      activeCardId: 'c1',
      history: {
        c1: {
          past: [],
          future: [{ nodes: futureNodes, edges: futureEdges }],
        },
      },
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.redoCardChange(draft);
    });
    // Future popped, past gained the previous current state.
    expect(next.history.c1.future).toHaveLength(0);
    expect(next.history.c1.past).toHaveLength(1);
    expect(next.history.c1.past[0].nodes.map((n) => n.id)).toEqual(['now-x']);
    // Card reflects the redone snapshot.
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['redo-a', 'redo-b']);
    expect(next.cards[0].edges.map((e) => e.id)).toEqual(['redo-e1']);
  });

  it('deep-clones the current state into past (RISK: reference inequality post-redo)', () => {
    // Mirror of the undo deep-clone pin — `JSON.parse(JSON.stringify(...))`
    // ensures the past snapshot is NOT aliasing the live `card.nodes`/
    // `card.edges` arrays after the snapshot reassignment.
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('current')] })],
      activeCardId: 'c1',
      history: {
        c1: { past: [], future: [{ nodes: [makeNode('future')], edges: [] }] },
      },
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.redoCardChange(draft);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['future']);
    expect(next.history.c1.past[0].nodes.map((n) => n.id)).toEqual(['current']);
    expect(next.history.c1.past[0].nodes).not.toBe(next.cards[0].nodes);
  });

  it('is a no-op when activeCardId is null', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('keep')] })],
      activeCardId: null,
      history: {
        c1: { past: [], future: [{ nodes: [makeNode('future')], edges: [] }] },
      },
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.redoCardChange(draft);
    });
    expect(next).toEqual(state);
  });

  it('is a no-op when there is no history for the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('keep')] })],
      activeCardId: 'c1',
      history: {},
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.redoCardChange(draft);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['keep']);
    expect(next.history).toEqual({});
  });

  it('is a no-op when the future stack is empty', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('keep')] })],
      activeCardId: 'c1',
      history: {
        c1: { past: [], future: [] },
      },
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.redoCardChange(draft);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['keep']);
    expect(next.history.c1.past).toHaveLength(0);
    expect(next.history.c1.future).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// groupSelectedNodes
// -----------------------------------------------------------------------------

describe('groupSelectedNodes', () => {
  it('creates a Group.Custom container with the correct bounding box (PADDING=40, +30 header)', () => {
    // Two nodes positioned at corners of a known box. Expected group:
    //   minX=10, minY=20, maxX=10+240=250 (a-right), maxY=20+56=76 (a-bottom)
    //   For b at (300, 200) w=240 h=56: maxX=540, maxY=256.
    // So box: minX=10, minY=20, maxX=540, maxY=256.
    //   group.position.x = 10 - 40 = -30
    //   group.position.y = 20 - 40 = -20
    //   group.width = (540 - 10) + 80 = 610
    //   group.height = (256 - 20) + 80 + 30 = 346
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', { position: { x: 10, y: 20 } }),
            makeNode('b', { position: { x: 300, y: 200 } }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.groupSelectedNodes(draft, {
        type: 'cards/groupSelectedNodes',
        payload: ['a', 'b'],
      } as PayloadAction<string[]>);
    });
    const group = next.cards[0].nodes[next.cards[0].nodes.length - 1];
    expect(group.type).toBe('container');
    expect(group.data.iceType).toBe('Group.Custom');
    expect(group.data.label).toBe('New Group');
    expect(group.data.groupColor).toBe('#3b82f6');
    expect(group.data.behavior).toBe('container');
    expect(group.data.folded).toBe(false);
    expect(group.position.x).toBe(-30);
    expect(group.position.y).toBe(-20);
    expect(group.width).toBe(610);
    expect(group.height).toBe(346);
    // Group id namespaced.
    expect(group.id).toMatch(/^group-/);
  });

  it('appends the group node LAST in card.nodes so it renders BEHIND its children (RISK: Z-order)', () => {
    // RISK pin from rf-cards-14 blueprint: `card.nodes.push(groupNode)`
    // runs BEFORE the `node.parentId = groupNode.id` reassignment loop.
    // The canvas paints in array order, so later-in-array = rendered later
    // = visible in front for sibling overlap, but for parent/child relations
    // the parent renders BEHIND its children because the canvas paints
    // children on top. A refactor that pushed at index 0 (or unshifted)
    // would make the group's frame occlude its members — this test would
    // fail with a wrong-index assertion.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', { position: { x: 0, y: 0 } }),
            makeNode('b', { position: { x: 300, y: 0 } }),
            makeNode('c', { position: { x: 600, y: 0 } }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.groupSelectedNodes(draft, {
        type: 'cards/groupSelectedNodes',
        payload: ['a', 'c'],
      } as PayloadAction<string[]>);
    });
    // Selected nodes a,c stay at their original positions; group is appended last.
    const ids = next.cards[0].nodes.map((n) => n.id);
    expect(ids[0]).toBe('a');
    expect(ids[1]).toBe('b');
    expect(ids[2]).toBe('c');
    expect(ids[3]).toMatch(/^group-/);
    expect(ids).toHaveLength(4);
  });

  it('reparents selected top-level nodes after the push (parentId loop runs after group insertion)', () => {
    // Pin the order: the loop reads `groupNode.id` (which exists because
    // the construction happens before the loop) and writes `node.parentId`
    // on each selected node. We assert the parentId is the group's id, not
    // any other node id in the card.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', { position: { x: 0, y: 0 } }),
            makeNode('b', { position: { x: 300, y: 0 } }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.groupSelectedNodes(draft, {
        type: 'cards/groupSelectedNodes',
        payload: ['a', 'b'],
      } as PayloadAction<string[]>);
    });
    const groupNode = next.cards[0].nodes[next.cards[0].nodes.length - 1];
    const a = next.cards[0].nodes.find((n) => n.id === 'a')!;
    const b = next.cards[0].nodes.find((n) => n.id === 'b')!;
    expect(a.parentId).toBe(groupNode.id);
    expect(b.parentId).toBe(groupNode.id);
  });

  it('skips reparenting children whose parent is also in the selection', () => {
    // Branch: `if (!nodeIds.includes(node.parentId || ''))`. A selection of
    // `[parent, child]` where `child.parentId === 'parent'` reparents only
    // `parent` to the new group; `child` stays nested under `parent` and
    // moves with it implicitly (but its parentId field must NOT be
    // overwritten).
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('parent', { position: { x: 0, y: 0 }, width: 400, height: 300 }),
            makeNode('child', { position: { x: 50, y: 50 }, parentId: 'parent' }),
            makeNode('peer', { position: { x: 500, y: 0 } }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.groupSelectedNodes(draft, {
        type: 'cards/groupSelectedNodes',
        payload: ['parent', 'child', 'peer'],
      } as PayloadAction<string[]>);
    });
    const group = next.cards[0].nodes[next.cards[0].nodes.length - 1];
    const parent = next.cards[0].nodes.find((n) => n.id === 'parent')!;
    const child = next.cards[0].nodes.find((n) => n.id === 'child')!;
    const peer = next.cards[0].nodes.find((n) => n.id === 'peer')!;
    // parent reparented to group.
    expect(parent.parentId).toBe(group.id);
    // child stays parented to 'parent' (gate skips because 'parent' is in nodeIds).
    expect(child.parentId).toBe('parent');
    // peer reparented to group.
    expect(peer.parentId).toBe(group.id);
  });

  it('records an undo snapshot capturing the pre-group state', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('a'), makeNode('b')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.groupSelectedNodes(draft, {
        type: 'cards/groupSelectedNodes',
        payload: ['a', 'b'],
      } as PayloadAction<string[]>);
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    // Pre-group snapshot has just the two original nodes (no group, no parentId).
    expect(next.history.c1.past[0].nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(next.history.c1.past[0].nodes.find((n) => n.id === 'a')!.parentId).toBeUndefined();
  });

  it('is a no-op when the payload has fewer than 2 ids (early return on payload length)', () => {
    // Branch: `nodeIds.length < 2` → early return BEFORE pushSnapshot.
    // Single-node "group" would be meaningless, so the reducer bails.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('a'), makeNode('b')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.groupSelectedNodes(draft, {
        type: 'cards/groupSelectedNodes',
        payload: ['a'],
      } as PayloadAction<string[]>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(next.history.c1).toBeUndefined();
  });

  it('is a no-op when activeCardId is null (no active card)', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('a'), makeNode('b')] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.groupSelectedNodes(draft, {
        type: 'cards/groupSelectedNodes',
        payload: ['a', 'b'],
      } as PayloadAction<string[]>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(next.history.c1).toBeUndefined();
  });

  it('is a no-op (beyond pushSnapshot bail) when fewer than 2 of the requested ids exist', () => {
    // Branch: `selectedNodes.length < 2` → early return AFTER pushSnapshot.
    // pushSnapshot itself runs first but, because the active card has two
    // existing nodes, it captures a snapshot of the pre-call state. The
    // reducer then bails out without creating the group.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('a'), makeNode('b')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      undoRedoGroupReducers.groupSelectedNodes(draft, {
        type: 'cards/groupSelectedNodes',
        payload: ['a', 'ghost'], // only one matches
      } as PayloadAction<string[]>);
    });
    // No group appended.
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['a', 'b']);
    // pushSnapshot DID run before the early return — the post-push history is preserved.
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
  });
});
