/**
 * Tests for `cards/reducers/scale-blueprint.ts` — the two reducers covering
 * the proportional zoom scaling pass (`scaleLayoutForZoom`) and the
 * blueprint-expansion ingestion path (`expandBlueprintToCard`).
 *
 * Each reducer is exercised through Immer's `produce` to mirror RTK's runtime
 * behavior — the reducer body is allowed to mutate a draft, and the produced
 * result is structurally equal to the post-mutation draft. This avoids
 * dragging in `configureStore` for what is fundamentally a pure
 * `(state, action) => void` shape.
 *
 * `pushSnapshot` from `../../snapshot` is the real implementation — only
 * `expandBlueprintToCard` calls it. The `beforeEach` "reset-coalesce"
 * sentinel keeps parity with sibling test files (cite
 * `pushsnapshot-coalescing-needs-explicit-reset-between-tests`). The
 * coalescing branch is NOT exercised by these reducers (neither passes an
 * `actionType`), so the sentinel call is cheap insurance, not a coverage
 * driver.
 *
 * `migrateCardNode` from `../../migration` is the real implementation —
 * `expandBlueprintToCard` runs the payload node through it before pushing
 * onto `card.nodes`, and the test pins both migration branches
 * (`Monitoring.Terminal` → `Monitoring.Log`; `Block.Frontend` → `Group.Frontend`
 * with `type: 'container'`) by directly reading `cards/migration.ts` for
 * the canonical iceType strings (cite
 * `brief-numerics-are-approximate-source-is-canonical`).
 *
 * Coverage targets:
 * - `scaleLayoutForZoom`:
 *   - **RISK pin (RISK #10)**: `scaleX = 1` / `scaleY = 1` is hard-coded and
 *     intentional. Pin via assertion that node.width / node.height post-call
 *     equal the input width/height — block dimensions are FIXED at all zoom
 *     levels, so even a meaningful zoom delta must NOT scale dimensions. A
 *     future refactor that swaps the hard-coded constants for `zoom / prevZoom`
 *     would break this test loudly.
 *   - **Centroid math still runs at scale=1**: positions land at the identity
 *     transform — same width/height, same position (no drift). Multiple
 *     top-level nodes test the centroid-around-origin shape; a single
 *     top-level node tests the degenerate case (centroid at the node's own
 *     center).
 *   - **No-op early returns**: missing active card; empty active card; zoom
 *     delta below the 0.001 epsilon; no top-level nodes (everything has a
 *     parentId).
 * - `expandBlueprintToCard`:
 *   - Pushes the blueprint node onto the active card's `nodes` array.
 *   - **RISK #8 pin (ingestion-path migration parity)**: payload node runs
 *     through `migrateCardNode` BEFORE landing on the card. Verified by
 *     handing in a `Monitoring.Terminal` payload and asserting the persisted
 *     node carries `Monitoring.Log` (data-only migration, type preserved as
 *     `'resource'`). Also pin the `Block.Frontend` → `Group.Frontend` branch
 *     (type flips to `'container'`).
 *   - Records an undo snapshot capturing the PRE-expand state (so undo
 *     restores the card without the blueprint node).
 *   - No-op when there is no active card (activeCardId null OR pointing at
 *     a missing card id).
 *
 * @see rf-cards-13
 */

import { produce } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import { pushSnapshot } from '../../snapshot';
import { scaleBlueprintReducers } from '../scale-blueprint';
import type { ExpandedBlueprint } from '../../../../../config/blocks';
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

function makeBlueprintPayload(overrides: Partial<ExpandedBlueprint['node']> = {}): ExpandedBlueprint {
  return {
    node: {
      id: 'bp-node',
      type: 'resource',
      position: { x: 100, y: 200 },
      width: 240,
      height: 160,
      data: { iceType: 'Block.Application', label: 'BP' },
      ...overrides,
    },
  };
}

// -----------------------------------------------------------------------------
// Coalesce-state reset
// -----------------------------------------------------------------------------
//
// `pushSnapshot` keeps `_lastSnapshotAction` at module scope. None of the two
// reducers passes an actionType, but a stale value from another test could in
// theory cause a false-negative if a different reducer's coalescing fired
// against this slice's actions later. The "reset-coalesce" sentinel mirrors
// sibling test files.

