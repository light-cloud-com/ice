/**
 * Reparenting, Nesting & Drag-Drop — comprehensive tests
 *
 * Tests the cards-slice reducers that handle parent-child relationships:
 * - updateCardNodeParent (reparent single node)
 * - groupSelectedNodes (create group from selection)
 * - deleteCardNode (cascade cleanup)
 *
 * These tests guard against regressions in:
 * - Dragging nodes in/out of groups
 * - Nested group-in-group relationships
 * - Multi-select grouping edge cases
 * - Orphan cleanup on delete
 */

import { describe, it, expect } from 'vitest';
import cardsReducer, {
  createCard,
  addNodeToCard,
  addEdgeToCard,
  groupSelectedNodes,
  updateCardNodeParent,
  deleteCardNode,
  type CardsState,
  type CardNode,
} from '../cards-slice';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(id: string, overrides: Partial<CardNode> = {}): CardNode {
  return {
    id,
    type: 'resource',
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    data: { label: id, iceType: 'Compute.Container' },
    ...overrides,
  };
}

function makeGroup(id: string, overrides: Partial<CardNode> = {}): CardNode {
  return {
    id,
    type: 'container',
    position: { x: 0, y: 0 },
    width: 400,
    height: 300,
    data: { label: id, iceType: 'Group.Custom', groupColor: '#3b82f6', behavior: 'container', folded: false },
    ...overrides,
  };
}

function setupState(nodes: CardNode[]): CardsState {
  let state = cardsReducer(undefined, { type: '@@INIT' });
  state = cardsReducer(state, createCard({ name: 'Test' }));
  for (const node of nodes) {
    state = cardsReducer(state, addNodeToCard(node));
  }
  return state;
}

function getCard(state: CardsState) {
  return state.cards.find((c) => c.id === state.activeCardId)!;
}

function getNode(state: CardsState, id: string) {
  return getCard(state).nodes.find((n) => n.id === id);
}

// =============================================================================
// updateCardNodeParent — single node reparenting
// =============================================================================

describe('updateCardNodeParent — reparent single node', () => {
  it('should move a node into a group', () => {
    const state = setupState([makeGroup('g1'), makeNode('n1')]);
    const result = cardsReducer(state, updateCardNodeParent({ nodeId: 'n1', parentId: 'g1' }));
    expect(getNode(result, 'n1')?.parentId).toBe('g1');
  });

  it('should move a node out of a group (to root)', () => {
    const state = setupState([makeGroup('g1'), makeNode('n1', { parentId: 'g1' })]);
    const result = cardsReducer(state, updateCardNodeParent({ nodeId: 'n1', parentId: null }));
    expect(getNode(result, 'n1')?.parentId).toBeUndefined();
  });

  it('should move a node from one group to another', () => {
    const state = setupState([
      makeGroup('g1'),
      makeGroup('g2', { position: { x: 500, y: 0 } }),
      makeNode('n1', { parentId: 'g1' }),
    ]);
    const result = cardsReducer(state, updateCardNodeParent({ nodeId: 'n1', parentId: 'g2' }));
    expect(getNode(result, 'n1')?.parentId).toBe('g2');
  });

  it('should move a group into another group (nesting)', () => {
    const state = setupState([
      makeGroup('outer'),
      makeGroup('inner', { position: { x: 50, y: 50 }, width: 200, height: 150 }),
    ]);
    const result = cardsReducer(state, updateCardNodeParent({ nodeId: 'inner', parentId: 'outer' }));
    expect(getNode(result, 'inner')?.parentId).toBe('outer');
  });

  it('should move a group out of another group (un-nesting)', () => {
    const state = setupState([makeGroup('outer'), makeGroup('inner', { parentId: 'outer' })]);
    const result = cardsReducer(state, updateCardNodeParent({ nodeId: 'inner', parentId: null }));
    expect(getNode(result, 'inner')?.parentId).toBeUndefined();
  });

  it('should preserve children when reparenting a group', () => {
    const state = setupState([
      makeGroup('outer'),
      makeGroup('inner', { parentId: 'outer' }),
      makeNode('child', { parentId: 'inner' }),
    ]);
    // Move inner group to root
    const result = cardsReducer(state, updateCardNodeParent({ nodeId: 'inner', parentId: null }));
    // child should still be inside inner
    expect(getNode(result, 'child')?.parentId).toBe('inner');
    expect(getNode(result, 'inner')?.parentId).toBeUndefined();
  });

  it('should handle reparent to the same parent (no-op)', () => {
    const state = setupState([makeGroup('g1'), makeNode('n1', { parentId: 'g1' })]);
    const result = cardsReducer(state, updateCardNodeParent({ nodeId: 'n1', parentId: 'g1' }));
    expect(getNode(result, 'n1')?.parentId).toBe('g1');
  });

  it('should handle reparent of non-existent node gracefully', () => {
    const state = setupState([makeGroup('g1')]);
    const result = cardsReducer(state, updateCardNodeParent({ nodeId: 'nonexistent', parentId: 'g1' }));
    expect(getCard(result).nodes).toHaveLength(1); // unchanged
  });

  it('should push undo snapshot on reparent', () => {
    const state = setupState([makeGroup('g1'), makeNode('n1')]);
    const historyBefore = state.history[state.activeCardId!]?.past.length || 0;
    const result = cardsReducer(state, updateCardNodeParent({ nodeId: 'n1', parentId: 'g1' }));
    const historyAfter = result.history[result.activeCardId!]?.past.length || 0;
    expect(historyAfter).toBeGreaterThan(historyBefore);
  });
});

