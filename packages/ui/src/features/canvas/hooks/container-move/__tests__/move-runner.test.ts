/**
 * rf-cmove-2 — Pure node-move runner tests.
 *
 * Exercises `runNodeMove` directly (no React, no Redux) and asserts on
 * the returned `NodeMoveResult` shape. The orchestrator-level tests in
 * `__tests__/use-container-move.test.tsx` already cover the
 * useCallback + dispatch wiring; these tests target the pure runner.
 */

import { describe, it, expect } from 'vitest';
import { runNodeMove } from '../move-runner';
import {
  CONTAINER_HEADER_H,
  CONTAINER_PAD,
} from '../../../utils/container-bounds';
import type { CanvasNode } from '../../../components/types';

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

describe('runNodeMove — early returns', () => {
  it('unknown node id → returns null', () => {
    const result = runNodeMove({
      id: 'missing',
      newX: 100,
      newY: 100,
      skipAncestorResize: false,
      visibleNodes: [mkNode({ id: 'a' })],
      canvasNodes: [],
      getAllDescendantIds: () => [],
    });
    expect(result).toBeNull();
  });
});

describe('runNodeMove — single-node move (no descendants, no parent)', () => {
  it('returns position update only, skipClamp=false, exiting null', () => {
    const visibleNodes = [mkNode({ id: 'a', x: 0, y: 0, width: 100, height: 60 })];
    const result = runNodeMove({
      id: 'a',
      newX: 50,
      newY: 50,
      skipAncestorResize: false,
      visibleNodes,
      canvasNodes: visibleNodes,
      getAllDescendantIds: () => [],
    });

    expect(result).not.toBeNull();
    expect(result!.positionUpdates).toEqual([{ id: 'a', position: { x: 50, y: 50 } }]);
    expect(result!.sizeUpdates).toEqual([]);
    expect(result!.skipClamp).toBe(false);
    expect(result!.exiting).toEqual({ call: true, value: null });
  });
});

describe('runNodeMove — descendants', () => {
  it('translates ALL descendants by the same delta (uses canvasNodes)', () => {
    const visibleNodes = [mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 })];
    const canvasNodes = [
      ...visibleNodes,
      mkNode({ id: 'c1', x: 150, y: 150, width: 50, height: 30, parentId: 'p' }),
      mkNode({ id: 'c2', x: 250, y: 200, width: 50, height: 30, parentId: 'p' }),
    ];

    const result = runNodeMove({
      id: 'p',
      newX: 110,
      newY: 120,
      skipAncestorResize: true, // isolate descendant translation
      visibleNodes,
      canvasNodes,
      getAllDescendantIds: () => ['c1', 'c2'],
    });

    expect(result!.skipClamp).toBe(true); // hasDescendants=true
    expect(result!.positionUpdates).toEqual([
      { id: 'p', position: { x: 110, y: 120 } },
      { id: 'c1', position: { x: 160, y: 170 } },
      { id: 'c2', position: { x: 260, y: 220 } },
    ]);
  });

  it('descendant missing from canvasNodes → silently skipped', () => {
    const visibleNodes = [mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300 })];
    const canvasNodes = [...visibleNodes];

    const result = runNodeMove({
      id: 'p',
      newX: 50,
      newY: 50,
      skipAncestorResize: true,
      visibleNodes,
      canvasNodes,
      getAllDescendantIds: () => ['ghost-child'],
    });

    expect(result!.positionUpdates).toEqual([{ id: 'p', position: { x: 50, y: 50 } }]);
    // Still skipClamp because hasDescendants=true (descendantIds.length > 0).
    expect(result!.skipClamp).toBe(true);
  });
});

