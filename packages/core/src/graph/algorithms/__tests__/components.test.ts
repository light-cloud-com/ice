/**
 * Tests for `algorithms/components.ts` (rf-galg-3).
 *
 * Behaviour preserved verbatim from pre-extraction L307-402 of
 * `graph/algorithms.ts`.
 */
import { describe, expect, it } from 'vitest';
import { find_connected_components, find_strongly_connected_components } from '../components';
import { make_graph } from './fixtures';

describe('find_connected_components', () => {
  it('returns empty for empty graph', () => {
    const graph = make_graph([], []);
    expect(find_connected_components(graph)).toEqual([]);
  });

  it('returns one component per disconnected node', () => {
    const graph = make_graph(['a', 'b', 'c'], []);
    const components = find_connected_components(graph);
    expect(components.length).toBe(3);
  });

  it('groups connected nodes into one component', () => {
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    const components = find_connected_components(graph);
    expect(components.length).toBe(1);
    expect(components[0]?.length).toBe(3);
  });

  it('treats edges as undirected', () => {
    // a -> b (only forward edge); a and b should still be one component
    const graph = make_graph(['a', 'b'], [['a', 'b']]);
    const components = find_connected_components(graph);
    expect(components.length).toBe(1);
  });

  it('separates two unconnected groups', () => {
    // {a, b} and {c, d}
    const graph = make_graph(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
    );
    const components = find_connected_components(graph);
    expect(components.length).toBe(2);
    expect(components.every((c) => c.length === 2)).toBe(true);
  });
});

describe('find_strongly_connected_components', () => {
  it('returns empty for empty graph', () => {
    const graph = make_graph([], []);
    expect(find_strongly_connected_components(graph)).toEqual([]);
  });

  it('excludes single-node SCCs (no self-loop)', () => {
    const graph = make_graph(['a', 'b', 'c'], []);
    expect(find_strongly_connected_components(graph)).toEqual([]);
  });

  it('finds two-node SCC (mutual cycle)', () => {
    // a <-> b
    const graph = make_graph(
      ['a', 'b'],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    const sccs = find_strongly_connected_components(graph);
    expect(sccs.length).toBe(1);
    expect(sccs[0]?.length).toBe(2);
  });

  it('finds three-node SCC', () => {
    // a -> b -> c -> a
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ],
    );
    const sccs = find_strongly_connected_components(graph);
    expect(sccs.length).toBe(1);
    expect(sccs[0]?.length).toBe(3);
  });

  it('does NOT include singleton "SCCs" outside cycles', () => {
    // a -> b <-> c (b and c form an SCC, a is singleton)
    const graph = make_graph(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'b'],
      ],
    );
    const sccs = find_strongly_connected_components(graph);
    expect(sccs.length).toBe(1);
    expect(sccs[0]?.length).toBe(2);
  });

  it('finds multiple SCCs in same graph', () => {
    // {a <-> b} and {c <-> d}, no edges between
    const graph = make_graph(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['b', 'a'],
        ['c', 'd'],
        ['d', 'c'],
      ],
    );
    const sccs = find_strongly_connected_components(graph);
    expect(sccs.length).toBe(2);
  });
});
