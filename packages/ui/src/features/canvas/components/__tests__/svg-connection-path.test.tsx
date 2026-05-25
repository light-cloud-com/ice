/**
 * Tests for `SvgConnectionPath` — the SVG edge renderer.
 *
 * The orchestrator component is wrapped in `React.memo`. Internally it uses
 * `useState`, `useRef`, `useMemo`, `useCallback`. Path geometry itself lives
 * in `./path/compute-path` (which is its own pure function with its own
 * tests). For this test file the goal is to pin all the visible
 * **rendering** branches the orchestrator owns:
 *
 *   - path geometry forwarding (LR / RL / vertical / mixed via mocked
 *     computePath outputs).
 *   - port snapping props (sourcePortIndex/Count, targetPortIndex/Count)
 *     forwarded into computePath.
 *   - label positioning at midpoint (rect + text rendered for envVarName /
 *     :port / category — and bundle count badge above midpoint when >1).
 *   - edge styling per connection category (data / traffic / pipeline /
 *     config) → strokeColor / strokeDasharray / strokeWidth selection.
 *   - selection highlight (isSelected → EDGE_COLORS.selected, opacity 0.7).
 *   - edge with vs without label (envVarName fallback chain → :port →
 *     category, and traffic category suppression).
 *   - self-edge (degenerate from === to): computePath returns null →
 *     orchestrator returns null.
 *   - tooltip lifecycle: mouseEnter / mouseMove / mouseLeave call
 *     `onConnectionHover` and the dismiss timer fires.
 *   - select / context-menu / delete callbacks fire with the right ids.
 *
 * The component is invoked under the direct-FC tree-walker pattern via
 * `(SvgConnectionPath as { type }).type(props)`. `useMemo` is stubbed to
 * eagerly invoke its factory, and `useReducedMotion` is mocked to return
 * a controllable boolean per test. `computePath` is mocked to return
 * stable, predictable geometry so we don't have to coordinate with the
 * full path-builder dispatch.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  computePath: vi.fn(() => ({ pathD: 'M0,0 L10,10', midX: 5, midY: 5 })),
  useReducedMotion: vi.fn(() => false),
  inferConnectionMeta: vi.fn(() => null as unknown),
}));

vi.mock('../path/compute-path', () => ({ computePath: mocks.computePath }));
vi.mock('../../../../shared/hooks/use-reduced-motion', () => ({
  useReducedMotion: mocks.useReducedMotion,
}));
vi.mock('../../utils/connection-rules', () => ({
  inferConnectionMeta: mocks.inferConnectionMeta,
}));

// Hoisted state container so per-test code can override the value
// returned by `useState(false)` (the only useState call in the SUT).
const stateMocks = vi.hoisted(() => ({
  /** Override returned by the next useState call (defaults to the init arg). */
  hoverValueOverride: undefined as boolean | undefined,
  /** Captured timer ref so tests can inspect tooltipTimer.current writes. */
  refSlots: [] as Array<{ current: unknown }>,
}));

// Mock the four React hooks the component uses so the FC can be invoked
// outside a render context (no jsdom). Cite
// `use-memo-must-be-mocked-too-when-the-extracted-component-uses-it`.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useMemo: vi.fn((factory: () => unknown, _deps: unknown[]) => factory()),
    useCallback: vi.fn(<T,>(fn: T, _deps: unknown[]) => fn),
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initialValue = typeof init === 'function' ? (init as () => T)() : init;
      // Only one useState in the SUT — `useState(false)` for isHover.
      // The override lets tests pin isHover=true to exercise the
      // delete-button render branch without needing a state-setter call.
      const value =
        typeof initialValue === 'boolean' && stateMocks.hoverValueOverride !== undefined
          ? (stateMocks.hoverValueOverride as unknown as T)
          : initialValue;
      return [value, vi.fn()];
    }),
    useRef: vi.fn(<T,>(init: T): { current: T } => {
      const ref = { current: init };
      stateMocks.refSlots.push(ref as unknown as { current: unknown });
      return ref;
    }),
  };
});

// Imports come AFTER the mocks so vitest hoists/wires them correctly.
import { SvgConnectionPath, EDGE_COLORS } from '../svg-connection-path';
import type { CanvasNode, CanvasConnection } from '../svg-canvas';

// ─── Tree-walker (cite tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays) ───

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

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'n1',
  type: 'block',
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  label: 'Node',
  data: {},
  ...overrides,
});

const makeConn = (overrides: Partial<CanvasConnection> = {}): CanvasConnection => ({
  id: 'c1',
  from: 'n1',
  to: 'n2',
  data: {},
  ...overrides,
});

type Props = React.ComponentProps<typeof SvgConnectionPath>;

const defaultProps = (overrides: Partial<Props> = {}): Props => ({
  connection: makeConn(),
  nodes: [makeNode({ id: 'n1' }), makeNode({ id: 'n2', x: 200 })],
  isSelected: false,
  isHighlighted: false,
  direction: null,
  sourcePortIndex: 0,
  sourcePortCount: 1,
  targetPortIndex: 0,
  targetPortCount: 1,
  pipelineActive: false,
  lod: 3,
  zoom: 1,
  edgeStyle: 'bezier',
  ...overrides,
});

const renderEdge = (props: Partial<Props> = {}): React.ReactElement | null => {
  const Inner = (
    SvgConnectionPath as unknown as {
      type: (p: Props) => React.ReactElement | null;
    }
  ).type;
  return Inner(defaultProps(props));
};

