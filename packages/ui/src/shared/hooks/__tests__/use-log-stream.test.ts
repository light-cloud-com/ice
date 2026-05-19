/**
 * `computeCandidateFingerprint` — pure projection over inbound source
 * candidates, used as the dep that drives `useLogStream`'s re-subscribe
 * effect. The hook itself is not render-tested in this repo (no
 * react-hooks testing harness), but the fingerprint is the thing that
 * actually gates correctness: if it doesn't change when a candidate
 * source's `deploy_status` flips from undeployed → `'active'`, the
 * effect doesn't re-run and the UI stays stuck on the pre-deploy
 * placeholder forever after a successful deploy.
 *
 * See bug context in the LT-bugfix unit and the JSDoc on the function.
 */

import { describe, it, expect } from 'vitest';
import { computeCandidateFingerprint } from '../use-log-stream';

const TID = 'log-node-1';

function edge(source: string, target: string): { source: string; target: string } {
  return { source, target };
}

function node(id: string, data: Record<string, unknown> = {}): { id: string; data: Record<string, unknown> } {
  return { id, data };
}

describe('computeCandidateFingerprint', () => {
  it('produces an empty string when there are no edges into the terminal', () => {
    const edges = [edge('n1', 'other-target')];
    const nodes = [node('n1', { iceType: 'Compute.Container', deploy_status: 'active' })];
    expect(computeCandidateFingerprint(edges, nodes, TID)).toBe('');
  });

  it('projects a single candidate as `<id>><iceType>><deployStatus>`', () => {
    const edges = [edge('n1', TID)];
    const nodes = [node('n1', { iceType: 'Compute.Container', deploy_status: 'idle' })];
    expect(computeCandidateFingerprint(edges, nodes, TID)).toBe('n1>Compute.Container>idle');
  });

  it('emits an empty deployStatus segment when the field is absent', () => {
    const edges = [edge('n1', TID)];
    const nodes = [node('n1', { iceType: 'Compute.Container' })];
    // Triple-`>` shape preserved so the slot is present in the fingerprint
    // even before the deploy field exists — the future flip from "" →
    // "active" still changes the string.
    expect(computeCandidateFingerprint(edges, nodes, TID)).toBe('n1>Compute.Container>');
  });

  // The core bug-fix invariant: the projection MUST change when only
  // `deploy_status` changes. If this assertion ever flips, the effect
  // dep stops re-running on deploy completion and the canvas stays
  // stuck on "Deploy this environment to start streaming logs."
  it('produces a different string when `deploy_status` flips from idle → active', () => {
    const edges = [edge('a', TID)];
    const before = computeCandidateFingerprint(edges, [node('a', { iceType: 'X', deploy_status: 'idle' })], TID);
    const after = computeCandidateFingerprint(edges, [node('a', { iceType: 'X', deploy_status: 'active' })], TID);
    expect(before).toBe('a>X>idle');
    expect(after).toBe('a>X>active');
    expect(before).not.toBe(after);
  });

  it('produces a different string when `deploy_status` transitions from absent → active', () => {
    // The pre-deploy → post-deploy path the brief calls out: source node
    // has no `deploy_status` initially, then `deploy.service.ts:1880`
    // writes `'active'`. The fingerprint dep MUST observe this change.
    const edges = [edge('a', TID)];
    const before = computeCandidateFingerprint(edges, [node('a', { iceType: 'X' })], TID);
    const after = computeCandidateFingerprint(edges, [node('a', { iceType: 'X', deploy_status: 'active' })], TID);
    expect(before).toBe('a>X>');
    expect(after).toBe('a>X>active');
    expect(before).not.toBe(after);
  });

  it('is stable (same string) under unrelated mutations on the source node', () => {
    // Label / position / status changes on the source node MUST NOT
    // change the fingerprint — otherwise the hook over-subscribes and
    // we re-introduce the thrash documented in
    // `ux-log-stream-subscribe-thrash-on-mount`.
    const edges = [edge('a', TID)];
    const before = computeCandidateFingerprint(
      edges,
      [node('a', { iceType: 'X', deploy_status: 'active', label: 'API', status: 'active' })],
      TID,
    );
    const after = computeCandidateFingerprint(
      edges,
      [node('a', { iceType: 'X', deploy_status: 'active', label: 'API Renamed', status: 'idle' })],
      TID,
    );
    expect(before).toBe(after);
  });

  it('joins multiple candidates with `|`, sorted for determinism', () => {
    // Two inbound edges from sources `b` and `a`, in that order in the
    // edges array — the join must still come out in sorted order, so
    // edge-ordering churn doesn't churn the fingerprint.
    const edges = [edge('b', TID), edge('a', TID)];
    const nodes = [
      node('a', { iceType: 'Compute.Container', deploy_status: 'idle' }),
      node('b', { iceType: 'Compute.Worker', deploy_status: 'active' }),
    ];
    expect(computeCandidateFingerprint(edges, nodes, TID)).toBe('a>Compute.Container>idle|b>Compute.Worker>active');
  });

  it('handles edges referencing missing source nodes by skipping them', () => {
    const edges = [edge('missing', TID), edge('a', TID)];
    const nodes = [node('a', { iceType: 'X', deploy_status: 'active' })];
    expect(computeCandidateFingerprint(edges, nodes, TID)).toBe('a>X>active');
  });

  it('ignores null / undefined edge slots without throwing', () => {
    const edges = [null, undefined, edge('a', TID)] as Array<{ source: string; target: string } | null | undefined>;
    const nodes = [node('a', { iceType: 'X', deploy_status: 'active' })];
    expect(computeCandidateFingerprint(edges, nodes, TID)).toBe('a>X>active');
  });

  it('produces a different fingerprint when a candidate iceType changes', () => {
    // Existing behavior, preserved: switching the source's iceType
    // re-subscribes (the resolver may now return a different state).
    const edges = [edge('a', TID)];
    const before = computeCandidateFingerprint(
      edges,
      [node('a', { iceType: 'Compute.Container', deploy_status: 'active' })],
      TID,
    );
    const after = computeCandidateFingerprint(
      edges,
      [node('a', { iceType: 'Compute.Worker', deploy_status: 'active' })],
      TID,
    );
    expect(before).not.toBe(after);
  });

  it('produces a different fingerprint when an inbound edge is added', () => {
    // Existing behavior, preserved: wiring a new source re-subscribes.
    const nodes = [
      node('a', { iceType: 'X', deploy_status: 'active' }),
      node('b', { iceType: 'Y', deploy_status: 'active' }),
    ];
    const before = computeCandidateFingerprint([edge('a', TID)], nodes, TID);
    const after = computeCandidateFingerprint([edge('a', TID), edge('b', TID)], nodes, TID);
    expect(before).not.toBe(after);
  });
});
