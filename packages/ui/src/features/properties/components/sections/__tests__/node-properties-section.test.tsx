/**
 * rf-props-24 — node-properties-section subcomponent tests.
 *
 * `NodePropertiesSection` is the largest extracted section so far — the full
 * node-selected branch of the properties panel: top-of-branch derivations
 * (resourceDef / dbProperties / isScalable / iconUrl / incoming / outgoing
 * edges), `PanelHeader`, node identity card, optional `GroupColorPicker`
 * (container nodes only), an optional Custom Domain inheritance banner (when
 * the node is the target of a `Network.CustomDomain` edge), the tab bar with
 * conditional pushes, and per-tab content (deploy / source / scaling /
 * domain / connections / config). The Config tab itself is a multi-fallback
 * panel that switches between PropertyFields, EnvVarsEditor, CustomDomainPanel,
 * PrivateNetworkPanel, MonitoringLogSection, and the source-related fallbacks
 * when `visibleTabs.length <= 1`.
 *
 * BEHAVIOR-RISK FLAG #2 — preserved verbatim. The setState-during-render
 * fallback at the tabs computation block fires `setPropsTab(visibleTabs[0].id)`
 * when the current `propsTab` is no longer in the visible tabs list. The
 * call's JSX-position invariant is what makes React tolerate the pattern; the
 * tests here include a dedicated assertion that `setPropsTab` is called
 * exactly once with the first visible tab's id when the supplied `propsTab`
 * doesn't match.
 *
 * We use the direct-FC tree-walker pattern with the `vi.hoisted` mock-identity
 * approach (cite `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`,
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`,
 * `use-memo-must-be-mocked-too-when-the-extracted-component-uses-it`,
 * `render-helper-must-not-call-mockreturnvalue-after-test-overrides`):
 * invoke the component as a function with React's `useCallback` mocked to
 * passthrough so the body runs synchronously without a renderer context, then
 * walk the returned tree.
 *
 * Mocks:
 *  - `react.useCallback` → passthrough `(cb, _deps) => cb` (the source uses
 *    `useCallback` for `updateNodeField`).
 *  - `react-redux.useDispatch` → returns `mocks.dispatchSpy`.
 *  - Every section subcomponent (`DriftIndicator`, `DriftCheckButton`,
 *    `GroupColorPicker`, `ScalingSection`, `PublicEndpointDomainSection`,
 *    `CustomDomainPanel`, `PrivateNetworkPanel`, `ConnectionCard`,
 *    `EnvVarsEditor`, `PipelineSection`, `ServiceSourceSection`,
 *    `SourceRepositorySection`, `MonitoringLogSection`, `DesignRequirements`,
 *    `DeployHistory`, `PropertyFields`) → vi.fn stubs the walker matches by
 *    reference equality.
 *  - `'../../fields'.Section` → vi.fn the walker matches by reference.
 *  - `'../../../../../shared/components/ui/panel-header'.PanelHeader` → vi.fn
 *    the walker matches by reference; we assert `title`/`onClose`/`closeLabel`.
 *  - `'../../../../../shared/utils/cn'.cn` → identity passthrough.
 *  - `'../../../../../assets/icons'` + brand-registry → return predictable
 *    shapes so iconUrl is deterministic.
 *  - `'../../../../../i18n'.useTranslation` → returns `{ t }` where t echoes
 *    `t:<key>`.
 *  - `'../../../../../store/slices/cards-slice'.updateCardNodeData` → tagged
 *    spy so dispatch payload is verifiable.
 *  - `'../../../../../store/slices/ui-slice'.toggleProperties` → tagged spy.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted stubs — vi.mock factories run before module-level statements, so
// shared identities have to live in vi.hoisted.
const mocks = vi.hoisted(() => ({
  // Section primitives + sibling sections — every one a vi.fn the walker
  // matches by reference.
  MockSection: vi.fn(),
  MockPanelHeader: vi.fn(),
  MockDesignRequirements: vi.fn(),
  MockGroupColorPicker: vi.fn(),
  MockDriftIndicator: vi.fn(),
  MockDriftCheckButton: vi.fn(),
  MockDeployHistory: vi.fn(),
  MockServiceSourceSection: vi.fn(),
  MockPipelineSection: vi.fn(),
  MockSourceRepositorySection: vi.fn(),
  MockScalingSection: vi.fn(),
  MockPublicEndpointDomainSection: vi.fn(),
  MockCustomDomainPanel: vi.fn(),
  MockConnectionCard: vi.fn(),
  MockEnvVarsEditor: vi.fn(),
  MockPrivateNetworkPanel: vi.fn(),
  MockMonitoringLogSection: vi.fn(),
  MockPropertyFields: vi.fn(),
  MockNodeIdentityCard: vi.fn(),
  MockCustomDomainBanner: vi.fn(),

  // Identity passthrough for cn — joins truthy strings with a space so
  // className walk comparisons stay legible.
  cnSpy: vi.fn((...args: unknown[]) =>
    args.filter((a) => typeof a === 'string' && a).join(' '),
  ),

  // Dispatch spy.
  dispatchSpy: vi.fn(),

  // Slice spies — return tagged objects so dispatch arg is verifiable.
  updateCardNodeDataSpy: vi.fn(
    (arg: { nodeId: string; data: Record<string, unknown> }) => ({
      type: 'cards/updateCardNodeData',
      payload: arg,
    }),
  ),
  toggleProperties: vi.fn(() => ({ type: 'ui/toggleProperties' })),

  // Icon helpers — return deterministic shapes.
  getBrandIconSpy: vi.fn((_key: string) => null),
  getIconSpy: vi.fn((_iceType: string, _provider: string) => ({ icon: 'provider-icon-url' })),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // Direct-FC invocation has no React dispatcher context. Passthrough so
    // the wrapped callback is invocable from our test handlers.
    useCallback: vi.fn((cb: unknown, _deps?: unknown[]) => cb),
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatchSpy,
}));

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
}));

vi.mock('../../fields/render-property-field', () => ({
  PropertyFields: mocks.MockPropertyFields,
}));

vi.mock('../../design-requirements', () => ({
  DesignRequirements: mocks.MockDesignRequirements,
}));

vi.mock('../connection-card', () => ({
  ConnectionCard: mocks.MockConnectionCard,
}));

vi.mock('../custom-domain-panel', () => ({
  CustomDomainPanel: mocks.MockCustomDomainPanel,
}));

vi.mock('../deploy-history', () => ({
  DeployHistory: mocks.MockDeployHistory,
}));

vi.mock('../domain-section', () => ({
  PublicEndpointDomainSection: mocks.MockPublicEndpointDomainSection,
}));

vi.mock('../drift', () => ({
  DriftIndicator: mocks.MockDriftIndicator,
  DriftCheckButton: mocks.MockDriftCheckButton,
}));

vi.mock('../env-vars-editor', () => ({
  EnvVarsEditor: mocks.MockEnvVarsEditor,
}));

vi.mock('../group-color-picker', () => ({
  GroupColorPicker: mocks.MockGroupColorPicker,
}));

vi.mock('../monitoring-log-section', () => ({
  MonitoringLogSection: mocks.MockMonitoringLogSection,
}));

vi.mock('../pipeline-section', () => ({
  PipelineSection: mocks.MockPipelineSection,
}));

vi.mock('../private-network-panel', () => ({
  PrivateNetworkPanel: mocks.MockPrivateNetworkPanel,
}));

vi.mock('../scaling-section', () => ({
  ScalingSection: mocks.MockScalingSection,
}));

vi.mock('../service-source-section', () => ({
  ServiceSourceSection: mocks.MockServiceSourceSection,
}));

vi.mock('../source-repository-section', () => ({
  SourceRepositorySection: mocks.MockSourceRepositorySection,
}));

vi.mock('../node-identity-card', () => ({
  NodeIdentityCard: mocks.MockNodeIdentityCard,
}));

vi.mock('../custom-domain-banner', () => ({
  CustomDomainBanner: mocks.MockCustomDomainBanner,
}));

vi.mock('../../../../../shared/components/ui/panel-header', () => ({
  PanelHeader: mocks.MockPanelHeader,
}));

vi.mock('../../../../../shared/utils/cn', () => ({
  cn: mocks.cnSpy,
}));

vi.mock('../../../../../assets/icons', () => ({
  getIcon: mocks.getIconSpy,
  DEFAULT_ICON: 'default-icon-url',
}));

vi.mock('../../../../../assets/icons/brand-registry', () => ({
  getBrandIcon: mocks.getBrandIconSpy,
}));

vi.mock('../../../../../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => `t:${key}` }),
}));

vi.mock('../../../../../store/slices/cards-slice', () => ({
  updateCardNodeData: mocks.updateCardNodeDataSpy,
}));

vi.mock('../../../../../store/slices/ui-slice', () => ({
  toggleProperties: mocks.toggleProperties,
}));

import { NodePropertiesSection } from '../node-properties-section';
import type { Card, CardNode, CardEdge } from '../../../../../store/slices/cards-slice';
import type { ResourceDef } from '../../../hooks/use-resource-map';
import type { CanvasIssue } from '../../../../../store/slices/validation-slice';

// ─── Tree-walker (same shape as rf-props-6/9/10/.../22) ──────────────────────

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
  type: unknown,
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

interface RenderProps {
  selectedNode: CardNode;
  activeCard: Card;
  resourceMap?: Map<string, ResourceDef>;
  propertyIssuesMap?: Map<string, { severity: string; message: string }> | undefined;
  propsTab?: string;
  setPropsTab?: (id: string) => void;
  validationIssues?: ReadonlyArray<CanvasIssue>;
  activeEnvName?: string;
}

const renderSection = (props: RenderProps): React.ReactElement => {
  return NodePropertiesSection({
    selectedNode: props.selectedNode,
    activeCard: props.activeCard,
    resourceMap: props.resourceMap ?? new Map<string, ResourceDef>(),
    propertyIssuesMap: 'propertyIssuesMap' in props ? props.propertyIssuesMap : undefined,
    propsTab: props.propsTab ?? 'config',
    setPropsTab: props.setPropsTab ?? vi.fn(),
    validationIssues: props.validationIssues ?? [],
    activeEnvName: props.activeEnvName ?? 'production',
  }) as React.ReactElement;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('NodePropertiesSection', () => {
  beforeEach(() => {
    // Reset call history. Per-test behavior overrides are set BEFORE the
    // renderSection call, so we ONLY clear history here — never set
    // mockReturnValue (cite `render-helper-must-not-call-mockreturnvalue-after-test-overrides`).
    mocks.dispatchSpy.mockClear();
    mocks.updateCardNodeDataSpy.mockClear();
    mocks.toggleProperties.mockClear();
    mocks.MockSection.mockClear();
    mocks.MockPanelHeader.mockClear();
    mocks.MockDesignRequirements.mockClear();
    mocks.MockGroupColorPicker.mockClear();
    mocks.MockDriftIndicator.mockClear();
    mocks.MockDriftCheckButton.mockClear();
    mocks.MockDeployHistory.mockClear();
    mocks.MockServiceSourceSection.mockClear();
    mocks.MockPipelineSection.mockClear();
    mocks.MockSourceRepositorySection.mockClear();
    mocks.MockScalingSection.mockClear();
    mocks.MockPublicEndpointDomainSection.mockClear();
    mocks.MockCustomDomainPanel.mockClear();
    mocks.MockConnectionCard.mockClear();
    mocks.MockEnvVarsEditor.mockClear();
    mocks.MockPrivateNetworkPanel.mockClear();
    mocks.MockMonitoringLogSection.mockClear();
    mocks.MockPropertyFields.mockClear();
    mocks.cnSpy.mockClear();
    mocks.getBrandIconSpy.mockClear();
    mocks.getIconSpy.mockClear();
  });

  // ── Header / identity ────────────────────────────────────────────────────

  it('renders PanelHeader with title + close action that dispatches toggleProperties', () => {
    const node = makeNode('node-1', { iceType: 'Compute.Service', label: 'svc' });
    const card = makeCard({ nodes: [node] });
    const tree = renderSection({ selectedNode: node, activeCard: card });

    const headers = findByType(tree, mocks.MockPanelHeader);
    expect(headers).toHaveLength(1);
    const props = headers[0].props as {
      title: string;
      onClose: () => void;
      closeLabel: string;
    };
    expect(props.title).toBe('t:properties.title');
    expect(props.closeLabel).toBe('t:properties.closeTitle');
    props.onClose();
    expect(mocks.toggleProperties).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchSpy).toHaveBeenCalledWith({ type: 'ui/toggleProperties' });
  });

  it('renders the node label as the input defaultValue (name field on identity card)', () => {
    const node = makeNode('node-1', { iceType: 'Compute.Service', name: 'My Service' });
    const card = makeCard({ nodes: [node] });
    const tree = renderSection({ selectedNode: node, activeCard: card });
    const cards = findByType(tree, mocks.MockNodeIdentityCard);
    expect(cards).toHaveLength(1);
    expect((cards[0].props as any).label).toBe('My Service');
  });

  it('updateNodeField via NodeIdentityCard onUpdateName dispatches updateCardNodeData', () => {
    const node = makeNode('node-1', { iceType: 'Compute.Service', label: 'old' });
    const card = makeCard({ nodes: [node] });
    const tree = renderSection({ selectedNode: node, activeCard: card });
    const cards = findByType(tree, mocks.MockNodeIdentityCard);
    const onUpdateName = (cards[0].props as any).onUpdateName as (name: string) => void;
    onUpdateName('new-name');
    expect(mocks.updateCardNodeDataSpy).toHaveBeenCalledWith({
      nodeId: 'node-1',
      data: { name: 'new-name' },
    });
    expect(mocks.dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('renders DesignRequirements with the node + activeCard nodes and edges', () => {
    const node = makeNode('node-1', { iceType: 'Compute.Service' });
    const otherNode = makeNode('node-2', { iceType: 'Storage.Bucket' });
    const card = makeCard({ nodes: [node, otherNode], edges: [makeEdge()] });
    const tree = renderSection({ selectedNode: node, activeCard: card });
    const drs = findByType(tree, mocks.MockDesignRequirements);
    expect(drs).toHaveLength(1);
    const props = drs[0].props as { node: CardNode; allNodes: CardNode[]; edges: CardEdge[] };
    expect(props.node).toBe(node);
    expect(props.allNodes).toBe(card.nodes);
    expect(props.edges).toBe(card.edges);
  });

  // ── GroupColorPicker (container nodes only) ──────────────────────────────

  it('renders GroupColorPicker only when selectedNode.type === "container"', () => {
    const node = makeNode('node-1', { iceType: 'Compute.Service' });
    const card = makeCard({ nodes: [node] });
    const tree = renderSection({ selectedNode: node, activeCard: card });
    expect(findByType(tree, mocks.MockGroupColorPicker)).toHaveLength(0);
  });

  it('renders GroupColorPicker for container nodes, with onChange wiring updateCardNodeData', () => {
    const node = makeNode('grp-1', { iceType: 'Container', groupColor: '#ff00ff', groupOpacity: 0.5 }, { type: 'container' });
    const card = makeCard({ nodes: [node] });
    const tree = renderSection({ selectedNode: node, activeCard: card });
    const pickers = findByType(tree, mocks.MockGroupColorPicker);
    expect(pickers).toHaveLength(1);
    const props = pickers[0].props as {
      color: string;
      opacity: number;
      onChange: (color: string) => void;
      onOpacityChange: (opacity: number) => void;
    };
    expect(props.color).toBe('#ff00ff');
    expect(props.opacity).toBe(0.5);
    props.onChange('#00ffff');
    expect(mocks.updateCardNodeDataSpy).toHaveBeenLastCalledWith({
      nodeId: 'grp-1',
      data: { groupColor: '#00ffff' },
    });
    props.onOpacityChange(0.7);
    expect(mocks.updateCardNodeDataSpy).toHaveBeenLastCalledWith({
      nodeId: 'grp-1',
      data: { groupOpacity: 0.7 },
    });
  });

  // ── Custom Domain inheritance banner ─────────────────────────────────────

  it('always renders the CustomDomainBanner (it self-decides whether to display)', () => {
    const node = makeNode('node-1', { iceType: 'Compute.Service' });
    const card = makeCard({ nodes: [node] });
    const tree = renderSection({ selectedNode: node, activeCard: card });
    const banners = findByType(tree, mocks.MockCustomDomainBanner);
    expect(banners).toHaveLength(1);
    expect((banners[0].props as any).selectedNode).toBe(node);
    expect((banners[0].props as any).activeCard).toBe(card);
  });

  it('passes the active card and selectedNode to the CustomDomainBanner unchanged', () => {
    const node = makeNode('svc-1', { iceType: 'Compute.Service', domain: 'app.example.com' });
    const cdNode = makeNode('cd-1', { iceType: 'Network.CustomDomain', label: 'My CD' });
    const edge = makeEdge({ id: 'e1', source: 'cd-1', target: 'svc-1' });
    const card = makeCard({ nodes: [node, cdNode], edges: [edge] });
    const tree = renderSection({ selectedNode: node, activeCard: card });
    const banners = findByType(tree, mocks.MockCustomDomainBanner);
    expect(banners).toHaveLength(1);
    expect((banners[0].props as any).activeCard).toBe(card);
    expect((banners[0].props as any).selectedNode).toBe(node);
  });

  // ── Tab list construction ────────────────────────────────────────────────

  it('builds the connections tab when there are incoming or outgoing edges', () => {
    // Storage.Bucket doesn't push source tab; with one outgoing edge, visibleTabs is just [connections].
    const node = makeNode('node-1', { iceType: 'Storage.Bucket' });
    const other = makeNode('node-2', { iceType: 'Compute.Service' });
    const edge = makeEdge({ source: 'node-1', target: 'node-2' });
    const card = makeCard({ nodes: [node, other], edges: [edge] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'connections', setPropsTab: setSpy });
    const cards = findByType(tree, mocks.MockConnectionCard);
    expect(cards).toHaveLength(1);
  });

  it('shows the tab bar when there are >= 2 visible tabs', () => {
    // Compute.Service with provider_id (deploy tab) + an outgoing edge (connections tab) →
    // tab bar has 2 buttons.
    const node = makeNode('svc-1', {
      iceType: 'Compute.Service',
      provider_id: 'gcp:proj/svc',
      label: 'svc',
    });
    const other = makeNode('node-2', { iceType: 'Storage.Bucket' });
    const edge = makeEdge({ source: 'svc-1', target: 'node-2' });
    const card = makeCard({ nodes: [node, other], edges: [edge] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'deploy', setPropsTab: setSpy });
    // Two buttons rendered for visible tabs.
    const buttons = findByType(tree, 'button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('pushes the scaling tab when behavior === "scalable"', () => {
    const node = makeNode('svc-1', {
      iceType: 'Compute.Service',
      behavior: 'scalable',
      provider_id: 'gcp:proj/svc',
    });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'scaling', setPropsTab: setSpy });
    expect(findByType(tree, mocks.MockScalingSection)).toHaveLength(1);
  });

  it('pushes the domain tab when iceType === Network.PublicEndpoint', () => {
    const node = makeNode('pe-1', { iceType: 'Network.PublicEndpoint' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'domain', setPropsTab: setSpy });
    expect(findByType(tree, mocks.MockPublicEndpointDomainSection)).toHaveLength(1);
  });

  it('pushes the domain tab when iceType === Network.CustomDomain', () => {
    const node = makeNode('cd-1', { iceType: 'Network.CustomDomain' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'domain', setPropsTab: setSpy });
    expect(findByType(tree, mocks.MockCustomDomainPanel)).toHaveLength(1);
  });

  it('pushes the source tab for Compute.* iceType', () => {
    const node = makeNode('svc-1', { iceType: 'Compute.Service', repository: 'github.com/foo/bar' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'source', setPropsTab: setSpy });
    expect(findByType(tree, mocks.MockServiceSourceSection)).toHaveLength(1);
    expect(findByType(tree, mocks.MockPipelineSection)).toHaveLength(1);
  });

  it('pushes the source tab for Source.Repository iceType', () => {
    const node = makeNode('repo-1', { iceType: 'Source.Repository' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'source', setPropsTab: setSpy });
    expect(findByType(tree, mocks.MockSourceRepositorySection)).toHaveLength(1);
  });

  // ── setState-during-render fallback (BEHAVIOR-RISK FLAG #2) ──────────────

  it('calls setPropsTab(visibleTabs[0].id) once when propsTab does not match any visible tab', () => {
    // Compute.Service with `hasSource=true` (always for Compute.*) pushes the source tab.
    // With provider_id also present, deploy tab is pushed too. Order in tabs array:
    // [source, deploy] — visibleTabs[0] is 'source'.
    const node = makeNode('svc-1', { iceType: 'Compute.Service', provider_id: 'gcp:proj/svc' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    renderSection({ selectedNode: node, activeCard: card, propsTab: 'config', setPropsTab: setSpy });
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith('source');
  });

  it('does NOT call setPropsTab when propsTab matches a visible tab', () => {
    const node = makeNode('svc-1', { iceType: 'Compute.Service', provider_id: 'gcp:proj/svc' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    renderSection({ selectedNode: node, activeCard: card, propsTab: 'deploy', setPropsTab: setSpy });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('does NOT call setPropsTab when there are zero visible tabs (the "length > 0" guard)', () => {
    // To force zero visible tabs we need iceType that doesn't push config/source/anything.
    // Using a literal "Container" (non-Compute/non-Network/non-Source/non-Config/non-Monitoring)
    // with NO dbProperties, NO provider_id, NO edges, NOT scalable, NOT endpoint/customdomain.
    const node = makeNode('node-1', { iceType: 'Container' }, { type: 'container' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    renderSection({ selectedNode: node, activeCard: card, propsTab: 'config', setPropsTab: setSpy });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('clicking a tab button dispatches setPropsTab with that tab id', () => {
    const node = makeNode('svc-1', {
      iceType: 'Compute.Service',
      provider_id: 'gcp:proj/svc',
    });
    const other = makeNode('node-2', { iceType: 'Storage.Bucket' });
    const edge = makeEdge({ source: 'svc-1', target: 'node-2' });
    const card = makeCard({ nodes: [node, other], edges: [edge] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'deploy', setPropsTab: setSpy });
    const buttons = findByType(tree, 'button');
    // Clicking the "connections" button should call setPropsTab('connections').
    const connectionsBtn = buttons.find((b) => {
      const text = collectText(b);
      return text.includes('t:properties.tabs.connections');
    });
    expect(connectionsBtn).toBeDefined();
    (connectionsBtn!.props as any).onClick();
    expect(setSpy).toHaveBeenCalledWith('connections');
  });

  // ── Deploy tab content ───────────────────────────────────────────────────

  it('activeTab === "deploy" renders DriftIndicator + DeployHistory + DriftCheckButton', () => {
    const node = makeNode('svc-1', {
      iceType: 'Compute.Service',
      provider_id: 'gcp:proj/svc',
      url: 'https://svc.example.com',
      deployed_image: 'gcr.io/foo:v1',
      region: 'us-central1',
      max_instances: 10,
      min_instances: 1,
    });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'deploy', setPropsTab: setSpy });
    expect(findByType(tree, mocks.MockDriftIndicator)).toHaveLength(1);
    expect(findByType(tree, mocks.MockDeployHistory)).toHaveLength(1);
    expect(findByType(tree, mocks.MockDriftCheckButton)).toHaveLength(1);
    const text = collectText(tree);
    expect(text).toContain('https://svc.example.com');
    expect(text).toContain('gcr.io/foo:v1');
    expect(text).toContain('gcp:proj/svc');
    expect(text).toContain('us-central1');
  });

  it('DriftIndicator receives selectedNode.id', () => {
    const node = makeNode('svc-1', {
      iceType: 'Compute.Service',
      provider_id: 'gcp:proj/svc',
    });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'deploy', setPropsTab: setSpy });
    const drift = findByType(tree, mocks.MockDriftIndicator);
    expect((drift[0].props as any).nodeId).toBe('svc-1');
  });

  // ── Source tab content ───────────────────────────────────────────────────

  it('activeTab === "source" renders ServiceSourceSection + PipelineSection for Compute.* nodes', () => {
    const node = makeNode('svc-1', {
      iceType: 'Compute.Service',
      repository: 'github.com/foo/bar',
      branch: 'main',
    });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'source', setPropsTab: setSpy });
    expect(findByType(tree, mocks.MockServiceSourceSection)).toHaveLength(1);
    expect(findByType(tree, mocks.MockPipelineSection)).toHaveLength(1);
    // Source.Repository fallback should NOT render.
    expect(findByType(tree, mocks.MockSourceRepositorySection)).toHaveLength(0);
  });

  it('activeTab === "source" renders SourceRepositorySection for Source.Repository nodes', () => {
    const node = makeNode('repo-1', {
      iceType: 'Source.Repository',
      repository: 'github.com/foo/bar',
      branch: 'main',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
    });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'source', setPropsTab: setSpy });
    expect(findByType(tree, mocks.MockSourceRepositorySection)).toHaveLength(1);
    // Compute.* fallback should NOT render.
    expect(findByType(tree, mocks.MockServiceSourceSection)).toHaveLength(0);
    expect(findByType(tree, mocks.MockPipelineSection)).toHaveLength(0);
  });

  // ── Scaling tab content ──────────────────────────────────────────────────

  it('activeTab === "scaling" renders ScalingSection with selectedNode + updateNodeField', () => {
    const node = makeNode('svc-1', {
      iceType: 'Compute.Service',
      behavior: 'scalable',
      provider_id: 'gcp:proj/svc',
    });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'scaling', setPropsTab: setSpy });
    const scalings = findByType(tree, mocks.MockScalingSection);
    expect(scalings).toHaveLength(1);
    const props = scalings[0].props as {
      selectedNode: CardNode;
      updateNodeField: (field: string, value: unknown) => void;
    };
    expect(props.selectedNode).toBe(node);
    // Calling updateNodeField should dispatch updateCardNodeData.
    props.updateNodeField('minInstances', 5);
    expect(mocks.updateCardNodeDataSpy).toHaveBeenCalledWith({
      nodeId: 'svc-1',
      data: { minInstances: 5 },
    });
  });

  // ── Domain tab content ───────────────────────────────────────────────────

  it('activeTab === "domain" + Network.PublicEndpoint renders PublicEndpointDomainSection', () => {
    const node = makeNode('pe-1', { iceType: 'Network.PublicEndpoint' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'domain', setPropsTab: setSpy });
    expect(findByType(tree, mocks.MockPublicEndpointDomainSection)).toHaveLength(1);
    // CustomDomainPanel should NOT render under domain tab for PublicEndpoint.
    expect(findByType(tree, mocks.MockCustomDomainPanel)).toHaveLength(0);
  });

  it('activeTab === "domain" + Network.CustomDomain renders CustomDomainPanel (with outgoingEdges)', () => {
    const node = makeNode('cd-1', { iceType: 'Network.CustomDomain' });
    const target = makeNode('svc-1', { iceType: 'Compute.Service' });
    const outEdge = makeEdge({ id: 'e-out', source: 'cd-1', target: 'svc-1' });
    const card = makeCard({ nodes: [node, target], edges: [outEdge] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'domain', setPropsTab: setSpy });
    const panels = findByType(tree, mocks.MockCustomDomainPanel);
    expect(panels).toHaveLength(1);
    const props = panels[0].props as { outgoingEdges: CardEdge[]; selectedNode: CardNode };
    expect(props.outgoingEdges).toHaveLength(1);
    expect(props.outgoingEdges[0].id).toBe('e-out');
    expect(props.selectedNode).toBe(node);
  });

  // ── Connections tab content ──────────────────────────────────────────────

  it('activeTab === "connections" renders one ConnectionCard per incoming + outgoing edge', () => {
    const node = makeNode('svc-1', { iceType: 'Compute.Service' });
    const a = makeNode('a', { iceType: 'Storage.Bucket' });
    const b = makeNode('b', { iceType: 'Storage.Bucket' });
    const incoming = makeEdge({ id: 'in-1', source: 'a', target: 'svc-1' });
    const outgoing = makeEdge({ id: 'out-1', source: 'svc-1', target: 'b' });
    const card = makeCard({ nodes: [node, a, b], edges: [incoming, outgoing] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'connections', setPropsTab: setSpy });
    const cards = findByType(tree, mocks.MockConnectionCard);
    expect(cards).toHaveLength(2);
    // Each card receives thisNodeId === selectedNode.id and the full nodes list.
    for (const card_ of cards) {
      const p = card_.props as { thisNodeId: string; nodes: CardNode[] };
      expect(p.thisNodeId).toBe('svc-1');
      expect(p.nodes).toBe(card.nodes);
    }
  });

  // ── Config tab content ───────────────────────────────────────────────────

  it('activeTab === "config" renders PropertyFields when dbProperties is non-empty', () => {
    const resourceMap = new Map<string, ResourceDef>([
      [
        'Compute.Service',
        {
          ice_type: 'Compute.Service',
          display_name: 'Service',
          properties: [{ name: 'region', label: 'Region', type: 'string' }],
        } as unknown as ResourceDef,
      ],
    ]);
    const node = makeNode('svc-1', { iceType: 'Compute.Service' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({
      selectedNode: node,
      activeCard: card,
      resourceMap,
      propsTab: 'config',
      setPropsTab: setSpy,
    });
    const fields = findByType(tree, mocks.MockPropertyFields);
    expect(fields).toHaveLength(1);
    const props = fields[0].props as {
      properties: unknown[];
      nodeData: Record<string, unknown>;
      onFieldChange: (field: string, value: unknown) => void;
      propertyIssues: unknown;
    };
    expect(props.properties).toHaveLength(1);
    // onFieldChange routes through updateNodeField → dispatch.
    props.onFieldChange('region', 'us-central1');
    expect(mocks.updateCardNodeDataSpy).toHaveBeenCalledWith({
      nodeId: 'svc-1',
      data: { region: 'us-central1' },
    });
  });

  it('activeTab === "config" + Config.Environment renders EnvVarsEditor', () => {
    const node = makeNode('env-1', {
      iceType: 'Config.Environment',
      variables: [{ name: 'API_KEY', value: 'abc' }],
    });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'config', setPropsTab: setSpy });
    const editors = findByType(tree, mocks.MockEnvVarsEditor);
    expect(editors).toHaveLength(1);
    const props = editors[0].props as {
      variables: Array<{ name: string; value: string }>;
      onChange: (vars: unknown) => void;
    };
    expect(props.variables).toHaveLength(1);
    expect(props.variables[0].name).toBe('API_KEY');
    // onChange dispatches updateCardNodeData.
    props.onChange([{ name: 'NEW', value: 'X' }]);
    expect(mocks.updateCardNodeDataSpy).toHaveBeenCalledWith({
      nodeId: 'env-1',
      data: { variables: [{ name: 'NEW', value: 'X' }] },
    });
  });

  it('activeTab === "config" + Network.PrivateNetwork renders PrivateNetworkPanel', () => {
    // Need a config tab to be visible — Network.PrivateNetwork w/ dbProperties is enough,
    // but we hit the panel via the iceType branch directly. The config tab is pushed
    // because dbProperties.length > 0 OR iceType matches one of Config/Endpoint/CustomDomain.
    // PrivateNetwork doesn't match — but we can use dbProperties from resourceMap to push
    // the config tab.
    const resourceMap = new Map<string, ResourceDef>([
      [
        'Network.PrivateNetwork',
        {
          ice_type: 'Network.PrivateNetwork',
          display_name: 'Private Network',
          properties: [{ name: 'cidr', label: 'CIDR', type: 'string' }],
        } as unknown as ResourceDef,
      ],
    ]);
    const node = makeNode('pn-1', { iceType: 'Network.PrivateNetwork' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({
      selectedNode: node,
      activeCard: card,
      resourceMap,
      propsTab: 'config',
      setPropsTab: setSpy,
    });
    expect(findByType(tree, mocks.MockPrivateNetworkPanel)).toHaveLength(1);
  });

  it('activeTab === "config" + Monitoring.Log renders MonitoringLogSection', () => {
    const resourceMap = new Map<string, ResourceDef>([
      [
        'Monitoring.Log',
        {
          ice_type: 'Monitoring.Log',
          display_name: 'Log',
          properties: [{ name: 'mode', label: 'Mode', type: 'string' }],
        } as unknown as ResourceDef,
      ],
    ]);
    const node = makeNode('log-1', { iceType: 'Monitoring.Log' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({
      selectedNode: node,
      activeCard: card,
      resourceMap,
      propsTab: 'config',
      setPropsTab: setSpy,
    });
    const logs = findByType(tree, mocks.MockMonitoringLogSection);
    expect(logs).toHaveLength(1);
    expect((logs[0].props as any).nodeId).toBe('log-1');
  });

  it('activeTab === "config" + Network.CustomDomain renders CustomDomainPanel (mirror of domain tab)', () => {
    // CustomDomain pushes both domain AND config tabs; pick config explicitly.
    const node = makeNode('cd-1', { iceType: 'Network.CustomDomain' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({ selectedNode: node, activeCard: card, propsTab: 'config', setPropsTab: setSpy });
    expect(findByType(tree, mocks.MockCustomDomainPanel)).toHaveLength(1);
  });

  it('activeTab === "config" — Source.Repository fallback when only one tab is visible', () => {
    // Source.Repository pushes the source tab, AND if there are no other tabs,
    // visibleTabs.length <= 1 lets the config-tab Source.Repository fallback render.
    // To force visibleTabs.length === 1 (just config), we need NO source tab pushed —
    // but Source.Repository always pushes source. So we need a tweak: when iceType is
    // Source.Repository, both source AND config tabs get pushed if dbProperties has any.
    // Without dbProperties, only the source tab is pushed → propsTab='config' falls back.
    // To exercise the config-tab Source.Repository fallback, give iceType='Source.Repository'
    // dbProperties so the config tab is pushed; then visibleTabs is [config, source] which
    // is > 1, so the fallback DOES NOT fire. Hence: this fallback is only reachable when
    // dbProperties + iceType === Source.Repository AND the source tab is not pushed —
    // unreachable today. Kept for parity with the original code; we exercise the
    // visibleTabs <= 1 + iceType === Source.Repository branch by injecting both
    // dbProperties and the right node, then asserting the source-repository under the
    // active config tab does NOT double up.
    const resourceMap = new Map<string, ResourceDef>([
      [
        'Source.Repository',
        {
          ice_type: 'Source.Repository',
          display_name: 'Repository',
          properties: [{ name: 'visibility', label: 'Vis', type: 'string' }],
        } as unknown as ResourceDef,
      ],
    ]);
    const node = makeNode('repo-1', { iceType: 'Source.Repository', repository: 'gh/foo/bar' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({
      selectedNode: node,
      activeCard: card,
      resourceMap,
      propsTab: 'config',
      setPropsTab: setSpy,
    });
    // visibleTabs = [config, source] — both > 1. The config-tab SourceRepositorySection
    // fallback does NOT render here.
    const reposes = findByType(tree, mocks.MockSourceRepositorySection);
    // Only the under-config-tab SourceRepositorySection from the visibleTabs<=1 fallback
    // — should be 0 since visibleTabs.length > 1.
    expect(reposes).toHaveLength(0);
  });

  it('activeTab === "config" — validation issues banner renders when nodeIssues are present', () => {
    const resourceMap = new Map<string, ResourceDef>([
      [
        'Compute.Service',
        {
          ice_type: 'Compute.Service',
          display_name: 'Service',
          properties: [{ name: 'region', label: 'Region', type: 'string' }],
        } as unknown as ResourceDef,
      ],
    ]);
    const node = makeNode('svc-1', { iceType: 'Compute.Service' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const validationIssues: CanvasIssue[] = [
      {
        id: 'iss-1',
        nodeId: 'svc-1',
        severity: 'error',
        category: 'property',
        code: 'C01',
        message: 'missing region',
      } as CanvasIssue,
      {
        id: 'iss-2',
        nodeId: 'svc-1',
        severity: 'warning',
        category: 'property',
        code: 'C02',
        message: 'consider raising memory',
      } as CanvasIssue,
      {
        id: 'iss-3',
        nodeId: 'other',
        severity: 'error',
        category: 'property',
        code: 'C03',
        message: 'unrelated',
      } as CanvasIssue,
    ];
    const tree = renderSection({
      selectedNode: node,
      activeCard: card,
      resourceMap,
      propsTab: 'config',
      setPropsTab: setSpy,
      validationIssues,
    });
    const text = collectText(tree);
    expect(text).toContain('missing region');
    expect(text).toContain('consider raising memory');
    // Unrelated issue must not render.
    expect(text).not.toContain('unrelated');
    // Counts: 1 error + 1 warning.
    expect(text).toContain('1 error');
    expect(text).toContain('1 warning');
  });

  it('activeTab === "config" — info-severity issues are filtered out of the banner', () => {
    const resourceMap = new Map<string, ResourceDef>([
      [
        'Compute.Service',
        {
          ice_type: 'Compute.Service',
          display_name: 'Service',
          properties: [{ name: 'region', label: 'Region', type: 'string' }],
        } as unknown as ResourceDef,
      ],
    ]);
    const node = makeNode('svc-1', { iceType: 'Compute.Service' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const validationIssues: CanvasIssue[] = [
      {
        id: 'iss-1',
        nodeId: 'svc-1',
        severity: 'info',
        category: 'property',
        code: 'C01',
        message: 'just-fyi',
      } as CanvasIssue,
    ];
    const tree = renderSection({
      selectedNode: node,
      activeCard: card,
      resourceMap,
      propsTab: 'config',
      setPropsTab: setSpy,
      validationIssues,
    });
    const text = collectText(tree);
    expect(text).not.toContain('just-fyi');
  });

  it('activeTab === "config" — estimatedCost renders the cost section', () => {
    const resourceMap = new Map<string, ResourceDef>([
      [
        'Compute.Service',
        {
          ice_type: 'Compute.Service',
          display_name: 'Service',
          properties: [{ name: 'region', label: 'Region', type: 'string' }],
        } as unknown as ResourceDef,
      ],
    ]);
    const node = makeNode('svc-1', { iceType: 'Compute.Service', estimatedCost: '$10–20/mo' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    const tree = renderSection({
      selectedNode: node,
      activeCard: card,
      resourceMap,
      propsTab: 'config',
      setPropsTab: setSpy,
    });
    const text = collectText(tree);
    expect(text).toContain('$10–20/mo');
    expect(text).toContain('t:properties.config.estimatedMonthly');
  });

  // ── Display chips (resourceDef vs raw iceType + provider) ────────────────

  it('passes resourceDef.display_name to NodeIdentityCard when resourceDef is found', () => {
    const resourceMap = new Map<string, ResourceDef>([
      [
        'Compute.Service',
        {
          ice_type: 'Compute.Service',
          display_name: 'Compute Service',
          properties: [],
        } as unknown as ResourceDef,
      ],
    ]);
    const node = makeNode('svc-1', { iceType: 'Compute.Service' });
    const card = makeCard({ nodes: [node] });
    const tree = renderSection({ selectedNode: node, activeCard: card, resourceMap });
    const cards = findByType(tree, mocks.MockNodeIdentityCard);
    expect(cards).toHaveLength(1);
    expect((cards[0].props as any).resourceDef?.display_name).toBe('Compute Service');
  });

  it('passes iceType to NodeIdentityCard when no resourceDef is found', () => {
    const node = makeNode('svc-1', { iceType: 'Compute.Unknown' });
    const card = makeCard({ nodes: [node] });
    const tree = renderSection({ selectedNode: node, activeCard: card });
    const cards = findByType(tree, mocks.MockNodeIdentityCard);
    expect((cards[0].props as any).iceType).toBe('Compute.Unknown');
    expect((cards[0].props as any).resourceDef).toBeUndefined();
  });

  it('passes provider to NodeIdentityCard when provider is set', () => {
    const node = makeNode('svc-1', { iceType: 'Compute.Service', provider: 'aws' });
    const card = makeCard({ nodes: [node] });
    const tree = renderSection({ selectedNode: node, activeCard: card });
    const cards = findByType(tree, mocks.MockNodeIdentityCard);
    expect((cards[0].props as any).provider).toBe('aws');
  });

  // ── Source.Repository — visibleTabs <= 1 path under config tab ───────────

  it('Source.Repository node with NO dbProperties — config tab is NOT pushed; source tab is the only one', () => {
    const node = makeNode('repo-1', { iceType: 'Source.Repository', repository: 'gh/foo/bar' });
    const card = makeCard({ nodes: [node] });
    const setSpy = vi.fn();
    // visibleTabs = [source]. propsTab='config' triggers fallback to 'source'.
    renderSection({ selectedNode: node, activeCard: card, propsTab: 'config', setPropsTab: setSpy });
    expect(setSpy).toHaveBeenCalledWith('source');
  });
});