// ─── Reset hoisted mocks before each test ───────────────────────────────────

beforeEach(() => {
  mocks.computePath.mockReset();
  mocks.computePath.mockReturnValue({ pathD: 'M0,0 L10,10', midX: 5, midY: 5 });
  mocks.useReducedMotion.mockReset();
  mocks.useReducedMotion.mockReturnValue(false);
  mocks.inferConnectionMeta.mockReset();
  mocks.inferConnectionMeta.mockReturnValue(null);
  stateMocks.hoverValueOverride = undefined;
  stateMocks.refSlots = [];
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. React.memo boundary
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — React.memo boundary', () => {
  it('is wrapped in React.memo', () => {
    const memoTypeof = (SvgConnectionPath as unknown as { $$typeof: symbol }).$$typeof;
    expect(typeof memoTypeof).toBe('symbol');
    expect(String(memoTypeof)).toBe('Symbol(react.memo)');
  });

  it('exposes its inner FC under .type', () => {
    const inner = (SvgConnectionPath as unknown as { type: unknown }).type;
    expect(typeof inner).toBe('function');
  });

  it('carries displayName "SvgConnectionPath"', () => {
    expect((SvgConnectionPath as unknown as { displayName: string }).displayName).toBe('SvgConnectionPath');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Re-export
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — module re-exports', () => {
  it('re-exports EDGE_COLORS for backwards compatibility', () => {
    expect(EDGE_COLORS).toBeDefined();
    expect(typeof EDGE_COLORS).toBe('object');
    expect(EDGE_COLORS.selected).toBe('#3b82f6');
    expect(EDGE_COLORS.hover).toBe('#60a5fa');
    expect(EDGE_COLORS.default).toBe('#475569');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Self-edge / missing-node / null-path degenerate cases
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — null path / missing node degenerate cases', () => {
  it('returns null when computePath returns null', () => {
    mocks.computePath.mockReturnValueOnce(null as any);
    const tree = renderEdge();
    expect(tree).toBeNull();
  });

  it('still calls computePath with a self-edge (from === to) — orchestrator forwards both ends as the same node', () => {
    const node = makeNode({ id: 'n-self', x: 100, y: 100 });
    const tree = renderEdge({
      connection: makeConn({ id: 'c-self', from: 'n-self', to: 'n-self' }),
      nodes: [node],
    });
    expect(mocks.computePath).toHaveBeenCalled();
    const args = (mocks.computePath as any).mock.calls[0][0];
    expect(args.fromNode).toBe(node);
    expect(args.toNode).toBe(node);
    // Default mock returns a non-null path so we still get a <g> back.
    expect(tree).not.toBeNull();
  });

  it('forwards undefined fromNode / toNode to computePath when nodes array does not contain them', () => {
    const tree = renderEdge({
      connection: makeConn({ from: 'missing-1', to: 'missing-2' }),
      nodes: [],
    });
    const args = (mocks.computePath as any).mock.calls[0][0];
    expect(args.fromNode).toBeUndefined();
    expect(args.toNode).toBeUndefined();
    // computePath default mock still returns a valid path so render is non-null.
    expect(tree).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Path geometry / port snapping forwarded to computePath
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — computePath argument forwarding', () => {
  it('forwards sourcePortIndex / sourcePortCount / targetPortIndex / targetPortCount', () => {
    renderEdge({
      sourcePortIndex: 2,
      sourcePortCount: 5,
      targetPortIndex: 1,
      targetPortCount: 3,
    });
    const args = (mocks.computePath as any).mock.calls[0][0];
    expect(args.sourcePortIndex).toBe(2);
    expect(args.sourcePortCount).toBe(5);
    expect(args.targetPortIndex).toBe(1);
    expect(args.targetPortCount).toBe(3);
  });

  it('forwards edgeStyle (bezier / rectangular / straight) verbatim', () => {
    for (const edgeStyle of ['bezier', 'rectangular', 'straight'] as const) {
      mocks.computePath.mockClear();
      renderEdge({ edgeStyle });
      expect((mocks.computePath as any).mock.calls[0][0].edgeStyle).toBe(edgeStyle);
    }
  });

  it('forwards lod / zoom verbatim', () => {
    renderEdge({ lod: 1, zoom: 0.4 });
    const args = (mocks.computePath as any).mock.calls[0][0];
    expect(args.lod).toBe(1);
    expect(args.zoom).toBe(0.4);
  });

  it('forwards horizontal LR geometry through path d (mocked)', () => {
    mocks.computePath.mockReturnValueOnce({ pathD: 'M0,50 L100,50', midX: 50, midY: 50 });
    const tree = renderEdge();
    const paths = findByType(tree, 'path');
    expect(paths.length).toBeGreaterThan(0);
    expect((paths[0].props as { d: string }).d).toBe('M0,50 L100,50');
  });

  it('forwards vertical geometry through path d', () => {
    mocks.computePath.mockReturnValueOnce({ pathD: 'M50,0 L50,100', midX: 50, midY: 50 });
    const tree = renderEdge();
    const paths = findByType(tree, 'path');
    expect((paths[0].props as { d: string }).d).toBe('M50,0 L50,100');
  });

  it('forwards mixed-direction geometry (RL + diagonal) through path d', () => {
    mocks.computePath.mockReturnValueOnce({
      pathD: 'M200,30 C150,30 50,80 0,80',
      midX: 100,
      midY: 55,
    });
    const tree = renderEdge();
    const paths = findByType(tree, 'path');
    expect((paths[0].props as { d: string }).d).toBe('M200,30 C150,30 50,80 0,80');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Stroke color / dasharray / opacity / width per connection state
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — stroke styling', () => {
  /** The visible (main) path is the one with `fill: 'none'` AND a non-transparent stroke. */
  const mainPath = (tree: React.ReactNode): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      const props = el.props as { fill?: string; stroke?: string };
      return props.fill === 'none' && props.stroke !== 'transparent' && props.stroke !== undefined;
    })[0];

  it('renders selected stroke = EDGE_COLORS.selected with strokeWidth=2.5 and opacity=1 (fully visible)', () => {
    const tree = renderEdge({ isSelected: true });
    const path = mainPath(tree)!;
    const props = path.props as { stroke: string; strokeWidth: number; opacity: number };
    expect(props.stroke).toBe(EDGE_COLORS.selected);
    expect(props.strokeWidth).toBe(2.5);
    expect(props.opacity).toBe(1);
  });

  it('renders highlighted stroke with opacity 0.95 (near-full visibility)', () => {
    const tree = renderEdge({ isHighlighted: true });
    const path = mainPath(tree)!;
    const props = path.props as { stroke: string; opacity: number };
    expect(props.stroke).toBe(EDGE_COLORS.default);
    expect(props.opacity).toBe(0.95);
  });

  it('renders highlighted + direction="outgoing" stroke = EDGE_COLORS.outgoing', () => {
    const tree = renderEdge({ isHighlighted: true, direction: 'outgoing' });
    const path = mainPath(tree)!;
    const props = path.props as { stroke: string };
    expect(props.stroke).toBe(EDGE_COLORS.outgoing);
  });

  it('renders highlighted + direction="incoming" stroke = EDGE_COLORS.incoming', () => {
    const tree = renderEdge({ isHighlighted: true, direction: 'incoming' });
    const path = mainPath(tree)!;
    const props = path.props as { stroke: string };
    expect(props.stroke).toBe(EDGE_COLORS.incoming);
  });

  it('renders default stroke (relationship "default") at high opacity — connections are fully visible at idle', () => {
    const tree = renderEdge();
    const path = mainPath(tree)!;
    const props = path.props as { stroke: string; opacity: number };
    expect(props.stroke).toBe(EDGE_COLORS.default);
    expect(props.opacity).toBe(0.9);
  });

  it('uses the category color from connection.data.color when present', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { color: '#ff00ff' } }),
    });
    const path = mainPath(tree)!;
    expect((path.props as { stroke: string }).stroke).toBe('#ff00ff');
  });

  it('uses derived category color when inferConnectionMeta returns one', () => {
    mocks.inferConnectionMeta.mockReturnValueOnce({ color: '#abcdef' });
    const tree = renderEdge({
      nodes: [
        makeNode({ id: 'n1', data: { iceType: 'Compute.BackendAPI' } }),
        makeNode({ id: 'n2', data: { iceType: 'Database.PostgreSQL' } }),
      ],
    });
    const path = mainPath(tree)!;
    expect((path.props as { stroke: string }).stroke).toBe('#abcdef');
  });

  it('uses EDGE_COLORS[relationship] when no category color is present', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { relationship: 'depends_on' } }),
    });
    const path = mainPath(tree)!;
    expect((path.props as { stroke: string }).stroke).toBe(EDGE_COLORS.depends_on);
  });

  it('renders pipelineActive stroke = #3b82f6 with opacity 0.6 (animated overlay sits quieter than the base wire)', () => {
    const tree = renderEdge({ pipelineActive: true });
    const path = mainPath(tree)!;
    const props = path.props as { stroke: string; opacity: number };
    expect(props.stroke).toBe('#3b82f6');
    expect(props.opacity).toBe(0.6);
  });

  it('renders dashed stroke for log edges (relationship=logs_to)', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { relationship: 'logs_to' } }),
    });
    const path = mainPath(tree)!;
    expect((path.props as { strokeDasharray?: string }).strokeDasharray).toBe('6 4');
  });

  it('renders dashed stroke when lineStyle = "dashed"', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { lineStyle: 'dashed' } }),
    });
    const path = mainPath(tree)!;
    expect((path.props as { strokeDasharray?: string }).strokeDasharray).toBe('6 4');
  });

  it('renders dashed stroke when trafficType = "stream" (treated as log edge)', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { trafficType: 'stream' } }),
    });
    const path = mainPath(tree)!;
    expect((path.props as { strokeDasharray?: string }).strokeDasharray).toBe('6 4');
  });

  it('renders dotted stroke when lineStyle = "dotted"', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { lineStyle: 'dotted' } }),
    });
    const path = mainPath(tree)!;
    expect((path.props as { strokeDasharray?: string }).strokeDasharray).toBe('2 3');
  });

  it('renders no dasharray when lineStyle = "solid" / undefined', () => {
    const tree = renderEdge();
    const path = mainPath(tree)!;
    expect((path.props as { strokeDasharray?: string }).strokeDasharray).toBeUndefined();
  });

  it('halves baseWidth (0.6) for thin lineStyle at LOD 3', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { lineStyle: 'thin' } }),
    });
    const path = mainPath(tree)!;
    expect((path.props as { strokeWidth: number }).strokeWidth).toBe(0.6);
  });

  it('thin lineStyle drops opacity to 0.6 at full LOD (a notch quieter than primary traffic but still fully readable)', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { lineStyle: 'thin' } }),
    });
    const path = mainPath(tree)!;
    expect((path.props as { opacity: number }).opacity).toBe(0.6);
  });

  it('LOD 1 reduces strokeWidth to 1.5 * invZoom and opacity to 0.7', () => {
    const tree = renderEdge({ lod: 1, zoom: 1 });
    const path = mainPath(tree)!;
    const props = path.props as { strokeWidth: number; opacity: number };
    expect(props.strokeWidth).toBeCloseTo(1.5);
    expect(props.opacity).toBe(0.7);
  });

  it('LOD 2 reduces strokeWidth to 1.2 * invZoom and opacity to 0.8', () => {
    const tree = renderEdge({ lod: 2, zoom: 1 });
    const path = mainPath(tree)!;
    const props = path.props as { strokeWidth: number; opacity: number };
    expect(props.strokeWidth).toBeCloseTo(1.2);
    expect(props.opacity).toBe(0.8);
  });

  it('LOD 1 with zoom 0.5 doubles invZoom-scaled strokeWidth (1.5 * 2 = 3)', () => {
    const tree = renderEdge({ lod: 1, zoom: 0.5 });
    const path = mainPath(tree)!;
    const props = path.props as { strokeWidth: number };
    expect(props.strokeWidth).toBeCloseTo(3.0);
  });

  it('zoom <= 0.1 floor protects against division-by-tiny (Math.max(zoom, 0.1))', () => {
    const tree = renderEdge({ lod: 1, zoom: 0.001 });
    const path = mainPath(tree)!;
    const props = path.props as { strokeWidth: number };
    // invZoom = 1/0.1 = 10, so strokeWidth at LOD 1 = 1.5 * 10 = 15.
    expect(props.strokeWidth).toBeCloseTo(15);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Hover overlay (invisible wider hover-target path)
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — hover-target path', () => {
  it('renders an invisible hover path with stroke=transparent', () => {
    const tree = renderEdge();
    const transparentPaths = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      return (el.props as { stroke?: string }).stroke === 'transparent';
    });
    expect(transparentPaths).toHaveLength(1);
  });

  it('hoverTargetWidth = 16 at LOD 3 regardless of zoom', () => {
    const tree = renderEdge({ lod: 3, zoom: 0.1 });
    const transparent = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      return (el.props as { stroke?: string }).stroke === 'transparent';
    })[0];
    expect((transparent.props as { strokeWidth: number }).strokeWidth).toBe(16);
  });

  it('hoverTargetWidth scales by 24 * invZoom at LOD<3, with a floor of 16', () => {
    const tree = renderEdge({ lod: 1, zoom: 1 });
    const transparent = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      return (el.props as { stroke?: string }).stroke === 'transparent';
    })[0];
    // 24 * 1 = 24, max(16, 24) = 24.
    expect((transparent.props as { strokeWidth: number }).strokeWidth).toBe(24);
  });

  it('hover target path onClick stops propagation and fires onSelect with the connection id', () => {
    const stopped: string[] = [];
    const selected: string[] = [];
    const tree = renderEdge({ onSelect: (id) => selected.push(id) });
    const target = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      return (el.props as { stroke?: string }).stroke === 'transparent';
    })[0];
    const onClick = (target.props as { onClick: (e: React.MouseEvent) => void }).onClick;
    onClick({
      stopPropagation: () => stopped.push('s'),
    } as unknown as React.MouseEvent);
    expect(stopped).toEqual(['s']);
    expect(selected).toEqual(['c1']);
  });

  it('hover target onContextMenu fires onContextMenu callback with id + clientX/Y', () => {
    const captured: Array<[string, { x: number; y: number }]> = [];
    const tree = renderEdge({
      onContextMenu: (id, pos) => captured.push([id, pos]),
    });
    const target = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      return (el.props as { stroke?: string }).stroke === 'transparent';
    })[0];
    const onCtx = (target.props as { onContextMenu: (e: React.MouseEvent) => void }).onContextMenu;
    onCtx({
      preventDefault: () => {},
      stopPropagation: () => {},
      clientX: 33,
      clientY: 77,
    } as unknown as React.MouseEvent);
    expect(captured).toEqual([['c1', { x: 33, y: 77 }]]);
  });

  it('hover target onClick is a no-op when onSelect is undefined', () => {
    const tree = renderEdge({ onSelect: undefined });
    const target = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      return (el.props as { stroke?: string }).stroke === 'transparent';
    })[0];
    const onClick = (target.props as { onClick: (e: React.MouseEvent) => void }).onClick;
    expect(() => onClick({ stopPropagation: () => {} } as unknown as React.MouseEvent)).not.toThrow();
  });

  it('hover target onContextMenu is a no-op when onContextMenu prop is undefined', () => {
    const tree = renderEdge({ onContextMenu: undefined });
    const target = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      return (el.props as { stroke?: string }).stroke === 'transparent';
    })[0];
    const onCtx = (target.props as { onContextMenu: (e: React.MouseEvent) => void }).onContextMenu;
    expect(() =>
      onCtx({
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: 0,
        clientY: 0,
      } as unknown as React.MouseEvent),
    ).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Pipeline animation flow path
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — pipeline-active flow path', () => {
  it('renders an extra animated dashes path when pipelineActive=true', () => {
    const tree = renderEdge({ pipelineActive: true });
    const dashedFlow = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      const props = el.props as { strokeDasharray?: string; opacity?: number };
      return props.strokeDasharray === '8 12' && props.opacity === 0.9;
    });
    expect(dashedFlow).toHaveLength(1);
  });

  it('does NOT render the flow path when pipelineActive=false', () => {
    const tree = renderEdge({ pipelineActive: false });
    const dashedFlow = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      return (el.props as { strokeDasharray?: string }).strokeDasharray === '8 12';
    });
    expect(dashedFlow).toHaveLength(0);
  });

  it('renders the <animate> child only when reducedMotion=false', () => {
    mocks.useReducedMotion.mockReturnValueOnce(false);
    const tree = renderEdge({ pipelineActive: true });
    const animates = findByType(tree, 'animate');
    expect(animates).toHaveLength(1);
    const props = animates[0].props as { attributeName: string; dur: string };
    expect(props.attributeName).toBe('stroke-dashoffset');
    expect(props.dur).toBe('1s');
  });

  it('omits the <animate> child when reducedMotion=true', () => {
    mocks.useReducedMotion.mockReturnValueOnce(true);
    const tree = renderEdge({ pipelineActive: true });
    expect(findByType(tree, 'animate')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Label positioning (envVarName / :port / category fallback chain)
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — label rendering', () => {
  it('renders no label by default (no envVarName, no port, default relationship)', () => {
    const tree = renderEdge();
    expect(findByType(tree, 'text')).toHaveLength(0);
    expect(findByType(tree, 'rect')).toHaveLength(0);
  });

  it('renders envVarName label when connection.data.envVarName is set', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { envVarName: 'DATABASE_URL' } }),
    });
    const texts = findByType(tree, 'text');
    expect(texts).toHaveLength(1);
    expect(collectText(texts[0])).toBe('DATABASE_URL');
  });

  it('uses inferred env var name when present and not overridden', () => {
    mocks.inferConnectionMeta.mockReturnValueOnce({ envVarName: 'INFERRED_VAR' });
    const tree = renderEdge({
      nodes: [
        makeNode({ id: 'n1', data: { iceType: 'Compute.BackendAPI' } }),
        makeNode({ id: 'n2', data: { iceType: 'Database.PostgreSQL' } }),
      ],
    });
    const texts = findByType(tree, 'text');
    expect(texts).toHaveLength(1);
    expect(collectText(texts[0])).toBe('INFERRED_VAR');
  });

  it('falls back to ":port" when no envVarName but port is set', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { port: 5432 } }),
    });
    const texts = findByType(tree, 'text');
    expect(texts).toHaveLength(1);
    expect(collectText(texts[0])).toBe(':5432');
  });

  it('falls back to non-traffic category label when neither envVarName nor port set', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { connectionCategory: 'data' } }),
    });
    const texts = findByType(tree, 'text');
    expect(texts).toHaveLength(1);
    expect(collectText(texts[0])).toBe('data');
  });

  it('suppresses category label when category is "traffic"', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { connectionCategory: 'traffic' } }),
    });
    expect(findByType(tree, 'text')).toHaveLength(0);
  });

  it('uses derived category label when inferConnectionMeta yields one', () => {
    mocks.inferConnectionMeta.mockReturnValueOnce({ category: 'pipeline' });
    const tree = renderEdge({
      nodes: [
        makeNode({ id: 'n1', data: { iceType: 'Source.Repository' } }),
        makeNode({ id: 'n2', data: { iceType: 'Compute.BackendAPI' } }),
      ],
    });
    const texts = findByType(tree, 'text');
    expect(collectText(texts[0])).toBe('pipeline');
  });

  it('renders a rounded rect background for the label pill', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { envVarName: 'X' } }),
    });
    const rects = findByType(tree, 'rect');
    expect(rects).toHaveLength(1);
    const props = rects[0].props as { rx: number; fill: string };
    expect(props.rx).toBe(8);
    expect(props.fill).toBe('var(--ice-bg-raised)');
  });

  it('positions the label centered around midX/midY-12 (above midpoint)', () => {
    mocks.computePath.mockReturnValueOnce({ pathD: 'M0,0 L100,100', midX: 50, midY: 100 });
    const tree = renderEdge({
      connection: makeConn({ data: { envVarName: 'X' } }),
    });
    const text = findByType(tree, 'text')[0];
    const props = text.props as { x: number; y: number };
    expect(props.x).toBe(50); // midX
    // labelY = midY - 12 - labelHeight/2 = 100 - 12 - 8 = 80
    // text y = labelY + labelHeight/2 = 80 + 8 = 88
    expect(props.y).toBe(88);
  });

  it('hides the label when LOD < 3', () => {
    const tree = renderEdge({
      lod: 2,
      connection: makeConn({ data: { envVarName: 'DATABASE_URL' } }),
    });
    expect(findByType(tree, 'text')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Bundle count badge
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — bundle count badge', () => {
  it('renders a circle + count text when bundleCount > 1 (label suppressed)', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { bundleCount: 4, envVarName: 'X' } }),
    });
    const circles = findByType(tree, 'circle');
    expect(circles).toHaveLength(1);
    const texts = findByType(tree, 'text');
    expect(texts).toHaveLength(1);
    expect(collectText(texts[0])).toBe('4');
  });

  it('does NOT render the bundle badge when bundleCount <= 1', () => {
    const tree = renderEdge({
      connection: makeConn({ data: { bundleCount: 1, envVarName: 'X' } }),
    });
    const circles = findByType(tree, 'circle');
    expect(circles).toHaveLength(0);
  });

  it('hides the badge at lower LOD', () => {
    const tree = renderEdge({
      lod: 2,
      connection: makeConn({ data: { bundleCount: 5 } }),
    });
    expect(findByType(tree, 'circle')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Hover lifecycle / tooltip wiring
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — tooltip / hover lifecycle', () => {
  it('outer <g> has onMouseEnter / onMouseLeave / onPointerLeave / onMouseMove handlers', () => {
    const tree = renderEdge();
    const props = (tree as React.ReactElement).props as Record<string, unknown>;
    expect(typeof props.onMouseEnter).toBe('function');
    expect(typeof props.onMouseLeave).toBe('function');
    expect(typeof props.onPointerLeave).toBe('function');
    expect(typeof props.onMouseMove).toBe('function');
  });

  it('onMouseLeave fires onConnectionHover(null)', () => {
    const calls: Array<unknown> = [];
    const tree = renderEdge({
      onConnectionHover: (info) => calls.push(info),
    });
    const props = (tree as React.ReactElement).props as { onMouseLeave: () => void };
    props.onMouseLeave();
    expect(calls).toEqual([null]);
  });

  it('onMouseMove fires onConnectionHover with built tooltip info (clientX/Y)', () => {
    const calls: Array<{ mouseX: number; mouseY: number; fromLabel: string; toLabel: string } | null> = [];
    const tree = renderEdge({
      nodes: [makeNode({ id: 'n1', label: 'origin' }), makeNode({ id: 'n2', label: 'dest' })],
      onConnectionHover: (info) => calls.push(info as never),
    });
    const props = (tree as React.ReactElement).props as { onMouseMove: (e: React.MouseEvent) => void };
    props.onMouseMove({ clientX: 100, clientY: 200 } as unknown as React.MouseEvent);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      mouseX: 100,
      mouseY: 200,
      fromLabel: 'origin',
      toLabel: 'dest',
    });
  });

  it('builds tooltip with full shape (port, protocol, latency, throughput, bandwidth, securityRule, bundleCount)', () => {
    const calls: Array<Record<string, unknown>> = [];
    const tree = renderEdge({
      connection: makeConn({
        id: 'c-rich',
        from: 'n1',
        to: 'n2',
        data: {
          relationship: 'data',
          port: 5432,
          protocol: 'tcp',
          bundleCount: 3,
          latency: '5ms',
          throughput: '100mbps',
          bandwidth: '1Gbps',
          securityRule: 'allow-pg',
        },
      }),
      onConnectionHover: (info) => calls.push(info as unknown as Record<string, unknown>),
    });
    const props = (tree as React.ReactElement).props as { onMouseMove: (e: React.MouseEvent) => void };
    props.onMouseMove({ clientX: 1, clientY: 2 } as unknown as React.MouseEvent);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      connectionId: 'c-rich',
      port: '5432',
      protocol: 'tcp',
      bundleCount: 3,
      latency: '5ms',
      throughput: '100mbps',
      bandwidth: '1Gbps',
      securityRule: 'allow-pg',
      relationship: 'data',
    });
  });

  it('falls back to connection.from / connection.to when nodes do not carry labels', () => {
    const calls: Array<{ fromLabel: string; toLabel: string }> = [];
    const tree = renderEdge({
      connection: makeConn({ from: 'left-id', to: 'right-id' }),
      // Use stripped nodes — empty label
      nodes: [makeNode({ id: 'left-id', label: '' }), makeNode({ id: 'right-id', label: '' })],
      onConnectionHover: (info) => calls.push(info as { fromLabel: string; toLabel: string }),
    });
    const props = (tree as React.ReactElement).props as { onMouseMove: (e: React.MouseEvent) => void };
    props.onMouseMove({ clientX: 0, clientY: 0 } as unknown as React.MouseEvent);
    expect(calls[0].fromLabel).toBe('left-id');
    expect(calls[0].toLabel).toBe('right-id');
  });

  it('defaults bundleCount to 1 when zero/missing', () => {
    const calls: Array<{ bundleCount: number }> = [];
    const tree = renderEdge({
      connection: makeConn(),
      onConnectionHover: (info) => calls.push(info as { bundleCount: number }),
    });
    const props = (tree as React.ReactElement).props as { onMouseMove: (e: React.MouseEvent) => void };
    props.onMouseMove({ clientX: 0, clientY: 0 } as unknown as React.MouseEvent);
    expect(calls[0].bundleCount).toBe(1);
  });

  it('default relationship is "default" when no connection.data.relationship', () => {
    const calls: Array<{ relationship: string }> = [];
    const tree = renderEdge({
      connection: makeConn({ data: {} }),
      onConnectionHover: (info) => calls.push(info as { relationship: string }),
    });
    const props = (tree as React.ReactElement).props as { onMouseMove: (e: React.MouseEvent) => void };
    props.onMouseMove({ clientX: 0, clientY: 0 } as unknown as React.MouseEvent);
    expect(calls[0].relationship).toBe('default');
  });

  it('onMouseMove is a no-op when onConnectionHover is undefined', () => {
    const tree = renderEdge({ onConnectionHover: undefined });
    const props = (tree as React.ReactElement).props as { onMouseMove: (e: React.MouseEvent) => void };
    expect(() => props.onMouseMove({ clientX: 0, clientY: 0 } as unknown as React.MouseEvent)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Delete button on hover (only at full LOD, only when not bundled)
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — delete button', () => {
  it('omits the delete button by default (isHover=false at first render)', () => {
    const tree = renderEdge();
    const deleteGroups = findByPredicate(tree, (el) => {
      if (el.type !== 'g') return false;
      return (el.props as { className?: string }).className === 'delete-button';
    });
    expect(deleteGroups).toHaveLength(0);
  });

  it('renders the delete button when hovered + LOD 3 + bundleCount <= 1', () => {
    stateMocks.hoverValueOverride = true;
    const tree = renderEdge();
    const deleteGroups = findByPredicate(tree, (el) => {
      if (el.type !== 'g') return false;
      return (el.props as { className?: string }).className === 'delete-button';
    });
    expect(deleteGroups).toHaveLength(1);
  });

  it('hides the delete button when bundled (bundleCount > 1)', () => {
    stateMocks.hoverValueOverride = true;
    const tree = renderEdge({
      connection: makeConn({ data: { bundleCount: 3 } }),
    });
    const deleteGroups = findByPredicate(tree, (el) => {
      if (el.type !== 'g') return false;
      return (el.props as { className?: string }).className === 'delete-button';
    });
    expect(deleteGroups).toHaveLength(0);
  });

  it('hides the delete button at lower LOD even when hovered', () => {
    stateMocks.hoverValueOverride = true;
    const tree = renderEdge({ lod: 2 });
    const deleteGroups = findByPredicate(tree, (el) => {
      if (el.type !== 'g') return false;
      return (el.props as { className?: string }).className === 'delete-button';
    });
    expect(deleteGroups).toHaveLength(0);
  });

  it('delete button onClick stops propagation and fires onDelete with the connection id', () => {
    stateMocks.hoverValueOverride = true;
    const stopped: string[] = [];
    const deleted: string[] = [];
    const tree = renderEdge({ onDelete: (id) => deleted.push(id) });
    const deleteGroup = findByPredicate(tree, (el) => {
      if (el.type !== 'g') return false;
      return (el.props as { className?: string }).className === 'delete-button';
    })[0];
    const onClick = (deleteGroup.props as { onClick: (e: React.MouseEvent) => void }).onClick;
    onClick({ stopPropagation: () => stopped.push('s') } as unknown as React.MouseEvent);
    expect(stopped).toEqual(['s']);
    expect(deleted).toEqual(['c1']);
  });

  it('delete button onClick is a no-op when onDelete is undefined', () => {
    stateMocks.hoverValueOverride = true;
    const tree = renderEdge({ onDelete: undefined });
    const deleteGroup = findByPredicate(tree, (el) => {
      if (el.type !== 'g') return false;
      return (el.props as { className?: string }).className === 'delete-button';
    })[0];
    const onClick = (deleteGroup.props as { onClick: (e: React.MouseEvent) => void }).onClick;
    expect(() => onClick({ stopPropagation: () => {} } as unknown as React.MouseEvent)).not.toThrow();
  });

  it('delete button hides when not hovered (isHover=false), even at LOD 3 with non-bundle connection', () => {
    stateMocks.hoverValueOverride = false;
    const tree = renderEdge();
    const deleteGroups = findByPredicate(tree, (el) => {
      if (el.type !== 'g') return false;
      return (el.props as { className?: string }).className === 'delete-button';
    });
    expect(deleteGroups).toHaveLength(0);
  });

  it('label is hidden when isHover=true (avoids overlapping the delete button)', () => {
    stateMocks.hoverValueOverride = true;
    const tree = renderEdge({
      connection: makeConn({ data: { envVarName: 'X' } }),
    });
    // Label text would be 'X' if rendered; with hover=true the label gate
    // disables it (showLabels && !isHover).
    const labelTexts = findByType(tree, 'text');
    // Only any bundle text would remain; we have no bundle, so no text.
    expect(labelTexts).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tooltip timer (clearTooltipTimer + scheduleTooltipDismiss)
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — tooltip dismiss timer', () => {
  it('handleMouseMove schedules a 300ms dismiss timer and stores its handle', () => {
    vi.useFakeTimers();
    try {
      const calls: Array<unknown> = [];
      const tree = renderEdge({ onConnectionHover: (info) => calls.push(info) });
      const props = (tree as React.ReactElement).props as { onMouseMove: (e: React.MouseEvent) => void };
      props.onMouseMove({ clientX: 1, clientY: 2 } as unknown as React.MouseEvent);
      // First call: tooltip info from buildTooltip; timer set up so SUT
      // wrote to tooltipTimer.current. Inspect via captured ref slot.
      const timerRef = stateMocks.refSlots.find((r) => r.current !== null && typeof r.current !== 'object');
      // The timer ref's current was set to a timeout id (number/object in node).
      const allRefs = stateMocks.refSlots;
      expect(allRefs.some((r) => r.current != null && r !== allRefs[0])).toBe(true);
      // After 300ms, the dismiss callback runs and pushes a null.
      vi.advanceTimersByTime(300);
      expect(calls[calls.length - 1]).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('handleMouseMove on a second event clears the previous timer (no double-fire)', () => {
    vi.useFakeTimers();
    try {
      const calls: Array<unknown> = [];
      const tree = renderEdge({ onConnectionHover: (info) => calls.push(info) });
      const props = (tree as React.ReactElement).props as { onMouseMove: (e: React.MouseEvent) => void };
      props.onMouseMove({ clientX: 1, clientY: 2 } as unknown as React.MouseEvent);
      // Second move — should clear and reschedule.
      props.onMouseMove({ clientX: 3, clientY: 4 } as unknown as React.MouseEvent);
      // After 300ms only ONE dismiss fires (the second).
      vi.advanceTimersByTime(300);
      const nullCount = calls.filter((c) => c === null).length;
      expect(nullCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('handleMouseEnter clears any pending dismiss timer', () => {
    vi.useFakeTimers();
    try {
      const calls: Array<unknown> = [];
      const tree = renderEdge({ onConnectionHover: (info) => calls.push(info) });
      const props = (tree as React.ReactElement).props as {
        onMouseMove: (e: React.MouseEvent) => void;
        onMouseEnter: () => void;
      };
      // Schedule a dismiss…
      props.onMouseMove({ clientX: 0, clientY: 0 } as unknown as React.MouseEvent);
      // …then re-enter (which clears the timer).
      props.onMouseEnter();
      // 300ms later, no dismiss should have fired.
      vi.advanceTimersByTime(300);
      const nullCount = calls.filter((c) => c === null).length;
      expect(nullCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Outer <g> shape
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — outer <g> shape', () => {
  it('returns an outer <g> with className "connection-path cursor-pointer"', () => {
    const tree = renderEdge();
    const g = tree as React.ReactElement;
    expect(g.type).toBe('g');
    expect((g.props as { className: string }).className).toBe('connection-path cursor-pointer');
  });

  it('does not render a <defs> block now that arrow markers are gone (findings #31)', () => {
    // The <defs>+<marker> block was unreachable behind a hardcoded
    // `hasArrow = false` in the SUT; dropping the dead branch
    // simplified the tree to just the path elements.
    const tree = renderEdge();
    const defs = findByType(tree, 'defs');
    expect(defs).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Defensive fallbacks (connection.data missing, etc.)
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — defensive fallbacks', () => {
  it('handles a connection with no data field at all (defaults via `connection.data || {}`)', () => {
    const calls: Array<{ relationship: string; bundleCount: number }> = [];
    const tree = renderEdge({
      connection: { id: 'cx', from: 'n1', to: 'n2' } as unknown as CanvasConnection,
      onConnectionHover: (info) => calls.push(info as { relationship: string; bundleCount: number }),
    });
    const props = (tree as React.ReactElement).props as { onMouseMove: (e: React.MouseEvent) => void };
    props.onMouseMove({ clientX: 0, clientY: 0 } as unknown as React.MouseEvent);
    expect(calls[0].relationship).toBe('default');
    expect(calls[0].bundleCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// pipelineActive interaction with LOD scaling
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — pipelineActive at LOD<3 scales by invZoom', () => {
  /** The visible (main) path is the one with `fill: 'none'` AND a non-transparent stroke. */
  const mainPath = (tree: React.ReactNode): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      const props = el.props as { fill?: string; stroke?: string };
      return props.fill === 'none' && props.stroke !== 'transparent' && props.stroke !== undefined;
    })[0];

  it('main path stroke width scales by invZoom at LOD < 3', () => {
    const tree = renderEdge({ pipelineActive: true, lod: 1, zoom: 0.5 });
    const path = mainPath(tree)!;
    // 2 * (1/max(0.5, 0.1)) = 2 * 2 = 4
    expect((path.props as { strokeWidth: number }).strokeWidth).toBeCloseTo(4);
  });

  it('main path stroke width is 2 (no scaling) at LOD 3 with pipelineActive', () => {
    const tree = renderEdge({ pipelineActive: true, lod: 3, zoom: 0.5 });
    const path = mainPath(tree)!;
    expect((path.props as { strokeWidth: number }).strokeWidth).toBe(2);
  });

  it('flow path scales by invZoom at LOD < 3', () => {
    const tree = renderEdge({ pipelineActive: true, lod: 2, zoom: 0.25 });
    const flow = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      return (el.props as { strokeDasharray?: string }).strokeDasharray === '8 12';
    })[0];
    // 2 * (1/0.25) = 8
    expect((flow.props as { strokeWidth: number }).strokeWidth).toBeCloseTo(8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Selected stroke width scales by invZoom at LOD < 3
// ═══════════════════════════════════════════════════════════════════════════

describe('SvgConnectionPath — selected stroke width scales by invZoom at LOD<3', () => {
  it('selected stroke width = 2.5 * invZoom at LOD 1', () => {
    const tree = renderEdge({ isSelected: true, lod: 1, zoom: 0.5 });
    const main = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      const props = el.props as { fill?: string; stroke?: string };
      return props.fill === 'none' && props.stroke !== 'transparent';
    })[0];
    // 2.5 * 2 = 5
    expect((main.props as { strokeWidth: number }).strokeWidth).toBeCloseTo(5);
  });

  it('hover/highlighted stroke width = 2 * invZoom at LOD < 3', () => {
    const tree = renderEdge({ isHighlighted: true, lod: 2, zoom: 0.5 });
    const main = findByPredicate(tree, (el) => {
      if (el.type !== 'path') return false;
      const props = el.props as { fill?: string; stroke?: string };
      return props.fill === 'none' && props.stroke !== 'transparent';
    })[0];
    // 2 * 2 = 4
    expect((main.props as { strokeWidth: number }).strokeWidth).toBeCloseTo(4);
  });
});
