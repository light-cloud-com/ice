/**
 * Tests for `SvgPostgresNode` — bespoke renderer with engine/version/
 * storage identity body and hardening badges.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const passthrough: React.FC<Record<string, unknown>> = (props) =>
    React.createElement('div', null, (props as { children?: React.ReactNode }).children);
  passthrough.displayName = 'MockCardShell';
  return { CardShell: passthrough };
});

vi.mock('../../_shared', () => ({
  CardShell: mocks.CardShell,
}));

vi.mock('lucide-react', () => ({
  Database: ((_props: Record<string, unknown>) => null) as React.FC,
}));

import { SvgPostgresNode, computePostgresHeight, DB_BODY_HEIGHT, DB_HEADER_HEIGHT, DB_PADDING } from '..';
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
function findByTestId(tree: React.ReactNode, id: string): React.ReactElement | undefined {
  for (const el of walk(tree)) {
    if ((el.props as { 'data-testid'?: string })['data-testid'] === id) return el;
  }
  return undefined;
}
function findTextEqual(tree: React.ReactNode, value: string): React.ReactElement | undefined {
  for (const el of walk(tree)) {
    const c = (el.props as { children?: unknown }).children;
    if (c === value) return el;
    if (Array.isArray(c) && c.some((x) => x === value)) return el;
  }
  return undefined;
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'pg-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  label: 'main-db',
  data: { iceType: 'Database.PostgreSQL' },
  ...overrides,
});

const renderInner = (
  props: Partial<React.ComponentProps<typeof SvgPostgresNode>> = {},
): React.ReactElement => {
  const defaults: React.ComponentProps<typeof SvgPostgresNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return SvgPostgresNode({ ...defaults, ...props }) as React.ReactElement;
};

describe('computePostgresHeight', () => {
  it('sums header + padding*2 + body + footer', () => {
    const expected = DB_HEADER_HEIGHT + DB_PADDING + DB_BODY_HEIGHT + DB_PADDING + CARD_FOOTER_HEIGHT;
    expect(computePostgresHeight()).toBe(expected);
  });

  it('re-exports the layout constants', () => {
    expect(DB_HEADER_HEIGHT).toBe(48);
    expect(DB_BODY_HEIGHT).toBe(60);
    expect(DB_PADDING).toBe(12);
  });
});

describe('SvgPostgresNode', () => {
  it('exposes the displayName', () => {
    expect(SvgPostgresNode.displayName).toBe('SvgPostgresNode');
  });

  it('renders a CardShell wrapper', () => {
    const tree = renderInner();
    expect(tree.type).toBe(mocks.CardShell);
  });

  it('uses node.label as title', () => {
    const tree = renderInner({ node: makeNode({ label: 'orders-db' }) });
    expect((tree.props as { title: string }).title).toBe('orders-db');
  });

  it('falls back to "Postgres" title when label empty', () => {
    const tree = renderInner({ node: makeNode({ label: '' }) });
    expect((tree.props as { title: string }).title).toBe('Postgres');
  });

  it('renders the engine + version big in the body (no decorative stripes)', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', version: '16' } }),
    });
    expect(findByTestId(tree, 'pg-body-pg-1')).toBeDefined();
    expect(findTextEqual(tree, 'PostgreSQL 16')).toBeDefined();
  });

  it('renders the storage callout in the body', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', version: '16', storage: '100' } }),
    });
    expect(findTextEqual(tree, '100 GB')).toBeDefined();
  });

  it('shows the HA badge when production is true', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', version: '16', production: true } }),
    });
    expect(findTextEqual(tree, 'HA')).toBeDefined();
  });

  it('shows the backup-retention badge when set', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', version: '16', backup_retention: 7 } }),
    });
    expect(findTextEqual(tree, '7d backups')).toBeDefined();
  });

  it('shows no badges when neither production nor backup_retention is set', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', version: '16' } }),
    });
    expect(findTextEqual(tree, 'HA')).toBeUndefined();
    expect(findTextEqual(tree, '7d backups')).toBeUndefined();
  });

  it('builds liveConfig from version + storage + production + backup_retention', () => {
    const tree = renderInner({
      node: makeNode({
        data: {
          iceType: 'Database.PostgreSQL',
          version: '16',
          storage: '100',
          production: true,
          backup_retention: 7,
        },
      }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('PostgreSQL 16 · 100 GB · HA · 7d backups');
  });

  it('omits HA when production is false', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', version: '15', storage: '20' } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('PostgreSQL 15 · 20 GB');
  });

  it('formats large storage values as TB', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', version: '16', storage: '2000' } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('PostgreSQL 16 · 2 TB');
  });

  it('treats the "custom" sentinel as no storage', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', version: '17', storage: 'custom' } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('PostgreSQL 17');
  });

  it('falls back to the legacy storageGb field when storage is missing', () => {
    const tree = renderInner({
      node: makeNode({ data: { iceType: 'Database.PostgreSQL', version: '16', storageGb: 50 } }),
    });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('PostgreSQL 16 · 50 GB');
  });

  it('falls back to bare "PostgreSQL" when data is empty', () => {
    const tree = renderInner({ node: makeNode({ data: { iceType: 'Database.PostgreSQL' } }) });
    expect((tree.props as { liveConfig: string }).liveConfig).toBe('PostgreSQL');
  });
});