// =============================================================================
// groupSelectedNodes — comprehensive edge cases
// =============================================================================

describe('groupSelectedNodes — edge cases', () => {
  it('should group resources from different parent groups', () => {
    const state = setupState([
      makeGroup('g1', { position: { x: 0, y: 0 } }),
      makeGroup('g2', { position: { x: 500, y: 0 } }),
      makeNode('n1', { position: { x: 50, y: 50 }, parentId: 'g1' }),
      makeNode('n2', { position: { x: 550, y: 50 }, parentId: 'g2' }),
    ]);
    const result = cardsReducer(state, groupSelectedNodes(['n1', 'n2']));
    const card = getCard(result);
    const newGroup = card.nodes.find((n) => n.data.iceType === 'Group.Custom' && n.id !== 'g1' && n.id !== 'g2');
    expect(newGroup).toBeDefined();
    // Both nodes should be reparented to the new group
    expect(getNode(result, 'n1')?.parentId).toBe(newGroup!.id);
    expect(getNode(result, 'n2')?.parentId).toBe(newGroup!.id);
  });

  it('should group a mix of resources and groups', () => {
    const state = setupState([
      makeGroup('g1', { position: { x: 0, y: 0 }, width: 200, height: 150 }),
      makeNode('n1', { position: { x: 300, y: 0 } }),
    ]);
    const result = cardsReducer(state, groupSelectedNodes(['g1', 'n1']));
    const card = getCard(result);
    const newGroup = card.nodes.find((n) => n.data.iceType === 'Group.Custom' && n.id !== 'g1');
    expect(newGroup).toBeDefined();
    expect(getNode(result, 'g1')?.parentId).toBe(newGroup!.id);
    expect(getNode(result, 'n1')?.parentId).toBe(newGroup!.id);
  });

  it('should group two groups together (creating nested structure)', () => {
    const state = setupState([
      makeGroup('g1', { position: { x: 0, y: 0 } }),
      makeGroup('g2', { position: { x: 500, y: 0 } }),
    ]);
    const result = cardsReducer(state, groupSelectedNodes(['g1', 'g2']));
    const card = getCard(result);
    const wrapper = card.nodes.find((n) => n.data.iceType === 'Group.Custom' && n.id !== 'g1' && n.id !== 'g2');
    expect(wrapper).toBeDefined();
    expect(getNode(result, 'g1')?.parentId).toBe(wrapper!.id);
    expect(getNode(result, 'g2')?.parentId).toBe(wrapper!.id);
  });

  it('should not group with empty node IDs', () => {
    const state = setupState([makeNode('n1'), makeNode('n2')]);
    const result = cardsReducer(state, groupSelectedNodes([]));
    expect(getCard(result).nodes).toHaveLength(2);
  });

  it('should not group with non-existent node IDs', () => {
    const state = setupState([makeNode('n1')]);
    const result = cardsReducer(state, groupSelectedNodes(['n1', 'nonexistent']));
    // Only 1 node found in the card, so < 2 selected → no group
    expect(getCard(result).nodes).toHaveLength(1);
  });

  it('should handle 3+ nodes', () => {
    const state = setupState([
      makeNode('a', { position: { x: 0, y: 0 } }),
      makeNode('b', { position: { x: 200, y: 0 } }),
      makeNode('c', { position: { x: 400, y: 0 } }),
    ]);
    const result = cardsReducer(state, groupSelectedNodes(['a', 'b', 'c']));
    const card = getCard(result);
    expect(card.nodes).toHaveLength(4); // 3 original + 1 group
    const group = card.nodes.find((n) => n.type === 'container')!;
    expect(getNode(result, 'a')?.parentId).toBe(group.id);
    expect(getNode(result, 'b')?.parentId).toBe(group.id);
    expect(getNode(result, 'c')?.parentId).toBe(group.id);
  });

  it('should preserve existing children when grouping a parent with its child', () => {
    // Selecting a group and one of its children
    const state = setupState([
      makeGroup('g1', { position: { x: 0, y: 0 } }),
      makeNode('child1', { position: { x: 50, y: 50 }, parentId: 'g1' }),
      makeNode('child2', { position: { x: 50, y: 150 }, parentId: 'g1' }),
      makeNode('other', { position: { x: 500, y: 0 } }),
    ]);
    // Group g1 + other (child1 and child2 are not in selection but are children of g1)
    const result = cardsReducer(state, groupSelectedNodes(['g1', 'other']));
    // g1's children should still point to g1
    expect(getNode(result, 'child1')?.parentId).toBe('g1');
    expect(getNode(result, 'child2')?.parentId).toBe('g1');
  });
});