describe('runNodeMove — ancestor expansion + clamp', () => {
  it('expands parent on left overflow and clamps child', () => {
    const visibleNodes = [
      mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 }),
      mkNode({ id: 'c', x: 200, y: 200, width: 50, height: 30, parentId: 'p' }),
    ];

    const result = runNodeMove({
      id: 'c',
      newX: -100,
      newY: 200,
      skipAncestorResize: false,
      visibleNodes,
      canvasNodes: visibleNodes,
      getAllDescendantIds: () => [],
    });

    // Parent shifted left + grew, child clamped.
    const parentPos = result!.positionUpdates.find((u) => u.id === 'p');
    const childPos = result!.positionUpdates.find((u) => u.id === 'c');
    expect(parentPos).toBeDefined();
    expect(childPos).toBeDefined();
    expect(childPos!.position.x).toBe(parentPos!.position.x + PAD); // clamped to interior
  });

  it('skipAncestorResize=true skips both walk + clamp', () => {
    const visibleNodes = [
      mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 }),
      mkNode({ id: 'c', x: 200, y: 200, width: 50, height: 30, parentId: 'p' }),
    ];

    const result = runNodeMove({
      id: 'c',
      newX: -500,
      newY: -500,
      skipAncestorResize: true,
      visibleNodes,
      canvasNodes: visibleNodes,
      getAllDescendantIds: () => [],
    });

    expect(result!.sizeUpdates).toEqual([]); // no expansion
    const childPos = result!.positionUpdates.find((u) => u.id === 'c');
    expect(childPos!.position).toEqual({ x: -500, y: -500 }); // not clamped
  });
});

describe('runNodeMove — exit-indicator detection', () => {
  it('near edge → exiting.value = parent.id', () => {
    const visibleNodes = [
      mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 400 }),
      mkNode({ id: 'c', x: 100, y: 100, width: 50, height: 30, parentId: 'p' }),
    ];
    const result = runNodeMove({
      id: 'c',
      newX: 10,
      newY: 100,
      skipAncestorResize: true,
      visibleNodes,
      canvasNodes: visibleNodes,
      getAllDescendantIds: () => [],
    });
    expect(result!.exiting).toEqual({ call: true, value: 'p' });
  });

  it('parent missing → exiting.call=false', () => {
    const visibleNodes = [mkNode({ id: 'c', parentId: 'ghost', x: 0, y: 0, width: 50, height: 30 })];
    const result = runNodeMove({
      id: 'c',
      newX: 50,
      newY: 50,
      skipAncestorResize: true,
      visibleNodes,
      canvasNodes: visibleNodes,
      getAllDescendantIds: () => [],
    });
    expect(result!.exiting).toEqual({ call: false });
  });
});

describe('runNodeMove — skipClamp opt-in matrix', () => {
  it('single node, no descendants, no shift → skipClamp=false', () => {
    const visibleNodes = [mkNode({ id: 'a', x: 0, y: 0 })];
    const result = runNodeMove({
      id: 'a',
      newX: 50,
      newY: 50,
      skipAncestorResize: false,
      visibleNodes,
      canvasNodes: visibleNodes,
      getAllDescendantIds: () => [],
    });
    expect(result!.skipClamp).toBe(false);
  });

  it('single node, shift held → skipClamp=true', () => {
    const visibleNodes = [mkNode({ id: 'a' })];
    const result = runNodeMove({
      id: 'a',
      newX: 50,
      newY: 50,
      skipAncestorResize: true,
      visibleNodes,
      canvasNodes: visibleNodes,
      getAllDescendantIds: () => [],
    });
    expect(result!.skipClamp).toBe(true);
  });

  it('node with descendants, no shift → skipClamp=true', () => {
    const visibleNodes = [mkNode({ id: 'a' })];
    const canvasNodes = [
      ...visibleNodes,
      mkNode({ id: 'b', parentId: 'a' }),
    ];
    const result = runNodeMove({
      id: 'a',
      newX: 50,
      newY: 50,
      skipAncestorResize: false,
      visibleNodes,
      canvasNodes,
      getAllDescendantIds: () => ['b'],
    });
    expect(result!.skipClamp).toBe(true);
  });
});

