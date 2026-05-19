/**
 * rf-canv-3 — pure-tree-walk regression for the folded-remap util.
 *
 * The four exports lifted out of `svg-canvas.tsx` (`isNodeFolded`,
 * `hasCollapsedAncestor`, `buildFoldedRemap`, `descendants`) implement
 * fold-state machinery for the canvas — figuring out which nodes are
 * hidden behind a collapsed ancestor and where their connections should
 * re-route to. Each test below pins one slice of the verbatim semantics
 * so the orchestrator's thin wrappers can keep delegating to these
 * utils without subtly drifting.
 *
 * No React, no Redux — synthetic CanvasNode arrays only.
 */

import { describe, it, expect } from 'vitest';
import { buildFoldedRemap, descendants, hasCollapsedAncestor, isNodeFolded } from '../folded-remap';
import type { CanvasNode } from '../../components/types';

/** Minimal CanvasNode factory — only the fields these utils read. */
function node(overrides: Partial<CanvasNode> & Pick<CanvasNode, 'id'>): CanvasNode {
  return {
    type: 'block',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    label: overrides.id,
    data: {},
    parentId: null,
    ...overrides,
  };
}

describe('isNodeFolded', () => {
  it('returns true when node.data.folded === true', () => {
    const nodes = [node({ id: 'a', data: { folded: true } })];
    expect(isNodeFolded(nodes, 'a')).toBe(true);
  });

  it('returns false when folded is explicitly false', () => {
    const nodes = [node({ id: 'a', data: { folded: false } })];
    expect(isNodeFolded(nodes, 'a')).toBe(false);
  });

  it('returns false when folded is undefined', () => {
    const nodes = [node({ id: 'a', data: {} })];
    expect(isNodeFolded(nodes, 'a')).toBe(false);
  });

  it('returns false when data is missing entirely', () => {
    // The util uses optional chaining (`node?.data?.folded`); a missing
    // data object must NOT throw and must NOT be treated as folded.
    const nodes: CanvasNode[] = [
      {
        id: 'a',
        type: 'block',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        label: 'a',
        data: undefined as unknown as Record<string, unknown>,
      },
    ];
    expect(isNodeFolded(nodes, 'a')).toBe(false);
  });

  it('returns false when nodeId is not in nodes', () => {
    const nodes = [node({ id: 'a', data: { folded: true } })];
    expect(isNodeFolded(nodes, 'missing')).toBe(false);
  });

  it('returns false for truthy-but-not-true folded values (verbatim ===)', () => {
    // The original predicate uses `=== true`, not `Boolean(...)`.
    const nodes = [node({ id: 'a', data: { folded: 1 as unknown as boolean } })];
    expect(isNodeFolded(nodes, 'a')).toBe(false);
  });
});

describe('hasCollapsedAncestor', () => {
  it('returns false for a root node (no parentId)', () => {
    const nodes = [node({ id: 'root' })];
    expect(hasCollapsedAncestor(nodes, 'root')).toBe(false);
  });

  it('returns false when nodeId is not in nodes', () => {
    // No node found -> early `if (!node?.parentId) return false`.
    const nodes = [node({ id: 'a' })];
    expect(hasCollapsedAncestor(nodes, 'ghost')).toBe(false);
  });

  it('returns true when the direct parent is folded', () => {
    const nodes = [node({ id: 'parent', data: { folded: true } }), node({ id: 'child', parentId: 'parent' })];
    expect(hasCollapsedAncestor(nodes, 'child')).toBe(true);
  });

  it('returns true when grandparent is folded (recursion)', () => {
    const nodes = [
      node({ id: 'grandparent', data: { folded: true } }),
      node({ id: 'parent', parentId: 'grandparent' }),
      node({ id: 'child', parentId: 'parent' }),
    ];
    expect(hasCollapsedAncestor(nodes, 'child')).toBe(true);
  });

  it('returns false when no ancestor is folded', () => {
    const nodes = [
      node({ id: 'grandparent' }),
      node({ id: 'parent', parentId: 'grandparent' }),
      node({ id: 'child', parentId: 'parent' }),
    ];
    expect(hasCollapsedAncestor(nodes, 'child')).toBe(false);
  });

  it('does NOT count the node itself being folded as having a collapsed ancestor', () => {
    // The predicate is about ancestors, not the node itself.
    const nodes = [node({ id: 'parent' }), node({ id: 'child', parentId: 'parent', data: { folded: true } })];
    expect(hasCollapsedAncestor(nodes, 'child')).toBe(false);
  });

  it('walks past a non-folded ancestor to find a folded grandparent', () => {
    const nodes = [
      node({ id: 'gp', data: { folded: true } }),
      node({ id: 'p', parentId: 'gp', data: { folded: false } }),
      node({ id: 'c', parentId: 'p' }),
    ];
    expect(hasCollapsedAncestor(nodes, 'c')).toBe(true);
  });
});