// =============================================================================
// Deep nesting scenarios (3+ levels)
// =============================================================================

describe('Deep nesting scenarios', () => {
  it('should maintain 3-level nesting: outer > inner > resource', () => {
    const state = setupState([
      makeGroup('outer', { position: { x: 0, y: 0 }, width: 600, height: 500 }),
      makeGroup('inner', { position: { x: 50, y: 50 }, width: 300, height: 200, parentId: 'outer' }),
      makeNode('leaf', { position: { x: 100, y: 100 }, parentId: 'inner' }),
    ]);
    expect(getNode(state, 'outer')?.parentId).toBeUndefined();
    expect(getNode(state, 'inner')?.parentId).toBe('outer');
    expect(getNode(state, 'leaf')?.parentId).toBe('inner');
  });

  it('should un-nest inner group while keeping its children', () => {
    let state = setupState([
      makeGroup('outer', { position: { x: 0, y: 0 }, width: 600, height: 500 }),
      makeGroup('inner', { position: { x: 50, y: 50 }, width: 300, height: 200, parentId: 'outer' }),
      makeNode('leaf', { position: { x: 100, y: 100 }, parentId: 'inner' }),
    ]);

    // Remove inner from outer
    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'inner', parentId: null }));

    expect(getNode(state, 'inner')?.parentId).toBeUndefined();
    expect(getNode(state, 'leaf')?.parentId).toBe('inner'); // leaf stays in inner
  });

  it('should move a resource from level 3 to level 1', () => {
    let state = setupState([
      makeGroup('l1', { position: { x: 0, y: 0 }, width: 600, height: 500 }),
      makeGroup('l2', { position: { x: 50, y: 50 }, width: 400, height: 300, parentId: 'l1' }),
      makeNode('deep', { position: { x: 100, y: 100 }, parentId: 'l2' }),
    ]);

    // Move deep resource directly into l1
    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'deep', parentId: 'l1' }));
    expect(getNode(state, 'deep')?.parentId).toBe('l1');
  });

  it('should move a resource from nested group to root', () => {
    let state = setupState([makeGroup('g1'), makeGroup('g2', { parentId: 'g1' }), makeNode('n1', { parentId: 'g2' })]);

    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'n1', parentId: null }));
    expect(getNode(state, 'n1')?.parentId).toBeUndefined();
  });

  it('should reparent a group with children into another group', () => {
    let state = setupState([
      makeGroup('target', { position: { x: 500, y: 0 } }),
      makeGroup('source', { position: { x: 0, y: 0 } }),
      makeNode('child1', { position: { x: 50, y: 50 }, parentId: 'source' }),
      makeNode('child2', { position: { x: 50, y: 150 }, parentId: 'source' }),
    ]);

    // Move source (with children) into target
    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'source', parentId: 'target' }));

    expect(getNode(state, 'source')?.parentId).toBe('target');
    expect(getNode(state, 'child1')?.parentId).toBe('source'); // children unchanged
    expect(getNode(state, 'child2')?.parentId).toBe('source');
  });
});

