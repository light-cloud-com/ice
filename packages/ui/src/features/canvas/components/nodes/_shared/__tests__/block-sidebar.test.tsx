/**
 * Tests for `BlockSidebar` — the 56px vertical strip on the left edge of
 * each block. Three slots: type icon, resource name, provider logo.
 *
 * Branches under test:
 *   - getServiceName returns a value → resource short-name slot rendered.
 *   - shortResourceName strips a leading provider word ("Amazon ", "AWS ", etc.).
 *   - getBrandIcon returns null → provider slot suppressed.
 *   - provider undefined → both lookups skip; sidebar still renders.
 *   - bottom flex strip top-border behavior — present when shortName OR
 *     providerBrand is present, undefined otherwise.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServiceName: vi.fn(() => null as string | null),
  getBrandIcon: vi.fn(() => null as { url: string; label: string } | null),
}));

vi.mock('../../../../../../assets/icons/brand-registry', () => ({
  getBrandIcon: mocks.getBrandIcon,
}));
vi.mock('../../../../../../assets/icons/service-names', () => ({
  getServiceName: mocks.getServiceName,
}));

import { BlockSidebar, SIDEBAR_WIDTH } from '../block-sidebar';

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

const findByType = (tree: React.ReactNode, type: unknown) =>
  [...walk(tree)].filter((el) => el.type === type);

const renderInner = (props: React.ComponentProps<typeof BlockSidebar>): React.ReactElement => {
  return BlockSidebar(props) as React.ReactElement;
};

beforeEach(() => {
  mocks.getServiceName.mockReset();
  mocks.getServiceName.mockReturnValue(null);
  mocks.getBrandIcon.mockReset();
  mocks.getBrandIcon.mockReturnValue(null);
});

describe('BlockSidebar', () => {
  it('exports SIDEBAR_WIDTH = 56', () => {
    expect(SIDEBAR_WIDTH).toBe(56);
  });

  it('renders a 56-px wide flex column container', () => {
    const tree = renderInner({
      icon: React.createElement('svg', { 'data-stub': 'icon' }),
      iceType: 'Compute.Function',
      accent: '#22c55e',
    });
    expect(tree.type).toBe('div');
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.width).toBe(56);
    expect(style.display).toBe('flex');
    expect(style.flexDirection).toBe('column');
  });

  it('renders the icon node inside the type tile', () => {
    const tree = renderInner({
      icon: React.createElement('svg', { 'data-stub': 'icon' }),
      iceType: 'Compute.Function',
      accent: '#22c55e',
    });
    const iconEls = [...walk(tree)].filter(
      (el) => (el.props as { 'data-stub'?: string })['data-stub'] === 'icon',
    );
    expect(iconEls).toHaveLength(1);
  });

  it('omits the resource-name slot when getServiceName returns null', () => {
    mocks.getServiceName.mockReturnValueOnce(null);
    const tree = renderInner({
      icon: React.createElement('svg', { 'data-stub': 'icon' }),
      iceType: 'Compute.Function',
      provider: 'aws',
      accent: '#22c55e',
    });
    // No span with letterSpacing 0.08em (the short-name slot signature) should exist.
    const spans = findByType(tree, 'span');
    expect(spans).toHaveLength(0);
  });

  it('renders the resource name when getServiceName returns a value', () => {
    mocks.getServiceName.mockReturnValueOnce('Amazon RDS');
    const tree = renderInner({
      icon: React.createElement('svg', { 'data-stub': 'icon' }),
      iceType: 'Database.Postgres',
      provider: 'aws',
      accent: '#22c55e',
    });
    const spans = findByType(tree, 'span');
    // shortResourceName strips "Amazon " → "RDS".
    expect(spans).toHaveLength(1);
    expect((spans[0].props as { children: unknown }).children).toBe('RDS');
  });

  it('shortResourceName falls through unchanged when no known prefix is present', () => {
    mocks.getServiceName.mockReturnValueOnce('CustomThing');
    const tree = renderInner({
      icon: React.createElement('svg', { 'data-stub': 'icon' }),
      iceType: 'X.Y',
      provider: 'aws',
      accent: '#fff',
    });
    const spans = findByType(tree, 'span');
    expect((spans[0].props as { children: unknown }).children).toBe('CustomThing');
  });

  it.each([
    ['Amazon ECS', 'ECS'],
    ['AWS Lambda', 'Lambda'],
    ['Google Cloud SQL', 'Cloud SQL'],
    ['GCP Cloud Run', 'Cloud Run'],
    ['Azure Container Apps', 'Container Apps'],
    ['Microsoft SQL', 'SQL'],
    ['Alibaba ECI', 'ECI'],
    ['Oracle Compute', 'Compute'],
    ['OCI Storage', 'Storage'],
    ['DigitalOcean Droplet', 'Droplet'],
    ['DO App Platform', 'App Platform'],
  ])('shortResourceName strips known leading prefix on %s → %s', (full, short) => {
    mocks.getServiceName.mockReturnValueOnce(full);
    const tree = renderInner({
      icon: React.createElement('svg', { 'data-stub': 'icon' }),
      iceType: 'X.Y',
      provider: 'aws',
      accent: '#000',
    });
    const spans = findByType(tree, 'span');
    expect((spans[0].props as { children: unknown }).children).toBe(short);
  });

  it('omits the provider-brand slot when getBrandIcon returns null', () => {
    mocks.getBrandIcon.mockReturnValueOnce(null);
    const tree = renderInner({
      icon: React.createElement('svg', { 'data-stub': 'icon' }),
      iceType: 'X.Y',
      provider: 'aws',
      accent: '#000',
    });
    const imgs = findByType(tree, 'img');
    expect(imgs).toHaveLength(0);
  });

  it('renders the provider brand image when getBrandIcon returns a value', () => {
    mocks.getBrandIcon.mockReturnValueOnce({ url: 'icon.svg', label: 'AWS' });
    const tree = renderInner({
      icon: React.createElement('svg', { 'data-stub': 'icon' }),
      iceType: 'X.Y',
      provider: 'aws',
      accent: '#000',
    });
    const imgs = findByType(tree, 'img');
    expect(imgs).toHaveLength(1);
    const props = imgs[0].props as { src: string; alt: string; draggable: boolean };
    expect(props.src).toBe('icon.svg');
    expect(props.alt).toBe('AWS');
    expect(props.draggable).toBe(false);
  });

  it('skips both lookups when provider is undefined', () => {
    const tree = renderInner({
      icon: React.createElement('svg', { 'data-stub': 'icon' }),
      iceType: 'X.Y',
      accent: '#000',
    });
    expect(mocks.getServiceName).not.toHaveBeenCalled();
    expect(mocks.getBrandIcon).not.toHaveBeenCalled();
    expect(findByType(tree, 'img')).toHaveLength(0);
  });

  it('bottom strip omits border-top when neither shortName nor brand is present', () => {
    const tree = renderInner({
      icon: React.createElement('svg', { 'data-stub': 'icon' }),
      iceType: 'X.Y',
      provider: 'aws',
      accent: '#000',
    });
    const els = [...walk(tree)];
    // Last <div> is the flex-fill bottom strip; its style.flex = 1.
    const bottom = els.reverse().find(
      (el) =>
        el.type === 'div' &&
        (el.props as { style?: Record<string, string | number> }).style?.flex === 1,
    )!;
    const style = (bottom.props as { style: Record<string, string | undefined> }).style;
    expect(style.borderTop).toBeUndefined();
  });

  it('bottom strip carries border-top when a shortName is present', () => {
    mocks.getServiceName.mockReturnValueOnce('Amazon RDS');
    const tree = renderInner({
      icon: React.createElement('svg', { 'data-stub': 'icon' }),
      iceType: 'X.Y',
      provider: 'aws',
      accent: '#000',
    });
    const els = [...walk(tree)];
    const bottom = els.reverse().find(
      (el) =>
        el.type === 'div' &&
        (el.props as { style?: Record<string, string | number> }).style?.flex === 1,
    )!;
    const style = (bottom.props as { style: Record<string, string | undefined> }).style;
    expect(style.borderTop).toBe('1px solid var(--ice-border-subtle, var(--ice-border))');
  });

  it('exposes a stable displayName', () => {
    expect(BlockSidebar.displayName).toBe('BlockSidebar');
  });
});
