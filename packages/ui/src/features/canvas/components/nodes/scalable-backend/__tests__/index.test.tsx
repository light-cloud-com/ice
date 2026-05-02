/**
 * Tests for `SvgScalableBackendNode` — thin delegate to SvgCompactNode.
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

import { SvgScalableBackendNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'sb-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'Scalable Backend',
  data: { iceType: 'Compute.ScalableBackend' },
  ...overrides,
});

describe('SvgScalableBackendNode', () => {
  it('renders SvgCompactNode', () => {
    const tree = SvgScalableBackendNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.SvgCompactNode);
  });

  it('forwards props to SvgCompactNode', () => {
    const node = makeNode();
    const tree = SvgScalableBackendNode({ node, isSelected: true }) as React.ReactElement;
    expect((tree.props as { node: CanvasNode }).node).toBe(node);
  });

  it('carries displayName "SvgScalableBackendNode"', () => {
    expect(SvgScalableBackendNode.displayName).toBe('SvgScalableBackendNode');
  });
});
