/**
 * Tests for `CardShell` — the SVG+foreignObject card wrapper that bespoke
 * canvas nodes drop content into.
 *
 * Branches under test:
 *   - title fallback chain (title → label → '').
 *   - meta line auto-compute from getServiceName(iceType, provider) + region.
 *   - metaOverride bypasses auto-compute.
 *   - liveConfig renders in the status footer.
 *   - footer hides when no liveConfig and no deploy_status.
 *   - provider stamp always renders (AUTO label fallback when empty).
 *   - StatusDot renders when deploy_status is set.
 *   - accent override vs derived from CATEGORY_STYLE[category] (with fallback default).
 *   - border / boxShadow drift across (isSelected, isHovered, isSource).
 *   - hover state via mocked useState (controllable).
 *   - onEnter/onLeave fire onNodeHover with id / null.
 *   - headerHeight default 48 / custom.
 *   - headerTrailing rendered before the ConceptInfoTrigger.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ConceptInfoTrigger: vi.fn(() => null),
  hoverValue: false as boolean,
  setHoverSpy: vi.fn(),
  getServiceName: vi.fn((_iceType: string, _provider: string) => null as string | null),
  // Value returned by the mocked `useContext` (shared by useIsNodeOrphan +
  // useNodeValidation). A Set keeps orphan inert; tests can swap in a Map to
  // exercise the validation badge (Map has both `.has` and `.get`).
  ctxValue: new Set<string>() as Set<string> | Map<string, unknown>,
}));

vi.mock('../../../../../concept-info', () => ({
  ConceptInfoTrigger: mocks.ConceptInfoTrigger,
}));

vi.mock('../../../../../../assets/icons/service-names', () => ({
  getServiceName: mocks.getServiceName,
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
    // `CardShell` reads the orphan + validation contexts via useContext.
    // Because the test invokes the component as a plain function (not through a
    // React renderer), the real `useContext` blows up — return a controllable
    // value (Set by default) so both branches are inert unless a test opts in.
    useContext: vi.fn(() => mocks.ctxValue),
  };
});

import { CardShell } from '../card-shell';
import { NodeDeployOverlay } from '../node-deploy-overlay';
import { StatusDot } from '../status-dot';
import { ValidationBadge } from '../validation-badge';
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

const findByType = (tree: React.ReactNode, type: unknown) => [...walk(tree)].filter((el) => el.type === type);

const findByPredicate = (tree: React.ReactNode, p: (el: React.ReactElement) => boolean) => [...walk(tree)].filter(p);

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
  mocks.getServiceName.mockReset();
  mocks.getServiceName.mockReturnValue(null);
  mocks.ctxValue = new Set<string>();
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

  it('auto-computes the meta line as `{serviceName} · {region}` when service resolves', () => {
    mocks.getServiceName.mockReturnValue('Amazon RDS');
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', provider: 'aws', region: 'us-east-1' } }),
    });
    const meta = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'Amazon RDS · us-east-1',
    );
    expect(meta).toHaveLength(1);
  });

  it('uses "auto" for region when not set on the node', () => {
    mocks.getServiceName.mockReturnValue('Amazon RDS');
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', provider: 'aws' } }),
    });
    const meta = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'Amazon RDS · auto',
    );
    expect(meta).toHaveLength(1);
  });

  it('skips the meta line when neither service nor region are known', () => {
    mocks.getServiceName.mockReturnValue(null);
    const tree = renderInner({ node: makeNode({ data: {} }) });
    const possibleMeta = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { children?: unknown }).children === 'string' &&
        (el.props as { style?: Record<string, string | number> }).style?.fontSize === 11,
    );
    expect(possibleMeta).toHaveLength(0);
  });

  it('metaOverride bypasses auto-compute', () => {
    mocks.getServiceName.mockReturnValue('Amazon RDS');
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', provider: 'aws', region: 'us-east-1' } }),
      metaOverride: 'forced subtitle',
    });
    const meta = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { children?: unknown }).children === 'forced subtitle',
    );
    expect(meta).toHaveLength(1);
  });

  it('renders liveConfig in the status footer', () => {
    const tree = renderInner({ liveConfig: '3 queues · 30s visibility' });
    const text = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === '3 queues · 30s visibility',
    );
    expect(text).toHaveLength(1);
  });

  it('omits the status footer when neither liveConfig nor deploy_status is set', () => {
    const tree = renderInner();
    // Footer is a div with borderTop containing a span; no liveConfig & no
    // deploy_status → showFooter is false.
    const footerSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { style?: Record<string, string | number> }).style?.fontSize === 'number' &&
        (el.props as { style: { fontSize: number } }).style.fontSize === 10,
    );
    expect(footerSpans).toHaveLength(0);
  });

  it('renders the status footer when deploy_status is set even without liveConfig', () => {
    const tree = renderInner({ node: makeNode({ data: { deploy_status: 'active' } }) });
    const footerSpans = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { style?: Record<string, string | number> }).style?.fontSize === 10,
    );
    expect(footerSpans.length).toBeGreaterThan(0);
  });

  // CNV1 — the in-flight step + failure reason now surface on the node itself.
  it('threads deploy_progress to NodeDeployOverlay when deploying', () => {
    const progress = { step_label: 'Creating bucket', step_index: 3, step_total: 6 };
    const tree = renderInner({ node: makeNode({ data: { deploy_status: 'deploying', deploy_progress: progress } }) });
    const overlay = findByPredicate(tree, (el) => el.type === NodeDeployOverlay)[0];
    expect(overlay).toBeDefined();
    expect((overlay.props as { deployStatus: string }).deployStatus).toBe('deploying');
    expect((overlay.props as { deployProgress: unknown }).deployProgress).toEqual(progress);
  });

  it('threads deploy_error to NodeDeployOverlay on failure', () => {
    const tree = renderInner({ node: makeNode({ data: { deploy_status: 'error', deploy_error: 'quota exceeded' } }) });
    const overlay = findByPredicate(tree, (el) => el.type === NodeDeployOverlay)[0];
    expect((overlay.props as { deployError: string }).deployError).toBe('quota exceeded');
  });

  // CNV2 — validation issues surface as a corner badge, read via context.
  it('renders a ValidationBadge when the node has an error from the validation context', () => {
    mocks.ctxValue = new Map<string, unknown>([['n1', { severity: 'error', count: 3 }]]);
    const tree = renderInner({ node: makeNode({ id: 'n1' }) });
    const badge = findByPredicate(tree, (el) => el.type === ValidationBadge)[0];
    expect(badge).toBeDefined();
    expect((badge.props as { severity: string; count: number }).severity).toBe('error');
    expect((badge.props as { count: number }).count).toBe(3);
  });

  it('does NOT render a ValidationBadge for an info-only issue', () => {
    mocks.ctxValue = new Map<string, unknown>([['n1', { severity: 'info', count: 1 }]]);
    const tree = renderInner({ node: makeNode({ id: 'n1' }) });
    expect(findByPredicate(tree, (el) => el.type === ValidationBadge)).toHaveLength(0);
  });

  it('renders no ValidationBadge when the node has no validation entry', () => {
    const tree = renderInner({ node: makeNode({ id: 'n1' }) });
    expect(findByPredicate(tree, (el) => el.type === ValidationBadge)).toHaveLength(0);
  });

  // CNV3 — the footer status dot pulses while a deploy is in flight.
  it('pulses the footer StatusDot while deploying, but not when active', () => {
    const deployingTree = renderInner({ node: makeNode({ data: { deploy_status: 'deploying' } }) });
    const deployingDot = findByPredicate(deployingTree, (el) => el.type === StatusDot)[0];
    expect((deployingDot.props as { pulse: boolean }).pulse).toBe(true);

    const activeTree = renderInner({ node: makeNode({ data: { deploy_status: 'active' } }) });
    const activeDot = findByPredicate(activeTree, (el) => el.type === StatusDot)[0];
    expect((activeDot.props as { pulse: boolean }).pulse).toBe(false);
  });

  // CNV7/AX5 — the zoomed-out poster status indicator is no longer a colour-only,
  // mouse-`title`-only dot: it carries a shape glyph + an AT-reachable aria-label.
  describe('poster-view status indicator (lod < 3)', () => {
    const findPosterStatus = (tree: React.ReactNode) =>
      findByPredicate(tree, (el) => el.type === 'span' && (el.props as { role?: string }).role === 'img')[0];

    it('renders a labelled glyph (not a bare dot) for a deployed node', () => {
      const tree = renderInner({ lod: 1, node: makeNode({ data: { deploy_status: 'deployed' } }) });
      const el = findPosterStatus(tree);
      expect(el).toBeDefined();
      const props = el.props as { 'aria-label': string; children: string; title: string };
      expect(props['aria-label']).toBe('Deployed');
      expect(props.title).toBe('Deployed');
      expect(props.children).toBe('✓');
    });

    it('uses distinct glyphs for in-flight vs failed so they differ without colour', () => {
      const deploying = findPosterStatus(
        renderInner({ lod: 1, node: makeNode({ data: { deploy_status: 'deploying' } }) }),
      );
      const failed = findPosterStatus(renderInner({ lod: 1, node: makeNode({ data: { deploy_status: 'error' } }) }));
      expect((deploying.props as { children: string }).children).toBe('…');
      expect((failed.props as { children: string }).children).toBe('✕');
      expect((deploying.props as { children: string }).children).not.toBe(
        (failed.props as { children: string }).children,
      );
    });

    it('pulses the glyph while work is in flight, but not when terminal', () => {
      const deploying = findPosterStatus(
        renderInner({ lod: 1, node: makeNode({ data: { deploy_status: 'deploying' } }) }),
      );
      const deployed = findPosterStatus(
        renderInner({ lod: 1, node: makeNode({ data: { deploy_status: 'deployed' } }) }),
      );
      expect((deploying.props as { className?: string }).className).toContain('animate-pulse');
      expect((deployed.props as { className?: string }).className ?? '').not.toContain('animate-pulse');
    });

    it('renders no status indicator when the node has no deploy_status', () => {
      const tree = renderInner({ lod: 1, node: makeNode({ data: {} }) });
      expect(findPosterStatus(tree)).toBeUndefined();
    });
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
      (el) => el.type === 'div' && typeof (el.props as { onMouseEnter?: unknown }).onMouseEnter === 'function',
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
      (el) => el.type === 'div' && typeof (el.props as { onMouseLeave?: unknown }).onMouseLeave === 'function',
    )[0];
    (inner.props as { onMouseLeave: () => void }).onMouseLeave();
    expect(mocks.setHoverSpy).toHaveBeenCalledWith(false);
    expect(onNodeHover).toHaveBeenCalledWith(null);
  });

  it('onEnter / onLeave do not throw when onNodeHover is omitted', () => {
    const tree = renderInner();
    const inner = findByPredicate(
      tree,
      (el) => el.type === 'div' && typeof (el.props as { onMouseEnter?: unknown }).onMouseEnter === 'function',
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

  it('renders the headerTrailing slot in the header', () => {
    const trailing = React.createElement('span', { 'data-stub': 'trailing' });
    const tree = renderInner({ headerTrailing: trailing });
    const hits = findByPredicate(tree, (el) => (el.props as { 'data-stub'?: string })['data-stub'] === 'trailing');
    expect(hits).toHaveLength(1);
  });

  it('renders the body children inside the body slot', () => {
    const tree = renderInner({ children: React.createElement('p', { 'data-stub': 'body-p' }) });
    const hits = findByPredicate(tree, (el) => (el.props as { 'data-stub'?: string })['data-stub'] === 'body-p');
    expect(hits).toHaveLength(1);
  });

  it('honors a custom headerHeight (minHeight)', () => {
    const tree = renderInner({ headerHeight: 60 });
    const header = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { style?: Record<string, string | number> }).style?.minHeight === 60,
    );
    expect(header.length).toBeGreaterThan(0);
  });

  it('defaults headerHeight to 48 (minHeight)', () => {
    const tree = renderInner();
    const header = findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { style?: Record<string, string | number> }).style?.minHeight === 48,
    );
    expect(header.length).toBeGreaterThan(0);
  });

  it('exposes a stable displayName', () => {
    expect(CardShell.displayName).toBe('CardShell');
  });
});
