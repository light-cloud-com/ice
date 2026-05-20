/**
 * Packing helpers — fixture-driven tests for the grid placement passes.
 *
 * Both helpers MUTATE `relPos` / `containerSize` maps; tests construct the
 * input maps, call the helper, and assert the post-state.
 *
 * Key invariants:
 *  - gridPackKids: cols ≈ sqrt(N * avgH/avgW); cursor advances row-by-row
 *    with GRID_STEP gaps; container sized to max(content + paddings,
 *    visualMin).
 *  - repackIsolatedTopLevel: returns early when there are no isolated or
 *    no flow roots; flow bounding box drives where the isolated grid
 *    starts; sort puts tallest (TB) / widest (LR) first.
 */

import { describe, it, expect } from 'vitest';
import { gridPackKids, repackIsolatedTopLevel } from '../packing';
import type { LayoutNode, LayoutEdge } from '../types';

const GRID_STEP = 40;
const RANK_SEP = 80;

function mk(id: string, iceType: string = 'Compute.Container', width = 240, height = 160): LayoutNode {
  return {
    id,
    type: 'resource',
    iceType,
    label: id,
    width,
    height,
    x: 0,
    y: 0,
    data: {},
  };
}

describe('gridPackKids', () => {
  it('packs N cards into roughly sqrt(N) columns', () => {
    // 4 same-shape cards (240x160). avgH/avgW ≈ 0.667.
    // cols = round(sqrt(4 * 0.667)) = round(1.63) = 2.
    const owner = mk('owner', 'Group.Custom');
    const kids = ['a', 'b', 'c', 'd'].map((id) => mk(id));
    const nodeMap = new Map<string, LayoutNode>([owner, ...kids].map((n) => [n.id, n] as const));
    const containerSize = new Map<string, { width: number; height: number }>();
    const relPos = new Map<string, { x: number; y: number }>();

    gridPackKids(['a', 'b', 'c', 'd'], 'owner', nodeMap, containerSize, relPos);

    // Row 1: a at (40, 80), b at (40+240+40, 80) = (320, 80)
    // Row 2: c at (40, 80+160+40) = (40, 280), d at (320, 280)
    expect(relPos.get('a')).toEqual({ x: GRID_STEP, y: GRID_STEP * 2 });
    expect(relPos.get('b')).toEqual({ x: GRID_STEP + 240 + GRID_STEP, y: GRID_STEP * 2 });
    expect(relPos.get('c')).toEqual({ x: GRID_STEP, y: GRID_STEP * 2 + 160 + GRID_STEP });
    expect(relPos.get('d')).toEqual({ x: GRID_STEP + 240 + GRID_STEP, y: GRID_STEP * 2 + 160 + GRID_STEP });
  });

  it('sets owner containerSize to content-bound + padding (above visualMin)', () => {
    const owner = mk('owner', 'Group.Custom');
    const kids = ['a', 'b', 'c', 'd'].map((id) => mk(id));
    const nodeMap = new Map<string, LayoutNode>([owner, ...kids].map((n) => [n.id, n] as const));
    const containerSize = new Map<string, { width: number; height: number }>();
    const relPos = new Map<string, { x: number; y: number }>();

    gridPackKids(['a', 'b', 'c', 'd'], 'owner', nodeMap, containerSize, relPos);

    // 2 cols, last col rightEdge = 320 + 240 = 560 → width = 560 + 40 = 600
    // 2 rows, lastBottom = 280 + 160 = 440 → height = 440 + 40 = 480
    const size = containerSize.get('owner')!;
    expect(size.width).toBe(560 + GRID_STEP);
    expect(size.height).toBe(440 + GRID_STEP);
  });

  it('Private Network owner: containerSize floored to PN visualMin (560x320)', () => {
    // Single 50x50 child means a tiny content box; PN visualMin should kick in.
    const owner = mk('pn', 'Network.PrivateNetwork');
    const a = mk('a', 'Compute.Container', 50, 50);
    const b = mk('b', 'Compute.Container', 50, 50);
    const nodeMap = new Map<string, LayoutNode>([owner, a, b].map((n) => [n.id, n] as const));
    const containerSize = new Map<string, { width: number; height: number }>();
    const relPos = new Map<string, { x: number; y: number }>();

    gridPackKids(['a', 'b'], 'pn', nodeMap, containerSize, relPos);

    const size = containerSize.get('pn')!;
    // Content width: cols=round(sqrt(2 * 1)) = round(1.414) = 1.
    // 1 col → rightEdge after b = 40+50 = 90 → width 90+40 = 130 → max(130, 560) = 560.
    // 1 col, 2 rows, lastBottom = 80+50+40+50 = 220 → height 220+40 = 260 → max(260, 320) = 320.
    expect(size.width).toBe(560);
    expect(size.height).toBe(320);
  });

  it('uses containerSize entry for an already-packed inner container as the kid size', () => {
    const owner = mk('owner', 'Group.Custom');
    const inner = mk('inner', 'Group.Custom');
    const sib = mk('sib');
    const nodeMap = new Map<string, LayoutNode>([owner, inner, sib].map((n) => [n.id, n] as const));
    const containerSize = new Map<string, { width: number; height: number }>([['inner', { width: 600, height: 400 }]]);
    const relPos = new Map<string, { x: number; y: number }>();

    gridPackKids(['inner', 'sib'], 'owner', nodeMap, containerSize, relPos);

    // avgW = (600+240)/2 = 420, avgH = (400+160)/2 = 280.
    // cols = round(sqrt(2 * 280/420)) = round(sqrt(1.333)) = round(1.155) = 1.
    // 1 col: inner at (40, 80), sib at (40, 80+400+40) = (40, 520).
    expect(relPos.get('inner')).toEqual({ x: GRID_STEP, y: GRID_STEP * 2 });
    expect(relPos.get('sib')).toEqual({ x: GRID_STEP, y: GRID_STEP * 2 + 400 + GRID_STEP });
  });

  it('one kid: single-cell layout, container sized to max(kid+pad, visualMin)', () => {
    const owner = mk('owner', 'Group.Custom');
    const kid = mk('k');
    const nodeMap = new Map<string, LayoutNode>([owner, kid].map((n) => [n.id, n] as const));
    const containerSize = new Map<string, { width: number; height: number }>();
    const relPos = new Map<string, { x: number; y: number }>();

    gridPackKids(['k'], 'owner', nodeMap, containerSize, relPos);

    expect(relPos.get('k')).toEqual({ x: GRID_STEP, y: GRID_STEP * 2 });
    const size = containerSize.get('owner')!;
    // width: max(40+240+40, 240) = 320 ; height: max(80+160+40, 150) = 280
    expect(size.width).toBe(GRID_STEP + 240 + GRID_STEP);
    expect(size.height).toBe(GRID_STEP * 2 + 160 + GRID_STEP);
  });

  it('owner with empty iceType (`""`) falls through to the generic MIN_CONTAINER floor', () => {
    // Pin the `(... .iceType as string) || ''` fallback branch.
    const owner: LayoutNode = {
      id: 'owner',
      type: 'container',
      iceType: '',
      label: 'owner',
      width: 240,
      height: 160,
      x: 0,
      y: 0,
      data: {},
    };
    const k1 = mk('k1', 'Compute.Container', 50, 50);
    const k2 = mk('k2', 'Compute.Container', 50, 50);
    const nodeMap = new Map<string, LayoutNode>([owner, k1, k2].map((n) => [n.id, n] as const));
    const containerSize = new Map<string, { width: number; height: number }>();
    const relPos = new Map<string, { x: number; y: number }>();

    gridPackKids(['k1', 'k2'], 'owner', nodeMap, containerSize, relPos);

    // visualMin = MIN_CONTAINER for empty iceType → 240×150.
    const size = containerSize.get('owner')!;
    expect(size.width).toBeGreaterThanOrEqual(240);
    expect(size.height).toBeGreaterThanOrEqual(150);
  });
});

