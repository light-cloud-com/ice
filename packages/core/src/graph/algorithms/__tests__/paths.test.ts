/**
 * Tests for `algorithms/paths.ts` (rf-galg-2).
 *
 * Behaviour preserved verbatim from pre-extraction L229-297 of
 * `graph/algorithms.ts`.
 */
import { describe, expect, it } from 'vitest';
import { find_all_paths, find_shortest_path } from '../paths';
import { id_of, make_graph } from './fixtures';

describe('find_all_paths', () => {
  it('returns single path for direct edge', () => {
    const graph = make_graph(['a', 'b'], [['a', 'b']]);
    const paths = find_all_paths(graph, id_of(graph, 'a'), id_of(graph, 'b'));
    expect(paths.length).toBe(1);
    expect(paths[0]).toEqual([id_of(graph, 'a'), id_of(graph, 'b')]);
  });

  it('returns single-node path when start === end', () => {
    const graph = make_graph(['a'], []);
    const paths = find_all_paths(graph, id_of(graph, 'a'), id_of(graph, 'a'));
    expect(paths.length).toBe(1);
    expect(paths[0]).toEqual([id_of(graph, 'a')]);
  });

  it('returns empty array when no path exists', () => {
    const graph = make_graph(['a', 'b'], []);
    const paths = find_all_paths(graph, id_of(graph, 'a'), id_of(graph, 'b'));
    expect(paths).toEqual([]);
  });

  it('finds multiple paths in diamond', () => {
    // a -> b -> d
    // a -> c -> d
    const graph = make_graph(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'd'],
        ['c', 'd'],
      ],
    );
    const paths = find_all_paths(graph, id_of(graph, 'a'), id_of(graph, 'd'));
    expect(paths.length).toBe(2);
  });

  it('respects max_paths cap', () => {
    // a -> b -> d (2 paths if a->c also exists)
    const graph = make_graph(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'd'],
        ['c', 'd'],
      ],
    );
    const paths = find_all_paths(graph, id_of(graph, 'a'), id_of(graph, 'd'), 1);
    expect(paths.length).toBe(1);
  });

  it('avoids cycles', () => {
    // a -> b -> a -> b... avoided via visited set
    const graph = make_graph(
      ['a', 'b'],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    const paths = find_all_paths(graph, id_of(graph, 'a'), id_of(graph, 'b'));
    expect(paths.length).toBe(1);
  });
});

describe('find_shortest_path', () => {
  it('returns [start] when start === end', () => {
    const graph = make_graph(['a'], []);
    const result = find_shortest_path(graph, id_of(graph, 'a'), id_of(graph, 'a'));
    expect(result).toEqual([id_of(graph, 'a')]);
  });

  it('returns null when no path exists', () => {
    const graph = make_graph(['a', 'b'], []);
    const result = find_shortest_path(graph, id_of(graph, 'a'), id_of(graph, 'b'));
    expect(result).toBeNull();
  });

  it('finds direct edge path', () => {
    const graph = make_graph(['a', 'b'], [['a', 'b']]);
    const result = find_shortest_path(graph, id_of(graph, 'a'), id_of(graph, 'b'));
    expect(result).toEqual([id_of(graph, 'a'), id_of(graph, 'b')]);
  });

  it('finds shortest path in diamond', () => {
    // a -> b -> d (length 2)
    // a -> c -> d (length 2)
    const graph = make_graph(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'd'],
        ['c', 'd'],
      ],
    );
    const result = find_shortest_path(graph, id_of(graph, 'a'), id_of(graph, 'd'));
    expect(result?.length).toBe(3); // a -> X -> d
  });

  it('prefers shorter over longer path', () => {
    // a -> b -> c -> d (length 3)
    // a -> d (length 1)
    const graph = make_graph(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['a', 'd'],
      ],
    );
    const result = find_shortest_path(graph, id_of(graph, 'a'), id_of(graph, 'd'));
    expect(result?.length).toBe(2); // direct edge wins
  });
});
