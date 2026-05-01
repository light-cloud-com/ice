/**
 * rf-cost-4 — Section (collapsible).
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 pattern).
 *
 * `useState` is patched via `vi.mock('react')` (cite
 * `queued-ref-dispatch-extends-the-mutable-ref-usestate-mock-to-multi-state-fcs`)
 * with a single slot for `open`. The test fixture controls `open` per
 * test by writing into `mocks.openRef.current` before invoking the FC.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChevronRight, Zap } from 'lucide-react';

// ─── Hoisted mocks ────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  openRef: { current: true as boolean },
  setOpenSpy: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const patchedUseState = vi.fn(() => [mocks.openRef.current, mocks.setOpenSpy] as const);
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    default: {
      ...actualDefault,
      useState: patchedUseState,
    },
  };
});

// ─── Imports must come AFTER vi.mock ──────────────────────────────────────

// eslint-disable-next-line import/first
import { Section, type SectionProps } from '../section';

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

function render(props: SectionProps): React.ReactElement {
  return (Section as unknown as (p: SectionProps) => React.ReactElement)(props);
}

beforeEach(() => {
  mocks.openRef.current = true;
  mocks.setOpenSpy.mockReset();
});

// ─── Wrapper structure ────────────────────────────────────────────────────

describe('Section — wrapper structure', () => {
  it('wraps in a bordered div', () => {
    const tree = render({ title: 'X', children: 'body' });
    expect(tree.type).toBe('div');
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('border-b');
    expect(cls).toContain('border-ice-border');
  });

  it('renders the title verbatim inside the flex-1 span', () => {
    const tree = render({ title: 'Costs', children: null });
    const titleSpans = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'Costs',
    );
    expect(titleSpans).toHaveLength(1);
    const cls = (titleSpans[0].props as { className: string }).className;
    expect(cls).toContain('flex-1');
    expect(cls).toContain('text-left');
  });

  it('header button gets uppercase + transition classes', () => {
    const tree = render({ title: 'X', children: null });
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    expect(buttons).toHaveLength(1);
    const cls = (buttons[0].props as { className: string }).className;
    expect(cls).toContain('uppercase');
    expect(cls).toContain('tracking-wider');
    expect(cls).toContain('text-ice-text-3');
    expect(cls).toContain('hover:bg-ice-hover');
  });
});

// ─── Chevron rotation ─────────────────────────────────────────────────────

describe('Section — chevron rotation', () => {
  it('chevron has rotate-90 when open', () => {
    mocks.openRef.current = true;
    const tree = render({ title: 'X', children: null });
    const chevs = findByPredicate(tree, (el) => el.type === ChevronRight);
    expect(chevs).toHaveLength(1);
    expect((chevs[0].props as { className: string }).className).toContain('rotate-90');
  });

  it('chevron does NOT have rotate-90 when closed', () => {
    mocks.openRef.current = false;
    const tree = render({ title: 'X', children: null });
    const chevs = findByPredicate(tree, (el) => el.type === ChevronRight);
    expect(chevs).toHaveLength(1);
    expect((chevs[0].props as { className: string }).className).not.toContain('rotate-90');
  });

  it('chevron has w-3 h-3 transition-transform classes', () => {
    const tree = render({ title: 'X', children: null });
    const chevs = findByPredicate(tree, (el) => el.type === ChevronRight);
    const cls = (chevs[0].props as { className: string }).className;
    expect(cls).toContain('w-3');
    expect(cls).toContain('h-3');
    expect(cls).toContain('transition-transform');
  });
});

// ─── Optional icon ────────────────────────────────────────────────────────

describe('Section — optional icon', () => {
  it('renders the icon when provided', () => {
    const tree = render({
      title: 'X',
      icon: <Zap className="w-3 h-3 marker-icon" />,
      children: null,
    });
    const zapIcons = findByPredicate(tree, (el) => el.type === Zap);
    expect(zapIcons).toHaveLength(1);
  });

  it('omits the icon slot when none is passed', () => {
    const tree = render({ title: 'X', children: null });
    const zapIcons = findByPredicate(tree, (el) => el.type === Zap);
    expect(zapIcons).toHaveLength(0);
  });
});

// ─── Body visibility ──────────────────────────────────────────────────────

describe('Section — body', () => {
  it('renders the body when open', () => {
    mocks.openRef.current = true;
    const child = React.createElement('p', { 'data-marker': 'inner' }, 'inner');
    const tree = render({ title: 'X', children: child });
    const markers = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { 'data-marker'?: string })['data-marker'] === 'inner',
    );
    expect(markers).toHaveLength(1);
  });

  it('hides the body when closed', () => {
    mocks.openRef.current = false;
    const child = React.createElement('p', { 'data-marker': 'inner' }, 'inner');
    const tree = render({ title: 'X', children: child });
    const markers = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { 'data-marker'?: string })['data-marker'] === 'inner',
    );
    expect(markers).toHaveLength(0);
  });

  it('body lives in a px-3 pb-3 container', () => {
    mocks.openRef.current = true;
    const tree = render({ title: 'X', children: 'body' });
    const containers = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const cls = (el.props as { className?: string }).className ?? '';
      return cls.includes('px-3') && cls.includes('pb-3');
    });
    expect(containers).toHaveLength(1);
  });
});

// ─── onClick toggle wiring ────────────────────────────────────────────────

describe('Section — toggle wiring', () => {
  it('clicking the header calls setOpen with the negated value (open → false)', () => {
    mocks.openRef.current = true;
    const tree = render({ title: 'X', children: null });
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    const onClick = (buttons[0].props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.setOpenSpy).toHaveBeenCalledWith(false);
  });

  it('clicking the header calls setOpen with true when starting closed', () => {
    mocks.openRef.current = false;
    const tree = render({ title: 'X', children: null });
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    const onClick = (buttons[0].props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.setOpenSpy).toHaveBeenCalledWith(true);
  });
});
