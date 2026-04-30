/**
 * rf-canv-4 — pure container-bounds geometry regression.
 *
 * The four exports lifted out of `svg-canvas.tsx` (`calculateContainerBounds`,
 * `recalculateAncestorBounds`, `expandToFitChildren`, `clampNodeToParent`)
 * — plus the `CONTAINER_HEADER_H` / `CONTAINER_PAD` aliases — implement
 * the canvas's container-resize math. Each test below pins one slice of
 * the verbatim semantics so the orchestrator's thin wrappers can keep
 * delegating to these utils without subtly drifting.
 *
 * No React, no Redux — synthetic CanvasNode arrays + bare nodeStates
 * Maps only.
 */

import { describe, it, expect } from 'vitest';

import {
  CONTAINER_PADDING,
  HEADER_HEIGHT,
  MIN_CONTAINER_HEIGHT,
  MIN_CONTAINER_WIDTH,
} from '../../../../config/canvas-constants';
import type { CanvasNode } from '../../components/types';
import {
  calculateContainerBounds,
  clampNodeToParent,
  CONTAINER_HEADER_H,
  CONTAINER_PAD,
  expandToFitChildren,
  recalculateAncestorBounds,
} from '../container-bounds';

/** Minimal CanvasNode factory — only the fields these utils read. */
function node(overrides: Partial<CanvasNode> & Pick<CanvasNode, 'id'>): CanvasNode {
  return {
    type: 'container',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    label: overrides.id,
    data: {},
    parentId: null,
    ...overrides,
  };
}

describe('CONTAINER_HEADER_H / CONTAINER_PAD re-exports', () => {
  it('re-exports HEADER_HEIGHT as CONTAINER_HEADER_H', () => {
    expect(CONTAINER_HEADER_H).toBe(HEADER_HEIGHT);
  });

  it('re-exports CONTAINER_PADDING as CONTAINER_PAD', () => {
    expect(CONTAINER_PAD).toBe(CONTAINER_PADDING);
  });
});

