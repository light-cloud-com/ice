/**
 * rf-canv-14 — `ConnectionPreviewOverlay` subcomponent.
 *
 * `ConnectionPreviewOverlay` is a presentational FC that wraps the JSX shell
 * for the in-flight connection drag preview (a cubic-bezier `<path>` from
 * source port to current cursor, plus two anchor `<circle>`s). The bezier
 * math (`computeConnectionPreviewPath`) and the color picker
 * (`pickPreviewColor`) live in `../utils/connection-preview` and are tested
 * exhaustively by `utils/__tests__/connection-preview.test.ts` (rf-canv-8).
 * This suite mocks both helpers so the assertions exercise ONLY the new
 * component's behavior — the JSX shell + the prop-forwarding contract — and
 * don't redundantly retest the rf-canv-8 utils.
 *
 * Direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, then walk the returned React-element
 * tree depth-first and assert on type / props / children.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanvasNode } from '../types';

// ─── Mock the rf-canv-8 utils so we exercise only the JSX shell ──────────────

const mocks = vi.hoisted(() => ({
  computeConnectionPreviewPath: vi.fn<
    (sourcePoint: { x: number; y: number }, currentPoint: { x: number; y: number }) => string
  >(() => 'M 0 0 C 0 0, 0 0, 0 0'),
  pickPreviewColor: vi.fn<
    (
      currentPoint: { x: number; y: number },
      effectiveNodes: CanvasNode[],
      sourceId: string,
      dragTargets: Map<string, string> | null | undefined,
    ) => string
  >(() => '#22d3ee'),
}));
vi.mock('../../utils/connection-preview', () => ({
  computeConnectionPreviewPath: mocks.computeConnectionPreviewPath,
  pickPreviewColor: mocks.pickPreviewColor,
}));

// Import AFTER vi.mock so the mocked module is bound.
import { ConnectionPreviewOverlay, type ConnectionPreviewOverlayProps } from '../connection-preview-overlay';

// ─── Tree-walker (same shape as rf-canv-10/11/12/13) ─────────────────────────

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

function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseProps = (overrides: Partial<ConnectionPreviewOverlayProps> = {}): ConnectionPreviewOverlayProps => ({
  drawingConnection: {
    sourceId: 'src',
    sourcePoint: { x: 10, y: 20 },
    currentPoint: { x: 100, y: 80 },
  },
  effectiveNodes: [],
  connectionDragTargets: null,
  ...overrides,
});

const render = (overrides: Partial<ConnectionPreviewOverlayProps> = {}) =>
  ConnectionPreviewOverlay(baseProps(overrides));

// Reset the mocks before each test so call-args assertions are clean.
beforeEach(() => {
  mocks.computeConnectionPreviewPath.mockClear();
  mocks.pickPreviewColor.mockClear();
  mocks.computeConnectionPreviewPath.mockReturnValue('M 0 0 C 0 0, 0 0, 0 0');
  mocks.pickPreviewColor.mockReturnValue('#22d3ee');
});

// ═══════════════════════════════════════════════════════════════════════════
// Outer wrap (className + pointer-events)
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionPreviewOverlay — outer wrap', () => {
  it('renders <g className="connection-preview" style={{ pointerEvents: "none" }}>', () => {
    const tree = render();
    const wraps = findByPredicate(
      tree,
      (el) => el.type === 'g' && (el.props as { className?: string }).className === 'connection-preview',
    );
    expect(wraps).toHaveLength(1);
    const style = (wraps[0].props as { style?: React.CSSProperties }).style;
    expect(style?.pointerEvents).toBe('none');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Util forwarding
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionPreviewOverlay — forwards args to rf-canv-8 utils', () => {
  it('calls computeConnectionPreviewPath with (sourcePoint, currentPoint)', () => {
    render({
      drawingConnection: {
        sourceId: 'src',
        sourcePoint: { x: 11, y: 22 },
        currentPoint: { x: 111, y: 222 },
      },
    });
    expect(mocks.computeConnectionPreviewPath).toHaveBeenCalledTimes(1);
    expect(mocks.computeConnectionPreviewPath).toHaveBeenCalledWith({ x: 11, y: 22 }, { x: 111, y: 222 });
  });

  it('calls pickPreviewColor with (currentPoint, effectiveNodes, sourceId, dragTargets)', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'n1',
        type: 'block',
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        label: 'n',
        data: {},
      },
    ];
    const targets = new Map<string, string>([['n1', 'valid-target']]);
    render({
      drawingConnection: {
        sourceId: 'src-id',
        sourcePoint: { x: 0, y: 0 },
        currentPoint: { x: 333, y: 444 },
      },
      effectiveNodes: nodes,
      connectionDragTargets: targets,
    });
    expect(mocks.pickPreviewColor).toHaveBeenCalledTimes(1);
    expect(mocks.pickPreviewColor).toHaveBeenCalledWith({ x: 333, y: 444 }, nodes, 'src-id', targets);
  });

  it('threads a null dragTargets through verbatim (no defaulting in the shell)', () => {
    render({ connectionDragTargets: null });
    const args = mocks.pickPreviewColor.mock.calls[0];
    expect(args[3]).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// <path> element
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionPreviewOverlay — <path> element', () => {
  it('renders one <path> with d = computeConnectionPreviewPath return value', () => {
    mocks.computeConnectionPreviewPath.mockReturnValue('M 1 2 C 3 4, 5 6, 7 8');
    const tree = render();
    const paths = findByType(tree, 'path');
    expect(paths).toHaveLength(1);
    const props = paths[0].props as {
      d: string;
      stroke: string;
      strokeWidth: number;
      fill: string;
      strokeDasharray: string;
      opacity: number;
    };
    expect(props.d).toBe('M 1 2 C 3 4, 5 6, 7 8');
  });

  it('uses the previewColor returned by pickPreviewColor as the path stroke', () => {
    mocks.pickPreviewColor.mockReturnValue('#abcdef');
    const tree = render();
    const path = findByType(tree, 'path')[0];
    expect((path.props as { stroke: string }).stroke).toBe('#abcdef');
  });

  it('pins the verbatim path props: strokeWidth=2, fill="none", strokeDasharray="8 4", opacity=0.7', () => {
    const tree = render();
    const path = findByType(tree, 'path')[0];
    const props = path.props as {
      strokeWidth: number;
      fill: string;
      strokeDasharray: string;
      opacity: number;
    };
    expect(props.strokeWidth).toBe(2);
    expect(props.fill).toBe('none');
    expect(props.strokeDasharray).toBe('8 4');
    expect(props.opacity).toBe(0.7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// <circle> elements (anchors)
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionPreviewOverlay — anchor <circle> elements', () => {
  it('renders exactly two <circle> elements', () => {
    const tree = render();
    const circles = findByType(tree, 'circle');
    expect(circles).toHaveLength(2);
  });

  it('first circle anchors the source: cx/cy = sourcePoint, r=4, opacity=0.9', () => {
    const tree = render({
      drawingConnection: {
        sourceId: 'src',
        sourcePoint: { x: 50, y: 60 },
        currentPoint: { x: 500, y: 600 },
      },
    });
    const circles = findByType(tree, 'circle');
    const props = circles[0].props as {
      cx: number;
      cy: number;
      r: number;
      opacity: number;
    };
    expect(props.cx).toBe(50);
    expect(props.cy).toBe(60);
    expect(props.r).toBe(4);
    expect(props.opacity).toBe(0.9);
  });

  it('second circle anchors the cursor: cx/cy = currentPoint, r=4, opacity=0.6', () => {
    const tree = render({
      drawingConnection: {
        sourceId: 'src',
        sourcePoint: { x: 50, y: 60 },
        currentPoint: { x: 500, y: 600 },
      },
    });
    const circles = findByType(tree, 'circle');
    const props = circles[1].props as {
      cx: number;
      cy: number;
      r: number;
      opacity: number;
    };
    expect(props.cx).toBe(500);
    expect(props.cy).toBe(600);
    expect(props.r).toBe(4);
    expect(props.opacity).toBe(0.6);
  });

  it('both circles share the same fill color (the previewColor)', () => {
    mocks.pickPreviewColor.mockReturnValue('#deadbe');
    const tree = render();
    const circles = findByType(tree, 'circle');
    expect((circles[0].props as { fill: string }).fill).toBe('#deadbe');
    expect((circles[1].props as { fill: string }).fill).toBe('#deadbe');
  });

  it('the path stroke and the circle fills all share the same color', () => {
    mocks.pickPreviewColor.mockReturnValue('#22c55e');
    const tree = render();
    const path = findByType(tree, 'path')[0];
    const circles = findByType(tree, 'circle');
    expect((path.props as { stroke: string }).stroke).toBe('#22c55e');
    expect((circles[0].props as { fill: string }).fill).toBe('#22c55e');
    expect((circles[1].props as { fill: string }).fill).toBe('#22c55e');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Color routing — verifies the JSX shell uses the picker's return value
// (a single source of truth — the picker is mocked, the shell never decides
// the color itself)
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionPreviewOverlay — color is sourced from pickPreviewColor', () => {
  it('renders the cyan default when picker returns the cyan default', () => {
    mocks.pickPreviewColor.mockReturnValue('#22d3ee');
    const tree = render();
    const path = findByType(tree, 'path')[0];
    expect((path.props as { stroke: string }).stroke).toBe('#22d3ee');
  });

  it('renders the green valid-target color when picker returns it', () => {
    mocks.pickPreviewColor.mockReturnValue('#22c55e');
    const tree = render();
    const path = findByType(tree, 'path')[0];
    expect((path.props as { stroke: string }).stroke).toBe('#22c55e');
  });

  it('renders the red invalid-target color when picker returns it', () => {
    mocks.pickPreviewColor.mockReturnValue('#ef4444');
    const tree = render();
    const path = findByType(tree, 'path')[0];
    expect((path.props as { stroke: string }).stroke).toBe('#ef4444');
  });
});
