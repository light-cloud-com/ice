/**
 * rf-pbrws-1 — buildPath + flattenItems unit tests.
 *
 * Pure-function utilities extracted from the project-browser orchestrator;
 * test directly with vitest fixtures (no React, no Redux).
 */

import { describe, it, expect } from 'vitest';
import { buildPath, flattenItems } from '../build-path';
import type { ProjectNode } from '../../types/project-node';

const makeNode = (overrides: Partial<ProjectNode> = {}): ProjectNode => ({
  id: 'n1',
  name: 'Node 1',
  type: 'project',
  parent_id: null,
  cards: [],
  children: [],
  ...overrides,
});

describe('buildPath', () => {
  it('returns slugified leaf path with no org prefix when selectedOrgName is undefined', () => {
    const leaf = makeNode({ id: 'l1', name: 'My Project', parent_id: null });
    expect(buildPath(leaf, [leaf], undefined)).toBe('/my-project');
  });

  it('uses pre-computed slug field when present', () => {
    const leaf = makeNode({ id: 'l1', name: 'Hello World', slug: 'pre-baked', parent_id: null });
    expect(buildPath(leaf, [leaf], undefined)).toBe('/pre-baked');
  });

  it('walks up parent chain and joins with `/`', () => {
    const root = makeNode({ id: 'r', name: 'Root', type: 'folder', parent_id: null });
    const middle = makeNode({ id: 'm', name: 'Middle', type: 'folder', parent_id: 'r' });
    const leaf = makeNode({ id: 'l', name: 'Leaf', parent_id: 'm' });
    expect(buildPath(leaf, [root, middle, leaf], undefined)).toBe('/root/middle/leaf');
  });

  it('prepends the org slug when provided', () => {
    const leaf = makeNode({ id: 'l1', name: 'Foo', parent_id: null });
    expect(buildPath(leaf, [leaf], 'My Org')).toBe('/my-org/foo');
  });

  it('slugifies names with non-ascii characters by replacing with `-`', () => {
    const leaf = makeNode({ id: 'l1', name: 'A B+C', parent_id: null });
    expect(buildPath(leaf, [leaf], undefined)).toBe('/a-b-c');
  });

  it('strips leading/trailing dashes after slugification', () => {
    const leaf = makeNode({ id: 'l1', name: '!!!Hello!!!', parent_id: null });
    expect(buildPath(leaf, [leaf], undefined)).toBe('/hello');
  });

  it('breaks the walk if parent_id references a missing node', () => {
    const leaf = makeNode({ id: 'l', name: 'Leaf', parent_id: 'phantom' });
    expect(buildPath(leaf, [leaf], undefined)).toBe('/leaf');
  });

  it('handles deeply nested chains', () => {
    const a = makeNode({ id: 'a', name: 'A', type: 'folder', parent_id: null });
    const b = makeNode({ id: 'b', name: 'B', type: 'folder', parent_id: 'a' });
    const c = makeNode({ id: 'c', name: 'C', type: 'folder', parent_id: 'b' });
    const d = makeNode({ id: 'd', name: 'D', parent_id: 'c' });
    expect(buildPath(d, [a, b, c, d], 'Org')).toBe('/org/a/b/c/d');
  });
});

describe('flattenItems', () => {
  it('returns just flatFolders when items is empty', () => {
    const folder = makeNode({ id: 'f', type: 'folder' });
    expect(flattenItems([], [folder])).toEqual([folder]);
  });

  it('flattens top-level projects from items', () => {
    const p1 = makeNode({ id: 'p1' });
    const p2 = makeNode({ id: 'p2' });
    const result = flattenItems([p1, p2], []);
    expect(result.map((n) => n.id)).toEqual(['p1', 'p2']);
  });

  it('descends recursively through children', () => {
    const grandchild = makeNode({ id: 'gc' });
    const child = makeNode({ id: 'c', type: 'folder', children: [grandchild] });
    const root = makeNode({ id: 'r', type: 'folder', children: [child] });
    const result = flattenItems([root], []);
    expect(result.map((n) => n.id)).toEqual(['r', 'c', 'gc']);
  });

  it('concatenates flatFolders BEFORE the recursive walk', () => {
    const folder = makeNode({ id: 'f', type: 'folder' });
    const project = makeNode({ id: 'p' });
    const result = flattenItems([project], [folder]);
    expect(result.map((n) => n.id)).toEqual(['f', 'p']);
  });

  it('handles items with empty children arrays', () => {
    const node = makeNode({ id: 'n', children: [] });
    expect(flattenItems([node], [])).toEqual([node]);
  });

  it('treats undefined children as empty', () => {
    // Cast through unknown to construct a malformed node missing `children`
    const malformed = { id: 'm', name: 'X', type: 'project', parent_id: null, cards: [] } as unknown as ProjectNode;
    expect(flattenItems([malformed], [])).toEqual([malformed]);
  });
});
