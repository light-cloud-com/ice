/**
 * Tests for `SvgWorkerNode` — bespoke renderer with the "queue feeds cog"
 * body and a replica-range ScaleGauge.
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
  Cog: ((_p: Record<string, unknown>) => null) as React.FC,
}));

import { SvgWorkerNode, computeWorkerHeight, COMPUTE_HEADER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_PADDING } from '..';
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
  id: 'w-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'video-encoder',
  data: { iceType: 'Compute.Worker' },
  ...overrides,
});

const renderInner = (props: Partial<React.ComponentProps<typeof SvgWorkerNode>> = {}): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgWorkerNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgWorkerNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeWorkerHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected =
      COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeWorkerHeight()).toBe(expected);
  });
});

describe('SvgWorkerNode', () => {
  it('exposes the displayName', () => {
    expect(SvgWorkerNode.displayName).toBe('SvgWorkerNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('renders a ScaleGauge for replica range', () => {
    const tree = renderInner();
    expect(findByType(tree, mocks.ScaleGauge)).toHaveLength(1);
  });

  it('uses replicas in the gauge caption when set', () => {
    const tree = renderInner({ node: makeNode({ data: { replicas: 5 } }) });
    const gauge = findByType(tree, mocks.ScaleGauge)[0];
    expect((gauge.props as { caption?: string }).caption).toBe('5 replicas');
  });

  it('falls back to "auto-scaled" caption when no replicas count', () => {
    const tree = renderInner();
    const gauge = findByType(tree, mocks.ScaleGauge)[0];
    expect((gauge.props as { caption?: string }).caption).toBe('auto-scaled');
  });

  it('builds liveConfig from scalingMetric + size + runtime', () => {
    const tree = renderInner({
      node: makeNode({ data: { scalingMetric: 'queue-depth', size: '0.5-1024', runtime: 'node20' } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('queue-depth scaling · 0.5-1024 · node20');
  });

  it('falls back to "unconfigured" liveConfig when nothing is set', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('unconfigured');
  });
});
