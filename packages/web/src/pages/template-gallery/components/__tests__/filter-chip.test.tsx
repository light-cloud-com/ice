/**
 * rf-wgal-4 — FilterChip.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 pattern).
 * No hooks (the chip is a pure visual leaf), so no `react` mock needed.
 * The tests pin: root <button>, click wiring, the inactive class, the
 * active style block (with and without an explicit `color`), the
 * optional Icon prop and the optional count span.
 */

import { LayoutTemplate, Zap } from 'lucide-react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { FilterChip, type FilterChipProps } from '../filter-chip';

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

function render(props: FilterChipProps): React.ReactElement {
  return (FilterChip as unknown as (p: FilterChipProps) => React.ReactElement)(props);
}

// ─── Root ─────────────────────────────────────────────────────────────────

describe('FilterChip — root', () => {
  it('renders a <button> at the root', () => {
    const tree = render({ label: 'All', active: false, onClick: vi.fn() });
    expect(tree.type).toBe('button');
  });

  it('button onClick fires the supplied callback', () => {
    const onClick = vi.fn();
    const tree = render({ label: 'X', active: false, onClick });
    (tree.props as { onClick: () => void }).onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders the supplied label as a child', () => {
    const tree = render({ label: 'My Filter', active: false, onClick: vi.fn() });
    const children = (tree.props as { children: unknown[] }).children;
    expect(children).toContain('My Filter');
  });
});

// ─── Active / inactive class ──────────────────────────────────────────────

describe('FilterChip — active class', () => {
  it('applies the inactive palette when active=false', () => {
    const tree = render({ label: 'X', active: false, onClick: vi.fn() });
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('bg-ice-raised');
    expect(cls).toContain('text-ice-text-3');
    expect(cls).toContain('hover:text-ice-text-2');
  });

  it('applies the active ring class when active=true', () => {
    const tree = render({ label: 'X', active: true, onClick: vi.fn() });
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('ring-1');
    expect(cls).toContain('ring-opacity-40');
  });

  it('always includes the static layout classes', () => {
    const tree = render({ label: 'X', active: false, onClick: vi.fn() });
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('rounded-full');
    expect(cls).toContain('shrink-0');
    expect(cls).toContain('px-2.5');
    expect(cls).toContain('py-1');
  });
});

// ─── Active style block ───────────────────────────────────────────────────

describe('FilterChip — active style block', () => {
  it('returns an undefined style when inactive', () => {
    const tree = render({ label: 'X', active: false, onClick: vi.fn() });
    expect((tree.props as { style?: unknown }).style).toBeUndefined();
  });

  it('falls through to var(--ice-accent) when active and no color is supplied', () => {
    const tree = render({ label: 'X', active: true, onClick: vi.fn() });
    const style = (tree.props as { style: Record<string, string> }).style;
    expect(style.backgroundColor).toBe('var(--ice-accent)20');
    expect(style.color).toBe('var(--ice-accent)');
    expect(style['--tw-ring-color']).toBe('var(--ice-accent)66');
  });

  it('uses the supplied color when active and color set', () => {
    const tree = render({ label: 'X', active: true, color: '#3b82f6', onClick: vi.fn() });
    const style = (tree.props as { style: Record<string, string> }).style;
    expect(style.backgroundColor).toBe('#3b82f620');
    expect(style.color).toBe('#3b82f6');
    expect(style['--tw-ring-color']).toBe('#3b82f666');
  });

  it('ignores the color prop when inactive', () => {
    const tree = render({ label: 'X', active: false, color: '#a855f7', onClick: vi.fn() });
    expect((tree.props as { style?: unknown }).style).toBeUndefined();
  });
});

// ─── Icon ─────────────────────────────────────────────────────────────────

describe('FilterChip — icon', () => {
  it('omits the icon element when icon prop is undefined', () => {
    const tree = render({ label: 'X', active: false, onClick: vi.fn() });
    const fns = (n: React.ReactNode) => {
      const out: string[] = [];
      for (const el of walk(n)) {
        const dn = (el.type as { displayName?: string })?.displayName;
        if (dn) out.push(dn);
      }
      return out;
    };
    expect(fns(tree)).not.toContain('LayoutTemplate');
    expect(fns(tree)).not.toContain('Zap');
  });

  it('renders the supplied lucide icon', () => {
    const tree = render({ label: 'X', icon: LayoutTemplate, active: false, onClick: vi.fn() });
    const fns = (n: React.ReactNode) => {
      const out: string[] = [];
      for (const el of walk(n)) {
        const dn = (el.type as { displayName?: string })?.displayName;
        if (dn) out.push(dn);
      }
      return out;
    };
    expect(fns(tree)).toContain('LayoutTemplate');
  });

  it('passes the w-3 h-3 class + aria-hidden to the icon', () => {
    const tree = render({ label: 'X', icon: Zap, active: false, onClick: vi.fn() });
    const icons = findByPredicate(tree, (el) => (el.type as { displayName?: string })?.displayName === 'Zap');
    expect(icons).toHaveLength(1);
    const cls = (icons[0].props as { className: string }).className;
    expect(cls).toBe('w-3 h-3');
    expect((icons[0].props as { ['aria-hidden']: string })['aria-hidden']).toBe('true');
  });
});

// ─── Count ────────────────────────────────────────────────────────────────

describe('FilterChip — count', () => {
  it('omits the count span when count is undefined', () => {
    const tree = render({ label: 'X', active: false, onClick: vi.fn() });
    const counts = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('tabular-nums'),
    );
    expect(counts).toHaveLength(0);
  });

  it('renders the count span when count is 0 (count != null still passes)', () => {
    const tree = render({ label: 'X', active: false, count: 0, onClick: vi.fn() });
    const counts = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('tabular-nums'),
    );
    expect(counts).toHaveLength(1);
    expect((counts[0].props as { children: unknown }).children).toBe(0);
  });

  it('renders the count value as the span child when count is set', () => {
    const tree = render({ label: 'X', active: false, count: 42, onClick: vi.fn() });
    const counts = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('tabular-nums'),
    );
    expect((counts[0].props as { children: unknown }).children).toBe(42);
  });
});
