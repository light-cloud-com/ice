/**
 * Tests for `SvgEventStreamNode` — thin delegate that forwards
 * SvgCompactNodeProps to the underlying SvgCompactNode renderer.
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

import { SvgEventStreamNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'es-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'Event Stream',
  data: { iceType: 'Messaging.EventStream' },
  ...overrides,
});

describe('SvgEventStreamNode', () => {
  it('renders SvgCompactNode (delegation type)', () => {
    const tree = SvgEventStreamNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.SvgCompactNode);
  });

  it('forwards props verbatim to SvgCompactNode', () => {
    const node = makeNode({ id: 'pass-through' });
    const tree = SvgEventStreamNode({
      node,
      isSelected: true,
      lod: 1,
    }) as React.ReactElement;
    const props = tree.props as Record<string, unknown>;
    expect(props.node).toBe(node);
    expect(props.isSelected).toBe(true);
    expect(props.lod).toBe(1);
  });

  it('carries displayName "SvgEventStreamNode"', () => {
    expect(SvgEventStreamNode.displayName).toBe('SvgEventStreamNode');
  });
});
