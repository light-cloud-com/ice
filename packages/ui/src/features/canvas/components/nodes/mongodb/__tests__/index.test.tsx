/**
 * Tests for `SvgMongodbNode` — thin delegate to SvgCompactNode.
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

import { SvgMongodbNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'm-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'MongoDB',
  data: { iceType: 'Database.MongoDB' },
  ...overrides,
});

describe('SvgMongodbNode', () => {
  it('renders SvgCompactNode', () => {
    const tree = SvgMongodbNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.SvgCompactNode);
  });

  it('forwards props to SvgCompactNode', () => {
    const node = makeNode();
    const tree = SvgMongodbNode({ node, isSelected: true, lod: 3 }) as React.ReactElement;
    const props = tree.props as Record<string, unknown>;
    expect(props.node).toBe(node);
    expect(props.isSelected).toBe(true);
    expect(props.lod).toBe(3);
  });

  it('carries displayName "SvgMongodbNode"', () => {
    expect(SvgMongodbNode.displayName).toBe('SvgMongodbNode');
  });
});
