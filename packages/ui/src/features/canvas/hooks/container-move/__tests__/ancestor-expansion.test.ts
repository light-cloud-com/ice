/**
 * rf-cmove-1 — Ancestor expansion helper tests.
 *
 * Pure-function tests — no React, no Redux, no jsdom. Exercise
 * `expandAncestorOnce` and `walkAncestorsAndExpand` directly with
 * fixture nodes + assertion against mutated update arrays.
 *
 * Per `rf-canv-25b-min-container-floor-masks-test-fixtures` — fixtures
 * use parents comfortably above MIN_CONTAINER_WIDTH=240 and
 * MIN_CONTAINER_HEIGHT=150 so the floor doesn't mask the asserted
 * delta.
 */

import { describe, it, expect } from 'vitest';
import {
  expandAncestorOnce,
  walkAncestorsAndExpand,
} from '../ancestor-expansion';
import {
  CONTAINER_HEADER_H,
  CONTAINER_PAD,
} from '../../../utils/container-bounds';
import type { CanvasNode } from '../../../components/types';
import type { PositionUpdate, SizeUpdate } from '../types';

const PAD = CONTAINER_PAD;
const HEADER = CONTAINER_HEADER_H;

const mkNode = (overrides: Partial<CanvasNode> = {}): CanvasNode =>
  ({
    id: overrides.id ?? 'n1',
    type: overrides.type ?? 'block',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 60,
    label: overrides.label ?? overrides.id ?? 'n1',
    data: overrides.data ?? {},
    parentId: overrides.parentId ?? null,
    ...overrides,
  } as CanvasNode);

// ─── expandAncestorOnce — single-step ────────────────────────────────────────

describe('expandAncestorOnce — happy path (single-step expansion)', () => {
  it('returns undefined when parent has no children (bbox is Infinity)', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300 });
    const visibleNodes = [parent];
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    const result = expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    expect(result).toBeUndefined();
    expect(positionUpdates).toEqual([]);
    expect(sizeUpdates).toEqual([]);
  });

  it('left overflow → shifts px left, grows pw, pushes both updates', () => {
    const parent = mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 });
    const child = mkNode({ id: 'c', x: 50, y: 200, width: 50, height: 30, parentId: 'p' });
    const visibleNodes = [parent, child];
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    const result = expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    // overflowL = (100 + PAD) - 50 = 50 + PAD
    expect(result).toBeDefined();
    expect(result!.changed).toBe(true);
    expect(result!.px).toBe(100 - (50 + PAD));
    expect(result!.pw).toBe(400 + 50 + PAD);

    expect(positionUpdates).toEqual([
      { id: 'p', position: { x: 100 - (50 + PAD), y: 100 } },
    ]);
    expect(sizeUpdates).toEqual([
      { id: 'p', width: 400 + 50 + PAD, height: 300 },
    ]);
  });

  it('top overflow → shifts py up by PAD+HEADER, grows ph', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 100, width: 400, height: 300 });
    const child = mkNode({ id: 'c', x: 50, y: 50, width: 50, height: 30, parentId: 'p' });
    const visibleNodes = [parent, child];
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    // overflowT = (100 + PAD + HEADER) - 50 = 50 + PAD + HEADER
    expect(positionUpdates[0].position.y).toBe(100 - (50 + PAD + HEADER));
    expect(sizeUpdates[0].height).toBe(300 + 50 + PAD + HEADER);
  });

  it('right overflow → grows pw only (px unchanged but position update still pushed)', () => {
    // Place child fully inside top edge (y > parent.y + PAD + HEADER) so only right overflows.
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300 });
    const child = mkNode({ id: 'c', x: 380, y: 100, width: 100, height: 30, parentId: 'p' });
    const visibleNodes = [parent, child];
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    // overflowR = (380 + 100) - (0 + 400 - PAD) = 80 + PAD; px and py unchanged.
    expect(positionUpdates[0].position).toEqual({ x: 0, y: 0 });
    expect(sizeUpdates[0].width).toBe(400 + 80 + PAD);
  });

  it('bottom overflow → grows ph only', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300 });
    // Child far enough from left/top edges that only bottom overflows.
    const child = mkNode({ id: 'c', x: 100, y: 280, width: 50, height: 100, parentId: 'p' });
    const visibleNodes = [parent, child];
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    // overflowB = (280 + 100) - (0 + 300 - PAD) = 80 + PAD
    expect(sizeUpdates[0].height).toBe(300 + 80 + PAD);
  });

  it('no overflow → returns changed=false, no updates pushed', () => {
    // Child fully inside parent's interior.
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300 });
    const child = mkNode({ id: 'c', x: 100, y: 100, width: 50, height: 30, parentId: 'p' });
    const visibleNodes = [parent, child];
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    const result = expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    expect(result!.changed).toBe(false);
    expect(positionUpdates).toEqual([]);
    expect(sizeUpdates).toEqual([]);
  });
});

