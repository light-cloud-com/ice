/**
 * rf-canv-11 — `ParentClipDefs` subcomponent.
 *
 * `ParentClipDefs` is a presentational FC: it returns the `<defs>` block of
 * the canvas SVG, holding the shift-drag-shadow filter and per-container
 * `<clipPath>` masks. No Redux, no hooks. We use the direct-FC tree-walker
 * pattern (cite `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, then walk the returned React-element
 * tree depth-first and assert on type / id / props / children.
 *
 * The filter id `shift-drag-shadow` and the clipPath ids `parent-clip-${id}`
 * are load-bearing — they are consumed by `lift-wrapper.tsx` (rf-canv-10)
 * via `filter="url(...)"` / `clipPath="url(...)"`. These tests pin every
 * id and attribute so a future refactor can't silently drift them.
 *
 * The container predicate is intentionally distinct from the rf-canv-2
 * `isContainerNode` util: it INCLUDES `type === 'block'` and EXCLUDES
 * `type === 'group'` / `Group.*` iceType prefix. The "Group.* is NOT
 * rendered" test below pins this divergence (cite
 * `extracted-wrapper-key-must-mirror-original-closure-outer-key-chain`
 * — same theme: predicate shape must be preserved when extracting).
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ParentClipDefs } from '../parent-clip-defs';
import type { CanvasNode } from '../../types';

// ─── Tree-walker (same shape as rf-canv-10) ──────────────────────────────────

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

const renderDefs = (nodes: CanvasNode[]) =>
  // Direct-FC invocation — returns the React element tree without rendering.
  ParentClipDefs({ nodes });

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ParentClipDefs — top-level structure', () => {
  it('renders a <defs> root containing the shift-drag-shadow <filter>', () => {
    const tree = renderDefs([]);
    const defsArr = findByType(tree, 'defs');
    expect(defsArr).toHaveLength(1);
    const filters = findByType(tree, 'filter');
    expect(filters).toHaveLength(1);
    expect((filters[0].props as { id?: string }).id).toBe('shift-drag-shadow');
  });

  it('shift-drag filter has the right x/y/width/height props', () => {
    const tree = renderDefs([]);
    const filters = findByType(tree, 'filter');
    const filterProps = filters[0].props as {
      x?: string;
      y?: string;
      width?: string;
      height?: string;
    };
    expect(filterProps.x).toBe('-20%');
    expect(filterProps.y).toBe('-20%');
    expect(filterProps.width).toBe('140%');
    expect(filterProps.height).toBe('140%');
  });

  it('filter contains a <feDropShadow> with dx/dy/stdDeviation/floodColor/floodOpacity', () => {
    const tree = renderDefs([]);
    const drops = findByType(tree, 'feDropShadow');
    expect(drops).toHaveLength(1);
    const dropProps = drops[0].props as {
      dx?: string;
      dy?: string;
      stdDeviation?: string;
      floodColor?: string;
      floodOpacity?: string;
    };
    expect(dropProps.dx).toBe('0');
    expect(dropProps.dy).toBe('4');
    expect(dropProps.stdDeviation).toBe('8');
    expect(dropProps.floodColor).toBe('#000');
    expect(dropProps.floodOpacity).toBe('0.35');
  });
});

describe('ParentClipDefs — empty nodes', () => {
  it('renders no <clipPath> children when given an empty nodes array', () => {
    const tree = renderDefs([]);
    expect(findByType(tree, 'clipPath')).toHaveLength(0);
  });
});

describe('ParentClipDefs — predicate (which node shapes get a clipPath)', () => {
  it('container nodes (type === "container") render a clipPath with id parent-clip-${id}', () => {
    const node = makeNode({ id: 'cont-A', type: 'container' });
    const tree = renderDefs([node]);
    const clips = findByType(tree, 'clipPath');
    expect(clips).toHaveLength(1);
    expect((clips[0].props as { id?: string }).id).toBe('parent-clip-cont-A');
    expect(clips[0].key).toBe('parent-clip-cont-A');
  });

  it('block nodes (type === "block") render a clipPath', () => {
    const node = makeNode({ id: 'blk-A', type: 'block' });
    const tree = renderDefs([node]);
    const clips = findByType(tree, 'clipPath');
    expect(clips).toHaveLength(1);
    expect((clips[0].props as { id?: string }).id).toBe('parent-clip-blk-A');
  });

  it('Network.VPC iceType (type !== container/block) renders a clipPath', () => {
    const node = makeNode({
      id: 'vpc-A',
      type: 'resource',
      data: { iceType: 'Network.VPC' },
    });
    const tree = renderDefs([node]);
    const clips = findByType(tree, 'clipPath');
    expect(clips).toHaveLength(1);
    expect((clips[0].props as { id?: string }).id).toBe('parent-clip-vpc-A');
  });

  it('Network.Subnet iceType renders a clipPath', () => {
    const node = makeNode({
      id: 'sn-A',
      type: 'resource',
      data: { iceType: 'Network.Subnet' },
    });
    const tree = renderDefs([node]);
    const clips = findByType(tree, 'clipPath');
    expect(clips).toHaveLength(1);
    expect((clips[0].props as { id?: string }).id).toBe('parent-clip-sn-A');
  });

  it('Network.PrivateNetwork iceType renders a clipPath', () => {
    const node = makeNode({
      id: 'pn-A',
      type: 'resource',
      data: { iceType: 'Network.PrivateNetwork' },
    });
    const tree = renderDefs([node]);
    const clips = findByType(tree, 'clipPath');
    expect(clips).toHaveLength(1);
    expect((clips[0].props as { id?: string }).id).toBe('parent-clip-pn-A');
  });

  it('plain resource nodes (no special type / iceType) do NOT render a clipPath', () => {
    const node = makeNode({
      id: 'res-A',
      type: 'resource',
      data: { iceType: 'Compute.Container' },
    });
    const tree = renderDefs([node]);
    expect(findByType(tree, 'clipPath')).toHaveLength(0);
  });

  it('Group.* iceType is NOT rendered (predicate diverges from rf-canv-2 isContainerNode)', () => {
    // Several Group.* shapes — the inline filter in svg-canvas.tsx (and
    // therefore in this component) deliberately rejects all of them. If
    // someone "tightens up" the predicate by substituting `isContainerNode`,
    // these would silently start emitting clipPaths.
    const groupNode = makeNode({
      id: 'grp-A',
      type: 'resource',
      data: { iceType: 'Group.Frontend' },
    });
    const groupTypeNode = makeNode({
      id: 'grp-B',
      type: 'group' as unknown as CanvasNode['type'],
      data: { iceType: 'Group.Backend' },
    });
    const tree = renderDefs([groupNode, groupTypeNode]);
    expect(findByType(tree, 'clipPath')).toHaveLength(0);
  });
});

describe('ParentClipDefs — clipPath inner <rect> attributes', () => {
  it('rect has the right x/y/width/height/rx props (CORNER_RADIUS = 8)', () => {
    const node = makeNode({
      id: 'cont-A',
      type: 'container',
      x: 50,
      y: 60,
      width: 400,
      height: 300,
    });
    const tree = renderDefs([node]);
    const rects = findByType(tree, 'rect');
    expect(rects).toHaveLength(1);
    const rect = rects[0];
    const rectProps = rect.props as {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      rx?: number;
    };
    expect(rectProps.x).toBe(50);
    expect(rectProps.y).toBe(60);
    expect(rectProps.width).toBe(400);
    expect(rectProps.height).toBe(300);
    expect(rectProps.rx).toBe(8); // CORNER_RADIUS — pinned constant
  });

  it('mixed-shape input — emits clipPaths only for the matching subset', () => {
    const nodes: CanvasNode[] = [
      makeNode({ id: 'a', type: 'container' }), // YES
      makeNode({ id: 'b', type: 'block' }), // YES
      makeNode({ id: 'c', type: 'resource', data: { iceType: 'Network.VPC' } }), // YES
      makeNode({ id: 'd', type: 'resource', data: { iceType: 'Network.Subnet' } }), // YES
      makeNode({ id: 'e', type: 'resource', data: { iceType: 'Network.PrivateNetwork' } }), // YES
      makeNode({ id: 'f', type: 'resource', data: { iceType: 'Compute.Container' } }), // NO
      makeNode({ id: 'g', type: 'resource', data: { iceType: 'Group.Frontend' } }), // NO
    ];
    const tree = renderDefs(nodes);
    const clips = findByType(tree, 'clipPath');
    const ids = clips.map((c) => (c.props as { id?: string }).id);
    expect(ids).toEqual(['parent-clip-a', 'parent-clip-b', 'parent-clip-c', 'parent-clip-d', 'parent-clip-e']);
  });
});
