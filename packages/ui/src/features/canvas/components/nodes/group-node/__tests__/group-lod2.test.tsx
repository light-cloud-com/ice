/**
 * Tests for `GroupLod2` — mid-detail group renderer with the dashed
 * border + always-visible label row.
 *
 * Branches:
 *   - displayLabel truncation at 20 chars + ellipsis.
 *   - borderColor cascade: dragOver > childExiting > selected > groupColor > default.
 *   - strokeWidth: 2 (dragOver/childExiting) > 1.5 (selected) > 1 default.
 *   - fill alpha: 0.09 default, groupOpacity override.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const named = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    GroupLabelRow: named('MockGroupLabelRow'),
    DragOverGlow: named('MockDragOverGlow'),
    ChildExitingIndicator: named('MockChildExitingIndicator'),
  };
});

vi.mock('../group-label-row', () => ({ GroupLabelRow: mocks.GroupLabelRow }));
vi.mock('../../_shared/drag-over-glow', () => ({ DragOverGlow: mocks.DragOverGlow }));
vi.mock('../../_shared/child-exiting-indicator', () => ({ ChildExitingIndicator: mocks.ChildExitingIndicator }));

import { GroupLod2 } from '../group-lod2';

const MockDragOverGlow = mocks.DragOverGlow;
const MockChildExitingIndicator = mocks.ChildExitingIndicator;
const MockGroupLabelRow = mocks.GroupLabelRow;

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
function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

const renderL2 = (
  props: Partial<React.ComponentProps<typeof GroupLod2>> = {},
): React.ReactElement => {
  const Inner = (GroupLod2 as unknown as {
    type: (p: React.ComponentProps<typeof GroupLod2>) => React.ReactElement;
  }).type;
  const defaults: React.ComponentProps<typeof GroupLod2> = {
    nodeId: 'g-1',
    x: 0,
    y: 0,
    nodeWidth: 200,
    nodeHeight: 100,
    label: '',
    groupColor: '',
    groupOpacity: undefined,
    isSelected: false,
    isDragOver: false,
    isChildExiting: false,
    invZoom: 1,
  };
  return Inner({ ...defaults, ...props });
};

const findRect = (tree: React.ReactElement) => findByType(tree, 'rect')[0];

describe('GroupLod2 — React.memo + displayName', () => {
  it('is wrapped in React.memo with displayName', () => {
    expect(typeof (GroupLod2 as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((GroupLod2 as unknown as { displayName: string }).displayName).toBe('GroupLod2');
  });
});

describe('GroupLod2 — outer <g> attributes', () => {
  it('writes data-node-id from nodeId', () => {
    const tree = renderL2({ nodeId: 'gx' });
    expect((tree.props as { 'data-node-id': string })['data-node-id']).toBe('gx');
  });
});

describe('GroupLod2 — overlays', () => {
  it('renders DragOverGlow when isDragOver', () => {
    expect(findByType(renderL2({ isDragOver: true }), MockDragOverGlow)).toHaveLength(1);
  });

  it('renders ChildExitingIndicator when isChildExiting', () => {
    expect(findByType(renderL2({ isChildExiting: true }), MockChildExitingIndicator)).toHaveLength(1);
  });
});

describe('GroupLod2 — displayLabel', () => {
  it('truncates at 20 chars + ellipsis when too long', () => {
    const tree = renderL2({ label: 'a'.repeat(30) });
    const lbl = findByType(tree, MockGroupLabelRow)[0];
    const text = (lbl.props as { label: string }).label;
    expect(text.length).toBe(21);
    expect(text.endsWith('…')).toBe(true);
  });

  it('returns label as-is when ≤ 20 chars', () => {
    const tree = renderL2({ label: 'short' });
    const lbl = findByType(tree, MockGroupLabelRow)[0];
    expect((lbl.props as { label: string }).label).toBe('short');
  });

  it('renders empty string when label undefined', () => {
    const tree = renderL2({ label: undefined as unknown as string });
    const lbl = findByType(tree, MockGroupLabelRow)[0];
    expect((lbl.props as { label: string }).label).toBe('');
  });
});

describe('GroupLod2 — border colour cascade', () => {
  it('green when dragOver (highest priority)', () => {
    const r = findRect(renderL2({ isDragOver: true, isSelected: true, groupColor: '#abcdef' }));
    expect((r.props as { stroke: string }).stroke).toBe('#22c55e');
  });

  it('orange when childExiting (no dragOver)', () => {
    const r = findRect(renderL2({ isChildExiting: true }));
    expect((r.props as { stroke: string }).stroke).toBe('#f97316');
  });

  it('groupColor or var(--ice-border-strong) when isSelected', () => {
    const withColor = findRect(renderL2({ isSelected: true, groupColor: '#abc123' }));
    const noColor = findRect(renderL2({ isSelected: true }));
    expect((withColor.props as { stroke: string }).stroke).toBe('#abc123');
    expect((noColor.props as { stroke: string }).stroke).toBe('var(--ice-border-strong)');
  });

  it('groupColor or var(--ice-border) when not selected', () => {
    const withColor = findRect(renderL2({ groupColor: '#abc123' }));
    const noColor = findRect(renderL2({}));
    expect((withColor.props as { stroke: string }).stroke).toBe('#abc123');
    expect((noColor.props as { stroke: string }).stroke).toBe('var(--ice-border)');
  });
});

describe('GroupLod2 — fill', () => {
  it('hexToTint with default 0.09 alpha when groupColor set', () => {
    const r = findRect(renderL2({ groupColor: '#3b82f6' }));
    expect((r.props as { fill: string }).fill).toBe('rgba(59, 130, 246, 0.09)');
  });

  it('hexToTint with groupOpacity override', () => {
    const r = findRect(renderL2({ groupColor: '#3b82f6', groupOpacity: 0.4 }));
    expect((r.props as { fill: string }).fill).toBe('rgba(59, 130, 246, 0.4)');
  });

  it('rgba(15,23,42,0.10) fallback when no groupColor', () => {
    const r = findRect(renderL2({}));
    expect((r.props as { fill: string }).fill).toBe('rgba(15, 23, 42, 0.10)');
  });
});

describe('GroupLod2 — strokeWidth & dasharray', () => {
  it('strokeWidth 2 when dragOver', () => {
    const r = findRect(renderL2({ isDragOver: true, invZoom: 1 }));
    expect((r.props as { strokeWidth: number }).strokeWidth).toBe(2);
  });

  it('strokeWidth 2 when childExiting', () => {
    const r = findRect(renderL2({ isChildExiting: true, invZoom: 1 }));
    expect((r.props as { strokeWidth: number }).strokeWidth).toBe(2);
  });

  it('strokeWidth 1.5 when selected', () => {
    const r = findRect(renderL2({ isSelected: true, invZoom: 1 }));
    expect((r.props as { strokeWidth: number }).strokeWidth).toBe(1.5);
  });

  it('strokeWidth 1 default', () => {
    const r = findRect(renderL2({ invZoom: 1 }));
    expect((r.props as { strokeWidth: number }).strokeWidth).toBe(1);
  });

  it('strokeDasharray undefined when dragOver, dashed otherwise', () => {
    expect((findRect(renderL2({ isDragOver: true })).props as { strokeDasharray?: string }).strokeDasharray).toBeUndefined();
    expect((findRect(renderL2({ invZoom: 1 })).props as { strokeDasharray: string }).strokeDasharray).toBe('6 3');
  });
});
