/**
 * Tests for `inline-table-view/table-body.tsx` (rf-itab-2).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { TableBody, type RowGroup, type TableBodyProps } from '../table-body';
import type { TableRowData } from '../../inline-table-view-row';

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  // Skip recursing into FC: InlineTableRow is opaque; we just want to count its instances
  if (typeof el.type === 'function') {
    return;
  }
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function makeRow(id: string, label = id): TableRowData {
  return {
    node: { id, type: 'gcp.run.service', data: {} } as any,
    label,
    typeLabel: 'Run service',
    iceType: 'gcp.run.service',
    provider: 'gcp',
    status: 'live',
    endpoints: [],
    providerId: id,
    region: 'us-central1',
    updatedAt: undefined,
    isChild: false,
  };
}

function makeProps(overrides: Partial<TableBodyProps> = {}): TableBodyProps {
  const sorted: TableRowData[] = [];
  return {
    sorted,
    rows: sorted,
    grouped: [{ key: '_all', label: '', rows: sorted }],
    density: 'comfortable',
    groupBy: 'none',
    selectedNodes: [],
    expanded: new Set(),
    onToggleExpand: vi.fn(),
    onSelectRow: vi.fn(),
    onCopyId: vi.fn(),
    onCopyName: vi.fn(),
    onRevealOnCanvas: vi.fn(),
    onOpenProperties: vi.fn(),
    onDeleteRow: vi.fn(),
    ...overrides,
  };
}

function render(props: Partial<TableBodyProps>): React.ReactNode {
  return (TableBody as unknown as (p: TableBodyProps) => React.ReactNode)(makeProps(props));
}

describe('inline-table-view/table-body', () => {
  it('renders the noResources empty state when rows is empty', () => {
    const tree = render({});
    let foundNoResources = false;
    for (const el of walk(tree)) {
      const c = (el.props as any)?.children;
      if (typeof c === 'string' && c === 'table.noResources') foundNoResources = true;
    }
    expect(foundNoResources).toBe(true);
  });

  it('renders the noResults empty state when rows.length > 0 but sorted is empty (filtered out)', () => {
    const row = makeRow('r1');
    const tree = render({ rows: [row], sorted: [] });
    let foundNoResults = false;
    for (const el of walk(tree)) {
      const c = (el.props as any)?.children;
      if (typeof c === 'string' && c === 'table.empty.noResults') foundNoResults = true;
    }
    expect(foundNoResults).toBe(true);
  });

  it('does NOT render group headers when groupBy === none', () => {
    const r1 = makeRow('r1');
    const tree = render({
      rows: [r1],
      sorted: [r1],
      grouped: [{ key: '_all', label: '', rows: [r1] }],
      groupBy: 'none',
    });
    // Group header div has class containing "sticky" and a label span.
    let groupHeaders = 0;
    for (const el of walk(tree)) {
      if (
        el.type === 'div' &&
        typeof (el.props as any).className === 'string' &&
        ((el.props as any).className as string).includes('sticky top-0')
      ) {
        groupHeaders++;
      }
    }
    expect(groupHeaders).toBe(0);
  });

  it('renders group headers when groupBy !== none', () => {
    const r1 = makeRow('r1');
    const r2 = makeRow('r2');
    const tree = render({
      rows: [r1, r2],
      sorted: [r1, r2],
      grouped: [
        { key: 'live', label: 'Live', rows: [r1] },
        { key: 'failed', label: 'Failed', rows: [r2] },
      ] as RowGroup[],
      groupBy: 'status',
    });
    let groupHeaders = 0;
    for (const el of walk(tree)) {
      if (
        el.type === 'div' &&
        typeof (el.props as any).className === 'string' &&
        ((el.props as any).className as string).includes('sticky top-0')
      ) {
        groupHeaders++;
      }
    }
    expect(groupHeaders).toBe(2);
  });

  it('renders one InlineTableRow per row', () => {
    const r1 = makeRow('r1');
    const r2 = makeRow('r2');
    const tree = render({
      rows: [r1, r2],
      sorted: [r1, r2],
      grouped: [{ key: '_all', label: '', rows: [r1, r2] }],
    });
    let rowCount = 0;
    for (const el of walk(tree)) {
      // InlineTableRow is a function (component) — we stop recursing into FCs
      if (typeof el.type === 'function' && (el.type as any).name?.includes('InlineTableRow')) {
        rowCount++;
      }
    }
    // Walker stops descending at FCs but yields them, so we should see two
    expect(rowCount).toBe(2);
  });
});
