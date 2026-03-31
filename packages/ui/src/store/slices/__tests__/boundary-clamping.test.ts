/**
 * Boundary Clamping — BND-1, BND-2, BND-3 regression tests
 *
 * Tests that child nodes are clamped to their parent container bounds
 * when positions are updated via Redux reducers.
 *
 * Guards against:
 * - Children positioned outside parent bounds after drag
 * - Snap-to-grid rounding pushing nodes outside parent
 * - Batch position updates leaving children outside expanded parents
 */

import { describe, it, expect } from 'vitest';
import cardsReducer, {
  createCard,
  addNodeToCard,
  updateCardNodePosition,
  updateCardNodePositions,
  resizeCardNode,
  type CardsState,
  type CardNode,
} from '../cards-slice';
import { CONTAINER_PADDING, HEADER_HEIGHT } from '../../../config/canvas-constants';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(id: string, overrides: Partial<CardNode> = {}): CardNode {
  return {
    id,
    type: 'resource',
    position: { x: 100, y: 100 },
    width: 200,
    height: 100,
    data: { label: id, iceType: 'Application.Container' },
    ...overrides,
  };
}

function makeGroup(id: string, overrides: Partial<CardNode> = {}): CardNode {
  return {
    id,
    type: 'container',
    position: { x: 0, y: 0 },
    width: 500,
    height: 400,
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

// Inner content area of a parent: left edge = parent.x + CONTAINER_PADDING
const PAD = CONTAINER_PADDING; // 20
const HEADER = HEADER_HEIGHT; // 36

// =============================================================================
// updateCardNodePosition — single node clamping
// =============================================================================

describe('updateCardNodePosition — BND-2 boundary clamping', () => {
  it('should allow positioning within parent bounds', () => {
    const group = makeGroup('g1', { position: { x: 0, y: 0 }, width: 500, height: 400 });
    const child = makeNode('n1', { position: { x: 100, y: 100 }, width: 200, height: 100, parentId: 'g1' });
    const state = setupState([group, child]);

    // Move to a valid position well inside parent
    const result = cardsReducer(state, updateCardNodePosition({ nodeId: 'n1', x: 50, y: 80 }));
    const n = getNode(result, 'n1')!;
    expect(n.position.x).toBe(50);
    expect(n.position.y).toBe(80);
  });

  it('should clamp child that overflows right edge', () => {
    const group = makeGroup('g1', { position: { x: 0, y: 0 }, width: 500, height: 400 });
    const child = makeNode('n1', { position: { x: 100, y: 100 }, width: 200, height: 100, parentId: 'g1' });
    const state = setupState([group, child]);

    // Try to move past right edge: parent.x(0) + parent.width(500) - PAD(20) - child.width(200) = 280
    const result = cardsReducer(state, updateCardNodePosition({ nodeId: 'n1', x: 400, y: 100 }));
    const n = getNode(result, 'n1')!;
    expect(n.position.x).toBe(280); // clamped to max right
    expect(n.position.y).toBe(100); // y unchanged
  });

  it('should clamp child that overflows left edge', () => {
    const group = makeGroup('g1', { position: { x: 50, y: 50 }, width: 500, height: 400 });
    const child = makeNode('n1', { position: { x: 100, y: 100 }, width: 200, height: 100, parentId: 'g1' });
    const state = setupState([group, child]);

    // Try to move past left edge: parent.x(50) + PAD(20) = 70
    const result = cardsReducer(state, updateCardNodePosition({ nodeId: 'n1', x: 10, y: 100 }));
    const n = getNode(result, 'n1')!;
    expect(n.position.x).toBe(70); // clamped to min left
  });

  it('should clamp child that overflows top edge (accounting for header)', () => {
    const group = makeGroup('g1', { position: { x: 0, y: 0 }, width: 500, height: 400 });
    const child = makeNode('n1', { position: { x: 100, y: 100 }, width: 200, height: 100, parentId: 'g1' });
    const state = setupState([group, child]);

    // Try to move past top edge: parent.y(0) + PAD(20) + HEADER(36) = 56
    const result = cardsReducer(state, updateCardNodePosition({ nodeId: 'n1', x: 100, y: 10 }));
    const n = getNode(result, 'n1')!;
    expect(n.position.y).toBe(56); // clamped to min top (below header)
  });

  it('should clamp child that overflows bottom edge', () => {
    const group = makeGroup('g1', { position: { x: 0, y: 0 }, width: 500, height: 400 });
    const child = makeNode('n1', { position: { x: 100, y: 100 }, width: 200, height: 100, parentId: 'g1' });
    const state = setupState([group, child]);

    // Try to move past bottom edge: parent.y(0) + parent.height(400) - PAD(20) - child.height(100) = 280
    const result = cardsReducer(state, updateCardNodePosition({ nodeId: 'n1', x: 100, y: 350 }));
    const n = getNode(result, 'n1')!;
    expect(n.position.y).toBe(280); // clamped to max bottom
  });

  it('should clamp on all four edges simultaneously', () => {
    const group = makeGroup('g1', { position: { x: 100, y: 100 }, width: 300, height: 250 });
    // child.width=200, child.height=100
    const child = makeNode('n1', { position: { x: 150, y: 180 }, width: 200, height: 100, parentId: 'g1' });
    const state = setupState([group, child]);

    // Move way outside all edges
    const result = cardsReducer(state, updateCardNodePosition({ nodeId: 'n1', x: 0, y: 0 }));
    const n = getNode(result, 'n1')!;
    // minX = 100 + 20 = 120
    // minY = 100 + 20 + 36 = 156
    expect(n.position.x).toBe(120);
    expect(n.position.y).toBe(156);
  });

  it('should not clamp root nodes (no parentId)', () => {
    const node = makeNode('n1', { position: { x: 0, y: 0 } });
    const state = setupState([node]);

    // Move to negative coordinates — no clamping for root nodes
    const result = cardsReducer(state, updateCardNodePosition({ nodeId: 'n1', x: -500, y: -500 }));
    const n = getNode(result, 'n1')!;
    expect(n.position.x).toBe(-500);
    expect(n.position.y).toBe(-500);
  });
});

// =============================================================================
// updateCardNodePositions — batch clamping
// =============================================================================

describe('updateCardNodePositions — BND-2 batch boundary clamping', () => {
  it('should clamp multiple children in the same parent', () => {
    const group = makeGroup('g1', { position: { x: 0, y: 0 }, width: 500, height: 400 });
    const child1 = makeNode('n1', { position: { x: 100, y: 100 }, width: 200, height: 100, parentId: 'g1' });
    const child2 = makeNode('n2', { position: { x: 100, y: 200 }, width: 200, height: 100, parentId: 'g1' });
    const state = setupState([group, child1, child2]);

    const result = cardsReducer(
      state,
      updateCardNodePositions([
        { id: 'n1', position: { x: -100, y: -100 } }, // way outside left/top
        { id: 'n2', position: { x: 600, y: 600 } }, // way outside right/bottom
      ]),
    );

    const n1 = getNode(result, 'n1')!;
    const n2 = getNode(result, 'n2')!;

    // n1 clamped to top-left
    expect(n1.position.x).toBe(PAD); // 0 + 20
    expect(n1.position.y).toBe(PAD + HEADER); // 0 + 20 + 36

    // n2 clamped to bottom-right
    expect(n2.position.x).toBe(500 - PAD - 200); // 280
    expect(n2.position.y).toBe(400 - PAD - 100); // 280
  });

  it('should use expanded parent dimensions when parent is also updated', () => {
    const group = makeGroup('g1', { position: { x: 0, y: 0 }, width: 400, height: 300 });
    const child = makeNode('n1', { position: { x: 100, y: 100 }, width: 200, height: 100, parentId: 'g1' });
    const state = setupState([group, child]);

    // First expand the parent, then position child at the new edge
    let result = cardsReducer(state, resizeCardNode({ id: 'g1', width: 600, height: 500 }));
    result = cardsReducer(
      result,
      updateCardNodePositions([{ id: 'n1', position: { x: 370, y: 370 } }]),
    );

    const n = getNode(result, 'n1')!;
    // maxX = 0 + 600 - 20 - 200 = 380
    // maxY = 0 + 500 - 20 - 100 = 380
    expect(n.position.x).toBe(370); // within new bounds
    expect(n.position.y).toBe(370); // within new bounds
  });

  it('should handle parent and child in same batch update', () => {
    const group = makeGroup('g1', { position: { x: 0, y: 0 }, width: 500, height: 400 });
    const child = makeNode('n1', { position: { x: 100, y: 100 }, width: 200, height: 100, parentId: 'g1' });
    const state = setupState([group, child]);

    // Move parent and child together — child should be clamped to moved parent bounds
    const result = cardsReducer(
      state,
      updateCardNodePositions([
        { id: 'g1', position: { x: 200, y: 200 } }, // parent moves to (200, 200)
        { id: 'n1', position: { x: 100, y: 100 } }, // child at (100, 100) — now outside moved parent
      ]),
    );

    const n = getNode(result, 'n1')!;
    // Parent is now at (200, 200) with same size (500, 400)
    // minX = 200 + 20 = 220
    // minY = 200 + 20 + 36 = 256
    expect(n.position.x).toBe(220); // clamped to moved parent left edge
    expect(n.position.y).toBe(256); // clamped to moved parent top edge
  });

  it('should not clamp root nodes in batch', () => {
    const node = makeNode('n1', { position: { x: 0, y: 0 } });
    const state = setupState([node]);

    const result = cardsReducer(
      state,
      updateCardNodePositions([{ id: 'n1', position: { x: -1000, y: -1000 } }]),
    );

    const n = getNode(result, 'n1')!;
    expect(n.position.x).toBe(-1000);
    expect(n.position.y).toBe(-1000);
  });
});

// =============================================================================
// Edge cases — BND-3 snap-to-grid + small parent scenarios
// =============================================================================

describe('boundary clamping edge cases', () => {
  it('should handle parent smaller than child (minX > maxX)', () => {
    // Very small parent where child cannot fit with padding
    const group = makeGroup('g1', { position: { x: 0, y: 0 }, width: 220, height: 150 });
    // Child is 200 wide, parent inner width = 220 - 40 = 180 → maxX < minX
    const child = makeNode('n1', { position: { x: 20, y: 56 }, width: 200, height: 100, parentId: 'g1' });
    const state = setupState([group, child]);

    // Should clamp to minX when maxX < minX (node won't fit but stays at left edge)
    const result = cardsReducer(state, updateCardNodePosition({ nodeId: 'n1', x: -100, y: 56 }));
    const n = getNode(result, 'n1')!;
    // minX = 0 + 20 = 20, maxX = 0 + 220 - 20 - 200 = 0
    // Math.max(20, Math.min(0, -100)) = Math.max(20, -100) = 20
    expect(n.position.x).toBe(20);
  });

  it('should handle nested groups — child of inner group clamped to inner parent', () => {
    const outer = makeGroup('g-outer', { position: { x: 0, y: 0 }, width: 800, height: 600 });
    const inner = makeGroup('g-inner', {
      position: { x: 50, y: 80 },
      width: 400,
      height: 300,
      parentId: 'g-outer',
    });
    const child = makeNode('n1', {
      position: { x: 100, y: 150 },
      width: 200,
      height: 100,
      parentId: 'g-inner',
    });
    const state = setupState([outer, inner, child]);

    // Move child outside inner group but inside outer group
    const result = cardsReducer(state, updateCardNodePosition({ nodeId: 'n1', x: 500, y: 400 }));
    const n = getNode(result, 'n1')!;
    // Clamped to INNER parent bounds:
    // maxX = 50 + 400 - 20 - 200 = 230
    // maxY = 80 + 300 - 20 - 100 = 260
    expect(n.position.x).toBe(230);
    expect(n.position.y).toBe(260);
  });
});
