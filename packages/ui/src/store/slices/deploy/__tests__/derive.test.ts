/**
 * Tests for `deploy/derive.ts` — pure derived-view helpers.
 *
 * Both `deriveRollup` and `orderNodesForPanel` are pure projections from
 * the per-node live state map. They have no slice-state side-effects and
 * are exercised here directly with constructed `NodeDeployState` records.
 *
 * @see rf-dslice-2
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { deriveRollup, deriveRollupPercentage, orderNodesForPanel } from '../derive';
import type { DeployRollup, NodeDeployState } from '../types';
import type { DeployNodeStatus } from '@ice/types';

function makeNode(id: string, status: DeployNodeStatus, last_at = '2026-01-01T00:00:00.000Z'): NodeDeployState {
  return {
    node_id: id,
    status,
    resource_name: id,
    resource_type: 'gcp.run.service',
    action: 'create',
    last_at,
    last_seq: 1,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------------
// deriveRollup
// -----------------------------------------------------------------------------

describe('deriveRollup', () => {
  it('returns all-zero counts when nodesById is empty', () => {
    expect(deriveRollup({})).toEqual({
      queued: 0,
      applying: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
      total: 0,
      terminal: 0,
    });
  });

  it('counts a single queued node', () => {
    const r = deriveRollup({ a: makeNode('a', 'queued') });
    expect(r.queued).toBe(1);
    expect(r.total).toBe(1);
    expect(r.terminal).toBe(0);
  });

  it('counts a single applying node — non-terminal', () => {
    const r = deriveRollup({ a: makeNode('a', 'applying') });
    expect(r.applying).toBe(1);
    expect(r.terminal).toBe(0);
  });

  it('counts succeeded → terminal +1', () => {
    const r = deriveRollup({ a: makeNode('a', 'succeeded') });
    expect(r.succeeded).toBe(1);
    expect(r.terminal).toBe(1);
  });

  it('counts failed → terminal +1', () => {
    const r = deriveRollup({ a: makeNode('a', 'failed') });
    expect(r.failed).toBe(1);
    expect(r.terminal).toBe(1);
  });

  it('counts skipped → terminal +1', () => {
    const r = deriveRollup({ a: makeNode('a', 'skipped') });
    expect(r.skipped).toBe(1);
    expect(r.terminal).toBe(1);
  });

  it('counts cancelled-due-to-dep → cancelled +1, terminal +1', () => {
    const r = deriveRollup({ a: makeNode('a', 'cancelled-due-to-dep') });
    expect(r.cancelled).toBe(1);
    expect(r.terminal).toBe(1);
  });

  it('aggregates a mixed set — bucket sums equal total', () => {
    const r = deriveRollup({
      a: makeNode('a', 'queued'),
      b: makeNode('b', 'applying'),
      c: makeNode('c', 'succeeded'),
      d: makeNode('d', 'failed'),
      e: makeNode('e', 'skipped'),
      f: makeNode('f', 'cancelled-due-to-dep'),
    });
    expect(r.total).toBe(6);
    expect(r.queued).toBe(1);
    expect(r.applying).toBe(1);
    expect(r.terminal).toBe(4);
    expect(r.queued + r.applying + r.succeeded + r.failed + r.skipped + r.cancelled).toBe(r.total);
  });

  it('handles unknown status: warns + does NOT count toward total (drift guard)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const node = makeNode('a', 'queued');
    // Force an out-of-contract status to exercise the default arm.
    (node as unknown as { status: string }).status = 'fictional-future-status';
    const r = deriveRollup({ a: node });
    expect(r.total).toBe(0);
    expect(r.queued).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      '[deploy-rollup] unknown node status:',
      'fictional-future-status',
      '— not counted in rollup',
    );
  });
});

// -----------------------------------------------------------------------------
// orderNodesForPanel
// -----------------------------------------------------------------------------

describe('orderNodesForPanel', () => {
  it('returns an empty list when nodesById is empty', () => {
    expect(orderNodesForPanel({})).toEqual([]);
  });

  it('orders applying first, queued second, terminal third', () => {
    const result = orderNodesForPanel({
      t: makeNode('t', 'succeeded'),
      q: makeNode('q', 'queued'),
      a: makeNode('a', 'applying'),
    });
    expect(result.map((n) => n.node_id)).toEqual(['a', 'q', 't']);
  });

  it('within the terminal bucket, sorts by last_at descending (newest first)', () => {
    const result = orderNodesForPanel({
      x: makeNode('x', 'succeeded', '2026-01-01T00:00:00.000Z'),
      y: makeNode('y', 'failed', '2026-01-03T00:00:00.000Z'),
      z: makeNode('z', 'skipped', '2026-01-02T00:00:00.000Z'),
    });
    expect(result.map((n) => n.node_id)).toEqual(['y', 'z', 'x']);
  });

  it('does not reorder applying or queued by last_at (only rank-2 sorts by time)', () => {
    const result = orderNodesForPanel({
      a: makeNode('a', 'applying', '2026-01-03T00:00:00.000Z'),
      b: makeNode('b', 'applying', '2026-01-01T00:00:00.000Z'),
    });
    // Both rank 0; equal; insertion order preserved.
    expect(result.map((n) => n.node_id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input map', () => {
    const map = {
      a: makeNode('a', 'applying'),
      b: makeNode('b', 'queued'),
    };
    const before = Object.values(map).map((n) => n.node_id);
    orderNodesForPanel(map);
    expect(Object.values(map).map((n) => n.node_id)).toEqual(before);
  });
});

// -----------------------------------------------------------------------------
// deriveRollupPercentage
// -----------------------------------------------------------------------------

function makeRollup(overrides: Partial<DeployRollup> = {}): DeployRollup {
  return {
    queued: 0,
    applying: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    total: 0,
    terminal: 0,
    ...overrides,
  };
}

describe('deriveRollupPercentage', () => {
  it('returns 0 when total is 0', () => {
    expect(deriveRollupPercentage(makeRollup())).toBe(0);
  });

  it('returns 100 when terminal === total (everything finished)', () => {
    expect(deriveRollupPercentage(makeRollup({ total: 5, terminal: 5, succeeded: 5 }))).toBe(100);
  });

  it('caps at 99% while any node is still queued or applying', () => {
    // 3/4 terminal would round to 75; cap kicks in only at the 99 boundary.
    expect(deriveRollupPercentage(makeRollup({ total: 4, terminal: 3, applying: 1 }))).toBe(75);
    // 99/100 → would round to 99 anyway; cap is a no-op below the threshold.
    expect(deriveRollupPercentage(makeRollup({ total: 100, terminal: 99, applying: 1 }))).toBe(99);
    // 199/200 → rounds to 100 without the cap; with the cap holds at 99.
    expect(deriveRollupPercentage(makeRollup({ total: 200, terminal: 199, applying: 1 }))).toBe(99);
  });

  it('rounds to nearest integer', () => {
    // 1/3 → 33.333… → 33
    expect(deriveRollupPercentage(makeRollup({ total: 3, terminal: 1, applying: 2 }))).toBe(33);
    // 2/3 → 66.666… → 67
    expect(deriveRollupPercentage(makeRollup({ total: 3, terminal: 2, applying: 1 }))).toBe(67);
  });

  it('falls back to total=1 in the divisor for zero-total edge case (defensive)', () => {
    // Caller already guards total === 0 → returns 0; this shouldn't be reachable,
    // but the inline `Math.max(rollup.total, 1)` guard documents the intent.
    expect(deriveRollupPercentage(makeRollup({ total: 0, terminal: 0 }))).toBe(0);
  });
});
