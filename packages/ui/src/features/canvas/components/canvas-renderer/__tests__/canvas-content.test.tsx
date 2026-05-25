/**
 * rf-svgcv2-1 — CanvasContent component tests.
 *
 * The CanvasContent FC is the inner pan/zoom transform group. We mock
 * each leaf component as a stub FC and walk the rendered tree by
 * `el.type` reference (the walker doesn't invoke FCs — see the
 * `walker-yields-fc-elements-but-cannot-descend-without-recursive-invocation`
 * learning), inspecting the FC element's `.props.<key>` directly.
 *
 * Verifies:
 *   - the outer `<g>` carries the pan/zoom transform string
 *   - children appear in the documented draw order
 *   - both ConnectionLayer instances render with their distinct `mode`
 *   - the connection-drawing preview is gated on drawingConnection
 *   - prop bundles flow through unchanged
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  CanvasGrid: vi.fn(() => null),
  SelectionFrame: vi.fn(() => null),
  ConnectionLayer: vi.fn(() => null),
  ConnectionPreviewOverlay: vi.fn(() => null),
  UserTrafficOverlay: vi.fn(() => null),
  GhostOverlay: vi.fn(() => null),
  ParentClipDefs: vi.fn(() => null),
  NodesLayer: vi.fn(() => null),
}));

vi.mock('../../canvas-grid', () => ({ CanvasGrid: mocks.CanvasGrid }));
vi.mock('../../selection-frame', () => ({ SelectionFrame: mocks.SelectionFrame }));
vi.mock('../../connection-layer', () => ({ ConnectionLayer: mocks.ConnectionLayer }));
vi.mock('../../connection-preview-overlay', () => ({ ConnectionPreviewOverlay: mocks.ConnectionPreviewOverlay }));
vi.mock('../../user-traffic-overlay', () => ({ UserTrafficOverlay: mocks.UserTrafficOverlay }));
vi.mock('../../ghost/ghost-overlay', () => ({ GhostOverlay: mocks.GhostOverlay }));
vi.mock('../parent-clip-defs', () => ({ ParentClipDefs: mocks.ParentClipDefs }));
vi.mock('../nodes-layer', () => ({ NodesLayer: mocks.NodesLayer }));

import { CanvasContent, type CanvasContentProps } from '../canvas-content';

const baseProps: CanvasContentProps = {
  viewport: { x: 5, y: 7, zoom: 2 },
  dimensions: { width: 800, height: 600 },
  canvasConnections: [],
  effectiveNodes: [],
  portMap: new Map() as never,
  animatingEdges: {} as never,
  pipelineNodeStatus: {},
  selectedNodes: [],
  selectedEdges: [],
  hoveredNodeId: null,
  lod: 1,
  edgeStyle: 'bezier' as never,
  handleConnectionHover: () => {},
  handleEdgeDelete: () => {},
  handleEdgeSelect: () => {},
  handleContextMenu: () => {},
  sortedNodes: [],
  animatingNodes: {},
  shiftDraggingNodeIds: new Set(),
  dragOverGroupId: null,
  renderCtx: {} as never,
  drawingConnection: null,
  connectionDragTargets: null,
  connectionRejection: null,
  showVirtualUserNode: true,
  userConnections: [],
  nodesWithUserNode: [],
  pinnedUserPos: null,
  setUserNodePos: () => {},
  ghosts: [],
  nodes: [],
  onAcceptGhost: () => {},
  onDismissGhost: () => {},
};

const renderResult = (props: CanvasContentProps) =>
  CanvasContent(props) as React.ReactElement<{
    transform: string;
    children: React.ReactElement[];
  }>;

const liveChildren = (
  el: React.ReactElement<{ children: React.ReactElement[] | (React.ReactElement | false)[] }>,
): React.ReactElement[] =>
  (el.props.children as Array<React.ReactElement | false>).filter((c): c is React.ReactElement => Boolean(c));

const childTypes = (el: React.ReactElement<{ children: React.ReactElement[] }>): unknown[] =>
  liveChildren(el).map((c) => c.type);

describe('CanvasContent', () => {
  it('wraps children in a <g> with the pan/zoom transform string', () => {
    const el = renderResult(baseProps);
    expect(el.type).toBe('g');
    expect(el.props.transform).toBe('translate(5, 7) scale(2)');
  });

  it('renders the documented child sequence in order — when no preview is active (connections ABOVE nodes per user feedback)', () => {
    const el = renderResult(baseProps);
    expect(childTypes(el)).toEqual([
      mocks.CanvasGrid,
      mocks.SelectionFrame,
      mocks.ParentClipDefs,
      mocks.NodesLayer,
      mocks.ConnectionLayer, // background mode — now ABOVE nodes
      mocks.UserTrafficOverlay,
      mocks.ConnectionLayer, // highlighted mode
      mocks.GhostOverlay,
    ]);
  });

  it('inserts the connection-drawing preview between background-connections and user-traffic when drawingConnection is set', () => {
    const el = renderResult({
      ...baseProps,
      drawingConnection: {
        sourceId: 'n1',
        sourcePoint: { x: 0, y: 0 },
        currentPoint: { x: 10, y: 10 },
      },
    });
    expect(childTypes(el)).toEqual([
      mocks.CanvasGrid,
      mocks.SelectionFrame,
      mocks.ParentClipDefs,
      mocks.NodesLayer,
      mocks.ConnectionLayer,
      mocks.ConnectionPreviewOverlay,
      mocks.UserTrafficOverlay,
      mocks.ConnectionLayer,
      mocks.GhostOverlay,
    ]);
  });

  it('passes background mode to the first ConnectionLayer and highlighted to the second', () => {
    const el = renderResult(baseProps);
    const conns = liveChildren(el).filter((c) => c.type === mocks.ConnectionLayer);
    expect(conns).toHaveLength(2);
    expect((conns[0].props as { mode: string }).mode).toBe('background');
    expect((conns[1].props as { mode: string }).mode).toBe('highlighted');
  });

  it('threads viewport.zoom into the CanvasGrid viewState.scale and dims into width/height', () => {
    const el = renderResult({
      ...baseProps,
      viewport: { x: 100, y: 200, zoom: 3 },
      dimensions: { width: 1024, height: 768 },
    });
    const grid = liveChildren(el).find((c) => c.type === mocks.CanvasGrid);
    expect(grid).toBeDefined();
    const gridProps = grid!.props as {
      width: number;
      height: number;
      viewState: { scale: number; panX: number; panY: number };
    };
    expect(gridProps.width).toBe(1024);
    expect(gridProps.height).toBe(768);
    expect(gridProps.viewState.scale).toBe(3);
    expect(gridProps.viewState.panX).toBe(100);
    expect(gridProps.viewState.panY).toBe(200);
  });

  it('threads showVirtualUserNode into UserTrafficOverlay.show', () => {
    const el = renderResult({ ...baseProps, showVirtualUserNode: false });
    const overlay = liveChildren(el).find((c) => c.type === mocks.UserTrafficOverlay);
    expect(overlay).toBeDefined();
    expect((overlay!.props as { show: boolean }).show).toBe(false);
  });

  it('threads ghosts and node-list to GhostOverlay (count + identity)', () => {
    const ghosts = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }] as never;
    const el = renderResult({ ...baseProps, ghosts });
    const overlay = liveChildren(el).find((c) => c.type === mocks.GhostOverlay);
    expect(overlay).toBeDefined();
    expect((overlay!.props as { ghosts: unknown[] }).ghosts).toBe(ghosts);
  });

  it('forwards sortedNodes to ParentClipDefs and NodesLayer (same array identity)', () => {
    const sortedNodes = [{ id: 'a' }, { id: 'b' }] as never;
    const el = renderResult({ ...baseProps, sortedNodes });
    const clipDefs = liveChildren(el).find((c) => c.type === mocks.ParentClipDefs);
    const nodes = liveChildren(el).find((c) => c.type === mocks.NodesLayer);
    expect((clipDefs!.props as { nodes: unknown }).nodes).toBe(sortedNodes);
    expect((nodes!.props as { sortedNodes: unknown }).sortedNodes).toBe(sortedNodes);
  });

  it('forwards canvasConnections / selectedNodes verbatim to both ConnectionLayer instances', () => {
    const canvasConnections = [{ id: 'e1' }] as never;
    const selectedNodes = ['n1', 'n2'];
    const el = renderResult({ ...baseProps, canvasConnections, selectedNodes });
    const conns = liveChildren(el).filter((c) => c.type === mocks.ConnectionLayer);
    expect(conns).toHaveLength(2);
    for (const c of conns) {
      const p = c.props as { canvasConnections: unknown; selectedNodes: unknown };
      expect(p.canvasConnections).toBe(canvasConnections);
      expect(p.selectedNodes).toBe(selectedNodes);
    }
  });

  it('hides the ConnectionPreviewOverlay when drawingConnection is null', () => {
    const el = renderResult(baseProps);
    expect(liveChildren(el).find((c) => c.type === mocks.ConnectionPreviewOverlay)).toBeUndefined();
  });
});
