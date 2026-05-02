/**
 * Tests for `SvgMysqlNode` — thin delegate to SvgCompactNode.
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

import { SvgMysqlNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'my-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'MySQL',
  data: { iceType: 'Database.MySQL' },
  ...overrides,
});

describe('SvgMysqlNode', () => {
  it('renders SvgCompactNode', () => {
    const tree = SvgMysqlNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.SvgCompactNode);
  });

  it('forwards props to SvgCompactNode', () => {
    const node = makeNode();
    const tree = SvgMysqlNode({ node, isSelected: false, isDragOver: true }) as React.ReactElement;
    const props = tree.props as Record<string, unknown>;
    expect(props.node).toBe(node);
    expect(props.isDragOver).toBe(true);
  });

  it('carries displayName "SvgMysqlNode"', () => {
    expect(SvgMysqlNode.displayName).toBe('SvgMysqlNode');
  });
});
