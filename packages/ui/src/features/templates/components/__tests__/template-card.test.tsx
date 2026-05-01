/**
 * rf-tgal-4 — TemplateCard.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 pattern).
 * `TemplateCard` is wrapped in `React.memo` so the runtime export is
 * `{ $$typeof: Symbol(react.memo), type: <Inner FC>, compare }` rather
 * than a plain function — invoked via `.type` per
 * react-memo-wrapper-must-be-unwrapped-via-dot-type-for-direct-fc-tree-walker.
 *
 * Mocks:
 *   - `useTranslation` → returns the i18n key verbatim.
 *   - `useMemo` → passthrough (TechStackLogos transitively uses it).
 *   - `getBrandIcon` → small in-test lookup.
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

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../assets/icons/brand-registry', () => ({
  getBrandIcon: (tag: string) => {
    const known: Record<string, { url: string; label: string }> = {
      react: { url: '/icons/react.svg', label: 'React' },
      typescript: { url: '/icons/ts.svg', label: 'TypeScript' },
    };
    return known[tag] ?? null;
  },
}));

vi.mock('../../../../config/templates', () => ({
  TEMPLATE_CATEGORIES: [
    { id: 'web', label: 'Web', icon: 'Globe', color: '#3b82f6' },
    { id: 'ai', label: 'AI', icon: 'Brain', color: '#a855f7' },
  ],
}));

import { TemplateCard, type TemplateCardProps } from '../template-card';
import type { ComposedTemplate } from '../../../../config/templates';

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

function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
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
  // React.memo wraps the FC into an object — unwrap via .type per
  // the rf-pdpl-13 learning.
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
});

// ─── Header (icon + name + cost + chevron) ────────────────────────────────

describe('TemplateCard — header', () => {
  it('renders the matching ICON_MAP icon at the header', () => {
    const tree = render({
      template: makeTemplate({ icon: 'Brain' }),
      onSelect: vi.fn(),
    });
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
    const tree = render({
      template: makeTemplate({ icon: 'NotInMap' }),
      onSelect: vi.fn(),
    });
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

  it('uses the category color for the icon background', () => {
    const tree = render({
      template: makeTemplate({ category: 'ai' as ComposedTemplate['category'] }),
      onSelect: vi.fn(),
    });
    const wrappers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-lg') &&
        (el.props as { style?: { backgroundColor?: string } }).style?.backgroundColor !== undefined,
    );
    expect(wrappers.length).toBeGreaterThan(0);
    expect((wrappers[0].props as { style: { backgroundColor: string } }).style.backgroundColor).toBe('#a855f715');
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
        (el.props as { className: string }).className.includes('rounded-lg') &&
        (el.props as { style?: { backgroundColor?: string } }).style?.backgroundColor !== undefined,
    );
    expect((wrappers[0].props as { style: { backgroundColor: string } }).style.backgroundColor).toBe('#3b82f615');
  });

  it('renders the i18n name + estimated-cost label', () => {
    const tree = render({
      template: makeTemplate({ id: 'my-tpl', estimatedCost: '$25/mo' }),
      onSelect: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.items.my-tpl.name');
    expect(text).toContain('$25/mo');
  });

  it('renders the ChevronRight in the header', () => {
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
});

// ─── Description ──────────────────────────────────────────────────────────

describe('TemplateCard — description', () => {
  it('renders the i18n description in a clamp-2 paragraph', () => {
    const tree = render({
      template: makeTemplate({ id: 'desc-tpl' }),
      onSelect: vi.fn(),
    });
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

// ─── Meta row ─────────────────────────────────────────────────────────────

describe('TemplateCard — meta row', () => {
  it('renders the blocks count + i18n key', () => {
    const tree = render({
      template: makeTemplate(), // 2 blocks
      onSelect: vi.fn(),
    });
    const spans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className === 'text-ice-2xs text-ice-text-3',
    );
    // First such span is the blocks-count span. JSX `{2} {label}` puts the
    // number and label as adjacent array children — inspect positionally
    // (per tree-walker-collectText-array-children-fallback-for-jsx-button-text-after-icon
    // which doesn't help for *numeric* children — they're unrelated to the
    // string-array fallback).
    const children = (spans[0].props as { children: unknown[] }).children;
    expect(children[0]).toBe(2);
    expect(children[2]).toBe('templates.gallery.blocks');
  });

  it('omits the connections-count span when connections is empty', () => {
    const tree = render({
      template: makeTemplate({ connections: [] }),
      onSelect: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.connections');
  });

  it('renders the connections count when connections is non-empty', () => {
    const tree = render({
      template: makeTemplate({
        connections: [
          { fromBlock: 0, toBlock: 1, relationship: 'depends_on' },
          { fromBlock: 1, toBlock: 0, relationship: 'reads' },
        ],
      }),
      onSelect: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.connections');
  });

  it('renders the DifficultyDots subcomponent (title attr probes the tier)', () => {
    const tree = render({
      template: makeTemplate({ difficulty: 'expert' as ComposedTemplate['difficulty'] }),
      onSelect: vi.fn(),
    });
    // DifficultyDots' label lives in the wrapper <span>'s `title` attribute,
    // not its children — `collectText` won't see it. Find the wrapper directly.
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

  it('renders the ProviderBadges subcomponent when providers is set', () => {
    const tree = render({
      template: makeTemplate({ providers: ['aws', 'gcp'] as ComposedTemplate['providers'] }),
      onSelect: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('aws');
    expect(text).toContain('gcp');
  });
});

// ─── Tech stack strip ─────────────────────────────────────────────────────

describe('TemplateCard — tech stack', () => {
  it('renders TechStackLogos with max=6', () => {
    const tree = render({
      template: makeTemplate({ tags: ['react', 'typescript'] }),
      onSelect: vi.fn(),
    });
    const imgs = findByPredicate(tree, (el) => el.type === 'img');
    expect(imgs).toHaveLength(2);
    expect((imgs[0].props as { src: string }).src).toBe('/icons/react.svg');
  });
});
