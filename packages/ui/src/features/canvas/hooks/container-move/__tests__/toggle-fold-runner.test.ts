/**
 * rf-cmove-2 — Toggle-fold runner tests.
 *
 * Exercises `resolveToggleFoldDecision` + `runUnfoldExpansion`. The
 * orchestrator-level dispatch flow is covered by the hook tests in
 * `__tests__/use-container-move.test.tsx`.
 *
 * `computeCompactNodeHeight` is mocked so the no-children fallback has
 * a deterministic value.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  computeCompactNodeHeightSpy: vi.fn(() => 80),
}));

vi.mock('../../../components/nodes/compact-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/nodes/compact-node')>();
  return {
    ...actual,
    computeCompactNodeHeight: mocks.computeCompactNodeHeightSpy,
  };
});

import { MIN_CONTAINER_HEIGHT } from '../../../../../config/canvas-constants';
import { CONTAINER_HEADER_H, CONTAINER_PAD } from '../../../utils/container-bounds';
import { resolveToggleFoldDecision, runUnfoldExpansion } from '../toggle-fold-runner';
import type { CardNode } from '../../../../../store/slices/cards-slice';
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
  }) as CanvasNode;

// ─── resolveToggleFoldDecision ───────────────────────────────────────────────

describe('resolveToggleFoldDecision', () => {
  it('missing node id → returns null', () => {
    const result = resolveToggleFoldDecision({ nodeId: 'missing', visibleNodes: [] });
    expect(result).toBeNull();
  });

  it('node found, was folded → returns wasFolded=true', () => {
    const node = mkNode({ id: 'a', data: { folded: true } });
    const result = resolveToggleFoldDecision({ nodeId: 'a', visibleNodes: [node] });
    expect(result).toEqual({ node, wasFolded: true });
  });

  it('node found, was not folded → returns wasFolded=false', () => {
    const node = mkNode({ id: 'a', data: { folded: false } });
    const result = resolveToggleFoldDecision({ nodeId: 'a', visibleNodes: [node] });
    expect(result).toEqual({ node, wasFolded: false });
  });

  it('node found, no folded prop → wasFolded=false (coerce !!undefined)', () => {
    const node = mkNode({ id: 'a', data: {} });
    const result = resolveToggleFoldDecision({ nodeId: 'a', visibleNodes: [node] });
    expect(result).toEqual({ node, wasFolded: false });
  });
});

// ─── runUnfoldExpansion — self bounds (no children) ──────────────────────────

describe('runUnfoldExpansion — no children fallback', () => {
  it('uses Math.max(reduxHeight, computeCompactNodeHeight, MIN)', () => {
    const node = mkNode({ id: 'a', x: 0, y: 0, width: 300, height: 38, data: { folded: true } });
    const nodes: CardNode[] = [{ id: 'a', height: 200 } as unknown as CardNode];
    mocks.computeCompactNodeHeightSpy.mockReturnValue(80);

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [node], // no children
      visibleNodes: [node],
      nodes,
    });

    const sizeUpdate = result.sizeUpdates.find((u) => u.id === 'a')!;
    expect(sizeUpdate.height).toBe(200); // max(200, 80, MIN) = 200
    expect(sizeUpdate.width).toBe(300);
  });

  it('falls back to computeCompactNodeHeight when no Redux entry', () => {
    const node = mkNode({ id: 'a', x: 0, y: 0, width: 300, height: 38, data: { folded: true } });
    mocks.computeCompactNodeHeightSpy.mockReturnValue(150);

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [node],
      visibleNodes: [node],
      nodes: [],
    });

    const sizeUpdate = result.sizeUpdates.find((u) => u.id === 'a')!;
    expect(sizeUpdate.height).toBe(Math.max(150, MIN_CONTAINER_HEIGHT));
  });

  it('honors MIN_CONTAINER_HEIGHT floor', () => {
    const node = mkNode({ id: 'a', x: 0, y: 0, width: 300, height: 38, data: { folded: true } });
    mocks.computeCompactNodeHeightSpy.mockReturnValue(10);

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [node],
      visibleNodes: [node],
      nodes: [],
    });

    const sizeUpdate = result.sizeUpdates.find((u) => u.id === 'a')!;
    expect(sizeUpdate.height).toBe(MIN_CONTAINER_HEIGHT);
  });

  it('selfH unchanged → no size update for self', () => {
    // Pre-existing height 60 matches computeCompactNodeHeight + > MIN floor.
    const node = mkNode({ id: 'a', x: 0, y: 0, width: 100, height: 60, data: { folded: true } });
    const nodes: CardNode[] = [{ id: 'a', height: 60 } as unknown as CardNode];
    mocks.computeCompactNodeHeightSpy.mockReturnValue(60);

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [node],
      visibleNodes: [node],
      nodes,
    });

    if (MIN_CONTAINER_HEIGHT <= 60) {
      // selfH stays at 60 → no resize.
      expect(result.sizeUpdates.find((u) => u.id === 'a')).toBeUndefined();
    } else {
      const sizeUpdate = result.sizeUpdates.find((u) => u.id === 'a')!;
      expect(sizeUpdate.height).toBe(MIN_CONTAINER_HEIGHT);
    }
  });
});

// ─── runUnfoldExpansion — self bounds (with children) ────────────────────────

describe('runUnfoldExpansion — children expansion', () => {
  it('right + bottom overflow → grows width/height (selfX/Y unchanged)', () => {
    const node = mkNode({ id: 'p', x: 0, y: 0, width: 100, height: 60, data: { folded: true } });
    // Child must be fully inside top/left of parent so only right/bottom overflow.
    // Child x=50 → overL = 0+PAD-50 = -30 (no overflow). Child y=80 → overT = 0+PAD+HEADER-80 = -24 (no overflow).
    const child = mkNode({ id: 'c', x: 50, y: 80, width: 200, height: 80, parentId: 'p' });

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [node, child],
      visibleNodes: [node],
      nodes: [],
    });

    const sizeUpdate = result.sizeUpdates.find((u) => u.id === 'p')!;
    // overR = 250 - (100-PAD) = 150+PAD
    expect(sizeUpdate.width).toBeGreaterThanOrEqual(250 + PAD);
    expect(sizeUpdate.height).toBeGreaterThanOrEqual(80 + 80 + PAD);
    // No position update because selfX/Y unchanged.
    expect(result.positionUpdates.find((u) => u.id === 'p')).toBeUndefined();
  });

  it('left + top overflow → shifts selfX/Y AND grows', () => {
    const node = mkNode({ id: 'p', x: 200, y: 200, width: 200, height: 200, data: { folded: true } });
    const child = mkNode({ id: 'c', x: 50, y: 50, width: 30, height: 30, parentId: 'p' });

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [node, child],
      visibleNodes: [node],
      nodes: [],
    });

    const posUpdate = result.positionUpdates.find((u) => u.id === 'p')!;
    expect(posUpdate.position.x).toBe(50 - PAD); // overL = 200+PAD-50=150+PAD; selfX = 200-(150+PAD)
    expect(posUpdate.position.y).toBe(50 - PAD - HEADER);
  });

  it('honors MIN_CONTAINER_WIDTH floor when children overflow tiny parent', () => {
    const node = mkNode({ id: 'p', x: 0, y: 0, width: 50, height: 30, data: { folded: true } });
    const child = mkNode({ id: 'c', x: 5, y: 5, width: 20, height: 20, parentId: 'p' });

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [node, child],
      visibleNodes: [node],
      nodes: [],
    });

    // No left overflow (5 > 0+PAD? PAD=20, 5 < 20 → overflow!). Re-check:
    // overL = 0+PAD - 5 = 15 → selfX -= 15 → -15, selfW += 15 → 65, then floored.
    // Width should be MIN_CONTAINER_WIDTH (240).
    const sizeUpdate = result.sizeUpdates.find((u) => u.id === 'p')!;
    expect(sizeUpdate.width).toBeGreaterThanOrEqual(240);
  });
});

// ─── runUnfoldExpansion — ancestor walk ──────────────────────────────────────

describe('runUnfoldExpansion — ancestor walk', () => {
  it('walks up to grandparent when parent overflows after unfold', () => {
    const gp = mkNode({ id: 'gp', x: 0, y: 0, width: 200, height: 200 });
    const node = mkNode({
      id: 'p',
      x: 50,
      y: 50,
      width: 100,
      height: 60,
      parentId: 'gp',
      data: { folded: true },
    });
    const child = mkNode({ id: 'c', x: 60, y: 60, width: 200, height: 200, parentId: 'p' });

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [gp, node, child],
      visibleNodes: [gp, node],
      nodes: [],
    });

    const ids = result.sizeUpdates.map((u) => u.id);
    expect(ids).toContain('p');
    expect(ids).toContain('gp');
  });

  it('folded grandparent breaks the walk', () => {
    const gp = mkNode({ id: 'gp', x: 0, y: 0, width: 200, height: 200, data: { folded: true } });
    const node = mkNode({
      id: 'p',
      x: 50,
      y: 50,
      width: 100,
      height: 60,
      parentId: 'gp',
      data: { folded: true },
    });
    const child = mkNode({ id: 'c', x: 60, y: 60, width: 500, height: 500, parentId: 'p' });

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [gp, node, child],
      visibleNodes: [gp, node],
      nodes: [],
    });

    const ids = result.sizeUpdates.map((u) => u.id);
    expect(ids).toContain('p');
    expect(ids).not.toContain('gp');
  });

  it('parent with multiple visible siblings → siblingPosLookup covers non-override siblings', () => {
    // Parent contains the unfolding node plus another sibling. Walk
    // computes parent's child bbox using the unfolded-node override AND
    // the sibling's regular x/y bounds (siblingPosLookup branch).
    const gp = mkNode({ id: 'gp', x: 0, y: 0, width: 200, height: 200 });
    const node = mkNode({
      id: 'p',
      x: 50,
      y: 50,
      width: 100,
      height: 60,
      parentId: 'gp',
      data: { folded: true },
    });
    const sibling = mkNode({ id: 'sib', x: 250, y: 100, width: 30, height: 30, parentId: 'gp' });
    const child = mkNode({ id: 'c', x: 60, y: 60, width: 200, height: 200, parentId: 'p' });

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [gp, node, sibling, child],
      visibleNodes: [gp, node, sibling],
      nodes: [],
    });

    // Both the unfolded `p` AND the sibling factor into the gp bbox.
    // Sibling's right edge (250+30=280) past gp's right (200-PAD).
    const ids = result.sizeUpdates.map((u) => u.id);
    expect(ids).toContain('gp');
  });

  it('no parent → no ancestor walk (only self expansion)', () => {
    const node = mkNode({ id: 'lone', x: 0, y: 0, width: 100, height: 60, data: { folded: true } });
    const child = mkNode({ id: 'c', x: 200, y: 200, width: 50, height: 50, parentId: 'lone' });

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [node, child],
      visibleNodes: [node],
      nodes: [],
    });

    // Only the unfolded node should appear in the size update.
    const ids = result.sizeUpdates.map((u) => u.id);
    expect(ids).toEqual(['lone']);
  });
});

describe('runUnfoldExpansion — selfX/Y guards', () => {
  it('selfX/Y unchanged → no position update for self', () => {
    // Children fully inside a large folded parent → no left/top overflow.
    const node = mkNode({ id: 'p', x: 0, y: 0, width: 1000, height: 1000, data: { folded: true } });
    const child = mkNode({ id: 'c', x: 500, y: 500, width: 50, height: 50, parentId: 'p' });

    const result = runUnfoldExpansion({
      node,
      canvasNodes: [node, child],
      visibleNodes: [node],
      nodes: [],
    });

    expect(result.positionUpdates.find((u) => u.id === 'p')).toBeUndefined();
  });
});
