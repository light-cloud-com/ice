/**
 * Tests for `SvgObjectStorageNode` — thin delegate to SvgCompactNode.
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

import { SvgObjectStorageNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'os-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'Object Storage',
  data: { iceType: 'Storage.Object' },
  ...overrides,
});

describe('SvgObjectStorageNode', () => {
  it('renders SvgCompactNode', () => {
    const tree = SvgObjectStorageNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.SvgCompactNode);
  });

  it('forwards isSelected to SvgCompactNode', () => {
    const tree = SvgObjectStorageNode({ node: makeNode(), isSelected: true }) as React.ReactElement;
    expect((tree.props as { isSelected: boolean }).isSelected).toBe(true);
  });

  it('carries displayName "SvgObjectStorageNode"', () => {
    expect(SvgObjectStorageNode.displayName).toBe('SvgObjectStorageNode');
  });
});
