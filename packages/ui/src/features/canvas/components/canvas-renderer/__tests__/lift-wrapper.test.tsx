/**
 * rf-canv-10 — `NodeLiftWrapper` subcomponent.
 *
 * `NodeLiftWrapper` is a presentational wrapper with no Redux, no hooks
 * beyond an FC body that returns React elements. So we use the direct-FC
 * tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, then walk the returned React-element
 * tree depth-first to find leaves and assert on type / key / props /
 * children.
 *
 * The three React keys that the body emits — `anim-${id}`, bare `${id}`,
 * `clipped-${id}` — are load-bearing for orchestrator-level reconciliation
 * (rf-canv-1, rf-canv-9). These tests pin every branch's key string so a
 * future refactor can't silently drift them.
 */

import React, { type CSSProperties } from 'react';
import { describe, it, expect } from 'vitest';
import { NodeLiftWrapper, type NodeLiftWrapperProps } from '../lift-wrapper';
import type { CanvasNode } from '../../types';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12/13/14, rf-canv brief) ──

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

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'node-1',
  type: 'block',
  x: 100,
  y: 200,
  width: 80,
  height: 40,
  label: 'My Node',
  data: {},
  parentId: undefined,
  ...overrides,
});

const ChildSentinel: React.FC = () => null;
ChildSentinel.displayName = 'ChildSentinel';

