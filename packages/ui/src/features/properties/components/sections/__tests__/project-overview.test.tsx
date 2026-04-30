/**
 * rf-props-23 — project-overview subcomponent.
 *
 * `ProjectOverview` is the right-sidebar panel rendered when no node and
 * no edge is selected. It uses `useDispatch` plus `useMemo` (the totalCost
 * derivation) — no `useState`/`useEffect`. We use the direct-FC tree-walker
 * pattern (cite `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the FC as a function with React's `useMemo` mocked to passthrough
 * so the body returns a synchronous tree, then walk it.
 *
 * `useMemo` MUST be mocked when invoking the FC outside a renderer context
 * (cite `use-memo-must-be-mocked-too-when-the-extracted-component-uses-it`):
 * the real React.useMemo reads `null.useMemo` from the dispatcher and throws
 * `Cannot read properties of null (reading 'useMemo')`. Eager-passthrough
 * mock is sufficient — the tests don't need memoization, they need the
 * factory's return value.
 *
 * Mocks:
 *  - `react.useMemo` → eager-factory `(factory, _deps) => factory()`.
 *  - `react-redux.useDispatch` → returns `mocks.dispatchSpy`.
 *  - `'../../fields'` → `Section` is a vi.fn stub the walker matches by
 *    reference (cite `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`).
 *  - `'../../../../shared/components/ui/panel-header'` → `PanelHeader` is
 *    a vi.fn the walker matches by reference; we assert
 *    `onClose`/`closeLabel`/`title` props.
 *  - `'../../../canvas/utils/connection-rules'` → `analyzeCanvasPatterns`
 *    is a vi.fn so we control the returned hint list deterministically
 *    (cite `render-helper-must-not-call-mockreturnvalue-after-test-overrides`:
 *    we set the default in beforeEach, never inside renderSection).
 *  - `'../../../../store/slices/ui-slice'` → `toggleProperties` returns
 *    a tagged action.
 *  - `'../../../../i18n'.t` → echoes `t:<key>` for stable text assertions.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted stubs — vi.mock factories run before module-level statements,
// so shared identities have to live in vi.hoisted (cite
// `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`).
const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
  MockPanelHeader: vi.fn(),
  // Dispatch spy — the only Redux interaction is dispatch(toggleProperties()).
  dispatchSpy: vi.fn(),
  // Slice action spy — return tagged objects so dispatch arg is verifiable.
  toggleProperties: vi.fn(() => ({ type: 'ui/toggleProperties' })),
  // Canvas pattern analyzer — default empty (overridden per-test).
  analyzeCanvasPatternsSpy: vi.fn(
    (_nodes: unknown, _edges: unknown) =>
      [] as Array<{ nodeId: string; message: string; type: 'hint' | 'warning' }>,
  ),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // Direct-FC invocation has no React dispatcher context. Eager-factory
    // passthrough so the totalCost reduction runs synchronously and the
    // result is observable in the returned tree.
    useMemo: vi.fn(<T,>(factory: () => T, _deps?: unknown[]) => factory()),
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatchSpy,
}));

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
}));

vi.mock('../../../../../shared/components/ui/panel-header', () => ({
  PanelHeader: mocks.MockPanelHeader,
}));

vi.mock('../../../../canvas/utils/connection-rules', () => ({
  analyzeCanvasPatterns: mocks.analyzeCanvasPatternsSpy,
}));

vi.mock('../../../../../store/slices/ui-slice', () => ({
  toggleProperties: mocks.toggleProperties,
}));

vi.mock('../../../../../i18n', () => ({
  t: vi.fn((key: string) => `t:${key}`),
}));

import { ProjectOverview } from '../project-overview';
import type { Card, CardNode, CardEdge } from '../../../../../store/slices/cards-slice';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12/13/14/15/16/17/18/19/20/21/22) ──

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
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

function findByType(
  tree: React.ReactNode,
  type: string | React.ComponentType<unknown> | unknown,
): React.ReactElement[] {
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
  return parts.join(' ');
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const makeNode = (
  id: string,
  data: Record<string, unknown> = {},
  overrides: Partial<CardNode> = {},
): CardNode => ({
  id,
  type: 'block',
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
  data,
  ...overrides,
});

const makeEdge = (overrides: Partial<CardEdge> = {}): CardEdge => ({
  id: 'edge-1',
  source: 'src-1',
  target: 'tgt-1',
  data: {},
  ...overrides,
});

const makeCard = (overrides: Partial<Card> = {}): Card => ({
  id: 'card-1',
  name: 'Card 1',
  nodes: [],
  edges: [],
  viewport: { panX: 0, panY: 0, scale: 1 },
  createdAt: 0,
  ...overrides,
});

const renderSection = (
  props: { activeCard?: Card | null } = {},
): React.ReactElement => {
  // Distinguish "no override" from "explicit null" with hasOwnProperty —
  // see rf-props-21 `nullish-coalesce-default-in-test-helper-silently-clobbers-explicit-null-overrides`.
  const card = Object.prototype.hasOwnProperty.call(props, 'activeCard')
    ? (props.activeCard as Card | null)
    : makeCard();
  return ProjectOverview({ activeCard: card }) as React.ReactElement;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProjectOverview', () => {
  beforeEach(() => {
    // Reset call history without clobbering subsequent mockReturnValue() calls
    // — those are per-test overrides set before the renderSection invocation
    // (cite rf-props-22 `render-helper-must-not-call-mockreturnvalue-after-test-overrides`).
    mocks.dispatchSpy.mockClear();
    mocks.toggleProperties.mockClear();
    mocks.MockSection.mockClear();
    mocks.MockPanelHeader.mockClear();
    mocks.analyzeCanvasPatternsSpy.mockClear();
    // Default behaviors. Per-test overrides via mockReturnValueOnce or
    // mockReturnValue happen AFTER beforeEach but BEFORE renderSection().
    mocks.analyzeCanvasPatternsSpy.mockReturnValue([]);
  });

  // ── Header / dispatch ────────────────────────────────────────────────────

  it('renders PanelHeader with title + closeLabel + onClose dispatching toggleProperties', () => {
    const tree = renderSection();
    const headers = findByType(tree, mocks.MockPanelHeader);
    expect(headers).toHaveLength(1);
    const props = headers[0].props as {
      title: string;
      onClose: () => void;
      closeLabel: string;
    };
    expect(props.title).toBe('t:properties.title');
    expect(props.closeLabel).toBe('t:properties.closeTitle');
    // Calling onClose dispatches toggleProperties.
    props.onClose();
    expect(mocks.toggleProperties).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchSpy).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchSpy).toHaveBeenCalledWith({ type: 'ui/toggleProperties' });
  });

  // ── Node / connection counts ─────────────────────────────────────────────

  it('renders node count and connection count from activeCard.nodes/edges', () => {
    const card = makeCard({
      nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
      edges: [
        makeEdge({ id: 'e-1' }),
        makeEdge({ id: 'e-2' }),
      ],
    });
    const tree = renderSection({ activeCard: card });
    const text = collectText(tree);
    // Three nodes, two connections — the i18n labels and the numbers.
    expect(text).toContain('t:properties.overview.nodes');
    expect(text).toContain('3');
    expect(text).toContain('t:properties.overview.connections');
    expect(text).toContain('2');
  });

  it('renders zeros when activeCard is null (totalNodes/totalEdges fall back to 0)', () => {
    const tree = renderSection({ activeCard: null });
    const text = collectText(tree);
    expect(text).toContain('t:properties.overview.nodes');
    expect(text).toContain('0');
    expect(text).toContain('t:properties.overview.connections');
  });

  // ── Cost estimate ────────────────────────────────────────────────────────

  it('renders cost estimate row when totalCost > 0 (from estimatedCost in node.data)', () => {
    const card = makeCard({
      nodes: [
        makeNode('svc-1', { estimatedCost: '$10-30' }), // → (10+30)/2 = 20
        makeNode('svc-2', { estimatedCost: '$5' }), // → 5
      ],
    });
    const tree = renderSection({ activeCard: card });
    const text = collectText(tree);
    expect(text).toContain('t:properties.overview.estMonthlyCost');
    // 20 + 5 = 25; formatCost(25) → '~$25/mo'
    expect(text).toContain('~$25/mo');
  });

  it('hides cost estimate row when totalCost === 0', () => {
    const card = makeCard({
      // Two nodes, neither has any estimatedCost data → totalCost = 0.
      nodes: [makeNode('a'), makeNode('b')],
    });
    const tree = renderSection({ activeCard: card });
    const text = collectText(tree);
    // The label should NOT appear because the entire row is gated on
    // `totalCost > 0`.
    expect(text).not.toContain('t:properties.overview.estMonthlyCost');
  });

  it('parses cost ranges with em-dash separators', () => {
    const card = makeCard({
      nodes: [makeNode('svc', { estimatedCost: '$60–120' })], // em-dash → (60+120)/2 = 90
    });
    const tree = renderSection({ activeCard: card });
    const text = collectText(tree);
    expect(text).toContain('~$90/mo');
  });

  it('skips nodes with non-matching cost strings (parseCostRange returns 0)', () => {
    const card = makeCard({
      nodes: [
        // rf-props-26: canonical parseCostRange short-circuits 'Free' to 0
        // explicitly (the local copy got the same answer via regex no-match).
        makeNode('svc-1', { estimatedCost: 'Free' }),
        makeNode('svc-2', { estimatedCost: '' }),
        makeNode('svc-3', { estimatedCost: '$40' }), // 40
      ],
    });
    const tree = renderSection({ activeCard: card });
    const text = collectText(tree);
    expect(text).toContain('~$40/mo');
  });

  // ── rf-props-26 behavior-delta lock-in ───────────────────────────────────
  // Before rf-props-26 the section had local-copy `parseCostRange` /
  // `formatCost` whose regex (`\d+`) silently mishandled commas and
  // decimals, and whose `formatCost` returned `''` for zero. The dedup
  // points the section at the canonical home, which:
  //   - parses commas  → `$1,000-2,000` averages to 1500 (was 1.5)
  //   - parses decimals → `$0.50` returns 0.5 (was 0)
  //   - formats < $1   → "~$0.50/mo" (was "~$1/mo" due to Math.round)
  //   - formats ≥ $1k  → "~$1.5k/mo" (was "~$1500/mo")
  //   - formats 0      → "Free" (was ""), but the row's `totalCost > 0`
  //     gate hides this transition from users — verified below.

  it('rf-props-26: parses comma-separated thousands as the average of the two large values (canonical, not local)', () => {
    const card = makeCard({
      nodes: [makeNode('svc', { estimatedCost: '$1,000-2,000' })],
    });
    const tree = renderSection({ activeCard: card });
    const text = collectText(tree);
    // Canonical: (1000 + 2000) / 2 = 1500 → formatCost(1500) === '~$1.5k/mo'.
    // Local copy would have produced (1 + 2) / 2 = 1.5 → '~$2/mo' after Math.round.
    expect(text).toContain('~$1.5k/mo');
    expect(text).not.toContain('~$2/mo');
  });

  it('rf-props-26: parses a single sub-dollar decimal (was 0 with local copy → row was hidden)', () => {
    const card = makeCard({
      // With the local copy this combined to 0 (`$0.50` regex no-match → 0,
      // `$5` → 5). Canonical sums 0.5 + 5 = 5.5 → '~$6/mo' (rounded).
      nodes: [
        makeNode('svc-1', { estimatedCost: '$0.50' }),
        makeNode('svc-2', { estimatedCost: '$5' }),
      ],
    });
    const tree = renderSection({ activeCard: card });
    const text = collectText(tree);
    expect(text).toContain('t:properties.overview.estMonthlyCost');
    // 5.5 → Math.round → 6 → '~$6/mo' (canonical regular-range branch).
    expect(text).toContain('~$6/mo');
  });

  it('rf-props-26: a totalCost of 0 still hides the cost row (the formatCost(0) → "Free" delta is gated)', () => {
    // 'Free' → 0; '' → 0; total = 0. The `totalCost > 0` gate at the
    // callsite means `formatCost(0)` is never invoked, so the canonical
    // `'Free'` return value is not observable in the rendered output.
    const card = makeCard({
      nodes: [
        makeNode('svc-1', { estimatedCost: 'Free' }),
        makeNode('svc-2', { estimatedCost: '' }),
      ],
    });
    const tree = renderSection({ activeCard: card });
    const text = collectText(tree);
    expect(text).not.toContain('t:properties.overview.estMonthlyCost');
    expect(text).not.toContain('Free');
  });

  // ── Empty-state hint ─────────────────────────────────────────────────────

  it('renders the empty-state hint when activeCard.nodes.length === 0', () => {
    const card = makeCard({ nodes: [], edges: [] });
    const tree = renderSection({ activeCard: card });
    const text = collectText(tree);
    expect(text).toContain('t:properties.overview.emptyHint');
    expect(text).not.toContain('t:properties.overview.selectHint');
  });

  it('does NOT render either hint when activeCard is null', () => {
    // Both hints are gated on `activeCard && ...`, so a null card hides
    // both branches — the panel still renders header + overview Section.
    const tree = renderSection({ activeCard: null });
    const text = collectText(tree);
    expect(text).not.toContain('t:properties.overview.emptyHint');
    expect(text).not.toContain('t:properties.overview.selectHint');
    // But the header + overview totals are still there. Section/PanelHeader
    // mocks don't render their `title` prop into `children`, so we assert
    // those via prop inspection instead of collectText.
    const headers = findByType(tree, mocks.MockPanelHeader);
    expect((headers[0].props as { title: string }).title).toBe('t:properties.title');
    const sections = findByType(tree, mocks.MockSection);
    expect((sections[0].props as { title: string }).title).toBe(
      't:properties.overview.title',
    );
  });

  // ── Select-hint ──────────────────────────────────────────────────────────

  it('renders the select-hint when activeCard has nodes', () => {
    const card = makeCard({ nodes: [makeNode('a')] });
    const tree = renderSection({ activeCard: card });
    const text = collectText(tree);
    expect(text).toContain('t:properties.overview.selectHint');
    expect(text).not.toContain('t:properties.overview.emptyHint');
  });

  // ── Canvas pattern hints ─────────────────────────────────────────────────

  it('renders the suggestions section when analyzeCanvasPatterns returns entries', () => {
    mocks.analyzeCanvasPatternsSpy.mockReturnValue([
      { nodeId: 'a', message: 'connect a database to b', type: 'hint' },
      { nodeId: 'c', message: 'add a load balancer in front of c', type: 'hint' },
    ]);
    const card = makeCard({ nodes: [makeNode('a')] });
    const tree = renderSection({ activeCard: card });
    // The Section title is a prop (not children), so look it up on the
    // mock element directly. The hint *messages* are rendered as children.
    const sections = findByType(tree, mocks.MockSection);
    const titles = sections.map((s) => (s.props as { title: string }).title);
    expect(titles).toContain('t:properties.overview.suggestions');
    const text = collectText(tree);
    expect(text).toContain('connect a database to b');
    expect(text).toContain('add a load balancer in front of c');
    // Confirm the analyzer was called with the expected shape.
    expect(mocks.analyzeCanvasPatternsSpy).toHaveBeenCalledTimes(1);
    const [nodesArg, edgesArg] = mocks.analyzeCanvasPatternsSpy.mock.calls[0];
    expect(Array.isArray(nodesArg)).toBe(true);
    expect(Array.isArray(edgesArg)).toBe(true);
  });

  it('renders NO suggestions section when analyzeCanvasPatterns returns []', () => {
    mocks.analyzeCanvasPatternsSpy.mockReturnValue([]);
    const card = makeCard({ nodes: [makeNode('a')] });
    const tree = renderSection({ activeCard: card });
    // Only the overview Section, no suggestions Section. Section title is
    // a prop, not children, so assert via prop inspection.
    const sections = findByType(tree, mocks.MockSection);
    expect(sections).toHaveLength(1);
    const titles = sections.map((s) => (s.props as { title: string }).title);
    expect(titles).not.toContain('t:properties.overview.suggestions');
    // The analyzer is still called once for the gate.
    expect(mocks.analyzeCanvasPatternsSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT call analyzeCanvasPatterns when activeCard.nodes is empty', () => {
    // The gate is `activeCard && activeCard.nodes.length > 0 && (() => ...)`,
    // so an empty-nodes card short-circuits before invoking the IIFE.
    const card = makeCard({ nodes: [] });
    renderSection({ activeCard: card });
    expect(mocks.analyzeCanvasPatternsSpy).not.toHaveBeenCalled();
  });

  it('does NOT call analyzeCanvasPatterns when activeCard is null', () => {
    renderSection({ activeCard: null });
    expect(mocks.analyzeCanvasPatternsSpy).not.toHaveBeenCalled();
  });

  it('passes node id+data and edge source+target shape to analyzeCanvasPatterns', () => {
    mocks.analyzeCanvasPatternsSpy.mockReturnValue([]);
    const card = makeCard({
      nodes: [
        makeNode('n-1', { iceType: 'Compute.Service' }),
        makeNode('n-2', { iceType: 'Database.PostgreSQL' }),
      ],
      edges: [
        makeEdge({ id: 'e-1', source: 'n-1', target: 'n-2' }),
      ],
    });
    renderSection({ activeCard: card });
    const [nodesArg, edgesArg] = mocks.analyzeCanvasPatternsSpy.mock.calls[0] as [
      Array<{ id: string; data?: Record<string, unknown> }>,
      Array<{ source: string; target: string }>,
    ];
    expect(nodesArg).toHaveLength(2);
    expect(nodesArg[0].id).toBe('n-1');
    expect(nodesArg[0].data?.iceType).toBe('Compute.Service');
    expect(edgesArg).toHaveLength(1);
    expect(edgesArg[0]).toEqual({ source: 'n-1', target: 'n-2' });
  });

  // ── Overview Section wrapper ─────────────────────────────────────────────

  it('renders a Section with the overview title (even when activeCard is null)', () => {
    const tree = renderSection({ activeCard: null });
    const sections = findByType(tree, mocks.MockSection);
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect((sections[0].props as { title: string }).title).toBe(
      't:properties.overview.title',
    );
  });

  it('renders a SECOND Section for suggestions when analyzeCanvasPatterns returns entries', () => {
    mocks.analyzeCanvasPatternsSpy.mockReturnValue([
      { nodeId: 'a', message: 'm', type: 'hint' },
    ]);
    const card = makeCard({ nodes: [makeNode('a')] });
    const tree = renderSection({ activeCard: card });
    const sections = findByType(tree, mocks.MockSection);
    expect(sections).toHaveLength(2);
    const titles = sections.map((s) => (s.props as { title: string }).title);
    expect(titles).toEqual([
      't:properties.overview.title',
      't:properties.overview.suggestions',
    ]);
  });

  // ── Root container shape ─────────────────────────────────────────────────

  it('renders the root div with id="ice-properties-panel"', () => {
    const tree = renderSection();
    // Top-level element is the wrapping div (the FC returns a single root).
    const root = tree as React.ReactElement;
    expect(root.type).toBe('div');
    expect((root.props as { id?: string }).id).toBe('ice-properties-panel');
  });

  // ── No-crash render with null activeCard ──────────────────────────────────

  it('renders header + overview Section without crashing when activeCard is null', () => {
    expect(() => renderSection({ activeCard: null })).not.toThrow();
    const tree = renderSection({ activeCard: null });
    expect(findByType(tree, mocks.MockPanelHeader)).toHaveLength(1);
    expect(findByType(tree, mocks.MockSection)).toHaveLength(1);
  });
});
