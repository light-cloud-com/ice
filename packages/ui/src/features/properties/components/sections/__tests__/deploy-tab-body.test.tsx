/**
 * rf-npsec-4 — DeployTabBody tests.
 *
 * Direct-FC tree-walker; mocks for sub-components and Section.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
  MockDriftIndicator: vi.fn(),
  MockDriftCheckButton: vi.fn(),
  MockDeployHistory: vi.fn(),
}));

vi.mock('../../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `t:${k}` }),
}));

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
}));

vi.mock('../drift', () => ({
  DriftIndicator: mocks.MockDriftIndicator,
  DriftCheckButton: mocks.MockDriftCheckButton,
}));

vi.mock('../deploy-history', () => ({
  DeployHistory: mocks.MockDeployHistory,
}));

import { DeployTabBody } from '../deploy-tab-body';
import type { Card, CardNode } from '../../../../../store/slices/cards-slice';

interface ReactElementLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isElement(x: unknown): x is ReactElementLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ReactElementLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isElement(node)) return;
  yield node;
  yield* walk(node.props.children);
}
function findByPredicate(
  tree: unknown,
  predicate: (el: ReactElementLike) => boolean,
): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}
function findAllByPredicate(
  tree: unknown,
  predicate: (el: ReactElementLike) => boolean,
): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}

const makeNode = (overrides: Partial<CardNode> = {}): CardNode =>
  ({
    id: 'n1',
    type: 'compute',
    position: { x: 0, y: 0 },
    data: { provider_id: 'gcp:proj/svc' },
    ...overrides,
  }) as CardNode;

const makeCard = (overrides: Partial<Card> = {}): Card =>
  ({
    id: 'c1',
    name: 'Card',
    nodes: [],
    edges: [],
    ...overrides,
  }) as Card;

const callRender = (props: React.ComponentProps<typeof DeployTabBody>): unknown =>
  (DeployTabBody as (p: React.ComponentProps<typeof DeployTabBody>) => unknown)(props);

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockClear?.());
});

describe('DeployTabBody — composition', () => {
  it('renders DriftIndicator with the node id', () => {
    const node = makeNode({ id: 'svc-1' });
    const card = makeCard({ nodes: [node] });
    const tree = callRender({ selectedNode: node, activeCard: card });
    const drifts = findAllByPredicate(tree, (el) => el.type === mocks.MockDriftIndicator);
    expect(drifts.length).toBe(1);
    expect((drifts[0].props as { nodeId: string }).nodeId).toBe('svc-1');
  });

  it('renders Section with the deploy.current title', () => {
    const node = makeNode();
    const card = makeCard();
    const tree = callRender({ selectedNode: node, activeCard: card });
    const sections = findAllByPredicate(tree, (el) => el.type === mocks.MockSection);
    expect(sections.length).toBe(1);
    expect((sections[0].props as { title: string }).title).toBe('t:properties.deploy.current');
  });

  it('renders DeployHistory with the activeCard.id', () => {
    const node = makeNode();
    const card = makeCard({ id: 'card-x' });
    const tree = callRender({ selectedNode: node, activeCard: card });
    const histories = findAllByPredicate(tree, (el) => el.type === mocks.MockDeployHistory);
    expect((histories[0].props as { cardId: string }).cardId).toBe('card-x');
  });

  it('renders DriftCheckButton with the activeCard.id and nodes', () => {
    const node = makeNode();
    const otherNode = makeNode({ id: 'other' });
    const card = makeCard({ id: 'card-x', nodes: [node, otherNode] });
    const tree = callRender({ selectedNode: node, activeCard: card });
    const buttons = findAllByPredicate(tree, (el) => el.type === mocks.MockDriftCheckButton);
    expect((buttons[0].props as { cardId: string; nodes: CardNode[] }).cardId).toBe('card-x');
    expect((buttons[0].props as { nodes: CardNode[] }).nodes).toBe(card.nodes);
  });
});

describe('DeployTabBody — conditional rows', () => {
  it('renders the URL row when selectedNode.data.url is set', () => {
    const node = makeNode({ data: { provider_id: 'pid', url: 'https://example.com' } });
    const tree = callRender({ selectedNode: node, activeCard: makeCard() });
    const link = findByPredicate(tree, (el) => el.type === 'a');
    expect(link?.props.href).toBe('https://example.com');
  });

  it('omits the URL row when no url', () => {
    const node = makeNode({ data: { provider_id: 'pid' } });
    const tree = callRender({ selectedNode: node, activeCard: makeCard() });
    const link = findByPredicate(tree, (el) => el.type === 'a');
    expect(link).toBeUndefined();
  });

  it('renders the deployed image row when set', () => {
    const node = makeNode({
      data: { provider_id: 'pid', deployed_image: 'gcr.io/foo/bar:v1' },
    });
    const tree = callRender({ selectedNode: node, activeCard: makeCard() });
    const imgRow = findByPredicate(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        el.props.className.includes('font-mono') &&
        el.props.children === 'gcr.io/foo/bar:v1',
    );
    expect(imgRow).toBeDefined();
  });

  it('renders the region row when region is set', () => {
    const node = makeNode({ data: { provider_id: 'pid', region: 'us-central1' } });
    const tree = callRender({ selectedNode: node, activeCard: makeCard() });
    const regionRow = findByPredicate(tree, (el) => el.props.children === 'us-central1');
    expect(regionRow).toBeDefined();
  });

  it('renders the instances row showing min – max when max_instances is set', () => {
    const node = makeNode({
      data: { provider_id: 'pid', min_instances: 1, max_instances: 5 },
    });
    const tree = callRender({ selectedNode: node, activeCard: makeCard() });
    const instancesRow = findByPredicate(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        el.props.className === 'text-ice-xs text-ice-text-2' &&
        Array.isArray(el.props.children),
    );
    expect(instancesRow?.props.children).toEqual(['1', ' – ', '5']);
  });

  it('uses 0 as the default for min_instances when not set', () => {
    const node = makeNode({ data: { provider_id: 'pid', max_instances: 3 } });
    const tree = callRender({ selectedNode: node, activeCard: makeCard() });
    const instancesRow = findByPredicate(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        el.props.className === 'text-ice-xs text-ice-text-2' &&
        Array.isArray(el.props.children),
    );
    expect(instancesRow?.props.children).toEqual(['0', ' – ', '3']);
  });

  it('always renders the resource id row from provider_id', () => {
    const node = makeNode({ data: { provider_id: 'gcp:project/foo' } });
    const tree = callRender({ selectedNode: node, activeCard: makeCard() });
    const idRow = findByPredicate(tree, (el) => el.props.children === 'gcp:project/foo');
    expect(idRow).toBeDefined();
  });
});
