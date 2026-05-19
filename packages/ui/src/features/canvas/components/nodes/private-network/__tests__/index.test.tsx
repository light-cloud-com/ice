/**
 * Tests for `SvgPrivateNetworkNode` — bespoke renderer for `Network.PrivateNetwork`.
 *
 * Renders header (icon + title + ingress subtitle) + body drop zone inside
 * a foreignObject card. Border picks among dragOver / valid / invalid /
 * selected / hovered / faded states. Subtitle copy + icon glyph swap on
 * `data.ingress` (`'all' | 'allowlist' | 'none'`).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    hoverValue: false as boolean,
    setHoverSpy: vi.fn(),
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initialValue = typeof init === 'function' ? (init as () => T)() : init;
      if (typeof initialValue === 'boolean') {
        return [mocks.state.hoverValue as unknown as T, mocks.state.setHoverSpy];
      }
      return [initialValue, vi.fn()];
    }),
    useCallback: vi.fn(<T,>(fn: T) => fn),
  };
});

import {
  SvgPrivateNetworkNode,
  computePrivateNetworkWidth,
  computePrivateNetworkHeight,
  PN_HEADER_HEIGHT,
  PN_MIN_WIDTH,
  PN_MIN_HEIGHT,
} from '..';
import type { CanvasNode } from '../../../svg-canvas';

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
function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
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
    const el = n as React.ReactElement;
    visit((el.props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join('');
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'pn-1',
  type: 'block',
  x: 100,
  y: 200,
  width: 600,
  height: 400,
  label: 'Private Network',
  data: {},
  ...overrides,
});

const renderPN = (props: Partial<React.ComponentProps<typeof SvgPrivateNetworkNode>> = {}): React.ReactElement => {
  const Inner = SvgPrivateNetworkNode as React.FC<React.ComponentProps<typeof SvgPrivateNetworkNode>>;
  const defaults: React.ComponentProps<typeof SvgPrivateNetworkNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return Inner({ ...defaults, ...props }) as React.ReactElement;
};

const findCard = (tree: React.ReactElement): React.ReactElement | undefined =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const style = (el.props as { style?: { boxSizing?: string } }).style;
    return style?.boxSizing === 'border-box';
  })[0];

beforeEach(() => {
  mocks.state.hoverValue = false;
  mocks.state.setHoverSpy.mockClear();
});

describe('Layout helpers', () => {
  it('computePrivateNetworkWidth uses min PN_MIN_WIDTH', () => {
    expect(computePrivateNetworkWidth(0)).toBe(PN_MIN_WIDTH);
    expect(computePrivateNetworkWidth(100)).toBe(PN_MIN_WIDTH);
  });

  it('computePrivateNetworkWidth keeps larger widths', () => {
    expect(computePrivateNetworkWidth(800)).toBe(800);
  });

  it('computePrivateNetworkWidth defaults to 0 when no arg → returns PN_MIN_WIDTH', () => {
    expect(computePrivateNetworkWidth()).toBe(PN_MIN_WIDTH);
  });

  it('computePrivateNetworkHeight uses min PN_MIN_HEIGHT', () => {
    expect(computePrivateNetworkHeight(0)).toBe(PN_MIN_HEIGHT);
    expect(computePrivateNetworkHeight(100)).toBe(PN_MIN_HEIGHT);
  });

  it('computePrivateNetworkHeight keeps larger values', () => {
    expect(computePrivateNetworkHeight(500)).toBe(500);
  });

  it('computePrivateNetworkHeight defaults to 0', () => {
    expect(computePrivateNetworkHeight()).toBe(PN_MIN_HEIGHT);
  });
});

describe('SvgPrivateNetworkNode — displayName + outer <g>', () => {
  it('carries displayName "SvgPrivateNetworkNode"', () => {
    expect(SvgPrivateNetworkNode.displayName).toBe('SvgPrivateNetworkNode');
  });

  it('outer is <g>', () => {
    const tree = renderPN();
    expect(tree.type).toBe('g');
  });
});

describe('SvgPrivateNetworkNode — header subtitle copy', () => {
  it('"Sealed · internal only" when ingress=none', () => {
    const tree = renderPN({ node: makeNode({ data: { ingress: 'none' } }) });
    expect(collectText(tree)).toContain('Sealed · internal only');
  });

  it('"Restricted · allowlist" when ingress=allowlist', () => {
    const tree = renderPN({ node: makeNode({ data: { ingress: 'allowlist' } }) });
    expect(collectText(tree)).toContain('Restricted · allowlist');
  });

  it('"Open · public reachable" when ingress=all', () => {
    const tree = renderPN({ node: makeNode({ data: { ingress: 'all' } }) });
    expect(collectText(tree)).toContain('Open · public reachable');
  });

  it('"Open · public reachable" by default (no ingress data)', () => {
    const tree = renderPN({ node: makeNode() });
    expect(collectText(tree)).toContain('Open · public reachable');
  });

  it('coerces unknown ingress values to "all"', () => {
    const tree = renderPN({ node: makeNode({ data: { ingress: 'something-else' } }) });
    expect(collectText(tree)).toContain('Open · public reachable');
  });
});

describe('SvgPrivateNetworkNode — title rendering', () => {
  it('renders node.label as title', () => {
    const tree = renderPN({ node: makeNode({ label: 'My Network' }) });
    expect(collectText(tree)).toContain('My Network');
  });

  it('falls back to "Private Network" when label empty', () => {
    const tree = renderPN({ node: makeNode({ label: '' }) });
    expect(collectText(tree)).toContain('Private Network');
  });
});

describe('SvgPrivateNetworkNode — icon glyph swap on ingress', () => {
  // Each variant uses a different lucide icon component as `type`. We can't
  // check by import (we don't import them in test), but the ingress branches
  // produce different React types — so we collect the icon containers and
  // assert the type identity changes. As a simpler check, assert no throw +
  // tree renders.
  it('icon renders for all 3 ingress states without throwing', () => {
    expect(() => renderPN({ node: makeNode({ data: { ingress: 'all' } }) })).not.toThrow();
    expect(() => renderPN({ node: makeNode({ data: { ingress: 'allowlist' } }) })).not.toThrow();
    expect(() => renderPN({ node: makeNode({ data: { ingress: 'none' } }) })).not.toThrow();
  });
});

describe('SvgPrivateNetworkNode — accent color (icon container background) per ingress', () => {
  // The header has an icon container <div> with `background: ACCENT+25`.
  // ACCENT differs by ingress. We verify the colour string contains the
  // expected hex root.
  const findIconContainer = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { width?: number; height?: number; borderRadius?: number } }).style;
      return style?.width === 28 && style?.height === 28 && style?.borderRadius === 6;
    })[0];

  it('slate-600 (#475569) when ingress=none', () => {
    const tree = renderPN({ node: makeNode({ data: { ingress: 'none' } }) });
    const ic = findIconContainer(tree)!;
    expect((ic.props as { style: { background: string } }).style.background).toContain('#475569');
  });

  it('amber-600 (#d97706) when ingress=allowlist', () => {
    const tree = renderPN({ node: makeNode({ data: { ingress: 'allowlist' } }) });
    const ic = findIconContainer(tree)!;
    expect((ic.props as { style: { background: string } }).style.background).toContain('#d97706');
  });

  it('red-600 (#dc2626) when ingress=all (default)', () => {
    const tree = renderPN({ node: makeNode() });
    const ic = findIconContainer(tree)!;
    expect((ic.props as { style: { background: string } }).style.background).toContain('#dc2626');
  });
});

describe('SvgPrivateNetworkNode — border colour priority', () => {
  it('cyan when isDragOver', () => {
    const card = findCard(renderPN({ isDragOver: true, isSelected: true }))!;
    expect((card.props as { style: { border: string } }).style.border).toContain('#22d3ee');
  });

  it('green when valid-target (no dragOver)', () => {
    const card = findCard(renderPN({ connectionDragState: 'valid-target' }))!;
    expect((card.props as { style: { border: string } }).style.border).toContain('#22c55e');
  });

  it('red when invalid-target', () => {
    const card = findCard(renderPN({ connectionDragState: 'invalid-target' }))!;
    expect((card.props as { style: { border: string } }).style.border).toContain('#ef4444');
  });

  it('category glow when isSelected', () => {
    const card = findCard(renderPN({ isSelected: true }))!;
    const border = (card.props as { style: { border: string } }).style.border;
    expect(border.endsWith('55')).toBe(false);
  });

  it('faded glow when default (not selected/hovered)', () => {
    const card = findCard(renderPN())!;
    expect((card.props as { style: { border: string } }).style.border.endsWith('55')).toBe(true);
  });

  it('full glow border when hovered (mocked)', () => {
    mocks.state.hoverValue = true;
    const card = findCard(renderPN())!;
    expect((card.props as { style: { border: string } }).style.border.endsWith('55')).toBe(false);
  });
});

describe('SvgPrivateNetworkNode — opacity', () => {
  it('opacity 0.85 when connectionDragState=source', () => {
    const card = findCard(renderPN({ connectionDragState: 'source' }))!;
    expect((card.props as { style: { opacity: number } }).style.opacity).toBe(0.85);
  });

  it('opacity 1 by default', () => {
    const card = findCard(renderPN())!;
    expect((card.props as { style: { opacity: number } }).style.opacity).toBe(1);
  });
});

describe('SvgPrivateNetworkNode — hover handlers', () => {
  it('onMouseEnter sets hover + calls onNodeHover(id)', () => {
    const onNodeHover = vi.fn();
    const tree = renderPN({ node: makeNode({ id: 'pn-7' }), onNodeHover });
    const card = findCard(tree)!;
    (card.props as { onMouseEnter: () => void }).onMouseEnter();
    expect(mocks.state.setHoverSpy).toHaveBeenCalledWith(true);
    expect(onNodeHover).toHaveBeenCalledWith('pn-7');
  });

  it('onMouseLeave clears hover + calls onNodeHover(null)', () => {
    const onNodeHover = vi.fn();
    const tree = renderPN({ onNodeHover });
    const card = findCard(tree)!;
    (card.props as { onMouseLeave: () => void }).onMouseLeave();
    expect(mocks.state.setHoverSpy).toHaveBeenCalledWith(false);
    expect(onNodeHover).toHaveBeenCalledWith(null);
  });

  it('hover handlers no-op when onNodeHover undefined', () => {
    const tree = renderPN();
    const card = findCard(tree)!;
    expect(() => (card.props as { onMouseEnter: () => void }).onMouseEnter()).not.toThrow();
    expect(() => (card.props as { onMouseLeave: () => void }).onMouseLeave()).not.toThrow();
  });
});

describe('SvgPrivateNetworkNode — drop hint copy', () => {
  it('renders "drop services here" hint text', () => {
    const tree = renderPN();
    expect(collectText(tree)).toContain('drop services here');
  });

  it('hint opacity is 0.7 when hovered', () => {
    mocks.state.hoverValue = true;
    const tree = renderPN();
    const hint = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { textTransform?: string; letterSpacing?: string } }).style;
      return style?.textTransform === 'uppercase' && style?.letterSpacing === '0.08em';
    })[0];
    expect(hint).toBeDefined();
    expect((hint.props as { style: { opacity: number } }).style.opacity).toBe(0.7);
  });

  it('hint opacity is 0.7 when isDragOver', () => {
    const tree = renderPN({ isDragOver: true });
    const hint = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { textTransform?: string; letterSpacing?: string } }).style;
      return style?.textTransform === 'uppercase' && style?.letterSpacing === '0.08em';
    })[0];
    expect((hint.props as { style: { opacity: number } }).style.opacity).toBe(0.7);
  });

  it('hint opacity is 0.35 when neither hovered nor dragOver', () => {
    const tree = renderPN();
    const hint = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { textTransform?: string; letterSpacing?: string } }).style;
      return style?.textTransform === 'uppercase' && style?.letterSpacing === '0.08em';
    })[0];
    expect((hint.props as { style: { opacity: number } }).style.opacity).toBe(0.35);
  });
});

describe('SvgPrivateNetworkNode — header height', () => {
  it('header div uses PN_HEADER_HEIGHT', () => {
    const tree = renderPN();
    const header = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { height?: number; borderBottom?: string } }).style;
      return style?.height === PN_HEADER_HEIGHT && typeof style?.borderBottom === 'string';
    })[0];
    expect(header).toBeDefined();
  });
});
