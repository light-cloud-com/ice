/**
 * rf-npsec-1 — node-properties-derivations unit tests.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../assets/icons', () => ({
  getIcon: vi.fn((iceType: string, provider: string) => {
    if (iceType === 'unknown') return undefined;
    return { icon: `provider-icon-${provider}` };
  }),
  DEFAULT_ICON: 'default.svg',
}));

vi.mock('../../../../assets/icons/brand-registry', () => ({
  getBrandIcon: vi.fn((key: string) => {
    if (key === 'nodejs') return { url: 'brand-nodejs' };
    if (key === 'Compute.CloudRun') return { url: 'brand-cloudrun' };
    if (key === 'My Service') return { url: 'brand-label' };
    return undefined;
  }),
}));

import {
  resolveNodeIconUrl,
  findCustomDomainEdge,
  nodeHasSourceTab,
} from '../node-properties-derivations';
import type { Card, CardNode } from '../../../../store/slices/cards-slice';

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

describe('resolveNodeIconUrl', () => {
  it('returns the brand URL when runtime is a known brand', () => {
    const node = makeNode({ data: { runtime: 'nodejs' } });
    expect(resolveNodeIconUrl(node, 'iceType', 'aws', 'label')).toBe('brand-nodejs');
  });

  it('falls back to brand by iceType when runtime has no brand match', () => {
    const node = makeNode({ data: { runtime: '' } });
    expect(resolveNodeIconUrl(node, 'Compute.CloudRun', 'aws', 'label')).toBe('brand-cloudrun');
  });

  it('falls back to brand by label when runtime + iceType have no match', () => {
    const node = makeNode({ data: {} });
    expect(resolveNodeIconUrl(node, 'unknown', 'aws', 'My Service')).toBe('brand-label');
  });

  it('falls back to provider icon when no brand matches', () => {
    const node = makeNode({ data: {} });
    expect(resolveNodeIconUrl(node, 'unmatched', 'aws', 'unmatched')).toBe('provider-icon-aws');
  });

  it('lowercases the provider for lookup', () => {
    const node = makeNode({ data: {} });
    expect(resolveNodeIconUrl(node, 'unmatched', 'GCP', 'unmatched')).toBe('provider-icon-gcp');
  });

  it('defaults provider to aws when provider is empty', () => {
    const node = makeNode({ data: {} });
    expect(resolveNodeIconUrl(node, 'unmatched', '', 'unmatched')).toBe('provider-icon-aws');
  });

  it('returns DEFAULT_ICON when neither brand nor provider icon exists', () => {
    const node = makeNode({ data: {} });
    expect(resolveNodeIconUrl(node, 'unknown', 'aws', 'unmatched')).toBe('default.svg');
  });
});

describe('findCustomDomainEdge', () => {
  it('returns null when no edge connects selectedNode to a Network.CustomDomain node', () => {
    const node = makeNode({ id: 'a' });
    const card = makeCard({
      nodes: [node, makeNode({ id: 'b', data: { iceType: 'Compute.Service' } })],
      edges: [{ id: 'e', source: 'a', target: 'b' } as Card['edges'][number]],
    });
    expect(findCustomDomainEdge(card, node)).toBeNull();
  });

  it('returns the edge + cd node when the connected node is a CustomDomain', () => {
    const node = makeNode({ id: 'a' });
    const cd = makeNode({ id: 'cd', data: { iceType: 'Network.CustomDomain' } });
    const card = makeCard({
      nodes: [node, cd],
      edges: [{ id: 'e', source: 'a', target: 'cd' } as Card['edges'][number]],
    });
    const result = findCustomDomainEdge(card, node);
    expect(result).not.toBeNull();
    expect(result!.cdNode.id).toBe('cd');
  });

  it('finds the CustomDomain when the edge points the other direction', () => {
    const node = makeNode({ id: 'a' });
    const cd = makeNode({ id: 'cd', data: { iceType: 'Network.CustomDomain' } });
    const card = makeCard({
      nodes: [node, cd],
      edges: [{ id: 'e', source: 'cd', target: 'a' } as Card['edges'][number]],
    });
    const result = findCustomDomainEdge(card, node);
    expect(result?.cdNode.id).toBe('cd');
  });

  it('returns null when the connected other node is missing from card.nodes', () => {
    const node = makeNode({ id: 'a' });
    const card = makeCard({
      nodes: [node],
      edges: [{ id: 'e', source: 'a', target: 'phantom' } as Card['edges'][number]],
    });
    expect(findCustomDomainEdge(card, node)).toBeNull();
  });
});

describe('nodeHasSourceTab', () => {
  it('returns true for any Compute.* iceType', () => {
    expect(nodeHasSourceTab('Compute.CloudRun')).toBe(true);
    expect(nodeHasSourceTab('Compute.Lambda')).toBe(true);
  });

  it('returns true for Network.Gateway specifically', () => {
    expect(nodeHasSourceTab('Network.Gateway')).toBe(true);
  });

  it('returns false for Source.Repository (specifically excluded)', () => {
    expect(nodeHasSourceTab('Source.Repository')).toBe(false);
  });

  it('returns false for non-Compute, non-Network.Gateway types', () => {
    expect(nodeHasSourceTab('Network.PublicEndpoint')).toBe(false);
    expect(nodeHasSourceTab('Storage.Bucket')).toBe(false);
    expect(nodeHasSourceTab('')).toBe(false);
  });
});
