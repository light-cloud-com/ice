/**
 * Tests for `SvgPrivateAiServiceNode` — thin delegate to SvgCompactNode.
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

import { SvgPrivateAiServiceNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'pai-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'Private AI',
  data: { iceType: 'AI.PrivateService' },
  ...overrides,
});

describe('SvgPrivateAiServiceNode', () => {
  it('renders SvgCompactNode', () => {
    const tree = SvgPrivateAiServiceNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.SvgCompactNode);
  });

  it('forwards props to SvgCompactNode', () => {
    const node = makeNode();
    const tree = SvgPrivateAiServiceNode({ node, isSelected: true }) as React.ReactElement;
    expect((tree.props as { node: CanvasNode }).node).toBe(node);
  });

  it('carries displayName "SvgPrivateAiServiceNode"', () => {
    expect(SvgPrivateAiServiceNode.displayName).toBe('SvgPrivateAiServiceNode');
  });
});
