/**
 * rf-cmove-1 — Clamp helpers tests.
 *
 * `clampDraggedNodeToParent` (BND-1/BND-3) + `detectExitingGroupId`
 * (tri-state setter directive). Pure-function tests.
 */

import { describe, it, expect } from 'vitest';
import { CONTAINER_HEADER_H, CONTAINER_PAD } from '../../../utils/container-bounds';
import { clampDraggedNodeToParent, detectExitingGroupId } from '../clamp';
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
  }) as CanvasNode;

// ─── clampDraggedNodeToParent ────────────────────────────────────────────────

describe('clampDraggedNodeToParent — early returns', () => {
  it('no parentId → no-op', () => {
    const node = mkNode({ id: 'a' });
    const positionUpdates: PositionUpdate[] = [{ id: 'a', position: { x: -100, y: -100 } }];
    const sizeUpdates: SizeUpdate[] = [];
    clampDraggedNodeToParent({
      node,
      visibleNodes: [node],
      positionUpdates,
      sizeUpdates,
      descendantIds: [],
    });
    // Untouched.
    expect(positionUpdates[0].position).toEqual({ x: -100, y: -100 });
  });

  it('parent missing from visibleNodes → no-op', () => {
    const node = mkNode({ id: 'a', parentId: 'ghost' });
    const positionUpdates: PositionUpdate[] = [{ id: 'a', position: { x: -100, y: -100 } }];
    clampDraggedNodeToParent({
      node,
      visibleNodes: [node],
      positionUpdates,
      sizeUpdates: [],
      descendantIds: [],
    });
    expect(positionUpdates[0].position).toEqual({ x: -100, y: -100 });
  });

  it('folded parent → no-op', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300, data: { folded: true } });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const positionUpdates: PositionUpdate[] = [{ id: 'a', position: { x: -100, y: -100 } }];
    clampDraggedNodeToParent({
      node,
      visibleNodes: [parent, node],
      positionUpdates,
      sizeUpdates: [],
      descendantIds: [],
    });
    expect(positionUpdates[0].position).toEqual({ x: -100, y: -100 });
  });

  it('node has no positionUpdate entry → no-op (silently)', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const positionUpdates: PositionUpdate[] = []; // no entry for 'a'
    clampDraggedNodeToParent({
      node,
      visibleNodes: [parent, node],
      positionUpdates,
      sizeUpdates: [],
      descendantIds: [],
    });
    expect(positionUpdates).toEqual([]);
  });
});

describe('clampDraggedNodeToParent — clamp arithmetic', () => {
  it('clamps to minX = px + PAD when dragged outside left edge', () => {
    const parent = mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const positionUpdates: PositionUpdate[] = [{ id: 'a', position: { x: -50, y: 200 } }];
    clampDraggedNodeToParent({
      node,
      visibleNodes: [parent, node],
      positionUpdates,
      sizeUpdates: [],
      descendantIds: [],
    });
    expect(positionUpdates[0].position.x).toBe(100 + PAD);
    expect(positionUpdates[0].position.y).toBe(200); // y unchanged (within bounds)
  });

  it('clamps to minY = py + PAD + HEADER when above top edge', () => {
    const parent = mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const positionUpdates: PositionUpdate[] = [{ id: 'a', position: { x: 200, y: 0 } }];
    clampDraggedNodeToParent({
      node,
      visibleNodes: [parent, node],
      positionUpdates,
      sizeUpdates: [],
      descendantIds: [],
    });
    expect(positionUpdates[0].position.y).toBe(100 + PAD + HEADER);
  });

  it('clamps to maxX = px + pw - PAD - node.width when past right edge', () => {
    const parent = mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const positionUpdates: PositionUpdate[] = [{ id: 'a', position: { x: 999, y: 200 } }];
    clampDraggedNodeToParent({
      node,
      visibleNodes: [parent, node],
      positionUpdates,
      sizeUpdates: [],
      descendantIds: [],
    });
    expect(positionUpdates[0].position.x).toBe(100 + 400 - PAD - 50);
  });

  it('clamps to maxY = py + ph - PAD - node.height when past bottom edge', () => {
    const parent = mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const positionUpdates: PositionUpdate[] = [{ id: 'a', position: { x: 200, y: 999 } }];
    clampDraggedNodeToParent({
      node,
      visibleNodes: [parent, node],
      positionUpdates,
      sizeUpdates: [],
      descendantIds: [],
    });
    expect(positionUpdates[0].position.y).toBe(100 + 300 - PAD - 30);
  });

  it('within bounds → no-op (no mutation)', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 300 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const positionUpdates: PositionUpdate[] = [{ id: 'a', position: { x: 100, y: 100 } }];
    clampDraggedNodeToParent({
      node,
      visibleNodes: [parent, node],
      positionUpdates,
      sizeUpdates: [],
      descendantIds: [],
    });
    expect(positionUpdates[0].position).toEqual({ x: 100, y: 100 });
  });
});

