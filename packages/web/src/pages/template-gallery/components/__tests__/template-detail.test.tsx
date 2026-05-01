/**
 * rf-wgal-6 — TemplateDetail (web).
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 pattern).
 * Mocks `useTranslation` to return the i18n key verbatim, `useMemo`
 * passthrough, `getBrandIcon`/`getProviderBrandIcon` to a small
 * in-test lookup, and `TEMPLATE_CATEGORIES` to a small fixed set so
 * the category-color fallthrough is observable.
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

vi.mock('@ui/config/templates', () => ({
  TEMPLATE_CATEGORIES: [
    { id: 'web', label: 'Web', icon: 'Globe', color: '#3b82f6' },
    { id: 'ai', label: 'AI', icon: 'Brain', color: '#a855f7' },
  ],
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
    };
    return known[provider] ?? null;
  },
}));

import { TemplateDetail, type TemplateDetailProps } from '../template-detail';
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

function render(props: TemplateDetailProps): React.ReactElement {
  return (TemplateDetail as unknown as (p: TemplateDetailProps) => React.ReactElement)(props);
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

// ─── Root structure ───────────────────────────────────────────────────────

describe('TemplateDetail — root', () => {
  it('renders a div at the root with the surface classes', () => {
    const tree = render({ template: makeTemplate(), onClose: vi.fn(), onUse: vi.fn() });
    expect(tree.type).toBe('div');
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('h-full');
    expect(cls).toContain('flex-col');
    expect(cls).toContain('border-l');
    expect(cls).toContain('bg-ice-surface');
  });
});

// ─── Header (icon + name + trust + category chip + close) ─────────────────

describe('TemplateDetail — header', () => {
  it('renders the matching ICON_MAP icon when known', () => {
    const tree = render({
      template: makeTemplate({ icon: 'Brain' }),
      onClose: vi.fn(),
      onUse: vi.fn(),
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
      onClose: vi.fn(),
      onUse: vi.fn(),
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

  it('uses category color (15 alpha) for the icon background wrapper', () => {
    const tree = render({
      template: makeTemplate({ category: 'ai' as ComposedTemplate['category'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const wrappers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('h-11') &&
        (el.props as { className: string }).className.includes('w-11'),
    );
    expect(wrappers.length).toBe(1);
    expect((wrappers[0].props as { style: { backgroundColor: string } }).style.backgroundColor).toBe('#a855f715');
  });

  it('falls back to default blue when category is missing', () => {
    const tree = render({
      template: makeTemplate({ category: 'unknown' as unknown as ComposedTemplate['category'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const wrappers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('h-11'),
    );
    expect((wrappers[0].props as { style: { backgroundColor: string } }).style.backgroundColor).toBe('#3b82f615');
  });

  it('renders the category chip when catMeta exists', () => {
    const tree = render({
      template: makeTemplate({ category: 'ai' as ComposedTemplate['category'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('AI');
  });

  it('omits the category chip when catMeta is missing', () => {
    const tree = render({
      template: makeTemplate({ category: 'unknown' as unknown as ComposedTemplate['category'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const chips = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded font-medium') &&
        (el.props as { style?: { color?: string } }).style?.color !== undefined,
    );
    expect(chips).toHaveLength(0);
  });

  it('renders the i18n title in the h2', () => {
    const tree = render({
      template: makeTemplate({ id: 'my-tpl' }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const h2 = findByPredicate(tree, (el) => el.type === 'h2')[0];
    expect((h2.props as { children: unknown }).children).toBe('templates.items.my-tpl.name');
  });

  it('close button fires onClose', () => {
    const onClose = vi.fn();
    const tree = render({ template: makeTemplate(), onClose, onUse: vi.fn() });
    const closeBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { ['aria-label']?: string })['aria-label'] === 'string' &&
        (el.props as { ['aria-label']: string })['aria-label'] === 'common.buttons.close',
    );
    expect(closeBtns).toHaveLength(1);
    (closeBtns[0].props as { onClick: () => void }).onClick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders TrustBadge when trust is set', () => {
    const tree = render({
      template: makeTemplate({ trust: 'verified' as ComposedTemplate['trust'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.verified');
  });
});

// ─── Stats grid ───────────────────────────────────────────────────────────

describe('TemplateDetail — stats grid', () => {
  it('renders the cost cell with capitalize class', () => {
    const tree = render({
      template: makeTemplate({ estimatedCost: '$25/mo' }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const valueDivs = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('capitalize'),
    );
    expect(valueDivs).toHaveLength(2);
    // First is cost, second is difficulty label
    expect((valueDivs[0].props as { children: unknown }).children).toBe('$25/mo');
  });

  it('renders the difficulty label in the second cell', () => {
    const tree = render({
      template: makeTemplate({ difficulty: 'expert' as ComposedTemplate['difficulty'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const valueDivs = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('capitalize'),
    );
    expect((valueDivs[1].props as { children: unknown }).children).toBe('templates.gallery.difficultyExpert');
  });

  it('falls back to starter when difficulty is undefined', () => {
    const tree = render({
      template: makeTemplate({ difficulty: undefined }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const valueDivs = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('capitalize'),
    );
    expect((valueDivs[1].props as { children: unknown }).children).toBe('templates.gallery.difficultyStarter');
  });

  it('falls back to starter when difficulty is unknown', () => {
    const tree = render({
      template: makeTemplate({ difficulty: 'wizard' as unknown as ComposedTemplate['difficulty'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const valueDivs = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('capitalize'),
    );
    expect((valueDivs[1].props as { children: unknown }).children).toBe('templates.gallery.difficultyStarter');
  });
});

// ─── Providers section ────────────────────────────────────────────────────

describe('TemplateDetail — providers', () => {
  it('omits the providers section when providers is undefined', () => {
    const tree = render({
      template: makeTemplate({ providers: undefined }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.providers');
  });

  it('omits the providers section when providers is empty', () => {
    const tree = render({
      template: makeTemplate({ providers: [] as ComposedTemplate['providers'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.providers');
  });

  it('renders one chip per provider with brand img when known', () => {
    const tree = render({
      template: makeTemplate({ providers: ['aws'] as ComposedTemplate['providers'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.providers');
    const imgs = findByPredicate(
      tree,
      (el) => el.type === 'img' && (el.props as { width?: number }).width === 16,
    );
    expect(imgs).toHaveLength(1);
    expect((imgs[0].props as { src: string }).src).toBe('/icons/aws.svg');
  });

  it('renders the chip without img when getProviderBrandIcon returns null', () => {
    const tree = render({
      template: makeTemplate({ providers: ['azure'] as ComposedTemplate['providers'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const imgs = findByPredicate(
      tree,
      (el) => el.type === 'img' && (el.props as { width?: number }).width === 16,
    );
    expect(imgs).toHaveLength(0);
    const text = collectText(tree);
    expect(text).toContain('azure');
  });
});

// ─── Compliance section ───────────────────────────────────────────────────

describe('TemplateDetail — compliance', () => {
  it('omits the compliance section when compliance is undefined', () => {
    const tree = render({
      template: makeTemplate({ compliance: undefined }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.compliance');
  });

  it('omits the compliance section when compliance is empty', () => {
    const tree = render({
      template: makeTemplate({ compliance: [] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.compliance');
  });

  it('renders one chip per compliance tag', () => {
    const tree = render({
      template: makeTemplate({
        compliance: ['soc2', 'hipaa'] as ComposedTemplate['compliance'],
      }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const chips = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-emerald-500/10') &&
        (el.props as { className: string }).className.includes('uppercase'),
    );
    expect(chips).toHaveLength(2);
    expect((chips[0].props as { children: unknown }).children).toBe('soc2');
    expect((chips[1].props as { children: unknown }).children).toBe('hipaa');
  });
});

// ─── Resources (blocksByCategory + connections + groups) ──────────────────

describe('TemplateDetail — resources', () => {
  it('renders one row per block category prefix', () => {
    const tree = render({
      template: makeTemplate({
        blocks: [
          { iceType: 'Compute.WebServer', label: 'Web', position: { x: 0, y: 0 } },
          { iceType: 'Compute.Worker', label: 'Worker', position: { x: 0, y: 0 } },
          { iceType: 'Database.Postgres', label: 'DB', position: { x: 0, y: 0 } },
        ],
      }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    // Two prefixes: Compute, Database
    expect(text).toContain('blocks.categories.compute.label');
    expect(text).toContain('blocks.categories.database.label');
  });

  it('renders the block labels joined by comma', () => {
    const tree = render({
      template: makeTemplate({
        blocks: [
          { iceType: 'Compute.WebServer', label: 'Web', position: { x: 0, y: 0 } },
          { iceType: 'Compute.Worker', label: 'Worker', position: { x: 0, y: 0 } },
        ],
      }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const labelSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className === 'text-ice-text-3' &&
        typeof (el.props as { children?: string }).children === 'string',
    );
    const joined = labelSpans.find((s) => (s.props as { children: string }).children === 'Web, Worker');
    expect(joined).toBeDefined();
  });

  it('renders the connections count row (always present)', () => {
    const tree = render({
      template: makeTemplate({
        connections: [
          { fromBlock: 0, toBlock: 1, relationship: 'depends_on' },
          { fromBlock: 1, toBlock: 0, relationship: 'reads' },
        ],
      }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.connections');
  });

  it('renders the groups count row when groups is non-empty', () => {
    const tree = render({
      template: makeTemplate({
        groups: [
          {
            subtype: 'Frontend',
            label: 'Group 1',
            position: { x: 0, y: 0 },
            width: 200,
            height: 200,
            blockIndices: [0],
          },
        ] as ComposedTemplate['groups'],
      }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.groups');
  });

  it('omits the groups row when groups is undefined', () => {
    const tree = render({
      template: makeTemplate({ groups: undefined }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.groups');
  });

  it('omits the groups row when groups is empty', () => {
    const tree = render({
      template: makeTemplate({ groups: [] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.groups');
  });
});

// ─── Environment presets ──────────────────────────────────────────────────

describe('TemplateDetail — environment presets', () => {
  it('omits the environments section when environmentPresets is empty', () => {
    const tree = render({
      template: makeTemplate({ environmentPresets: [] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.environmentPresets');
  });

  it('renders one chip per environment preset', () => {
    const tree = render({
      template: makeTemplate({
        environmentPresets: [
          { type: 'production', name: 'prod', region: 'us-east-1', securityLevel: 'standard' },
          { type: 'staging', name: 'staging', region: 'eu-west-1', securityLevel: 'standard' },
        ] as ComposedTemplate['environmentPresets'],
      }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.environmentPresets');
    expect(text).toContain('prod');
    expect(text).toContain('staging');
    expect(text).toContain('us-east-1');
    expect(text).toContain('eu-west-1');
  });
});

// ─── Tech stack chips ─────────────────────────────────────────────────────

describe('TemplateDetail — tech stack', () => {
  it('omits the tech stack section when tags is empty', () => {
    const tree = render({
      template: makeTemplate({ tags: [] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.techStack');
  });

  it('renders one chip per tag with brand img when known', () => {
    const tree = render({
      template: makeTemplate({ tags: ['react', 'typescript'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.techStack');
    expect(text).toContain('react');
    expect(text).toContain('typescript');
    const imgs = findByPredicate(
      tree,
      (el) => el.type === 'img' && (el.props as { width?: number }).width === 12,
    );
    expect(imgs).toHaveLength(2);
    expect((imgs[0].props as { src: string }).src).toBe('/icons/react.svg');
  });

  it('renders chips without img when getBrandIcon returns null', () => {
    const tree = render({
      template: makeTemplate({ tags: ['rust'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const imgs = findByPredicate(
      tree,
      (el) => el.type === 'img' && (el.props as { width?: number }).width === 12,
    );
    expect(imgs).toHaveLength(0);
    const text = collectText(tree);
    expect(text).toContain('rust');
  });
});

// ─── Repo link ────────────────────────────────────────────────────────────

describe('TemplateDetail — repo', () => {
  it('omits the repo link when repo is undefined', () => {
    const tree = render({
      template: makeTemplate({ repo: undefined }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const anchors = findByPredicate(tree, (el) => el.type === 'a');
    expect(anchors).toHaveLength(0);
  });

  it('renders an anchor with target=_blank when repo is set', () => {
    const tree = render({
      template: makeTemplate({ repo: { url: 'https://github.com/x/y' } as ComposedTemplate['repo'] }),
      onClose: vi.fn(),
      onUse: vi.fn(),
    });
    const anchors = findByPredicate(tree, (el) => el.type === 'a');
    expect(anchors).toHaveLength(1);
    expect((anchors[0].props as { href: string }).href).toBe('https://github.com/x/y');
    expect((anchors[0].props as { target: string }).target).toBe('_blank');
    expect((anchors[0].props as { rel: string }).rel).toBe('noopener noreferrer');
  });
});

// ─── Action button ────────────────────────────────────────────────────────

describe('TemplateDetail — action button', () => {
  it('renders a sticky bottom button with the wizard label', () => {
    const tree = render({ template: makeTemplate(), onClose: vi.fn(), onUse: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('wizard.createButton');
  });

  it('action button onClick fires onUse with the template', () => {
    const onUse = vi.fn();
    const tpl = makeTemplate();
    const tree = render({ template: tpl, onClose: vi.fn(), onUse });
    const useBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-ice-accent') &&
        (el.props as { className: string }).className.includes('w-full'),
    );
    expect(useBtns).toHaveLength(1);
    (useBtns[0].props as { onClick: () => void }).onClick();
    expect(onUse).toHaveBeenCalledWith(tpl);
  });
});
