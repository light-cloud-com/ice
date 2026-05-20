/**
 * Connection Validation Rule Tests
 *
 * Drives validateConnections through every issue branch:
 * self/container/invalid edges, anti-patterns, duplicates, cycles.
 */

import { describe, it, expect } from 'vitest';
import { validateConnections } from '../connection-rules';
import type { ValidatableNode, ValidatableEdge, ValidationContext } from '../types';

const ctx: ValidationContext = { mode: 'design' };

const node = (id: string, iceType: string, extra: Partial<ValidatableNode> = {}): ValidatableNode => ({
  id,
  type: 'resource',
  data: { iceType, ...(extra.data ?? {}) },
  ...extra,
});

const edge = (id: string, source: string, target: string, data?: Record<string, unknown>): ValidatableEdge => ({
  id,
  source,
  target,
  data,
});

describe('validateConnections', () => {
  it('returns no issues for valid edges', () => {
    const issues = validateConnections(
      [node('a', 'Compute.Container'), node('b', 'Database.PostgreSQL')],
      [edge('e1', 'a', 'b')],
      ctx,
    );
    expect(issues).toEqual([]);
  });

  it('skips per-edge issue checks when source or target node is missing', () => {
    const issues = validateConnections(
      [node('a', 'Compute.Container')],
      [edge('e1', 'a', 'ghost'), edge('e2', 'ghost', 'a')],
      ctx,
    );
    // No per-edge issues (SELF/CONTAINER/INVALID/DUPLICATE/anti-pattern) should fire —
    // those checks are gated on both endpoints existing and reported by structure-rules.
    expect(issues.filter((i) => i.edgeId === 'e1' || i.edgeId === 'e2')).toEqual([]);
  });

  it('cycle detector skips phantom-target edges (findings #20)', () => {
    // findings.md #20 — previously the cycle-detection adjacency map
    // was built from ALL edges (including phantom targets), producing
    // false-positive `a → ghost → a` reports. The fix filters dataEdges
    // by node-existence so dangling targets can never participate in
    // a cycle.
    const issues = validateConnections(
      [node('a', 'Compute.Container')],
      [edge('e1', 'a', 'ghost'), edge('e2', 'ghost', 'a')],
      ctx,
    );
    expect(issues.find((i) => i.code === 'CYCLE_DETECTED')).toBeUndefined();
  });

  it('skips containment edges entirely', () => {
    const issues = validateConnections(
      [node('vpc', 'Network.VPC', { type: 'container' }), node('svc', 'Compute.Container')],
      [edge('e1', 'vpc', 'svc', { relationship: 'contains' })],
      ctx,
    );
    expect(issues).toEqual([]);
  });

  it('flags self-connections', () => {
    const issues = validateConnections([node('a', 'Compute.Container')], [edge('e1', 'a', 'a')], ctx);
    const self = issues.find((i) => i.code === 'SELF_CONNECTION');
    expect(self?.severity).toBe('error');
    expect(self?.nodeId).toBe('a');
    // Self-connections short-circuit: no other issues should be reported on the same edge
    expect(issues.filter((i) => i.edgeId === 'e1')).toHaveLength(1);
  });

  it('flags edges that touch a container endpoint', () => {
    const issues = validateConnections(
      [node('vpc', 'Network.VPC', { type: 'container' }), node('svc', 'Compute.Container')],
      [edge('e1', 'vpc', 'svc')],
      ctx,
    );
    const container = issues.find((i) => i.code === 'CONTAINER_CONNECTION');
    expect(container?.severity).toBe('error');
  });

  it('flags container endpoints regardless of direction', () => {
    const issues = validateConnections(
      [node('svc', 'Compute.Container'), node('vpc', 'Network.VPC', { type: 'container' })],
      [edge('e1', 'svc', 'vpc')],
      ctx,
    );
    expect(issues.find((i) => i.code === 'CONTAINER_CONNECTION')).toBeTruthy();
  });

  it('flags pairs that fail canConnect', () => {
    const issues = validateConnections(
      [
        node('db1', 'Database.PostgreSQL', { data: { iceType: 'Database.PostgreSQL', label: 'PrimaryDB' } }),
        node('db2', 'Database.PostgreSQL', { data: { iceType: 'Database.PostgreSQL', label: 'ReplicaDB' } }),
      ],
      [edge('e1', 'db1', 'db2')],
      ctx,
    );
    const invalid = issues.find((i) => i.code === 'INVALID_CONNECTION');
    expect(invalid?.severity).toBe('error');
    expect(invalid?.message).toContain('PrimaryDB');
    expect(invalid?.message).toContain('ReplicaDB');
  });

  it('falls back to iceType suffix when label is missing on invalid pairs', () => {
    const issues = validateConnections(
      [node('db1', 'Database.PostgreSQL'), node('db2', 'Database.PostgreSQL')],
      [edge('e1', 'db1', 'db2')],
      ctx,
    );
    const invalid = issues.find((i) => i.code === 'INVALID_CONNECTION');
    expect(invalid?.message).toContain('PostgreSQL');
  });

  it('uses the generic "Source"/"Target" fallback when iceType has no dot', () => {
    const issues = validateConnections([node('a', 'Weird'), node('b', 'Other')], [edge('e1', 'a', 'b')], ctx);
    const invalid = issues.find((i) => i.code === 'INVALID_CONNECTION');
    expect(invalid?.message).toContain('Weird');
    expect(invalid?.message).toContain('Other');
  });

  it('skips canConnect when src or tgt iceType is empty', () => {
    const issues = validateConnections([node('a', ''), node('b', 'Database.PostgreSQL')], [edge('e1', 'a', 'b')], ctx);
    expect(issues.find((i) => i.code === 'INVALID_CONNECTION')).toBeUndefined();
  });

  it('treats an undefined iceType the same as an empty one', () => {
    const issues = validateConnections(
      [
        { id: 'a', type: 'resource', data: {} },
        { id: 'b', type: 'resource', data: { iceType: 'Database.PostgreSQL' } },
      ],
      [edge('e1', 'a', 'b')],
      ctx,
    );
    expect(issues.find((i) => i.code === 'INVALID_CONNECTION')).toBeUndefined();
  });

  it('handles undefined iceType on the target as well', () => {
    const issues = validateConnections(
      [
        { id: 'a', type: 'resource', data: { iceType: 'Database.PostgreSQL' } },
        { id: 'b', type: 'resource', data: {} },
      ],
      [edge('e1', 'a', 'b')],
      ctx,
    );
    expect(issues.find((i) => i.code === 'INVALID_CONNECTION')).toBeUndefined();
  });

  it('flags duplicate edges (any orientation)', () => {
    const issues = validateConnections(
      [node('a', 'Compute.Container'), node('b', 'Database.PostgreSQL')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
      ctx,
    );
    const dup = issues.find((i) => i.code === 'DUPLICATE_EDGE');
    expect(dup?.edgeId).toBe('e2');
    expect(dup?.severity).toBe('warning');
  });

  it('flags Frontend → Database as an anti-pattern', () => {
    const issues = validateConnections(
      [node('fe', 'Compute.StaticSite'), node('db', 'Database.PostgreSQL')],
      [edge('e1', 'fe', 'db')],
      ctx,
    );
    expect(issues.find((i) => i.code === 'FRONTEND_DB_DIRECT')?.severity).toBe('warning');
  });

  it('flags Frontend → Queue as an anti-pattern', () => {
    const issues = validateConnections(
      [node('fe', 'Compute.StaticSite'), node('q', 'Messaging.Queue')],
      [edge('e1', 'fe', 'q')],
      ctx,
    );
    expect(issues.find((i) => i.code === 'FRONTEND_QUEUE_DIRECT')?.severity).toBe('warning');
  });

  it('detects a simple cycle (a → b → a) and reports it once', () => {
    const issues = validateConnections(
      [
        node('a', 'Compute.Container'),
        node('b', 'Compute.Container', { data: { iceType: 'Compute.Container', label: 'API B' } }),
      ],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
      ctx,
    );
    const cycles = issues.filter((i) => i.code === 'CYCLE_DETECTED');
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.message).toContain('→');
  });

  it('detects a longer cycle and only reports the first one found', () => {
    const issues = validateConnections(
      [
        node('a', 'Compute.Container'),
        node('b', 'Compute.Container'),
        node('c', 'Compute.Container'),
        node('d', 'Compute.Container'),
      ],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'a'), edge('e4', 'd', 'c')],
      ctx,
    );
    const cycles = issues.filter((i) => i.code === 'CYCLE_DETECTED');
    expect(cycles).toHaveLength(1);
  });

  it('walks deep DFS chains and unshifts the cycle path back through the stack', () => {
    // Forces the recursive `cycle.unshift(nodeId)` arm of hasCycleDFS — the
    // 4-node ring exercises the path back up through two recursive returns
    // before the final unshift completes the cycle list.
    const issues = validateConnections(
      [
        node('a', 'Compute.Container', { data: { iceType: 'Compute.Container', label: 'A' } }),
        node('b', 'Compute.Container', { data: { iceType: 'Compute.Container', label: 'B' } }),
        node('c', 'Compute.Container', { data: { iceType: 'Compute.Container', label: 'C' } }),
        node('d', 'Compute.Container', { data: { iceType: 'Compute.Container', label: 'D' } }),
      ],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'd'), edge('e4', 'd', 'a')],
      ctx,
    );
    const cycle = issues.find((i) => i.code === 'CYCLE_DETECTED');
    expect(cycle?.message).toMatch(/A.*B.*C.*D|D.*A/);
  });

  it('walks the visited-but-not-on-recursion-stack branch of the DFS', () => {
    // After the first DFS visits a→b, we start a second DFS from c. c→b
    // hits a node that is `visited` but NOT on the recursion stack — so the
    // DFS skips both inner branches without reporting a cycle.
    const issues = validateConnections(
      [node('a', 'Compute.Container'), node('b', 'Compute.Container'), node('c', 'Compute.Container')],
      [edge('e1', 'a', 'b'), edge('e2', 'c', 'b')],
      ctx,
    );
    expect(issues.find((i) => i.code === 'CYCLE_DETECTED')).toBeUndefined();
  });

  it('skips DFS roots that have already been visited via another DFS', () => {
    // 'b' is visited as part of the DFS from 'a'. When the outer for-loop
    // arrives at 'b' as a key in the adjacency map, `visited.has('b')` is
    // already true, so the body is skipped.
    const issues = validateConnections(
      [node('a', 'Compute.Container'), node('b', 'Compute.Container'), node('c', 'Database.PostgreSQL')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')],
      ctx,
    );
    expect(issues.find((i) => i.code === 'CYCLE_DETECTED')).toBeUndefined();
  });

  it('repeats edge insertions into the adjacency map without crashing', () => {
    // Force the `if (!adj.has(e.source)) adj.set(...)` second-pass branch.
    const issues = validateConnections(
      [node('a', 'Compute.Container'), node('b', 'Database.PostgreSQL'), node('c', 'Database.PostgreSQL')],
      [edge('e1', 'a', 'b'), edge('e2', 'a', 'c')],
      ctx,
    );
    // Only DUPLICATE_EDGE / INVALID_CONNECTION issues — no cycle.
    expect(issues.find((i) => i.code === 'CYCLE_DETECTED')).toBeUndefined();
  });

  it('uses a node id slice as the cycle label when label data is missing', () => {
    const issues = validateConnections(
      [node('aaaaaaaaaaaaaaaaaa1', 'Compute.Container'), node('bbbbbbbbbbbbbbbbbb1', 'Compute.Container')],
      [
        edge('e1', 'aaaaaaaaaaaaaaaaaa1', 'bbbbbbbbbbbbbbbbbb1'),
        edge('e2', 'bbbbbbbbbbbbbbbbbb1', 'aaaaaaaaaaaaaaaaaa1'),
      ],
      ctx,
    );
    const cycle = issues.find((i) => i.code === 'CYCLE_DETECTED');
    // 8-char slice fallback used when no label is present
    expect(cycle?.message).toContain('aaaaaaaa');
  });

  it('does not flag a cycle when the only loop edges are containment', () => {
    const issues = validateConnections(
      [node('a', 'Compute.Container'), node('b', 'Compute.Container')],
      [edge('e1', 'a', 'b', { relationship: 'contains' }), edge('e2', 'b', 'a', { relationship: 'contains' })],
      ctx,
    );
    expect(issues.find((i) => i.code === 'CYCLE_DETECTED')).toBeUndefined();
  });

  it('returns an empty issue set for an empty graph', () => {
    expect(validateConnections([], [], ctx)).toEqual([]);
  });
});
