/**
 * Tests for `SvgMysqlNode` — bespoke renderer sharing the relational
 * `TableStripes` body with postgres but using the cyan dolphin accent.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const passthrough: React.FC<Record<string, unknown>> = (props) =>
    React.createElement('div', null, (props as { children?: React.ReactNode }).children);
  passthrough.displayName = 'MockCardShell';
  const StripesMock: React.FC<{ color: string }> = () => null;
  StripesMock.displayName = 'MockTableStripes';
  return { CardShell: passthrough, TableStripes: StripesMock };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
  TableStripes: mocks.TableStripes,
}));

vi.mock('lucide-react', () => ({
  Database: ((_props: Record<string, unknown>) => null) as React.FC,
}));

import { SvgMysqlNode, computeMysqlHeight, DB_BODY_HEIGHT, DB_HEADER_HEIGHT, DB_PADDING } from '..';
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
  id: 'mysql-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'legacy-db',
  data: { iceType: 'Database.MySQL' },
  ...overrides,
});

const renderInner = (
  props: Partial<React.ComponentProps<typeof SvgMysqlNode>> = {},
): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgMysqlNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgMysqlNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computeMysqlHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected = DB_HEADER_HEIGHT + DB_PADDING + DB_BODY_HEIGHT + DB_PADDING + CARD_FOOTER_HEIGHT;
    expect(computeMysqlHeight()).toBe(expected);
  });
});

describe('SvgMysqlNode', () => {
  it('exposes the displayName', () => {
    expect(SvgMysqlNode.displayName).toBe('SvgMysqlNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('uses node.label as title', () => {
    const tree = renderInner({ node: makeNode({ label: 'users-db' }) });
    expect((tree.props as { title: string }).title).toBe('users-db');
  });

  it('falls back to "MySQL" title when label empty', () => {
    const tree = renderInner({ node: makeNode({ label: '' }) });
    expect((tree.props as { title: string }).title).toBe('MySQL');
  });

  it('renders TableStripes in the body slot', () => {
    const tree = renderInner();
    const stripes = findByType(tree, mocks.TableStripes);
    expect(stripes).toHaveLength(1);
  });

  it('passes the mysql cyan accent to TableStripes', () => {
    const tree = renderInner();
    const stripes = findByType(tree, mocks.TableStripes)[0];
    expect((stripes.props as { color: string }).color).toBe('#06b6d4');
  });

  it('uses a different accent from postgres', () => {
    const tree = renderInner();
    expect((tree.props as { accentColor: string }).accentColor).toBe('#06b6d4');
  });

  it('builds liveConfig from version + storage + production + backup_retention', () => {
    const tree = renderInner({
      node: makeNode({
        data: {
          iceType: 'Database.MySQL',
          version: '8.0',
          storage: '50',
          production: true,
          backup_retention: 7,
        },
      }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('MySQL 8.0 · 50 GB · HA · 7d backups');
  });

  it('treats legacy `backups: true` as the production flag', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.MySQL', version: '8.0', storage: '20', backups: true } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('MySQL 8.0 · 20 GB · HA');
  });

  it('falls back to the legacy storageGb field', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.MySQL', version: '8.0', storageGb: 50 } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('MySQL 8.0 · 50 GB');
  });

  it('falls back to bare "MySQL" when data empty', () => {
    const tree = renderInner({ node: makeNode({ data: { iceType: 'Database.MySQL' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('MySQL');
  });
});
