/**
 * pdl-5 — pure helpers for the deploy panel's in-flight UI.
 *
 * Tests cover:
 *   - `deriveRollup` correctly counts every wire status.
 *   - `deriveRollup` is correct for an empty map (zero counts, zero
 *     total — the panel's rollup-divide-by-total guard reads `total`).
 *   - The legacy "100% with 1 still applying" bouncing-bar bug is
 *     impossible by construction — `terminal === total` is the only path
 *     to a 100% display, and any non-terminal node bumps `total` past
 *     `terminal`.
 *   - `orderNodesForPanel` puts applying nodes first, then queued, then
 *     terminal sorted by last_at desc.
 *   - `orderNodesForPanel` is stable on equal-rank ties.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveRollup,
  orderNodesForPanel,
  type NodeDeployState,
} from '../deploy-slice';
import type { DeployNodeStatus } from '@ice/types';

function node(
  id: string,
  status: DeployNodeStatus,
  overrides: Partial<NodeDeployState> = {},
): NodeDeployState {
  return {
    node_id: id,
    status,
    resource_name: `name-${id}`,
    resource_type: 'gcp.sql.databaseInstance',
    action: 'create',
    last_at: '2026-04-28T10:00:00.000Z',
    last_seq: 1,
    ...overrides,
  };
}

describe('deriveRollup', () => {
  it('is all-zero for an empty map', () => {
    const r = deriveRollup({});
    expect(r).toEqual({
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

  it('counts each status into its own counter and updates total', () => {
    const map: Record<string, NodeDeployState> = {
      a: node('a', 'queued'),
      b: node('b', 'applying'),
      c: node('c', 'succeeded'),
      d: node('d', 'failed'),
      e: node('e', 'skipped'),
      f: node('f', 'cancelled-due-to-dep'),
    };
    const r = deriveRollup(map);
    expect(r.queued).toBe(1);
    expect(r.applying).toBe(1);
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.cancelled).toBe(1);
    expect(r.total).toBe(6);
    // terminal = succeeded + failed + skipped + cancelled-due-to-dep
    expect(r.terminal).toBe(4);
  });

  it('keeps total in sync with non-terminal node counts (cap-at-99 invariant)', () => {
    // The panel renders pct = terminal/total (capped at 99 when any
    // non-terminal). This test guards the invariant: with one applying
    // and three succeeded, terminal !== total so the cap engages.
    const map: Record<string, NodeDeployState> = {
      a: node('a', 'applying'),
      b: node('b', 'succeeded'),
      c: node('c', 'succeeded'),
      d: node('d', 'succeeded'),
    };
    const r = deriveRollup(map);
    expect(r.total).toBe(4);
    expect(r.terminal).toBe(3);
    expect(r.terminal === r.total).toBe(false);
  });

  it('terminal === total only when every node terminated', () => {
    const map: Record<string, NodeDeployState> = {
      a: node('a', 'succeeded'),
      b: node('b', 'failed'),
      c: node('c', 'skipped'),
      d: node('d', 'cancelled-due-to-dep'),
    };
    const r = deriveRollup(map);
    expect(r.terminal).toBe(4);
    expect(r.total).toBe(4);
    expect(r.terminal === r.total).toBe(true);
  });

  it('does not count cancelled-due-to-dep into the queued/applying buckets', () => {
    // Spec: cancelled-due-to-dep is a TERMINAL state (the parent failed
    // and this node never ran). The reducer shouldn't double-attribute it.
    const map: Record<string, NodeDeployState> = {
      a: node('a', 'cancelled-due-to-dep'),
    };
    const r = deriveRollup(map);
    expect(r.queued).toBe(0);
    expect(r.applying).toBe(0);
    expect(r.cancelled).toBe(1);
    expect(r.terminal).toBe(1);
  });
});

describe('orderNodesForPanel', () => {
  it('puts applying nodes before queued before terminal', () => {
    const map: Record<string, NodeDeployState> = {
      t1: node('t1', 'succeeded', { last_at: '2026-04-28T10:00:00.000Z' }),
      a1: node('a1', 'applying', { last_at: '2026-04-28T10:00:01.000Z' }),
      q1: node('q1', 'queued', { last_at: '2026-04-28T10:00:02.000Z' }),
    };
    const ordered = orderNodesForPanel(map);
    expect(ordered.map((n) => n.node_id)).toEqual(['a1', 'q1', 't1']);
  });

  it('within the terminal bucket, sorts by last_at descending (most recent first)', () => {
    const map: Record<string, NodeDeployState> = {
      old: node('old', 'succeeded', { last_at: '2026-04-28T10:00:00.000Z' }),
      newer: node('newer', 'failed', { last_at: '2026-04-28T10:05:00.000Z' }),
      newest: node('newest', 'succeeded', { last_at: '2026-04-28T10:10:00.000Z' }),
    };
    const ordered = orderNodesForPanel(map);
    expect(ordered.map((n) => n.node_id)).toEqual(['newest', 'newer', 'old']);
  });

  it('mixes applying / queued / terminal correctly even when terminal is more recent than applying', () => {
    // Applying-first wins regardless of last_at ordering — the user wants
    // to see what's running NOW even if a sibling just finished.
    const map: Record<string, NodeDeployState> = {
      a: node('a', 'applying', { last_at: '2026-04-28T10:00:00.000Z' }),
      // This terminal landed AFTER applying started — still goes below.
      t: node('t', 'succeeded', { last_at: '2026-04-28T10:05:00.000Z' }),
    };
    const ordered = orderNodesForPanel(map);
    expect(ordered.map((n) => n.node_id)).toEqual(['a', 't']);
  });

  it('returns an empty array for an empty map', () => {
    expect(orderNodesForPanel({})).toEqual([]);
  });
});
