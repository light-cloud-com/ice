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
import { deriveRollup, orderNodesForPanel } from '../derive';
import type { NodeDeployState } from '../types';
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
