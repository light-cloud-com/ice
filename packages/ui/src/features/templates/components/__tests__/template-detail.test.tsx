/**
 * rf-tgal-5 — TemplateDetail.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 pattern).
 * Mocks `useTranslation` to return the i18n key verbatim, `useMemo`
 * passthrough, `expandComposedTemplate` + `compareProviderCosts` so
 * the provider-cost section is observable, `formatCostRaw` so the
 * formatted-cost cell renders deterministically, and `Badge` /
 * `TEMPLATE_CATEGORIES` to small in-test fixtures.
 *
 * The two `useMemo` blocks (`blocksByCategory` and `providerComparison`)
 * are both passthrough-evaluated — the comparison's catch branch is
 * exercised by stubbing `expandComposedTemplate` to throw.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  expandComposedTemplate: vi.fn(),
  compareProviderCosts: vi.fn(),
  formatCostRaw: vi.fn(),
}));

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

vi.mock('../../../../config/templates', () => ({
  TEMPLATE_CATEGORIES: [
    { id: 'web', label: 'Web', icon: 'Globe', color: '#3b82f6' },
    { id: 'ai', label: 'AI', icon: 'Brain', color: '#a855f7' },
  ],
  expandComposedTemplate: (...args: unknown[]) => mocks.expandComposedTemplate(...args),
}));

vi.mock('../../../../features/cost/utils/cost-calculator', () => ({
  formatCostRaw: (...args: unknown[]) => mocks.formatCostRaw(...args),
}));

vi.mock('../../../../features/cost/utils/provider-pricing', () => ({
  compareProviderCosts: (...args: unknown[]) => mocks.compareProviderCosts(...args),
}));

vi.mock('../../../../shared/components/ui/badge', () => ({
  // Opaque marker — preserves children/className/variant for assertions
  Badge: ({ children, className, variant }: { children?: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

vi.mock('../../../../assets/icons/brand-registry', () => ({
  getBrandIcon: () => null,
}));

import { TemplateDetail, type TemplateDetailProps } from '../template-detail';
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
      { iceType: 'Compute.WebServer', label: 'API', position: { x: 0, y: 0 } },
      { iceType: 'Database.Postgres', label: 'DB', position: { x: 0, y: 0 } },
    ],
    connections: [],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.expandComposedTemplate.mockReset();
  mocks.compareProviderCosts.mockReset();
  mocks.formatCostRaw.mockReset();
  // Default: no provider comparison data (empty result, comparison section omitted)
  mocks.expandComposedTemplate.mockReturnValue({ nodes: [] });
  mocks.compareProviderCosts.mockReturnValue([]);
  mocks.formatCostRaw.mockImplementation((n: number) => `$${n}`);
});

// ─── Root + back button ───────────────────────────────────────────────────

describe('TemplateDetail — root', () => {
  it('renders a flex-col container at the root', () => {
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    expect(tree.type).toBe('div');
    expect((tree.props as { className: string }).className).toContain('flex-col');
  });

  it('back button onClick fires onBack', () => {
    const onBack = vi.fn();
    const tree = render({ template: makeTemplate(), onBack, onUse: vi.fn() });
    const backBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('border-b'),
    )[0];
    expect(backBtn).toBeDefined();
    (backBtn.props as { onClick: () => void }).onClick();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('back button shows the i18n key for backToList', () => {
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.backToList');
  });
});

// ─── Hero ─────────────────────────────────────────────────────────────────

describe('TemplateDetail — hero', () => {
  it('renders the i18n name in the heading + the description paragraph', () => {
    const tree = render({
      template: makeTemplate({ id: 'hero-tpl' }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.items.hero-tpl.name');
    expect(text).toContain('templates.items.hero-tpl.description');
  });

  it('uses the matching icon from ICON_MAP', () => {
    const tree = render({
      template: makeTemplate({ icon: 'Brain' }),
      onBack: vi.fn(),
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
      onBack: vi.fn(),
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

  it('uses the category color for the hero icon background', () => {
    const tree = render({
      template: makeTemplate({ category: 'ai' as ComposedTemplate['category'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const wrappers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-xl') &&
        (el.props as { className: string }).className.includes('h-12'),
    );
    expect(wrappers.length).toBeGreaterThan(0);
    expect((wrappers[0].props as { style: { backgroundColor: string } }).style.backgroundColor).toBe('#a855f715');
  });

  it('falls back to blue when the category is unknown', () => {
    const tree = render({
      template: makeTemplate({ category: 'unknown-cat' as unknown as ComposedTemplate['category'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const wrappers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-xl') &&
        (el.props as { className: string }).className.includes('h-12'),
    );
    expect((wrappers[0].props as { style: { backgroundColor: string } }).style.backgroundColor).toBe('#3b82f615');
  });

  it('renders the category label chip when catMeta is found', () => {
    const tree = render({
      template: makeTemplate({ category: 'ai' as ComposedTemplate['category'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('AI');
  });

  it('omits the category chip when catMeta is missing', () => {
    const tree = render({
      template: makeTemplate({ category: 'absent' as unknown as ComposedTemplate['category'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    // The 'AI' label string only ever shows up via the category chip
    expect(text).not.toContain('AI');
    expect(text).not.toContain('Web');
  });

  it('renders the trust badge for non-community templates', () => {
    const tree = render({
      template: makeTemplate({ trust: 'official' as ComposedTemplate['trust'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.official');
  });
});

// ─── Stats grid ───────────────────────────────────────────────────────────

describe('TemplateDetail — stats grid', () => {
  it('renders the estimated-cost cell + cost-estimate label', () => {
    const tree = render({
      template: makeTemplate({ estimatedCost: '$25/mo' }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('$25/mo');
    expect(text).toContain('templates.gallery.costEstimate');
  });

  it('renders the difficulty cell with the matching tier label', () => {
    const tree = render({
      template: makeTemplate({ difficulty: 'expert' as ComposedTemplate['difficulty'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.difficultyExpert');
    expect(text).toContain('templates.gallery.difficulty');
  });

  it('falls back to starter when difficulty is undefined', () => {
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.difficultyStarter');
  });

  it('falls back to starter when difficulty is unknown', () => {
    const tree = render({
      template: makeTemplate({ difficulty: 'wizard' as unknown as ComposedTemplate['difficulty'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.difficultyStarter');
  });
});

// ─── Providers section ────────────────────────────────────────────────────

describe('TemplateDetail — providers section', () => {
  it('renders the provider chips when providers is non-empty', () => {
    const tree = render({
      template: makeTemplate({ providers: ['aws', 'gcp'] as ComposedTemplate['providers'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.provider');
    expect(text).toContain('aws');
    expect(text).toContain('gcp');
  });

  it('omits the providers section when providers is undefined', () => {
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.provider');
  });

  it('omits the providers section when providers is an empty array', () => {
    const tree = render({
      template: makeTemplate({ providers: [] as ComposedTemplate['providers'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.provider');
  });
});

// ─── Provider cost comparison ─────────────────────────────────────────────

describe('TemplateDetail — provider cost comparison', () => {
  it('omits the section when comparison is empty', () => {
    mocks.compareProviderCosts.mockReturnValue([]);
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    const text = collectText(tree);
    expect(text).not.toContain('cost.providerComparison');
  });

  it('renders one row per comparison entry', () => {
    mocks.compareProviderCosts.mockReturnValue([
      { provider: 'aws', label: 'AWS', totalMonthlyCost: 100, delta: 0, deltaPercent: 0 },
      { provider: 'gcp', label: 'GCP', totalMonthlyCost: 90, delta: -10, deltaPercent: -10 },
      { provider: 'azure', label: 'Azure', totalMonthlyCost: 110, delta: 10, deltaPercent: 10 },
    ]);
    const tree = render({
      template: makeTemplate({ provider: 'aws' as ComposedTemplate['provider'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('cost.providerComparison');
    expect(text).toContain('AWS');
    expect(text).toContain('GCP');
    expect(text).toContain('Azure');
  });

  it("highlights the current provider with the 'current' label and emerald accent", () => {
    mocks.compareProviderCosts.mockReturnValue([
      { provider: 'aws', label: 'AWS', totalMonthlyCost: 100, delta: 0, deltaPercent: 0 },
      { provider: 'gcp', label: 'GCP', totalMonthlyCost: 90, delta: -10, deltaPercent: -10 },
    ]);
    const tree = render({
      template: makeTemplate({ provider: 'aws' as ComposedTemplate['provider'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('current');
    const rows = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-emerald-500/10'),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('falls back to aws as the current provider when template.provider is undefined', () => {
    mocks.compareProviderCosts.mockReturnValue([
      { provider: 'aws', label: 'AWS', totalMonthlyCost: 100, delta: 0, deltaPercent: 0 },
      { provider: 'gcp', label: 'GCP', totalMonthlyCost: 80, delta: -20, deltaPercent: -20 },
    ]);
    const tree = render({
      template: makeTemplate({ provider: undefined }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('current');
  });

  it('renders +/- delta% with emerald palette for negative delta and red for positive', () => {
    mocks.compareProviderCosts.mockReturnValue([
      { provider: 'aws', label: 'AWS', totalMonthlyCost: 100, delta: 0, deltaPercent: 0 },
      { provider: 'gcp', label: 'GCP', totalMonthlyCost: 80, delta: -20, deltaPercent: -20 },
      { provider: 'azure', label: 'Azure', totalMonthlyCost: 120, delta: 20, deltaPercent: 20 },
    ]);
    const tree = render({
      template: makeTemplate({ provider: 'aws' as ComposedTemplate['provider'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const greens = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-emerald-400') &&
        (el.props as { className: string }).className.includes('font-mono'),
    );
    const reds = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-red-400'),
    );
    expect(greens.length).toBe(1);
    expect(reds.length).toBe(1);
  });

  it('omits the delta% when delta is 0 and provider !== current', () => {
    // delta=0 + non-current still has the cost cell, but no delta percent badge.
    mocks.compareProviderCosts.mockReturnValue([
      { provider: 'aws', label: 'AWS', totalMonthlyCost: 100, delta: 0, deltaPercent: 0 },
      { provider: 'gcp', label: 'GCP', totalMonthlyCost: 100, delta: 0, deltaPercent: 0 },
    ]);
    const tree = render({
      template: makeTemplate({ provider: 'aws' as ComposedTemplate['provider'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    // The only emerald-text-spans are the 'current' label (text-ice-xs not font-mono)
    // and the (non-existent) green delta. With delta=0 the delta-% span is omitted.
    const fontMonoDeltas = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('font-mono') &&
        (el.props as { className: string }).className.includes('text-emerald-400'),
    );
    expect(fontMonoDeltas.length).toBe(0);
  });

  it('falls back to [] when expandComposedTemplate throws (try/catch path)', () => {
    mocks.expandComposedTemplate.mockImplementation(() => {
      throw new Error('boom');
    });
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    const text = collectText(tree);
    expect(text).not.toContain('cost.providerComparison');
  });

  it('formats the monthly cost via formatCostRaw with /mo suffix', () => {
    mocks.compareProviderCosts.mockReturnValue([
      { provider: 'aws', label: 'AWS', totalMonthlyCost: 100, delta: 0, deltaPercent: 0 },
    ]);
    mocks.formatCostRaw.mockReturnValue('FORMATTED');
    const tree = render({
      template: makeTemplate({ provider: 'aws' as ComposedTemplate['provider'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const monoSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('font-mono') &&
        (el.props as { className: string }).className.includes('text-ice-sm'),
    );
    expect(monoSpans.length).toBeGreaterThan(0);
    const children = (monoSpans[0].props as { children: unknown[] }).children;
    expect(children[0]).toBe('FORMATTED');
    expect(children[1]).toBe('/mo');
  });
});

// ─── Compliance section ───────────────────────────────────────────────────

describe('TemplateDetail — compliance section', () => {
  it('renders compliance chips when compliance is non-empty', () => {
    const tree = render({
      template: makeTemplate({ compliance: ['hipaa', 'soc2'] as ComposedTemplate['compliance'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.compliance');
    expect(text).toContain('hipaa');
    expect(text).toContain('soc2');
  });

  it('omits the compliance section when compliance is undefined', () => {
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.compliance');
  });

  it('omits the compliance section when compliance is empty', () => {
    const tree = render({
      template: makeTemplate({ compliance: [] as ComposedTemplate['compliance'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.compliance');
  });
});

// ─── Resources / blocks-by-category ───────────────────────────────────────

describe('TemplateDetail — resources', () => {
  it('groups blocks by their iceType prefix and routes through blocks.categories.<lower> i18n key', () => {
    const tree = render({
      template: makeTemplate({
        blocks: [
          { iceType: 'Compute.WebServer', label: 'API', position: { x: 0, y: 0 } },
          { iceType: 'Compute.Worker', label: 'Worker', position: { x: 0, y: 0 } },
          { iceType: 'Database.Postgres', label: 'DB', position: { x: 0, y: 0 } },
        ],
      }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('blocks.categories.compute.label');
    expect(text).toContain('blocks.categories.database.label');
    // Labels joined with ', '
    expect(text).toContain('API, Worker');
    expect(text).toContain('DB');
  });

  it('renders the connections row when connections is non-empty', () => {
    const tree = render({
      template: makeTemplate({
        connections: [{ fromBlock: 0, toBlock: 1, relationship: 'depends_on' }],
      }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.connections');
  });

  it('omits the connections row when connections is empty', () => {
    const tree = render({
      template: makeTemplate({ connections: [] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.connections');
  });

  it('renders the groups row when groups is non-empty', () => {
    const tree = render({
      template: makeTemplate({
        groups: [
          {
            subtype: 'Frontend',
            label: 'Frontend',
            position: { x: 0, y: 0 },
            width: 100,
            height: 100,
            blockIndices: [0],
          },
        ],
      }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.groups');
  });

  it('omits the groups row when groups is undefined', () => {
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.groups');
  });
});

// ─── Environments ─────────────────────────────────────────────────────────

describe('TemplateDetail — environments', () => {
  it('renders one chip per environmentPreset with the name + region', () => {
    const tree = render({
      template: makeTemplate({
        environmentPresets: [
          {
            type: 'production',
            name: 'prod',
            region: 'us-east-1',
            securityLevel: 'standard' as ComposedTemplate['securityLevel'],
          },
          {
            type: 'staging',
            name: 'stage',
            region: 'us-west-2',
            securityLevel: 'standard' as ComposedTemplate['securityLevel'],
          },
        ],
      }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.environmentPresets');
    expect(text).toContain('prod');
    expect(text).toContain('us-east-1');
    expect(text).toContain('stage');
    expect(text).toContain('us-west-2');
  });

  it('omits the environments section when empty', () => {
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.environmentPresets');
  });
});

// ─── Tags ─────────────────────────────────────────────────────────────────

describe('TemplateDetail — tags', () => {
  it('renders one Badge per tag', () => {
    const tree = render({
      template: makeTemplate({ tags: ['react', 'typescript'] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const badges = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-testid']?: string })['data-testid'] === 'string' &&
        (el.props as { ['data-testid']: string })['data-testid'] === 'badge',
    );
    expect(badges.length).toBeGreaterThanOrEqual(2);
    expect((badges[0].props as { children: unknown }).children).toBe('react');
    expect((badges[1].props as { children: unknown }).children).toBe('typescript');
  });

  it('omits the tags section when tags is empty', () => {
    const tree = render({
      template: makeTemplate({ tags: [] }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const text = collectText(tree);
    expect(text).not.toContain('templates.gallery.tags');
  });
});

// ─── Repo link ────────────────────────────────────────────────────────────

describe('TemplateDetail — repo link', () => {
  it('renders an anchor with the repo url when repo is set', () => {
    const tree = render({
      template: makeTemplate({
        repo: { url: 'https://github.com/foo/bar', branch: 'main' },
      }),
      onBack: vi.fn(),
      onUse: vi.fn(),
    });
    const link = findByPredicate(tree, (el) => el.type === 'a')[0];
    expect(link).toBeDefined();
    expect((link.props as { href: string }).href).toBe('https://github.com/foo/bar');
    expect((link.props as { target: string }).target).toBe('_blank');
    expect((link.props as { rel: string }).rel).toBe('noopener noreferrer');
    const text = collectText(tree);
    expect(text).toContain('templates.gallery.viewRepository');
  });

  it('omits the repo link when repo is undefined', () => {
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    const links = findByPredicate(tree, (el) => el.type === 'a');
    expect(links.length).toBe(0);
  });
});

// ─── Sticky use-template button ───────────────────────────────────────────

describe('TemplateDetail — Use Template CTA', () => {
  it('renders the bottom-bar button with the wizard.createButton i18n key', () => {
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('wizard.createButton');
  });

  it('renders the Plus icon next to the CTA label', () => {
    const tree = render({ template: makeTemplate(), onBack: vi.fn(), onUse: vi.fn() });
    const fns = (n: React.ReactNode) => {
      const out: string[] = [];
      for (const el of walk(n)) {
        const dn = (el.type as { displayName?: string })?.displayName;
        if (dn) out.push(dn);
      }
      return out;
    };
    expect(fns(tree)).toContain('Plus');
  });

  it('CTA button onClick fires onUse(template)', () => {
    const onUse = vi.fn();
    const tpl = makeTemplate();
    const tree = render({ template: tpl, onBack: vi.fn(), onUse });
    const useBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('w-full') &&
        (el.props as { className: string }).className.includes('bg-ice-accent'),
    )[0];
    expect(useBtn).toBeDefined();
    (useBtn.props as { onClick: () => void }).onClick();
    expect(onUse).toHaveBeenCalledWith(tpl);
  });
});
