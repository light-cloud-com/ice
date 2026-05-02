/**
 * Tests for `SvgStaticSiteNode` — thin delegate to SvgCompactNode.
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

import { SvgStaticSiteNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'ss-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'Static',
  data: { iceType: 'Compute.StaticSite' },
  ...overrides,
});

describe('SvgStaticSiteNode', () => {
  it('renders SvgCompactNode', () => {
    const tree = SvgStaticSiteNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.SvgCompactNode);
  });

  it('forwards node and isSelected', () => {
    const node = makeNode();
    const tree = SvgStaticSiteNode({ node, isSelected: true }) as React.ReactElement;
    expect((tree.props as { node: CanvasNode }).node).toBe(node);
  });

  it('carries displayName "SvgStaticSiteNode"', () => {
    expect(SvgStaticSiteNode.displayName).toBe('SvgStaticSiteNode');
  });
});