describe('calculateContainerBounds', () => {
  it('returns null when the container is not in visibleNodes', () => {
    const nodes = [node({ id: 'a' })];
    expect(calculateContainerBounds(nodes, 'missing', new Map())).toBeNull();
  });

  it('returns null when the container is folded', () => {
    const nodes = [
      node({ id: 'parent', data: { folded: true }, width: 300, height: 200 }),
      node({ id: 'child', parentId: 'parent', x: 10, y: 60, width: 50, height: 30 }),
    ];
    expect(calculateContainerBounds(nodes, 'parent', new Map())).toBeNull();
  });

  it('returns null when the container has no children', () => {
    const nodes = [node({ id: 'parent', width: 300, height: 200 })];
    expect(calculateContainerBounds(nodes, 'parent', new Map())).toBeNull();
  });

  it('returns the existing parent bounds when one child fits inside', () => {
    // A 300x200 parent at (0,0) is way larger than its 50x30 child at
    // (CONTAINER_PAD, CONTAINER_PAD + CONTAINER_HEADER_H). Required
    // bounds are entirely within the current bounds, so the union ===
    // the current bounds and `changed` is false.
    const nodes = [
      node({ id: 'parent', x: 0, y: 0, width: 300, height: 200 }),
      node({
        id: 'child',
        parentId: 'parent',
        x: CONTAINER_PAD,
        y: CONTAINER_PAD + CONTAINER_HEADER_H,
        width: 50,
        height: 30,
      }),
    ];
    const result = calculateContainerBounds(nodes, 'parent', new Map());
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      changed: false,
    });
  });

  it('expands the parent to fit a child sticking out to the right and bottom', () => {
    // Child at (250, 150) with size 100x80 extends past the parent's
    // 300x200 bounds — required right = 350 + PAD, required bottom = 230 + PAD.
    const nodes = [
      node({ id: 'parent', x: 0, y: 0, width: 300, height: 200 }),
      node({ id: 'child', parentId: 'parent', x: 250, y: 150, width: 100, height: 80 }),
    ];
    const result = calculateContainerBounds(nodes, 'parent', new Map());
    expect(result).not.toBeNull();
    expect(result!.x).toBe(0);
    expect(result!.y).toBe(0);
    expect(result!.width).toBe(350 + CONTAINER_PAD);
    expect(result!.height).toBe(230 + CONTAINER_PAD);
    expect(result!.changed).toBe(true);
  });

  it('expands the parent to fit a child sticking out to the left and top', () => {
    // Child at (-30, 5) means required left = -30 - PAD and required top
    // = 5 - PAD - HEADER. Both push the parent's x/y negative.
    const nodes = [
      node({ id: 'parent', x: 0, y: 0, width: 300, height: 200 }),
      node({ id: 'child', parentId: 'parent', x: -30, y: 5, width: 50, height: 30 }),
    ];
    const result = calculateContainerBounds(nodes, 'parent', new Map());
    expect(result).not.toBeNull();
    expect(result!.x).toBe(-30 - CONTAINER_PAD);
    expect(result!.y).toBe(5 - CONTAINER_PAD - CONTAINER_HEADER_H);
    expect(result!.changed).toBe(true);
  });

  it('uses pending nodeStates entries to override underlying child positions', () => {
    // The canvas-node child sits comfortably inside the parent, but a
    // pending state moves it far to the right — the bounds must reflect
    // the pending position, not the underlying canvas-node.
    const nodes = [
      node({ id: 'parent', x: 0, y: 0, width: 300, height: 200 }),
      node({ id: 'child', parentId: 'parent', x: 50, y: 80, width: 40, height: 30 }),
    ];
    const pending = new Map([
      ['child', { x: 500, y: 80, width: 40, height: 30 }],
    ]);
    const result = calculateContainerBounds(nodes, 'parent', pending);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(540 + CONTAINER_PAD);
    expect(result!.changed).toBe(true);
  });

  it('uses pending nodeStates for the container itself', () => {
    // If the container's pending state is bigger than its canvas-node
    // size, the union takes the pending one — and `changed` compares
    // against pending, so a no-op walk yields `changed: false`.
    const nodes = [
      node({ id: 'parent', x: 0, y: 0, width: 200, height: 100 }),
      node({
        id: 'child',
        parentId: 'parent',
        x: CONTAINER_PAD,
        y: CONTAINER_PAD + CONTAINER_HEADER_H,
        width: 30,
        height: 20,
      }),
    ];
    const pending = new Map([
      ['parent', { x: 0, y: 0, width: 800, height: 600 }],
    ]);
    const result = calculateContainerBounds(nodes, 'parent', pending);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(800);
    expect(result!.height).toBe(600);
    expect(result!.changed).toBe(false);
  });

  it('clamps width/height to MIN_CONTAINER_WIDTH / MIN_CONTAINER_HEIGHT', () => {
    // A parent + child both tiny — the union would be smaller than the
    // floors, so the floor clamp kicks in.
    const nodes = [
      node({ id: 'parent', x: 0, y: 0, width: 10, height: 10 }),
      node({
        id: 'child',
        parentId: 'parent',
        x: CONTAINER_PAD,
        y: CONTAINER_PAD + CONTAINER_HEADER_H,
        width: 10,
        height: 5,
      }),
    ];
    const result = calculateContainerBounds(nodes, 'parent', new Map());
    expect(result).not.toBeNull();
    expect(result!.width).toBe(MIN_CONTAINER_WIDTH);
    expect(result!.height).toBe(MIN_CONTAINER_HEIGHT);
  });

  it('expands to fit multiple children whose bounding box is the union of all', () => {
    // Three children at scattered positions — bounding box is min/max
    // of all of them. With min y=50 the requiredTop = 50 - PAD - HEADER
    // which is negative, so the parent's top edge shifts up too.
    const nodes = [
      node({ id: 'parent', x: 0, y: 0, width: 300, height: 200 }),
      node({ id: 'c1', parentId: 'parent', x: 350, y: 50, width: 30, height: 30 }),
      node({ id: 'c2', parentId: 'parent', x: 100, y: 250, width: 30, height: 30 }),
      node({ id: 'c3', parentId: 'parent', x: 80, y: 100, width: 30, height: 30 }),
    ];
    const result = calculateContainerBounds(nodes, 'parent', new Map());
    expect(result).not.toBeNull();
    // childMinX=80, requiredLeft=80-PAD=60 — but parent.x (0) < 60, so x stays 0.
    // childMinY=50, requiredTop=50-PAD-HEADER (negative) — pushes y up.
    expect(result!.x).toBe(0);
    expect(result!.y).toBe(50 - CONTAINER_PAD - CONTAINER_HEADER_H);
    // Right edge: max(parent.x+parent.width=300, childMaxR+PAD=380+PAD).
    expect(result!.width).toBe(380 + CONTAINER_PAD);
    // Bottom edge: max(parent.y+parent.height=200, childMaxB+PAD=280+PAD).
    // height = newBottom - newTop = (280+PAD) - (50-PAD-HEADER) = 230 + 2*PAD + HEADER.
    expect(result!.height).toBe(280 + CONTAINER_PAD - (50 - CONTAINER_PAD - CONTAINER_HEADER_H));
    expect(result!.changed).toBe(true);
  });
});