describe('expandAncestorOnce — incremental updates (existing entries are mutated)', () => {
  it('updates an existing positionUpdate entry in place (does not duplicate)', () => {
    const parent = mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 });
    const child = mkNode({ id: 'c', x: 50, y: 200, width: 50, height: 30, parentId: 'p' });
    const visibleNodes = [parent, child];
    // Pre-existing entry — simulate a multi-step walk where a previous
    // iteration already pushed an update for `p`.
    const positionUpdates: PositionUpdate[] = [{ id: 'p', position: { x: 200, y: 200 } }];
    const sizeUpdates: SizeUpdate[] = [{ id: 'p', width: 500, height: 350 }];

    expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    // Should still be exactly 1 entry per array (mutated, not duplicated).
    expect(positionUpdates).toHaveLength(1);
    expect(sizeUpdates).toHaveLength(1);
  });

  it('uses existing position when computing px/py (incremental walk)', () => {
    // Pre-existing position update says `p` is at (200, 200) — overflow
    // computed against THAT, not `parent.x` (100).
    const parent = mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 });
    // Child at x=50 → overflowL using stale parent.x=100 would be (100+PAD)-50=50+PAD,
    // but using existing px=200 → overflowL = (200+PAD)-50 = 150+PAD.
    const child = mkNode({ id: 'c', x: 50, y: 250, width: 50, height: 30, parentId: 'p' });
    const visibleNodes = [parent, child];
    const positionUpdates: PositionUpdate[] = [{ id: 'p', position: { x: 200, y: 200 } }];
    const sizeUpdates: SizeUpdate[] = [];

    expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    expect(positionUpdates[0].position.x).toBe(200 - (150 + PAD));
  });
});

describe('expandAncestorOnce — MIN_CONTAINER floor', () => {
  it('floors width to MIN_CONTAINER_WIDTH when grow lands below', () => {
    // Tiny parent, tiny overflow → grown width still under MIN.
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 100, height: 60 });
    const child = mkNode({ id: 'c', x: -10, y: 10, width: 50, height: 30, parentId: 'p' });
    const visibleNodes = [parent, child];
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    // 100 + 10+PAD = 100 + 30 = 130 (assuming PAD=20). MIN_CONTAINER_WIDTH=240 → floored.
    expect(sizeUpdates[0].width).toBeGreaterThanOrEqual(240);
    expect(sizeUpdates[0].height).toBeGreaterThanOrEqual(150);
  });
});

describe('expandAncestorOnce — siblingBoundsOverride', () => {
  it('substitutes the override sibling\'s bounds in the bbox computation', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300 });
    const moving = mkNode({ id: 'm', x: 100, y: 100, width: 50, height: 30, parentId: 'p' });
    const visibleNodes = [parent, moving];
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
      siblingBoundsOverride: {
        id: 'm',
        // Override puts moving at x=-50 (forces left overflow).
        bounds: { x: -50, y: 100, width: 50, height: 30 },
      },
    });

    // overflowL = (0 + PAD) - (-50) = 50 + PAD
    expect(positionUpdates[0].position.x).toBe(0 - (50 + PAD));
  });

  it('non-matching id → falls through to siblingPosLookup', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300 });
    const moving = mkNode({ id: 'm', x: 100, y: 100, width: 50, height: 30, parentId: 'p' });
    const visibleNodes = [parent, moving];
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    const result = expandAncestorOnce({
      parent,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
      siblingBoundsOverride: {
        id: 'unrelated',
        bounds: { x: -1000, y: -1000, width: 1, height: 1 },
      },
    });

    // Override doesn't match — moving stays at (100,100) → no overflow.
    expect(result!.changed).toBe(false);
  });
});

