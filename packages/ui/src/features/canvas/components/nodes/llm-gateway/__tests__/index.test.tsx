/**
 * Tests for `SvgLlmGatewayNode` — thin delegate to SvgCompactNode.
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

import { SvgLlmGatewayNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'llm-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 120,
  label: 'LLM Gateway',
  data: { iceType: 'AI.LLMGateway' },
  ...overrides,
});

describe('SvgLlmGatewayNode', () => {
  it('renders SvgCompactNode', () => {
    const tree = SvgLlmGatewayNode({ node: makeNode(), isSelected: false }) as React.ReactElement;
    expect(tree.type).toBe(mocks.SvgCompactNode);
  });

  it('forwards isSelected and node to SvgCompactNode', () => {
    const node = makeNode();
    const tree = SvgLlmGatewayNode({ node, isSelected: true }) as React.ReactElement;
    const props = tree.props as Record<string, unknown>;
    expect(props.node).toBe(node);
    expect(props.isSelected).toBe(true);
  });

  it('carries displayName "SvgLlmGatewayNode"', () => {
    expect(SvgLlmGatewayNode.displayName).toBe('SvgLlmGatewayNode');
  });
});
