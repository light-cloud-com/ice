/**
 * Tests for `GroupLod1` — minimal-detail group renderer.
 *
 * Branches:
 *   - rect borderColor: dragOver > childExiting > groupColor > var.
 *   - rect strokeWidth: 2 when dragOver/childExiting, else 1.5 (× invZoom).
 *   - rect strokeDasharray: undefined when dragOver, else dashed.
 *   - rect opacity: 1 when dragOver/childExiting, else 0.7.
 *   - DragOverGlow + ChildExitingIndicator overlays gated.
 *   - label foreignObject only rendered when label set.
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

import { GroupLod1 } from '../group-lod1';

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
function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

const renderL1 = (props: Partial<React.ComponentProps<typeof GroupLod1>> = {}): React.ReactElement => {
  const Inner = (
    GroupLod1 as unknown as {
      type: (p: React.ComponentProps<typeof GroupLod1>) => React.ReactElement;
    }
  ).type;
  const defaults: React.ComponentProps<typeof GroupLod1> = {
    nodeId: 'g-1',
    x: 0,
    y: 0,
    nodeWidth: 200,
    nodeHeight: 100,
    label: '',
    displayLabel: '',
    groupColor: '',
    groupOpacity: undefined,
    isDragOver: false,
    isChildExiting: false,
    invZoom: 1,
  };
  return Inner({ ...defaults, ...props });
};

const findRect = (tree: React.ReactElement): React.ReactElement => findByType(tree, 'rect')[0];

describe('GroupLod1 — React.memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    expect(typeof (GroupLod1 as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((GroupLod1 as unknown as { displayName: string }).displayName).toBe('GroupLod1');
  });
});

describe('GroupLod1 — outer <g>', () => {
  it('writes data-node-id from nodeId', () => {
    const tree = renderL1({ nodeId: 'gx' });
    expect((tree.props as { 'data-node-id': string })['data-node-id']).toBe('gx');
  });

  it('cursor: move on outer <g>', () => {
    const tree = renderL1();
    expect((tree.props as { style: { cursor: string } }).style.cursor).toBe('move');
  });
});

describe('GroupLod1 — overlays', () => {
  it('renders DragOverGlow when isDragOver', () => {
    expect(findByType(renderL1({ isDragOver: true }), MockDragOverGlow)).toHaveLength(1);
  });

  it('omits DragOverGlow otherwise', () => {
    expect(findByType(renderL1({ isDragOver: false }), MockDragOverGlow)).toHaveLength(0);
  });

  it('renders ChildExitingIndicator when isChildExiting', () => {
    expect(findByType(renderL1({ isChildExiting: true }), MockChildExitingIndicator)).toHaveLength(1);
  });
});

describe('GroupLod1 — rect colour', () => {
  it('borderColor: green when dragOver', () => {
    const r = findRect(renderL1({ isDragOver: true }));
    expect((r.props as { stroke: string }).stroke).toBe('#22c55e');
  });

  it('borderColor: orange when childExiting (no dragOver)', () => {
    const r = findRect(renderL1({ isChildExiting: true }));
    expect((r.props as { stroke: string }).stroke).toBe('#f97316');
  });

  it('borderColor: groupColor when set (no dragOver/childExiting)', () => {
    const r = findRect(renderL1({ groupColor: '#abcdef' }));
    expect((r.props as { stroke: string }).stroke).toBe('#abcdef');
  });

  it('borderColor: var fallback when no groupColor', () => {
    const r = findRect(renderL1({}));
    expect((r.props as { stroke: string }).stroke).toBe('var(--ice-border)');
  });

  it('fill: hexToTint(groupColor) when set, with default 0.12 alpha', () => {
    const r = findRect(renderL1({ groupColor: '#3b82f6' }));
    expect((r.props as { fill: string }).fill).toBe('rgba(59, 130, 246, 0.12)');
  });

  it('fill: hexToTint(groupColor, groupOpacity) when both set', () => {
    const r = findRect(renderL1({ groupColor: '#3b82f6', groupOpacity: 0.5 }));
    expect((r.props as { fill: string }).fill).toBe('rgba(59, 130, 246, 0.5)');
  });

  it('fill: rgba(15,23,42,0.15) when no groupColor', () => {
    const r = findRect(renderL1({}));
    expect((r.props as { fill: string }).fill).toBe('rgba(15, 23, 42, 0.15)');
  });
});

describe('GroupLod1 — rect stroke / opacity', () => {
  it('strokeWidth = 2 * invZoom when dragOver', () => {
    const r = findRect(renderL1({ isDragOver: true, invZoom: 0.5 }));
    expect((r.props as { strokeWidth: number }).strokeWidth).toBe(1);
  });

  it('strokeWidth = 2 * invZoom when childExiting', () => {
    const r = findRect(renderL1({ isChildExiting: true, invZoom: 1 }));
    expect((r.props as { strokeWidth: number }).strokeWidth).toBe(2);
  });

  it('strokeWidth = 1.5 * invZoom default', () => {
    const r = findRect(renderL1({ invZoom: 2 }));
    expect((r.props as { strokeWidth: number }).strokeWidth).toBe(3);
  });

  it('strokeDasharray: undefined when dragOver', () => {
    const r = findRect(renderL1({ isDragOver: true }));
    expect((r.props as { strokeDasharray?: string }).strokeDasharray).toBeUndefined();
  });

  it('strokeDasharray: dashed when not dragOver', () => {
    const r = findRect(renderL1({ invZoom: 1 }));
    expect((r.props as { strokeDasharray: string }).strokeDasharray).toBe('6 3');
  });

  it('strokeDasharray scales with invZoom', () => {
    const r = findRect(renderL1({ invZoom: 2 }));
    expect((r.props as { strokeDasharray: string }).strokeDasharray).toBe('12 6');
  });

  it('opacity 1 when dragOver/childExiting, 0.7 otherwise', () => {
    expect((findRect(renderL1({ isDragOver: true })).props as { opacity: number }).opacity).toBe(1);
    expect((findRect(renderL1({ isChildExiting: true })).props as { opacity: number }).opacity).toBe(1);
    expect((findRect(renderL1({})).props as { opacity: number }).opacity).toBe(0.7);
  });
});

describe('GroupLod1 — label foreignObject', () => {
  it('renders label foreignObject + GroupLabelRow when label set', () => {
    const tree = renderL1({ label: 'My Group', displayLabel: 'My Group' });
    const labels = findByType(tree, MockGroupLabelRow);
    expect(labels).toHaveLength(1);
    expect((labels[0].props as { label: string }).label).toBe('My Group');
  });

  it('omits label foreignObject when label empty', () => {
    const tree = renderL1({ label: '' });
    expect(findByType(tree, MockGroupLabelRow)).toHaveLength(0);
  });

  it('forwards groupColor as the label color when set, undefined otherwise', () => {
    const colored = renderL1({ label: 'X', displayLabel: 'X', groupColor: '#3b82f6' });
    const blank = renderL1({ label: 'X', displayLabel: 'X' });
    const colorProp = (findByType(colored, MockGroupLabelRow)[0].props as { color?: string }).color;
    const noColor = (findByType(blank, MockGroupLabelRow)[0].props as { color?: string }).color;
    expect(colorProp).toBe('#3b82f6');
    expect(noColor).toBeUndefined();
  });
});
