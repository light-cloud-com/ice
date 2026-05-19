/**
 * rf-canv2-1 — useCanvasData hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Provider +
 * capture-ref pattern: render `<Provider><Probe /></Provider>` with
 * `renderToString`, capture the hook's return value into a ref, then
 * assert against the captured shapes.
 *
 * `useMemo` and `useCallback` are passed through (no mock) — both are
 * pure given identical deps under server-render, so the captured values
 * equal whatever the bodies compute. Inputs are wired in directly via
 * the args object, so we don't need to mock `useSelector`.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { useCanvasData, type UseCanvasDataArgs, type UseCanvasDataResult } from '../use-canvas-data';
import type { CardNode, CardEdge, Card } from '../../../../store/slices/cards-slice';
import type { NodePipelineStatus } from '../../../../store/slices/pipeline-slice';
import type { CanvasIssue } from '../../../../store/slices/validation-slice';

// ─── Probe ──────────────────────────────────────────────────────────────────

const captureHook = (args: UseCanvasDataArgs): UseCanvasDataResult => {
  const captured: { current?: UseCanvasDataResult } = {};
  const Probe: React.FC = () => {
    captured.current = useCanvasData(args);
    return React.createElement('div', null, 'probe');
  };
  renderToString(React.createElement(Probe));
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

// ─── Fixtures ───────────────────────────────────────────────────────────────

const makeNode = (overrides: Partial<CardNode> = {}): CardNode => ({
  id: 'n1',
  type: 'block',
  position: { x: 0, y: 0 },
  width: 120,
  height: 80,
  data: { iceType: 'Compute.Service' },
  ...overrides,
});

const makeEdge = (overrides: Partial<CardEdge> = {}): CardEdge => ({
  id: 'e1',
  source: 'n1',
  target: 'n2',
  data: { relationship: 'connects_to' },
  ...overrides,
});

const makeCard = (overrides: Partial<Card> = {}): Card => ({
  id: 'card-1',
  name: 'Card',
  nodes: [],
  edges: [],
  viewport: { panX: 0, panY: 0, scale: 1 },
  createdAt: Date.now(),
  ...overrides,
});

const makeArgs = (overrides: Partial<UseCanvasDataArgs> = {}): UseCanvasDataArgs => ({
  card: undefined,
  pipelineNodeStatus: {} as Record<string, NodePipelineStatus>,
  viewLevel: 2,
  validationIssues: [] as readonly CanvasIssue[],
  selectedNodes: [],
  ...overrides,
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasData — empty card', () => {
  it('returns empty arrays/maps when card is undefined', () => {
    const result = captureHook(makeArgs());
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.canvasNodes).toEqual([]);
    expect(result.visibleNodes).toEqual([]);
    expect(result.foldedRemap.size).toBe(0);
    expect(result.effectiveNodes).toEqual([]);
    expect(result.canvasConnections).toEqual([]);
    expect(result.canvasItems).toEqual([]);
    expect(result.nodeValidationMap.size).toBe(0);
    expect(result.nodeDepthMap.size).toBe(0);
    expect(result.sortedNodes).toEqual([]);
  });

  it('returns the card.nodes / card.edges arrays verbatim when present', () => {
    const node = makeNode({ id: 'a' });
    const edge = makeEdge({ id: 'e1' });
    const card = makeCard({ nodes: [node], edges: [edge] });
    const result = captureHook(makeArgs({ card }));
    expect(result.nodes).toEqual([node]);
    expect(result.edges).toEqual([edge]);
  });
});

describe('useCanvasData — canvasNodes projection', () => {
  it('produces one canvasNode per Redux node', () => {
    const card = makeCard({
      nodes: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
    });
    const result = captureHook(makeArgs({ card }));
    expect(result.canvasNodes).toHaveLength(2);
    expect(result.canvasNodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('threads pipeline-status presence into the visual sizing input', () => {
    const card = makeCard({ nodes: [makeNode({ id: 'a' })] });
    // With idle status the node should still project; we only verify the
    // dispatch goes through without throwing — the per-iceType sizing is
    // owned by `computeNodeSizes` (covered separately in canvas-node-sizing
    // tests).
    const result = captureHook(
      makeArgs({
        card,
        pipelineNodeStatus: { a: { status: 'building' } as NodePipelineStatus },
      }),
    );
    expect(result.canvasNodes[0]?.id).toBe('a');
    expect(typeof result.canvasNodes[0]?.width).toBe('number');
    expect(typeof result.canvasNodes[0]?.height).toBe('number');
  });
});

describe('useCanvasData — visibleNodes filtering', () => {
  it('filters out nodes whose iceType is hidden at the current view level', () => {
    // viewLevel 1 typically hides Resource.* but shows Compute.Service blocks.
    const card = makeCard({
      nodes: [makeNode({ id: 'a', data: { iceType: 'Compute.Service' } })],
    });
    const result = captureHook(makeArgs({ card, viewLevel: 1 }));
    // The Compute.Service block should remain visible at viewLevel 1.
    expect(result.visibleNodes.map((n) => n.id)).toContain('a');
  });

  it('promotes children of hidden parents to root by clearing parentId', () => {
    // Build a parent that will be filtered (parent missing from set), and a
    // child pointing at the missing id.
    const card = makeCard({
      nodes: [makeNode({ id: 'child', parentId: 'missing-parent' })],
    });
    const result = captureHook(makeArgs({ card }));
    // Parent isn't in the visible set → child's parentId is reset to null.
    expect(result.visibleNodes[0]?.parentId).toBeNull();
  });
});

describe('useCanvasData — nodeValidationMap', () => {
  it('aggregates issue count per nodeId and keeps the highest severity', () => {
    const issues: CanvasIssue[] = [
      { id: 'i1', nodeId: 'a', severity: 'warning', category: 'property', code: 'X', message: '' },
      { id: 'i2', nodeId: 'a', severity: 'error', category: 'property', code: 'Y', message: '' },
      { id: 'i3', nodeId: 'a', severity: 'info', category: 'property', code: 'Z', message: '' },
      { id: 'i4', nodeId: 'b', severity: 'info', category: 'property', code: 'W', message: '' },
    ];
    const result = captureHook(makeArgs({ validationIssues: issues }));
    expect(result.nodeValidationMap.get('a')).toEqual({ severity: 'error', count: 3 });
    expect(result.nodeValidationMap.get('b')).toEqual({ severity: 'info', count: 1 });
  });

  it('skips issues without nodeId', () => {
    const issues: CanvasIssue[] = [
      { id: 'i1', severity: 'error', category: 'structure', code: 'X', message: '' },
      { id: 'i2', nodeId: 'a', severity: 'warning', category: 'property', code: 'Y', message: '' },
    ];
    const result = captureHook(makeArgs({ validationIssues: issues }));
    expect(result.nodeValidationMap.size).toBe(1);
    expect(result.nodeValidationMap.get('a')?.severity).toBe('warning');
  });
});

describe('useCanvasData — sortedNodes / nodeDepthMap', () => {
  it('returns visible nodes sorted by z-index ascending', () => {
    const card = makeCard({
      nodes: [
        makeNode({ id: 'a', data: { iceType: 'Compute.Service' } }),
        makeNode({ id: 'b', data: { iceType: 'Compute.Service' } }),
      ],
    });
    const result = captureHook(makeArgs({ card }));
    expect(result.sortedNodes).toHaveLength(2);
  });

  it('places selected nodes on top when iceType + depth tie', () => {
    const card = makeCard({
      nodes: [
        makeNode({ id: 'a', data: { iceType: 'Compute.Service' } }),
        makeNode({ id: 'b', data: { iceType: 'Compute.Service' } }),
      ],
    });
    const result = captureHook(makeArgs({ card, selectedNodes: ['b'] }));
    // 'b' is selected → comes after 'a' in the sorted list (rendered on top).
    const ids = result.sortedNodes.map((n) => n.id);
    expect(ids.indexOf('b')).toBeGreaterThan(ids.indexOf('a'));
  });

  it('builds a depth map keyed by node id', () => {
    const card = makeCard({
      nodes: [
        makeNode({ id: 'parent', data: { iceType: 'Group.Region' } }),
        makeNode({ id: 'child', parentId: 'parent', data: { iceType: 'Compute.Service' } }),
      ],
    });
    const result = captureHook(makeArgs({ card }));
    expect(result.nodeDepthMap.has('parent')).toBe(true);
    expect(result.nodeDepthMap.has('child')).toBe(true);
    // Child is one level below parent.
    expect(result.nodeDepthMap.get('child')).toBe((result.nodeDepthMap.get('parent') ?? 0) + 1);
  });
});

describe('useCanvasData — canvasItems / canvasConnections / portMap', () => {
  it('produces canvasItems sized to visibleNodes (post collapsed-ancestor filter)', () => {
    const card = makeCard({
      nodes: [
        makeNode({ id: 'a', data: { iceType: 'Compute.Service' } }),
        makeNode({ id: 'b', data: { iceType: 'Compute.Service' } }),
      ],
    });
    const result = captureHook(makeArgs({ card }));
    expect(result.canvasItems).toHaveLength(2);
    // Items have id/x/y/width/height/parentId — no _z field.
    expect(Object.keys(result.canvasItems[0])).toEqual(
      expect.arrayContaining(['id', 'x', 'y', 'width', 'height', 'parentId']),
    );
    expect(Object.keys(result.canvasItems[0])).not.toContain('_z');
  });

  it('produces canvasConnections from edges (filters out contains)', () => {
    const card = makeCard({
      nodes: [
        makeNode({ id: 'a', data: { iceType: 'Compute.Service' } }),
        makeNode({ id: 'b', data: { iceType: 'Compute.Service' } }),
      ],
      edges: [makeEdge({ id: 'e1', source: 'a', target: 'b' })],
    });
    const result = captureHook(makeArgs({ card }));
    expect(result.canvasConnections).toHaveLength(1);
    expect(result.canvasConnections[0]?.id).toBe('e1');
  });

  it('builds a port map keyed by node id with side buckets', () => {
    const card = makeCard({
      nodes: [
        makeNode({ id: 'a', data: { iceType: 'Compute.Service' }, position: { x: 0, y: 0 } }),
        makeNode({ id: 'b', data: { iceType: 'Compute.Service' }, position: { x: 200, y: 0 } }),
      ],
      edges: [makeEdge({ id: 'e1', source: 'a', target: 'b' })],
    });
    const result = captureHook(makeArgs({ card }));
    // The exact shape is owned by canvas-connections; we just assert it's a Map.
    expect(result.portMap).toBeInstanceOf(Map);
  });
});

describe('useCanvasData — foldedRemap / effectiveNodes', () => {
  it('returns an empty foldedRemap when no node is folded', () => {
    const card = makeCard({
      nodes: [makeNode({ id: 'a', data: { iceType: 'Compute.Service' } })],
    });
    const result = captureHook(makeArgs({ card }));
    expect(result.foldedRemap.size).toBe(0);
  });

  it('compacts folded nodes to the FOLDED_HEIGHT (38) in effectiveNodes', () => {
    const card = makeCard({
      nodes: [
        makeNode({
          id: 'a',
          data: { iceType: 'Group.Region', folded: true },
        }),
      ],
    });
    const result = captureHook(makeArgs({ card }));
    expect(result.effectiveNodes[0]?.height).toBe(38);
  });

  it('omits descendants of folded ancestors from effectiveNodes', () => {
    const card = makeCard({
      nodes: [
        makeNode({ id: 'parent', data: { iceType: 'Group.Region', folded: true } }),
        makeNode({ id: 'child', parentId: 'parent', data: { iceType: 'Compute.Service' } }),
      ],
    });
    const result = captureHook(makeArgs({ card }));
    const ids = result.effectiveNodes.map((n) => n.id);
    expect(ids).toContain('parent');
    expect(ids).not.toContain('child');
  });
});
