/**
 * rf-ppanel-2 — Section.
 *
 * Direct-FC tree-walker tests (cite
 * `lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates`):
 * the Section receives a lucide icon as the `icon` prop and renders it inline,
 * which means the rendered element's `type` is a forwardRef object. We
 * filter by reference equality to pin the icon.
 *
 * `cn()` is the shared classnames helper — no need to mock; it just joins
 * truthy strings.
 */

import { Zap, Loader2 } from 'lucide-react';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { Section } from '../section';
import type { SectionProps } from '../section';

function render(props: SectionProps): React.ReactElement {
  return (Section as unknown as (p: SectionProps) => React.ReactElement)(props);
}

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
  yield* walk(children);
}

describe('Section', () => {
  it('wraps content in a bordered, padded div', () => {
    const tree = render({ title: 'Source', icon: Zap, children: 'body' });
    expect(tree.type).toBe('div');
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('px-4');
    expect(cls).toContain('py-3');
    expect(cls).toContain('border-b');
    expect(cls).toContain('border-ice-border');
  });

  it('renders the title verbatim inside the uppercase span', () => {
    const tree = render({ title: 'Triggers', icon: Zap, children: null });
    const titleSpans: React.ReactElement[] = [];
    for (const el of walk(tree)) {
      if (el.type === 'span' && (el.props as { children?: unknown }).children === 'Triggers') {
        titleSpans.push(el);
      }
    }
    expect(titleSpans.length).toBe(1);
    const cls = (titleSpans[0].props as { className: string }).className;
    expect(cls).toContain('uppercase');
    expect(cls).toContain('tracking-wider');
    expect(cls).toContain('text-ice-text-2');
    expect(cls).toContain('font-semibold');
  });

  it('forwards the icon (as `el.type === Zap`) and applies default classes', () => {
    const tree = render({ title: 'Source', icon: Zap, children: null });
    const icons: React.ReactElement[] = [];
    for (const el of walk(tree)) {
      if (el.type === Zap) icons.push(el);
    }
    expect(icons.length).toBe(1);
    const cls = (icons[0].props as { className: string }).className;
    expect(cls).toContain('w-3.5');
    expect(cls).toContain('h-3.5');
    expect(cls).toContain('text-ice-text-3');
  });

  it('appends iconClassName onto the icon (used to spin Loader2)', () => {
    const tree = render({ title: 'Active', icon: Loader2, iconClassName: 'animate-spin', children: null });
    const icons: React.ReactElement[] = [];
    for (const el of walk(tree)) {
      if (el.type === Loader2) icons.push(el);
    }
    expect(icons.length).toBe(1);
    const cls = (icons[0].props as { className: string }).className;
    expect(cls).toContain('animate-spin');
    // Default classes still present after cn() merge.
    expect(cls).toContain('w-3.5');
    expect(cls).toContain('text-ice-text-3');
  });

  it('renders children verbatim under the title row', () => {
    const child = React.createElement('p', { 'data-marker': 'inner' }, 'inner-text');
    const tree = render({ title: 'X', icon: Zap, children: child });
    const markers: React.ReactElement[] = [];
    for (const el of walk(tree)) {
      if (el.type === 'p' && (el.props as { 'data-marker'?: string })['data-marker'] === 'inner') {
        markers.push(el);
      }
    }
    expect(markers.length).toBe(1);
  });

  it('handles a null children prop without crashing', () => {
    expect(() => render({ title: 'X', icon: Zap, children: null })).not.toThrow();
  });
});