// =============================================================================
// deleteCardNode — cascade and cleanup
// =============================================================================

describe('deleteCardNode — cleanup', () => {
  it('should delete a standalone node', () => {
    const state = setupState([makeNode('n1')]);
    const result = cardsReducer(state, deleteCardNode('n1'));
    expect(getCard(result).nodes).toHaveLength(0);
  });

  it('should delete a node and its connected edges', () => {
    let state = setupState([
      makeNode('n1', { position: { x: 0, y: 0 } }),
      makeNode('n2', { position: { x: 300, y: 0 } }),
    ]);
    // Add an edge via the reducer (Immer state is frozen)
    state = cardsReducer(state, addEdgeToCard({ id: 'e1', source: 'n1', target: 'n2' }));
    expect(getCard(state).edges).toHaveLength(1);

    const result = cardsReducer(state, deleteCardNode('n1'));
    expect(getCard(result).nodes).toHaveLength(1);
    expect(getCard(result).edges).toHaveLength(0); // edge removed too
  });

  it('should NOT cascade-delete children when deleting a group', () => {
    // This tests current behavior — children become orphaned (parentId points to deleted node)
    const state = setupState([makeGroup('g1'), makeNode('child', { parentId: 'g1' })]);
    const result = cardsReducer(state, deleteCardNode('g1'));
    const card = getCard(result);
    // Group deleted, child remains
    expect(card.nodes).toHaveLength(1);
    expect(card.nodes[0].id).toBe('child');
    // child.parentId still points to deleted group (orphan)
    expect(card.nodes[0].parentId).toBe('g1');
  });

  it('should delete a child without affecting the parent group', () => {
    const state = setupState([makeGroup('g1'), makeNode('child', { parentId: 'g1' })]);
    const result = cardsReducer(state, deleteCardNode('child'));
    const card = getCard(result);
    expect(card.nodes).toHaveLength(1);
    expect(card.nodes[0].id).toBe('g1');
  });
});

// =============================================================================
// Edge cases in multi-select grouping + reparenting combos
// =============================================================================

