/**
 * Tests for `SvgVectorDbNode` — bespoke renderer with the procedural
 * t-SNE-style dot cloud body.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const passthrough: React.FC<Record<string, unknown>> = (props) =>
    React.createElement('div', null, (props as { children?: React.ReactNode }).children);
  passthrough.displayName = 'MockCardShell';
  return { CardShell: passthrough };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
}));

vi.mock('lucide-react', () => ({
  Target: ((_p: Record<string, unknown>) => null) as React.FC,
}));

import {
  SvgVectorDbNode,
  computeVectorDbHeight,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_PADDING,
} from '..';
import { CARD_FOOTER_HEIGHT } from '@ice/constants';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'v-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'embeddings',
  data: { iceType: 'AI.VectorDB' },
  ...overrides,
});

const renderInner = (props: Partial<React.ComponentProps<typeof SvgVectorDbNode>> = {}): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgVectorDbNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgVectorDbNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeVectorDbHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected =
      COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeVectorDbHeight()).toBe(expected);
  });
});

describe('SvgVectorDbNode', () => {
  it('exposes the displayName', () => {
    expect(SvgVectorDbNode.displayName).toBe('SvgVectorDbNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('builds liveConfig from dimensions + metric', () => {
    const tree = renderInner({
      node: makeNode({ data: { dimensions: 1536, metric: 'cosine' } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('1536-d · cosine');
  });

  it('translates legacy metric slugs to display labels (l2, ip)', () => {
    const tree = renderInner({ node: makeNode({ data: { dimensions: 768, metric: 'l2' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('768-d · L2');
  });

  it('preserves unknown metric slugs verbatim', () => {
    const tree = renderInner({ node: makeNode({ data: { dimensions: 384, metric: 'manhattan' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('384-d · manhattan');
  });

  it('falls back to "unconfigured" liveConfig when no data', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('unconfigured');
  });
});