describe('repackIsolatedTopLevel', () => {
  function ce(s: string, t: string): LayoutEdge {
    return { source: s, target: t, relationship: 'connects_to' };
  }

  it('no-ops when there are no isolated roots', () => {
    // a connects to b — both are flow.
    const a = mk('a');
    const b = mk('b');
    const nodeMap = new Map<string, LayoutNode>([a, b].map((n) => [n.id, n] as const));
    const containerSize = new Map<string, { width: number; height: number }>();
    const relPos = new Map<string, { x: number; y: number }>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 300, y: 0 }],
    ]);
    const before = JSON.stringify(Array.from(relPos.entries()));

    repackIsolatedTopLevel(['a', 'b'], [ce('a', 'b')], new Map(), nodeMap, containerSize, relPos, 'TB', 40);

    expect(JSON.stringify(Array.from(relPos.entries()))).toBe(before);
  });

  it('no-ops when there are no flow roots (all isolated)', () => {
    // No flow edges at all — both nodes are isolated.
    const a = mk('a');
    const b = mk('b');
    const nodeMap = new Map<string, LayoutNode>([a, b].map((n) => [n.id, n] as const));
    const relPos = new Map<string, { x: number; y: number }>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 300, y: 0 }],
    ]);
    const before = JSON.stringify(Array.from(relPos.entries()));

    repackIsolatedTopLevel(['a', 'b'], [], new Map(), nodeMap, new Map(), relPos, 'TB', 40);

    expect(JSON.stringify(Array.from(relPos.entries()))).toBe(before);
  });

  it('TB rankdir: isolated grid starts maxY+RANK_SEP below the flow bounding box', () => {
    // a -> b is the flow; iso1, iso2 are isolated.
    const a = mk('a');
    const b = mk('b');
    const i1 = mk('i1');
    const i2 = mk('i2');
    const nodeMap = new Map<string, LayoutNode>([a, b, i1, i2].map((n) => [n.id, n] as const));
    const relPos = new Map<string, { x: number; y: number }>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 0, y: 200 }],
    ]);

    repackIsolatedTopLevel(['a', 'b', 'i1', 'i2'], [ce('a', 'b')], new Map(), nodeMap, new Map(), relPos, 'TB', 40);

    // Flow bbox: minX=0, minY=0, maxX=240, maxY=360.
    // First isolated row starts at y = 360 + RANK_SEP = 440.
    // Sort tallest-first: both 160, ties keep input order.
    const i1Pos = relPos.get('i1')!;
    expect(i1Pos.y).toBe(360 + RANK_SEP);
  });

  it('LR rankdir: isolated grid starts maxX+RANK_SEP right of the flow bounding box', () => {
    const a = mk('a');
    const b = mk('b');
    const i1 = mk('i1');
    const nodeMap = new Map<string, LayoutNode>([a, b, i1].map((n) => [n.id, n] as const));
    const relPos = new Map<string, { x: number; y: number }>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 300, y: 0 }],
    ]);

    repackIsolatedTopLevel(['a', 'b', 'i1'], [ce('a', 'b')], new Map(), nodeMap, new Map(), relPos, 'LR', 40);

    // Flow bbox: maxX = 540 (300 + 240).
    expect(relPos.get('i1')!.x).toBe(540 + RANK_SEP);
  });

  it('sorts isolated nodes tallest-first under TB', () => {
    const a = mk('a');
    const b = mk('b');
    const tiny = mk('tiny', 'Compute.Container', 100, 100);
    const tall = mk('tall', 'Compute.Container', 100, 400);
    const nodeMap = new Map<string, LayoutNode>([a, b, tiny, tall].map((n) => [n.id, n] as const));
    const relPos = new Map<string, { x: number; y: number }>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 0, y: 200 }],
    ]);

    repackIsolatedTopLevel(['a', 'b', 'tiny', 'tall'], [ce('a', 'b')], new Map(), nodeMap, new Map(), relPos, 'TB', 40);

    // tall should be placed before tiny (sort puts taller first).
    // Both isolated nodes start at the same y (one row), but different x.
    // Tall placed first (cursorX = 0), tiny placed second (cursorX = 0+100+40 = 140).
    const yStart = 360 + RANK_SEP;
    expect(relPos.get('tall')).toEqual({ x: 0, y: yStart });
    expect(relPos.get('tiny')).toEqual({ x: 100 + 40, y: yStart });
  });

  it('sorts isolated nodes widest-first under LR', () => {
    const a = mk('a');
    const b = mk('b');
    const slim = mk('slim', 'Compute.Container', 100, 100);
    const wide = mk('wide', 'Compute.Container', 400, 100);
    const nodeMap = new Map<string, LayoutNode>([a, b, slim, wide].map((n) => [n.id, n] as const));
    const relPos = new Map<string, { x: number; y: number }>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 300, y: 0 }],
    ]);

    repackIsolatedTopLevel(['a', 'b', 'slim', 'wide'], [ce('a', 'b')], new Map(), nodeMap, new Map(), relPos, 'LR', 40);

    // wide placed first (cursorY = 0), slim placed second (cursorY = 0+100+40).
    const xStart = 540 + RANK_SEP;
    expect(relPos.get('wide')).toEqual({ x: xStart, y: 0 });
    expect(relPos.get('slim')).toEqual({ x: xStart, y: 100 + 40 });
  });

  it('a flow root with no relPos entry is skipped in bbox calc', () => {
    // edge case: flow root that for some reason isn't in relPos — bbox shouldn't NaN.
    const a = mk('a');
    const b = mk('b');
    const i1 = mk('i1');
    const nodeMap = new Map<string, LayoutNode>([a, b, i1].map((n) => [n.id, n] as const));
    const relPos = new Map<string, { x: number; y: number }>([['b', { x: 0, y: 100 }]]);
    // a is a flow root but has no relPos entry; bbox is built from b only.

    repackIsolatedTopLevel(['a', 'b', 'i1'], [ce('a', 'b')], new Map(), nodeMap, new Map(), relPos, 'TB', 40);

    // i1 was placed; bbox derived from b: maxY = 100+160 = 260; i1.y = 260 + RANK_SEP = 340.
    expect(relPos.get('i1')!.y).toBe(260 + RANK_SEP);
  });

  it('returns silently when none of the flow roots have a relPos entry', () => {
    // minX stays Infinity → !isFinite → early return.
    const a = mk('a');
    const b = mk('b');
    const i1 = mk('i1');
    const nodeMap = new Map<string, LayoutNode>([a, b, i1].map((n) => [n.id, n] as const));
    const relPos = new Map<string, { x: number; y: number }>();

    repackIsolatedTopLevel(['a', 'b', 'i1'], [ce('a', 'b')], new Map(), nodeMap, new Map(), relPos, 'TB', 40);

    // i1 was NOT placed.
    expect(relPos.has('i1')).toBe(false);
  });

  it('a child whose parent is in the flow set is treated as flow (recursive)', () => {
    // Containment: `p -> c`. p has a flow edge with `q`. p is flow.
    // i1 is purely isolated.
    const p = mk('p');
    const c = mk('c', 'Compute.Container', 100, 100);
    const q = mk('q');
    const i1 = mk('i1');
    const nodeMap = new Map<string, LayoutNode>([p, c, q, i1].map((n) => [n.id, n] as const));
    const childrenOf = new Map<string, string[]>([['p', ['c']]]);
    const relPos = new Map<string, { x: number; y: number }>([
      ['p', { x: 0, y: 0 }],
      ['q', { x: 300, y: 0 }],
    ]);

    repackIsolatedTopLevel(['p', 'q', 'i1'], [ce('p', 'q')], childrenOf, nodeMap, new Map(), relPos, 'TB', 40);

    // i1 should be placed below the (p, q) bbox.
    expect(relPos.has('i1')).toBe(true);
  });

  it('uses post-layout containerSize over nodeMap for isolated-root sizing', () => {
    // Mirrors the `cs` shrink-wrap branch: PN started at 706 stored, post-
    // layout shrunk to 320; sizeOf must use 320.
    const a = mk('a');
    const b = mk('b');
    const pn = mk('pn', 'Network.PrivateNetwork', 560, 706);
    const nodeMap = new Map<string, LayoutNode>([a, b, pn].map((n) => [n.id, n] as const));
    const containerSize = new Map<string, { width: number; height: number }>([['pn', { width: 560, height: 320 }]]);
    const relPos = new Map<string, { x: number; y: number }>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 0, y: 200 }],
    ]);

    repackIsolatedTopLevel(['a', 'b', 'pn'], [ce('a', 'b')], new Map(), nodeMap, containerSize, relPos, 'TB', 40);

    // Just verify pn was placed (no NaN, no skip).
    expect(relPos.get('pn')).toBeDefined();
    expect(relPos.get('pn')!.y).toBeGreaterThan(0);
  });

  it('TB row wrap: a kid whose right edge would exceed gridWidth wraps to next row', () => {
    // Force narrow flow bbox to make the wrap happen.
    const a = mk('a', 'Compute.Container', 100, 100);
    const b = mk('b', 'Compute.Container', 100, 100);
    // 4 isolated kids of width 100, gap 40 → row capacity matters.
    const k1 = mk('k1', 'Compute.Container', 100, 100);
    const k2 = mk('k2', 'Compute.Container', 100, 100);
    const k3 = mk('k3', 'Compute.Container', 100, 100);
    const k4 = mk('k4', 'Compute.Container', 100, 100);
    const nodeMap = new Map<string, LayoutNode>([a, b, k1, k2, k3, k4].map((n) => [n.id, n] as const));
    const relPos = new Map<string, { x: number; y: number }>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 0, y: 100 }],
    ]);

    repackIsolatedTopLevel(
      ['a', 'b', 'k1', 'k2', 'k3', 'k4'],
      [ce('a', 'b')],
      new Map(),
      nodeMap,
      new Map(),
      relPos,
      'TB',
      40,
    );

    // gridCols = max(3, ceil(sqrt(4))) = 3. avgW=100; targetGridWidth = 3 * 140 = 420.
    // Flow bbox: minX=0, maxX=100 → flow width = 100. gridWidth = max(100, 420) = 420.
    // Row 1 fits 3 kids (3 * 100 + 2 * 40 = 380 < 420).
    // Row 2 has 1 kid.
    // All 4 must be placed without overlap.
    const xs = ['k1', 'k2', 'k3', 'k4'].map((id) => relPos.get(id)!);
    expect(xs.length).toBe(4);
    // First and fourth on different rows.
    expect(xs[3].y).toBeGreaterThan(xs[0].y);
  });

  it('LR col wrap: similar shape on column axis', () => {
    const a = mk('a', 'Compute.Container', 100, 100);
    const b = mk('b', 'Compute.Container', 100, 100);
    const k1 = mk('k1', 'Compute.Container', 100, 100);
    const k2 = mk('k2', 'Compute.Container', 100, 100);
    const k3 = mk('k3', 'Compute.Container', 100, 100);
    const k4 = mk('k4', 'Compute.Container', 100, 100);
    const nodeMap = new Map<string, LayoutNode>([a, b, k1, k2, k3, k4].map((n) => [n.id, n] as const));
    const relPos = new Map<string, { x: number; y: number }>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 100, y: 0 }],
    ]);

    repackIsolatedTopLevel(
      ['a', 'b', 'k1', 'k2', 'k3', 'k4'],
      [ce('a', 'b')],
      new Map(),
      nodeMap,
      new Map(),
      relPos,
      'LR',
      40,
    );

    const positions = ['k1', 'k2', 'k3', 'k4'].map((id) => relPos.get(id)!);
    expect(positions.length).toBe(4);
    // Last kid on a different column than the first.
    expect(positions[3].x).toBeGreaterThan(positions[0].x);
  });

  it('shared child via two parent chains: checkFlow cache-hit branch fires', () => {
    // p1 and p2 both list `shared` as a child. When we descend p1's subtree
    // we cache shared→true; when descending p2's subtree, the cache is hit
    // and the early-return branch (`if (cached !== undefined) return cached`)
    // executes.
    const p1 = mk('p1');
    const p2 = mk('p2');
    const shared = mk('shared');
    const q = mk('q');
    const nodeMap = new Map<string, LayoutNode>([p1, p2, shared, q].map((n) => [n.id, n] as const));
    const childrenOf = new Map<string, string[]>([
      ['p1', ['shared']],
      ['p2', ['shared']],
    ]);
    const relPos = new Map<string, { x: number; y: number }>([
      ['p1', { x: 0, y: 0 }],
      ['q', { x: 300, y: 0 }],
    ]);

    // p1 has flow (via the shared edge to q).
    repackIsolatedTopLevel(['p1', 'p2', 'q'], [ce('shared', 'q')], childrenOf, nodeMap, new Map(), relPos, 'TB', 40);
    // p2 is processed AFTER p1; when checkFlow walks p2's subtree, it hits
    // shared which is already cached as true — both p1 and p2 classified as
    // flow roots, so no isolated → early return.
    // Pin the early-return outcome (no isolated were repacked).
    expect(relPos.has('p2')).toBe(false);
  });
});