describe('buildFoldedRemap', () => {
  it('returns empty Map when no nodes are folded', () => {
    const nodes = [node({ id: 'p' }), node({ id: 'c', parentId: 'p' })];
    const remap = buildFoldedRemap(nodes, nodes);
    expect(remap.size).toBe(0);
  });

  it('remaps a hidden child to its folded parent (first visible ancestor)', () => {
    const nodes = [node({ id: 'p', data: { folded: true } }), node({ id: 'c', parentId: 'p' })];
    const remap = buildFoldedRemap(nodes, nodes);
    expect(remap.get('c')).toBe('p');
    expect(remap.size).toBe(1);
  });

  it('walks past additional hidden ancestors to pick the first NON-hidden one', () => {
    // Topology: gp (folded) -> p (also hidden because gp is folded) -> c.
    // c walks: parent p is hidden -> climb to gp -> gp is the top of the
    // folded subtree (its own parent chain has no folded ancestor), so
    // gp is the first NON-hidden ancestor and the remap target.
    const nodes = [
      node({ id: 'gp', data: { folded: true } }),
      node({ id: 'p', parentId: 'gp' }),
      node({ id: 'c', parentId: 'p' }),
    ];
    const remap = buildFoldedRemap(nodes, nodes);
    // Both p and c are hidden; both remap to gp.
    expect(remap.get('p')).toBe('gp');
    expect(remap.get('c')).toBe('gp');
    expect(remap.size).toBe(2);
  });

  it('hidden nodes whose parents are also hidden walk further up the chain', () => {
    // Topology: visible-root -> middle (folded) -> inner (also hidden) -> leaf.
    // leaf should remap up past inner (hidden) to middle's parent — wait —
    // middle is the folded one; middle itself is NOT hidden (only its
    // descendants are), so the visible ancestor for inner+leaf is middle.
    const nodes = [
      node({ id: 'root' }),
      node({ id: 'middle', parentId: 'root', data: { folded: true } }),
      node({ id: 'inner', parentId: 'middle' }),
      node({ id: 'leaf', parentId: 'inner' }),
    ];
    const remap = buildFoldedRemap(nodes, nodes);
    expect(remap.get('inner')).toBe('middle');
    expect(remap.get('leaf')).toBe('middle');
    expect(remap.has('middle')).toBe(false); // middle itself is visible
    expect(remap.has('root')).toBe(false);
  });

  it('does NOT add an entry when every ancestor is hidden (verbatim if-guard)', () => {
    // Construct a topology where the chain of parents leads off the top
    // of the visible graph: every ancestor of the hidden node is itself
    // hidden because the *visibleNodes* lookup never finds the root.
    // We achieve that by pruning the actual root from `visibleNodes` —
    // the canvasNodes know about it for the parent walk, but the
    // hasCollapsedAncestor predicate runs against visibleNodes which
    // returns false for missing nodes (per its early return), making
    // every parent ID look "not hidden" once the walk falls off the end.
    //
    // Easier: use the original loop's `if (ancestorId)` guard. After
    // the while-loop falls off the top (`ancestorId = null`), the entry
    // is skipped.
    const canvasNodes = [node({ id: 'lost', parentId: 'phantom' })];
    const visibleNodes = [
      // Make `lost` look hidden: its parent IS folded, but the parent
      // doesn't exist in the canvas at all.
      node({ id: 'lost', parentId: 'phantom' }),
      node({ id: 'phantom', data: { folded: true } }),
    ];
    // Walk: lost has parentId='phantom'; phantom is folded => lost is
    // hidden. Climb: ancestorId='phantom'. Is 'phantom' hidden in
    // visibleNodes? phantom has no parentId => hasCollapsedAncestor
    // returns false. So 'phantom' is the first NON-hidden ancestor and
    // the remap entry IS added (lost -> phantom). This case actually
    // illustrates the happy path of the if-guard, not the skip path.
    const remap1 = buildFoldedRemap(canvasNodes, visibleNodes);
    expect(remap1.get('lost')).toBe('phantom');

    // Now build the actual skip case: a hidden node whose climb falls
    // off the top because every parent in canvasNodes is also hidden in
    // visibleNodes, and the topmost parent has parentId=undefined.
    // Topology in canvasNodes: a (folded) -> b (parent=a) -> c (parent=b).
    // visibleNodes: same; b and c are hidden behind a's fold. The walk
    // for c: parent=b (hidden), climb to a; a is NOT hidden (has no
    // ancestor). a is the first non-hidden -> entry lands in the map.
    // To force the skip, we need the climb to land on `null`/`undefined`
    // while every step is still hidden. That happens when the topmost
    // ancestor itself is somehow flagged as hidden in visibleNodes — i.e.
    // when visibleNodes claims it has a folded parent that canvasNodes
    // does not. We simulate that with a self-folding root: the
    // visibleNodes copy gives `a` a parentId pointing at a folded `x`
    // that does not exist in canvasNodes.
    const canvasNodes2: CanvasNode[] = [node({ id: 'a', parentId: 'x' }), node({ id: 'b', parentId: 'a' })];
    const visibleNodes2: CanvasNode[] = [
      node({ id: 'a', parentId: 'x' }),
      node({ id: 'b', parentId: 'a' }),
      node({ id: 'x', data: { folded: true } }),
    ];
    // hasCollapsedAncestor for b: b -> a (folded?) check a in visibleNodes,
    // a has parent x; x is folded => a is hidden. So b is hidden.
    // hasCollapsedAncestor for a: a -> x (folded) => true. a is hidden.
    // Climb for b: ancestorId='a'. canvasNodes2.find(a).parentId='x'.
    // hasCollapsedAncestor(visibleNodes2, 'x'): x has no parent => false.
    // x is the first non-hidden ancestor, but x is not in canvasNodes2.
    // The walk uses canvasNodes.find at every step, but the predicate
    // uses visibleNodes — climbing keeps going while hasCollapsedAncestor
    // returns true. For 'x', it returns false, so the loop exits with
    // ancestorId='x' and the if-guard adds (b -> x).
    const remap2 = buildFoldedRemap(canvasNodes2, visibleNodes2);
    expect(remap2.get('b')).toBe('x');

    // The actual skip path: ancestorId becomes null because canvasNodes
    // does not contain the next parent in the chain. A hidden node whose
    // parent is hidden, but the climb cannot reach a non-hidden ancestor
    // because canvasNodes is missing the link.
    // canvasNodes: a (folded) -> b. visibleNodes mirrors plus reports
    // a as hidden by giving it a folded parent y that exists in
    // visibleNodes but NOT in canvasNodes. Then climbing from b:
    // ancestorId='a' (hidden in visibleNodes); canvasNodes.find('a')
    // returns the node, parentId is undefined (canvasNodes has no link
    // to y) => ancestorId becomes null => loop exits with
    // ancestorId=null => `if (ancestorId)` is falsy => entry skipped.
    const canvasNodes3: CanvasNode[] = [node({ id: 'a', data: { folded: true } }), node({ id: 'b', parentId: 'a' })];
    const visibleNodes3: CanvasNode[] = [
      // visibleNodes pretends a has a folded ancestor too:
      node({ id: 'a', parentId: 'y', data: { folded: true } }),
      node({ id: 'b', parentId: 'a' }),
      node({ id: 'y', data: { folded: true } }),
    ];
    // hasCollapsedAncestor(visibleNodes3, 'b'): b -> a; a is folded -> true.
    // Climb for b in canvasNodes3: ancestorId='a'.
    //   hasCollapsedAncestor(visibleNodes3, 'a'): a -> y; y is folded -> true.
    //   So we keep climbing. canvasNodes3.find('a').parentId is undefined
    //   => ancestorId = undefined || null = null. Loop exits.
    //   if (ancestorId) is false => entry skipped.
    const remap3 = buildFoldedRemap(canvasNodes3, visibleNodes3);
    expect(remap3.has('b')).toBe(false);
  });

  it('does not remap nodes that are not hidden behind a collapsed ancestor', () => {
    const nodes = [
      node({ id: 'p', data: { folded: true } }),
      node({ id: 'c', parentId: 'p' }),
      node({ id: 'sibling' }), // sibling is its own root, not hidden
      node({ id: 'sibling-child', parentId: 'sibling' }),
    ];
    const remap = buildFoldedRemap(nodes, nodes);
    expect(remap.has('sibling')).toBe(false);
    expect(remap.has('sibling-child')).toBe(false);
    expect(remap.has('p')).toBe(false); // p itself is visible
    expect(remap.get('c')).toBe('p');
  });
});

