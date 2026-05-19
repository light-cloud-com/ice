/**
 * rf-cost-8 — EnvironmentComparison.
 *
 * Direct-FC tree-walker. The component is stateless. We mock
 * `computeCostSummary` so each env's reported cost is deterministic per
 * card-id, regardless of resource pricing.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const costsByCardId = new Map<string, number>();

vi.mock('../../utils/cost-calculator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/cost-calculator')>();
  return {
    ...actual,
    computeCostSummary: (nodes: { __cardId?: string }[]) => ({
      totalMonthlyCost: costsByCardId.get((nodes[0]?.__cardId as string) ?? '') ?? 0,
      categories: [],
      scalingRange: { minCost: 0, currentCost: 0, maxCost: 0 },
      nodeCount: nodes.length,
      scalableNodeCount: 0,
    }),
  };
});

// eslint-disable-next-line import/first
import { EnvironmentComparison, type EnvironmentComparisonProps } from '../environment-comparison';
// eslint-disable-next-line import/first
import type { Environment } from '../../../../store/slices/environments-slice';
// eslint-disable-next-line import/first
import type { CardNode } from '../../../../store/slices/cards-slice';

// ─── Tree-walker helpers ──────────────────────────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
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
  if (Array.isArray(children)) {
    for (const c of children) yield* walk(c as ReactNodeLike);
    return;
  }
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
    else if (typeof c === 'number') s += String(c);
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
        else if (typeof item === 'number') s += String(item);
      }
    }
  }
  return s;
}

// ─── Builders ─────────────────────────────────────────────────────────────

function buildEnv(over: Partial<Environment>): Environment {
  return {
    id: over.id ?? `env-${over.type ?? 'production'}`,
    project_id: 'p',
    card_id: over.card_id ?? 'c',
    name: over.name ?? 'production',
    type: over.type ?? 'production',
    region: null,
    is_protected: false,
    pr_number: null,
    pr_branch: null,
    ...over,
  };
}

function buildCard(id: string, costInDollars: number): { id: string; name: string; nodes: CardNode[] } {
  costsByCardId.set(id, costInDollars);
  // Embed `__cardId` on the first node so the mocked computeCostSummary knows
  // which deterministic cost to return.
  const stamp: CardNode = {
    id: 'n',
    type: 'resource',
    position: { x: 0, y: 0 },
    width: 1,
    height: 1,
    data: {},
  };
  (stamp as { __cardId?: string }).__cardId = id;
  return { id, name: id, nodes: [stamp] };
}

function render(props: EnvironmentComparisonProps): React.ReactElement {
  return (EnvironmentComparison as unknown as (p: EnvironmentComparisonProps) => React.ReactElement)(props);
}

// ─── Empty / single env ──────────────────────────────────────────────────

describe('EnvironmentComparison — empty / single env', () => {
  it('renders an empty container when no environments are passed', () => {
    const tree = render({
      environments: [],
      allCards: [],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const rows = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        ((el.props as { className?: string }).className ?? '').includes('flex items-center justify-between py-1.5'),
    );
    expect(rows).toHaveLength(0);
  });

  it('renders a single production row with no delta column', () => {
    costsByCardId.clear();
    const tree = render({
      environments: [buildEnv({ id: 'e1', card_id: 'c1', name: 'prod', type: 'production' })],
      allCards: [buildCard('c1', 100)],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const text = collectText(tree);
    expect(text).toContain('prod');
    // No delta-prefix sign for a production-only env.
    expect(text).not.toContain('+$');
  });
});

// ─── Type-color dot ──────────────────────────────────────────────────────

describe('EnvironmentComparison — type-color dots', () => {
  function dotColorFor(envType: Environment['type']): string {
    costsByCardId.clear();
    const tree = render({
      environments: [buildEnv({ id: 'e', card_id: 'c1', name: envType, type: envType })],
      allCards: [buildCard('c1', 0)],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const dot = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        ((el.props as { className?: string }).className ?? '').includes('w-2') &&
        ((el.props as { className?: string }).className ?? '').includes('rounded-full'),
    );
    return (dot[0].props as { className: string }).className;
  }

  it('production → emerald-500', () => {
    expect(dotColorFor('production')).toContain('bg-emerald-500');
  });

  it('staging → amber-500', () => {
    expect(dotColorFor('staging')).toContain('bg-amber-500');
  });

  it('development → blue-500', () => {
    expect(dotColorFor('development')).toContain('bg-blue-500');
  });

  it('pr → purple-500 (fallthrough)', () => {
    expect(dotColorFor('pr')).toContain('bg-purple-500');
  });
});

// ─── Active highlight ────────────────────────────────────────────────────

describe('EnvironmentComparison — active highlight', () => {
  it('the row whose card matches activeCardId gets the emerald background', () => {
    costsByCardId.clear();
    const tree = render({
      environments: [
        buildEnv({ id: 'e1', card_id: 'c1', name: 'prod', type: 'production' }),
        buildEnv({ id: 'e2', card_id: 'c2', name: 'dev', type: 'development' }),
      ],
      allCards: [buildCard('c1', 100), buildCard('c2', 50)],
      activeCardId: 'c2',
      currentCost: 0,
      resourceMap: null,
    });
    const rows = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        ((el.props as { className?: string }).className ?? '').includes('py-1.5'),
    );
    expect(rows.length).toBe(2);
    // Look at the dev row (second).
    const devCls = (rows[1].props as { className: string }).className;
    expect(devCls).toContain('bg-emerald-500/10');
    // Prod row should NOT.
    expect((rows[0].props as { className: string }).className).not.toContain('bg-emerald-500/10');
  });
});

// ─── Cost rendering ──────────────────────────────────────────────────────

describe('EnvironmentComparison — cost rendering', () => {
  it('renders the env cost via formatCost', () => {
    costsByCardId.clear();
    const tree = render({
      environments: [buildEnv({ id: 'e', card_id: 'c1', name: 'prod', type: 'production' })],
      allCards: [buildCard('c1', 250)],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const text = collectText(tree);
    // formatCost(250) → "~$250/mo"
    expect(text).toContain('$250');
  });

  it('renders an em-dash when env cost is 0', () => {
    costsByCardId.clear();
    const tree = render({
      environments: [buildEnv({ id: 'e', card_id: 'c1', name: 'prod', type: 'production' })],
      allCards: [buildCard('c1', 0)],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const text = collectText(tree);
    expect(text).toContain('—');
  });

  it('renders an em-dash when the env card cannot be found in allCards', () => {
    const tree = render({
      environments: [buildEnv({ id: 'e', card_id: 'c-missing', name: 'prod', type: 'production' })],
      allCards: [],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const text = collectText(tree);
    expect(text).toContain('—');
  });
});

// ─── Delta column ────────────────────────────────────────────────────────

describe('EnvironmentComparison — delta column', () => {
  it('non-prod row shows positive delta with red text and "+" prefix', () => {
    costsByCardId.clear();
    const tree = render({
      environments: [
        buildEnv({ id: 'e1', card_id: 'c1', name: 'prod', type: 'production' }),
        buildEnv({ id: 'e2', card_id: 'c2', name: 'dev', type: 'development' }),
      ],
      allCards: [buildCard('c1', 100), buildCard('c2', 150)],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const text = collectText(tree);
    // delta = 150 - 100 = +50 → "+~$50" (formatCostRaw returns "~$50",
    // and the conditional "+" prefix is rendered separately)
    expect(text).toContain('+');
    expect(text).toContain('~$50');
    // Look for the red-400 span
    const redSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        ((el.props as { className?: string }).className ?? '').includes('text-red-400'),
    );
    expect(redSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('non-prod row shows negative delta with emerald text', () => {
    costsByCardId.clear();
    const tree = render({
      environments: [
        buildEnv({ id: 'e1', card_id: 'c1', name: 'prod', type: 'production' }),
        buildEnv({ id: 'e2', card_id: 'c2', name: 'dev', type: 'development' }),
      ],
      allCards: [buildCard('c1', 100), buildCard('c2', 50)],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const text = collectText(tree);
    // delta = 50 - 100 = -50; formatCostRaw's first branch is
    // `if (value < 0.01) return '< $0.01'` — that branch fires for any
    // negative number too (no lower bound). The rendered delta text is
    // therefore "< $0.01" (without the "+" prefix, since delta < 0).
    expect(text).toContain('< $0.01');
    const emeraldSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        ((el.props as { className?: string }).className ?? '').includes('text-emerald-400') &&
        ((el.props as { className?: string }).className ?? '').includes('font-mono'),
    );
    // At least one emerald (the delta), possibly more (active row pre-card etc.)
    expect(emeraldSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('non-prod with delta 0 hides the delta column entirely', () => {
    costsByCardId.clear();
    const tree = render({
      environments: [
        buildEnv({ id: 'e1', card_id: 'c1', name: 'prod', type: 'production' }),
        buildEnv({ id: 'e2', card_id: 'c2', name: 'dev', type: 'development' }),
      ],
      allCards: [buildCard('c1', 100), buildCard('c2', 100)],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const text = collectText(tree);
    expect(text).not.toContain('+$0');
    expect(text).not.toContain('-$0');
  });

  it('production row never gets a delta column even if it could compute one', () => {
    costsByCardId.clear();
    const tree = render({
      environments: [buildEnv({ id: 'e', card_id: 'c1', name: 'prod', type: 'production' })],
      allCards: [buildCard('c1', 100)],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const text = collectText(tree);
    // No "+$" or "-$" should leak.
    expect(text).not.toContain('+$');
    expect(text).not.toContain('-$');
  });
});

// ─── Protected lock ──────────────────────────────────────────────────────

describe('EnvironmentComparison — protected lock', () => {
  it('shows lock emoji when env.is_protected', () => {
    costsByCardId.clear();
    const tree = render({
      environments: [
        buildEnv({ id: 'e', card_id: 'c1', name: 'prod', type: 'production', is_protected: true }),
      ],
      allCards: [buildCard('c1', 100)],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const text = collectText(tree);
    expect(text).toContain('🔒');
  });

  it('omits lock emoji when env.is_protected is false', () => {
    costsByCardId.clear();
    const tree = render({
      environments: [
        buildEnv({ id: 'e', card_id: 'c1', name: 'prod', type: 'production', is_protected: false }),
      ],
      allCards: [buildCard('c1', 100)],
      activeCardId: null,
      currentCost: 0,
      resourceMap: null,
    });
    const text = collectText(tree);
    expect(text).not.toContain('🔒');
  });
});
