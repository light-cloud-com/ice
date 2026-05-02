/**
 * Tests for `SvgScheduledTaskNode` — thin delegate to SvgCompactNode.
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

import { SvgScheduledTaskNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'st-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'Scheduled Task',
  data: { iceType: 'Compute.ScheduledTask' },
  ...overrides,
});

describe('SvgScheduledTaskNode', () => {
  it('renders SvgCompactNode', () => {
    const tree = SvgScheduledTaskNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.SvgCompactNode);
  });

  it('forwards node and isSelected', () => {
    const node = makeNode();
    const tree = SvgScheduledTaskNode({ node, isSelected: true }) as React.ReactElement;
    expect((tree.props as { node: CanvasNode }).node).toBe(node);
    expect((tree.props as { isSelected: boolean }).isSelected).toBe(true);
  });

  it('carries displayName "SvgScheduledTaskNode"', () => {
    expect(SvgScheduledTaskNode.displayName).toBe('SvgScheduledTaskNode');
  });
});
