/**
 * rf-cost-6 — ScalingRangeBar.
 *
 * Direct-FC tree-walker. Stateless component — no React mock needed.
 * Tests pin the position math, the i18n labels, and the formatCost-driven
 * footer values.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../i18n', () => ({
  t: (k: string) => `[t:${k}]`,
}));

import { ScalingRangeBar, type ScalingRangeBarProps } from '../scaling-range-bar';

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

function render(props: ScalingRangeBarProps): React.ReactElement {
  return (ScalingRangeBar as unknown as (p: ScalingRangeBarProps) => React.ReactElement)(props);
}

// ─── i18n labels ──────────────────────────────────────────────────────────

describe('ScalingRangeBar — i18n labels', () => {
  it('renders the localized min and max instance labels', () => {
    const tree = render({ range: { minCost: 10, currentCost: 50, maxCost: 100 } });
    const text = collectText(tree);
    expect(text).toContain('[t:cost.minInstances]');
    expect(text).toContain('[t:cost.maxInstances]');
  });
});

// ─── Position math ───────────────────────────────────────────────────────

describe('ScalingRangeBar — position math', () => {
  it('places the marker at 0% when current === min', () => {
    const tree = render({ range: { minCost: 100, currentCost: 100, maxCost: 200 } });
    const markers = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { style?: { left?: string } }).style?.left === '0%',
    );
    expect(markers.length).toBeGreaterThanOrEqual(1);
  });

  it('places the marker at 100% when current === max', () => {
    const tree = render({ range: { minCost: 0, currentCost: 200, maxCost: 200 } });
    const markers = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { style?: { left?: string } }).style?.left === '100%',
    );
    expect(markers.length).toBeGreaterThanOrEqual(1);
  });

  it('places the marker at 50% when current is at midpoint', () => {
    const tree = render({ range: { minCost: 0, currentCost: 50, maxCost: 100 } });
    const markers = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { style?: { left?: string } }).style?.left === '50%',
    );
    expect(markers.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to 50% when min === max (totalRange is 0)', () => {
    const tree = render({ range: { minCost: 100, currentCost: 100, maxCost: 100 } });
    const markers = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { style?: { left?: string } }).style?.left === '50%',
    );
    expect(markers.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to 50% when totalRange is negative (defensive)', () => {
    const tree = render({ range: { minCost: 200, currentCost: 100, maxCost: 0 } });
    const markers = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { style?: { left?: string } }).style?.left === '50%',
    );
    expect(markers.length).toBeGreaterThanOrEqual(1);
  });

  it('the handle uses calc() to recenter via -6px offset', () => {
    const tree = render({ range: { minCost: 0, currentCost: 50, maxCost: 100 } });
    const handle = findByPredicate(
      tree,
      (el) => el.type === 'div' && ((el.props as { style?: { left?: string } }).style?.left ?? '').startsWith('calc('),
    );
    expect(handle).toHaveLength(1);
    expect((handle[0].props as { style: { left: string } }).style.left).toBe('calc(50% - 6px)');
  });
});

// ─── Footer values ────────────────────────────────────────────────────────

describe('ScalingRangeBar — footer', () => {
  it('renders min cost in emerald + max cost in red', () => {
    const tree = render({ range: { minCost: 10, currentCost: 30, maxCost: 50 } });
    const emeraldSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        ((el.props as { className?: string }).className ?? '').includes('text-emerald-400') &&
        ((el.props as { className?: string }).className ?? '').includes('font-mono'),
    );
    expect(emeraldSpans.length).toBeGreaterThanOrEqual(1);
    const redSpans = findByPredicate(
      tree,
      (el) => el.type === 'span' && ((el.props as { className?: string }).className ?? '').includes('text-red-400'),
    );
    expect(redSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('the centered footer span starts with "Current: " text', () => {
    const tree = render({ range: { minCost: 0, currentCost: 50, maxCost: 100 } });
    const text = collectText(tree);
    expect(text).toContain('Current: ');
  });

  it('uses formatCost (returns "Free" for $0) for boundary values', () => {
    const tree = render({ range: { minCost: 0, currentCost: 0, maxCost: 0 } });
    const text = collectText(tree);
    // formatCost(0) → "Free"
    expect(text).toContain('Free');
  });
});

// ─── Bar structure ────────────────────────────────────────────────────────

describe('ScalingRangeBar — bar structure', () => {
  it('renders the gradient track with rounded-full', () => {
    const tree = render({ range: { minCost: 0, currentCost: 50, maxCost: 100 } });
    const track = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        ((el.props as { className?: string }).className ?? '').includes('bg-gradient-to-r') &&
        ((el.props as { className?: string }).className ?? '').includes('rounded-full'),
    );
    expect(track).toHaveLength(1);
    const cls = (track[0].props as { className: string }).className;
    expect(cls).toContain('from-emerald-500/40');
    expect(cls).toContain('via-amber-500/40');
    expect(cls).toContain('to-red-500/40');
  });
});
