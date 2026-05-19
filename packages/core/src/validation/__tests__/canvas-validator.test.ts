/**
 * Canvas Validator (Orchestrator) Tests
 *
 * Drives validateCanvas + validateNode + the buildResult helper through
 * deduplication, severity bucketing, byNode/byEdge grouping, deployable
 * gating, and the design vs pre-deploy mode split.
 */

import { describe, it, expect } from 'vitest';
import { validateCanvas, validateNode } from '../canvas-validator';
import type { ValidatableNode, ValidatableEdge } from '../types';

const node = (
  id: string,
  iceType: string,
  data: Record<string, unknown> = {},
  type: string = 'resource',
): ValidatableNode => ({ id, type, data: { iceType, ...data } });

const edge = (id: string, source: string, target: string, data?: Record<string, unknown>): ValidatableEdge => ({
  id,
  source,
  target,
  data,
});

describe('validateCanvas', () => {
  it('returns a deployable + valid result for an empty design canvas', () => {
    const r = validateCanvas([], []);
    expect(r.valid).toBe(true);
    expect(r.deployable).toBe(true);
    expect(r.summary).toEqual({ errors: 0, warnings: 0, info: 0 });
    expect(r.issues).toEqual([]);
    expect(r.issuesByNode.size).toBe(0);
    expect(r.issuesByEdge.size).toBe(0);
    // ISO timestamp should round-trip
    expect(() => new Date(r.validatedAt).toISOString()).not.toThrow();
  });

  it('runs structure + property + connection rules in design mode', () => {
    const r = validateCanvas([node('a', 'Compute.Container'), node('a', 'Database.PostgreSQL')], []);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === 'DUPLICATE_NODE_ID')).toBe(true);
  });

  it('skips deploy + architecture rules in design mode', () => {
    const r = validateCanvas([node('a', 'Compute.Container')], []);
    expect(r.issues.some((i) => i.category === 'deploy')).toBe(false);
    expect(r.issues.some((i) => i.category === 'architecture')).toBe(false);
  });

  it('runs deploy + architecture rules in pre-deploy mode', () => {
    const r = validateCanvas([node('fe', 'Compute.StaticSite')], [], { mode: 'pre-deploy', provider: 'aws' });
    // Should not crash; architecture warns about no backend, deploy says nothing
    // because StaticSite IS deployable on AWS.
    expect(r.issues.some((i) => i.category === 'architecture')).toBe(true);
  });

  it('flips both valid and deployable to false when any error is present', () => {
    // The result builder gates `deployable` on `errors.length === 0 && !hasDeployErrors`,
    // so a non-deploy error (duplicate id) still makes both flags false.
    const r = validateCanvas([node('a', 'Compute.Container'), node('a', 'Database.PostgreSQL')], [], {
      mode: 'pre-deploy',
      provider: 'aws',
    });
    expect(r.valid).toBe(false);
    expect(r.deployable).toBe(false);
  });

  it('marks deployable false when a deploy-category error fires', () => {
    const r = validateCanvas(
      [node('a', 'Compute.Container')],
      [],
      { mode: 'pre-deploy' }, // no provider → deploy:NO_PROVIDER error
    );
    expect(r.deployable).toBe(false);
  });

  it('groups issues by node and edge', () => {
    const r = validateCanvas(
      [node('a', 'Compute.Container'), node('a', 'Database.PostgreSQL')],
      [edge('e1', 'ghost', 'a')],
    );
    // duplicate node id → nodeId 'a'
    expect(r.issuesByNode.get('a')?.some((i) => i.code === 'DUPLICATE_NODE_ID')).toBe(true);
    // dangling edge → edgeId 'e1'
    expect(r.issuesByEdge.get('e1')?.some((i) => i.code === 'DANGLING_EDGE_SOURCE')).toBe(true);
  });

  it('deduplicates issues by their id', () => {
    // The orphan rule already produces unique IDs per node — to force a
    // duplicate, exercise validateNode passing the same node twice would
    // not work because each call returns a fresh array. Instead: run the
    // canvas so that the same dangling edge is reported once even though
    // `validateStructure` could emit both source and target dangling on one
    // edge — but they have different codes. The dedup primarily protects
    // against future double-emission. We can verify by inspecting the result
    // shape — issue ids must be unique.
    const r = validateCanvas([node('a', 'Compute.Container')], [edge('e1', 'ghost', 'phantom')]);
    const seen = new Set(r.issues.map((i) => i.id));
    expect(seen.size).toBe(r.issues.length);
  });

  it('summarises severities accurately', () => {
    const r = validateCanvas(
      [
        // duplicate id → error
        node('a', 'Compute.Container'),
        node('a', 'Database.PostgreSQL'),
        // orphan → info
        node('orphan', 'Database.PostgreSQL'),
      ],
      [],
    );
    expect(r.summary.errors).toBeGreaterThan(0);
    expect(r.summary.info).toBeGreaterThan(0);
  });
});

describe('validateNode', () => {
  it('returns property-only issues for a single node', () => {
    // Real PostgreSQL has required props; an empty payload should fail.
    const issues = validateNode(node('a', 'Database.PostgreSQL'));
    expect(issues.some((i) => i.code === 'MISSING_REQUIRED')).toBe(true);
  });

  it('uses a default design-mode context when none is supplied', () => {
    const issues = validateNode({ id: 'a', type: 'resource', data: {} });
    expect(issues).toEqual([]);
  });
});
