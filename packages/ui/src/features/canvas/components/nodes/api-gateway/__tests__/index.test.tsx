/**
 * Tests for `SvgApiGatewayNode` — bespoke renderer that surfaces the
 * protocol pill + a stacked list of route paths read from
 * `node.data.routes`.
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
  Router: ((_p: Record<string, unknown>) => null) as React.FC,
}));

import {
  SvgApiGatewayNode,
  computeApiGatewayHeight,
  AG_HEADER_HEIGHT,
  AG_ROW_HEIGHT,
  AG_ROW_GAP,
  AG_PADDING,
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
function findAllByTestIdPrefix(tree: React.ReactNode, prefix: string): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    const id = (el.props as { 'data-testid'?: string })['data-testid'];
    if (typeof id === 'string' && id.startsWith(prefix)) out.push(el);
  }
  return out;
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'gw-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'public-api',
  data: { iceType: 'Network.Gateway' },
  ...overrides,
});

const renderInner = (props: Partial<React.ComponentProps<typeof SvgApiGatewayNode>> = {}): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgApiGatewayNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgApiGatewayNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeApiGatewayHeight', () => {
  it('returns header + 1 row + footer with empty data', () => {
    const protocolRow = 22;
    const expected =
      AG_HEADER_HEIGHT +
      AG_PADDING +
      protocolRow +
      AG_ROW_GAP +
      1 * (AG_ROW_HEIGHT + AG_ROW_GAP) -
      AG_ROW_GAP +
      AG_PADDING +
      CARD_FOOTER_HEIGHT;
    expect(computeApiGatewayHeight({})).toBe(expected);
  });

  it('caps row count at the visible window (3)', () => {
    const heightFor = (n: number) =>
      computeApiGatewayHeight({ routes: Array.from({ length: n }).map((_, i) => `/r${i}`) });
    expect(heightFor(3)).toBe(heightFor(5));
    expect(heightFor(3)).toBe(heightFor(20));
  });

  it('grows linearly from 1 to 3 routes', () => {
    const h1 = computeApiGatewayHeight({ routes: ['/a'] });
    const h2 = computeApiGatewayHeight({ routes: ['/a', '/b'] });
    const h3 = computeApiGatewayHeight({ routes: ['/a', '/b', '/c'] });
    expect(h2 - h1).toBe(AG_ROW_HEIGHT + AG_ROW_GAP);
    expect(h3 - h2).toBe(AG_ROW_HEIGHT + AG_ROW_GAP);
  });
});

describe('SvgApiGatewayNode — protocol pill', () => {
  it('translates the HTTP API slug to "HTTP API"', () => {
    const tree = renderInner({ node: makeNode({ data: { protocol: 'http' } }) });
    const el = findByTestId(tree, 'gateway-protocol-gw-1');
    expect((el!.props as { children: string }).children).toBe('HTTP API');
  });

  it('translates the rest slug to "REST"', () => {
    const tree = renderInner({ node: makeNode({ data: { protocol: 'rest' } }) });
    const el = findByTestId(tree, 'gateway-protocol-gw-1');
    expect((el!.props as { children: string }).children).toBe('REST');
  });

  it('translates azure-standard to "API Management (Standard v2)"', () => {
    const tree = renderInner({ node: makeNode({ data: { protocol: 'azure-standard' } }) });
    const el = findByTestId(tree, 'gateway-protocol-gw-1');
    expect((el!.props as { children: string }).children).toBe('API Management (Standard v2)');
  });

  it('preserves unknown protocol slugs verbatim', () => {
    const tree = renderInner({ node: makeNode({ data: { protocol: 'mqtt' } }) });
    const el = findByTestId(tree, 'gateway-protocol-gw-1');
    expect((el!.props as { children: string }).children).toBe('mqtt');
  });

  it('shows "no protocol" when unset', () => {
    const tree = renderInner();
    const el = findByTestId(tree, 'gateway-protocol-gw-1');
    expect((el!.props as { children: string }).children).toBe('no protocol');
  });
});

describe('SvgApiGatewayNode — routes', () => {
  it('renders an empty-state hint when no routes', () => {
    const tree = renderInner();
    expect(findByTestId(tree, 'gateway-empty-gw-1')).toBeDefined();
  });

  it('renders one row per route, up to the visible window (3)', () => {
    const tree = renderInner({
      node: makeNode({ data: { routes: ['/api/users', '/api/orders', '/api/products', '/api/billing'] } }),
    });
    const rows = findAllByTestIdPrefix(tree, 'gateway-route-gw-1-');
    expect(rows).toHaveLength(3);
  });

  it('shows "+N more" when routes exceed the visible window', () => {
    const tree = renderInner({
      node: makeNode({
        data: { routes: ['/a', '/b', '/c', '/d', '/e'] },
      }),
    });
    const more = findByTestId(tree, 'gateway-more-gw-1');
    expect(more).toBeDefined();
    expect((more!.props as { children: string }).children).toBe('+2 more');
  });

  it('omits the "+N more" overflow chip when all routes fit', () => {
    const tree = renderInner({ node: makeNode({ data: { routes: ['/a', '/b'] } }) });
    expect(findByTestId(tree, 'gateway-more-gw-1')).toBeUndefined();
  });

  it('accepts object-shaped routes via the `path` field', () => {
    const tree = renderInner({
      node: makeNode({ data: { routes: [{ path: '/users' }, { path: '/orders' }] } }),
    });
    const rows = findAllByTestIdPrefix(tree, 'gateway-route-gw-1-');
    expect(rows).toHaveLength(2);
  });

  it('drops blank entries', () => {
    const tree = renderInner({
      node: makeNode({ data: { routes: ['/ok', '', '   ', '/also-ok'] } }),
    });
    const rows = findAllByTestIdPrefix(tree, 'gateway-route-gw-1-');
    expect(rows).toHaveLength(2);
  });
});

describe('SvgApiGatewayNode — liveConfig', () => {
  it('builds the footer as `N routes · auth state`', () => {
    const tree = renderInner({
      node: makeNode({ data: { routes: ['/a', '/b'], login_required: true } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('2 routes · auth required');
  });

  it('uses singular "route" for one entry', () => {
    const tree = renderInner({ node: makeNode({ data: { routes: ['/api'] } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('1 route · public');
  });

  it('falls back to "no routes · public" when nothing is set', () => {
    const tree = renderInner();
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('no routes · public');
  });
});

describe('SvgApiGatewayNode — surface', () => {
  it('exposes the displayName', () => {
    expect(SvgApiGatewayNode.displayName).toBe('SvgApiGatewayNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('uses node.label as the card title', () => {
    const tree = renderInner({ node: makeNode({ label: 'main gateway' }) });
    expect((tree.props as { title: string }).title).toBe('main gateway');
  });

  it('falls back to "API Gateway" when label is empty', () => {
    const tree = renderInner({ node: makeNode({ label: '' }) });
    expect((tree.props as { title: string }).title).toBe('API Gateway');
  });
});
