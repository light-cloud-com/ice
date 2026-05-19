/**
 * rf-canv-15 — `UserTrafficOverlay` subcomponent.
 *
 * `UserTrafficOverlay` is a presentational FC: it returns a `<>` fragment
 * whose children are conditionally one or both of: a `<g class="user-traffic-
 * connections-layer">` wrapping `<SvgConnectionPath>` instances, and a
 * `<SvgUserNode>` icon. No Redux, no hooks. We use the direct-FC tree-walker
 * pattern (cite `tree-walker-for-react-fc-tests-must-flatten-nested-children-
 * arrays`): invoke the component as a function, then walk the returned
 * React-element tree depth-first and assert on type / props / children.
 *
 * Per the unit's "two render gates" constraint, the connections-layer gate
 * (`show && userConnections.length > 0`) and the icon gate (`show &&
 * pinnedUserPos`) are pinned independently — empty connections + a pinned
 * position renders just the icon, and vice-versa. A dedicated test exercises
 * each of the four gate combinations so a future refactor can't silently
 * collapse them into a single `(pinnedUserPos || userConnections.length > 0)`
 * disjunction.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import type { CanvasNode, CanvasConnection } from '../types';

// ─── Mock the leaf renderers so we can assert on props by reference ──────────
// Cite `vi-hoisted-required-for-shared-mock-identities-across-many-vi-mock-calls`:
// hoist the mock function references so the `vi.mock` factories close over
// stable identities and post-import top-level aliases can compare with `===`.

const mocks = vi.hoisted(() => ({
  SvgUserNode: (() => null) as React.FC<Record<string, unknown>>,
  SvgConnectionPath: (() => null) as React.FC<Record<string, unknown>>,
}));
vi.mock('../../../../shared/components/svg-user-node', () => ({
  SvgUserNode: mocks.SvgUserNode,
  // The real module also exports USER_NODE_WIDTH/HEIGHT/ID constants; the
  // overlay does not consume them, so the mock omits them intentionally.
}));
vi.mock('../svg-connection-path', () => ({
  SvgConnectionPath: mocks.SvgConnectionPath,
  // EDGE_COLORS, ConnectionTooltipInfo are re-exported in the real module but
  // the overlay does not consume them; the mock omits them intentionally.
}));

const MockSvgUserNode = mocks.SvgUserNode;
const MockSvgConnectionPath = mocks.SvgConnectionPath;

// Import AFTER vi.mock so the mocked modules are bound.
import { UserTrafficOverlay, type UserTrafficOverlayProps } from '../user-traffic-overlay';

// ─── Tree-walker (same shape as rf-canv-10/11/12/13/14) ──────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
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

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
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
  id: 'svc-1',
  type: 'block',
  x: 100,
  y: 100,
  width: 120,
  height: 60,
  label: 'Service',
  data: {},
  ...overrides,
});

const makeConn = (overrides: Partial<CanvasConnection> = {}): CanvasConnection => ({
  id: 'user->svc-1',
  from: '__user_traffic__',
  to: 'svc-1',
  ...overrides,
});

const baseProps = (overrides: Partial<UserTrafficOverlayProps> = {}): UserTrafficOverlayProps => ({
  show: true,
  userConnections: [],
  nodesWithUserNode: [],
  pinnedUserPos: null,
  zoom: 1,
  setUserNodePos: () => {},
  edgeStyle: 'bezier',
  ...overrides,
});

const render = (overrides: Partial<UserTrafficOverlayProps> = {}) => UserTrafficOverlay(baseProps(overrides));

// ═══════════════════════════════════════════════════════════════════════════
// Gate matrix — both gates pinned independently
// ═══════════════════════════════════════════════════════════════════════════

describe('UserTrafficOverlay — render gates', () => {
  it('show=false → renders neither the connections layer nor the icon', () => {
    const tree = render({
      show: false,
      userConnections: [makeConn()],
      pinnedUserPos: { x: 50, y: 50 },
    });
    expect(findByPredicate(tree, (el) => el.type === 'g').length).toBe(0);
    expect(findByType(tree, MockSvgUserNode)).toHaveLength(0);
    expect(findByType(tree, MockSvgConnectionPath)).toHaveLength(0);
  });

  it('show=true, no connections, no pinnedUserPos → renders nothing', () => {
    const tree = render({ show: true, userConnections: [], pinnedUserPos: null });
    expect(
      findByPredicate(
        tree,
        (el) => el.type === 'g' && (el.props as { className?: string }).className === 'user-traffic-connections-layer',
      ).length,
    ).toBe(0);
    expect(findByType(tree, MockSvgUserNode)).toHaveLength(0);
    expect(findByType(tree, MockSvgConnectionPath)).toHaveLength(0);
  });

  it('show=true, has connections, no pinnedUserPos → renders the connections layer ONLY', () => {
    const tree = render({
      show: true,
      userConnections: [makeConn()],
      nodesWithUserNode: [makeNode()],
      pinnedUserPos: null,
    });
    const layer = findByPredicate(
      tree,
      (el) => el.type === 'g' && (el.props as { className?: string }).className === 'user-traffic-connections-layer',
    );
    expect(layer).toHaveLength(1);
    expect(findByType(tree, MockSvgConnectionPath)).toHaveLength(1);
    expect(findByType(tree, MockSvgUserNode)).toHaveLength(0);
  });

  it('show=true, no connections, pinnedUserPos set → renders the icon ONLY', () => {
    const tree = render({
      show: true,
      userConnections: [],
      pinnedUserPos: { x: 50, y: 50 },
    });
    expect(
      findByPredicate(
        tree,
        (el) => el.type === 'g' && (el.props as { className?: string }).className === 'user-traffic-connections-layer',
      ).length,
    ).toBe(0);
    expect(findByType(tree, MockSvgConnectionPath)).toHaveLength(0);
    expect(findByType(tree, MockSvgUserNode)).toHaveLength(1);
  });

  it('show=true, both populated → renders both', () => {
    const tree = render({
      show: true,
      userConnections: [makeConn(), makeConn({ id: 'user->svc-2', to: 'svc-2' })],
      nodesWithUserNode: [makeNode(), makeNode({ id: 'svc-2' })],
      pinnedUserPos: { x: 50, y: 50 },
    });
    expect(findByType(tree, MockSvgConnectionPath)).toHaveLength(2);
    expect(findByType(tree, MockSvgUserNode)).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Connections layer wrapper
// ═══════════════════════════════════════════════════════════════════════════

describe('UserTrafficOverlay — connections layer wrapper', () => {
  it('wraps each <SvgConnectionPath> inside <g className="user-traffic-connections-layer">', () => {
    const tree = render({
      show: true,
      userConnections: [makeConn()],
      nodesWithUserNode: [makeNode()],
    });
    const layers = findByPredicate(
      tree,
      (el) => el.type === 'g' && (el.props as { className?: string }).className === 'user-traffic-connections-layer',
    );
    expect(layers).toHaveLength(1);
    // The path must be a descendant of the wrapping g — confirm by walking
    // the layer's children and finding the mock path inside it.
    const wrapperChildren = (layers[0].props as { children?: React.ReactNode }).children;
    const inner: React.ReactElement[] = [];
    for (const el of walk(wrapperChildren)) inner.push(el);
    const paths = inner.filter((el) => el.type === MockSvgConnectionPath);
    expect(paths).toHaveLength(1);
  });

  it('renders one <SvgConnectionPath> per connection in the input array', () => {
    const tree = render({
      show: true,
      userConnections: [makeConn({ id: 'a' }), makeConn({ id: 'b' }), makeConn({ id: 'c' })],
      nodesWithUserNode: [makeNode()],
    });
    expect(findByType(tree, MockSvgConnectionPath)).toHaveLength(3);
  });

  it('keys each <SvgConnectionPath> by conn.id', () => {
    const tree = render({
      show: true,
      userConnections: [makeConn({ id: 'k-1' }), makeConn({ id: 'k-2' })],
      nodesWithUserNode: [makeNode()],
    });
    const paths = findByType(tree, MockSvgConnectionPath);
    expect(paths.map((el) => el.key)).toEqual(['k-1', 'k-2']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SvgConnectionPath prop forwarding — verbatim per the user-traffic style
// ═══════════════════════════════════════════════════════════════════════════

describe('UserTrafficOverlay — <SvgConnectionPath> prop forwarding', () => {
  it('threads the connection through `connection` verbatim', () => {
    const conn = makeConn({ id: 'c-1', from: 'u', to: 'svc-1' });
    const tree = render({
      show: true,
      userConnections: [conn],
      nodesWithUserNode: [makeNode()],
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    expect((path.props as { connection: CanvasConnection }).connection).toBe(conn);
  });

  it('passes nodesWithUserNode as BOTH `nodes` and `allNodes` (same reference)', () => {
    const nodes = [makeNode(), makeNode({ id: 'svc-2' })];
    const tree = render({
      show: true,
      userConnections: [makeConn()],
      nodesWithUserNode: nodes,
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    const props = path.props as { nodes: CanvasNode[]; allNodes: CanvasNode[] };
    expect(props.nodes).toBe(nodes);
    expect(props.allNodes).toBe(nodes);
  });

  it('pins the verbatim leaf flags: isSelected=false, isHighlighted=false, direction="outgoing"', () => {
    const tree = render({
      show: true,
      userConnections: [makeConn()],
      nodesWithUserNode: [makeNode()],
    });
    const path = findByType(tree, MockSvgConnectionPath)[0];
    const props = path.props as {
      isSelected: boolean;
      isHighlighted: boolean;
      direction: 'outgoing' | 'incoming';
    };
    expect(props.isSelected).toBe(false);
    expect(props.isHighlighted).toBe(false);
    expect(props.direction).toBe('outgoing');
  });

  it('pins the single-port shape: sourcePortIndex=0, sourcePortCount=1, targetPortIndex=0, targetPortCount=1', () => {
    const tree = render({
      show: true,
      userConnections: [makeConn()],
      nodesWithUserNode: [makeNode()],
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

  it('threads edgeStyle through to every connection path verbatim', () => {
    const tree = render({
      show: true,
      userConnections: [makeConn({ id: 'a' }), makeConn({ id: 'b' })],
      nodesWithUserNode: [makeNode()],
      edgeStyle: 'rectangular',
    });
    const paths = findByType(tree, MockSvgConnectionPath);
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      expect((path.props as { edgeStyle: string }).edgeStyle).toBe('rectangular');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SvgUserNode prop forwarding
// ═══════════════════════════════════════════════════════════════════════════

describe('UserTrafficOverlay — <SvgUserNode> prop forwarding', () => {
  it('passes pinnedUserPos as `position`', () => {
    const pos = { x: 123, y: 456 };
    const tree = render({ show: true, pinnedUserPos: pos });
    const icon = findByType(tree, MockSvgUserNode)[0];
    expect((icon.props as { position: { x: number; y: number } }).position).toBe(pos);
  });

  it('passes zoom as `scale`', () => {
    const tree = render({ show: true, pinnedUserPos: { x: 0, y: 0 }, zoom: 2.5 });
    const icon = findByType(tree, MockSvgUserNode)[0];
    expect((icon.props as { scale: number }).scale).toBe(2.5);
  });

  it('passes setUserNodePos as `onPositionChange` (same callback reference)', () => {
    const setUserNodePos = vi.fn();
    const tree = render({
      show: true,
      pinnedUserPos: { x: 0, y: 0 },
      setUserNodePos,
    });
    const icon = findByType(tree, MockSvgUserNode)[0];
    const props = icon.props as { onPositionChange: (pos: { x: number; y: number }) => void };
    expect(props.onPositionChange).toBe(setUserNodePos);
  });
});