describe('recalculateAncestorBounds', () => {
  it('returns an empty array when startNodeId is missing', () => {
    const nodes = [node({ id: 'a' })];
    expect(recalculateAncestorBounds(nodes, 'missing', new Map())).toEqual([]);
  });

  it('returns an empty array when the start node has no parent', () => {
    const nodes = [node({ id: 'root', parentId: null })];
    expect(recalculateAncestorBounds(nodes, 'root', new Map())).toEqual([]);
  });

  it('returns an empty array when the parent bounds did not change', () => {
    // Child fits comfortably — calculateContainerBounds returns
    // `changed: false`, so the walk terminates early.
    const nodes = [
      node({ id: 'parent', x: 0, y: 0, width: 400, height: 300 }),
      node({
        id: 'child',
        parentId: 'parent',
        x: CONTAINER_PAD,
        y: CONTAINER_PAD + CONTAINER_HEADER_H,
        width: 30,
        height: 20,
      }),
    ];
    expect(recalculateAncestorBounds(nodes, 'child', new Map())).toEqual([]);
  });

  it('produces one entry for a single-level walk when the parent overflows', () => {
    const nodes = [
      node({ id: 'parent', x: 0, y: 0, width: 200, height: 100 }),
      node({ id: 'child', parentId: 'parent', x: 500, y: 50, width: 40, height: 30 }),
    ];
    const states = new Map();
    const updates = recalculateAncestorBounds(nodes, 'child', states);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('parent');
    expect(updates[0].size!.width).toBe(540 + CONTAINER_PAD);
  });

  it('produces N entries from leaf to root for an N-level chain', () => {
    // A 3-level container chain where the leaf overflows every ancestor.
    const nodes = [
      node({ id: 'gp', x: 0, y: 0, width: 200, height: 100 }),
      node({
        id: 'p',
        parentId: 'gp',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      }),
      node({
        id: 'leaf',
        parentId: 'p',
        x: 1000,
        y: 0,
        width: 40,
        height: 30,
      }),
    ];
    const states = new Map();
    const updates = recalculateAncestorBounds(nodes, 'leaf', states);
    // Leaf->p->gp = two ancestors that need updating.
    expect(updates.map((u) => u.id)).toEqual(['p', 'gp']);
  });

  it('mutates nodeStates so the next ancestor sees the expanded child', () => {
    const nodes = [
      node({ id: 'gp', x: 0, y: 0, width: 200, height: 100 }),
      node({ id: 'p', parentId: 'gp', x: 0, y: 0, width: 200, height: 100 }),
      node({ id: 'leaf', parentId: 'p', x: 1000, y: 0, width: 40, height: 30 }),
    ];
    const states = new Map();
    recalculateAncestorBounds(nodes, 'leaf', states);
    // After the walk, both ancestors have entries in states.
    expect(states.has('p')).toBe(true);
    expect(states.has('gp')).toBe(true);
  });

  it('stops at the topmost ancestor (no parent => no further recursion)', () => {
    // root has no parent, so even after mid + root expand, the recursion
    // terminates instead of returning a third entry.
    const nodes = [
      node({ id: 'root', x: 0, y: 0, width: 200, height: 100 }), // no parentId
      node({ id: 'mid', parentId: 'root', x: 0, y: 0, width: 200, height: 100 }),
      node({ id: 'leaf', parentId: 'mid', x: 500, y: 0, width: 40, height: 30 }),
    ];
    const updates = recalculateAncestorBounds(nodes, 'leaf', new Map());
    // Both mid (overflowed by leaf) and root (overflowed by mid's
    // expanded pending state) get updates — but the recursion stops at
    // root because root has no parent of its own.
    expect(updates.map((u) => u.id)).toEqual(['mid', 'root']);
  });
});

