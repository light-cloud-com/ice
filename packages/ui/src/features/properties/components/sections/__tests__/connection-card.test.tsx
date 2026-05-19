/**
 * rf-props-12 — connection-card section.
 *
 * `ConnectionCard` is purely presentational (no Redux, no hooks; `dispatch`
 * is a prop), so we use the direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * invoke the component as a function, then walk the returned React-element
 * tree depth-first to find leaves and assert on type / props / children.
 *
 * `getIcon` is mocked so the icon-vs-initial fallback can be driven by the
 * second arg (`provider`) — `'aws'` returns a stub IconMapping, anything
 * else returns null. This also lets us verify the `'aws'` default-provider
 * fallback by checking the second arg the mock was called with.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Mock getIcon — the test sits at `components/sections/__tests__/`, so
// `../../../../../assets/icons` lands at `packages/ui/src/assets/icons` (one
// extra `..` segment vs. the source file because the test is one level
// deeper). Returning a stub when provider === 'aws' gives a driveable success
// path; null is the fallback path. The mock is hoisted before the import
// below so ConnectionCard picks up the mocked version.
vi.mock('../../../../../assets/icons', () => ({
  getIcon: vi.fn((iceType: string, provider: string) => {
    if (provider === 'aws') {
      return {
        icon: `/icons/${iceType}.svg`,
        label: iceType,
        color: '#000',
      };
    }
    return null;
  }),
}));

// Mock i18n — `t('properties.removeConnection')` returns a stable string for
// the delete-button title assertion.
vi.mock('../../../../../i18n', () => ({
  t: vi.fn((key: string) => `t:${key}`),
}));

import { ConnectionCard } from '../connection-card';
import { getIcon } from '../../../../../assets/icons';
import {
  deleteCardEdge,
  type CardEdge,
  type CardNode,
} from '../../../../../store/slices/cards-slice';

// ─── Tree-walker (same shape as rf-props-6/9/10/11) ─────────────────────────

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

function findByType(tree: React.ReactNode, type: string): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ImgProps {
  src: string;
  alt: string;
  className: string;
}

interface SpanProps {
  className: string;
  children?: React.ReactNode;
}

interface ButtonProps {
  onClick: () => void;
  className: string;
  title: string;
  children?: React.ReactNode;
}

const makeNode = (
  id: string,
  data: Partial<CardNode['data']> = {},
): CardNode => ({
  id,
  type: 'block',
  position: { x: 0, y: 0 },
  width: 100,
  height: 100,
  data,
});

const renderCard = (overrides: {
  edge?: Partial<CardEdge>;
  nodes?: CardNode[];
  thisNodeId?: string;
  dispatch?: ReturnType<typeof vi.fn>;
} = {}): {
  tree: React.ReactElement;
  dispatch: ReturnType<typeof vi.fn>;
} => {
  const dispatch = overrides.dispatch ?? vi.fn();
  const edge: CardEdge = {
    id: 'edge-1',
    source: 'src',
    target: 'tgt',
    ...overrides.edge,
  };
  const nodes: CardNode[] = overrides.nodes ?? [
    makeNode('src', { label: 'Source', iceType: 'compute.ec2', provider: 'aws' }),
    makeNode('tgt', { label: 'Target', iceType: 'storage.s3', provider: 'aws' }),
  ];
  const tree = ConnectionCard({
    edge,
    thisNodeId: overrides.thisNodeId ?? 'src',
    nodes,
    // dispatch is loosely typed in the test; the signature only needs to
    // accept a single action argument.
    dispatch: dispatch as unknown as Parameters<typeof ConnectionCard>[0]['dispatch'],
  }) as React.ReactElement;
  return { tree, dispatch };
};

const findImgs = (tree: React.ReactNode): React.ReactElement[] =>
  findByType(tree, 'img');

// "Initial-letter" spans are <span>s with className containing 'font-semibold'
// (the source uses `text-ice-sm text-ice-text-3 font-semibold` for them).
const findInitialSpans = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(
    tree,
    (el) =>
      el.type === 'span' &&
      typeof (el.props as Partial<SpanProps>).className === 'string' &&
      ((el.props as SpanProps).className.includes('font-semibold')),
  );

// "Label" spans are <span>s with className containing 'font-medium'
// (source uses `text-ice-xs font-medium text-ice-text-1 truncate max-w-full text-center`).
const findLabelSpans = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(
    tree,
    (el) =>
      el.type === 'span' &&
      typeof (el.props as Partial<SpanProps>).className === 'string' &&
      ((el.props as SpanProps).className.includes('font-medium')),
  );

// Port pill span (className includes 'font-mono text-ice-accent').
const findPortSpan = (tree: React.ReactNode): React.ReactElement | undefined =>
  findByPredicate(
    tree,
    (el) =>
      el.type === 'span' &&
      typeof (el.props as Partial<SpanProps>).className === 'string' &&
      ((el.props as SpanProps).className.includes('text-ice-accent')),
  )[0];

// Relationship label span (className: 'text-ice-2xs text-ice-text-3').
// Distinct from initial-letter span which has 'font-semibold' AND from the
// port span which has 'font-mono text-ice-accent'. Match exactly.
const findRelationshipSpan = (
  tree: React.ReactNode,
): React.ReactElement | undefined =>
  findByPredicate(
    tree,
    (el) =>
      el.type === 'span' &&
      (el.props as Partial<SpanProps>).className === 'text-ice-2xs text-ice-text-3',
  )[0];

const findDeleteButton = (tree: React.ReactNode): React.ReactElement => {
  const btns = findByType(tree, 'button');
  expect(btns).toHaveLength(1);
  return btns[0];
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ConnectionCard', () => {
  it('renders source icon (img) when getIcon returns a result', () => {
    const { tree } = renderCard();
    const imgs = findImgs(tree);
    // Both source and target resolve to icons (provider='aws' for both).
    expect(imgs).toHaveLength(2);
    expect((imgs[0].props as ImgProps).src).toBe('/icons/compute.ec2.svg');
  });

  it('renders source initial-letter fallback when getIcon returns null', () => {
    // Set source provider to something other than 'aws' so the mock returns
    // null. The fallback uses sourceType.split('.').pop()?.charAt(0).
    const nodes: CardNode[] = [
      makeNode('src', {
        label: 'Source',
        iceType: 'compute.lambda',
        provider: 'gcp',
      }),
      makeNode('tgt', { label: 'Target', iceType: 'storage.s3', provider: 'aws' }),
    ];
    const { tree } = renderCard({ nodes });
    const initials = findInitialSpans(tree);
    // Only the source falls back; the target still renders an img.
    expect(initials).toHaveLength(1);
    const children = (initials[0].props as SpanProps).children as unknown[];
    // 'compute.lambda'.split('.').pop() === 'lambda'; charAt(0) === 'l'.
    // The JSX is `{x || '?'}` so the children prop is the resolved string.
    expect(children).toBe('l');
  });

  it('renders target icon + label', () => {
    const { tree } = renderCard();
    const imgs = findImgs(tree);
    expect((imgs[1].props as ImgProps).src).toBe('/icons/storage.s3.svg');
    const labels = findLabelSpans(tree);
    // Two label spans, source first then target.
    expect(labels).toHaveLength(2);
    expect((labels[1].props as SpanProps).children).toBe('Target');
  });

  it('renders target initial-letter fallback when getIcon returns null', () => {
    const nodes: CardNode[] = [
      makeNode('src', { label: 'Source', iceType: 'compute.ec2', provider: 'aws' }),
      makeNode('tgt', {
        label: 'Target',
        iceType: 'storage.bucket',
        provider: 'gcp',
      }),
    ];
    const { tree } = renderCard({ nodes });
    const initials = findInitialSpans(tree);
    expect(initials).toHaveLength(1);
    // 'storage.bucket'.split('.').pop() === 'bucket'; charAt(0) === 'b'.
    expect((initials[0].props as SpanProps).children).toBe('b');
  });

  it('renders the port `:80` when edge.data.port is set', () => {
    const { tree } = renderCard({ edge: { data: { port: 80 } } });
    const port = findPortSpan(tree);
    expect(port).toBeDefined();
    // JSX is `:{port}` — two adjacent children.
    const children = (port!.props as SpanProps).children as unknown[];
    expect(children[0]).toBe(':');
    expect(children[1]).toBe('80');
  });

  it('renders the relationship text when no port and connectionCategory is set', () => {
    const { tree } = renderCard({
      edge: { data: { connectionCategory: 'reads-from' } },
    });
    expect(findPortSpan(tree)).toBeUndefined();
    const rel = findRelationshipSpan(tree);
    expect(rel).toBeDefined();
    expect((rel!.props as SpanProps).children).toBe('reads-from');
  });

  it('renders the relationship text when no port and only relationship is set (fallback)', () => {
    const { tree } = renderCard({
      edge: { data: { relationship: 'depends-on' } },
    });
    expect(findPortSpan(tree)).toBeUndefined();
    const rel = findRelationshipSpan(tree);
    expect(rel).toBeDefined();
    expect((rel!.props as SpanProps).children).toBe('depends-on');
  });

  it('connectionCategory takes precedence over relationship when both are set', () => {
    const { tree } = renderCard({
      edge: {
        data: {
          connectionCategory: 'reads-from',
          relationship: 'depends-on',
        },
      },
    });
    const rel = findRelationshipSpan(tree);
    expect(rel).toBeDefined();
    expect((rel!.props as SpanProps).children).toBe('reads-from');
  });

  it('renders neither port nor relationship label when both are absent', () => {
    const { tree } = renderCard({ edge: { data: {} } });
    expect(findPortSpan(tree)).toBeUndefined();
    expect(findRelationshipSpan(tree)).toBeUndefined();
  });

  it('clicking the delete button dispatches deleteCardEdge(edge.id)', () => {
    const { tree, dispatch } = renderCard({ edge: { id: 'edge-xyz' } });
    const btn = findDeleteButton(tree);
    (btn.props as ButtonProps).onClick();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(deleteCardEdge('edge-xyz'));
  });

  it("defaults provider to 'aws' when nodes don't specify one (passed as second arg to getIcon)", () => {
    const getIconMock = vi.mocked(getIcon);
    getIconMock.mockClear();
    const nodes: CardNode[] = [
      makeNode('src', { label: 'Source', iceType: 'compute.ec2' }),
      makeNode('tgt', { label: 'Target', iceType: 'storage.s3' }),
    ];
    renderCard({ nodes });
    // Two calls: source then target. Both must have `'aws'` as the second arg.
    expect(getIconMock).toHaveBeenCalledTimes(2);
    expect(getIconMock).toHaveBeenNthCalledWith(1, 'compute.ec2', 'aws');
    expect(getIconMock).toHaveBeenNthCalledWith(2, 'storage.s3', 'aws');
  });

  it("defaults labels to 'Unknown' when sourceNode/targetNode is undefined", () => {
    // No nodes match the edge endpoints — both lookups return undefined.
    const { tree } = renderCard({
      edge: { source: 'missing-src', target: 'missing-tgt' },
      nodes: [],
    });
    const labels = findLabelSpans(tree);
    expect(labels).toHaveLength(2);
    expect((labels[0].props as SpanProps).children).toBe('Unknown');
    expect((labels[1].props as SpanProps).children).toBe('Unknown');
  });

  it("defaults iceType to '' when not on the node (initial fallback shows '?')", () => {
    // Node exists but has no iceType. With provider='gcp' getIcon returns
    // null, hitting the initial-letter span. ''.split('.').pop() === ''
    // and ''.charAt(0) === '', so the `|| '?'` fallback fires.
    const nodes: CardNode[] = [
      makeNode('src', { label: 'Source', provider: 'gcp' }),
      makeNode('tgt', { label: 'Target', iceType: 'storage.s3', provider: 'aws' }),
    ];
    const { tree } = renderCard({ nodes });
    const initials = findInitialSpans(tree);
    expect(initials).toHaveLength(1);
    expect((initials[0].props as SpanProps).children).toBe('?');
  });

  it('the delete button has the i18n title from t(properties.removeConnection)', () => {
    const { tree } = renderCard();
    const btn = findDeleteButton(tree);
    expect((btn.props as ButtonProps).title).toBe('t:properties.removeConnection');
  });
});
