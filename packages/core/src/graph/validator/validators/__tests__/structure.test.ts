/**
 * rf-vval-1 — Structure validators tests.
 *
 * Cycle, Reference, Naming, Connectivity validators.
 */

import { describe, it, expect } from 'vitest';
import { create_mutable_graph } from '../../../mutable-graph';
import {
  CycleValidator,
  ReferenceValidator,
  NamingValidator,
  ConnectivityValidator,
} from '../structure';

// ─── CycleValidator ──────────────────────────────────────────────────────────

describe('CycleValidator', () => {
  it('exposes name=cycle and a description', () => {
    const v = new CycleValidator();
    expect(v.name).toBe('cycle');
    expect(v.description).toContain('cycle');
  });

  it('returns no issues for an acyclic graph', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });
    graph.add_node({ type: 't', name: 'b', properties: {} });
    const nodes = Array.from(graph.nodes.values());
    graph.add_edge({ source: nodes[0].id, target: nodes[1].id, relationship: 'depends_on' });

    const issues = new CycleValidator().validate(graph);
    expect(issues).toEqual([]);
  });

  it('detects a single cycle and reports CYCLE_DETECTED', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });
    graph.add_node({ type: 't', name: 'b', properties: {} });
    const nodes = Array.from(graph.nodes.values());
    graph.add_edge({ source: nodes[0].id, target: nodes[1].id, relationship: 'depends_on' });
    graph.add_edge({ source: nodes[1].id, target: nodes[0].id, relationship: 'depends_on' });

    const issues = new CycleValidator().validate(graph);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe('CYCLE_DETECTED');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain('Dependency cycle detected');
    expect(issues[0].context).toHaveProperty('cycle');
  });
});

// ─── ReferenceValidator ──────────────────────────────────────────────────────

describe('ReferenceValidator', () => {
  it('exposes name=reference', () => {
    const v = new ReferenceValidator();
    expect(v.name).toBe('reference');
  });

  it('returns no issues when all edges have valid endpoints', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });
    graph.add_node({ type: 't', name: 'b', properties: {} });
    const nodes = Array.from(graph.nodes.values());
    graph.add_edge({ source: nodes[0].id, target: nodes[1].id, relationship: 'depends_on' });

    const issues = new ReferenceValidator().validate(graph);
    expect(issues).toEqual([]);
  });

  it('flags INVALID_SOURCE when source missing', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });
    const nodes = Array.from(graph.nodes.values());
    // Manually inject an edge with a phantom source via the graph's
    // edges Map. ReferenceValidator just iterates `graph.edges.values()`.
    graph.edges.set('e1' as any, {
      id: 'e1',
      source: 'ghost-source' as any,
      target: nodes[0].id,
      relationship: 'depends_on',
      metadata: { annotations: {}, labels: {}, tags: {} },
    } as any);

    const issues = new ReferenceValidator().validate(graph);
    expect(issues.some((i) => i.code === 'INVALID_SOURCE')).toBe(true);
  });

  it('flags INVALID_TARGET when target missing', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });
    const nodes = Array.from(graph.nodes.values());
    graph.edges.set('e1' as any, {
      id: 'e1',
      source: nodes[0].id,
      target: 'ghost-target' as any,
      relationship: 'depends_on',
      metadata: { annotations: {}, labels: {}, tags: {} },
    } as any);

    const issues = new ReferenceValidator().validate(graph);
    expect(issues.some((i) => i.code === 'INVALID_TARGET')).toBe(true);
  });
});

// ─── NamingValidator ─────────────────────────────────────────────────────────

describe('NamingValidator', () => {
  it('exposes name=naming', () => {
    const v = new NamingValidator();
    expect(v.name).toBe('naming');
  });

  it('returns no issues for snake_case names', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'good_name', properties: {} });

    const issues = new NamingValidator().validate(graph);
    expect(issues).toEqual([]);
  });

  it('flags INVALID_NAME_FORMAT for camelCase', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'BadName', properties: {} });

    const issues = new NamingValidator().validate(graph);
    expect(issues.some((i) => i.code === 'INVALID_NAME_FORMAT')).toBe(true);
    const issue = issues.find((i) => i.code === 'INVALID_NAME_FORMAT')!;
    expect(issue.severity).toBe('warning');
    expect(issue.suggestion).toContain('badname');
  });

  it('flags RESERVED_NAME for keywords', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'count', properties: {} });

    const issues = new NamingValidator().validate(graph);
    expect(issues.some((i) => i.code === 'RESERVED_NAME')).toBe(true);
  });

  it('flags DUPLICATE_NAME for two same-type same-name nodes', () => {
    // The graph's `add_node` rejects same-name pairs. To test the
    // validator's DUPLICATE_NAME branch we inject the second node
    // directly into the nodes Map (bypassing the dedup check).
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'foo', name: 'dup', properties: {} });
    const nodes = Array.from(graph.nodes.values());
    const id2 = `${nodes[0].type}:${nodes[0].name}-2` as any;
    graph.nodes.set(id2, {
      ...nodes[0],
      id: id2,
    } as any);

    const issues = new NamingValidator().validate(graph);
    expect(issues.some((i) => i.code === 'DUPLICATE_NAME')).toBe(true);
  });

  it('does NOT flag duplicates across different types (different name needed for add_node dedup)', () => {
    // The validator's DUPLICATE_NAME branch only fires for same-type,
    // same-name. Verify that two nodes with different types AND
    // different names trigger no DUPLICATE_NAME issue.
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'foo', name: 'one', properties: {} });
    graph.add_node({ type: 'bar', name: 'two', properties: {} });

    const issues = new NamingValidator().validate(graph);
    expect(issues.some((i) => i.code === 'DUPLICATE_NAME')).toBe(false);
  });
});

// ─── ConnectivityValidator ───────────────────────────────────────────────────

describe('ConnectivityValidator', () => {
  it('exposes name=connectivity', () => {
    const v = new ConnectivityValidator();
    expect(v.name).toBe('connectivity');
  });

  it('flags ISOLATED_NODE for a node with no edges', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'lone', properties: {} });

    const issues = new ConnectivityValidator().validate(graph);
    expect(issues.some((i) => i.code === 'ISOLATED_NODE')).toBe(true);
    expect(issues[0].severity).toBe('info');
  });

  it('does not flag connected nodes', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });
    graph.add_node({ type: 't', name: 'b', properties: {} });
    const nodes = Array.from(graph.nodes.values());
    graph.add_edge({ source: nodes[0].id, target: nodes[1].id, relationship: 'depends_on' });

    const issues = new ConnectivityValidator().validate(graph);
    expect(issues).toEqual([]);
  });
});