describe('Complex grouping + reparenting sequences', () => {
  it('should allow grouping, then ungrouping via reparent', () => {
    let state = setupState([
      makeNode('n1', { position: { x: 0, y: 0 } }),
      makeNode('n2', { position: { x: 300, y: 0 } }),
    ]);

    // Group them
    state = cardsReducer(state, groupSelectedNodes(['n1', 'n2']));
    const card = getCard(state);
    const group = card.nodes.find((n) => n.type === 'container')!;
    expect(getNode(state, 'n1')?.parentId).toBe(group.id);
    expect(getNode(state, 'n2')?.parentId).toBe(group.id);

    // Ungroup n1 by reparenting to root
    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'n1', parentId: null }));
    expect(getNode(state, 'n1')?.parentId).toBeUndefined();
    expect(getNode(state, 'n2')?.parentId).toBe(group.id); // n2 stays
  });

  it('should allow creating nested groups from an existing group', () => {
    let state = setupState([
      makeGroup('g1', { position: { x: 0, y: 0 }, width: 500, height: 400 }),
      makeNode('a', { position: { x: 50, y: 50 }, parentId: 'g1' }),
      makeNode('b', { position: { x: 50, y: 200 }, parentId: 'g1' }),
      makeNode('c', { position: { x: 250, y: 50 }, parentId: 'g1' }),
    ]);

    // Group a+b into a subgroup while they're inside g1
    state = cardsReducer(state, groupSelectedNodes(['a', 'b']));
    const card = getCard(state);
    const subgroup = card.nodes.find((n) => n.type === 'container' && n.id !== 'g1')!;

    // a and b should now be children of the subgroup
    expect(getNode(state, 'a')?.parentId).toBe(subgroup.id);
    expect(getNode(state, 'b')?.parentId).toBe(subgroup.id);
    // c should still be a child of g1
    expect(getNode(state, 'c')?.parentId).toBe('g1');
  });

  it('should handle moving a group between two parent groups', () => {
    let state = setupState([
      makeGroup('parent1', { position: { x: 0, y: 0 }, width: 500, height: 400 }),
      makeGroup('parent2', { position: { x: 600, y: 0 }, width: 500, height: 400 }),
      makeGroup('movable', { position: { x: 50, y: 50 }, width: 200, height: 150, parentId: 'parent1' }),
      makeNode('leaf', { position: { x: 80, y: 80 }, parentId: 'movable' }),
    ]);

    // Move movable from parent1 to parent2
    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'movable', parentId: 'parent2' }));

    expect(getNode(state, 'movable')?.parentId).toBe('parent2');
    expect(getNode(state, 'leaf')?.parentId).toBe('movable'); // leaf follows
  });

  it('should handle rapid reparent operations', () => {
    let state = setupState([makeGroup('g1'), makeGroup('g2'), makeGroup('g3'), makeNode('n1')]);

    // n1 → g1 → g2 → g3 → root
    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'n1', parentId: 'g1' }));
    expect(getNode(state, 'n1')?.parentId).toBe('g1');

    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'n1', parentId: 'g2' }));
    expect(getNode(state, 'n1')?.parentId).toBe('g2');

    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'n1', parentId: 'g3' }));
    expect(getNode(state, 'n1')?.parentId).toBe('g3');

    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'n1', parentId: null }));
    expect(getNode(state, 'n1')?.parentId).toBeUndefined();
  });

  it('should handle swapping parent-child relationship', () => {
    let state = setupState([
      makeGroup('a', { position: { x: 0, y: 0 }, width: 400, height: 300 }),
      makeGroup('b', { position: { x: 50, y: 50 }, width: 200, height: 150, parentId: 'a' }),
    ]);

    // First un-nest b
    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'b', parentId: null }));
    // Then put a inside b
    state = cardsReducer(state, updateCardNodeParent({ nodeId: 'a', parentId: 'b' }));

    expect(getNode(state, 'a')?.parentId).toBe('b');
    expect(getNode(state, 'b')?.parentId).toBeUndefined();
  });

  it('should handle grouping nodes that are already in a group', () => {
    let state = setupState([
      makeGroup('existing', { position: { x: 0, y: 0 }, width: 600, height: 400 }),
      makeNode('n1', { position: { x: 50, y: 50 }, parentId: 'existing' }),
      makeNode('n2', { position: { x: 250, y: 50 }, parentId: 'existing' }),
      makeNode('n3', { position: { x: 50, y: 200 }, parentId: 'existing' }),
    ]);

    // Group n1+n2 (both inside 'existing') into a subgroup
    state = cardsReducer(state, groupSelectedNodes(['n1', 'n2']));

    const card = getCard(state);
    const subgroup = card.nodes.find((n) => n.type === 'container' && n.id !== 'existing')!;

    // n1, n2 should be in the new subgroup
    expect(getNode(state, 'n1')?.parentId).toBe(subgroup.id);
    expect(getNode(state, 'n2')?.parentId).toBe(subgroup.id);
    // n3 should remain in existing
    expect(getNode(state, 'n3')?.parentId).toBe('existing');
    // The subgroup itself should NOT be auto-nested into 'existing'
    // (groupSelectedNodes doesn't auto-detect spatial containment)
  });
});
