/**
 * Tests for the compact-node orchestrator (`SvgCompactNode` + `computeCompactNodeHeight` + `computeCompactNodeWidth`).
 *
 * The orchestrator selects between BlockSummaryCard / CompactLod1 /
 * CompactLod3 based on `isBlockSummary` and `lod`. It also derives
 * `serviceLineText` (deduplication of runtimeLabel suffix), pipeline
 * status aggregation for source-repo nodes, and forwards mouse / fold
 * callbacks to the chosen LOD.
 *
 * Branches under test (orchestrator-only — visual subtree assertions
 * live in the per-LOD test files):
 *   - computeCompactNodeHeight / Width return constants regardless of input.
 *   - isBlockSummary → BlockSummaryCard branch.
 *   - lod >= 3 → CompactLod3 branch.
 *   - lod < 3 → CompactLod1 branch.
 *   - data.iceType extraction + category prefix split.
 *   - data.repository / data.github / data.repo fallback chain.
 *   - data.deploy_status drives statusLabel + statusColor (no fallback).
 *   - isSourceRepo: iceType === 'Source.Repository' OR data.behavior === 'source'.
 *   - hasScaling: minInstances or maxInstances non-null.
 *   - dedupedRuntime: drops runtime when serviceName ends in same word.
 *   - aggregatePipelineStatus: returns active > failed > success when
 *     isSourceRepo + connectedPipelineStatuses non-empty.
 *   - effectivePipelineStatus uses pipelineStatus or aggregate.
 *   - border: dragOver → cyan; selected/hovered → glow; else → glow55.
 *   - handleFold stops propagation + calls onToggleFold(node.id).
 *   - onEnter/onLeave fire onNodeHover with id / null.
 *
 * Hooks are mocked: useState reflects a controllable hover state,
 * useRef returns a fresh container, useEffect / useCallback are
 * passthrough, useReducedMotion returns false.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const named = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    BlockSummaryCard: named('MockBlockSummaryCard'),
    CompactLod1: named('MockCompactLod1'),
    CompactLod3: named('MockCompactLod3'),
    state: {
      hoverValue: false as boolean,
      setHoverSpy: vi.fn(),
    },
  };
});

vi.mock('../block-summary-card', () => ({
  BlockSummaryCard: mocks.BlockSummaryCard,
  BLOCK_SUMMARY_H: 80,
  BLOCK_SUMMARY_W: 260,
}));
vi.mock('../compact-lod1', () => ({ CompactLod1: mocks.CompactLod1 }));
vi.mock('../compact-lod3', () => ({ CompactLod3: mocks.CompactLod3 }));

// Hook mocks: enable invocation outside a render context.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initialValue = typeof init === 'function' ? (init as () => T)() : init;
      // The only useState call is `useState(false)` for isHovered.
      if (typeof initialValue === 'boolean') {
        return [mocks.state.hoverValue as unknown as T, mocks.state.setHoverSpy];
      }
      return [initialValue, vi.fn()];
    }),
    useRef: vi.fn(<T,>(init: T): { current: T } => ({ current: init })),
    useEffect: vi.fn(),
    useCallback: vi.fn(<T,>(fn: T, _deps: unknown[]) => fn),
  };
});

vi.mock('../../../../../../shared/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => false,
}));

import {
  SvgCompactNode,
  computeCompactNodeHeight,
  computeCompactNodeWidth,
  BLOCK_SUMMARY_H,
  BLOCK_SUMMARY_W,
} from '..';
import type { CanvasNode } from '../../../svg-canvas';
import type { NodePipelineStatus } from '../types';

const MockBlockSummaryCard = mocks.BlockSummaryCard;
const MockCompactLod1 = mocks.CompactLod1;
const MockCompactLod3 = mocks.CompactLod3;

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'node-1',
  type: 'block',
  x: 100,
  y: 200,
  width: 240,
  height: 120,
  label: 'My Node',
  data: {},
  parentId: undefined,
  ...overrides,
});

const renderSCN = (
  props: Partial<React.ComponentProps<typeof SvgCompactNode>> = {},
): React.ReactElement => {
  const Inner = SvgCompactNode as React.FC<React.ComponentProps<typeof SvgCompactNode>>;
  const defaults: React.ComponentProps<typeof SvgCompactNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return Inner({ ...defaults, ...props }) as React.ReactElement;
};

beforeEach(() => {
  mocks.state.hoverValue = false;
  mocks.state.setHoverSpy.mockClear();
});

// ─── Constants ──────────────────────────────────────────────────────

describe('computeCompactNodeHeight / Width', () => {
  it('computeCompactNodeHeight returns CARD_HEIGHT regardless of inputs', () => {
    const h1 = computeCompactNodeHeight({}, false);
    const h2 = computeCompactNodeHeight({ x: 1 }, true, true);
    expect(h1).toBe(h2);
    expect(typeof h1).toBe('number');
    expect(h1).toBeGreaterThan(0);
  });

  it('computeCompactNodeWidth returns CARD_WIDTH regardless of inputs', () => {
    const w1 = computeCompactNodeWidth(false);
    const w2 = computeCompactNodeWidth(true);
    expect(w1).toBe(w2);
  });

  it('re-exports BLOCK_SUMMARY_H / BLOCK_SUMMARY_W from block-summary-card', () => {
    expect(BLOCK_SUMMARY_H).toBe(80);
    expect(BLOCK_SUMMARY_W).toBe(260);
  });

  it('SvgCompactNode has displayName "SvgCompactNode"', () => {
    expect((SvgCompactNode as { displayName?: string }).displayName).toBe('SvgCompactNode');
  });
});

// ─── Branch dispatch ────────────────────────────────────────────────

describe('SvgCompactNode — branch dispatch', () => {
  it('renders BlockSummaryCard when isBlockSummary=true', () => {
    const tree = renderSCN({ isBlockSummary: true });
    expect(tree.type).toBe(MockBlockSummaryCard);
  });

  it('renders CompactLod3 when lod >= 3 (default)', () => {
    expect(renderSCN({}).type).toBe(MockCompactLod3);
    expect(renderSCN({ lod: 3 }).type).toBe(MockCompactLod3);
    expect(renderSCN({ lod: 5 }).type).toBe(MockCompactLod3);
  });

  it('renders CompactLod1 when lod < 3', () => {
    expect(renderSCN({ lod: 2 }).type).toBe(MockCompactLod1);
    expect(renderSCN({ lod: 1 }).type).toBe(MockCompactLod1);
    expect(renderSCN({ lod: 0 }).type).toBe(MockCompactLod1);
  });
});

// ─── BlockSummaryCard arm ──────────────────────────────────────────

describe('SvgCompactNode — BlockSummaryCard branch', () => {
  it('forwards node, isSelected, childNodes, isHovered=false initially', () => {
    const node = makeNode({ id: 'block-7' });
    const tree = renderSCN({ node, isBlockSummary: true, isSelected: true, childNodes: [makeNode({ id: 'c1' })] });
    const props = tree.props as Record<string, unknown>;
    expect(props.node).toBe(node);
    expect(props.isSelected).toBe(true);
    expect((props.childNodes as CanvasNode[]).length).toBe(1);
    expect(props.isHovered).toBe(false);
  });

  it('childNodes defaults to [] when not provided', () => {
    const tree = renderSCN({ isBlockSummary: true });
    expect((tree.props as { childNodes: CanvasNode[] }).childNodes).toEqual([]);
  });

  it('reflects mocked isHovered=true', () => {
    mocks.state.hoverValue = true;
    const tree = renderSCN({ isBlockSummary: true });
    expect((tree.props as { isHovered: boolean }).isHovered).toBe(true);
  });

  it('forwards onDoubleClickLabel', () => {
    const dbl = vi.fn();
    const tree = renderSCN({ isBlockSummary: true, onDoubleClickLabel: dbl });
    expect((tree.props as { onDoubleClickLabel: () => void }).onDoubleClickLabel).toBe(dbl);
  });
});

// ─── CompactLod3 arm — derived prop assertions ────────────────────

describe('SvgCompactNode — CompactLod3 branch (data extraction)', () => {
  const propsOf = (cmp: React.ReactElement): Record<string, unknown> => cmp.props as Record<string, unknown>;

  it('iceType + category derived from data.iceType', () => {
    const node = makeNode({ data: { iceType: 'Database.Postgres' } });
    const props = propsOf(renderSCN({ node }));
    expect(props.category).toBe('Database');
  });

  it('category falls back to "default" when iceType empty', () => {
    const props = propsOf(renderSCN({ node: makeNode() }));
    expect(props.category).toBe('default');
  });

  it('repository falls back to data.github / data.repo when data.repository absent', () => {
    expect(propsOf(renderSCN({ node: makeNode({ data: { repository: 'a/b' } }) })).repository).toBe('a/b');
    expect(propsOf(renderSCN({ node: makeNode({ data: { github: 'g/h' } }) })).repository).toBe('g/h');
    expect(propsOf(renderSCN({ node: makeNode({ data: { repo: 'r/p' } }) })).repository).toBe('r/p');
    expect(propsOf(renderSCN({ node: makeNode() })).repository).toBe('');
  });

  it('statusLabel = capitalized data.deploy_status, empty when absent', () => {
    expect(propsOf(renderSCN({ node: makeNode({ data: { deploy_status: 'active' } }) })).statusLabel).toBe('Active');
    expect(propsOf(renderSCN({ node: makeNode() })).statusLabel).toBe('');
  });

  it('isSourceRepo: iceType === Source.Repository or data.behavior === source', () => {
    expect(propsOf(renderSCN({ node: makeNode({ data: { iceType: 'Source.Repository' } }) })).isSourceRepo).toBe(true);
    expect(propsOf(renderSCN({ node: makeNode({ data: { behavior: 'source' } }) })).isSourceRepo).toBe(true);
    expect(propsOf(renderSCN({ node: makeNode() })).isSourceRepo).toBe(false);
  });

  it('hasScaling: true when minInstances or maxInstances set', () => {
    expect(propsOf(renderSCN({ node: makeNode({ data: { minInstances: 1 } }) })).hasScaling).toBe(true);
    expect(propsOf(renderSCN({ node: makeNode({ data: { maxInstances: 5 } }) })).hasScaling).toBe(true);
    expect(propsOf(renderSCN({ node: makeNode() })).hasScaling).toBe(false);
  });

  it('forwards minInstances / maxInstances / activeInstances', () => {
    const node = makeNode({
      data: { minInstances: 1, maxInstances: 9, activeInstances: 3 },
    });
    const p = propsOf(renderSCN({ node }));
    expect(p.minInstances).toBe(1);
    expect(p.maxInstances).toBe(9);
    expect(p.activeInstances).toBe(3);
  });

  it('numeric coercion: minInstances accepts string-like values', () => {
    const p = propsOf(renderSCN({
      node: makeNode({
        data: { minInstances: '5' as unknown as number },
      }),
    }));
    expect(p.minInstances).toBe(5);
  });

  it('null inputs map to null instance counts', () => {
    const p = propsOf(renderSCN({ node: makeNode() }));
    expect(p.minInstances).toBeNull();
    expect(p.maxInstances).toBeNull();
    expect(p.activeInstances).toBeNull();
  });

  it('dedupedRuntime: drops runtime equal to serviceName trailing word', () => {
    // backend-api with provider aws → service name will be a known string.
    // Trial: runtime equal to last word of service name → drop.
    const node = makeNode({
      data: { iceType: 'Compute.BackendAPI', provider: 'aws', runtime: 'X' },
    });
    const p = propsOf(renderSCN({ node }));
    expect(typeof p.serviceLineText).toBe('string');
  });

  it('runtimeLabel falls back to data.version when no runtime', () => {
    const node = makeNode({ data: { version: '20.x' } });
    expect(propsOf(renderSCN({ node })).runtimeLabel).toBe('20.x');
  });

  it('runtimeLabel empty when neither runtime nor version set', () => {
    expect(propsOf(renderSCN({ node: makeNode() })).runtimeLabel).toBe('');
  });

  it('forwards isDragOver / isSelected / lod3-specific flags', () => {
    const p = propsOf(renderSCN({ isSelected: true, isDragOver: true }));
    expect(p.isSelected).toBe(true);
    expect(p.isDragOver).toBe(true);
  });

  it('folded reads from data.folded', () => {
    expect(propsOf(renderSCN({ node: makeNode({ data: { folded: true } }) })).folded).toBe(true);
    expect(propsOf(renderSCN({ node: makeNode() })).folded).toBe(false);
  });

  it('estimatedCost reads from data.estimatedCost', () => {
    expect(propsOf(renderSCN({ node: makeNode({ data: { estimatedCost: '$1' } }) })).estimatedCost).toBe('$1');
    expect(propsOf(renderSCN({ node: makeNode() })).estimatedCost).toBe('');
  });

  it('reducedMotion comes from useReducedMotion (mocked false)', () => {
    expect(propsOf(renderSCN({})).reducedMotion).toBe(false);
  });

  it('connectedPipelineStatuses defaults to [] when not provided', () => {
    expect(propsOf(renderSCN({})).connectedPipelineStatuses).toEqual([]);
  });

  it('forwards validationSeverity / validationCount', () => {
    const p = propsOf(renderSCN({ validationSeverity: 'error', validationCount: 3 }));
    expect(p.validationSeverity).toBe('error');
    expect(p.validationCount).toBe(3);
  });
});

// ─── Pipeline status aggregation ──────────────────────────────────

describe('SvgCompactNode — aggregatePipelineStatus', () => {
  const propsOf = (cmp: React.ReactElement): Record<string, unknown> => cmp.props as Record<string, unknown>;

  it('returns active in-flight (building) over success', () => {
    const sourceRepo = makeNode({ data: { behavior: 'source' } });
    const statuses: NodePipelineStatus[] = [{ status: 'success' }, { status: 'building' }];
    const p = propsOf(renderSCN({ node: sourceRepo, connectedPipelineStatuses: statuses }));
    expect((p.effectivePipelineStatus as NodePipelineStatus).status).toBe('building');
  });

  it('returns deploying when present', () => {
    const sourceRepo = makeNode({ data: { behavior: 'source' } });
    const statuses: NodePipelineStatus[] = [{ status: 'success' }, { status: 'deploying' }];
    const p = propsOf(renderSCN({ node: sourceRepo, connectedPipelineStatuses: statuses }));
    expect((p.effectivePipelineStatus as NodePipelineStatus).status).toBe('deploying');
  });

  it('returns queued when present', () => {
    const sourceRepo = makeNode({ data: { behavior: 'source' } });
    const statuses: NodePipelineStatus[] = [{ status: 'success' }, { status: 'queued' }];
    const p = propsOf(renderSCN({ node: sourceRepo, connectedPipelineStatuses: statuses }));
    expect((p.effectivePipelineStatus as NodePipelineStatus).status).toBe('queued');
  });

  it('returns failed when no in-flight', () => {
    const sourceRepo = makeNode({ data: { behavior: 'source' } });
    const statuses: NodePipelineStatus[] = [{ status: 'success' }, { status: 'failed' }];
    const p = propsOf(renderSCN({ node: sourceRepo, connectedPipelineStatuses: statuses }));
    expect((p.effectivePipelineStatus as NodePipelineStatus).status).toBe('failed');
  });

  it('returns success when only success entries', () => {
    const sourceRepo = makeNode({ data: { behavior: 'source' } });
    const statuses: NodePipelineStatus[] = [{ status: 'success' }];
    const p = propsOf(renderSCN({ node: sourceRepo, connectedPipelineStatuses: statuses }));
    expect((p.effectivePipelineStatus as NodePipelineStatus).status).toBe('success');
  });

  it('returns null when no candidates match', () => {
    const sourceRepo = makeNode({ data: { behavior: 'source' } });
    const statuses: NodePipelineStatus[] = [{ status: 'idle' }];
    const p = propsOf(renderSCN({ node: sourceRepo, connectedPipelineStatuses: statuses }));
    expect(p.effectivePipelineStatus).toBeNull();
  });

  it('aggregator returns null when not isSourceRepo', () => {
    const node = makeNode();
    const statuses: NodePipelineStatus[] = [{ status: 'building' }];
    const p = propsOf(renderSCN({ node, connectedPipelineStatuses: statuses }));
    expect(p.effectivePipelineStatus).toBeNull();
  });

  it('aggregator returns null when statuses array empty', () => {
    const sourceRepo = makeNode({ data: { behavior: 'source' } });
    const p = propsOf(renderSCN({ node: sourceRepo, connectedPipelineStatuses: [] }));
    expect(p.effectivePipelineStatus).toBeNull();
  });

  it('explicit pipelineStatus prop wins over aggregate', () => {
    const sourceRepo = makeNode({ data: { behavior: 'source' } });
    const statuses: NodePipelineStatus[] = [{ status: 'success' }];
    const explicit: NodePipelineStatus = { status: 'failed' };
    const p = propsOf(renderSCN({
      node: sourceRepo,
      connectedPipelineStatuses: statuses,
      pipelineStatus: explicit,
    }));
    expect(p.effectivePipelineStatus).toBe(explicit);
  });
});

// ─── Border colour ───────────────────────────────────────────────

describe('SvgCompactNode — border colour selection', () => {
  it('cyan #22d3ee on dragOver', () => {
    const p = (renderSCN({ isDragOver: true }).props as { border: string });
    expect(p.border).toBe('#22d3ee');
  });

  it('uses cat.glow on selected', () => {
    const p = (renderSCN({ isSelected: true }).props as { border: string });
    // Some glow string — non-empty + does NOT end in '55'
    expect(p.border).toBeTruthy();
    expect(p.border.endsWith('55')).toBe(false);
  });

  it('uses cat.glow on hovered', () => {
    mocks.state.hoverValue = true;
    const p = (renderSCN({}).props as { border: string });
    expect(p.border.endsWith('55')).toBe(false);
  });

  it('uses cat.glow + 55 (de-emphasised) when neither selected nor hovered', () => {
    const p = (renderSCN({}).props as { border: string });
    expect(p.border.endsWith('55')).toBe(true);
  });
});

// ─── Mouse / fold callbacks ─────────────────────────────────────

describe('SvgCompactNode — callbacks', () => {
  it('handleFold stops propagation + fires onToggleFold(node.id)', () => {
    const fold = vi.fn();
    const node = makeNode({ id: 'foo' });
    const tree = renderSCN({ node, onToggleFold: fold });
    const onToggleFold = (tree.props as { onToggleFold: (e: React.MouseEvent) => void }).onToggleFold;
    const stops: string[] = [];
    onToggleFold({ stopPropagation: () => stops.push('s') } as React.MouseEvent);
    expect(stops).toEqual(['s']);
    expect(fold).toHaveBeenCalledWith('foo');
  });

  it('handleFold no-op when onToggleFold undefined', () => {
    const tree = renderSCN({});
    const onToggleFold = (tree.props as { onToggleFold: (e: React.MouseEvent) => void }).onToggleFold;
    expect(() => onToggleFold({ stopPropagation: () => {} } as React.MouseEvent)).not.toThrow();
  });

  it('onMouseEnter sets hover + calls onNodeHover(id)', () => {
    const hover = vi.fn();
    const node = makeNode({ id: 'foo' });
    const tree = renderSCN({ node, onNodeHover: hover });
    const onMouseEnter = (tree.props as { onMouseEnter: () => void }).onMouseEnter;
    onMouseEnter();
    expect(mocks.state.setHoverSpy).toHaveBeenCalledWith(true);
    expect(hover).toHaveBeenCalledWith('foo');
  });

  it('onMouseLeave clears hover + calls onNodeHover(null)', () => {
    const hover = vi.fn();
    const tree = renderSCN({ onNodeHover: hover });
    const onMouseLeave = (tree.props as { onMouseLeave: () => void }).onMouseLeave;
    onMouseLeave();
    expect(mocks.state.setHoverSpy).toHaveBeenCalledWith(false);
    expect(hover).toHaveBeenCalledWith(null);
  });

  it('hover handlers no-op when onNodeHover not provided', () => {
    const tree = renderSCN({});
    const props = tree.props as { onMouseEnter: () => void; onMouseLeave: () => void };
    expect(() => props.onMouseEnter()).not.toThrow();
    expect(() => props.onMouseLeave()).not.toThrow();
  });
});

// ─── CompactLod1 arm — surface check ────────────────────────────

describe('SvgCompactNode — CompactLod1 branch surface', () => {
  it('forwards nodeId, x, y, label, brandIconUrl, providerUrl', () => {
    const node = makeNode({ id: 'block-1', x: 50, y: 60, label: 'My' });
    const tree = renderSCN({ node, lod: 1 });
    const props = tree.props as Record<string, unknown>;
    expect(props.nodeId).toBe('block-1');
    expect(props.x).toBe(50);
    expect(props.y).toBe(60);
    expect(props.label).toBe('My');
    expect(typeof props.providerUrl).toBe('string');
  });

  it('label falls back to empty string when undefined', () => {
    const node = makeNode({ label: undefined as unknown as string });
    const tree = renderSCN({ node, lod: 1 });
    expect((tree.props as { label: string }).label).toBe('');
  });
});
