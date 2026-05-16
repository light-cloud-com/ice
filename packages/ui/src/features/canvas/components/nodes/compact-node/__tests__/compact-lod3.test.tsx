/**
 * Tests for `CompactLod3` — the full-detail (LOD 3) canvas-block renderer.
 *
 * The component is wrapped in `React.memo`, so the runtime export is the
 * memo object `{ $$typeof, type: <Inner FC>, compare }`. We reach for
 * `(CompactLod3 as { type: FC }).type(props)` to invoke the inner render
 * under the direct-FC tree-walker pattern (no jsdom).
 *
 * Mocks:
 *   - `ConceptInfoTrigger`, `ConnectedPipelineDots`, `MetadataLines`,
 *     `PipelineRow`, `ScalingRow`, `ServiceLine`, `StatusCostLine`,
 *     `NodeHeader`, `ProviderPill`, `ValidationBadge`, `FoldButton`,
 *     `ConnectionPorts`, `ConnectionDragGlow`, `DragOverGlow` — replaced
 *     with labelled FCs returning `null` so the tree-walker can identify
 *     each subcomponent by reference equality on `el.type`.
 *   - `getDeployBadge` is the real helper from `../helpers` (already
 *     under unit test in `helpers.test.ts`); we exercise the visible
 *     wire from `deployStatus → badge label / color → rendered <span>`.
 *
 * Behaviour pinned by the brief:
 *   - Renders the deploy badge for queued / deploying / active / error /
 *     skipped / cancelled wire-status overlay strings (each maps to the
 *     expected color + label via getDeployBadge).
 *   - Pulse animation on the inner dot fires only when isDeploying AND
 *     reducedMotion is false.
 *   - The de-emphasis fade (opacity 0.6 → 1) gates on
 *     `deployStatus ∈ {skipped, cancelled}`.
 *   - Folded vs unfolded layout — folded reduces height to 38, hides
 *     ServiceLine/MetadataLines/ScalingRow/PipelineRow/StatusCostLine,
 *     swaps the trailing children to the runtime label + fold button.
 *   - Scaling row (ScalingRow renders only when `hasScaling=true` AND
 *     unfolded).
 *   - Connected pipeline dots (only when isSourceRepo, statuses non-empty
 *     AND no active pipeline status of its own).
 *   - URL field rendering (primary URL prioritization: custom_domain_url
 *     > domain > url > default_url > gs:// fallback > IP fallback >
 *     provider_id; secondary URL renders firebase / default_url
 *     underneath when distinct).
 *   - Cost estimate rendering via `StatusCostLine` (gated on
 *     `statusLabel || estimatedCost`).
 *   - Container vs resource shape: the component reads `node.data.iceType`
 *     for the data-ice-type attribute on the outer <g>.
 *   - Validation badge renders for severity ∈ {error, warning} and is
 *     omitted for severity === 'info'.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// ─── Mocks for sub-components: each becomes a labelled FC so we can
//     identify it in the tree by reference equality on `el.type`. ─────

const mocks = vi.hoisted(() => {
  const named = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    ConceptInfoTrigger: named('MockConceptInfoTrigger'),
    ConnectedPipelineDots: named('MockConnectedPipelineDots'),
    MetadataLines: named('MockMetadataLines'),
    PipelineRow: named('MockPipelineRow'),
    ScalingRow: named('MockScalingRow'),
    ServiceLine: named('MockServiceLine'),
    StatusCostLine: named('MockStatusCostLine'),
    NodeHeader: named('MockNodeHeader'),
    ProviderPill: named('MockProviderPill'),
    ValidationBadge: named('MockValidationBadge'),
    FoldButton: named('MockFoldButton'),
    ConnectionPorts: named('MockConnectionPorts'),
    ConnectionDragGlow: named('MockConnectionDragGlow'),
    DragOverGlow: named('MockDragOverGlow'),
  };
});

vi.mock('../../../../../concept-info', () => ({
  ConceptInfoTrigger: mocks.ConceptInfoTrigger,
}));
vi.mock('../connected-pipeline-dots', () => ({
  ConnectedPipelineDots: mocks.ConnectedPipelineDots,
}));
vi.mock('../metadata-lines', () => ({ MetadataLines: mocks.MetadataLines }));
vi.mock('../pipeline-row', () => ({ PipelineRow: mocks.PipelineRow }));
vi.mock('../scaling-row', () => ({ ScalingRow: mocks.ScalingRow }));
vi.mock('../service-line', () => ({ ServiceLine: mocks.ServiceLine }));
vi.mock('../status-cost-line', () => ({ StatusCostLine: mocks.StatusCostLine }));
vi.mock('../../_shared/node-header', () => ({ NodeHeader: mocks.NodeHeader }));
vi.mock('../../_shared/provider-pill', () => ({ ProviderPill: mocks.ProviderPill }));
vi.mock('../../_shared/validation-badge', () => ({ ValidationBadge: mocks.ValidationBadge }));
vi.mock('../../_shared/fold-button', () => ({ FoldButton: mocks.FoldButton }));
vi.mock('../../_shared/connection-ports', () => ({ ConnectionPorts: mocks.ConnectionPorts }));
vi.mock('../../_shared/connection-drag-glow', () => ({ ConnectionDragGlow: mocks.ConnectionDragGlow }));
vi.mock('../../_shared/drag-over-glow', () => ({ DragOverGlow: mocks.DragOverGlow }));

// Imports come AFTER vi.mock so the mocked modules are bound.
import { CompactLod3 } from '../compact-lod3';
import type { CanvasNode } from '../../../svg-canvas';
import type { NodePipelineStatus } from '../types';
import type { BrandIcon } from '../../../../../../assets/icons/brand-registry';

// Aliases for assertions.
const MockConnectedPipelineDots = mocks.ConnectedPipelineDots;
const MockMetadataLines = mocks.MetadataLines;
const MockPipelineRow = mocks.PipelineRow;
const MockScalingRow = mocks.ScalingRow;
const MockServiceLine = mocks.ServiceLine;
const MockStatusCostLine = mocks.StatusCostLine;
const MockNodeHeader = mocks.NodeHeader;
const MockProviderPill = mocks.ProviderPill;
const MockValidationBadge = mocks.ValidationBadge;
const MockFoldButton = mocks.FoldButton;
const MockConnectionPorts = mocks.ConnectionPorts;
const MockConnectionDragGlow = mocks.ConnectionDragGlow;
const MockDragOverGlow = mocks.DragOverGlow;
const MockConceptInfoTrigger = mocks.ConceptInfoTrigger;

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

const renderLod3 = (props: Partial<React.ComponentProps<typeof CompactLod3>> = {}): React.ReactElement => {
  const Inner = (CompactLod3 as unknown as {
    type: (p: React.ComponentProps<typeof CompactLod3>) => React.ReactElement;
  }).type;
  const defaults: React.ComponentProps<typeof CompactLod3> = {
    node: makeNode(),
    x: 100,
    y: 200,
    label: 'My Node',
    category: 'Compute',
    categoryGlow: '#f59e0b',
    provider: 'aws',
    brandIcon: null,
    providerUrl: 'https://example.com/icon.svg',
    serviceLineText: 'Lambda · Node 18',
    runtimeLabel: 'node18',
    metaLines: ['line a', 'line b'],
    repoLineIndex: -1,
    isSourceRepo: false,
    repository: '',
    statusLabel: '',
    statusColor: '#22c55e',
    estimatedCost: '',
    border: '#444',
    isSelected: false,
    isHovered: false,
    isDragOver: false,
    folded: false,
    hasScaling: false,
    minInstances: null,
    maxInstances: null,
    activeInstances: null,
    effectivePipelineStatus: null,
    connectedPipelineStatuses: [],
    connectionDragState: null,
    validationSeverity: null,
    validationCount: 0,
    reducedMotion: false,
    onMouseEnter: () => {},
    onMouseLeave: () => {},
    onToggleFold: () => {},
    onDoubleClickLabel: undefined,
    onUpdateData: undefined,
    onPipelineClick: undefined,
  };
  return Inner({ ...defaults, ...props });
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. React.memo boundary + display name
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — React.memo boundary', () => {
  it('is wrapped in React.memo', () => {
    const memoTypeof = (CompactLod3 as unknown as { $$typeof: symbol }).$$typeof;
    expect(typeof memoTypeof).toBe('symbol');
    expect(String(memoTypeof)).toBe('Symbol(react.memo)');
  });

  it('exposes its inner FC under .type', () => {
    const inner = (CompactLod3 as unknown as { type: unknown }).type;
    expect(typeof inner).toBe('function');
  });

  it('carries displayName "CompactLod3"', () => {
    expect((CompactLod3 as unknown as { displayName: string }).displayName).toBe('CompactLod3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Outer <g> — data attributes, cursor, opacity gates
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — outer <g> shell attributes', () => {
  it('writes data-node-id and data-ice-type attributes from node.id and node.data.iceType', () => {
    const node = makeNode({ id: 'block-7', data: { iceType: 'Compute.BackendAPI' } });
    const tree = renderLod3({ node });
    const g = tree as React.ReactElement;
    const props = g.props as { 'data-node-id': string; 'data-ice-type': string };
    expect(props['data-node-id']).toBe('block-7');
    expect(props['data-ice-type']).toBe('Compute.BackendAPI');
  });

  it('falls back to empty data-ice-type when node.data.iceType is absent', () => {
    const tree = renderLod3({ node: makeNode({ data: {} }) });
    const props = (tree as React.ReactElement).props as { 'data-ice-type': string };
    expect(props['data-ice-type']).toBe('');
  });

  it('sets cursor: crosshair when connectionDragState is "valid-target"', () => {
    const tree = renderLod3({ connectionDragState: 'valid-target' });
    const props = (tree as React.ReactElement).props as { style: { cursor: string } };
    expect(props.style.cursor).toBe('crosshair');
  });

  it('sets cursor: move when connectionDragState is null', () => {
    const tree = renderLod3({ connectionDragState: null });
    const props = (tree as React.ReactElement).props as { style: { cursor: string } };
    expect(props.style.cursor).toBe('move');
  });

  it('drops opacity to 0.3 on outer <g> when connectionDragState is "invalid-target"', () => {
    const tree = renderLod3({ connectionDragState: 'invalid-target' });
    const props = (tree as React.ReactElement).props as { opacity: number };
    expect(props.opacity).toBe(0.3);
  });

  it('keeps outer opacity at 1 for source / valid / null connectionDragState', () => {
    for (const ds of ['source', 'valid-target', null] as const) {
      const tree = renderLod3({ connectionDragState: ds });
      const props = (tree as React.ReactElement).props as { opacity: number };
      expect(props.opacity).toBe(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Inner card — height, border, shadow, opacity (de-emphasis fade)
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — inner card geometry & colours', () => {
  // The inner div (foreignObject > div) is the one with the boxShadow
  // style. We pull it by walking and matching on the boxSizing field.
  const findCard = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { style?: { boxSizing?: string } }).style?.boxSizing === 'border-box',
    )[0];

  it('renders card height of 38 when folded', () => {
    const tree = renderLod3({ folded: true });
    const fobj = findByType(tree, 'foreignObject')[0];
    expect((fobj.props as { height: number }).height).toBe(38);
  });

  it('renders card height = CARD_HEIGHT when not folded', () => {
    const tree = renderLod3({ folded: false });
    const fobj = findByType(tree, 'foreignObject')[0];
    // CARD_HEIGHT default from constants — non-folded > 38
    expect((fobj.props as { height: number }).height).toBeGreaterThan(38);
  });

  it('uses #22c55e border colour when connectionDragState === "valid-target" (overrides border prop)', () => {
    const tree = renderLod3({ connectionDragState: 'valid-target', border: '#444' });
    const card = findCard(tree)!;
    const style = (card.props as { style: { border: string } }).style;
    expect(style.border).toBe('1px solid #22c55e');
  });

  it('drops card opacity to 0.6 for skipped / cancelled deploy_status (de-emphasis fade)', () => {
    for (const status of ['skipped', 'cancelled']) {
      const tree = renderLod3({ node: makeNode({ data: { deploy_status: status } }) });
      const card = findCard(tree)!;
      const style = (card.props as { style: { opacity: number } }).style;
      expect(style.opacity).toBe(0.6);
    }
  });

  it('keeps card opacity at 1 for active / deploying / queued (no de-emphasis)', () => {
    for (const status of ['active', 'deploying', 'queued', 'error', '']) {
      const tree = renderLod3({ node: makeNode({ data: { deploy_status: status } }) });
      const card = findCard(tree)!;
      const style = (card.props as { style: { opacity: number } }).style;
      expect(style.opacity).toBe(1);
    }
  });

  it('selected cards get the categoryGlow box shadow (selection ring)', () => {
    const tree = renderLod3({ isSelected: true, categoryGlow: '#abcdef' });
    const card = findCard(tree)!;
    const style = (card.props as { style: { boxShadow: string } }).style;
    expect(style.boxShadow).toContain('#abcdef');
  });

  it('hovered cards get the hover shadow when not selected', () => {
    const tree = renderLod3({ isSelected: false, isHovered: true });
    const card = findCard(tree)!;
    const style = (card.props as { style: { boxShadow: string } }).style;
    expect(style.boxShadow).toBe('0 2px 8px -2px rgba(0,0,0,0.15)');
  });

  it('default (not selected, not hovered) renders the resting shadow', () => {
    const tree = renderLod3({ isSelected: false, isHovered: false });
    const card = findCard(tree)!;
    const style = (card.props as { style: { boxShadow: string } }).style;
    expect(style.boxShadow).toBe('0 1px 3px rgba(0,0,0,0.06)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Drag overlays
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — drag overlays', () => {
  it('renders DragOverGlow when isDragOver is true', () => {
    const tree = renderLod3({ isDragOver: true });
    expect(findByType(tree, MockDragOverGlow)).toHaveLength(1);
  });

  it('does NOT render DragOverGlow when isDragOver is false', () => {
    const tree = renderLod3({ isDragOver: false });
    expect(findByType(tree, MockDragOverGlow)).toHaveLength(0);
  });

  it('renders ConnectionDragGlow when connectionDragState is "valid-target"', () => {
    const tree = renderLod3({ connectionDragState: 'valid-target' });
    expect(findByType(tree, MockConnectionDragGlow)).toHaveLength(1);
  });

  it('does NOT render ConnectionDragGlow for "invalid-target" / "source" / null', () => {
    for (const ds of ['invalid-target', 'source', null] as const) {
      const tree = renderLod3({ connectionDragState: ds });
      expect(findByType(tree, MockConnectionDragGlow)).toHaveLength(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Connection ports (only when hovered or valid-target)
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — connection ports', () => {
  it('renders ConnectionPorts when isHovered is true', () => {
    const tree = renderLod3({ isHovered: true });
    expect(findByType(tree, MockConnectionPorts)).toHaveLength(1);
  });

  it('renders ConnectionPorts when connectionDragState === "valid-target"', () => {
    const tree = renderLod3({ isHovered: false, connectionDragState: 'valid-target' });
    expect(findByType(tree, MockConnectionPorts)).toHaveLength(1);
  });

  it('does NOT render ConnectionPorts when not hovered and no valid-target drag', () => {
    const tree = renderLod3({ isHovered: false, connectionDragState: null });
    expect(findByType(tree, MockConnectionPorts)).toHaveLength(0);
  });

  it('forwards isValidTarget=true onto the ConnectionPorts when in valid-target drag', () => {
    const tree = renderLod3({ connectionDragState: 'valid-target' });
    const ports = findByType(tree, MockConnectionPorts)[0];
    expect((ports.props as { isValidTarget: boolean }).isValidTarget).toBe(true);
  });

  it('forwards isValidTarget=false on hover (no drag in flight)', () => {
    const tree = renderLod3({ isHovered: true, connectionDragState: null });
    const ports = findByType(tree, MockConnectionPorts)[0];
    expect((ports.props as { isValidTarget: boolean }).isValidTarget).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Deploy badge dispatch (queued / deploying / active / error / skipped /
//    cancelled / unknown) — colour + label, plus pulse animation gate.
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — deploy badge dispatch (overlay status → badge)', () => {
  // Walk into the NodeHeader's `trailing` prop tree (which is a React node).
  const trailingFrom = (tree: React.ReactElement): React.ReactNode => {
    const header = findByType(tree, MockNodeHeader)[0];
    return (header.props as { trailing?: React.ReactNode }).trailing;
  };

  /** The deploy badge wrapper is a <span> with a DEPLOY/LIVE/etc. label. */
  const findBadgeSpan = (tree: React.ReactElement, label: string): React.ReactElement | undefined => {
    const trailing = trailingFrom(tree);
    return findByPredicate(trailing, (el) => {
      if (el.type !== 'span') return false;
      const text = collectText(el);
      return text.includes(label);
    })[0];
  };

  it('renders LIVE badge with #22c55e for active', () => {
    const tree = renderLod3({ node: makeNode({ data: { deploy_status: 'active' } }) });
    const badge = findBadgeSpan(tree, 'LIVE');
    expect(badge).toBeDefined();
    const style = (badge!.props as { style: { color: string } }).style;
    expect(style.color).toBe('#22c55e');
  });

  it('renders DEPLOY badge with #3b82f6 for deploying', () => {
    const tree = renderLod3({ node: makeNode({ data: { deploy_status: 'deploying' } }) });
    const badge = findBadgeSpan(tree, 'DEPLOY');
    expect(badge).toBeDefined();
    const style = (badge!.props as { style: { color: string } }).style;
    expect(style.color).toBe('#3b82f6');
  });

  it('renders ERR badge with #ef4444 for error', () => {
    const tree = renderLod3({ node: makeNode({ data: { deploy_status: 'error' } }) });
    const badge = findBadgeSpan(tree, 'ERR');
    expect(badge).toBeDefined();
    const style = (badge!.props as { style: { color: string } }).style;
    expect(style.color).toBe('#ef4444');
  });

  it('renders QUEUED badge with #f59e0b for queued', () => {
    const tree = renderLod3({ node: makeNode({ data: { deploy_status: 'queued' } }) });
    const badge = findBadgeSpan(tree, 'QUEUED');
    expect(badge).toBeDefined();
    const style = (badge!.props as { style: { color: string } }).style;
    expect(style.color).toBe('#f59e0b');
  });

  it('renders CANCEL badge with #94a3b8 for cancelled', () => {
    const tree = renderLod3({ node: makeNode({ data: { deploy_status: 'cancelled' } }) });
    const badge = findBadgeSpan(tree, 'CANCEL');
    expect(badge).toBeDefined();
    const style = (badge!.props as { style: { color: string } }).style;
    expect(style.color).toBe('#94a3b8');
  });

  it('renders SKIPPED badge with #94a3b8 for skipped', () => {
    const tree = renderLod3({ node: makeNode({ data: { deploy_status: 'skipped' } }) });
    const badge = findBadgeSpan(tree, 'SKIPPED');
    expect(badge).toBeDefined();
    const style = (badge!.props as { style: { color: string } }).style;
    expect(style.color).toBe('#94a3b8');
  });

  it('renders no deploy badge for empty / unknown / idle status', () => {
    for (const status of ['', 'idle', 'unknown']) {
      const tree = renderLod3({ node: makeNode({ data: { deploy_status: status } }) });
      const trailing = trailingFrom(tree);
      // Look for any of the well-known labels.
      const knownLabels = ['LIVE', 'DEPLOY', 'ERR', 'QUEUED', 'CANCEL', 'SKIPPED'];
      const text = collectText(trailing);
      for (const label of knownLabels) {
        expect(text).not.toContain(label);
      }
    }
  });

  it('inner dot pulses (animation set) when isDeploying AND reducedMotion is false', () => {
    const tree = renderLod3({
      node: makeNode({ data: { deploy_status: 'deploying' } }),
      reducedMotion: false,
    });
    const badge = findByPredicate(trailingFrom(tree) as React.ReactNode, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { animation?: string } }).style;
      return Boolean(style?.animation && style.animation.includes('pulse-opacity'));
    });
    expect(badge).toHaveLength(1);
  });

  it('inner dot does NOT pulse when reducedMotion is true', () => {
    const tree = renderLod3({
      node: makeNode({ data: { deploy_status: 'deploying' } }),
      reducedMotion: true,
    });
    const badge = findByPredicate(trailingFrom(tree) as React.ReactNode, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { animation?: string } }).style;
      return Boolean(style?.animation && style.animation.includes('pulse-opacity'));
    });
    expect(badge).toHaveLength(0);
  });

  it('inner dot does NOT pulse for non-deploying status (e.g. queued — pulse implies work-happening)', () => {
    const tree = renderLod3({
      node: makeNode({ data: { deploy_status: 'queued' } }),
      reducedMotion: false,
    });
    const badge = findByPredicate(trailingFrom(tree) as React.ReactNode, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { animation?: string } }).style;
      return Boolean(style?.animation && style.animation.includes('pulse-opacity'));
    });
    expect(badge).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Folded vs unfolded layout
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — folded layout', () => {
  it('folded: hides ServiceLine, MetadataLines, ScalingRow, PipelineRow, StatusCostLine', () => {
    const tree = renderLod3({
      folded: true,
      hasScaling: true,
      effectivePipelineStatus: { status: 'building' },
      statusLabel: 'Active',
      isSourceRepo: true,
      connectedPipelineStatuses: [{ status: 'success' }],
    });
    expect(findByType(tree, MockServiceLine)).toHaveLength(0);
    expect(findByType(tree, MockMetadataLines)).toHaveLength(0);
    expect(findByType(tree, MockScalingRow)).toHaveLength(0);
    expect(findByType(tree, MockPipelineRow)).toHaveLength(0);
    expect(findByType(tree, MockStatusCostLine)).toHaveLength(0);
    expect(findByType(tree, MockConnectedPipelineDots)).toHaveLength(0);
  });

  it('folded: trailing renders runtime label (truncated to 10 chars + ellipsis when longer)', () => {
    const tree = renderLod3({ folded: true, runtimeLabel: 'this-is-a-long-runtime-name' });
    const header = findByType(tree, MockNodeHeader)[0];
    const trailing = (header.props as { trailing: React.ReactNode }).trailing;
    const text = collectText(trailing);
    expect(text).toContain('this-is-a-…');
    expect(text).not.toContain('runtime-name');
  });

  it('folded: trailing renders runtime label as-is when 10 chars or less', () => {
    const tree = renderLod3({ folded: true, runtimeLabel: 'node18' });
    const header = findByType(tree, MockNodeHeader)[0];
    const trailing = (header.props as { trailing: React.ReactNode }).trailing;
    const text = collectText(trailing);
    expect(text).toContain('node18');
  });

  it('folded: trailing renders FoldButton (folded=true)', () => {
    const tree = renderLod3({ folded: true });
    const header = findByType(tree, MockNodeHeader)[0];
    const trailing = (header.props as { trailing: React.ReactNode }).trailing;
    const buttons = findByType(trailing, MockFoldButton);
    expect(buttons).toHaveLength(1);
    expect((buttons[0].props as { folded: boolean }).folded).toBe(true);
  });

  it('folded: trailing omits ProviderPill (only ConceptInfoTrigger / runtime label / fold)', () => {
    const tree = renderLod3({ folded: true, provider: 'gcp' });
    const header = findByType(tree, MockNodeHeader)[0];
    const trailing = (header.props as { trailing: React.ReactNode }).trailing;
    expect(findByType(trailing, MockProviderPill)).toHaveLength(0);
  });

  it('folded: omits empty runtime span when runtimeLabel is empty', () => {
    const tree = renderLod3({ folded: true, runtimeLabel: '' });
    const header = findByType(tree, MockNodeHeader)[0];
    const trailing = (header.props as { trailing: React.ReactNode }).trailing;
    const text = collectText(trailing);
    // Only the icons + fold button remain — no runtime text.
    expect(text).toBe('');
  });

  it('unfolded: trailing renders ProviderPill when provider is non-empty', () => {
    const tree = renderLod3({ folded: false, provider: 'aws' });
    const header = findByType(tree, MockNodeHeader)[0];
    const trailing = (header.props as { trailing: React.ReactNode }).trailing;
    const pills = findByType(trailing, MockProviderPill);
    expect(pills).toHaveLength(1);
    expect((pills[0].props as { provider: string }).provider).toBe('aws');
  });

  it('unfolded: trailing still renders ProviderPill when provider is empty (pill handles AUTO fallback)', () => {
    const tree = renderLod3({ folded: false, provider: '' });
    const header = findByType(tree, MockNodeHeader)[0];
    const trailing = (header.props as { trailing: React.ReactNode }).trailing;
    const pills = findByType(trailing, MockProviderPill);
    expect(pills).toHaveLength(1);
    expect((pills[0].props as { provider: string }).provider).toBe('');
  });

  it('unfolded: NodeHeader gets labelFontSize=13 and folded gets labelFontSize=12', () => {
    const unfolded = renderLod3({ folded: false });
    const folded = renderLod3({ folded: true });
    const unfoldHdr = findByType(unfolded, MockNodeHeader)[0];
    const foldHdr = findByType(folded, MockNodeHeader)[0];
    expect((unfoldHdr.props as { labelFontSize: number }).labelFontSize).toBe(13);
    expect((foldHdr.props as { labelFontSize: number }).labelFontSize).toBe(12);
  });

  it('unfolded: renders a separate FoldButton near top-right (folded={false})', () => {
    const tree = renderLod3({ folded: false });
    // FoldButtons appear in a dedicated absolute-positioned div outside header trailing.
    const allFoldButtons = findByType(tree, MockFoldButton);
    // At least one — the top-right unfolded fold-button (header trailing none).
    expect(allFoldButtons.length).toBeGreaterThanOrEqual(1);
    // Ensure at least one carries folded={false} (the body fold-button).
    const bodyFold = allFoldButtons.find((b) => (b.props as { folded: boolean }).folded === false);
    expect(bodyFold).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. ServiceLine, MetadataLines, ScalingRow, PipelineRow, StatusCostLine
//    (unfolded composition)
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — unfolded composition', () => {
  it('unfolded: renders ServiceLine with brandIcon / providerUrl / serviceLineText forwarded', () => {
    const brandIcon: BrandIcon = { url: 'https://x.example/icon.svg', label: 'X' };
    const tree = renderLod3({
      folded: false,
      brandIcon,
      providerUrl: 'https://provider.example/icon.svg',
      serviceLineText: 'Cloud Run · Node 20',
    });
    const sl = findByType(tree, MockServiceLine)[0];
    const props = sl.props as { brandIcon: BrandIcon | null; providerUrl: string; serviceLineText: string };
    expect(props.brandIcon).toBe(brandIcon);
    expect(props.providerUrl).toBe('https://provider.example/icon.svg');
    expect(props.serviceLineText).toBe('Cloud Run · Node 20');
  });

  it('unfolded: renders MetadataLines with metaLines, repoLineIndex forwarded', () => {
    const tree = renderLod3({
      folded: false,
      metaLines: ['line1', 'line2'],
      repoLineIndex: 1,
      isSourceRepo: true,
      repository: 'octocat/Hello-World',
      isSelected: true,
      isHovered: true,
    });
    const ml = findByType(tree, MockMetadataLines)[0];
    const props = ml.props as {
      metaLines: string[];
      repoLineIndex: number;
      isSelected: boolean;
      isHovered: boolean;
      isSourceRepo: boolean;
      repository: string;
    };
    expect(props.metaLines).toEqual(['line1', 'line2']);
    expect(props.repoLineIndex).toBe(1);
    expect(props.isSelected).toBe(true);
    expect(props.isHovered).toBe(true);
    expect(props.isSourceRepo).toBe(true);
    expect(props.repository).toBe('octocat/Hello-World');
  });

  it('unfolded: renders ScalingRow only when hasScaling=true', () => {
    const withScaling = renderLod3({
      folded: false,
      hasScaling: true,
      minInstances: 1,
      maxInstances: 5,
      activeInstances: 3,
    });
    expect(findByType(withScaling, MockScalingRow)).toHaveLength(1);

    const without = renderLod3({ folded: false, hasScaling: false });
    expect(findByType(without, MockScalingRow)).toHaveLength(0);
  });

  it('unfolded: forwards minInstances/maxInstances/activeInstances to ScalingRow', () => {
    const tree = renderLod3({
      folded: false,
      hasScaling: true,
      minInstances: 2,
      maxInstances: 10,
      activeInstances: 4,
    });
    const sr = findByType(tree, MockScalingRow)[0];
    const props = sr.props as { minInstances: number; maxInstances: number; activeInstances: number };
    expect(props.minInstances).toBe(2);
    expect(props.maxInstances).toBe(10);
    expect(props.activeInstances).toBe(4);
  });

  it('unfolded: renders PipelineRow when effectivePipelineStatus is non-idle', () => {
    const tree = renderLod3({
      folded: false,
      effectivePipelineStatus: { status: 'building' },
    });
    expect(findByType(tree, MockPipelineRow)).toHaveLength(1);
  });

  it('unfolded: omits PipelineRow when effectivePipelineStatus is null', () => {
    const tree = renderLod3({ folded: false, effectivePipelineStatus: null });
    expect(findByType(tree, MockPipelineRow)).toHaveLength(0);
  });

  it('unfolded: omits PipelineRow when effectivePipelineStatus.status is "idle"', () => {
    const tree = renderLod3({ folded: false, effectivePipelineStatus: { status: 'idle' } });
    expect(findByType(tree, MockPipelineRow)).toHaveLength(0);
  });

  it('unfolded: PipelineRow onClick stops propagation and fires onPipelineClick(node.id)', () => {
    const calls: string[] = [];
    const onPipelineClick = (id: string) => calls.push(id);
    const tree = renderLod3({
      folded: false,
      effectivePipelineStatus: { status: 'building' },
      onPipelineClick,
      node: makeNode({ id: 'pipe-1' }),
    });
    const pr = findByType(tree, MockPipelineRow)[0];
    const propagation: string[] = [];
    const fakeEvent = {
      stopPropagation: () => propagation.push('stopped'),
    } as unknown as React.MouseEvent;
    (pr.props as { onClick: (e: React.MouseEvent) => void }).onClick(fakeEvent);
    expect(propagation).toEqual(['stopped']);
    expect(calls).toEqual(['pipe-1']);
  });

  it('unfolded: PipelineRow onClick is a no-op when onPipelineClick is undefined', () => {
    const tree = renderLod3({
      folded: false,
      effectivePipelineStatus: { status: 'building' },
      onPipelineClick: undefined,
    });
    const pr = findByType(tree, MockPipelineRow)[0];
    expect(() =>
      (pr.props as { onClick: (e: React.MouseEvent) => void }).onClick({
        stopPropagation: () => {},
      } as React.MouseEvent),
    ).not.toThrow();
  });

  it('unfolded: renders ConnectedPipelineDots only when isSourceRepo + statuses non-empty + no own pipeline', () => {
    const statuses: NodePipelineStatus[] = [{ status: 'success' }, { status: 'building' }];
    const tree = renderLod3({
      folded: false,
      isSourceRepo: true,
      connectedPipelineStatuses: statuses,
      effectivePipelineStatus: null,
    });
    const dots = findByType(tree, MockConnectedPipelineDots);
    expect(dots).toHaveLength(1);
    expect((dots[0].props as { statuses: NodePipelineStatus[] }).statuses).toEqual(statuses);
  });

  it('unfolded: hides ConnectedPipelineDots when isSourceRepo=false', () => {
    const tree = renderLod3({
      folded: false,
      isSourceRepo: false,
      connectedPipelineStatuses: [{ status: 'success' }],
    });
    expect(findByType(tree, MockConnectedPipelineDots)).toHaveLength(0);
  });

  it('unfolded: hides ConnectedPipelineDots when own pipeline is active (hasPipeline true)', () => {
    const tree = renderLod3({
      folded: false,
      isSourceRepo: true,
      connectedPipelineStatuses: [{ status: 'success' }],
      effectivePipelineStatus: { status: 'building' },
    });
    expect(findByType(tree, MockConnectedPipelineDots)).toHaveLength(0);
  });

  it('unfolded: hides ConnectedPipelineDots when statuses array is empty', () => {
    const tree = renderLod3({
      folded: false,
      isSourceRepo: true,
      connectedPipelineStatuses: [],
    });
    expect(findByType(tree, MockConnectedPipelineDots)).toHaveLength(0);
  });

  it('unfolded: renders StatusCostLine when statusLabel OR estimatedCost is set', () => {
    const withStatus = renderLod3({ folded: false, statusLabel: 'Active', estimatedCost: '' });
    const withCost = renderLod3({ folded: false, statusLabel: '', estimatedCost: '$0.42' });
    const both = renderLod3({ folded: false, statusLabel: 'Live', estimatedCost: '$1.00' });
    expect(findByType(withStatus, MockStatusCostLine)).toHaveLength(1);
    expect(findByType(withCost, MockStatusCostLine)).toHaveLength(1);
    expect(findByType(both, MockStatusCostLine)).toHaveLength(1);
  });

  it('unfolded: omits StatusCostLine when neither statusLabel nor estimatedCost is set', () => {
    const tree = renderLod3({ folded: false, statusLabel: '', estimatedCost: '' });
    expect(findByType(tree, MockStatusCostLine)).toHaveLength(0);
  });

  it('unfolded: forwards statusLabel / statusColor / estimatedCost to StatusCostLine', () => {
    const tree = renderLod3({
      folded: false,
      statusLabel: 'Active',
      statusColor: '#22c55e',
      estimatedCost: '$0.42/h',
    });
    const sc = findByType(tree, MockStatusCostLine)[0];
    const props = sc.props as { statusLabel: string; statusColor: string; estimatedCost: string };
    expect(props.statusLabel).toBe('Active');
    expect(props.statusColor).toBe('#22c55e');
    expect(props.estimatedCost).toBe('$0.42/h');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Deploy progress + URL pill rendering
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — deploy progress / URL pill', () => {
  it('renders the deploy step label when deploying + step.label set, with (i/N) when index/total present', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: {
          deploy_status: 'deploying',
          deploy_progress: { step_label: 'Provisioning', step_index: 2, step_total: 5 },
        },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('Provisioning (2/5)');
  });

  it('renders the deploy step label without (i/N) when index or total is missing', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({ data: { deploy_status: 'deploying', deploy_progress: { step_label: 'Provisioning' } } }),
    });
    const text = collectText(tree);
    expect(text).toContain('Provisioning');
    expect(text).not.toMatch(/Provisioning\s*\(/);
  });

  it('does NOT render the deploy progress block when step_label is missing', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({ data: { deploy_status: 'deploying', deploy_progress: {} } }),
    });
    const text = collectText(tree);
    // Look for the "(2/5)" tail; should not be present without label.
    expect(text).not.toMatch(/\(\d+\/\d+\)/);
  });

  it('does NOT render the deploy progress block when not deploying', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: { deploy_status: 'active', deploy_progress: { step_label: 'Provisioning' } },
      }),
    });
    const text = collectText(tree);
    expect(text).not.toContain('Provisioning');
  });

  it('renders primary URL row from custom_domain_url when active', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: {
          deploy_status: 'active',
          deploy_outputs: { custom_domain_url: 'https://app.example.com' },
        },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('https://app.example.com');
  });

  it('renders both primary (custom_domain_url) and secondary (default_url) when distinct', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: {
          deploy_status: 'active',
          deploy_outputs: {
            custom_domain_url: 'https://app.example.com',
            default_url: 'https://my-site.web.app',
          },
        },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('https://app.example.com');
    expect(text).toContain('https://my-site.web.app');
  });

  it('renders only one URL row when default_url equals primary (no duplicate secondary)', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: {
          deploy_status: 'active',
          deploy_outputs: {
            custom_domain_url: 'https://app.example.com',
            default_url: 'https://app.example.com',
          },
        },
      }),
    });
    const text = collectText(tree);
    // Should appear exactly once (no duplicate row).
    expect(text.split('https://app.example.com').length - 1).toBe(1);
  });

  it('falls back to https://${domain} when only domain is set', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: { deploy_status: 'active', deploy_outputs: { domain: 'foo.bar' } },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('https://foo.bar');
  });

  it('falls back to deploy_outputs.url when domain and custom_domain_url are absent', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: { deploy_status: 'active', deploy_outputs: { url: 'https://run.app/svc' } },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('https://run.app/svc');
  });

  it('falls back to default_url when no other URL is present', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: { deploy_status: 'active', deploy_outputs: { default_url: 'https://only.example' } },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('https://only.example');
  });

  it('renders gs:// path for StaticSite + provider_id starts with gs://', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: { deploy_status: 'active', iceType: 'Compute.StaticSite', provider_id: 'gs://my-bucket' },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('gs://my-bucket');
  });

  it('returns null (no URL row) for StaticSite when no provider_id and no deploy_outputs.name', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: {
          deploy_status: 'active',
          iceType: 'Compute.StaticSite',
          deploy_outputs: {},
        },
      }),
    });
    // No URL pill — provider_id falsy + name falsy → null fall-through.
    const httpUrls = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const text = collectText(el);
      return text.startsWith('↗ gs://');
    });
    expect(httpUrls).toHaveLength(0);
  });

  it('renders gs://${name} for StaticSite when no provider_id but deploy_outputs.name set', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: {
          deploy_status: 'active',
          iceType: 'Compute.StaticSite',
          deploy_outputs: { name: 'fallback-bucket' },
        },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('gs://fallback-bucket');
  });

  it('renders http://<ip> for ip_address output', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: { deploy_status: 'active', deploy_outputs: { ip_address: '203.0.113.7' } },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('http://203.0.113.7');
  });

  it('renders http://<IPAddress> when capitalized field used (legacy field name)', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: { deploy_status: 'active', deploy_outputs: { IPAddress: '198.51.100.42' } },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('http://198.51.100.42');
  });

  it('falls back to provider_id when no URL outputs are present', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: { deploy_status: 'active', provider_id: 'projects/foo/services/bar' },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('projects/foo/services/bar');
  });

  it('renders no URL row when not active', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: { deploy_status: 'deploying', deploy_outputs: { custom_domain_url: 'https://foo' } },
      }),
    });
    const text = collectText(tree);
    expect(text).not.toContain('https://foo');
  });

  it('renders no URL row when active but no resolvable output (no provider_id, no outputs)', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({ data: { deploy_status: 'active', deploy_outputs: {} } }),
    });
    // No URL pill should render — only the existing Service/Metadata/Scaling rows.
    const httpUrls = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const text = collectText(el);
      return text.startsWith('↗ http');
    });
    expect(httpUrls).toHaveLength(0);
  });

  /** Find the URL row div: it's the one with onClick + cursor: pointer + position: absolute. */
  const findUrlRow = (tree: React.ReactElement, urlPrefix: string): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const props = el.props as {
        style?: { position?: string; cursor?: string };
        onClick?: unknown;
      };
      if (props.style?.position !== 'absolute' || props.style?.cursor !== 'pointer') return false;
      if (typeof props.onClick !== 'function') return false;
      return collectText(el).startsWith('↗ ' + urlPrefix);
    })[0];

  it('http URL row click opens window.open in a new tab (no shift key)', () => {
    const opened: Array<[string, string, string | undefined]> = [];
    const originalOpen = (globalThis as unknown as { window?: { open?: typeof window.open } }).window?.open;
    const fakeWindow = { open: ((url: string, target?: string, features?: string) => {
      opened.push([url, target ?? '', features]);
      return null;
    }) as unknown as typeof window.open };
    Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true, writable: true });
    try {
      const tree = renderLod3({
        folded: false,
        node: makeNode({
          data: { deploy_status: 'active', deploy_outputs: { url: 'https://run.app/svc' } },
        }),
      });
      const row = findUrlRow(tree, 'https://run.app/svc');
      expect(row).toBeDefined();
      const onClick = (row!.props as { onClick: (e: React.MouseEvent) => void }).onClick;
      const stopped: string[] = [];
      onClick({ stopPropagation: () => stopped.push('s'), shiftKey: false } as unknown as React.MouseEvent);
      expect(stopped).toEqual(['s']);
      expect(opened.length).toBe(1);
      expect(opened[0][0]).toBe('https://run.app/svc');
      expect(opened[0][1]).toBe('_blank');
    } finally {
      if (originalOpen) {
        Object.defineProperty(globalThis, 'window', { value: { open: originalOpen }, configurable: true, writable: true });
      } else {
        delete (globalThis as Record<string, unknown>).window;
      }
    }
  });

  it('http URL row click with shiftKey copies via navigator.clipboard.writeText', () => {
    const written: string[] = [];
    const originalNavigator = (globalThis as unknown as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: (t: string) => { written.push(t); return Promise.resolve(); } } },
      configurable: true,
      writable: true,
    });
    try {
      const tree = renderLod3({
        folded: false,
        node: makeNode({
          data: { deploy_status: 'active', deploy_outputs: { url: 'https://copy.example' } },
        }),
      });
      const row = findUrlRow(tree, 'https://copy.example');
      expect(row).toBeDefined();
      const onClick = (row!.props as { onClick: (e: React.MouseEvent) => void }).onClick;
      onClick({ stopPropagation: () => {}, shiftKey: true } as unknown as React.MouseEvent);
      expect(written).toEqual(['https://copy.example']);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
    }
  });

  it('non-URL row (gs://) click copies to clipboard regardless of shift key', () => {
    const written: string[] = [];
    const originalNavigator = (globalThis as unknown as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: (t: string) => { written.push(t); return Promise.resolve(); } } },
      configurable: true,
      writable: true,
    });
    try {
      const tree = renderLod3({
        folded: false,
        node: makeNode({
          data: {
            deploy_status: 'active',
            iceType: 'Compute.StaticSite',
            provider_id: 'gs://copy-bucket',
          },
        }),
      });
      const row = findUrlRow(tree, 'gs://copy-bucket');
      expect(row).toBeDefined();
      const onClick = (row!.props as { onClick: (e: React.MouseEvent) => void }).onClick;
      onClick({ stopPropagation: () => {}, shiftKey: false } as unknown as React.MouseEvent);
      expect(written).toEqual(['gs://copy-bucket']);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
    }
  });

  it('clipboard.writeText rejection does not throw out of the click handler', () => {
    const originalNavigator = (globalThis as unknown as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: () => Promise.reject(new Error('denied')) } },
      configurable: true,
      writable: true,
    });
    try {
      const tree = renderLod3({
        folded: false,
        node: makeNode({
          data: { deploy_status: 'active', provider_id: 'plain-id' },
        }),
      });
      const row = findUrlRow(tree, 'plain-id');
      expect(row).toBeDefined();
      const onClick = (row!.props as { onClick: (e: React.MouseEvent) => void }).onClick;
      expect(() =>
        onClick({ stopPropagation: () => {}, shiftKey: false } as unknown as React.MouseEvent),
      ).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
    }
  });

  it('handles missing navigator.clipboard via optional chaining (no throw)', () => {
    const originalNavigator = (globalThis as unknown as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    try {
      const tree = renderLod3({
        folded: false,
        node: makeNode({ data: { deploy_status: 'active', provider_id: 'plain-id' } }),
      });
      const row = findUrlRow(tree, 'plain-id');
      expect(row).toBeDefined();
      const onClick = (row!.props as { onClick: (e: React.MouseEvent) => void }).onClick;
      expect(() =>
        onClick({ stopPropagation: () => {}, shiftKey: false } as unknown as React.MouseEvent),
      ).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Error overlay
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — error overlay', () => {
  it('renders the error message + ✗ glyph when isError + deploy_error set', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: { deploy_status: 'error', deploy_error: 'Permission denied' },
      }),
    });
    const text = collectText(tree);
    expect(text).toContain('✗ Permission denied');
  });

  it('omits the error overlay when isError but deploy_error is empty', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({ data: { deploy_status: 'error', deploy_error: '' } }),
    });
    const text = collectText(tree);
    expect(text).not.toContain('✗');
  });

  it('omits the error overlay when status is not "error"', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({ data: { deploy_status: 'deploying', deploy_error: 'noise' } }),
    });
    const text = collectText(tree);
    expect(text).not.toContain('✗');
  });

  it('error overlay div carries title=deploy_error (tooltip)', () => {
    const tree = renderLod3({
      folded: false,
      node: makeNode({
        data: { deploy_status: 'error', deploy_error: 'Quota exceeded for foo bar' },
      }),
    });
    // The error overlay div is unique: position='absolute' AND title set.
    const div = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const props = el.props as { style?: { position?: string }; title?: string };
      return props.style?.position === 'absolute' && typeof props.title === 'string';
    })[0];
    expect(div).toBeDefined();
    expect((div.props as { title: string }).title).toBe('Quota exceeded for foo bar');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Validation badge
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — validation badge', () => {
  it('renders a ValidationBadge when severity is "error" with the count', () => {
    const tree = renderLod3({ validationSeverity: 'error', validationCount: 3 });
    const badges = findByType(tree, MockValidationBadge);
    expect(badges).toHaveLength(1);
    const props = badges[0].props as { severity: string; count: number };
    expect(props.severity).toBe('error');
    expect(props.count).toBe(3);
  });

  it('renders a ValidationBadge when severity is "warning"', () => {
    const tree = renderLod3({ validationSeverity: 'warning', validationCount: 1 });
    expect(findByType(tree, MockValidationBadge)).toHaveLength(1);
  });

  it('does NOT render a ValidationBadge when severity is "info"', () => {
    const tree = renderLod3({ validationSeverity: 'info', validationCount: 1 });
    expect(findByType(tree, MockValidationBadge)).toHaveLength(0);
  });

  it('does NOT render a ValidationBadge when severity is null', () => {
    const tree = renderLod3({ validationSeverity: null, validationCount: 0 });
    expect(findByType(tree, MockValidationBadge)).toHaveLength(0);
  });

  it('forwards small={folded} to ValidationBadge', () => {
    const folded = renderLod3({ validationSeverity: 'error', validationCount: 1, folded: true });
    const unfolded = renderLod3({ validationSeverity: 'error', validationCount: 1, folded: false });
    expect((findByType(folded, MockValidationBadge)[0].props as { small: boolean }).small).toBe(true);
    expect((findByType(unfolded, MockValidationBadge)[0].props as { small: boolean }).small).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. ConceptInfoTrigger (header trailing) opacity gates on isHovered
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — ConceptInfoTrigger', () => {
  it('renders ConceptInfoTrigger inside the trailing block', () => {
    const tree = renderLod3();
    const header = findByType(tree, MockNodeHeader)[0];
    const trailing = (header.props as { trailing: React.ReactNode }).trailing;
    expect(findByType(trailing, MockConceptInfoTrigger)).toHaveLength(1);
  });

  it('passes opacity 0.85 when hovered, 0.45 otherwise', () => {
    const hov = renderLod3({ isHovered: true });
    const idle = renderLod3({ isHovered: false });
    const hovTrigger = findByType((findByType(hov, MockNodeHeader)[0].props as { trailing: React.ReactNode }).trailing, MockConceptInfoTrigger)[0];
    const idleTrigger = findByType((findByType(idle, MockNodeHeader)[0].props as { trailing: React.ReactNode }).trailing, MockConceptInfoTrigger)[0];
    expect((hovTrigger.props as { opacity: number }).opacity).toBe(0.85);
    expect((idleTrigger.props as { opacity: number }).opacity).toBe(0.45);
  });

  it('passes node.data.iceType + label to ConceptInfoTrigger', () => {
    const tree = renderLod3({
      label: 'My API',
      node: makeNode({ data: { iceType: 'Compute.BackendAPI' } }),
    });
    const trigger = findByType((findByType(tree, MockNodeHeader)[0].props as { trailing: React.ReactNode }).trailing, MockConceptInfoTrigger)[0];
    const props = trigger.props as { iceType: string; displayName: string };
    expect(props.iceType).toBe('Compute.BackendAPI');
    expect(props.displayName).toBe('My API');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. Mouse handlers
// ═══════════════════════════════════════════════════════════════════════════

describe('CompactLod3 — mouse handlers', () => {
  it('outer <g> onMouseEnter/onMouseLeave are forwarded directly', () => {
    const enters: string[] = [];
    const leaves: string[] = [];
    const tree = renderLod3({
      onMouseEnter: () => enters.push('e'),
      onMouseLeave: () => leaves.push('l'),
    });
    const g = tree as React.ReactElement;
    const props = g.props as {
      onMouseEnter: () => void;
      onMouseLeave: () => void;
    };
    props.onMouseEnter();
    props.onMouseLeave();
    expect(enters).toEqual(['e']);
    expect(leaves).toEqual(['l']);
  });

  it('top-right FoldButton onClick is the onToggleFold prop (passes through)', () => {
    const calls: string[] = [];
    const tree = renderLod3({ folded: false, onToggleFold: () => calls.push('toggle') });
    const allFold = findByType(tree, MockFoldButton);
    // The body fold button — folded=false.
    const bodyFold = allFold.find((b) => (b.props as { folded: boolean }).folded === false)!;
    (bodyFold.props as { onClick: () => void }).onClick();
    expect(calls).toEqual(['toggle']);
  });

  it('top-right FoldButton uses opacity 0.7 when hovered, 0 otherwise', () => {
    const hov = renderLod3({ folded: false, isHovered: true });
    const idle = renderLod3({ folded: false, isHovered: false });
    const hovBtn = findByType(hov, MockFoldButton).find((b) => (b.props as { folded: boolean }).folded === false)!;
    const idleBtn = findByType(idle, MockFoldButton).find((b) => (b.props as { folded: boolean }).folded === false)!;
    expect((hovBtn.props as { opacity: number }).opacity).toBe(0.7);
    expect((idleBtn.props as { opacity: number }).opacity).toBe(0);
  });

  it('header trailing FoldButton (folded mode) uses opacity 0.8 when hovered, 0.4 otherwise', () => {
    const hov = renderLod3({ folded: true, isHovered: true });
    const idle = renderLod3({ folded: true, isHovered: false });
    const hovBtn = findByType(
      (findByType(hov, MockNodeHeader)[0].props as { trailing: React.ReactNode }).trailing,
      MockFoldButton,
    )[0];
    const idleBtn = findByType(
      (findByType(idle, MockNodeHeader)[0].props as { trailing: React.ReactNode }).trailing,
      MockFoldButton,
    )[0];
    expect((hovBtn.props as { opacity: number }).opacity).toBe(0.8);
    expect((idleBtn.props as { opacity: number }).opacity).toBe(0.4);
  });

  it('NodeHeader onDoubleClickLabel forwards through directly', () => {
    const dbl = vi.fn();
    const tree = renderLod3({ onDoubleClickLabel: dbl });
    const hdr = findByType(tree, MockNodeHeader)[0];
    expect((hdr.props as { onDoubleClickLabel: () => void }).onDoubleClickLabel).toBe(dbl);
  });

  it('NodeHeader gets category, categoryColor, label, hideIcon=false, iconSize=16', () => {
    const tree = renderLod3({ category: 'Database', categoryGlow: '#8b5cf6', label: 'pg-1' });
    const hdr = findByType(tree, MockNodeHeader)[0];
    const props = hdr.props as {
      category: string;
      categoryColor: string;
      label: string;
      hideIcon: boolean;
      iconSize: number;
    };
    expect(props.category).toBe('Database');
    expect(props.categoryColor).toBe('#8b5cf6');
    expect(props.label).toBe('pg-1');
    expect(props.hideIcon).toBe(false);
    expect(props.iconSize).toBe(16);
  });
});