const renderWrapper = (overrides: Partial<NodeLiftWrapperProps> = {}) => {
  const props: NodeLiftWrapperProps = {
    node: overrides.node ?? makeNode(),
    isAnimating: overrides.isAnimating ?? false,
    animStyle: overrides.animStyle,
    isLifted: overrides.isLifted ?? false,
    dragOverGroupId: overrides.dragOverGroupId ?? null,
    children: overrides.children ?? <ChildSentinel />,
  };
  // Direct-FC invocation — returns the React element tree without rendering.
  return NodeLiftWrapper(props);
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('NodeLiftWrapper — default state (no animating, no lifted, no parentId)', () => {
  it('renders children directly with no wrapping <g>', () => {
    const tree = renderWrapper();
    // No top-level <g> introduced. The sentinel child is the outermost.
    const gs = findByPredicate(tree, (el) => el.type === 'g');
    expect(gs).toHaveLength(0);
    const sentinels = findByType(tree, ChildSentinel);
    expect(sentinels).toHaveLength(1);
  });
});

describe('NodeLiftWrapper — animating only', () => {
  const animStyle: CSSProperties = {
    animation: 'ice-node-entrance 0.4s cubic-bezier(0.16, 1, 0.3, 1) 100ms both',
    transformOrigin: '140px 220px',
  };

  it('wraps children in <g key="anim-${node.id}" style={animStyle}>', () => {
    const tree = renderWrapper({ isAnimating: true, animStyle });
    const gs = findByPredicate(tree, (el) => el.type === 'g');
    // Single <g> wrapping the child.
    expect(gs).toHaveLength(1);
    const g = gs[0];
    expect(g.key).toBe('anim-node-1');
    expect((g.props as { style?: CSSProperties }).style).toEqual(animStyle);
    // Sentinel child still in the tree, nested inside the <g>.
    const sentinels = findByType(g, ChildSentinel);
    expect(sentinels).toHaveLength(1);
  });

  it('emits no <rect> highlight or shift-drag-shadow filter', () => {
    const tree = renderWrapper({ isAnimating: true, animStyle });
    expect(findByPredicate(tree, (el) => el.type === 'rect')).toHaveLength(0);
    const gs = findByPredicate(tree, (el) => el.type === 'g');
    expect(gs.every((g) => (g.props as { filter?: string }).filter == null)).toBe(true);
  });
});

describe('NodeLiftWrapper — lifted only', () => {
  it('wraps in <g key={node.id} filter="url(#shift-drag-shadow)" opacity={0.9}> when dragOverGroupId is set (green)', () => {
    const tree = renderWrapper({
      isLifted: true,
      dragOverGroupId: 'group-X',
    });
    const gs = findByPredicate(tree, (el) => el.type === 'g');
    expect(gs).toHaveLength(1);
    const g = gs[0];
    expect(g.key).toBe('node-1');
    expect((g.props as { filter?: string; opacity?: number }).filter).toBe(
      'url(#shift-drag-shadow)',
    );
    expect((g.props as { opacity?: number }).opacity).toBe(0.9);

    const rects = findByPredicate(g, (el) => el.type === 'rect');
    expect(rects).toHaveLength(1);
    expect((rects[0].props as { stroke?: string }).stroke).toBe('#22c55e');
  });

  it('renders orange highlight rect when dragOverGroupId is null (leaving)', () => {
    const tree = renderWrapper({
      isLifted: true,
      dragOverGroupId: null,
    });
    const rects = findByPredicate(tree, (el) => el.type === 'rect');
    expect(rects).toHaveLength(1);
    expect((rects[0].props as { stroke?: string }).stroke).toBe('#f97316');
  });

  it('renders highlight rect with the right offsets, fill, dash, opacity', () => {
    const node = makeNode({ x: 50, y: 60, width: 200, height: 100 });
    const tree = renderWrapper({
      node,
      isLifted: true,
      dragOverGroupId: 'group-X',
    });
    const rects = findByPredicate(tree, (el) => el.type === 'rect');
    expect(rects).toHaveLength(1);
    const rect = rects[0];
    const rectProps = rect.props as {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      rx?: number;
      fill?: string;
      strokeWidth?: number;
      strokeDasharray?: string;
      opacity?: number;
    };
    // x - 2, y - 2, width + 4, height + 4 — preserved verbatim from L2293–2348.
    expect(rectProps.x).toBe(48);
    expect(rectProps.y).toBe(58);
    expect(rectProps.width).toBe(204);
    expect(rectProps.height).toBe(104);
    expect(rectProps.rx).toBe(8);
    expect(rectProps.fill).toBe('none');
    expect(rectProps.strokeWidth).toBe(2);
    expect(rectProps.strokeDasharray).toBe('6 3');
    expect(rectProps.opacity).toBe(0.8);
  });

  it('renders the inner <animate> stroke-dashoffset child of the rect with the right attrs', () => {
    const tree = renderWrapper({
      isLifted: true,
      dragOverGroupId: 'group-X',
    });
    const animates = findByPredicate(tree, (el) => el.type === 'animate');
    expect(animates).toHaveLength(1);
    const animate = animates[0];
    const animateProps = animate.props as {
      attributeName?: string;
      from?: string;
      to?: string;
      dur?: string;
      repeatCount?: string;
    };
    expect(animateProps.attributeName).toBe('stroke-dashoffset');
    expect(animateProps.from).toBe('0');
    expect(animateProps.to).toBe('-18');
    expect(animateProps.dur).toBe('0.8s');
    expect(animateProps.repeatCount).toBe('indefinite');
  });

  it('lifted overrides parent-clip — when both isLifted=true and parentId set, the lift wrapper wins (no <g clipPath=...>)', () => {
    const node = makeNode({ parentId: 'parent-A' });
    const tree = renderWrapper({
      node,
      isLifted: true,
      dragOverGroupId: 'group-X',
    });
    // No clip-path g — only the lift g.
    const clipGs = findByPredicate(
      tree,
      (el) => el.type === 'g' && typeof (el.props as { clipPath?: string }).clipPath === 'string',
    );
    expect(clipGs).toHaveLength(0);
    // The lift g is present.
    const liftGs = findByPredicate(
      tree,
      (el) => el.type === 'g' && (el.props as { filter?: string }).filter === 'url(#shift-drag-shadow)',
    );
    expect(liftGs).toHaveLength(1);
    expect(liftGs[0].key).toBe('node-1');
  });
});

describe('NodeLiftWrapper — parent-clipped only', () => {
  it('wraps in <g key="clipped-${id}" clipPath="url(#parent-clip-${parentId})">', () => {
    const node = makeNode({ parentId: 'parent-A' });
    const tree = renderWrapper({ node });
    const gs = findByPredicate(tree, (el) => el.type === 'g');
    expect(gs).toHaveLength(1);
    const g = gs[0];
    expect(g.key).toBe('clipped-node-1');
    expect((g.props as { clipPath?: string }).clipPath).toBe('url(#parent-clip-parent-A)');

    // Sentinel child still in tree, no rect.
    expect(findByType(g, ChildSentinel)).toHaveLength(1);
    expect(findByPredicate(tree, (el) => el.type === 'rect')).toHaveLength(0);
  });
});

describe('NodeLiftWrapper — combined branches', () => {
  const animStyle: CSSProperties = {
    animation: 'ice-node-entrance 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0ms both',
    transformOrigin: '140px 220px',
  };

  it('animating + lifted — animation <g key="anim-${id}"> nested inside the lift <g key={id}>', () => {
    const tree = renderWrapper({
      isAnimating: true,
      animStyle,
      isLifted: true,
      dragOverGroupId: 'group-X',
    });
    // Outer wrapper g: the lift g.
    const liftGs = findByPredicate(
      tree,
      (el) => el.type === 'g' && (el.props as { filter?: string }).filter === 'url(#shift-drag-shadow)',
    );
    expect(liftGs).toHaveLength(1);
    const liftG = liftGs[0];
    expect(liftG.key).toBe('node-1');

    // Animation g is nested inside the lift g (as the first child sibling of <rect>).
    const animGs = findByPredicate(
      liftG,
      (el) => el.type === 'g' && (el.props as { style?: CSSProperties }).style?.animation != null,
    );
    expect(animGs).toHaveLength(1);
    expect(animGs[0].key).toBe('anim-node-1');

    // The sentinel child is reachable through the animation g.
    expect(findByType(animGs[0], ChildSentinel)).toHaveLength(1);
  });

  it('animating + parent-clipped — animation <g> nested inside the clip <g>', () => {
    const node = makeNode({ parentId: 'parent-A' });
    const tree = renderWrapper({
      node,
      isAnimating: true,
      animStyle,
    });
    // Outer wrapper g: the clip g.
    const clipGs = findByPredicate(
      tree,
      (el) => el.type === 'g' && typeof (el.props as { clipPath?: string }).clipPath === 'string',
    );
    expect(clipGs).toHaveLength(1);
    const clipG = clipGs[0];
    expect(clipG.key).toBe('clipped-node-1');
    expect((clipG.props as { clipPath?: string }).clipPath).toBe('url(#parent-clip-parent-A)');

    // Animation g nested inside the clip g.
    const animGs = findByPredicate(
      clipG,
      (el) => el.type === 'g' && (el.props as { style?: CSSProperties }).style?.animation != null,
    );
    expect(animGs).toHaveLength(1);
    expect(animGs[0].key).toBe('anim-node-1');
  });

  it('animating-only with no lift and no parentId — children wrapped only by the animation <g>', () => {
    const tree = renderWrapper({ isAnimating: true, animStyle });
    const gs = findByPredicate(tree, (el) => el.type === 'g');
    expect(gs).toHaveLength(1);
    expect(gs[0].key).toBe('anim-node-1');
  });
});
