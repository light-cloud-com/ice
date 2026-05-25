/**
 * Tests for `SvgRegionLabel` — a faint tinted SVG region rectangle with a
 * top-left label. No interactivity (pointerEvents: none, aria-hidden).
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { SvgRegionLabel } from '..';
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
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && el.type === type) out.push(el);
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

const renderRegion = (node: CanvasNode): React.ReactElement => {
  const Inner = (SvgRegionLabel as unknown as { type: (p: { node: CanvasNode }) => React.ReactElement }).type;
  return Inner({ node });
};

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'rl-1',
  type: 'container',
  x: 50,
  y: 100,
  width: 500,
  height: 400,
  label: '',
  data: {},
  ...overrides,
});

describe('SvgRegionLabel — memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    expect(typeof (SvgRegionLabel as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
  });

  it('carries displayName "SvgRegionLabel"', () => {
    expect((SvgRegionLabel as unknown as { displayName: string }).displayName).toBe('SvgRegionLabel');
  });
});

describe('SvgRegionLabel — outer <g>', () => {
  it('returns a <g> with className "svg-region-label" and pointerEvents: none', () => {
    const tree = renderRegion(makeNode());
    expect(tree.type).toBe('g');
    const props = tree.props as { className: string; style: { pointerEvents: string }; 'aria-hidden': string };
    expect(props.className).toBe('svg-region-label');
    expect(props.style.pointerEvents).toBe('none');
    expect(props['aria-hidden']).toBe('true');
  });
});

describe('SvgRegionLabel — geometry', () => {
  it('rect uses x/y from node and width/height >= node dimensions', () => {
    const tree = renderRegion(makeNode({ x: 10, y: 20, width: 600, height: 500 }));
    const rect = findByType(tree, 'rect')[0];
    const p = rect.props as { x: number; y: number; width: number; height: number; rx: number };
    expect(p.x).toBe(10);
    expect(p.y).toBe(20);
    expect(p.width).toBe(600);
    expect(p.height).toBe(500);
    expect(p.rx).toBe(12);
  });

  it('rect width has min 300 (clamps narrow regions)', () => {
    const tree = renderRegion(makeNode({ width: 100 }));
    const rect = findByType(tree, 'rect')[0];
    expect((rect.props as { width: number }).width).toBe(300);
  });

  it('rect height has min 200', () => {
    const tree = renderRegion(makeNode({ height: 50 }));
    const rect = findByType(tree, 'rect')[0];
    expect((rect.props as { height: number }).height).toBe(200);
  });

  it('uses 400/300 defaults when width/height are 0', () => {
    const tree = renderRegion(makeNode({ width: 0, height: 0 }));
    const rect = findByType(tree, 'rect')[0];
    const p = rect.props as { width: number; height: number };
    expect(p.width).toBe(400);
    expect(p.height).toBe(300);
  });
});

describe('SvgRegionLabel — label rendering', () => {
  it('renders the label as text positioned at (x+10, y+16)', () => {
    const tree = renderRegion(makeNode({ x: 100, y: 200, label: 'My Region' }));
    const text = findByType(tree, 'text')[0];
    const p = text.props as { x: number; y: number };
    expect(p.x).toBe(110);
    expect(p.y).toBe(216);
    expect(collectText(text)).toBe('My Region');
  });

  it('falls back to last segment of iceType when label empty', () => {
    const tree = renderRegion(makeNode({ label: '', data: { iceType: 'Region.US' } }));
    const text = findByType(tree, 'text')[0];
    expect(collectText(text)).toBe('US');
  });

  it('falls back to undefined gracefully when label and iceType both empty', () => {
    const tree = renderRegion(makeNode({ label: '', data: {} }));
    const text = findByType(tree, 'text')[0];
    // pop on '' returns ''.
    expect(collectText(text)).toBe('');
  });
});

describe('SvgRegionLabel — style fallback', () => {
  it('falls back to REGION_STYLES.default when iceType is unknown', () => {
    const tree = renderRegion(makeNode({ data: { iceType: 'Not.A.Region' } }));
    const rect = findByType(tree, 'rect')[0];
    const text = findByType(tree, 'text')[0];
    // Both rect.fill and text.fill should resolve to non-empty strings.
    expect(typeof (rect.props as { fill: string }).fill).toBe('string');
    expect(typeof (text.props as { fill: string }).fill).toBe('string');
  });

  it('handles missing iceType gracefully (treats as default)', () => {
    const tree = renderRegion(makeNode({ data: {} }));
    const rect = findByType(tree, 'rect')[0];
    expect((rect.props as { fill: string }).fill).toBeTruthy();
  });
});
