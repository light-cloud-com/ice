/**
 * Tests for FEAT-3: groupSelectedNodes reducer
 */

import { describe, it, expect } from 'vitest';
import cardsReducer, {
  createCard,
  addNodeToCard,
  groupSelectedNodes,
  type CardsState,
  type CardNode,
} from '../cards-slice';

function makeNode(id: string, overrides: Partial<CardNode> = {}): CardNode {
  return {
    id,
    type: 'resource',
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
    data: { label: id, iceType: 'Application.Container' },
    ...overrides,
  };
}

function setupStateWithNodes(nodes: CardNode[]): CardsState {
  let state = cardsReducer(undefined, { type: '@@INIT' });
  state = cardsReducer(state, createCard({ name: 'Test Card' }));
  for (const node of nodes) {
    state = cardsReducer(state, addNodeToCard(node));
  }
  return state;
}

describe('groupSelectedNodes', () => {
  it('should create a container node wrapping selected nodes', () => {
    const nodes = [
      makeNode('n1', { position: { x: 100, y: 100 }, width: 200, height: 100 }),
      makeNode('n2', { position: { x: 400, y: 200 }, width: 200, height: 100 }),
    ];
    const state = setupStateWithNodes(nodes);
    const result = cardsReducer(state, groupSelectedNodes(['n1', 'n2']));

    const card = result.cards.find((c) => c.id === result.activeCardId)!;
    expect(card.nodes).toHaveLength(3); // 2 original + 1 group

    const groupNode = card.nodes.find((n) => n.type === 'container');
    expect(groupNode).toBeDefined();
    expect(groupNode!.data.iceType).toBe('Group.Custom');
    expect(groupNode!.data.label).toBe('New Group');
  });

  it('should reparent selected nodes to the new group', () => {
    const nodes = [makeNode('n1', { position: { x: 100, y: 100 } }), makeNode('n2', { position: { x: 300, y: 200 } })];
    const state = setupStateWithNodes(nodes);
    const result = cardsReducer(state, groupSelectedNodes(['n1', 'n2']));

    const card = result.cards.find((c) => c.id === result.activeCardId)!;
    const groupNode = card.nodes.find((n) => n.type === 'container')!;

    const n1 = card.nodes.find((n) => n.id === 'n1')!;
    const n2 = card.nodes.find((n) => n.id === 'n2')!;

    expect(n1.parentId).toBe(groupNode.id);
    expect(n2.parentId).toBe(groupNode.id);
  });

  it('should size the group to encompass all selected nodes with padding', () => {
    const nodes = [
      makeNode('n1', { position: { x: 100, y: 100 }, width: 200, height: 100 }),
      makeNode('n2', { position: { x: 400, y: 300 }, width: 200, height: 100 }),
    ];
    const state = setupStateWithNodes(nodes);
    const result = cardsReducer(state, groupSelectedNodes(['n1', 'n2']));

    const card = result.cards.find((c) => c.id === result.activeCardId)!;
    const groupNode = card.nodes.find((n) => n.type === 'container')!;

    // Group should be at (100-40, 100-40) = (60, 60)
    expect(groupNode.position.x).toBe(60);
    expect(groupNode.position.y).toBe(60);
    // Width: (600 - 100) + 80 = 580
    expect(groupNode.width).toBe(580);
    // Height: (400 - 100) + 80 + 30 = 410 (30 for header)
    expect(groupNode.height).toBe(410);
  });

  it('should not group fewer than 2 nodes', () => {
    const nodes = [makeNode('n1')];
    const state = setupStateWithNodes(nodes);
    const result = cardsReducer(state, groupSelectedNodes(['n1']));

    const card = result.cards.find((c) => c.id === result.activeCardId)!;
    expect(card.nodes).toHaveLength(1); // No group created
  });

  it('should not reparent nodes that are already children of each other', () => {
    const nodes = [
      makeNode('parent', { type: 'container', position: { x: 0, y: 0 }, width: 500, height: 400 }),
      makeNode('child', { position: { x: 50, y: 50 }, parentId: 'parent' }),
    ];
    const state = setupStateWithNodes(nodes);
    const result = cardsReducer(state, groupSelectedNodes(['parent', 'child']));

    const card = result.cards.find((c) => c.id === result.activeCardId)!;
    const groupNode = card.nodes.find((n) => n.type === 'container' && n.data.iceType === 'Group.Custom')!;
    const child = card.nodes.find((n) => n.id === 'child')!;

    // child's parentId should remain 'parent' since 'parent' is in the selection
    expect(child.parentId).toBe('parent');
    // parent should be reparented to the group
    const parent = card.nodes.find((n) => n.id === 'parent')!;
    expect(parent.parentId).toBe(groupNode.id);
  });

  it('should push an undo snapshot', () => {
    const nodes = [makeNode('n1', { position: { x: 0, y: 0 } }), makeNode('n2', { position: { x: 200, y: 200 } })];
    const state = setupStateWithNodes(nodes);
    const result = cardsReducer(state, groupSelectedNodes(['n1', 'n2']));

    const history = result.history[result.activeCardId];
    expect(history.past.length).toBeGreaterThan(0);
  });
});