describe('runNodeMove — multi-level walk (parent → grandparent)', () => {
  it('forces parent + grandparent resize when child overflow propagates', () => {
    const visibleNodes = [
      mkNode({ id: 'gp', x: 0, y: 0, width: 300, height: 300 }),
      mkNode({ id: 'p', x: 50, y: 50, width: 200, height: 200, parentId: 'gp' }),
      mkNode({ id: 'c', x: 100, y: 100, width: 50, height: 30, parentId: 'p' }),
    ];
    const result = runNodeMove({
      id: 'c',
      newX: 500,
      newY: 100,
      skipAncestorResize: false,
      visibleNodes,
      canvasNodes: visibleNodes,
      getAllDescendantIds: () => [],
    });

    const ids = result!.sizeUpdates.map((u) => u.id);
    expect(ids).toContain('p');
    expect(ids).toContain('gp');
  });

  it('folded ancestor breaks the walk', () => {
    const visibleNodes = [
      mkNode({ id: 'gp', x: 0, y: 0, width: 300, height: 300 }),
      mkNode({
        id: 'p',
        x: 50,
        y: 50,
        width: 200,
        height: 200,
        parentId: 'gp',
        data: { folded: true },
      }),
      mkNode({ id: 'c', x: 100, y: 100, width: 50, height: 30, parentId: 'p' }),
    ];
    const result = runNodeMove({
      id: 'c',
      newX: 500,
      newY: 500,
      skipAncestorResize: false,
      visibleNodes,
      canvasNodes: visibleNodes,
      getAllDescendantIds: () => [],
    });

    const ids = result!.sizeUpdates.map((u) => u.id);
    expect(ids).not.toContain('p');
    expect(ids).not.toContain('gp');
  });
});

describe('runNodeMove — descendant translation + clamp interaction', () => {
  it('clamp delta propagates to descendants', () => {
    const visibleNodes = [
      mkNode({ id: 'p', x: 100, y: 100, width: 200, height: 200 }),
      mkNode({ id: 'c', x: 150, y: 150, width: 50, height: 30, parentId: 'p' }),
    ];
    const canvasNodes = [
      ...visibleNodes,
      mkNode({ id: 'gc', x: 160, y: 160, width: 20, height: 20, parentId: 'c' }),
    ];

    const result = runNodeMove({
      id: 'c',
      newX: -100,
      newY: 150,
      skipAncestorResize: false,
      visibleNodes,
      canvasNodes,
      getAllDescendantIds: (id) => (id === 'c' ? ['gc'] : []),
    });

    const childUpd = result!.positionUpdates.find((u) => u.id === 'c')!;
    const grandUpd = result!.positionUpdates.find((u) => u.id === 'gc')!;
    // Grandchild adjusted by clamp delta (raw newX=-100 → clamped).
    const childAdjustX = childUpd.position.x - -100;
    expect(grandUpd.position.x).toBe(160 + (-100 - 150) + childAdjustX);
  });
});

describe('runNodeMove — siblingPosLookup non-moving fallback', () => {
  it('sibling without positionUpdate uses fallback bounds (sib.x/sib.y)', () => {
    // The walk's siblingPosLookup falls back to sib.x/sib.y when no
    // entry is in positionUpdates. Trigger by having TWO children of the
    // parent and only ONE moves — bbox over the static sibling exercises
    // the `?? sib.x` and `?? sib.y` paths.
    const visibleNodes = [
      mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300 }),
      mkNode({ id: 'moving', x: 100, y: 100, width: 50, height: 30, parentId: 'p' }),
      // Static sibling at far right — its position is NOT in positionUpdates.
      mkNode({ id: 'static', x: 350, y: 100, width: 100, height: 30, parentId: 'p' }),
    ];

    const result = runNodeMove({
      id: 'moving',
      newX: 100,
      newY: 100,
      skipAncestorResize: false,
      visibleNodes,
      canvasNodes: visibleNodes,
      getAllDescendantIds: () => [],
    });

    // Static sibling's right edge (350+100=450) past parent's right (400-PAD).
    // Bbox should reflect this via the fallback path.
    const sizeUpdate = result!.sizeUpdates.find((u) => u.id === 'p');
    expect(sizeUpdate).toBeDefined();
    expect(sizeUpdate!.width).toBeGreaterThanOrEqual(450 + PAD);
  });
});

// HEADER must remain accessed for top-edge expansion math correctness in other suites.
describe('runNodeMove — sanity', () => {
  it('HEADER constant is positive (sanity check for top-edge math)', () => {
    expect(HEADER).toBeGreaterThan(0);
  });
});
