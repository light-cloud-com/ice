/**
 * Tests for `SvgServerlessFunctionNode` — bespoke renderer with the
 * bolt-and-halo body, trigger label, and memory/timeout footer.
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
  Zap: ((_p: Record<string, unknown>) => null) as React.FC,
}));

import {
  SvgServerlessFunctionNode,
  computeServerlessFunctionHeight,
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
function findByTestId(tree: React.ReactNode, id: string): React.ReactElement | undefined {
  for (const el of walk(tree)) {
    if ((el.props as { 'data-testid'?: string })['data-testid'] === id) return el;
  }
  return undefined;
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'fn-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'webhook-handler',
  data: { iceType: 'Compute.ServerlessFunction' },
  ...overrides,
});

const renderInner = (
  props: Partial<React.ComponentProps<typeof SvgServerlessFunctionNode>> = {},
): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgServerlessFunctionNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgServerlessFunctionNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeServerlessFunctionHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected =
      COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeServerlessFunctionHeight()).toBe(expected);
  });
});

describe('SvgServerlessFunctionNode', () => {
  it('exposes the displayName', () => {
    expect(SvgServerlessFunctionNode.displayName).toBe('SvgServerlessFunctionNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('renders the HTTP trigger label by default', () => {
    const tree = renderInner();
    const el = findByTestId(tree, 'fn-trigger-fn-1');
    expect((el!.props as { children: string }).children).toBe('HTTP');
  });

  it('translates pubsub trigger slug to "Pub/Sub"', () => {
    const tree = renderInner({ node: makeNode({ data: { trigger: 'pubsub' } }) });
    const el = findByTestId(tree, 'fn-trigger-fn-1');
    expect((el!.props as { children: string }).children).toBe('Pub/Sub');
  });

  it('preserves unknown trigger slugs verbatim', () => {
    const tree = renderInner({ node: makeNode({ data: { trigger: 'kinesis' } }) });
    const el = findByTestId(tree, 'fn-trigger-fn-1');
    expect((el!.props as { children: string }).children).toBe('kinesis');
  });

  it('builds liveConfig from memory + timeout + runtime', () => {
    const tree = renderInner({
      node: makeNode({ data: { memory: 256, timeout: 30, runtime: 'node20' } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('256 MB · 30s · node20');
  });

  it('falls back to "unconfigured" liveConfig when nothing is set', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('unconfigured');
  });
});
