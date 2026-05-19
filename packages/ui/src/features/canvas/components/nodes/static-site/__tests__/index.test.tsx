/**
 * Tests for `SvgStaticSiteNode` — bespoke renderer with the
 * globe-and-CDN-edges body + framework wordmark.
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
  Globe: ((_p: Record<string, unknown>) => null) as React.FC,
}));

import {
  SvgStaticSiteNode,
  computeStaticSiteHeight,
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
  id: 's-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'marketing-site',
  data: { iceType: 'Compute.StaticSite' },
  ...overrides,
});

const renderInner = (
  props: Partial<React.ComponentProps<typeof SvgStaticSiteNode>> = {},
): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgStaticSiteNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgStaticSiteNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeStaticSiteHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected = COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeStaticSiteHeight()).toBe(expected);
  });
});

describe('SvgStaticSiteNode', () => {
  it('exposes the displayName', () => {
    expect(SvgStaticSiteNode.displayName).toBe('SvgStaticSiteNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('renders React as the default framework', () => {
    const tree = renderInner();
    const el = findByTestId(tree, 'static-framework-s-1');
    expect((el!.props as { children: string }).children).toBe('React');
  });

  it('translates known framework slugs to their pretty wordmark', () => {
    const tree = renderInner({ node: makeNode({ data: { framework: 'svelte' } }) });
    const el = findByTestId(tree, 'static-framework-s-1');
    expect((el!.props as { children: string }).children).toBe('Svelte');
  });

  it('preserves unknown framework slugs verbatim', () => {
    const tree = renderInner({ node: makeNode({ data: { framework: 'eleventy' } }) });
    const el = findByTestId(tree, 'static-framework-s-1');
    expect((el!.props as { children: string }).children).toBe('eleventy');
  });

  it('shows "global CDN" in liveConfig by default', () => {
    const tree = renderInner({ node: makeNode({ data: { size: 'amplify-free' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('amplify-free · global CDN');
  });

  it('shows "no CDN" when fast_worldwide is explicitly false', () => {
    const tree = renderInner({ node: makeNode({ data: { fast_worldwide: false } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('no CDN');
  });

  it('includes a custom_domain when set', () => {
    const tree = renderInner({
      node: makeNode({ data: { custom_domain: 'shop.example.com' } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('shop.example.com · global CDN');
  });
});
