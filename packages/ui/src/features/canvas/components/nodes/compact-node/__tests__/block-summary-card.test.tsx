/**
 * Tests for `BlockSummaryCard` — the compact summary card rendered for
 * Block-typed nodes (collapsed parent in the canvas).
 *
 * Branches:
 *   - data-node-id from node.id, category derived from data.iceType prefix.
 *   - SW = max(node.width, BLOCK_SUMMARY_W).
 *   - bcat fallback: CATEGORY_STYLE[category] || .Block || .default.
 *   - top accent line opacity flips on selected/hovered.
 *   - boxShadow tier: selected → glow, hovered → hover, else → resting.
 *   - bBorder: selected/hovered → cat.glow, else → cat.glow + '55'.
 *   - resourceCount text: 0 → "empty"; 1 → "1 resource"; >1 → "N resources".
 *   - cost label rendered only when blockCost set.
 *   - provider pill rendered only when provider set.
 *   - mouse handlers + onDoubleClickLabel forwarded.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const named = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    NodeHeader: named('MockNodeHeader'),
    ProviderPill: named('MockProviderPill'),
    CostLabel: named('MockCostLabel'),
  };
});

vi.mock('../../_shared/node-header', () => ({ NodeHeader: mocks.NodeHeader }));
vi.mock('../../_shared/provider-pill', () => ({ ProviderPill: mocks.ProviderPill }));
vi.mock('../../_shared/cost-label', () => ({ CostLabel: mocks.CostLabel }));

import { BlockSummaryCard, BLOCK_SUMMARY_H, BLOCK_SUMMARY_W } from '../block-summary-card';
import type { CanvasNode } from '../../svg-canvas';

const MockNodeHeader = mocks.NodeHeader;
const MockProviderPill = mocks.ProviderPill;
const MockCostLabel = mocks.CostLabel;

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
function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}
function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  const visit = (n: ReactNodeLike): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    visit(((n as React.ReactElement).props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join('');
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'block-1',
  type: 'block',
  x: 100,
  y: 200,
  width: 240,
  height: 80,
  label: 'My Block',
  data: {},
  parentId: undefined,
  ...overrides,
});

const renderBSC = (
  props: Partial<React.ComponentProps<typeof BlockSummaryCard>> = {},
): React.ReactElement => {
  const Inner = (BlockSummaryCard as unknown as {
    type: (p: React.ComponentProps<typeof BlockSummaryCard>) => React.ReactElement;
  }).type;
  const defaults: React.ComponentProps<typeof BlockSummaryCard> = {
    node: makeNode(),
    isSelected: false,
    isHovered: false,
    childNodes: [],
    onMouseEnter: () => {},
    onMouseLeave: () => {},
    onDoubleClickLabel: undefined,
  };
  return Inner({ ...defaults, ...props });
};

describe('BlockSummaryCard — exports', () => {
  it('exports BLOCK_SUMMARY_H = 80, BLOCK_SUMMARY_W = 260', () => {
    expect(BLOCK_SUMMARY_H).toBe(80);
    expect(BLOCK_SUMMARY_W).toBe(260);
  });

  it('is wrapped in React.memo with displayName', () => {
    expect(typeof (BlockSummaryCard as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((BlockSummaryCard as unknown as { displayName: string }).displayName).toBe('BlockSummaryCard');
  });
});

describe('BlockSummaryCard — outer <g>', () => {
  it('writes data-node-id from node.id', () => {
    const tree = renderBSC({ node: makeNode({ id: 'foo' }) });
    expect((tree.props as { 'data-node-id': string })['data-node-id']).toBe('foo');
  });

  it('cursor: move on the outer <g>', () => {
    const tree = renderBSC();
    expect((tree.props as { style: { cursor: string } }).style.cursor).toBe('move');
  });

  it('forwards onMouseEnter/onMouseLeave', () => {
    const calls: string[] = [];
    const tree = renderBSC({
      onMouseEnter: () => calls.push('e'),
      onMouseLeave: () => calls.push('l'),
    });
    const props = tree.props as { onMouseEnter: () => void; onMouseLeave: () => void };
    props.onMouseEnter();
    props.onMouseLeave();
    expect(calls).toEqual(['e', 'l']);
  });
});

describe('BlockSummaryCard — geometry / SW', () => {
  it('foreignObject width = max(node.width, BLOCK_SUMMARY_W)', () => {
    const wide = renderBSC({ node: makeNode({ width: 400 }) });
    const narrow = renderBSC({ node: makeNode({ width: 100 }) });
    expect((findByType(wide, 'foreignObject')[0].props as { width: number }).width).toBe(400);
    expect((findByType(narrow, 'foreignObject')[0].props as { width: number }).width).toBe(BLOCK_SUMMARY_W);
  });

  it('foreignObject width falls back to BLOCK_SUMMARY_W when node.width=0', () => {
    const tree = renderBSC({ node: makeNode({ width: 0 }) });
    expect((findByType(tree, 'foreignObject')[0].props as { width: number }).width).toBe(BLOCK_SUMMARY_W);
  });

  it('foreignObject height = BLOCK_SUMMARY_H', () => {
    const tree = renderBSC();
    expect((findByType(tree, 'foreignObject')[0].props as { height: number }).height).toBe(BLOCK_SUMMARY_H);
  });
});

describe('BlockSummaryCard — inner card style', () => {
  const findCard = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { style?: { boxSizing?: string } }).style?.boxSizing === 'border-box',
    )[0];

  it('selected boxShadow includes the category glow', () => {
    const tree = renderBSC({ isSelected: true, node: makeNode({ data: { iceType: 'Compute.Block' } }) });
    const card = findCard(tree)!;
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toMatch(/0 0 0 1\.5px/);
  });

  it('hovered (not selected) boxShadow uses the hover gradient', () => {
    const tree = renderBSC({ isHovered: true, isSelected: false });
    const card = findCard(tree)!;
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toBe('0 2px 8px -2px rgba(0,0,0,0.15)');
  });

  it('default (not selected, not hovered) renders the resting shadow', () => {
    const tree = renderBSC();
    const card = findCard(tree)!;
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toBe('0 1px 3px rgba(0,0,0,0.06)');
  });

  it('border uses cat.glow when selected, cat.glow+55 otherwise', () => {
    const sel = renderBSC({ isSelected: true });
    const idle = renderBSC({ isSelected: false, isHovered: false });
    const selCard = findCard(sel)!;
    const idleCard = findCard(idle)!;
    const selBorder = (selCard.props as { style: { border: string } }).style.border;
    const idleBorder = (idleCard.props as { style: { border: string } }).style.border;
    expect(idleBorder.endsWith('55')).toBe(true);
    expect(selBorder.endsWith('55')).toBe(false);
  });
});

describe('BlockSummaryCard — top accent', () => {
  /** Find the top accent line: height: 2 + flexShrink: 0 + opacity. */
  const findAccent = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { height?: number; flexShrink?: number } }).style;
      return style?.height === 2 && style?.flexShrink === 0;
    })[0];

  it('opacity 0.9 when selected', () => {
    const tree = renderBSC({ isSelected: true });
    expect((findAccent(tree)!.props as { style: { opacity: number } }).style.opacity).toBe(0.9);
  });

  it('opacity 0.9 when hovered', () => {
    const tree = renderBSC({ isHovered: true });
    expect((findAccent(tree)!.props as { style: { opacity: number } }).style.opacity).toBe(0.9);
  });

  it('opacity 0.55 when not selected and not hovered', () => {
    const tree = renderBSC();
    expect((findAccent(tree)!.props as { style: { opacity: number } }).style.opacity).toBe(0.55);
  });
});

