/**
 * rf-npsec-2 — CustomDomainBanner tests.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import { CustomDomainBanner } from '../custom-domain-banner';
import type { Card, CardNode } from '../../../../../store/slices/cards-slice';

interface ReactElementLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isElement(x: unknown): x is ReactElementLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ReactElementLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isElement(node)) return;
  yield node;
  yield* walk(node.props.children);
}
function findByPredicate(
  tree: unknown,
  predicate: (el: ReactElementLike) => boolean,
): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}

const makeNode = (overrides: Partial<CardNode> = {}): CardNode =>
  ({
    id: 'n1',
    type: 'compute',
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  }) as CardNode;

const makeCard = (overrides: Partial<Card> = {}): Card =>
  ({
    id: 'c1',
    name: 'Card',
    nodes: [],
    edges: [],
    ...overrides,
  }) as Card;

const callRender = (props: React.ComponentProps<typeof CustomDomainBanner>): unknown =>
  (CustomDomainBanner as (p: React.ComponentProps<typeof CustomDomainBanner>) => unknown)(props);

describe('CustomDomainBanner', () => {
  it('returns null when no Custom Domain edge connects', () => {
    const node = makeNode({ id: 'a' });
    const card = makeCard({ nodes: [node], edges: [] });
    expect(callRender({ selectedNode: node, activeCard: card })).toBe(null);
  });

  it('renders the banner with the cd label when connected', () => {
    const node = makeNode({ id: 'a' });
    const cd = makeNode({
      id: 'cd',
      data: { iceType: 'Network.CustomDomain', label: 'My CD Block' },
    });
    const card = makeCard({
      nodes: [node, cd],
      edges: [{ id: 'e', source: 'a', target: 'cd' } as Card['edges'][number]],
    });
    const tree = callRender({ selectedNode: node, activeCard: card });
    const labelSpan = findByPredicate(tree, (el) => el.props.children === 'My CD Block');
    expect(labelSpan).toBeDefined();
  });

  it('falls back to "Custom Domain" when cd node has no label', () => {
    const node = makeNode({ id: 'a' });
    const cd = makeNode({ id: 'cd', data: { iceType: 'Network.CustomDomain' } });
    const card = makeCard({
      nodes: [node, cd],
      edges: [{ id: 'e', source: 'a', target: 'cd' } as Card['edges'][number]],
    });
    const tree = callRender({ selectedNode: node, activeCard: card });
    const labelSpan = findByPredicate(tree, (el) => el.props.children === 'Custom Domain');
    expect(labelSpan).toBeDefined();
  });

  it('renders the inherited domain row when selectedNode has a domain', () => {
    const node = makeNode({ id: 'a', data: { domain: 'example.com' } });
    const cd = makeNode({ id: 'cd', data: { iceType: 'Network.CustomDomain' } });
    const card = makeCard({
      nodes: [node, cd],
      edges: [{ id: 'e', source: 'a', target: 'cd' } as Card['edges'][number]],
    });
    const tree = callRender({ selectedNode: node, activeCard: card });
    const domainRow = findByPredicate(tree, (el) => el.props.title === 'example.com');
    expect(domainRow).toBeDefined();
    expect(domainRow?.props.children).toBe('example.com');
  });

  it('omits the inherited domain row when domain is empty', () => {
    const node = makeNode({ id: 'a', data: {} });
    const cd = makeNode({ id: 'cd', data: { iceType: 'Network.CustomDomain' } });
    const card = makeCard({
      nodes: [node, cd],
      edges: [{ id: 'e', source: 'a', target: 'cd' } as Card['edges'][number]],
    });
    const tree = callRender({ selectedNode: node, activeCard: card });
    const domainRow = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('font-mono text-ice-text-1'),
    );
    expect(domainRow).toBeUndefined();
  });

  it('always renders the disconnect hint at the bottom', () => {
    const node = makeNode({ id: 'a' });
    const cd = makeNode({ id: 'cd', data: { iceType: 'Network.CustomDomain' } });
    const card = makeCard({
      nodes: [node, cd],
      edges: [{ id: 'e', source: 'a', target: 'cd' } as Card['edges'][number]],
    });
    const tree = callRender({ selectedNode: node, activeCard: card });
    const hint = findByPredicate(
      tree,
      (el) => typeof el.props.children === 'string' && (el.props.children as string).includes('Disconnect the edge'),
    );
    expect(hint).toBeDefined();
  });
});