// ─── walkAncestorsAndExpand — full chain walk ────────────────────────────────

describe('walkAncestorsAndExpand — multi-level walks', () => {
  it('no parent → no-op (no walk)', () => {
    const lone = mkNode({ id: 'lone' });
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    walkAncestorsAndExpand({
      node: lone,
      visibleNodes: [lone],
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    expect(positionUpdates).toEqual([]);
    expect(sizeUpdates).toEqual([]);
  });

  it('parent missing from visibleNodes → walk halts', () => {
    const child = mkNode({ id: 'c', parentId: 'ghost-parent' });
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    walkAncestorsAndExpand({
      node: child,
      visibleNodes: [child],
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    expect(positionUpdates).toEqual([]);
    expect(sizeUpdates).toEqual([]);
  });

  it('folded parent → walk halts before processing', () => {
    const parent = mkNode({
      id: 'p',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      data: { folded: true },
    });
    const child = mkNode({ id: 'c', x: -100, y: -100, width: 50, height: 30, parentId: 'p' });
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    walkAncestorsAndExpand({
      node: child,
      visibleNodes: [parent, child],
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    // Even though child overflows, parent is folded → no work.
    expect(positionUpdates).toEqual([]);
    expect(sizeUpdates).toEqual([]);
  });

  it('walks parent → grandparent when both overflow', () => {
    const gp = mkNode({ id: 'gp', x: 0, y: 0, width: 400, height: 400 });
    const parent = mkNode({ id: 'p', x: 50, y: 50, width: 300, height: 300, parentId: 'gp' });
    const child = mkNode({ id: 'c', x: 200, y: 200, width: 50, height: 30, parentId: 'p' });
    const visibleNodes = [gp, parent, child];

    // Pre-seed positionUpdates as if handleNodeMove pushed the child move
    // (from x=200 to x=600 say) — overflow chain forces parent + gp grow.
    const positionUpdates: PositionUpdate[] = [
      { id: 'c', position: { x: 600, y: 200 } },
    ];
    const sizeUpdates: SizeUpdate[] = [];

    walkAncestorsAndExpand({
      node: child,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => {
        const u = positionUpdates.find((up) => up.id === sib.id);
        return { x: u?.position.x ?? sib.x, y: u?.position.y ?? sib.y };
      },
    });

    const ids = sizeUpdates.map((u) => u.id);
    expect(ids).toContain('p');
    expect(ids).toContain('gp');
  });

  it('walk halts at zero-children ancestor (childMinX = Infinity)', () => {
    // Parent with NO children in visibleNodes — the bbox check returns
    // undefined and the walk breaks.
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300 });
    const child = mkNode({ id: 'c', x: 100, y: 100, parentId: 'p' });
    // Visible only contains the child — parent has zero siblings of `c`
    // visible. Wait, c IS a child of p. So bbox should be c's bounds. Use
    // a different setup: omit the child from visibleNodes so parent has none.
    const visibleNodes = [parent]; // child missing from visible
    const positionUpdates: PositionUpdate[] = [];
    const sizeUpdates: SizeUpdate[] = [];

    walkAncestorsAndExpand({
      node: child,
      visibleNodes,
      positionUpdates,
      sizeUpdates,
      siblingPosLookup: (sib) => ({ x: sib.x, y: sib.y }),
    });

    expect(positionUpdates).toEqual([]);
    expect(sizeUpdates).toEqual([]);
  });
});
