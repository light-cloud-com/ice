/**
 * Tests for `SvgScalableBackendNode` — bespoke renderer with a horizontal
 * ScaleGauge body and a scaling-metric caption.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const passthrough: React.FC<Record<string, unknown>> = (props) =>
    React.createElement('div', null, (props as { children?: React.ReactNode }).children);
  passthrough.displayName = 'MockCardShell';
  const gauge: React.FC<{ min: number; max: number; caption?: string; color?: string }> = () => null;
  gauge.displayName = 'MockScaleGauge';
  return { CardShell: passthrough, ScaleGauge: gauge };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
  ScaleGauge: mocks.ScaleGauge,
}));

vi.mock('lucide-react', () => ({
  Server: ((_p: Record<string, unknown>) => null) as React.FC,
}));

import {
  SvgScalableBackendNode,
  computeScalableBackendHeight,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_PADDING,
} from '..';
import { CARD_FOOTER_HEIGHT } from '@ice/constants';
import type { CanvasNode } from '../../../svg-canvas';

type ReactNodeLike = React.ReactNode;
function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}
const findByType = (tree: React.ReactNode, type: unknown) => [...walk(tree)].filter((el) => el.type === type);

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'sb-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'API Service',
  data: { iceType: 'Compute.Container' },
  ...overrides,
});

const renderInner = (props: Partial<React.ComponentProps<typeof SvgScalableBackendNode>> = {}): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgScalableBackendNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgScalableBackendNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeScalableBackendHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected =
      COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeScalableBackendHeight()).toBe(expected);
  });
});

describe('SvgScalableBackendNode', () => {
  it('exposes the displayName', () => {
    expect(SvgScalableBackendNode.displayName).toBe('SvgScalableBackendNode');
  });

  it('renders a CardShell wrapper (not the generic SvgCompactNode anymore)', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('renders a ScaleGauge in the body', () => {
    const tree = renderInner();
    expect(findByType(tree, mocks.ScaleGauge)).toHaveLength(1);
  });

  it('passes minInstances/maxInstances through to ScaleGauge', () => {
    const tree = renderInner({ node: makeNode({ data: { minInstances: 2, maxInstances: 50 } }) });
    const gauge = findByType(tree, mocks.ScaleGauge)[0];
    const p = gauge.props as { min: number; max: number };
    expect(p.min).toBe(2);
    expect(p.max).toBe(50);
  });

  it('defaults min=1 / max=10 when not set on the node', () => {
    const tree = renderInner();
    const gauge = findByType(tree, mocks.ScaleGauge)[0];
    const p = gauge.props as { min: number; max: number };
    expect(p.min).toBe(1);
    expect(p.max).toBe(10);
  });

  it('builds the caption from scalingMetric + scalingThreshold', () => {
    const tree = renderInner({
      node: makeNode({ data: { scalingMetric: 'cpu', scalingThreshold: 70 } }),
    });
    const gauge = findByType(tree, mocks.ScaleGauge)[0];
    expect((gauge.props as { caption?: string }).caption).toBe('cpu 70%');
  });

  it('omits threshold from caption when not set', () => {
    const tree = renderInner({ node: makeNode({ data: { scalingMetric: 'memory' } }) });
    const gauge = findByType(tree, mocks.ScaleGauge)[0];
    expect((gauge.props as { caption?: string }).caption).toBe('memory');
  });

  it('builds liveConfig from instance range + size + runtime', () => {
    const tree = renderInner({
      node: makeNode({
        data: { minInstances: 1, maxInstances: 10, size: '0.5-1024', runtime: 'node20' },
      }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('1–10 instances · 0.5-1024 · node20');
  });

  it('falls back to "unconfigured" liveConfig when nothing is set', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('unconfigured');
  });
});