describe('BlockSummaryCard — header / provider', () => {
  it('renders NodeHeader with category, label, maxChars=22', () => {
    const tree = renderBSC({
      node: makeNode({ label: 'My Block', data: { iceType: 'Database.Postgres' } }),
    });
    const hdr = findByType(tree, MockNodeHeader)[0];
    const props = hdr.props as { category: string; label: string; maxChars: number };
    expect(props.category).toBe('Database');
    expect(props.label).toBe('My Block');
    expect(props.maxChars).toBe(22);
  });

  it('forwards onDoubleClickLabel into NodeHeader', () => {
    const dbl = vi.fn();
    const tree = renderBSC({ onDoubleClickLabel: dbl });
    const hdr = findByType(tree, MockNodeHeader)[0];
    expect((hdr.props as { onDoubleClickLabel: () => void }).onDoubleClickLabel).toBe(dbl);
  });

  it('falls back to empty label when node.label is undefined', () => {
    const tree = renderBSC({ node: makeNode({ label: undefined as unknown as string }) });
    const hdr = findByType(tree, MockNodeHeader)[0];
    expect((hdr.props as { label: string }).label).toBe('');
  });

  it('passes ProviderPill into trailing when provider set', () => {
    const tree = renderBSC({ node: makeNode({ data: { provider: 'aws' } }) });
    const hdr = findByType(tree, MockNodeHeader)[0];
    const trailing = (hdr.props as { trailing?: React.ReactNode }).trailing;
    const pills = findByType(trailing, MockProviderPill);
    expect(pills).toHaveLength(1);
    expect((pills[0].props as { provider: string }).provider).toBe('aws');
  });

  it('still renders ProviderPill when provider empty (pill handles AUTO fallback)', () => {
    const tree = renderBSC();
    const hdr = findByType(tree, MockNodeHeader)[0];
    const trailing = (hdr.props as { trailing?: React.ReactNode }).trailing;
    const pills = findByType(trailing, MockProviderPill);
    expect(pills).toHaveLength(1);
    expect((pills[0].props as { provider: string }).provider).toBe('');
  });
});