beforeEach(() => {
  pushSnapshot({ cards: [], activeCardId: null, history: {} } as CardsState, 'reset-coalesce');
});

// -----------------------------------------------------------------------------
// scaleLayoutForZoom
// -----------------------------------------------------------------------------

describe('scaleLayoutForZoom', () => {
  it('preserves node width and height across a zoom change (RISK #10: scaleX/Y hard-coded to 1)', () => {
    // RISK pin: block dimensions are FIXED at all zoom levels. Even a
    // meaningful zoom delta (1.0 → 1.5) must NOT change widths/heights.
    // A refactor that swaps the constants for `zoom / prevZoom` would
    // make this test fail loudly with `Expected 240, Received 360`.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', { position: { x: 0, y: 0 }, width: 240, height: 160 }),
            makeNode('b', { position: { x: 400, y: 0 }, width: 280, height: 200 }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.scaleLayoutForZoom(draft, {
        type: 'cards/scaleLayoutForZoom',
        payload: { zoom: 1.5, prevZoom: 1.0 },
      } as PayloadAction<{ zoom: number; prevZoom: number }>);
    });
    const a = next.cards[0].nodes.find((n) => n.id === 'a')!;
    const b = next.cards[0].nodes.find((n) => n.id === 'b')!;
    expect(a.width).toBe(240);
    expect(a.height).toBe(160);
    expect(b.width).toBe(280);
    expect(b.height).toBe(200);
  });

  it('runs the centroid math at scale=1 — positions land at the identity transform (no drift)', () => {
    // With scaleX = scaleY = 1, the per-node transform reduces to:
    //   newCx = cx + (nodeCx - cx) * 1 = nodeCx
    //   newCy = cy + (nodeCy - cy) * 1 = nodeCy
    //   newW  = node.width * 1 = node.width
    //   newH  = node.height * 1 = node.height
    //   node.position.x = nodeCx - newW/2 = original position.x
    // So the centroid math still RUNS but produces an identity transform
    // for both positions and sizes. Pin: positions unchanged.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', { position: { x: 10, y: 20 }, width: 240, height: 160 }),
            makeNode('b', { position: { x: 500, y: 600 }, width: 280, height: 200 }),
            makeNode('c', { position: { x: 100, y: 100 }, width: 100, height: 100 }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.scaleLayoutForZoom(draft, {
        type: 'cards/scaleLayoutForZoom',
        payload: { zoom: 1.5, prevZoom: 1.0 },
      } as PayloadAction<{ zoom: number; prevZoom: number }>);
    });
    const a = next.cards[0].nodes.find((n) => n.id === 'a')!;
    const b = next.cards[0].nodes.find((n) => n.id === 'b')!;
    const c = next.cards[0].nodes.find((n) => n.id === 'c')!;
    // Floating-point safe — the math is exact at scale=1, but use
    // toBeCloseTo for paranoia against any future intermediate-rounding drift.
    expect(a.position.x).toBeCloseTo(10);
    expect(a.position.y).toBeCloseTo(20);
    expect(b.position.x).toBeCloseTo(500);
    expect(b.position.y).toBeCloseTo(600);
    expect(c.position.x).toBeCloseTo(100);
    expect(c.position.y).toBeCloseTo(100);
  });

  it('runs the centroid math even when a child has a parentId (only top-level nodes feed the centroid)', () => {
    // Branch: `topNodes = card.nodes.filter((n) => !n.parentId)`. The
    // child node's center is NOT averaged into `cx`/`cy`, but the child's
    // position IS still rewritten by the per-node loop (which iterates
    // ALL nodes, not just top-level). At scale=1 the rewrite is identity,
    // so the child stays put.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('parent', { position: { x: 0, y: 0 }, width: 400, height: 300 }),
            makeNode('child', {
              position: { x: 50, y: 50 },
              width: 100,
              height: 100,
              parentId: 'parent',
            }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.scaleLayoutForZoom(draft, {
        type: 'cards/scaleLayoutForZoom',
        payload: { zoom: 1.5, prevZoom: 1.0 },
      } as PayloadAction<{ zoom: number; prevZoom: number }>);
    });
    const parent = next.cards[0].nodes.find((n) => n.id === 'parent')!;
    const child = next.cards[0].nodes.find((n) => n.id === 'child')!;
    expect(parent.position.x).toBeCloseTo(0);
    expect(parent.position.y).toBeCloseTo(0);
    expect(child.position.x).toBeCloseTo(50);
    expect(child.position.y).toBeCloseTo(50);
    expect(child.width).toBe(100);
    expect(child.height).toBe(100);
  });

  it('is a no-op when no active card is set', () => {
    // Branch: `card` undefined → early return. State unchanged.
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('a')] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.scaleLayoutForZoom(draft, {
        type: 'cards/scaleLayoutForZoom',
        payload: { zoom: 1.5, prevZoom: 1.0 },
      } as PayloadAction<{ zoom: number; prevZoom: number }>);
    });
    expect(next).toEqual(state);
  });

  it('is a no-op when the active card has zero nodes', () => {
    // Branch: `card.nodes.length === 0` → early return. Empty card unchanged.
    const state = makeState({
      cards: [makeCard('c1', { nodes: [] })],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.scaleLayoutForZoom(draft, {
        type: 'cards/scaleLayoutForZoom',
        payload: { zoom: 1.5, prevZoom: 1.0 },
      } as PayloadAction<{ zoom: number; prevZoom: number }>);
    });
    expect(next.cards[0].nodes).toEqual([]);
  });

  it('is a no-op when |zoom - prevZoom| is below the 0.001 epsilon', () => {
    // Branch: `Math.abs(zoom - prevZoom) < 0.001` → early return. The
    // useCanvasViewport hook gates dispatches at ZOOM_STEP * 0.5 (0.025),
    // so this branch should be unreachable in production, but it guards
    // against floating-point jitter on otherwise-equal zoom values.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('a', { position: { x: 10, y: 20 } })],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.scaleLayoutForZoom(draft, {
        type: 'cards/scaleLayoutForZoom',
        payload: { zoom: 1.0001, prevZoom: 1.0 },
      } as PayloadAction<{ zoom: number; prevZoom: number }>);
    });
    // Position untouched — early-return short-circuited before the loop.
    expect(next.cards[0].nodes[0].position).toEqual({ x: 10, y: 20 });
  });

  it('is a no-op when every node has a parentId (no top-level nodes to feed the centroid)', () => {
    // Branch: `topNodes.length === 0` → early return. Two children of an
    // unknown parent (rare but possible after a parent-deletion path that
    // didn't strip parentIds) means there are no top-level nodes to
    // anchor the centroid on. Reducer bails out without running the
    // per-node rewrite loop.
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [
            makeNode('a', { position: { x: 10, y: 10 }, parentId: 'ghost' }),
            makeNode('b', { position: { x: 20, y: 20 }, parentId: 'ghost' }),
          ],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.scaleLayoutForZoom(draft, {
        type: 'cards/scaleLayoutForZoom',
        payload: { zoom: 1.5, prevZoom: 1.0 },
      } as PayloadAction<{ zoom: number; prevZoom: number }>);
    });
    expect(next.cards[0].nodes[0].position).toEqual({ x: 10, y: 10 });
    expect(next.cards[0].nodes[1].position).toEqual({ x: 20, y: 20 });
  });
});

