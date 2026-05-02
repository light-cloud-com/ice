/**
 * Tests for `SvgGithubRepoNode` — thin delegate to SvgCompactNode.
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

import { SvgGithubRepoNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'gh-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'octocat/repo',
  data: { iceType: 'Source.Repository', repository: 'octocat/repo' },
  ...overrides,
});

describe('SvgGithubRepoNode', () => {
  it('renders SvgCompactNode (delegation type)', () => {
    const tree = SvgGithubRepoNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.SvgCompactNode);
  });

  it('forwards every prop to SvgCompactNode', () => {
    const node = makeNode();
    const onNodeHover = vi.fn();
    const tree = SvgGithubRepoNode({
      node,
      isSelected: true,
      isDragOver: true,
      onNodeHover,
    }) as React.ReactElement;
    const props = tree.props as Record<string, unknown>;
    expect(props.node).toBe(node);
    expect(props.isSelected).toBe(true);
    expect(props.isDragOver).toBe(true);
    expect(props.onNodeHover).toBe(onNodeHover);
  });

  it('carries displayName "SvgGithubRepoNode"', () => {
    expect(SvgGithubRepoNode.displayName).toBe('SvgGithubRepoNode');
  });
});
