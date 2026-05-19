/**
 * Tests for `CanvasGrid` — renders the dotted grid background as an
 * SVG `<pattern>` plus a fill-rect sized to the visible world bounds.
 *
 * Branches under test:
 *   - useMemo passthrough so the orchestrator's bounds calculation runs.
 *   - world bounds derived from viewState (panX/panY/scale) + width/height
 *     plus a 1000px padding on every side.
 *   - pattern element ID + circle radius/fill are pinned (theme regression
 *     guard).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useMemo: vi.fn(<T,>(factory: () => T, _deps: unknown[]) => factory()),
  };
});

import { CanvasGrid } from '../canvas-grid';
import type { ViewState } from '../svg-canvas';

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

const findByType = (tree: React.ReactNode, type: unknown) => [...walk(tree)].filter((el) => el.type === type);

const makeViewState = (overrides: Partial<ViewState> = {}): ViewState =>
  ({ panX: 0, panY: 0, scale: 1, ...overrides }) as ViewState;

describe('CanvasGrid', () => {
  it('renders a pattern + a rect that consumes the pattern by id', () => {
    const tree = CanvasGrid({ viewState: makeViewState(), width: 800, height: 600 });
    const patterns = findByType(tree, 'pattern');
    const rects = findByType(tree, 'rect');
    expect(patterns).toHaveLength(1);
    expect(rects).toHaveLength(1);
    expect((patterns[0].props as { id: string }).id).toBe('canvas-grid-pattern');
    expect((rects[0].props as { fill: string }).fill).toBe('url(#canvas-grid-pattern)');
  });

  it('pattern carries the GRID_SIZE (48) for both width and height', () => {
    const tree = CanvasGrid({ viewState: makeViewState(), width: 800, height: 600 });
    const pattern = findByType(tree, 'pattern')[0];
    const props = pattern.props as { width: number; height: number; patternUnits: string };
    expect(props.width).toBe(48);
    expect(props.height).toBe(48);
    expect(props.patternUnits).toBe('userSpaceOnUse');
  });

  it('inner circle is centered in the pattern with r=1 and a quiet slate fill', () => {
    const tree = CanvasGrid({ viewState: makeViewState(), width: 800, height: 600 });
    const circles = findByType(tree, 'circle');
    expect(circles).toHaveLength(1);
    const props = circles[0].props as { cx: number; cy: number; r: number; fill: string };
    expect(props.cx).toBe(24);
    expect(props.cy).toBe(24);
    expect(props.r).toBe(1);
    expect(props.fill).toBe('rgba(148, 163, 184, 0.6)');
  });

  it('grid bounds expand by 1000px padding on every side at scale=1', () => {
    const tree = CanvasGrid({
      viewState: makeViewState({ panX: 0, panY: 0, scale: 1 }),
      width: 200,
      height: 100,
    });
    const rect = findByType(tree, 'rect')[0];
    const props = rect.props as { x: number; y: number; width: number; height: number };
    // worldLeft = -0/1 - 1000 = -1000
    expect(props.x).toBe(-1000);
    expect(props.y).toBe(-1000);
    // worldWidth = 200/1 + 2000 = 2200
    expect(props.width).toBe(2200);
    expect(props.height).toBe(2100);
  });

  it('grid bounds shift opposite to pan (panX=300 → worldLeft = -300)', () => {
    const tree = CanvasGrid({
      viewState: makeViewState({ panX: 300, panY: -100, scale: 1 }),
      width: 200,
      height: 100,
    });
    const rect = findByType(tree, 'rect')[0];
    const props = rect.props as { x: number; y: number };
    // worldLeft = -300/1 - 1000 = -1300
    expect(props.x).toBe(-1300);
    // worldTop = -(-100)/1 - 1000 = 100 - 1000 = -900
    expect(props.y).toBe(-900);
  });

  it('grid bounds scale inversely with view scale (zoom-out → larger world)', () => {
    const tree = CanvasGrid({
      viewState: makeViewState({ panX: 0, panY: 0, scale: 0.5 }),
      width: 200,
      height: 100,
    });
    const rect = findByType(tree, 'rect')[0];
    const props = rect.props as { width: number; height: number };
    // worldWidth = 200/0.5 + 2000 = 400 + 2000 = 2400
    expect(props.width).toBe(2400);
    // worldHeight = 100/0.5 + 2000 = 200 + 2000 = 2200
    expect(props.height).toBe(2200);
  });

  it('rect carries pointer-events-none so the grid never intercepts clicks', () => {
    const tree = CanvasGrid({ viewState: makeViewState(), width: 100, height: 100 });
    const rect = findByType(tree, 'rect')[0];
    expect((rect.props as { className: string }).className).toBe('pointer-events-none');
  });
});
