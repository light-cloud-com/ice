/**
 * rf-aiop-4 — resolveBlueprint tests.
 *
 * `resolveBlueprint` calls into `@ice/blocks` (getBlueprint + expandBlueprint),
 * so the tests stub those at the module-import boundary via `vi.mock`. The
 * tests pin the four behaviors:
 *   1. Blueprint not found → returns null
 *   2. Position falls back to findPosition() when op.position is missing
 *   3. Label overrides data.label after expandBlueprint
 *   4. dataOverrides merges shallowly into data after expandBlueprint
 *   5. parentId is resolved through the idMap before being threaded into expandBlueprint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist-safe mock module — must be declared before the import that triggers it.
vi.mock('../../../../../config/blocks', () => ({
  getBlueprint: vi.fn(),
  expandBlueprint: vi.fn(),
}));

import { resolveBlueprint } from '../blueprint-resolver';
import { getBlueprint, expandBlueprint } from '../../../../../config/blocks';
import type { Card, CardNode } from '../../../../../store/slices/cards-slice';
import type { AddBlueprintOp } from '@ice/types';

const mockGetBlueprint = vi.mocked(getBlueprint);
const mockExpandBlueprint = vi.mocked(expandBlueprint);

function makeCard(nodes: CardNode[] = []): Card {
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

describe('rf-aiop-4 resolveBlueprint', () => {
  beforeEach(() => {
    mockGetBlueprint.mockReset();
    mockExpandBlueprint.mockReset();
  });

  it('returns null when getBlueprint returns no match', () => {
    mockGetBlueprint.mockReturnValue(undefined as never);
    const op: AddBlueprintOp = { op: 'addBlueprint', iceType: 'Unknown.Type' };
    expect(resolveBlueprint(op, makeCard(), new Map())).toBeNull();
    expect(mockExpandBlueprint).not.toHaveBeenCalled();
  });

  it('uses op.position when provided (skips findPosition)', () => {
    mockGetBlueprint.mockReturnValue({ id: 'bp', iceType: 'X' } as never);
    const expanded = makeNode({ id: 'real', position: { x: 0, y: 0 } });
    mockExpandBlueprint.mockReturnValue({ node: expanded } as never);

    const op: AddBlueprintOp = {
      op: 'addBlueprint',
      iceType: 'X',
      position: { x: 50, y: 60 },
    };
    resolveBlueprint(op, makeCard(), new Map());

    const callArgs = mockExpandBlueprint.mock.calls[0]?.[1] as { position: { x: number; y: number } };
    expect(callArgs.position).toEqual({ x: 50, y: 60 });
  });

  it('falls back to findPosition when op.position is missing', () => {
    mockGetBlueprint.mockReturnValue({ id: 'bp', iceType: 'X' } as never);
    const expanded = makeNode({ id: 'real', position: { x: 0, y: 0 } });
    mockExpandBlueprint.mockReturnValue({ node: expanded } as never);

    const op: AddBlueprintOp = { op: 'addBlueprint', iceType: 'X' };
    resolveBlueprint(op, makeCard(), new Map());

    const callArgs = mockExpandBlueprint.mock.calls[0]?.[1] as { position: { x: number; y: number } };
    // Empty card → root position (100, 100)
    expect(callArgs.position).toEqual({ x: 100, y: 100 });
  });

  it('resolves parentId through the idMap', () => {
    mockGetBlueprint.mockReturnValue({ id: 'bp', iceType: 'X' } as never);
    const expanded = makeNode({ id: 'real' });
    mockExpandBlueprint.mockReturnValue({ node: expanded } as never);

    const op: AddBlueprintOp = {
      op: 'addBlueprint',
      iceType: 'X',
      parentId: 'ai-placeholder-parent',
      position: { x: 0, y: 0 },
    };
    const idMap = new Map([['ai-placeholder-parent', 'real-parent-7']]);
    resolveBlueprint(op, makeCard(), idMap);

    const callArgs = mockExpandBlueprint.mock.calls[0]?.[1] as { parentContainerId?: string };
    expect(callArgs.parentContainerId).toBe('real-parent-7');
  });

  it('overrides data.label when op.label is provided', () => {
    mockGetBlueprint.mockReturnValue({ id: 'bp', iceType: 'X' } as never);
    const expanded = makeNode({
      id: 'real',
      data: { label: 'Default', iceType: 'X' },
    });
    mockExpandBlueprint.mockReturnValue({ node: expanded } as never);

    const op: AddBlueprintOp = {
      op: 'addBlueprint',
      iceType: 'X',
      label: 'Overridden',
      position: { x: 0, y: 0 },
    };
    const result = resolveBlueprint(op, makeCard(), new Map());

    expect(result?.data.label).toBe('Overridden');
    // iceType from blueprint is preserved
    expect(result?.data.iceType).toBe('X');
  });

  it('shallow-merges dataOverrides into data', () => {
    mockGetBlueprint.mockReturnValue({ id: 'bp', iceType: 'X' } as never);
    const expanded = makeNode({
      id: 'real',
      data: { label: 'L', iceType: 'X', existing: 'a' },
    });
    mockExpandBlueprint.mockReturnValue({ node: expanded } as never);

    const op: AddBlueprintOp = {
      op: 'addBlueprint',
      iceType: 'X',
      dataOverrides: { existing: 'b', custom: 'c' },
      position: { x: 0, y: 0 },
    };
    const result = resolveBlueprint(op, makeCard(), new Map());

    expect(result?.data).toMatchObject({ label: 'L', iceType: 'X', existing: 'b', custom: 'c' });
  });

  it('label is applied BEFORE dataOverrides — dataOverrides.label wins if both set', () => {
    mockGetBlueprint.mockReturnValue({ id: 'bp', iceType: 'X' } as never);
    const expanded = makeNode({ id: 'real', data: { label: 'Default' } });
    mockExpandBlueprint.mockReturnValue({ node: expanded } as never);

    const op: AddBlueprintOp = {
      op: 'addBlueprint',
      iceType: 'X',
      label: 'FromLabel',
      dataOverrides: { label: 'FromOverrides' },
      position: { x: 0, y: 0 },
    };
    const result = resolveBlueprint(op, makeCard(), new Map());

    // Source code applies label first, then dataOverrides — so overrides win.
    expect(result?.data.label).toBe('FromOverrides');
  });

  it('passes provider through when set on op', () => {
    mockGetBlueprint.mockReturnValue({ id: 'bp', iceType: 'X' } as never);
    const expanded = makeNode({ id: 'real' });
    mockExpandBlueprint.mockReturnValue({ node: expanded } as never);

    const op: AddBlueprintOp = {
      op: 'addBlueprint',
      iceType: 'X',
      provider: 'aws',
      position: { x: 0, y: 0 },
    };
    resolveBlueprint(op, makeCard(), new Map());

    expect(mockGetBlueprint).toHaveBeenCalledWith('X', 'aws');
    const callArgs = mockExpandBlueprint.mock.calls[0]?.[1] as { provider?: string };
    expect(callArgs.provider).toBe('aws');
  });
});
