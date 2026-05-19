/**
 * rf-cost-5 — ProjectionRow.
 *
 * Direct-FC tree-walker. The component is stateless so we can call it
 * straight without a React mock. Tests cover the suffix-by-label branch
 * table and basic structure.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ProjectionRow, type ProjectionRowProps } from '../projection-row';

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

function render(props: ProjectionRowProps): React.ReactElement {
  return (ProjectionRow as unknown as (p: ProjectionRowProps) => React.ReactElement)(props);
}

// ─── Structure ────────────────────────────────────────────────────────────

describe('ProjectionRow — structure', () => {
  it('renders a flex row container', () => {
    const tree = render({ label: 'Monthly', value: 100 });
    expect(tree.type).toBe('div');
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('flex');
    expect(cls).toContain('items-center');
    expect(cls).toContain('justify-between');
  });

  it('renders the label inside an ice-xs / ice-text-2 span', () => {
    const tree = render({ label: 'Quarterly', value: 100 });
    const labelSpans = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'Quarterly',
    );
    expect(labelSpans).toHaveLength(1);
    const cls = (labelSpans[0].props as { className: string }).className;
    expect(cls).toContain('text-ice-xs');
    expect(cls).toContain('text-ice-text-2');
  });

  it('renders the value inside a font-mono / text-ice-sm span', () => {
    const tree = render({ label: 'Monthly', value: 100 });
    const valueSpan = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { className?: string }).className?.includes('font-mono') === true,
    );
    expect(valueSpan).toHaveLength(1);
    const cls = (valueSpan[0].props as { className: string }).className;
    expect(cls).toContain('text-ice-sm');
    expect(cls).toContain('text-ice-text-1');
  });
});

// ─── Suffix branches ──────────────────────────────────────────────────────

describe('ProjectionRow — suffix branches', () => {
  it('"Monthly" label → "/mo" suffix', () => {
    const tree = render({ label: 'Monthly', value: 100 });
    const text = collectText(tree);
    expect(text).toContain('/mo');
    expect(text).not.toContain('/qtr');
    expect(text).not.toContain('/yr');
  });

  it('"Quarterly" label → "/qtr" suffix', () => {
    const tree = render({ label: 'Quarterly', value: 300 });
    const text = collectText(tree);
    expect(text).toContain('/qtr');
    expect(text).not.toContain('/mo');
    expect(text).not.toContain('/yr');
  });

  it('any other label (e.g. "Annual") → "/yr" suffix', () => {
    const tree = render({ label: 'Annual', value: 1200 });
    const text = collectText(tree);
    expect(text).toContain('/yr');
    expect(text).not.toContain('/mo');
    expect(text).not.toContain('/qtr');
  });

  it('non-English / translated labels fall through to "/yr"', () => {
    const tree = render({ label: 'cost.monthly', value: 100 });
    const text = collectText(tree);
    expect(text).toContain('/yr');
  });
});

// ─── Value formatting ─────────────────────────────────────────────────────

describe('ProjectionRow — value formatting', () => {
  it('formats $0 as "$0"', () => {
    const tree = render({ label: 'Monthly', value: 0 });
    const text = collectText(tree);
    expect(text).toContain('$0');
  });

  it('formats whole-dollar small values with the integer dollar', () => {
    const tree = render({ label: 'Monthly', value: 25 });
    const text = collectText(tree);
    // formatCostRaw(25) → "$25" → text becomes "$25/mo"
    expect(text).toContain('$25/mo');
  });

  it('formats large values via the formatter', () => {
    const tree = render({ label: 'Annual', value: 12000 });
    const text = collectText(tree);
    // formatCostRaw inserts the formatter shape — assert the trailing suffix
    expect(text).toContain('/yr');
  });
});
