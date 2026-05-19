/**
 * rf-aiop-6 — connectOrphanHelpers tests.
 *
 * Pin the safety-net behavior: orphan helpers (no edges) get connected
 * to the first detected backend with `relationship: 'depends_on'`. The
 * function is the only place in the AI op pipeline that auto-creates
 * edges that weren't in the AI response, so the regex match windows
 * matter.
 */

import { describe, it, expect, vi } from 'vitest';
import { connectOrphanHelpers } from '../orphan-helpers';
import type { AppDispatch } from '../../../../../store';
import type { Card, CardNode } from '../../../../../store/slices/cards-slice';

function makeCard(nodes: CardNode[], edges: Card['edges'] = []): Card {
  return {
    id: 'card-1',
    name: 'T',
    nodes,
    edges,
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

describe('rf-aiop-6 connectOrphanHelpers', () => {
  it('returns 0 when no backends exist', () => {
    const { dispatch, calls } = makeDispatch();
    const card = makeCard([makeNode({ id: 'helper', data: { iceType: 'Security.IAM' } })]);
    expect(connectOrphanHelpers(dispatch, card)).toBe(0);
    expect(calls).toEqual([]);
  });

  it('returns 0 when no orphan helpers exist', () => {
    const { dispatch, calls } = makeDispatch();
    const card = makeCard([makeNode({ id: 'backend', data: { iceType: 'Compute.Container' } })]);
    expect(connectOrphanHelpers(dispatch, card)).toBe(0);
    expect(calls).toEqual([]);
  });

  it('connects an orphan helper to the first backend with depends_on relationship', () => {
    const { dispatch, calls } = makeDispatch();
    const card = makeCard([
      makeNode({ id: 'b1', data: { iceType: 'Compute.Container' } }),
      makeNode({ id: 'h1', data: { iceType: 'Security.IAM' } }),
    ]);
    expect(connectOrphanHelpers(dispatch, card)).toBe(1);
    expect(calls).toHaveLength(1);
    const payload = calls[0].payload as {
      id: string;
      source: string;
      target: string;
      data: { relationship: string };
    };
    expect(payload.source).toBe('b1');
    expect(payload.target).toBe('h1');
    expect(payload.data.relationship).toBe('depends_on');
    expect(payload.id).toMatch(/^edge-\d+-\d+$/);
  });

  it('skips helpers that already have an edge', () => {
    const { dispatch, calls } = makeDispatch();
    const card = makeCard(
      [
        makeNode({ id: 'b1', data: { iceType: 'Compute.Container' } }),
        makeNode({ id: 'h-connected', data: { iceType: 'Security.IAM' } }),
        makeNode({ id: 'h-orphan', data: { iceType: 'Monitoring.Log' } }),
      ],
      [{ id: 'e1', source: 'b1', target: 'h-connected' }],
    );
    expect(connectOrphanHelpers(dispatch, card)).toBe(1);
    expect(calls).toHaveLength(1);
    expect((calls[0].payload as { target: string }).target).toBe('h-orphan');
  });

  it('uses backends[0] (first node order) when multiple backends exist', () => {
    const { dispatch, calls } = makeDispatch();
    const card = makeCard([
      makeNode({ id: 'first-backend', data: { iceType: 'Compute.Backend' } }),
      makeNode({ id: 'second-backend', data: { iceType: 'Compute.Worker' } }),
      makeNode({ id: 'helper', data: { iceType: 'Security.IAM' } }),
    ]);
    expect(connectOrphanHelpers(dispatch, card)).toBe(1);
    expect((calls[0].payload as { source: string }).source).toBe('first-backend');
  });

  it('does NOT match container-typed nodes as backends (n.type !== "container" guard)', () => {
    const { dispatch, calls } = makeDispatch();
    const card = makeCard([
      makeNode({
        id: 'container-bg',
        type: 'container',
        data: { iceType: 'Compute.Backend' },
      }),
      makeNode({ id: 'helper', data: { iceType: 'Security.IAM' } }),
    ]);
    // No non-container backend → no dispatches
    expect(connectOrphanHelpers(dispatch, card)).toBe(0);
    expect(calls).toEqual([]);
  });

  it('connects multiple orphan helpers in one pass', () => {
    const { dispatch, calls } = makeDispatch();
    const card = makeCard([
      makeNode({ id: 'b1', data: { iceType: 'Compute.Service' } }),
      makeNode({ id: 'h1', data: { iceType: 'Auth.OAuth' } }),
      makeNode({ id: 'h2', data: { iceType: 'Security.Secret' } }),
      makeNode({ id: 'h3', data: { iceType: 'Monitoring.Trace' } }),
    ]);
    expect(connectOrphanHelpers(dispatch, card)).toBe(3);
    expect(calls).toHaveLength(3);
    const targets = calls.map((c) => (c.payload as { target: string }).target);
    expect(new Set(targets)).toEqual(new Set(['h1', 'h2', 'h3']));
  });

  it('helper regex matches identity/observ partial words', () => {
    const { dispatch } = makeDispatch();
    const card = makeCard([
      makeNode({ id: 'b1', data: { iceType: 'Compute.Container' } }),
      makeNode({ id: 'h-identity', data: { iceType: 'Identity.Federation' } }),
      makeNode({ id: 'h-observ', data: { iceType: 'Observability.Trace' } }),
    ]);
    expect(connectOrphanHelpers(dispatch, card)).toBe(2);
  });

  it('falls back to empty-string iceType for nodes with no data.iceType (no match)', () => {
    const { dispatch, calls } = makeDispatch();
    // Node with no iceType at all — exercises the `|| ''` coalesce path in
    // both backend and helper-detection regex tests. None of these match,
    // so no edges get dispatched.
    const card = makeCard([
      makeNode({ id: 'b1', data: { iceType: 'Compute.Container' } }),
      makeNode({ id: 'no-icetype', data: {} }),
    ]);
    expect(connectOrphanHelpers(dispatch, card)).toBe(0);
    expect(calls).toEqual([]);
  });
});
