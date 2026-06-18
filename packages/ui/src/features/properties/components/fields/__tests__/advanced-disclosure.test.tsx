/**
 * AdvancedDisclosure (PE5) — the collapsed "Advanced" section that reveals
 * advanced-tier props on demand. Tree-walked as a plain function with a
 * controllable `useState` so both collapsed and expanded states are covered.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  openValue: false as boolean,
  setOpenSpy: vi.fn(),
}));

vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  // AdvancedDisclosure's only state is the open/closed boolean. The source uses
  // `React.useState`, so patch the default export too (not just the named one).
  const useState = vi.fn(() => [mocks.openValue, mocks.setOpenSpy]);
  return {
    ...actual,
    useState,
    default: { ...(actual as unknown as { default: object }).default, useState },
  };
});

import { AdvancedDisclosure, type HighLevelProperty } from '../render-property-field';

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

const mkProp = (name: string): HighLevelProperty => ({
  name,
  label: name,
  type: 'string',
  required: false,
  description: '',
  tier: 'advanced',
});

const renderRow = (prop: HighLevelProperty) =>
  React.createElement('div', { key: prop.name, 'data-prop-key': prop.name });

const render = () =>
  (
    AdvancedDisclosure as unknown as (p: {
      advanced: HighLevelProperty[];
      renderRow: typeof renderRow;
    }) => React.ReactElement
  )({ advanced: [mkProp('a'), mkProp('b')], renderRow });

const rows = (tree: React.ReactNode) =>
  findByPredicate(
    tree,
    (el) => el.type === 'div' && typeof (el.props as { 'data-prop-key'?: string })['data-prop-key'] === 'string',
  );

const button = (tree: React.ReactNode) => findByPredicate(tree, (el) => el.type === 'button')[0];

beforeEach(() => {
  mocks.openValue = false;
  mocks.setOpenSpy.mockClear();
});

describe('AdvancedDisclosure (PE5)', () => {
  it('shows the toggle with a count but no rows when collapsed', () => {
    mocks.openValue = false;
    const tree = render();
    const btn = button(tree);
    expect((btn.props as { 'aria-expanded': boolean })['aria-expanded']).toBe(false);
    // The "2" count badge is present...
    expect(
      findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 2),
    ).toHaveLength(1);
    // ...but the advanced rows are not rendered while collapsed.
    expect(rows(tree)).toHaveLength(0);
  });

  it('reveals the advanced rows when expanded', () => {
    mocks.openValue = true;
    const tree = render();
    expect((button(tree).props as { 'aria-expanded': boolean })['aria-expanded']).toBe(true);
    expect(rows(tree).map((el) => (el.props as { 'data-prop-key': string })['data-prop-key'])).toEqual(['a', 'b']);
  });

  it('toggles open state when the button is clicked', () => {
    mocks.openValue = false;
    const tree = render();
    (button(tree).props as { onClick: () => void }).onClick();
    expect(mocks.setOpenSpy).toHaveBeenCalledTimes(1);
    // Called with an updater fn that flips the previous value.
    const updater = mocks.setOpenSpy.mock.calls[0][0] as (o: boolean) => boolean;
    expect(updater(false)).toBe(true);
    expect(updater(true)).toBe(false);
  });
});
