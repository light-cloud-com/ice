/**
 * rf-wgal-3 — Badges (ProviderLogos, TechStackLogos, DifficultyDots, TrustBadge).
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 pattern).
 * Mocks `useTranslation` to return the i18n key verbatim and `useMemo`
 * to passthrough so `TechStackLogos`'s memoised brand-icon resolution
 * runs eagerly during direct invocation. `getBrandIcon` /
 * `getProviderBrandIcon` are mocked at the source path with a small
 * in-test lookup.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const patchedUseMemo = vi.fn((fn: () => unknown) => fn());
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useMemo: patchedUseMemo,
    default: {
      ...actualDefault,
      useMemo: patchedUseMemo,
    },
  };
});

vi.mock('@ui/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@ui/assets/icons/brand-registry', () => ({
  getBrandIcon: (tag: string) => {
    const known: Record<string, { url: string; label: string }> = {
      react: { url: '/icons/react.svg', label: 'React' },
      typescript: { url: '/icons/ts.svg', label: 'TypeScript' },
      node: { url: '/icons/node.svg', label: 'Node.js' },
      python: { url: '/icons/python.svg', label: 'Python' },
      go: { url: '/icons/go.svg', label: 'Go' },
      docker: { url: '/icons/docker.svg', label: 'Docker' },
    };
    return known[tag] ?? null;
  },
  getProviderBrandIcon: (provider: string) => {
    const known: Record<string, { url: string; label: string }> = {
      aws: { url: '/icons/aws.svg', label: 'AWS' },
      gcp: { url: '/icons/gcp.svg', label: 'GCP' },
      // 'azure' deliberately missing — exercises the text-fallback branch
    };
    return known[provider] ?? null;
  },
}));

import {
  ProviderLogos,
  TechStackLogos,
  DifficultyDots,
  TrustBadge,
  type ProviderLogosProps,
  type TechStackLogosProps,
  type DifficultyDotsProps,
  type TrustBadgeProps,
} from '../badges';

// ─── Tree-walker helpers ──────────────────────────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  if (typeof el.type === 'function') {
    try {
      const FC = el.type as (props: unknown) => React.ReactNode;
      yield* walk(FC(el.props) as ReactNodeLike);
    } catch {
      /* skip */
    }
    return;
  }
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

// ─── Render helpers ───────────────────────────────────────────────────────

function renderProviders(props: ProviderLogosProps): React.ReactElement | null {
  return (ProviderLogos as unknown as (p: ProviderLogosProps) => React.ReactElement | null)(props);
}

function renderTech(props: TechStackLogosProps): React.ReactElement | null {
  return (TechStackLogos as unknown as (p: TechStackLogosProps) => React.ReactElement | null)(props);
}

function renderDots(props: DifficultyDotsProps): React.ReactElement | null {
  return (DifficultyDots as unknown as (p: DifficultyDotsProps) => React.ReactElement | null)(props);
}

function renderTrust(props: TrustBadgeProps): React.ReactElement | null {
  return (TrustBadge as unknown as (p: TrustBadgeProps) => React.ReactElement | null)(props);
}

// ─── ProviderLogos ────────────────────────────────────────────────────────

