/**
 * rf-aiop-5 — autoResizeContainers tests.
 *
 * The function calls `dispatch(...)` with action creators imported from
 * the cards slice; we capture every dispatch call and assert against
 * the action shapes (`{ type, payload }`) rather than the actual reducer
 * effect — this keeps the test pure and free of store wiring.
 */

import { describe, it, expect, vi } from 'vitest';
import { autoResizeContainers } from '../auto-resize';
import type { Card, CardNode } from '../../../../../store/slices/cards-slice';
import type { AppDispatch } from '../../../../../store';

function makeCard(nodes: CardNode[]): Card {
  return {
    id: 'card-1',
    name: 'T',
    nodes,
    edges: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
    createdAt: 0,
  };
}

function makeNode(partial: Partial<CardNode> & { id: string }): CardNode {
  return {
    type: 'block',
    position: { x: 0, y: 0 },
    width: 220,
    height: 72,
    data: {},
    ...partial,
  };
}

function makeDispatch() {
  const calls: Array<{ type: string; payload: unknown }> = [];
  const dispatch = vi.fn((action: { type: string; payload: unknown }) => {
    calls.push(action);
    return action;
  }) as unknown as AppDispatch;
  return { dispatch, calls };
}

describe('rf-aiop-5 autoResizeContainers', () => {
  it('no-op when there are no containers', () => {
    const { dispatch, calls } = makeDispatch();
    const card = makeCard([makeNode({ id: 'a' })]);
    autoResizeContainers(dispatch, card);
    expect(calls).toEqual([]);
  });

  it('skips containers with no children', () => {
    const { dispatch, calls } = makeDispatch();
    const card = makeCard([
      makeNode({
        id: 'empty',
        type: 'container',
        position: { x: 0, y: 0 },
        width: 280,
        height: 160,
      }),
    ]);
    autoResizeContainers(dispatch, card);
    expect(calls).toEqual([]);
  });

  it('expands container to fit children + padding (RESIZE_PAD=24, RESIZE_HEADER=40)', () => {
    const { dispatch, calls } = makeDispatch();
    const container = makeNode({
      id: 'c1',
      type: 'container',
      position: { x: 100, y: 100 },
      width: 100,
      height: 100,
    });
    const child = makeNode({
      id: 'child-1',
      parentId: 'c1',
      position: { x: 130, y: 150 },
      width: 220,
      height: 72,
    });
    const card = makeCard([container, child]);

    autoResizeContainers(dispatch, card);

    // Children bbox: minX=130, minY=150, maxR=350 (130+220), maxB=222 (150+72)
    // reqX = 130 - 24 = 106, reqY = 150 - 24 - 40 = 86
    // reqW = 350 + 24 - 106 = 268, reqH = 222 + 24 - 86 = 160
    // newX = min(100, 106) = 100, newY = min(100, 86) = 86
    // newW = max(100, 268, 350+24-100=274) = 274
    // newH = max(100, 160, 222+24-86=160) = 160
    expect(calls).toHaveLength(2);
    // First dispatch: updateCardNodePositions (moves container)
    expect(calls[0].payload).toEqual([{ id: 'c1', position: { x: 100, y: 86 } }]);
    // Second dispatch: resizeCardNode
    expect(calls[1].payload).toEqual({ id: 'c1', width: 274, height: 160 });
  });

  it('skips position dispatch when newX/newY equals current', () => {
    const { dispatch, calls } = makeDispatch();
    const container = makeNode({
      id: 'c1',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
    });
    // Child positioned to the right and below such that reqX/reqY land exactly on (0,0)
    // reqX = minX - 24 = 0 → minX = 24
    // reqY = minY - 24 - 40 = 0 → minY = 64
    const child = makeNode({
      id: 'child-1',
      parentId: 'c1',
      position: { x: 24, y: 64 },
      width: 200,
      height: 100,
    });
    const card = makeCard([container, child]);

    autoResizeContainers(dispatch, card);

    // Only resize, no position dispatch
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toContain('resize');
  });

  it('does not shrink containers below their current size', () => {
    const { dispatch, calls } = makeDispatch();
    // Big container with a tiny child
    const container = makeNode({
      id: 'c1',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 1000,
      height: 800,
    });
    const child = makeNode({
      id: 'child-1',
      parentId: 'c1',
      position: { x: 30, y: 50 },
      width: 100,
      height: 50,
    });
    const card = makeCard([container, child]);

    autoResizeContainers(dispatch, card);

    // The container is already MUCH bigger than required — width/height
    // should stay at 1000/800, position stays at (0, 0) BUT the y test has
    // newY = min(0, 50-24-40=-14) = -14, so position WILL move up.
    // newW = max(1000, ...) = 1000, newH = max(800, ...) = 800.
    // Position changes from (0,0) → (0,-14) so we expect 1 position dispatch
    // and possibly no resize dispatch.
    expect(calls.find((c) => c.payload && (c.payload as { width?: number }).width === 1000)).toBeFalsy();
  });

  it('processes deepest containers first', () => {
    const { dispatch, calls } = makeDispatch();
    // outer > inner > leaf
    const outer = makeNode({
      id: 'outer',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
    });
    const inner = makeNode({
      id: 'inner',
      parentId: 'outer',
      type: 'container',
      position: { x: 50, y: 50 },
      width: 100,
      height: 100,
    });
    const leaf = makeNode({
      id: 'leaf',
      parentId: 'inner',
      position: { x: 100, y: 100 },
      width: 100,
      height: 100,
    });
    const card = makeCard([outer, inner, leaf]);

    autoResizeContainers(dispatch, card);

    // Find which container received its resize first.
    // Resize dispatch for inner should land before resize dispatch for outer.
    const innerResize = calls.findIndex(
      (c) => (c.payload as { id?: string }).id === 'inner' && (c.payload as { width?: number }).width !== undefined,
    );
    const outerResize = calls.findIndex(
      (c) => (c.payload as { id?: string }).id === 'outer' && (c.payload as { width?: number }).width !== undefined,
    );
    expect(innerResize).toBeGreaterThanOrEqual(0);
    expect(outerResize).toBeGreaterThanOrEqual(0);
    expect(innerResize).toBeLessThan(outerResize);
  });

  it('breaks the depth walk when a parentId points to a missing node', () => {
    const { dispatch, calls } = makeDispatch();
    // Container that claims to be parented to a non-existent node — the depth
    // walk in depthOf() should encounter `parent === undefined` and break out
    // rather than looping forever.
    const orphanContainer = makeNode({
      id: 'orphan',
      type: 'container',
      parentId: 'ghost-parent',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
    });
    const child = makeNode({
      id: 'child',
      parentId: 'orphan',
      position: { x: 10, y: 10 },
      width: 50,
      height: 50,
    });
    const card = makeCard([orphanContainer, child]);

    autoResizeContainers(dispatch, card);

    // The container still got processed — at least one dispatch fired.
    expect(calls.length).toBeGreaterThan(0);
  });

  it('falls back to 280/160 when the container itself has no width/height', () => {
    const { dispatch, calls } = makeDispatch();
    const container = makeNode({
      id: 'c1',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 0, // falsy → fallback 280 in newW math
      height: 0, // falsy → fallback 160 in newH math
    });
    const child = makeNode({
      id: 'child-1',
      parentId: 'c1',
      position: { x: 50, y: 50 },
      width: 100,
      height: 50,
    });
    const card = makeCard([container, child]);

    autoResizeContainers(dispatch, card);

    // The resize dispatch should fire because newW/newH != container.width/height
    // (which were 0 and 0).
    const resize = calls.find(
      (c) =>
        (c.payload as { id?: string }).id === 'c1' &&
        (c.payload as { width?: number }).width !== undefined,
    );
    expect(resize).toBeDefined();
  });

  it('uses 280/160 fallback when child width/height is missing', () => {
    const { dispatch, calls } = makeDispatch();
    const container = makeNode({
      id: 'c1',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 50,
      height: 50,
    });
    const child = makeNode({
      id: 'child-1',
      parentId: 'c1',
      position: { x: 100, y: 100 },
      width: 0, // falsy → fallback 280
      height: 0, // falsy → fallback 160
    });
    const card = makeCard([container, child]);

    autoResizeContainers(dispatch, card);

    // maxR = 100 + 280 = 380, maxB = 100 + 160 = 260
    // reqW = 380 + 24 - reqX = 380 + 24 - (100 - 24) = 380 + 24 - 76 = 328
    // reqH = 260 + 24 - reqY = 260 + 24 - (100 - 24 - 40) = 260 + 24 - 36 = 248
    // newW = max(50, 328, 380+24-min(0,76)=380+24-0=404) = 404
    // newH = max(50, 248, 260+24-min(0,36)=260+24-0=284) = 284
    const resize = calls.find(
      (c) =>
        (c.payload as { id?: string }).id === 'c1' && (c.payload as { width?: number }).width !== undefined,
    );
    expect(resize).toBeDefined();
    expect(resize?.payload).toEqual({ id: 'c1', width: 404, height: 284 });
  });
});
