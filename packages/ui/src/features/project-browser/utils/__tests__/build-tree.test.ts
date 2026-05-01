/**
 * rf-pbrws-3 — buildTree utility unit tests.
 */

import { describe, it, expect } from 'vitest';
import { buildTree } from '../build-tree';
import type { ProjectNode } from '../../types/project-node';

const makeNode = (overrides: Partial<ProjectNode> = {}): ProjectNode => ({
  id: 'n',
  name: 'N',
  type: 'project',
  parent_id: null,
  cards: [],
  children: [],
  ...overrides,
});

describe('buildTree', () => {
  it('returns an empty array for an empty input', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('returns all root-level nodes when nothing has a parent', () => {
    const a = makeNode({ id: 'a', parent_id: null });
    const b = makeNode({ id: 'b', parent_id: null });
    const result = buildTree([a, b]);
    expect(result.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('populates children for nodes with parent_id', () => {
    const root = makeNode({ id: 'r', type: 'folder' });
    const child = makeNode({ id: 'c', parent_id: 'r' });
    const result = buildTree([root, child]);
    expect(result.length).toBe(1);
    expect(result[0].children.map((c) => c.id)).toEqual(['c']);
  });

  it('treats nodes whose parent_id does not resolve as roots', () => {
    const orphan = makeNode({ id: 'orphan', parent_id: 'phantom' });
    const result = buildTree([orphan]);
    expect(result.map((n) => n.id)).toEqual(['orphan']);
  });

  it('handles mixed roots, deeply nested children, and orphans', () => {
    const root = makeNode({ id: 'r', type: 'folder' });
    const mid = makeNode({ id: 'm', type: 'folder', parent_id: 'r' });
    const leaf = makeNode({ id: 'l', parent_id: 'm' });
    const orphan = makeNode({ id: 'orphan', parent_id: 'missing' });
    const result = buildTree([root, mid, leaf, orphan]);

    expect(result.map((n) => n.id).sort()).toEqual(['orphan', 'r']);
    const tree = result.find((n) => n.id === 'r')!;
    expect(tree.children.map((c) => c.id)).toEqual(['m']);
    expect(tree.children[0].children.map((c) => c.id)).toEqual(['l']);
  });

  it('mutates the children arrays of input nodes (in-place tree assembly)', () => {
    const root = makeNode({ id: 'r', type: 'folder' });
    const child = makeNode({ id: 'c', parent_id: 'r' });
    buildTree([root, child]);
    expect(root.children).toEqual([child]);
  });

  it('preserves order of children based on flat input order', () => {
    const root = makeNode({ id: 'r', type: 'folder' });
    const c1 = makeNode({ id: 'c1', parent_id: 'r' });
    const c2 = makeNode({ id: 'c2', parent_id: 'r' });
    const c3 = makeNode({ id: 'c3', parent_id: 'r' });
    const result = buildTree([root, c2, c1, c3]);
    expect(result[0].children.map((c) => c.id)).toEqual(['c2', 'c1', 'c3']);
  });
});