describe('BlockSummaryCard — resource count + cost', () => {
  it('renders "empty" when no children', () => {
    const tree = renderBSC({ childNodes: [] });
    expect(collectText(tree)).toContain('empty');
  });

  it('renders "1 resource" (singular) when one child', () => {
    const tree = renderBSC({ childNodes: [makeNode({ id: 'c1' })] });
    expect(collectText(tree)).toContain('1 resource');
  });

  it('renders "N resources" (plural) when multiple children', () => {
    const tree = renderBSC({
      childNodes: [makeNode({ id: 'c1' }), makeNode({ id: 'c2' }), makeNode({ id: 'c3' })],
    });
    expect(collectText(tree)).toContain('3 resources');
  });

  it('renders CostLabel when blockCost set, omits otherwise', () => {
    const withCost = renderBSC({ node: makeNode({ data: { estimatedCost: '$2.00/h' } }) });
    expect(findByType(withCost, MockCostLabel)).toHaveLength(1);
    expect((findByType(withCost, MockCostLabel)[0].props as { cost: string }).cost).toBe('$2.00/h');

    const withoutCost = renderBSC();
    expect(findByType(withoutCost, MockCostLabel)).toHaveLength(0);
  });
});

describe('BlockSummaryCard — category fallback', () => {
  it('uses default category style when iceType is empty (no dot)', () => {
    const tree = renderBSC({ node: makeNode({ data: {} }) });
    const hdr = findByType(tree, MockNodeHeader)[0];
    expect((hdr.props as { category: string }).category).toBe('default');
  });

  it('falls back to CATEGORY_STYLE.Block (3b82f6) when category is unknown', () => {
    // 'NotAKnownCategory' is not in CATEGORY_STYLE → first || arm is undefined →
    // falls through to CATEGORY_STYLE.Block (border #253548, glow #3b82f6).
    const tree = renderBSC({ node: makeNode({ data: { iceType: 'NotAKnownCategory.Foo' } }) });
    const hdr = findByType(tree, MockNodeHeader)[0];
    expect((hdr.props as { categoryColor: string }).categoryColor).toBe('#3b82f6');
  });
});