describe('descendants', () => {
  it('returns empty array when parent has no children', () => {
    const nodes = [node({ id: 'parent' })];
    expect(descendants(nodes, 'parent')).toEqual([]);
  });

  it('returns empty array when parentId is not in nodes', () => {
    const nodes = [node({ id: 'a' })];
    expect(descendants(nodes, 'ghost')).toEqual([]);
  });

  it('returns flat list of direct children', () => {
    const nodes = [
      node({ id: 'parent' }),
      node({ id: 'c1', parentId: 'parent' }),
      node({ id: 'c2', parentId: 'parent' }),
    ];
    expect(descendants(nodes, 'parent').sort()).toEqual(['c1', 'c2']);
  });

  it('transitively includes grandchildren (depth-first)', () => {
    const nodes = [
      node({ id: 'p' }),
      node({ id: 'c1', parentId: 'p' }),
      node({ id: 'gc1', parentId: 'c1' }),
      node({ id: 'gc2', parentId: 'c1' }),
      node({ id: 'c2', parentId: 'p' }),
    ];
    // Depth-first ordering: c1, then c1's descendants (gc1, gc2), then c2.
    expect(descendants(nodes, 'p')).toEqual(['c1', 'gc1', 'gc2', 'c2']);
  });

  it('does not include the parent itself in the result', () => {
    const nodes = [node({ id: 'p' }), node({ id: 'c', parentId: 'p' })];
    expect(descendants(nodes, 'p')).not.toContain('p');
  });

  it('does not cross sibling subtrees', () => {
    const nodes = [
      node({ id: 'a' }),
      node({ id: 'b' }),
      node({ id: 'a-child', parentId: 'a' }),
      node({ id: 'b-child', parentId: 'b' }),
    ];
    expect(descendants(nodes, 'a')).toEqual(['a-child']);
    expect(descendants(nodes, 'b')).toEqual(['b-child']);
  });

  it('walks deep nested chains', () => {
    const nodes = [
      node({ id: 'l0' }),
      node({ id: 'l1', parentId: 'l0' }),
      node({ id: 'l2', parentId: 'l1' }),
      node({ id: 'l3', parentId: 'l2' }),
    ];
    expect(descendants(nodes, 'l0')).toEqual(['l1', 'l2', 'l3']);
  });
});