describe('ProviderLogos', () => {
  it('returns null when providers is undefined', () => {
    expect(renderProviders({})).toBeNull();
  });

  it('returns null when providers is an empty array', () => {
    expect(renderProviders({ providers: [] })).toBeNull();
  });

  it('renders an <img> for each known provider', () => {
    const tree = renderProviders({ providers: ['aws', 'gcp'] });
    const imgs = findByPredicate(tree, (el) => el.type === 'img');
    expect(imgs).toHaveLength(2);
    expect((imgs[0].props as { src: string }).src).toBe('/icons/aws.svg');
    expect((imgs[0].props as { alt: string }).alt).toBe('AWS');
    expect((imgs[1].props as { src: string }).src).toBe('/icons/gcp.svg');
  });

  it('falls back to a text chip for unknown providers', () => {
    const tree = renderProviders({ providers: ['azure'] });
    const imgs = findByPredicate(tree, (el) => el.type === 'img');
    expect(imgs).toHaveLength(0);
    const chips = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('uppercase'),
    );
    expect(chips).toHaveLength(1);
    expect((chips[0].props as { children: unknown }).children).toBe('azure');
  });

  it('mixes images and text fallbacks in order when providers mix known/unknown', () => {
    const tree = renderProviders({ providers: ['aws', 'azure', 'gcp'] });
    const imgs = findByPredicate(tree, (el) => el.type === 'img');
    expect(imgs).toHaveLength(2);
    const chips = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('uppercase'),
    );
    expect(chips).toHaveLength(1);
    expect((chips[0].props as { children: unknown }).children).toBe('azure');
  });

  it('renders each img at the default size 16x16', () => {
    const tree = renderProviders({ providers: ['aws'] });
    const img = findByPredicate(tree, (el) => el.type === 'img')[0];
    expect((img.props as { width: number }).width).toBe(16);
    expect((img.props as { height: number }).height).toBe(16);
    expect((img.props as { className: string }).className).toContain('shrink-0');
    expect((img.props as { className: string }).className).toContain('opacity-70');
  });

  it('respects an explicit size prop', () => {
    const tree = renderProviders({ providers: ['aws'], size: 24 });
    const img = findByPredicate(tree, (el) => el.type === 'img')[0];
    expect((img.props as { width: number }).width).toBe(24);
    expect((img.props as { height: number }).height).toBe(24);
  });

  it('keys each entry by its provider id', () => {
    const tree = renderProviders({ providers: ['aws', 'azure'] });
    const img = findByPredicate(tree, (el) => el.type === 'img')[0];
    expect(img.key).toBe('aws');
    const chip = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('uppercase'),
    )[0];
    expect(chip.key).toBe('azure');
  });
});

// ─── TechStackLogos ───────────────────────────────────────────────────────

describe('TechStackLogos', () => {
  it('returns null when no tags resolve to a brand icon', () => {
    expect(renderTech({ tags: [] })).toBeNull();
    expect(renderTech({ tags: ['unknown-thing'] })).toBeNull();
  });

  it('renders one img per resolved tag with the brand url + label', () => {
    const tree = renderTech({ tags: ['react', 'typescript'] });
    const imgs = findByPredicate(tree, (el) => el.type === 'img');
    expect(imgs).toHaveLength(2);
    expect((imgs[0].props as { src: string }).src).toBe('/icons/react.svg');
    expect((imgs[0].props as { alt: string }).alt).toBe('React');
    expect((imgs[0].props as { title: string }).title).toBe('React');
    expect((imgs[1].props as { src: string }).src).toBe('/icons/ts.svg');
  });

  it('skips tags that getBrandIcon returns null for', () => {
    const tree = renderTech({ tags: ['react', 'unknown', 'typescript'] });
    const imgs = findByPredicate(tree, (el) => el.type === 'img');
    expect(imgs).toHaveLength(2);
    expect((imgs[0].props as { src: string }).src).toBe('/icons/react.svg');
    expect((imgs[1].props as { src: string }).src).toBe('/icons/ts.svg');
  });

  it('caps the strip at the default `max` (5)', () => {
    const tree = renderTech({ tags: ['react', 'typescript', 'node', 'python', 'go', 'docker'] });
    const imgs = findByPredicate(tree, (el) => el.type === 'img');
    expect(imgs).toHaveLength(5);
  });

  it('respects an explicit `max` cap', () => {
    const tree = renderTech({ tags: ['react', 'typescript', 'node'], max: 2 });
    const imgs = findByPredicate(tree, (el) => el.type === 'img');
    expect(imgs).toHaveLength(2);
  });

  it('renders each img at 18x18 with the shrink-0 class', () => {
    const tree = renderTech({ tags: ['react'] });
    const img = findByPredicate(tree, (el) => el.type === 'img')[0];
    expect((img.props as { width: number }).width).toBe(18);
    expect((img.props as { height: number }).height).toBe(18);
    expect((img.props as { className: string }).className).toContain('shrink-0');
  });

  it('keys each img by its tag', () => {
    const tree = renderTech({ tags: ['react', 'typescript'] });
    const imgs = findByPredicate(tree, (el) => el.type === 'img');
    expect(imgs[0].key).toBe('react');
    expect(imgs[1].key).toBe('typescript');
  });
});

