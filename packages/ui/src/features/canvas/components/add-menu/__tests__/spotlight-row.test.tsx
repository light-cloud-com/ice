/**
 * SpotlightRow / SpotlightHeader (CD8) — the presentational pieces of the
 * Shift+A spotlight: a row shows the LOCALIZED category label (not the raw
 * iceType category id), and a non-interactive section header groups recent vs
 * catalog. Both are pure FCs, tree-walked via direct invocation.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { SpotlightRow, SpotlightHeader } from '../spotlight';

function* walk(node: React.ReactNode): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as React.ReactNode);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children != null) yield* walk(children);
}
const findByPredicate = (tree: React.ReactNode, p: (el: React.ReactElement) => boolean) => [...walk(tree)].filter(p);
const collectText = (tree: React.ReactNode): string =>
  [...walk(tree)]
    .map((el) => (el.props as { children?: unknown }).children)
    .filter((c) => typeof c === 'string')
    .join(' ');

const FakeIcon = () => null;

const makeCmd = (over: Record<string, unknown> = {}) =>
  ({
    type: 'block',
    name: 'Postgres',
    description: 'Relational DB',
    iceType: 'Database.PostgreSQL',
    category: 'Database',
    origin: { icon: FakeIcon },
    ...over,
  }) as unknown as React.ComponentProps<typeof SpotlightRow>['cmd'];

const renderRow = (props: Partial<React.ComponentProps<typeof SpotlightRow>>) =>
  (SpotlightRow as unknown as (p: React.ComponentProps<typeof SpotlightRow>) => React.ReactElement)({
    cmd: makeCmd(),
    categoryLabel: 'Data',
    highlighted: false,
    onSelect: vi.fn(),
    onHover: vi.fn(),
    ...props,
  });

describe('SpotlightRow (CD8)', () => {
  it('renders the passed (localized) categoryLabel, not the raw cmd.category', () => {
    const tree = renderRow({ cmd: makeCmd({ category: 'Database' }), categoryLabel: 'Data' });
    const text = collectText(tree);
    expect(text).toContain('Data');
    // the raw category id is NOT shown as the category chip
    const chip = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'Database',
    );
    expect(chip).toHaveLength(0);
  });

  it('renders the name + description', () => {
    const tree = renderRow({});
    const text = collectText(tree);
    expect(text).toContain('Postgres');
    expect(text).toContain('Relational DB');
  });

  it('fires onSelect on click and onHover on mouse-enter', () => {
    const onSelect = vi.fn();
    const onHover = vi.fn();
    const tree = renderRow({ onSelect, onHover });
    (tree.props as { onClick: () => void }).onClick();
    (tree.props as { onMouseEnter: () => void }).onMouseEnter();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenCalledTimes(1);
  });
});

describe('SpotlightHeader (CD8)', () => {
  it('renders a non-interactive (aria-hidden) section label', () => {
    const el = (SpotlightHeader as unknown as (p: { label: string }) => React.ReactElement)({ label: 'Recent' });
    expect(el.type).toBe('li');
    expect((el.props as { 'aria-hidden': string })['aria-hidden']).toBe('true');
    expect((el.props as { children: string }).children).toBe('Recent');
    expect((el.props as { style: { pointerEvents: string } }).style.pointerEvents).toBe('none');
  });
});
