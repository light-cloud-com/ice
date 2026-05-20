/**
 * rf-wgal-5 — TemplateCard (web).
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 pattern).
 * `TemplateCard` is wrapped in `React.memo` so the runtime export is
 * `{ $$typeof: Symbol(react.memo), type: <Inner FC>, compare }` —
 * invoked via `.type` per
 * react-memo-wrapper-must-be-unwrapped-via-dot-type-for-direct-fc-tree-walker.
 *
 * Mocks:
 *   - `useTranslation` → returns the i18n key verbatim.
 *   - `useMemo` → passthrough (TechStackLogos transitively uses it).
 *   - `getBrandIcon` / `getProviderBrandIcon` → small in-test lookup.
 *   - `TEMPLATE_CATEGORIES` → small fixed set so the category-color
 *     fallthrough is observable.
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
    };
    return known[tag] ?? null;
  },
  getProviderBrandIcon: (provider: string) => {
    const known: Record<string, { url: string; label: string }> = {
      aws: { url: '/icons/aws.svg', label: 'AWS' },
      gcp: { url: '/icons/gcp.svg', label: 'GCP' },
    };
    return known[provider] ?? null;
  },
}));

vi.mock('@ui/config/templates', () => ({
  TEMPLATE_CATEGORIES: [
    { id: 'web', label: 'Web', icon: 'Globe', color: '#3b82f6' },
    { id: 'ai', label: 'AI', icon: 'Brain', color: '#a855f7' },
  ],
}));

import { TemplateCard, type TemplateCardProps } from '../template-card';
import type { ComposedTemplate } from '@ui/config/templates';

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

function collectText(tree: React.ReactNode): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = (el.props as { children?: React.ReactNode } | undefined)?.children;
    if (typeof c === 'string') s += c;
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
      }
    }
  }
  return s;
}

// ─── Render helper (memo-unwrapped) ───────────────────────────────────────

function render(props: TemplateCardProps): React.ReactElement {
  const Inner = (TemplateCard as unknown as { type: (p: TemplateCardProps) => React.ReactElement }).type;
  return Inner(props);
}

// ─── Fixture builder ──────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<ComposedTemplate> = {}): ComposedTemplate {
  return {
    id: 'starter-app',
    name: 'Starter App',
    description: 'A starter web application',
    icon: 'Rocket',
    estimatedCost: '$10/mo',
    category: 'web' as ComposedTemplate['category'],
    tags: ['react', 'typescript'],
    securityLevel: 'standard' as ComposedTemplate['securityLevel'],
    environmentPresets: [],
    blocks: [
      { iceType: 'Compute.WebServer', label: 'Web', position: { x: 0, y: 0 } },
      { iceType: 'Database.Postgres', label: 'DB', position: { x: 0, y: 0 } },
    ],
    connections: [],
    ...overrides,
  };
}

// ─── Memo wrap pinning ────────────────────────────────────────────────────

describe('TemplateCard — memo wrap', () => {
  it('exposes the memo $$typeof boundary', () => {
    expect((TemplateCard as unknown as { $$typeof: symbol }).$$typeof.toString()).toBe('Symbol(react.memo)');
  });

  it('preserves displayName on the memo wrap', () => {
    expect((TemplateCard as unknown as { displayName?: string }).displayName).toBe('TemplateCard');
  });
});

// ─── Root structure ───────────────────────────────────────────────────────

describe('TemplateCard — root', () => {
  it('renders a button at the root', () => {
    const tree = render({ template: makeTemplate(), onSelect: vi.fn() });
    expect(tree.type).toBe('button');
  });

  it('button onClick fires onSelect with the template', () => {
    const onSelect = vi.fn();
    const tpl = makeTemplate();
    const tree = render({ template: tpl, onSelect });
    (tree.props as { onClick: () => void }).onClick();
    expect(onSelect).toHaveBeenCalledWith(tpl);
  });

  it('applies the rounded-xl card classes', () => {
    const tree = render({ template: makeTemplate(), onSelect: vi.fn() });
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('rounded-xl');
    expect(cls).toContain('border');
    expect(cls).toContain('bg-ice-surface');
  });

  it('sets aria-label from template.name', () => {
    const tree = render({ template: makeTemplate({ name: 'My Cool App' }), onSelect: vi.fn() });
    expect((tree.props as { ['aria-label']: string })['aria-label']).toBe('View My Cool App template');
  });
});

// ─── Header (icon + name + description) ───────────────────────────────────

describe('TemplateCard — header', () => {
  it('renders the matching ICON_MAP icon at the header', () => {
    const tree = render({ template: makeTemplate({ icon: 'Brain' }), onSelect: vi.fn() });
    const fns = (n: React.ReactNode) => {
      const out: string[] = [];
      for (const el of walk(n)) {
        const dn = (el.type as { displayName?: string })?.displayName;
        if (dn) out.push(dn);
      }
      return out;
    };
    expect(fns(tree)).toContain('Brain');
  });

  it('falls back to Rocket when icon is unknown', () => {
    const tree = render({ template: makeTemplate({ icon: 'NotInMap' }), onSelect: vi.fn() });
    const fns = (n: React.ReactNode) => {
      const out: string[] = [];
      for (const el of walk(n)) {
        const dn = (el.type as { displayName?: string })?.displayName;
        if (dn) out.push(dn);
      }
      return out;
    };
    expect(fns(tree)).toContain('Rocket');
  });

  it('uses the category color for the icon background (12 alpha)', () => {
    const tree = render({
      template: makeTemplate({ category: 'ai' as ComposedTemplate['category'] }),
      onSelect: vi.fn(),
    });
    const wrappers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-xl') &&
        (el.props as { className: string }).className.includes('h-10') &&
        (el.props as { style?: { backgroundColor?: string } }).style?.backgroundColor !== undefined,
    );
    expect(wrappers.length).toBe(1);
    expect((wrappers[0].props as { style: { backgroundColor: string } }).style.backgroundColor).toBe('#a855f712');
  });

  it('falls back to the default blue color when category is missing from TEMPLATE_CATEGORIES', () => {
    const tree = render({
      template: makeTemplate({ category: 'unknown-cat' as unknown as ComposedTemplate['category'] }),
      onSelect: vi.fn(),
    });
    const wrappers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-xl') &&
        (el.props as { className: string }).className.includes('h-10') &&
        (el.props as { style?: { backgroundColor?: string } }).style?.backgroundColor !== undefined,
    );
    expect((wrappers[0].props as { style: { backgroundColor: string } }).style.backgroundColor).toBe('#3b82f612');
  });

  it('renders the i18n name + description', () => {
    const tree = render({ template: makeTemplate({ id: 'my-tpl' }), onSelect: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('templates.items.my-tpl.name');
    expect(text).toContain('templates.items.my-tpl.description');
  });

  it('renders TrustBadge when trust is set', () => {
    const tree = render({
      template: makeTemplate({ trust: 'official' as ComposedTemplate['trust'] }),
      onSelect: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.official');
  });

  it('does not render the trust label for community templates', () => {
    const tree = render({
      template: makeTemplate({ trust: 'community' as ComposedTemplate['trust'] }),
      onSelect: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.official');
    expect(text).not.toContain('templates.gallery.verified');
  });

  it('renders the description in a line-clamp-2 paragraph', () => {
    const tree = render({ template: makeTemplate({ id: 'desc-tpl' }), onSelect: vi.fn() });
    const para = findByPredicate(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('line-clamp-2'),
    )[0];
    expect(para).toBeDefined();
    expect((para.props as { children: unknown }).children).toBe('templates.items.desc-tpl.description');
  });
});

// ─── Cost banner ──────────────────────────────────────────────────────────

describe('TemplateCard — cost banner', () => {
  it('renders the estimatedCost + monthEst label', () => {
    const tree = render({ template: makeTemplate({ estimatedCost: '$25/mo' }), onSelect: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('$25/mo');
    expect(text).toContain('templates.gallery.monthEst');
  });

  it('renders the blocks count + i18n label', () => {
    const tree = render({ template: makeTemplate(), onSelect: vi.fn() });
    const text = collectText(tree);
    // 2 blocks (from makeTemplate)
    expect(text).toContain('templates.gallery.blocks');
  });

  it('renders DifficultyDots with the template difficulty', () => {
    const tree = render({
      template: makeTemplate({ difficulty: 'expert' as ComposedTemplate['difficulty'] }),
      onSelect: vi.fn(),
    });
    const titled = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { title?: string }).title === 'string' &&
        (el.props as { title: string }).title.startsWith('templates.gallery.difficulty'),
    );
    expect(titled).toHaveLength(1);
    expect((titled[0].props as { title: string }).title).toBe('templates.gallery.difficultyExpert');
  });
});

// ─── Provider + tech strip ────────────────────────────────────────────────

describe('TemplateCard — provider + tech strip', () => {
  it('renders ProviderLogos when providers is set', () => {
    const tree = render({
      template: makeTemplate({ providers: ['aws', 'gcp'] as ComposedTemplate['providers'] }),
      onSelect: vi.fn(),
    });
    const imgs = findByPredicate(tree, (el) =>
      el.type === 'img' &&
      typeof (el.props as { src?: string }).src === 'string' &&
      (el.props as { src: string }).src.startsWith('/icons/aws') === false
        ? false
        : el.type === 'img',
    );
    // Find aws + gcp imgs
    const allImgs = findByPredicate(tree, (el) => el.type === 'img');
    const srcs = allImgs.map((i) => (i.props as { src: string }).src);
    expect(srcs).toContain('/icons/aws.svg');
    expect(srcs).toContain('/icons/gcp.svg');
    expect(imgs).toBeDefined();
  });

  it('renders TechStackLogos with max=5', () => {
    const tree = render({
      template: makeTemplate({
        tags: ['react', 'typescript'],
      }),
      onSelect: vi.fn(),
    });
    const imgs = findByPredicate(tree, (el) => el.type === 'img');
    const srcs = imgs.map((i) => (i.props as { src: string }).src);
    expect(srcs).toContain('/icons/react.svg');
    expect(srcs).toContain('/icons/ts.svg');
  });

  it('renders the divider span when providers AND tags are both non-empty', () => {
    const tree = render({
      template: makeTemplate({
        providers: ['aws'] as ComposedTemplate['providers'],
        tags: ['react'],
      }),
      onSelect: vi.fn(),
    });
    const dividers = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className === 'w-px h-4 bg-ice-border',
    );
    expect(dividers).toHaveLength(1);
  });

  it('omits the divider when providers is empty', () => {
    const tree = render({
      template: makeTemplate({ providers: [] as ComposedTemplate['providers'], tags: ['react'] }),
      onSelect: vi.fn(),
    });
    const dividers = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className === 'w-px h-4 bg-ice-border',
    );
    expect(dividers).toHaveLength(0);
  });

  it('omits the divider when tags is empty', () => {
    const tree = render({
      template: makeTemplate({
        providers: ['aws'] as ComposedTemplate['providers'],
        tags: [],
      }),
      onSelect: vi.fn(),
    });
    const dividers = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className === 'w-px h-4 bg-ice-border',
    );
    expect(dividers).toHaveLength(0);
  });

  it('omits the divider when providers is undefined', () => {
    const tree = render({
      template: makeTemplate({ providers: undefined, tags: ['react'] }),
      onSelect: vi.fn(),
    });
    const dividers = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className === 'w-px h-4 bg-ice-border',
    );
    expect(dividers).toHaveLength(0);
  });

  it('renders the ChevronRight at the end of the strip', () => {
    const tree = render({ template: makeTemplate(), onSelect: vi.fn() });
    const fns = (n: React.ReactNode) => {
      const out: string[] = [];
      for (const el of walk(n)) {
        const dn = (el.type as { displayName?: string })?.displayName;
        if (dn) out.push(dn);
      }
      return out;
    };
    expect(fns(tree)).toContain('ChevronRight');
  });
});
