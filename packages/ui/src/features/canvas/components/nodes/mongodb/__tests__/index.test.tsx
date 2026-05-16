/**
 * Tests for `SvgMongodbNode` — bespoke renderer using `DocumentPills`
 * (the document-store counterpart to postgres/mysql's `TableStripes`).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const passthrough: React.FC<Record<string, unknown>> = (props) =>
    React.createElement('div', null, (props as { children?: React.ReactNode }).children);
  passthrough.displayName = 'MockCardShell';
  const PillsMock: React.FC<{ color: string }> = () => null;
  PillsMock.displayName = 'MockDocumentPills';
  return { CardShell: passthrough, DocumentPills: PillsMock };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
  DocumentPills: mocks.DocumentPills,
}));

vi.mock('lucide-react', () => ({
  Database: ((_props: Record<string, unknown>) => null) as React.FC,
}));

import { SvgMongodbNode, computeMongodbHeight, DB_BODY_HEIGHT, DB_HEADER_HEIGHT, DB_PADDING } from '..';
import { CARD_FOOTER_HEIGHT } from '@ice/constants';
import type { CanvasNode } from '../../../svg-canvas';

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
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && el.type === type) out.push(el);
  return out;
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'mongo-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'events-store',
  data: { iceType: 'Database.MongoDB' },
  ...overrides,
});

const renderInner = (
  props: Partial<React.ComponentProps<typeof SvgMongodbNode>> = {},
): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgMongodbNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgMongodbNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeMongodbHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected = DB_HEADER_HEIGHT + DB_PADDING + DB_BODY_HEIGHT + DB_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeMongodbHeight()).toBe(expected);
  });
});

describe('SvgMongodbNode', () => {
  it('exposes the displayName', () => {
    expect(SvgMongodbNode.displayName).toBe('SvgMongodbNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('uses node.label as title', () => {
    const tree = renderInner({ node: makeNode({ label: 'analytics-docs' }) });
    expect((tree.props as { title: string }).title).toBe('analytics-docs');
  });

  it('falls back to "MongoDB" title when label empty', () => {
    const tree = renderInner({ node: makeNode({ label: '' }) });
    expect((tree.props as { title: string }).title).toBe('MongoDB');
  });

  it('renders DocumentPills (NOT TableStripes) in the body slot', () => {
    const tree = renderInner();
    const pills = findByType(tree, mocks.DocumentPills);
    expect(pills).toHaveLength(1);
  });

  it('passes the mongodb green accent to DocumentPills', () => {
    const tree = renderInner();
    const pills = findByType(tree, mocks.DocumentPills)[0];
    expect((pills.props as { color: string }).color).toBe('#10b981');
  });

  it('builds liveConfig from version + storage + production + shards', () => {
    const tree = renderInner({
      node: makeNode({
        data: {
          iceType: 'Database.MongoDB',
          version: '7.0',
          storage: '80',
          production: true,
          shards: 3,
        },
      }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('MongoDB 7.0 · 80 GB · HA · 3 shards');
  });

  it('omits HA when production is false', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.MongoDB', version: '6.0', storage: '40' } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('MongoDB 6.0 · 40 GB');
  });

  it('falls back to the legacy storageGb field', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.MongoDB', version: '7.0', storageGb: 40 } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('MongoDB 7.0 · 40 GB');
  });

  it('falls back to bare "MongoDB" when data empty', () => {
    const tree = renderInner({ node: makeNode({ data: { iceType: 'Database.MongoDB' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('MongoDB');
  });
});