describe('expandToFitChildren', () => {
  const HDR = 30;
  const PAD = 10;

  it('returns changed=false when the parent already contains the child', () => {
    const parent = { x: 0, y: 0, width: 500, height: 400 };
    const child = { x: 100, y: 100, width: 50, height: 50 };
    const result = expandToFitChildren(parent, child, { headerH: HDR, padding: PAD });
    expect(result).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 400,
      changed: false,
    });
  });

  it('shifts left and grows when the child sticks out left', () => {
    const parent = { x: 100, y: 100, width: 200, height: 200 };
    const child = { x: 50, y: 150, width: 30, height: 30 };
    const result = expandToFitChildren(parent, child, { headerH: HDR, padding: PAD });
    // requiredLeft = 50 - 10 = 40 → newLeft = 40, width grows by 60.
    expect(result.x).toBe(40);
    expect(result.width).toBe(260);
    expect(result.changed).toBe(true);
  });

  it('shifts up and grows when the child sticks out top (accounts for header)', () => {
    const parent = { x: 100, y: 100, width: 200, height: 200 };
    const child = { x: 110, y: 50, width: 30, height: 30 };
    const result = expandToFitChildren(parent, child, { headerH: HDR, padding: PAD });
    // requiredTop = 50 - 10 - 30 = 10 → newTop = 10, height grows by 90.
    expect(result.y).toBe(10);
    expect(result.height).toBe(290);
    expect(result.changed).toBe(true);
  });

  it('grows to the right when the child sticks out right', () => {
    const parent = { x: 0, y: 0, width: 200, height: 200 };
    const child = { x: 250, y: 50, width: 60, height: 30 };
    const result = expandToFitChildren(parent, child, { headerH: HDR, padding: PAD });
    // requiredRight = 250 + 60 + 10 = 320 → newRight = 320, width = 320.
    expect(result.x).toBe(0);
    expect(result.width).toBe(320);
    expect(result.changed).toBe(true);
  });

  it('grows to the bottom when the child sticks out bottom', () => {
    const parent = { x: 0, y: 0, width: 200, height: 200 };
    const child = { x: 50, y: 250, width: 30, height: 60 };
    const result = expandToFitChildren(parent, child, { headerH: HDR, padding: PAD });
    // requiredBottom = 250 + 60 + 10 = 320.
    expect(result.y).toBe(0);
    expect(result.height).toBe(320);
    expect(result.changed).toBe(true);
  });

  it('extends all four edges simultaneously when the child overhangs every side', () => {
    const parent = { x: 100, y: 100, width: 100, height: 100 };
    const child = { x: -50, y: -10, width: 400, height: 300 };
    const result = expandToFitChildren(parent, child, { headerH: HDR, padding: PAD });
    expect(result.x).toBe(-60); // -50 - 10
    expect(result.y).toBe(-50); // -10 - 10 - 30
    expect(result.x + result.width).toBe(360); // -50 + 400 + 10
    expect(result.y + result.height).toBe(300); // -10 + 300 + 10
    expect(result.changed).toBe(true);
  });

  it('uses CONTAINER_HEADER_H / CONTAINER_PAD as defaults when opts is omitted', () => {
    const parent = { x: 0, y: 0, width: 200, height: 200 };
    const child = { x: -50, y: 50, width: 30, height: 30 };
    const result = expandToFitChildren(parent, child);
    expect(result.x).toBe(-50 - CONTAINER_PAD);
    expect(result.changed).toBe(true);
  });
});

describe('clampNodeToParent', () => {
  const HDR = 30;
  const PAD = 10;
  const parent = { x: 100, y: 100, width: 400, height: 300 };

  it('returns the position unchanged when the child fully fits inside', () => {
    const result = clampNodeToParent(
      { x: 200, y: 200 },
      { width: 50, height: 50 },
      parent,
      { headerH: HDR, padding: PAD },
    );
    expect(result).toEqual({ x: 200, y: 200 });
  });

  it('clamps to parent.x + padding when the child is too far left', () => {
    const result = clampNodeToParent(
      { x: 50, y: 200 },
      { width: 50, height: 50 },
      parent,
      { headerH: HDR, padding: PAD },
    );
    expect(result.x).toBe(110); // parent.x (100) + padding (10)
  });

  it('clamps below the header when the child is too far up', () => {
    const result = clampNodeToParent(
      { x: 200, y: 50 },
      { width: 50, height: 50 },
      parent,
      { headerH: HDR, padding: PAD },
    );
    expect(result.y).toBe(140); // parent.y (100) + padding (10) + header (30)
  });

  it('clamps so the right edge sits at parent.x + parent.width - padding', () => {
    const result = clampNodeToParent(
      { x: 9999, y: 200 },
      { width: 50, height: 50 },
      parent,
      { headerH: HDR, padding: PAD },
    );
    // maxX = 100 + 400 - 10 - 50 = 440
    expect(result.x).toBe(440);
  });

  it('clamps so the bottom edge sits at parent.y + parent.height - padding', () => {
    const result = clampNodeToParent(
      { x: 200, y: 9999 },
      { width: 50, height: 50 },
      parent,
      { headerH: HDR, padding: PAD },
    );
    // maxY = 100 + 300 - 10 - 50 = 340
    expect(result.y).toBe(340);
  });

  it('uses CONTAINER_HEADER_H / CONTAINER_PAD as defaults when opts is omitted', () => {
    const result = clampNodeToParent(
      { x: 0, y: 0 },
      { width: 50, height: 50 },
      parent,
    );
    expect(result.x).toBe(parent.x + CONTAINER_PAD);
    expect(result.y).toBe(parent.y + CONTAINER_PAD + CONTAINER_HEADER_H);
  });
});