// -----------------------------------------------------------------------------
// expandBlueprintToCard
// -----------------------------------------------------------------------------

describe('expandBlueprintToCard', () => {
  it('appends the blueprint node to the active card', () => {
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('existing')] })],
      activeCardId: 'c1',
    });
    const payload = makeBlueprintPayload({ id: 'bp-app' });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.expandBlueprintToCard(draft, {
        type: 'cards/expandBlueprintToCard',
        payload,
      } as PayloadAction<ExpandedBlueprint>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['existing', 'bp-app']);
  });

  it('migrates Monitoring.Terminal → Monitoring.Log on the blueprint node (RISK #8: ingestion-path parity)', () => {
    // Pin: legacy `Monitoring.Terminal` was consolidated into
    // `Monitoring.Log` at the v5 → v6 bump. Every ingestion path runs the
    // migrator — this is the blueprint-expansion path. iceType migrated;
    // type stays `'resource'` (this branch of the migrator is data-only).
    const state = makeState();
    const payload = makeBlueprintPayload({
      id: 'bp-term',
      data: { iceType: 'Monitoring.Terminal', label: 'Term' },
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.expandBlueprintToCard(draft, {
        type: 'cards/expandBlueprintToCard',
        payload,
      } as PayloadAction<ExpandedBlueprint>);
    });
    const node = next.cards[0].nodes[0];
    expect(node.data.iceType).toBe('Monitoring.Log');
    expect(node.data.label).toBe('Term');
    // Branch: Monitoring.Terminal migration preserves `type` (no flip).
    expect(node.type).toBe('resource');
  });

  it('migrates Block.Frontend → Group.Frontend AND flips type to "container"', () => {
    // The other migration branch: `Cluster.* / Block.*` organizational
    // types become `Group.*` AND the node's `type` is flipped to
    // `'container'`. Pin: type AND iceType BOTH change.
    const state = makeState();
    const payload = makeBlueprintPayload({
      id: 'bp-frontend',
      data: { iceType: 'Block.Frontend', label: 'F' },
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.expandBlueprintToCard(draft, {
        type: 'cards/expandBlueprintToCard',
        payload,
      } as PayloadAction<ExpandedBlueprint>);
    });
    const node = next.cards[0].nodes[0];
    expect(node.data.iceType).toBe('Group.Frontend');
    expect(node.type).toBe('container');
  });

  it('records an undo snapshot capturing the PRE-expand state', () => {
    const state = makeState({
      cards: [
        makeCard('c1', {
          nodes: [makeNode('pre1'), makeNode('pre2')],
        }),
      ],
      activeCardId: 'c1',
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.expandBlueprintToCard(draft, {
        type: 'cards/expandBlueprintToCard',
        payload: makeBlueprintPayload({ id: 'bp-fresh' }),
      } as PayloadAction<ExpandedBlueprint>);
    });
    expect(next.history.c1).toBeDefined();
    expect(next.history.c1.past).toHaveLength(1);
    expect(next.history.c1.past[0].nodes.map((n) => n.id)).toEqual(['pre1', 'pre2']);
    // And the current state has the new node appended.
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['pre1', 'pre2', 'bp-fresh']);
  });

  it('is a no-op (beyond the snapshot) when activeCardId is null', () => {
    // Branch: `card` undefined → early return. The snapshot push runs
    // FIRST, but `pushSnapshot` itself is a no-op when there's no active
    // card (it bails on the same `card` lookup), so the only observable
    // effect here is "history.c1 not created".
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('keep')] })],
      activeCardId: null,
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.expandBlueprintToCard(draft, {
        type: 'cards/expandBlueprintToCard',
        payload: makeBlueprintPayload({ id: 'bp-x' }),
      } as PayloadAction<ExpandedBlueprint>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['keep']);
    expect(next.history.c1).toBeUndefined();
  });

  it('is a no-op when activeCardId points at a missing card id', () => {
    // Branch: `card` undefined (activeCardId set but no matching card) →
    // early return after pushSnapshot. pushSnapshot bails out on the same
    // missing-card lookup, so history stays empty too.
    const state = makeState({
      cards: [makeCard('c1', { nodes: [makeNode('keep')] })],
      activeCardId: 'doesNotExist',
    });
    const next = produce(state, (draft) => {
      scaleBlueprintReducers.expandBlueprintToCard(draft, {
        type: 'cards/expandBlueprintToCard',
        payload: makeBlueprintPayload({ id: 'bp-x' }),
      } as PayloadAction<ExpandedBlueprint>);
    });
    expect(next.cards[0].nodes.map((n) => n.id)).toEqual(['keep']);
    expect(next.history.c1).toBeUndefined();
  });
});