describe('clampDraggedNodeToParent — uses post-expansion parent bounds', () => {
  it('reads expanded parent bounds from positionUpdates / sizeUpdates', () => {
    const parent = mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    // Parent was already shifted to (50, 50) and expanded to 500x400.
    const positionUpdates: PositionUpdate[] = [
      { id: 'p', position: { x: 50, y: 50 } },
      { id: 'a', position: { x: 0, y: 100 } }, // outside expanded parent's left edge (50+PAD)
    ];
    const sizeUpdates: SizeUpdate[] = [{ id: 'p', width: 500, height: 400 }];
    clampDraggedNodeToParent({
      node,
      visibleNodes: [parent, node],
      positionUpdates,
      sizeUpdates,
      descendantIds: [],
    });
    // Clamp uses the expanded parent (px=50, pw=500), not the stale parent.x=100.
    expect(positionUpdates[1].position.x).toBe(50 + PAD);
  });
});

describe('clampDraggedNodeToParent — descendant delta propagation', () => {
  it('propagates the clamp adjustX/Y to all matching descendant entries', () => {
    const parent = mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const positionUpdates: PositionUpdate[] = [
      { id: 'a', position: { x: -100, y: 200 } }, // clamps to 100+PAD
      { id: 'd1', position: { x: 50, y: 250 } }, // adjust by clamp delta
    ];
    clampDraggedNodeToParent({
      node,
      visibleNodes: [parent, node],
      positionUpdates,
      sizeUpdates: [],
      descendantIds: ['d1'],
    });
    const adjustX = 100 + PAD - -100; // clampedX - rawX = 220
    expect(positionUpdates[1].position.x).toBe(50 + adjustX);
    expect(positionUpdates[1].position.y).toBe(250);
  });

  it('descendant id missing from positionUpdates → silently skipped (no error)', () => {
    const parent = mkNode({ id: 'p', x: 100, y: 100, width: 400, height: 300 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const positionUpdates: PositionUpdate[] = [{ id: 'a', position: { x: -100, y: 200 } }];
    expect(() => {
      clampDraggedNodeToParent({
        node,
        visibleNodes: [parent, node],
        positionUpdates,
        sizeUpdates: [],
        descendantIds: ['ghost'],
      });
    }).not.toThrow();
    expect(positionUpdates).toHaveLength(1);
  });
});

// ─── detectExitingGroupId — tri-state ────────────────────────────────────────

describe('detectExitingGroupId — tri-state directive', () => {
  it('no parentId → { call: true, value: null }', () => {
    const node = mkNode({ id: 'lone' });
    const result = detectExitingGroupId({
      node,
      newX: 200,
      newY: 200,
      visibleNodes: [node],
    });
    expect(result).toEqual({ call: true, value: null });
  });

  it('parent missing from visibleNodes → { call: false }', () => {
    const node = mkNode({ id: 'a', parentId: 'ghost' });
    const result = detectExitingGroupId({
      node,
      newX: 100,
      newY: 100,
      visibleNodes: [node],
    });
    expect(result).toEqual({ call: false });
  });

  it('near left edge → { call: true, value: parent.id }', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 400 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const result = detectExitingGroupId({
      node,
      newX: 10, // < 0 + 30
      newY: 100,
      visibleNodes: [parent, node],
    });
    expect(result).toEqual({ call: true, value: 'p' });
  });

  it('near top edge → { call: true, value: parent.id }', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 400 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const result = detectExitingGroupId({
      node,
      newX: 100,
      newY: 10,
      visibleNodes: [parent, node],
    });
    expect(result).toEqual({ call: true, value: 'p' });
  });

  it('near right edge → { call: true, value: parent.id }', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 400 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    // newX + 50 > 400 - 30 → newX > 320
    const result = detectExitingGroupId({
      node,
      newX: 350,
      newY: 100,
      visibleNodes: [parent, node],
    });
    expect(result).toEqual({ call: true, value: 'p' });
  });

  it('near bottom edge → { call: true, value: parent.id }', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 400 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    // newY + 30 > 400 - 30 → newY > 340
    const result = detectExitingGroupId({
      node,
      newX: 100,
      newY: 360,
      visibleNodes: [parent, node],
    });
    expect(result).toEqual({ call: true, value: 'p' });
  });

  it('center of parent → { call: true, value: null }', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 400 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    const result = detectExitingGroupId({
      node,
      newX: 200,
      newY: 200,
      visibleNodes: [parent, node],
    });
    expect(result).toEqual({ call: true, value: null });
  });

  it('honors a custom margin', () => {
    const parent = mkNode({ id: 'p', x: 0, y: 0, width: 400, height: 400 });
    const node = mkNode({ id: 'a', parentId: 'p', width: 50, height: 30 });
    // With margin=100, x=80 lands inside the larger margin band.
    const result = detectExitingGroupId({
      node,
      newX: 80,
      newY: 200,
      visibleNodes: [parent, node],
      margin: 100,
    });
    expect(result).toEqual({ call: true, value: 'p' });
  });
});
