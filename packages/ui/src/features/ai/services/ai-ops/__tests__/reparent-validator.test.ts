/**
 * rf-aiop-7 — validateReparent tests.
 *
 * The validator returns a discriminated union { kind: 'skip', reason } |
 * { kind: 'ok', resolvedParentId }. Tests pin the 4 verdict paths and the
 * exact reason-string formats so the orchestrator's skippedOps logging
 * stays unchanged.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../../config/containment-rules', () => ({
  canContain: vi.fn(),
}));

import { canContain } from '../../../../../config/containment-rules';
import { validateReparent } from '../reparent-validator';
import type { Card, CardNode } from '../../../../../store/slices/cards-slice';

const mockCanContain = vi.mocked(canContain);

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

describe('rf-aiop-7 validateReparent', () => {
  it('skips when parent node is not in the card (default originalParentId = resolved)', () => {
    const child = makeNode({ id: 'c1' });
    const card = makeCard([child]);
    const verdict = validateReparent(card, child, 'missing-parent');
    expect(verdict).toEqual({ kind: 'skip', reason: 'Parent node not found: missing-parent' });
  });

  it('uses originalParentId in the not-found reason when provided', () => {
    const child = makeNode({ id: 'c1' });
    const card = makeCard([child]);
    // Caller passes BOTH the resolved id (used for lookup) and the original
    // AI-supplied placeholder id (used in the user-facing message).
    const verdict = validateReparent(card, child, 'resolved-real', 'ai-placeholder-parent');
    expect(verdict).toEqual({ kind: 'skip', reason: 'Parent node not found: ai-placeholder-parent' });
  });

  it('skips when parent node is not a container, using label when present', () => {
    const child = makeNode({ id: 'c1' });
    const parent = makeNode({ id: 'p1', type: 'block', data: { label: 'My Parent' } });
    const card = makeCard([parent, child]);
    const verdict = validateReparent(card, child, 'p1');
    expect(verdict).toEqual({ kind: 'skip', reason: 'My Parent is not a container' });
  });

  it('skips when parent node is not a container, falling back to id when no label', () => {
    const child = makeNode({ id: 'c1' });
    const parent = makeNode({ id: 'p1', type: 'block' });
    const card = makeCard([parent, child]);
    const verdict = validateReparent(card, child, 'p1');
    expect(verdict).toEqual({ kind: 'skip', reason: 'p1 is not a container' });
  });

  it('skips when canContain rejects the parent/child iceType pair', () => {
    mockCanContain.mockReturnValue(false);
    const child = makeNode({ id: 'c1', data: { iceType: 'Database.PostgreSQL' } });
    const parent = makeNode({
      id: 'p1',
      type: 'container',
      data: { iceType: 'Network.VPC' },
    });
    const card = makeCard([parent, child]);
    const verdict = validateReparent(card, child, 'p1');
    expect(verdict).toEqual({
      kind: 'skip',
      reason: 'Network.VPC cannot contain Database.PostgreSQL',
    });
    expect(mockCanContain).toHaveBeenCalledWith('Network.VPC', 'Database.PostgreSQL');
  });

  it('returns ok when the container is allowed by containment rules', () => {
    mockCanContain.mockReturnValue(true);
    const child = makeNode({ id: 'c1', data: { iceType: 'Compute.Container' } });
    const parent = makeNode({
      id: 'p1',
      type: 'container',
      data: { iceType: 'Network.VPC' },
    });
    const card = makeCard([parent, child]);
    const verdict = validateReparent(card, child, 'p1');
    expect(verdict).toEqual({ kind: 'ok', resolvedParentId: 'p1' });
  });

  it('returns ok when iceTypes are missing on either side (canContain skipped)', () => {
    // No iceType on either node → canContain check is skipped entirely.
    const child = makeNode({ id: 'c1' });
    const parent = makeNode({ id: 'p1', type: 'container' });
    const card = makeCard([parent, child]);
    const verdict = validateReparent(card, child, 'p1');
    expect(verdict).toEqual({ kind: 'ok', resolvedParentId: 'p1' });
  });
});