// ─── DifficultyDots ───────────────────────────────────────────────────────

describe('DifficultyDots', () => {
  it('renders a span at the root with title from the matching tier label', () => {
    const tree = renderDots({ level: 'starter' });
    expect(tree).not.toBeNull();
    expect(tree!.type).toBe('span');
    expect((tree!.props as { title: string }).title).toBe('templates.gallery.difficultyStarter');
  });

  it('lights 1 dot for starter', () => {
    const tree = renderDots({ level: 'starter' });
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    expect(dots).toHaveLength(4);
    const lit = dots.filter((d) => (d.props as { className: string }).className.includes('bg-ice-accent'));
    const dim = dots.filter((d) => (d.props as { className: string }).className.includes('bg-ice-border'));
    expect(lit).toHaveLength(1);
    expect(dim).toHaveLength(3);
  });

  it('lights 2 dots for intermediate', () => {
    const tree = renderDots({ level: 'intermediate' });
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    const lit = dots.filter((d) => (d.props as { className: string }).className.includes('bg-ice-accent'));
    expect(lit).toHaveLength(2);
  });

  it('lights 3 dots for advanced', () => {
    const tree = renderDots({ level: 'advanced' });
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    const lit = dots.filter((d) => (d.props as { className: string }).className.includes('bg-ice-accent'));
    expect(lit).toHaveLength(3);
  });

  it('lights 4 dots for expert', () => {
    const tree = renderDots({ level: 'expert' });
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    const lit = dots.filter((d) => (d.props as { className: string }).className.includes('bg-ice-accent'));
    expect(lit).toHaveLength(4);
  });

  it('falls back to starter when level is undefined', () => {
    const tree = renderDots({});
    expect((tree!.props as { title: string }).title).toBe('templates.gallery.difficultyStarter');
  });

  it('falls back to starter when level is unknown (|| chain)', () => {
    const tree = renderDots({ level: 'wizard' });
    expect((tree!.props as { title: string }).title).toBe('templates.gallery.difficultyStarter');
  });

  it('uses the web-specific 1.5 dot sizing', () => {
    const tree = renderDots({ level: 'starter' });
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    expect((dots[0].props as { className: string }).className).toContain('w-1.5');
    expect((dots[0].props as { className: string }).className).toContain('h-1.5');
  });
});

// ─── TrustBadge ───────────────────────────────────────────────────────────

describe('TrustBadge', () => {
  it('returns null when trust is undefined', () => {
    expect(renderTrust({})).toBeNull();
  });

  it("returns null when trust is 'community'", () => {
    expect(renderTrust({ trust: 'community' })).toBeNull();
  });

  it("renders 'official' label with the accent palette", () => {
    const tree = renderTrust({ trust: 'official' });
    expect(tree).not.toBeNull();
    expect(tree!.type).toBe('span');
    expect((tree!.props as { children: unknown }).children).toBe('templates.gallery.official');
    const cls = (tree!.props as { className: string }).className;
    expect(cls).toContain('bg-ice-accent/15');
    expect(cls).toContain('text-ice-accent');
  });

  it("renders 'verified' label with the emerald palette", () => {
    const tree = renderTrust({ trust: 'verified' });
    expect((tree!.props as { children: unknown }).children).toBe('templates.gallery.verified');
    const cls = (tree!.props as { className: string }).className;
    expect(cls).toContain('bg-emerald-500/15');
    expect(cls).toContain('text-emerald-400');
  });

  it("falls through to 'verified' palette + label for any non-'official' truthy non-'community' value", () => {
    const tree = renderTrust({ trust: 'partner' });
    expect(tree).not.toBeNull();
    expect((tree!.props as { children: unknown }).children).toBe('templates.gallery.verified');
    const cls = (tree!.props as { className: string }).className;
    expect(cls).toContain('bg-emerald-500/15');
  });

  it('uses the web-specific px-1.5 py-0.5 sizing', () => {
    const tree = renderTrust({ trust: 'official' });
    const cls = (tree!.props as { className: string }).className;
    expect(cls).toContain('px-1.5');
    expect(cls).toContain('py-0.5');
  });
});
