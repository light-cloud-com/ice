/**
 * Tests for `useComputingFlows` — derived-property propagation hook.
 *
 * Strategy:
 *   - Mock `useEffect` to fire synchronously.
 *   - Mock `useRef` to a passthrough.
 *   - Mock `useDispatch` and `useSelector`.
 *   - Mock `computeDerived` and `diffPatches` to control patch shape.
 *   - Cover three branches:
 *       1. early-return when no nodes/edges
 *       2. early-return when no patches
 *       3. dispatches deletions, edge patches, node patches in order
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  dispatch: vi.fn(),
  selectActiveCard: vi.fn(() => null as unknown),
  computeDerived: vi.fn(() => ({ nodePatches: [], edgePatches: [], edgeDeletions: [] })),
  diffPatches: vi.fn(() => ({ nodePatches: [], edgePatches: [], edgeDeletions: [] })),
  updateCardNodeData: vi.fn((p: unknown) => ({ type: 'cards/updateCardNodeData', payload: p })),
  updateCardEdgeData: vi.fn((p: unknown) => ({ type: 'cards/updateCardEdgeData', payload: p })),
  deleteCardEdge: vi.fn((p: unknown) => ({ type: 'cards/deleteCardEdge', payload: p })),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void)) => {
      cb();
    },
    useRef: <T,>(initial: T) => ({ current: initial }),
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('@ice/core/compute', () => ({
  computeDerived: mocks.computeDerived,
  diffPatches: mocks.diffPatches,
}));

vi.mock('../../../../store/slices/cards-slice', () => ({
  selectActiveCard: mocks.selectActiveCard,
  updateCardNodeData: mocks.updateCardNodeData,
  updateCardEdgeData: mocks.updateCardEdgeData,
  deleteCardEdge: mocks.deleteCardEdge,
}));

import { useComputingFlows } from '../use-computing-flows';

const mount = () => {
  const Probe: React.FC = () => {
    useComputingFlows();
    return null;
  };
  renderToString(React.createElement(Probe));
};

beforeEach(() => {
  mocks.state = {};
  mocks.dispatch.mockReset();
  mocks.selectActiveCard.mockReset();
  mocks.selectActiveCard.mockReturnValue(null);
  mocks.computeDerived.mockReset();
  mocks.computeDerived.mockReturnValue({ nodePatches: [], edgePatches: [], edgeDeletions: [] });
  mocks.diffPatches.mockReset();
  mocks.diffPatches.mockReturnValue({ nodePatches: [], edgePatches: [], edgeDeletions: [] });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useComputingFlows — early returns', () => {
  it('does nothing when there is no active card', () => {
    mocks.selectActiveCard.mockReturnValue(null);
    mount();
    expect(mocks.computeDerived).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('does nothing when nodes array is empty', () => {
    mocks.selectActiveCard.mockReturnValue({ nodes: [], edges: [] });
    mount();
    expect(mocks.computeDerived).not.toHaveBeenCalled();
  });

  it('does nothing when patches are empty', () => {
    mocks.selectActiveCard.mockReturnValue({
      nodes: [{ id: 'n1', type: 'block', data: {} }],
      edges: [],
    });
    mocks.diffPatches.mockReturnValue({ nodePatches: [], edgePatches: [], edgeDeletions: [] });
    mount();
    expect(mocks.computeDerived).toHaveBeenCalled();
    expect(mocks.diffPatches).toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});

describe('useComputingFlows — dispatch ordering', () => {
  beforeEach(() => {
    mocks.selectActiveCard.mockReturnValue({
      nodes: [
        { id: 'n1', type: 'block', data: {}, parentId: undefined },
        { id: 'n2', type: 'block', data: {}, parentId: undefined },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', data: { relationship: 'connects_to' } }],
    });
  });

  it('dispatches edge deletions first, then edge patches, then node patches', () => {
    mocks.diffPatches.mockReturnValue({
      nodePatches: [{ nodeId: 'n1', data: { foo: 1 } }],
      edgePatches: [{ edgeId: 'e1', data: { routeId: 'r1' } }],
      edgeDeletions: [{ edgeId: 'orphan-1' }],
    });
    mount();
    const types = mocks.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(['cards/deleteCardEdge', 'cards/updateCardEdgeData', 'cards/updateCardNodeData']);
  });

  it('dispatches deleteCardEdge with the edgeId only', () => {
    mocks.diffPatches.mockReturnValue({
      nodePatches: [],
      edgePatches: [],
      edgeDeletions: [{ edgeId: 'e-orphan' }],
    });
    mount();
    expect(mocks.deleteCardEdge).toHaveBeenCalledWith('e-orphan');
  });

  it('dispatches updateCardEdgeData with edgeId+data', () => {
    mocks.diffPatches.mockReturnValue({
      nodePatches: [],
      edgePatches: [{ edgeId: 'e1', data: { routeId: 'r2' } }],
      edgeDeletions: [],
    });
    mount();
    expect(mocks.updateCardEdgeData).toHaveBeenCalledWith({ edgeId: 'e1', data: { routeId: 'r2' } });
  });

  it('dispatches updateCardNodeData with nodeId+data', () => {
    mocks.diffPatches.mockReturnValue({
      nodePatches: [{ nodeId: 'n1', data: { derivedField: 'x' } }],
      edgePatches: [],
      edgeDeletions: [],
    });
    mount();
    expect(mocks.updateCardNodeData).toHaveBeenCalledWith({ nodeId: 'n1', data: { derivedField: 'x' } });
  });

  it('handles multiple patches in each category', () => {
    mocks.diffPatches.mockReturnValue({
      nodePatches: [
        { nodeId: 'n1', data: { a: 1 } },
        { nodeId: 'n2', data: { a: 2 } },
      ],
      edgePatches: [
        { edgeId: 'e1', data: { x: 1 } },
        { edgeId: 'e2', data: { x: 2 } },
      ],
      edgeDeletions: [{ edgeId: 'eo1' }, { edgeId: 'eo2' }],
    });
    mount();
    expect(mocks.dispatch).toHaveBeenCalledTimes(6);
  });
});

describe('useComputingFlows — payload shapes', () => {
  it('maps nodes to {id,type,parentId,data}', () => {
    mocks.selectActiveCard.mockReturnValue({
      nodes: [
        { id: 'n1', type: 'block', parentId: 'p1', data: { x: 1 }, position: { x: 0, y: 0 }, width: 0, height: 0 },
      ],
      edges: [],
    });
    mocks.diffPatches.mockReturnValue({
      nodePatches: [{ nodeId: 'n1', data: {} }],
      edgePatches: [],
      edgeDeletions: [],
    });
    mount();
    const [propNodes] = mocks.computeDerived.mock.calls[0] as [
      Array<{ id: string; type: string; parentId?: string; data: unknown }>,
      unknown,
    ];
    // position/width/height are stripped — only id/type/parentId/data carry through.
    expect(propNodes).toEqual([{ id: 'n1', type: 'block', parentId: 'p1', data: { x: 1 } }]);
  });

  it('maps edges to {id,source,target,data}', () => {
    mocks.selectActiveCard.mockReturnValue({
      nodes: [{ id: 'n1', type: 'block', data: {} }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', data: { foo: 'bar' } }],
    });
    mocks.diffPatches.mockReturnValue({
      nodePatches: [],
      edgePatches: [{ edgeId: 'e1', data: {} }],
      edgeDeletions: [],
    });
    mount();
    const [, propEdges] = mocks.computeDerived.mock.calls[0] as [
      unknown,
      Array<{ id: string; source: string; target: string; data: unknown }>,
    ];
    expect(propEdges).toEqual([{ id: 'e1', source: 'n1', target: 'n2', data: { foo: 'bar' } }]);
  });
});
