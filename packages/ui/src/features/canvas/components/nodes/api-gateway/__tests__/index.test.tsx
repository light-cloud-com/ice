/**
 * Tests for `SvgApiGatewayNode` — a thin delegate that forwards every
 * SvgCompactNodeProps to the underlying SvgCompactNode renderer. The
 * direct-FC tree-walker pattern lets us assert the type / forwarded props
 * without rendering through jsdom.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const fc: React.FC<Record<string, unknown>> = () => null;
  fc.displayName = 'MockSvgCompactNode';
  return { SvgCompactNode: fc };
});

vi.mock('../../compact-node', () => ({
  SvgCompactNode: mocks.SvgCompactNode,
}));

import { SvgApiGatewayNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'gw-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'My Gateway',
  data: { iceType: 'Network.APIGateway' },
  ...overrides,
});

describe('SvgApiGatewayNode', () => {
  it('renders SvgCompactNode (delegation type)', () => {
    const tree = SvgApiGatewayNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.SvgCompactNode);
  });

  it('forwards every prop verbatim to SvgCompactNode', () => {
    const onToggleFold = vi.fn();
    const node = makeNode({ id: 'forwarded' });
    const tree = SvgApiGatewayNode({
      node,
      isSelected: true,
      isDragOver: true,
      lod: 2,
      onToggleFold,
    }) as React.ReactElement;
    const props = tree.props as Record<string, unknown>;
    expect(props.node).toBe(node);
    expect(props.isSelected).toBe(true);
    expect(props.isDragOver).toBe(true);
    expect(props.lod).toBe(2);
    expect(props.onToggleFold).toBe(onToggleFold);
  });

  it('carries displayName "SvgApiGatewayNode"', () => {
    expect(SvgApiGatewayNode.displayName).toBe('SvgApiGatewayNode');
  });
});
