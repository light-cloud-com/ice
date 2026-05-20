/**
 * operation-executor — tests covering every op switch arm + post-execution
 * helpers (orphan helpers, auto-resize, auto-organize trigger).
 *
 * The SUT reads the active card from the module-scoped `store` global, so
 * we mock `../../../store` to expose a controllable getState. The helper
 * modules (blueprint-resolver, position-finder, auto-resize, orphan-helpers,
 * reparent-validator) are mocked so we can exercise each switch arm in
 * isolation without dragging in the blueprints config.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AiCanvasOp } from '@ice/types';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getStateImpl: vi.fn(),
  resolveBlueprint: vi.fn(),
  findPosition: vi.fn(() => ({ x: 100, y: 100 })),
  findChildPosition: vi.fn(() => ({ x: 50, y: 50 })),
  pickNodeDefaults: vi.fn(() => ({ width: 220, height: 72 })),
  validateReparent: vi.fn(() => ({ kind: 'ok' as const, resolvedParentId: 'parent-1' })),
  connectOrphanHelpers: vi.fn(() => 0),
  autoResizeContainers: vi.fn(),
  generateNodeId: vi.fn(() => 'gen-node-1'),
  generateEdgeId: vi.fn(() => 'gen-edge-1'),
}));

vi.mock('../../../../store', () => ({
  store: {
    getState: () => mocks.getStateImpl(),
  },
}));

vi.mock('../ai-ops/blueprint-resolver', () => ({
  resolveBlueprint: (...args: any[]) => (mocks.resolveBlueprint as any)(...args),
}));

vi.mock('../ai-ops/position-finder', () => ({
  findPosition: (...args: any[]) => (mocks.findPosition as any)(...args),
  findChildPosition: (...args: any[]) => (mocks.findChildPosition as any)(...args),
}));

vi.mock('../ai-ops/node-defaults', () => ({
  pickNodeDefaults: (...args: any[]) => (mocks.pickNodeDefaults as any)(...args),
}));

vi.mock('../ai-ops/reparent-validator', () => ({
  validateReparent: (...args: any[]) => (mocks.validateReparent as any)(...args),
}));

vi.mock('../ai-ops/orphan-helpers', () => ({
  connectOrphanHelpers: (...args: any[]) => (mocks.connectOrphanHelpers as any)(...args),
}));

vi.mock('../ai-ops/auto-resize', () => ({
  autoResizeContainers: (...args: any[]) => mocks.autoResizeContainers(...args),
}));

vi.mock('../ai-ops/id-utils', async (orig) => {
  const actual = await orig<typeof import('../ai-ops/id-utils')>();
  return {
    ...actual,
    generateNodeId: () => mocks.generateNodeId(),
    generateEdgeId: () => mocks.generateEdgeId(),
  };
});

// ─── Imports after mocks ────────────────────────────────────────────────────

import { executeAiOperations } from '../operation-executor';
import type { Card, CardNode } from '../../../../store/slices/cards-slice';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    name: 'C',
    nodes: [],
    edges: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
    createdAt: 0,
    ...overrides,
  };
}

function setCard(card: Card | null) {
  if (!card) {
    mocks.getStateImpl.mockImplementation(() => ({
      cards: { activeCardId: null, cards: [] },
    }));
    return;
  }
  mocks.getStateImpl.mockImplementation(() => ({
    cards: { activeCardId: card.id, cards: [card] },
  }));
}

function makeDispatch() {
  const calls: any[] = [];
  const dispatch = vi.fn((action: any) => {
    calls.push(action);
    return action;
  });
  return { dispatch, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findPosition.mockReturnValue({ x: 100, y: 100 });
  mocks.findChildPosition.mockReturnValue({ x: 50, y: 50 });
  mocks.pickNodeDefaults.mockReturnValue({ width: 220, height: 72 });
  mocks.validateReparent.mockReturnValue({ kind: 'ok', resolvedParentId: 'parent-1' });
  mocks.connectOrphanHelpers.mockReturnValue(0);
  mocks.generateNodeId.mockImplementation(() => 'gen-node-1');
  mocks.generateEdgeId.mockImplementation(() => 'gen-edge-1');
});

// ────────────────────────────────────────────────────────────────────────────
// No active card guard
// ────────────────────────────────────────────────────────────────────────────

describe('executeAiOperations — no active card', () => {
  it('returns failure result with null snapshot when no active card', () => {
    setCard(null);
    const { dispatch } = makeDispatch();
    const out = executeAiOperations(dispatch as any, [{ op: 'autoOrganize' }]);
    expect(out.snapshot).toBeNull();
    expect(out.result.success).toBe(false);
    expect(out.result.executedOps).toBe(0);
    expect(out.result.skippedOps).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// addBlueprint
// ────────────────────────────────────────────────────────────────────────────

describe('executeAiOperations — addBlueprint', () => {
  it('skips when blueprint not found', () => {
    setCard(makeCard());
    mocks.resolveBlueprint.mockReturnValue(null);
    const { dispatch, calls } = makeDispatch();
    const op: AiCanvasOp = { op: 'addBlueprint', id: 'ai-n-1', iceType: 'Unknown.Type' };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.skippedOps).toHaveLength(1);
    expect(out.result.skippedOps[0].reason).toContain('Blueprint not found');
    expect(out.result.executedOps).toBe(0);
    // No addNodeToCard dispatched
    expect(calls.find((c) => c.type === 'cards/addNodeToCard')).toBeUndefined();
  });

  it('dispatches addNodeToCard and maps id + iceType in idMap', () => {
    setCard(makeCard());
    const node: CardNode = {
      id: 'real-id',
      type: 'block',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      data: { iceType: 'Database.PostgreSQL' },
    } as any;
    mocks.resolveBlueprint.mockReturnValue(node);
    const { dispatch, calls } = makeDispatch();
    const op: AiCanvasOp = { op: 'addBlueprint', id: 'ai-1', iceType: 'Database.PostgreSQL' };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.executedOps).toBe(1);
    expect(out.result.createdNodeIds.get('ai-1')).toBe('real-id');
    expect(out.result.createdNodeIds.get('Database.PostgreSQL')).toBe('real-id');
    expect(calls.find((c) => c.type === 'cards/addNodeToCard')).toBeDefined();
  });

  it('strips parentId when parent is missing or not a container', () => {
    const card = makeCard({
      nodes: [{ id: 'p1', type: 'block', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any],
    });
    setCard(card);
    const node: CardNode = {
      id: 'real-id',
      type: 'block',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      data: {},
      parentId: 'p1', // p1 exists but not a container
    } as any;
    mocks.resolveBlueprint.mockReturnValue(node);
    const { dispatch } = makeDispatch();
    const op: AiCanvasOp = { op: 'addBlueprint', id: 'ai-1', iceType: 'X.Y' };
    executeAiOperations(dispatch as any, [op]);
    // After mutation parentId should be deleted on the node passed to addNodeToCard
    expect(node.parentId).toBeUndefined();
  });

  it('keeps parentId when parent exists and is a container', () => {
    const card = makeCard({
      nodes: [{ id: 'p1', type: 'container', position: { x: 0, y: 0 }, width: 200, height: 100, data: {} } as any],
    });
    setCard(card);
    const node: CardNode = {
      id: 'real-id',
      type: 'block',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      data: {},
      parentId: 'p1',
    } as any;
    mocks.resolveBlueprint.mockReturnValue(node);
    const { dispatch } = makeDispatch();
    executeAiOperations(dispatch as any, [{ op: 'addBlueprint', id: 'ai-1', iceType: 'X.Y' }]);
    expect(node.parentId).toBe('p1');
  });

  it('skips id-mapping when op.id is omitted', () => {
    setCard(makeCard());
    const node: CardNode = {
      id: 'real',
      type: 'block',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      data: {},
    } as any;
    mocks.resolveBlueprint.mockReturnValue(node);
    const { dispatch } = makeDispatch();
    const op: AiCanvasOp = { op: 'addBlueprint', iceType: 'Foo.Bar' };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.createdNodeIds.has('Foo.Bar')).toBe(true);
    expect(out.result.executedOps).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// addNode
// ────────────────────────────────────────────────────────────────────────────

describe('executeAiOperations — addNode', () => {
  it('dispatches addNodeToCard with generated id and resolved parent', () => {
    const card = makeCard({
      nodes: [{ id: 'cont', type: 'container', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any],
    });
    setCard(card);
    const { dispatch, calls } = makeDispatch();
    const op: AiCanvasOp = {
      op: 'addNode',
      node: {
        id: 'ai-1',
        type: 'block',
        position: { x: 0, y: 0 },
        parentId: 'cont',
        data: { iceType: 'Compute.Container' },
      },
    };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.executedOps).toBe(1);
    expect(out.result.createdNodeIds.get('ai-1')).toBe('gen-node-1');
    const action = calls.find((c) => c.type === 'cards/addNodeToCard');
    expect(action.payload.parentId).toBe('cont');
  });

  it('skips when parent does not exist', () => {
    setCard(makeCard());
    const { dispatch } = makeDispatch();
    const op: AiCanvasOp = {
      op: 'addNode',
      node: {
        id: 'ai-1',
        type: 'block',
        position: { x: 0, y: 0 },
        parentId: 'missing',
        data: {},
      },
    };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.skippedOps).toHaveLength(1);
    expect(out.result.skippedOps[0].reason).toContain('Parent node not found');
  });

  it('drops parentId when parent is not a container', () => {
    const card = makeCard({
      nodes: [{ id: 'p', type: 'block', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any],
    });
    setCard(card);
    const { dispatch, calls } = makeDispatch();
    const op: AiCanvasOp = {
      op: 'addNode',
      node: {
        id: 'ai-1',
        type: 'block',
        position: { x: 0, y: 0 },
        parentId: 'p',
        data: {},
      },
    };
    executeAiOperations(dispatch as any, [op]);
    const action = calls.find((c) => c.type === 'cards/addNodeToCard');
    expect(action.payload.parentId).toBeUndefined();
  });

  it('uses op.node.position when both x and y are non-zero', () => {
    setCard(makeCard());
    const { dispatch, calls } = makeDispatch();
    const op: AiCanvasOp = {
      op: 'addNode',
      node: {
        id: 'ai-1',
        type: 'block',
        position: { x: 50, y: 60 },
        data: {},
      },
    };
    executeAiOperations(dispatch as any, [op]);
    const action = calls.find((c) => c.type === 'cards/addNodeToCard');
    expect(action.payload.position).toEqual({ x: 50, y: 60 });
    expect(mocks.findPosition).not.toHaveBeenCalled();
  });

  it('routes through findPosition when position is (0, 0)', () => {
    setCard(makeCard());
    const { dispatch, calls } = makeDispatch();
    mocks.findPosition.mockReturnValueOnce({ x: 999, y: 888 });
    const op: AiCanvasOp = {
      op: 'addNode',
      node: { id: 'ai-1', type: 'block', position: { x: 0, y: 0 }, data: {} },
    };
    executeAiOperations(dispatch as any, [op]);
    const action = calls.find((c) => c.type === 'cards/addNodeToCard');
    expect(action.payload.position).toEqual({ x: 999, y: 888 });
  });

  it('uses op.node.width/height overrides when provided', () => {
    setCard(makeCard());
    const { dispatch, calls } = makeDispatch();
    const op: AiCanvasOp = {
      op: 'addNode',
      node: {
        id: 'ai-1',
        type: 'block',
        position: { x: 1, y: 1 },
        width: 333,
        height: 222,
        data: {},
      },
    };
    executeAiOperations(dispatch as any, [op]);
    const action = calls.find((c) => c.type === 'cards/addNodeToCard');
    expect(action.payload.width).toBe(333);
    expect(action.payload.height).toBe(222);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// addEdge
// ────────────────────────────────────────────────────────────────────────────

describe('executeAiOperations — addEdge', () => {
  it('skips when source node missing', () => {
    setCard(makeCard());
    const { dispatch } = makeDispatch();
    const op: AiCanvasOp = {
      op: 'addEdge',
      edge: { id: 'e1', source: 's', target: 't' },
    };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.skippedOps[0].reason).toContain('Source node not found');
  });

  it('skips when target node missing', () => {
    setCard(
      makeCard({
        nodes: [{ id: 's', type: 'block', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any],
      }),
    );
    const { dispatch } = makeDispatch();
    const op: AiCanvasOp = {
      op: 'addEdge',
      edge: { id: 'e1', source: 's', target: 't' },
    };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.skippedOps[0].reason).toContain('Target node not found');
  });

  it('dispatches addEdgeToCard with generated id and resolved endpoints', () => {
    setCard(
      makeCard({
        nodes: [
          { id: 's', type: 'block', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any,
          { id: 't', type: 'block', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any,
        ],
      }),
    );
    const { dispatch, calls } = makeDispatch();
    const op: AiCanvasOp = {
      op: 'addEdge',
      edge: { id: 'e1', source: 's', target: 't', data: { kind: 'connects_to' } },
    };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.executedOps).toBe(1);
    const action = calls.find((c) => c.type === 'cards/addEdgeToCard');
    expect(action.payload.id).toBe('gen-edge-1');
    expect(action.payload.source).toBe('s');
    expect(action.payload.target).toBe('t');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// updateNodeData / updateNodePosition / resizeNode / deleteNode
// ────────────────────────────────────────────────────────────────────────────

describe('executeAiOperations — node mutations', () => {
  function withNode(id: string) {
    return makeCard({
      nodes: [{ id, type: 'block', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any],
    });
  }

  it('updateNodeData skips when node missing', () => {
    setCard(makeCard());
    const { dispatch } = makeDispatch();
    const op: AiCanvasOp = { op: 'updateNodeData', nodeId: 'x', data: { foo: 1 } };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.skippedOps[0].reason).toContain('Node not found');
  });

  it('updateNodeData dispatches updateCardNodeData', () => {
    setCard(withNode('n1'));
    const { dispatch, calls } = makeDispatch();
    executeAiOperations(dispatch as any, [{ op: 'updateNodeData', nodeId: 'n1', data: { foo: 1 } }]);
    expect(calls.find((c) => c.type === 'cards/updateCardNodeData')).toBeDefined();
  });

  it('updateNodePosition skips when node missing', () => {
    setCard(makeCard());
    const { dispatch } = makeDispatch();
    const op: AiCanvasOp = { op: 'updateNodePosition', nodeId: 'x', x: 10, y: 20 };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.skippedOps[0].reason).toContain('Node not found');
  });

  it('updateNodePosition dispatches updateCardNodePosition', () => {
    setCard(withNode('n1'));
    const { dispatch, calls } = makeDispatch();
    executeAiOperations(dispatch as any, [{ op: 'updateNodePosition', nodeId: 'n1', x: 10, y: 20 }]);
    expect(calls.find((c) => c.type === 'cards/updateCardNodePosition')).toBeDefined();
  });

  it('resizeNode skips when node missing', () => {
    setCard(makeCard());
    const { dispatch } = makeDispatch();
    const op: AiCanvasOp = { op: 'resizeNode', id: 'x', width: 100, height: 50 };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.skippedOps[0].reason).toContain('Node not found');
  });

  it('resizeNode dispatches resizeCardNode', () => {
    setCard(withNode('n1'));
    const { dispatch, calls } = makeDispatch();
    executeAiOperations(dispatch as any, [{ op: 'resizeNode', id: 'n1', width: 100, height: 50 }]);
    expect(calls.find((c) => c.type === 'cards/resizeCardNode')).toBeDefined();
  });

  it('deleteNode skips when node missing', () => {
    setCard(makeCard());
    const { dispatch } = makeDispatch();
    const op: AiCanvasOp = { op: 'deleteNode', nodeId: 'x' };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.skippedOps[0].reason).toContain('Node not found');
  });

  it('deleteNode dispatches deleteCardNode', () => {
    setCard(withNode('n1'));
    const { dispatch, calls } = makeDispatch();
    executeAiOperations(dispatch as any, [{ op: 'deleteNode', nodeId: 'n1' }]);
    expect(calls.find((c) => c.type === 'cards/deleteCardNode')).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// reparentNode
// ────────────────────────────────────────────────────────────────────────────

describe('executeAiOperations — reparentNode', () => {
  it('skips when child node not found', () => {
    setCard(makeCard());
    const { dispatch } = makeDispatch();
    const op: AiCanvasOp = { op: 'reparentNode', nodeId: 'missing', parentId: 'p' };
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.skippedOps[0].reason).toContain('Node not found');
  });

  it('null parentId clears parent and dispatches updateCardNodeParent', () => {
    setCard(
      makeCard({
        nodes: [{ id: 'n', type: 'block', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any],
      }),
    );
    const { dispatch, calls } = makeDispatch();
    const op: AiCanvasOp = { op: 'reparentNode', nodeId: 'n', parentId: null };
    executeAiOperations(dispatch as any, [op]);
    const action = calls.find((c) => c.type === 'cards/updateCardNodeParent');
    expect(action.payload.parentId).toBeNull();
  });

  it('skip verdict is recorded as skipped op', () => {
    setCard(
      makeCard({
        nodes: [
          { id: 'n', type: 'block', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any,
          { id: 'p', type: 'container', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any,
        ],
      }),
    );
    mocks.validateReparent.mockReturnValueOnce({ kind: 'skip', reason: 'cycle' } as any);
    const { dispatch } = makeDispatch();
    const out = executeAiOperations(dispatch as any, [{ op: 'reparentNode', nodeId: 'n', parentId: 'p' }]);
    expect(out.result.skippedOps[0].reason).toBe('cycle');
  });

  it('ok verdict dispatches updateCardNodeParent + updateCardNodePosition', () => {
    setCard(
      makeCard({
        nodes: [
          { id: 'n', type: 'block', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} } as any,
          { id: 'p', type: 'container', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any,
        ],
      }),
    );
    mocks.validateReparent.mockReturnValueOnce({ kind: 'ok', resolvedParentId: 'p' });
    const { dispatch, calls } = makeDispatch();
    executeAiOperations(dispatch as any, [{ op: 'reparentNode', nodeId: 'n', parentId: 'p' }]);
    expect(calls.find((c) => c.type === 'cards/updateCardNodeParent')).toBeDefined();
    expect(calls.find((c) => c.type === 'cards/updateCardNodePosition')).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// deleteEdge / updateEdgeData
// ────────────────────────────────────────────────────────────────────────────

describe('executeAiOperations — edge mutations', () => {
  function withEdge() {
    return makeCard({
      edges: [{ id: 'e1', source: 's', target: 't' } as any],
    });
  }

  it('deleteEdge skips when missing', () => {
    setCard(makeCard());
    const { dispatch } = makeDispatch();
    const out = executeAiOperations(dispatch as any, [{ op: 'deleteEdge', edgeId: 'x' }]);
    expect(out.result.skippedOps[0].reason).toContain('Edge not found');
  });

  it('deleteEdge dispatches deleteCardEdge', () => {
    setCard(withEdge());
    const { dispatch, calls } = makeDispatch();
    executeAiOperations(dispatch as any, [{ op: 'deleteEdge', edgeId: 'e1' }]);
    expect(calls.find((c) => c.type === 'cards/deleteCardEdge')).toBeDefined();
  });

  it('updateEdgeData skips when missing', () => {
    setCard(makeCard());
    const { dispatch } = makeDispatch();
    const out = executeAiOperations(dispatch as any, [{ op: 'updateEdgeData', edgeId: 'x', data: {} }]);
    expect(out.result.skippedOps[0].reason).toContain('Edge not found');
  });

  it('updateEdgeData dispatches updateCardEdgeData', () => {
    setCard(withEdge());
    const { dispatch, calls } = makeDispatch();
    executeAiOperations(dispatch as any, [{ op: 'updateEdgeData', edgeId: 'e1', data: { foo: 1 } }]);
    expect(calls.find((c) => c.type === 'cards/updateCardEdgeData')).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// autoOrganize / unknown / errors / MAX_OPS
// ────────────────────────────────────────────────────────────────────────────

describe('executeAiOperations — autoOrganize', () => {
  it('dispatches autoOrganizeCard with vertical direction', () => {
    setCard(makeCard());
    const { dispatch, calls } = makeDispatch();
    executeAiOperations(dispatch as any, [{ op: 'autoOrganize' }]);
    const action = calls.find((c) => c.type === 'cards/autoOrganizeCard');
    expect(action.payload.direction).toBe('vertical');
  });
});

describe('executeAiOperations — unknown op', () => {
  it('records unknown op as skipped', () => {
    setCard(makeCard());
    const { dispatch } = makeDispatch();
    const op = { op: 'mystery' } as unknown as AiCanvasOp;
    const out = executeAiOperations(dispatch as any, [op]);
    expect(out.result.skippedOps[0].reason).toBe('Unknown operation type');
  });
});

describe('executeAiOperations — exception in switch arm', () => {
  it('records error message as skipped op', () => {
    setCard(
      makeCard({
        nodes: [{ id: 'n', type: 'block', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any],
      }),
    );
    const { dispatch } = makeDispatch();
    // Make dispatch throw on first action — exception should be captured by per-op try/catch
    dispatch.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const out = executeAiOperations(dispatch as any, [{ op: 'updateNodeData', nodeId: 'n', data: { foo: 1 } }]);
    expect(out.result.skippedOps[0].reason).toContain('Execution error: boom');
  });
});

describe('executeAiOperations — MAX_OPS truncation', () => {
  it('truncates ops past MAX_OPS and warns', () => {
    setCard(makeCard());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { dispatch } = makeDispatch();
    const ops: AiCanvasOp[] = Array.from({ length: 60 }, () => ({ op: 'autoOrganize' }));
    const out = executeAiOperations(dispatch as any, ops);
    // 50 max + dedup post-loop autoOrganize triggered? Let's just verify warn fired
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('AI operation limit reached'));
    // Only 50 of the 60 should have been considered (executedOps <= 50)
    expect(out.result.executedOps).toBeLessThanOrEqual(50);
    warn.mockRestore();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// post-execution helpers
// ────────────────────────────────────────────────────────────────────────────

describe('executeAiOperations — post-execution', () => {
  it('does not call connectOrphanHelpers when zero ops executed', () => {
    setCard(makeCard());
    const { dispatch } = makeDispatch();
    executeAiOperations(dispatch as any, []);
    expect(mocks.connectOrphanHelpers).not.toHaveBeenCalled();
    // autoResizeContainers always runs
    expect(mocks.autoResizeContainers).toHaveBeenCalled();
  });

  it('calls connectOrphanHelpers when at least one op executed and counts orphans', () => {
    setCard(makeCard());
    mocks.connectOrphanHelpers.mockReturnValueOnce(3);
    const { dispatch } = makeDispatch();
    const out = executeAiOperations(dispatch as any, [{ op: 'autoOrganize' }]);
    expect(mocks.connectOrphanHelpers).toHaveBeenCalled();
    // executedOps = 1 (autoOrganize) + 3 (orphans) = 4
    expect(out.result.executedOps).toBe(4);
  });

  it('triggers autoOrganize when structural ops succeed and no explicit organize', () => {
    setCard(makeCard());
    const { dispatch, calls } = makeDispatch();
    // addNode is structural; no explicit autoOrganize in the op list
    const op: AiCanvasOp = {
      op: 'addNode',
      node: { id: 'ai-1', type: 'block', position: { x: 1, y: 1 }, data: {} },
    };
    executeAiOperations(dispatch as any, [op]);
    // The post-loop autoOrganizeCard dispatch should fire
    const organizes = calls.filter((c) => c.type === 'cards/autoOrganizeCard');
    expect(organizes.length).toBe(1);
  });

  it('skips post-loop autoOrganize when an explicit autoOrganize op is in the list', () => {
    setCard(makeCard());
    const { dispatch, calls } = makeDispatch();
    const op1: AiCanvasOp = {
      op: 'addNode',
      node: { id: 'ai-1', type: 'block', position: { x: 1, y: 1 }, data: {} },
    };
    const op2: AiCanvasOp = { op: 'autoOrganize' };
    executeAiOperations(dispatch as any, [op1, op2]);
    const organizes = calls.filter((c) => c.type === 'cards/autoOrganizeCard');
    // Only the explicit autoOrganize from the op list
    expect(organizes.length).toBe(1);
  });

  it('does not trigger post-loop autoOrganize when no structural ops', () => {
    setCard(
      makeCard({
        nodes: [{ id: 'n', type: 'block', position: { x: 0, y: 0 }, width: 0, height: 0, data: {} } as any],
      }),
    );
    const { dispatch, calls } = makeDispatch();
    executeAiOperations(dispatch as any, [{ op: 'updateNodeData', nodeId: 'n', data: { x: 1 } }]);
    const organizes = calls.filter((c) => c.type === 'cards/autoOrganizeCard');
    expect(organizes.length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// snapshot
// ────────────────────────────────────────────────────────────────────────────

describe('executeAiOperations — snapshot', () => {
  it('returns a deep clone of the active card as snapshot', () => {
    const card = makeCard({
      nodes: [{ id: 'n', type: 'block', position: { x: 0, y: 0 }, width: 0, height: 0, data: { x: 1 } } as any],
    });
    setCard(card);
    const { dispatch } = makeDispatch();
    const out = executeAiOperations(dispatch as any, []);
    expect(out.snapshot).not.toBeNull();
    expect(out.snapshot).not.toBe(card);
    expect(out.snapshot?.id).toBe(card.id);
    expect((out.snapshot?.nodes[0].data as any).x).toBe(1);
  });
});
