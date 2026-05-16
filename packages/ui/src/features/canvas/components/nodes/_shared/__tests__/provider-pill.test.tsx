/**
 * Tests for `ProviderPill` — provider stamp shown in the top-right of
 * every block header.
 *
 *   - Known cloud providers render as a brand <img> logo (AWS / GCP /
 *     Azure / Cloudflare / Vercel / DigitalOcean).
 *   - An unset provider falls back to a dimmer "AUTO" text pill so the
 *     slot is always present and layout doesn't shift after a provider
 *     gets assigned.
 *   - Anything not in the brand registry falls through to a plain text
 *     pill with the value uppercased.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProviderBrandIcon: vi.fn((name: string) => {
    const known: Record<string, { url: string; label: string }> = {
      aws: { url: '/_test/aws.svg', label: 'AWS' },
      gcp: { url: '/_test/gcp.svg', label: 'Google Cloud' },
      azure: { url: '/_test/azure.svg', label: 'Azure' },
    };
    return known[name.toLowerCase()] || null;
  }),
}));

vi.mock('../../../../../../assets/icons/brand-registry', () => ({
  getProviderBrandIcon: mocks.getProviderBrandIcon,
}));

import { ProviderPill } from '../provider-pill';

const renderInner = (props: React.ComponentProps<typeof ProviderPill>): React.ReactElement => {
  const Inner = (ProviderPill as unknown as {
    type: (p: React.ComponentProps<typeof ProviderPill>) => React.ReactElement;
  }).type;
  return Inner(props);
};

describe('ProviderPill — AUTO fallback', () => {
  it('renders a span with "AUTO" text when provider is empty', () => {
    const tree = renderInner({ provider: '' });
    expect(tree.type).toBe('span');
    expect((tree.props as { children: unknown }).children).toBe('AUTO');
  });

  it('uses a dimmer opacity for the AUTO fallback', () => {
    const tree = renderInner({ provider: '' });
    const style = (tree.props as { style: Record<string, string | number> }).style;
    expect(style.opacity).toBe(0.55);
  });
});

describe('ProviderPill — brand logo', () => {
  it('renders an <img> for AWS', () => {
    const tree = renderInner({ provider: 'aws' });
    expect(tree.type).toBe('img');
    const p = tree.props as { src: string; alt: string };
    expect(p.src).toBe('/_test/aws.svg');
    expect(p.alt).toBe('AWS');
  });

  it('renders an <img> for GCP', () => {
    const tree = renderInner({ provider: 'gcp' });
    expect(tree.type).toBe('img');
    expect((tree.props as { src: string }).src).toBe('/_test/gcp.svg');
  });

  it('renders an <img> for Azure', () => {
    const tree = renderInner({ provider: 'azure' });
    expect(tree.type).toBe('img');
    expect((tree.props as { src: string }).src).toBe('/_test/azure.svg');
  });

  it('renders the logo at 16x16 with contain object-fit', () => {
    const tree = renderInner({ provider: 'aws' });
    const p = tree.props as { width: number; height: number; style: Record<string, string> };
    expect(p.width).toBe(16);
    expect(p.height).toBe(16);
    expect(p.style.objectFit).toBe('contain');
  });
});

describe('ProviderPill — unknown provider fallback', () => {
  it('falls through to a text pill when no brand match exists', () => {
    const tree = renderInner({ provider: 'unknown-cloud' });
    expect(tree.type).toBe('span');
    expect((tree.props as { children: unknown }).children).toBe('UNKNOWN-CLOUD');
  });

  it('uppercases the fallback text', () => {
    const tree = renderInner({ provider: 'myCloud' });
    expect((tree.props as { children: unknown }).children).toBe('MYCLOUD');
  });
});

describe('ProviderPill — surface', () => {
  it('is a memoized component', () => {
    const memoTypeof = (ProviderPill as unknown as { $$typeof: symbol }).$$typeof;
    expect(String(memoTypeof)).toBe('Symbol(react.memo)');
  });

  it('exposes a stable displayName', () => {
    expect((ProviderPill as unknown as { displayName: string }).displayName).toBe('ProviderPill');
  });
});
