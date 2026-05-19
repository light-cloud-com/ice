/**
 * rf-canv-13 — `ConnectionLayer` subcomponent.
 *
 * `ConnectionLayer` is a presentational FC: it returns a `<g>` whose children
 * are `<SvgConnectionPath>` instances (the inner leaf renderer) optionally
 * wrapped in a per-conn animation `<g>`. No Redux, no hooks. We use the
 * direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, then walk the returned React-element
 * tree depth-first and assert on type / key / props / children.
 *
 * Two modes (`background`, `highlighted`) are pinned independently — each
 * has its own gate (`!isHighlighted` vs `isHighlighted`), its own conditional
 * animation wrap (background only), its own pipeline-edge derivation
 * (background only), and its own direction prop (highlighted only).
 *
 * Per blueprint risk #4, the inner-vs-outer key shape — outer wrap key
 * `anim-edge-${conn.id}`, inner `<SvgConnectionPath>` key `${conn.id}` —
 * MUST be preserved verbatim. A dedicated test pins the two key strings
 * so a future refactor can't silently drift them and re-mount the leaf
 * (which has internal hover state).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import { ConnectionLayer, type ConnectionLayerProps } from '../connection-layer';
import type { CanvasNode, CanvasConnection } from '../types';

// ─── Mock the leaf renderer so we can assert on props by reference ───────────

const mocks = vi.hoisted(() => ({
  SvgConnectionPath: (() => null) as React.FC<Record<string, unknown>>,
}));
vi.mock('../svg-connection-path', () => ({
  SvgConnectionPath: mocks.SvgConnectionPath,
  // EDGE_COLORS, ConnectionTooltipInfo are re-exported in the real module but
  // ConnectionLayer doesn't consume them; the mock omits them intentionally.
}));

const MockSvgConnectionPath = mocks.SvgConnectionPath;

// ─── Tree-walker (same shape as rf-canv-10/11/12) ────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'n1',
  type: 'block',
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  label: 'Node',
  data: {},
  ...overrides,
});

const makeConn = (overrides: Partial<CanvasConnection> = {}): CanvasConnection => ({
  id: 'c1',
  from: 'n1',
  to: 'n2',
  ...overrides,
});

const baseProps = (overrides: Partial<ConnectionLayerProps> = {}): ConnectionLayerProps => ({
  mode: 'background',
  canvasConnections: [],
  effectiveNodes: [],
  portMap: new Map(),
  animatingEdges: {},
  pipelineNodeStatus: {},
  selectedNodes: [],
  selectedEdges: [],
  hoveredNodeId: null,
  lod: 3,
  viewport: { zoom: 1 },
  edgeStyle: 'bezier',
  handleConnectionHover: () => {},
  handleEdgeDelete: () => {},
  handleEdgeSelect: () => {},
  handleContextMenu: () => {},
  ...overrides,
});

const render = (overrides: Partial<ConnectionLayerProps> = {}) =>
  ConnectionLayer(baseProps(overrides));

// ═══════════════════════════════════════════════════════════════════════════
// Mode: background
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionLayer — mode="background" — gate', () => {
  it('renders the outer <g className="connections-layer">', () => {
    const tree = render({ mode: 'background' });
    const wrappers = findByPredicate(
      tree,
      (el) => el.type === 'g' && (el.props as { className?: string }).className === 'connections-layer',
    );
    expect(wrappers).toHaveLength(1);
  });

  it('renders only non-highlighted connections (skips highlighted)', () => {
    const conns: CanvasConnection[] = [
      makeConn({ id: 'c1', from: 'n1', to: 'n2' }), // not highlighted
      makeConn({ id: 'c2', from: 'hovered', to: 'n3' }), // highlighted via hover
      makeConn({ id: 'c3', from: 'n4', to: 'selected' }), // highlighted via selection
      makeConn({ id: 'c4', from: 'n5', to: 'n6' }), // not highlighted
    ];
    const tree = render({
      mode: 'background',
      canvasConnections: conns,
      hoveredNodeId: 'hovered',
      selectedNodes: ['selected'],
    });
    const paths = findByType(tree, MockSvgConnectionPath);
    const ids = paths.map((p) => (p.props as { connection: CanvasConnection }).connection.id).sort();
    expect(ids).toEqual(['c1', 'c4']);
  });

  it('returns null for every connection when all are highlighted', () => {
    const conns: CanvasConnection[] = [
      makeConn({ id: 'c1', from: 'h', to: 'n2' }),
      makeConn({ id: 'c2', from: 'n3', to: 'h' }),
    ];
    const tree = render({
      mode: 'background',
      canvasConnections: conns,
      hoveredNodeId: 'h',
    });
    const paths = findByType(tree, MockSvgConnectionPath);
    expect(paths).toHaveLength(0);
  });

  it('selectedNodes-only highlight still gates the background layer', () => {
    const conns: CanvasConnection[] = [
      makeConn({ id: 'c1', from: 'sel', to: 'n2' }), // highlighted via selectedNodes
      makeConn({ id: 'c2', from: 'n3', to: 'n4' }), // not highlighted
    ];
    const tree = render({
      mode: 'background',
      canvasConnections: conns,
      hoveredNodeId: null,
      selectedNodes: ['sel'],
    });
    const paths = findByType(tree, MockSvgConnectionPath);
    const ids = paths.map((p) => (p.props as { connection: CanvasConnection }).connection.id);
    expect(ids).toEqual(['c2']);
  });
});

describe('ConnectionLayer — mode="background" — animation wrap', () => {
  it('wraps animating connections in <g key="anim-edge-${id}" style={animStyle}>', () => {
    const conn = makeConn({ id: 'c1' });
    const tree = render({
      mode: 'background',
      canvasConnections: [conn],
      animatingEdges: { c1: 200 },
    });
    // Find the animation wrap — a <g> whose key is the wrap key.
    const wraps = findByPredicate(
      tree,
      (el) => el.type === 'g' && el.key === 'anim-edge-c1',
    );
    expect(wraps).toHaveLength(1);
    const style = (wraps[0].props as { style?: { animation?: string } }).style;
    expect(style?.animation).toBe(
      'ice-edge-entrance 0.5s cubic-bezier(0.16, 1, 0.3, 1) 200ms both',
    );
  });

  it('does NOT wrap connections without an animatingEdges entry', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1' })],
      animatingEdges: {},
    });
    const wraps = findByPredicate(
      tree,
      (el) => el.type === 'g' && typeof el.key === 'string' && el.key.startsWith('anim-edge-'),
    );
    expect(wraps).toHaveLength(0);
  });

  it('treats a delay of 0 as "animating" (presence in the map, not truthiness)', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1' })],
      animatingEdges: { c1: 0 },
    });
    const wraps = findByPredicate(
      tree,
      (el) => el.type === 'g' && el.key === 'anim-edge-c1',
    );
    expect(wraps).toHaveLength(1);
  });
});

describe('ConnectionLayer — mode="background" — pipeline-edge derivation', () => {
  const srcRepoNode = makeNode({ id: 'repo', data: { iceType: 'Source.Repository' } });
  const serviceNode = makeNode({ id: 'svc' });

  it('marks isPipelineEdge + edgePipelineActive when src is Source.Repository and pipeline is queued', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1', from: 'repo', to: 'svc' })],
      effectiveNodes: [srcRepoNode, serviceNode],
      pipelineNodeStatus: { svc: { status: 'queued' } },
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { pipelineActive: boolean }).pipelineActive).toBe(true);
  });

  it('marks edgePipelineActive when status is building', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1', from: 'repo', to: 'svc' })],
      effectiveNodes: [srcRepoNode, serviceNode],
      pipelineNodeStatus: { svc: { status: 'building' } },
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { pipelineActive: boolean }).pipelineActive).toBe(true);
  });

  it('marks edgePipelineActive when status is deploying', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1', from: 'repo', to: 'svc' })],
      effectiveNodes: [srcRepoNode, serviceNode],
      pipelineNodeStatus: { svc: { status: 'deploying' } },
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { pipelineActive: boolean }).pipelineActive).toBe(true);
  });

  it('does NOT mark edgePipelineActive when status is success', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1', from: 'repo', to: 'svc' })],
      effectiveNodes: [srcRepoNode, serviceNode],
      pipelineNodeStatus: { svc: { status: 'success' } },
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { pipelineActive: boolean }).pipelineActive).toBe(false);
  });

  it('does NOT mark edgePipelineActive when status is idle', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1', from: 'repo', to: 'svc' })],
      effectiveNodes: [srcRepoNode, serviceNode],
      pipelineNodeStatus: { svc: { status: 'idle' } },
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { pipelineActive: boolean }).pipelineActive).toBe(false);
  });

  it('falls back to behavior==="source" when iceType is missing', () => {
    const repoByBehavior = makeNode({ id: 'repo', data: { behavior: 'source' } });
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1', from: 'repo', to: 'svc' })],
      effectiveNodes: [repoByBehavior, serviceNode],
      pipelineNodeStatus: { svc: { status: 'building' } },
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { pipelineActive: boolean }).pipelineActive).toBe(true);
  });

  it('treats the target as the pipeline node when only tgt is Source.Repository', () => {
    // Symmetric case — the service node is `conn.from`, the repo is `conn.to`.
    const reverseConn = makeConn({ id: 'c1', from: 'svc', to: 'repo' });
    const tree = render({
      mode: 'background',
      canvasConnections: [reverseConn],
      effectiveNodes: [srcRepoNode, serviceNode],
      pipelineNodeStatus: { svc: { status: 'deploying' } },
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { pipelineActive: boolean }).pipelineActive).toBe(true);
  });

  it('does NOT mark edgePipelineActive when neither end is a Source.Repository', () => {
    const a = makeNode({ id: 'a' });
    const b = makeNode({ id: 'b' });
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1', from: 'a', to: 'b' })],
      effectiveNodes: [a, b],
      pipelineNodeStatus: { a: { status: 'building' } }, // unrelated
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { pipelineActive: boolean }).pipelineActive).toBe(false);
  });
});

describe('ConnectionLayer — mode="background" — port plumbing', () => {
  it('passes the right portIndex/portCount from portMap', () => {
    const portMap = new Map([
      ['c1:source', { index: 2, count: 4 }],
      ['c1:target', { index: 1, count: 3 }],
    ]);
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1' })],
      portMap,
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    const props = path.props as {
      sourcePortIndex: number;
      sourcePortCount: number;
      targetPortIndex: number;
      targetPortCount: number;
    };
    expect(props.sourcePortIndex).toBe(2);
    expect(props.sourcePortCount).toBe(4);
    expect(props.targetPortIndex).toBe(1);
    expect(props.targetPortCount).toBe(3);
  });

  it('defaults to index 0 / count 1 when portMap entries are missing', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1' })],
      portMap: new Map(),
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    const props = path.props as {
      sourcePortIndex: number;
      sourcePortCount: number;
      targetPortIndex: number;
      targetPortCount: number;
    };
    expect(props.sourcePortIndex).toBe(0);
    expect(props.sourcePortCount).toBe(1);
    expect(props.targetPortIndex).toBe(0);
    expect(props.targetPortCount).toBe(1);
  });
});

describe('ConnectionLayer — mode="background" — leaf props', () => {
  it('passes isHighlighted={false} on every leaf', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1' })],
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { isHighlighted: boolean }).isHighlighted).toBe(false);
  });

  it('marks isSelected when selectedEdges includes the conn id', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1' }), makeConn({ id: 'c2' })],
      selectedEdges: ['c1'],
    });
    const paths = findByType(tree, MockSvgConnectionPath);
    const byId = Object.fromEntries(
      paths.map((p) => [
        (p.props as { connection: CanvasConnection }).connection.id,
        (p.props as { isSelected: boolean }).isSelected,
      ]),
    );
    expect(byId.c1).toBe(true);
    expect(byId.c2).toBe(false);
  });

  it('threads lod, viewport.zoom, edgeStyle to the leaf', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1' })],
      lod: 1,
      viewport: { zoom: 0.4 },
      edgeStyle: 'rectangular',
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    const props = path.props as { lod: number; zoom: number; edgeStyle: string };
    expect(props.lod).toBe(1);
    expect(props.zoom).toBe(0.4);
    expect(props.edgeStyle).toBe('rectangular');
  });

  it('rewrites the onContextMenu callback into (pos, "edge", edgeId)', () => {
    const captured: Array<[unknown, string, string]> = [];
    const handleContextMenu = vi.fn(
      (pos: { x: number; y: number }, type: 'canvas' | 'node' | 'edge', id?: string) => {
        captured.push([pos, type, id ?? '']);
      },
    );
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1' })],
      handleContextMenu,
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    const onContextMenu = (path.props as {
      onContextMenu: (id: string, pos: { x: number; y: number }) => void;
    }).onContextMenu;
    onContextMenu('c1', { x: 10, y: 20 });
    expect(handleContextMenu).toHaveBeenCalledTimes(1);
    expect(captured).toEqual([[{ x: 10, y: 20 }, 'edge', 'c1']]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mode: highlighted
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionLayer — mode="highlighted" — gate', () => {
  it('renders the outer <g className="connections-highlighted-layer">', () => {
    const tree = render({ mode: 'highlighted' });
    const wrappers = findByPredicate(
      tree,
      (el) =>
        el.type === 'g' &&
        (el.props as { className?: string }).className === 'connections-highlighted-layer',
    );
    expect(wrappers).toHaveLength(1);
  });

  it('renders only highlighted connections (skips non-highlighted)', () => {
    const conns: CanvasConnection[] = [
      makeConn({ id: 'c1', from: 'n1', to: 'n2' }), // not highlighted
      makeConn({ id: 'c2', from: 'h', to: 'n3' }), // highlighted via hover
      makeConn({ id: 'c3', from: 'n4', to: 'sel' }), // highlighted via selection
    ];
    const tree = render({
      mode: 'highlighted',
      canvasConnections: conns,
      hoveredNodeId: 'h',
      selectedNodes: ['sel'],
    });
    const paths = findByType(tree, MockSvgConnectionPath);
    const ids = paths.map((p) => (p.props as { connection: CanvasConnection }).connection.id).sort();
    expect(ids).toEqual(['c2', 'c3']);
  });

  it('returns null for every connection when none are highlighted', () => {
    const conns: CanvasConnection[] = [
      makeConn({ id: 'c1', from: 'a', to: 'b' }),
      makeConn({ id: 'c2', from: 'c', to: 'd' }),
    ];
    const tree = render({
      mode: 'highlighted',
      canvasConnections: conns,
      hoveredNodeId: null,
      selectedNodes: [],
    });
    const paths = findByType(tree, MockSvgConnectionPath);
    expect(paths).toHaveLength(0);
  });
});

describe('ConnectionLayer — mode="highlighted" — direction prop', () => {
  it('sets direction="outgoing" when conn.from === activeNodeId (hovered)', () => {
    const tree = render({
      mode: 'highlighted',
      canvasConnections: [makeConn({ id: 'c1', from: 'active', to: 'other' })],
      hoveredNodeId: 'active',
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { direction: string | null }).direction).toBe('outgoing');
  });

  it('sets direction="incoming" when conn.to === activeNodeId (hovered)', () => {
    const tree = render({
      mode: 'highlighted',
      canvasConnections: [makeConn({ id: 'c1', from: 'other', to: 'active' })],
      hoveredNodeId: 'active',
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { direction: string | null }).direction).toBe('incoming');
  });

  it('sets direction=null when the active node is on neither end', () => {
    // The connection between A↔B is highlighted via hovered=A,
    // and the OTHER conn between C↔D is highlighted only because A is selected
    // — wait: highlighting requires the conn to touch the hovered/selected node.
    // To exercise the activeNodeId-not-on-either-end branch, both endpoints
    // must be highlighted via *selectedNodes* (which highlights via inclusion
    // of either end in selectedNodes), with activeNodeId = hoveredNodeId
    // (null) → first selected. If only selectedNodes[0] is on this conn, direction
    // matches; if selectedNodes[1] is on this conn but selectedNodes[0] isn't,
    // direction stays null.
    const tree = render({
      mode: 'highlighted',
      canvasConnections: [makeConn({ id: 'c1', from: 'b', to: 'c' })],
      hoveredNodeId: null,
      selectedNodes: ['a', 'b', 'c'], // first selected = 'a' (the active node), not on this conn
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { direction: string | null }).direction).toBe(null);
  });

  it('falls back to selectedNodes[0] for activeNodeId when hoveredNodeId is null', () => {
    const tree = render({
      mode: 'highlighted',
      canvasConnections: [makeConn({ id: 'c1', from: 'sel', to: 'other' })],
      hoveredNodeId: null,
      selectedNodes: ['sel', 'other-sel'],
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { direction: string | null }).direction).toBe('outgoing');
  });

  it('prefers hoveredNodeId over selectedNodes[0] for activeNodeId', () => {
    const tree = render({
      mode: 'highlighted',
      canvasConnections: [makeConn({ id: 'c1', from: 'h', to: 'other' })],
      hoveredNodeId: 'h',
      selectedNodes: ['sel'], // would produce direction=null without the hover
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { direction: string | null }).direction).toBe('outgoing');
  });
});

describe('ConnectionLayer — mode="highlighted" — leaf props', () => {
  it('passes isHighlighted={true}', () => {
    const tree = render({
      mode: 'highlighted',
      canvasConnections: [makeConn({ id: 'c1', from: 'h', to: 'n2' })],
      hoveredNodeId: 'h',
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { isHighlighted: boolean }).isHighlighted).toBe(true);
  });

  it('does NOT pass a pipelineActive prop on the highlighted leaf', () => {
    const tree = render({
      mode: 'highlighted',
      canvasConnections: [makeConn({ id: 'c1', from: 'h', to: 'n2' })],
      hoveredNodeId: 'h',
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    // The highlighted-mode JSX doesn't set pipelineActive at all.
    expect((path.props as Record<string, unknown>).pipelineActive).toBeUndefined();
  });

  it('does NOT wrap any connection in <g key="anim-edge-${id}"> (no animation on highlighted)', () => {
    const tree = render({
      mode: 'highlighted',
      canvasConnections: [makeConn({ id: 'c1', from: 'h', to: 'n2' })],
      hoveredNodeId: 'h',
      animatingEdges: { c1: 100 }, // would trigger the wrap in background mode
    });
    const wraps = findByPredicate(
      tree,
      (el) => el.type === 'g' && typeof el.key === 'string' && el.key.startsWith('anim-edge-'),
    );
    expect(wraps).toHaveLength(0);
  });

  it('passes ports + viewport + edgeStyle through to the leaf', () => {
    const portMap = new Map([['c1:source', { index: 1, count: 2 }]]);
    const tree = render({
      mode: 'highlighted',
      canvasConnections: [makeConn({ id: 'c1', from: 'h', to: 'n2' })],
      hoveredNodeId: 'h',
      portMap,
      lod: 2,
      viewport: { zoom: 0.8 },
      edgeStyle: 'straight',
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    const props = path.props as {
      sourcePortIndex: number;
      sourcePortCount: number;
      targetPortIndex: number; // missing in portMap → 0
      targetPortCount: number; // missing in portMap → 1
      lod: number;
      zoom: number;
      edgeStyle: string;
    };
    expect(props.sourcePortIndex).toBe(1);
    expect(props.sourcePortCount).toBe(2);
    expect(props.targetPortIndex).toBe(0);
    expect(props.targetPortCount).toBe(1);
    expect(props.lod).toBe(2);
    expect(props.zoom).toBe(0.8);
    expect(props.edgeStyle).toBe('straight');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Risk #4 — key shape preservation (load-bearing for SvgConnectionPath
// internal hover state across animation toggles)
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionLayer — risk #4 key preservation', () => {
  it('outer wrap key is "anim-edge-${conn.id}" while inner SvgConnectionPath key is "${conn.id}"', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1' })],
      animatingEdges: { c1: 50 },
    });
    // Outer: <g key="anim-edge-c1">
    const wrap = findByPredicate(
      tree,
      (el) => el.type === 'g' && el.key === 'anim-edge-c1',
    )[0];
    expect(wrap).toBeDefined();
    // Inner: <SvgConnectionPath key="c1">
    const inner = findByType(wrap, MockSvgConnectionPath)[0];
    expect(inner).toBeDefined();
    expect(inner.key).toBe('c1');
    // Two distinct strings — load-bearing per blueprint.
    expect(wrap.key).not.toBe(inner.key);
  });

  it('non-animating connections still carry the inner key="${conn.id}" (no wrap)', () => {
    const tree = render({
      mode: 'background',
      canvasConnections: [makeConn({ id: 'c1' })],
    });
    const inner = findByType(tree, MockSvgConnectionPath)[0];
    expect(inner.key).toBe('c1');
  });

  it('highlighted mode renders the inner key="${conn.id}" with no outer wrap', () => {
    const tree = render({
      mode: 'highlighted',
      canvasConnections: [makeConn({ id: 'c1', from: 'h', to: 'n2' })],
      hoveredNodeId: 'h',
    });
    const inner = findByType(tree, MockSvgConnectionPath)[0];
    expect(inner.key).toBe('c1');
    // No outer wrap with the anim-edge key.
    const wraps = findByPredicate(
      tree,
      (el) => el.type === 'g' && typeof el.key === 'string' && el.key.startsWith('anim-edge-'),
    );
    expect(wraps).toHaveLength(0);
  });
});
