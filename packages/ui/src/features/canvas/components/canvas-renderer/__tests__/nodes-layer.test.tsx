/**
 * rf-canv2-7 — NodesLayer component tests.
 *
 * Tree-walks the rendered element to verify the nodes-map iteration and
 * the wrapper-key priority chain (lifted → bare id, parentId →
 * clipped-id, animating → anim-id, else innerKey). renderCanvasNode is
 * mocked so we can drive the per-call innerKey deterministically.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../node-renderer-registry', () => ({
  renderCanvasNode: vi.fn((node: { id: string }) => ({
    element: React.createElement('rect', { 'data-id': node.id }),
    innerKey: `inner-${node.id}`,
  })),
  RenderCtx: undefined,
}));

vi.mock('../lift-wrapper', () => ({
  // Probe that captures the props as data attributes so we can read them.
  NodeLiftWrapper: ({
    children,
    isLifted,
    isAnimating,
    dragOverGroupId,
    node,
  }: {
    children: React.ReactNode;
    isLifted: boolean;
    isAnimating: boolean;
    dragOverGroupId: string | null;
    node: { id: string };
  }) =>
    React.createElement(
      'g',
      {
        'data-id': node.id,
        'data-lifted': String(isLifted),
        'data-animating': String(isAnimating),
        'data-dragover': dragOverGroupId ?? '',
      },
      children,
    ),
}));

import { NodesLayer } from '../nodes-layer';
import type { CanvasNode } from '../../types';
import type { RenderCtx } from '../node-renderer-registry';

const makeCanvasNode = (overrides: Partial<CanvasNode> = {}): CanvasNode =>
  ({
    id: 'n1',
    type: 'block',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    data: { iceType: 'Compute.Service' },
    parentId: null,
    ...overrides,
  }) as CanvasNode;

const blankCtx = {} as RenderCtx;

const renderResult = (props: Parameters<typeof NodesLayer>[0]) => NodesLayer(props);

describe('NodesLayer', () => {
  it('renders an empty <g.nodes-layer> when sortedNodes is empty', () => {
    const result = renderResult({
      sortedNodes: [],
      animatingNodes: {},
      shiftDraggingNodeIds: new Set(),
      dragOverGroupId: null,
      renderCtx: blankCtx,
    });
    const el = result as React.ReactElement<{ className: string; children: unknown[] }>;
    expect(el.type).toBe('g');
    expect(el.props.className).toBe('nodes-layer');
    expect(React.Children.count(el.props.children)).toBe(0);
  });

  it('emits one NodeLiftWrapper per sortedNode', () => {
    const result = renderResult({
      sortedNodes: [makeCanvasNode({ id: 'a' }), makeCanvasNode({ id: 'b' })],
      animatingNodes: {},
      shiftDraggingNodeIds: new Set(),
      dragOverGroupId: null,
      renderCtx: blankCtx,
    });
    const el = result as React.ReactElement<{ children: React.ReactElement[] }>;
    const children = el.props.children as React.ReactElement<{ node: { id: string } }>[];
    expect(children).toHaveLength(2);
    expect(children[0].props.node.id).toBe('a');
    expect(children[1].props.node.id).toBe('b');
  });

  it('marks isLifted when the node id is in shiftDraggingNodeIds', () => {
    const result = renderResult({
      sortedNodes: [makeCanvasNode({ id: 'a' })],
      animatingNodes: {},
      shiftDraggingNodeIds: new Set(['a']),
      dragOverGroupId: null,
      renderCtx: blankCtx,
    });
    const el = result as React.ReactElement<{ children: React.ReactElement[] }>;
    const children = el.props.children as React.ReactElement<{ isLifted: boolean }>[];
    expect(children[0].props.isLifted).toBe(true);
  });

  it('marks isAnimating when the node id is in animatingNodes', () => {
    const result = renderResult({
      sortedNodes: [makeCanvasNode({ id: 'a' })],
      animatingNodes: { a: 100 },
      shiftDraggingNodeIds: new Set(),
      dragOverGroupId: null,
      renderCtx: blankCtx,
    });
    const el = result as React.ReactElement<{ children: React.ReactElement[] }>;
    const children = el.props.children as React.ReactElement<{ isAnimating: boolean }>[];
    expect(children[0].props.isAnimating).toBe(true);
  });

  it('threads dragOverGroupId through to every wrapper', () => {
    const result = renderResult({
      sortedNodes: [makeCanvasNode({ id: 'a' })],
      animatingNodes: {},
      shiftDraggingNodeIds: new Set(),
      dragOverGroupId: 'group-x',
      renderCtx: blankCtx,
    });
    const el = result as React.ReactElement<{ children: React.ReactElement[] }>;
    const children = el.props.children as React.ReactElement<{ dragOverGroupId: string }>[];
    expect(children[0].props.dragOverGroupId).toBe('group-x');
  });

  it('uses bare node.id as outer key when isLifted', () => {
    const result = renderResult({
      sortedNodes: [makeCanvasNode({ id: 'a' })],
      animatingNodes: {},
      shiftDraggingNodeIds: new Set(['a']),
      dragOverGroupId: null,
      renderCtx: blankCtx,
    });
    const el = result as React.ReactElement<{ children: React.ReactElement[] }>;
    // Read keys directly off the JSX children array (not React.Children.toArray,
    // which prepends the `.$` key prefix).
    const children = el.props.children as React.ReactElement[];
    expect(children[0].key).toBe('a');
  });

  it('uses clipped-<id> as outer key when parentId is set (and not lifted)', () => {
    const result = renderResult({
      sortedNodes: [makeCanvasNode({ id: 'child', parentId: 'parent' })],
      animatingNodes: {},
      shiftDraggingNodeIds: new Set(),
      dragOverGroupId: null,
      renderCtx: blankCtx,
    });
    const el = result as React.ReactElement<{ children: React.ReactElement[] }>;
    const children = el.props.children as React.ReactElement[];
    expect(children[0].key).toBe('clipped-child');
  });

  it('uses anim-<id> as outer key when isAnimating (and not lifted, no parentId)', () => {
    const result = renderResult({
      sortedNodes: [makeCanvasNode({ id: 'a', parentId: null })],
      animatingNodes: { a: 50 },
      shiftDraggingNodeIds: new Set(),
      dragOverGroupId: null,
      renderCtx: blankCtx,
    });
    const el = result as React.ReactElement<{ children: React.ReactElement[] }>;
    const children = el.props.children as React.ReactElement[];
    expect(children[0].key).toBe('anim-a');
  });

  it('falls back to per-call innerKey when no other branch applies', () => {
    const result = renderResult({
      sortedNodes: [makeCanvasNode({ id: 'a', parentId: null })],
      animatingNodes: {},
      shiftDraggingNodeIds: new Set(),
      dragOverGroupId: null,
      renderCtx: blankCtx,
    });
    const el = result as React.ReactElement<{ children: React.ReactElement[] }>;
    const children = el.props.children as React.ReactElement[];
    // innerKey is `inner-a` from the renderCanvasNode mock.
    expect(children[0].key).toBe('inner-a');
  });
});
