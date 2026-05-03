/**
 * Tests for `CardShell` — the SVG+foreignObject card wrapper that bespoke
 * canvas nodes drop content into.
 *
 * Branches under test:
 *   - title fallback chain (title → label → '').
 *   - subtitle conditional render.
 *   - accent override vs derived from CATEGORY_STYLE[category] (with fallback default).
 *   - border / boxShadow drift across (isSelected, isHovered, isSource).
 *   - hover state via mocked useState (controllable).
 *   - onEnter/onLeave fire onNodeHover with id / null.
 *   - headerHeight default 48 / custom.
 *   - headerTrailing rendered after the ConceptInfoTrigger.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ConceptInfoTrigger: vi.fn(() => null),
  hoverValue: false as boolean,
  setHoverSpy: vi.fn(),
}));

vi.mock('../../../../../concept-info', () => ({
  ConceptInfoTrigger: mocks.ConceptInfoTrigger,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initial = typeof init === 'function' ? (init as () => T)() : init;
      if (typeof initial === 'boolean') {
        return [mocks.hoverValue as unknown as T, mocks.setHoverSpy];
      }
      return [initial, vi.fn()];
    }),
    useCallback: vi.fn(<T,>(fn: T, _deps: unknown[]) => fn),
  };
});

import { CardShell } from '../card-shell';
import type { LucideIcon } from 'lucide-react';

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

const findByType = (tree: React.ReactNode, type: unknown) =>
  [...walk(tree)].filter((el) => el.type === type);

const findByPredicate = (tree: React.ReactNode, p: (el: React.ReactElement) => boolean) =>
  [...walk(tree)].filter(p);

const FakeIcon: LucideIcon = (() => null) as unknown as LucideIcon;

type Node = React.ComponentProps<typeof CardShell>['node'];

const makeNode = (overrides: Partial<Node> = {}): Node => ({
  id: 'n1',
  type: 'block' as const,
  x: 100,
  y: 200,
  width: 300,
  height: 200,
  label: 'My Block',
  data: {},
  ...overrides,
});

const renderInner = (props: Partial<React.ComponentProps<typeof CardShell>> = {}): React.ReactElement => {
  const full: React.ComponentProps<typeof CardShell> = {
    node: makeNode(),
    isSelected: false,
    icon: FakeIcon,
    children: React.createElement('span', { 'data-stub': 'body' }),
    ...props,
  };
  return CardShell(full) as React.ReactElement;
};

beforeEach(() => {
  mocks.hoverValue = false;
  mocks.setHoverSpy.mockClear();
  mocks.ConceptInfoTrigger.mockClear();
});

describe('CardShell', () => {
  it('renders a foreignObject sized to the node bounds', () => {
    const tree = renderInner({ node: makeNode({ x: 10, y: 20, width: 200, height: 150 }) });
    const fo = findByType(tree, 'foreignObject')[0];
    const props = fo.props as { x: number; y: number; width: number; height: number };
    expect(props.x).toBe(10);
    expect(props.y).toBe(20);
    expect(props.width).toBe(200);
    expect(props.height).toBe(150);
  });

  it('falls back to node.label when no title is supplied', () => {
    const tree = renderInner({ node: makeNode({ label: 'Custom Label' }) });
    const text = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'Custom Label',
    );
    expect(text).toHaveLength(1);
  });

  it('uses title when supplied (overrides node.label)', () => {
    const tree = renderInner({ node: makeNode({ label: 'Label' }), title: 'Title Wins' });
    const titleEl = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'Title Wins',
    );
    expect(titleEl).toHaveLength(1);
  });

  it('falls back to empty string when neither title nor label is set', () => {
    const tree = renderInner({ node: makeNode({ label: undefined as unknown as string }) });
    const titleEl = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { children?: unknown }).children === '',
    );
    expect(titleEl.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the subtitle line when subtitle is provided', () => {
    const tree = renderInner({ subtitle: 'a small caption' });
    const sub = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'a small caption',
    );
    expect(sub).toHaveLength(1);
  });

  it('omits the subtitle line when subtitle is not provided', () => {
    const tree = renderInner();
    const possibleSubs = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        (el.props as { style?: Record<string, string | number> }).style?.fontSize === 11,
    );
    expect(possibleSubs).toHaveLength(0);
  });

  it('renders the icon prop with size=16 + the accent color', () => {
    const tree = renderInner({ accentColor: '#abcdef' });
    const icons = findByType(tree, FakeIcon);
    expect(icons).toHaveLength(1);
    const props = icons[0].props as { size: number; style: Record<string, string> };
    expect(props.size).toBe(16);
    expect(props.style.color).toBe('#abcdef');
  });

  it('uses the explicit accentColor when supplied (overrides category-derived)', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Compute.Function' } }),
      accentColor: '#ff00ff',
    });
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { style?: Record<string, string | number> }).style?.border === 'string',
    )[0];
    const style = (inner.props as { style: Record<string, string> }).style;
    expect(style.border).toContain('#ff00ff55');
  });

  it('derives accent from CATEGORY_STYLE[default] when iceType is missing', () => {
    const tree = renderInner({ node: makeNode({ data: {} }) });
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { style?: Record<string, string | number> }).style?.border === 'string',
    )[0];
    expect(inner).toBeDefined();
  });

  it('falls back to CATEGORY_STYLE.default when iceType category is unknown', () => {
    // iceType = 'NotARealCategory.X' → category = 'NotARealCategory'.
    // CATEGORY_STYLE['NotARealCategory'] is undefined → || branch picks CATEGORY_STYLE.default
    // whose glow is 'var(--ice-border-strong)'.
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'NotARealCategory.X' } }),
    });
    const icon = findByType(tree, FakeIcon)[0];
    const props = icon.props as { style: Record<string, string> };
    expect(props.style.color).toBe('var(--ice-border-strong)');
  });

  it('uses the unhovered-unselected border (accent + 55 alpha)', () => {
    mocks.hoverValue = false;
    const tree = renderInner({ accentColor: '#22c55e' });
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { style?: Record<string, string | number> }).style?.border === 'string',
    )[0];
    const style = (inner.props as { style: Record<string, string> }).style;
    expect(style.border).toBe('1px solid #22c55e55');
  });

  it('uses the full accent border when isSelected=true', () => {
    const tree = renderInner({ isSelected: true, accentColor: '#22c55e' });
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { style?: Record<string, string | number> }).style?.border === 'string',
    )[0];
    const style = (inner.props as { style: Record<string, string> }).style;
    expect(style.border).toBe('1px solid #22c55e');
  });

  it('uses the full accent border when isHovered=true (mocked)', () => {
    mocks.hoverValue = true;
    const tree = renderInner({ accentColor: '#22c55e' });
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { style?: Record<string, string | number> }).style?.border === 'string',
    )[0];
    const style = (inner.props as { style: Record<string, string> }).style;
    expect(style.border).toBe('1px solid #22c55e');
  });

  it('boxShadow shows the selected glow when isSelected=true', () => {
    const tree = renderInner({ isSelected: true, accentColor: '#22c55e' });
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { style?: Record<string, string | number> }).style?.boxShadow === 'string',
    )[0];
    const style = (inner.props as { style: Record<string, string> }).style;
    expect(style.boxShadow).toContain('#22c55e');
  });

  it('boxShadow uses the hover shadow when only hovered (not selected)', () => {
    mocks.hoverValue = true;
    const tree = renderInner({ accentColor: '#22c55e' });
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { style?: Record<string, string | number> }).style?.boxShadow === 'string',
    )[0];
    const style = (inner.props as { style: Record<string, string> }).style;
    expect(style.boxShadow).toBe('0 2px 8px -2px rgba(0,0,0,0.15)');
  });

  it('boxShadow falls back to a quiet 1px shadow when neither selected nor hovered', () => {
    const tree = renderInner();
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { style?: Record<string, string | number> }).style?.boxShadow === 'string',
    )[0];
    const style = (inner.props as { style: Record<string, string> }).style;
    expect(style.boxShadow).toBe('0 1px 3px rgba(0,0,0,0.06)');
  });

  it('opacity drops to 0.85 when connectionDragState=source', () => {
    const tree = renderInner({ connectionDragState: 'source' });
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { style?: Record<string, string | number> }).style?.opacity === 'number',
    )[0];
    const style = (inner.props as { style: Record<string, string | number> }).style;
    expect(style.opacity).toBe(0.85);
  });

  it('opacity stays at 1 for non-source connection drag states', () => {
    const tree = renderInner({ connectionDragState: 'valid-target' });
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { style?: Record<string, string | number> }).style?.opacity === 'number',
    )[0];
    const style = (inner.props as { style: Record<string, string | number> }).style;
    expect(style.opacity).toBe(1);
  });

  it('onEnter calls setIsHovered(true) and onNodeHover(node.id)', () => {
    const onNodeHover = vi.fn();
    const tree = renderInner({ onNodeHover });
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { onMouseEnter?: unknown }).onMouseEnter === 'function',
    )[0];
    const handler = (inner.props as { onMouseEnter: () => void }).onMouseEnter;
    handler();
    expect(mocks.setHoverSpy).toHaveBeenCalledWith(true);
    expect(onNodeHover).toHaveBeenCalledWith('n1');
  });

  it('onLeave calls setIsHovered(false) and onNodeHover(null)', () => {
    const onNodeHover = vi.fn();
    const tree = renderInner({ onNodeHover });
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { onMouseLeave?: unknown }).onMouseLeave === 'function',
    )[0];
    (inner.props as { onMouseLeave: () => void }).onMouseLeave();
    expect(mocks.setHoverSpy).toHaveBeenCalledWith(false);
    expect(onNodeHover).toHaveBeenCalledWith(null);
  });

  it('onEnter / onLeave do not throw when onNodeHover is omitted', () => {
    const tree = renderInner();
    const inner = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { onMouseEnter?: unknown }).onMouseEnter === 'function',
    )[0];
    expect(() => (inner.props as { onMouseEnter: () => void }).onMouseEnter()).not.toThrow();
    expect(() => (inner.props as { onMouseLeave: () => void }).onMouseLeave()).not.toThrow();
  });

  it('forwards iceType + display name + opacity into ConceptInfoTrigger (hovered)', () => {
    mocks.hoverValue = true;
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Compute.Function' } }),
      title: 'CF',
    });
    const trigger = findByType(tree, mocks.ConceptInfoTrigger)[0];
    const args = trigger.props as Record<string, unknown>;
    expect(args.iceType).toBe('Compute.Function');
    expect(args.displayName).toBe('CF');
    expect(args.opacity).toBe(0.85);
  });

  it('forwards lower opacity into ConceptInfoTrigger when not hovered', () => {
    mocks.hoverValue = false;
    const tree = renderInner({ node: makeNode({ data: { iceType: 'Compute.Function' } }) });
    const trigger = findByType(tree, mocks.ConceptInfoTrigger)[0];
    expect((trigger.props as { opacity: number }).opacity).toBe(0.4);
  });

  it('uses node.label for ConceptInfoTrigger displayName when no title', () => {
    const tree = renderInner({ node: makeNode({ label: 'Block X' }) });
    const trigger = findByType(tree, mocks.ConceptInfoTrigger)[0];
    expect((trigger.props as { displayName: string }).displayName).toBe('Block X');
  });

  it('uses empty string for ConceptInfoTrigger displayName when no title and no label', () => {
    const tree = renderInner({ node: makeNode({ label: undefined as unknown as string }) });
    const trigger = findByType(tree, mocks.ConceptInfoTrigger)[0];
    expect((trigger.props as { displayName: string }).displayName).toBe('');
  });

  it('renders the headerTrailing slot after the title block', () => {
    const trailing = React.createElement('span', { 'data-stub': 'trailing' });
    const tree = renderInner({ headerTrailing: trailing });
    const hits = findByPredicate(
      tree,
      (el) => (el.props as { 'data-stub'?: string })['data-stub'] === 'trailing',
    );
    expect(hits).toHaveLength(1);
  });

  it('renders the body children inside the body slot', () => {
    const tree = renderInner({ children: React.createElement('p', { 'data-stub': 'body-p' }) });
    const hits = findByPredicate(
      tree,
      (el) => (el.props as { 'data-stub'?: string })['data-stub'] === 'body-p',
    );
    expect(hits).toHaveLength(1);
  });

  it('honors a custom headerHeight (minHeight)', () => {
    const tree = renderInner({ headerHeight: 60 });
    const header = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        (el.props as { style?: Record<string, string | number> }).style?.minHeight === 60,
    );
    expect(header.length).toBeGreaterThan(0);
  });

  it('defaults headerHeight to 48 (minHeight)', () => {
    const tree = renderInner();
    const header = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        (el.props as { style?: Record<string, string | number> }).style?.minHeight === 48,
    );
    expect(header.length).toBeGreaterThan(0);
  });

  it('exposes a stable displayName', () => {
    expect(CardShell.displayName).toBe('CardShell');
  });
});
