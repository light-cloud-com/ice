/**
 * Tests for `GroupLod3` — full-detail group renderer with selection
 * ring, label row + fold chevron, optional empty state, and resize handle.
 *
 * Branches:
 *   - outer opacity: invalid-target → 0.3, isDragging → 0.85, else 1.
 *   - SelectionRing rendered iff isSelected.
 *   - DragOverGlow / ChildExitingIndicator overlays gated.
 *   - rect borderColor cascade: childExiting > dragOver > selected/hovered > border.
 *   - rect strokeWidth: 1.5 selected, 1 default.
 *   - rect strokeDasharray: undefined when dragOver, "4 4" otherwise.
 *   - empty state row only when !folded + childCount === 0.
 *   - resize handle only when !folded.
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
    SelectionRing: named('MockSelectionRing'),
    EmptyStateText: named('MockEmptyStateText'),
    FoldButton: named('MockFoldButton'),
    ResizeHandle: named('MockResizeHandle'),
  };
});

vi.mock('../group-label-row', () => ({ GroupLabelRow: mocks.GroupLabelRow }));
vi.mock('../../_shared/drag-over-glow', () => ({ DragOverGlow: mocks.DragOverGlow }));
vi.mock('../../_shared/child-exiting-indicator', () => ({ ChildExitingIndicator: mocks.ChildExitingIndicator }));
vi.mock('../../_shared/selection-ring', () => ({ SelectionRing: mocks.SelectionRing }));
vi.mock('../../_shared/empty-state-text', () => ({ EmptyStateText: mocks.EmptyStateText }));
vi.mock('../../_shared/fold-button', () => ({ FoldButton: mocks.FoldButton }));
vi.mock('../../_shared/resize-handle', () => ({ ResizeHandle: mocks.ResizeHandle }));

import { GroupLod3 } from '../group-lod3';

const MockDragOverGlow = mocks.DragOverGlow;
const MockChildExitingIndicator = mocks.ChildExitingIndicator;
const MockSelectionRing = mocks.SelectionRing;
const MockEmptyStateText = mocks.EmptyStateText;
const MockFoldButton = mocks.FoldButton;
const MockResizeHandle = mocks.ResizeHandle;
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

const renderL3 = (props: Partial<React.ComponentProps<typeof GroupLod3>> = {}): React.ReactElement => {
  const Inner = (
    GroupLod3 as unknown as {
      type: (p: React.ComponentProps<typeof GroupLod3>) => React.ReactElement;
    }
  ).type;
  const defaults: React.ComponentProps<typeof GroupLod3> = {
    nodeId: 'g-1',
    x: 0,
    y: 0,
    nodeWidth: 200,
    nodeHeight: 100,
    displayLabel: 'Group',
    folded: false,
    childCount: 0,
    userColor: undefined,
    groupBorderColor: '#abcdef',
    groupTint: 'rgba(0,0,0,0.05)',
    labelColor: '#fff',
    isSelected: false,
    isHovered: false,
    isDragOver: false,
    isChildExiting: false,
    connectionDragState: null,
    isDragging: false,
    onMouseEnter: () => {},
    onMouseLeave: () => {},
    onToggleFold: () => {},
  };
  return Inner({ ...defaults, ...props });
};

const findRect = (tree: React.ReactElement) => findByType(tree, 'rect')[0];

describe('GroupLod3 — React.memo + displayName', () => {
  it('is wrapped in React.memo with displayName', () => {
    expect(typeof (GroupLod3 as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((GroupLod3 as unknown as { displayName: string }).displayName).toBe('GroupLod3');
  });
});

describe('GroupLod3 — outer <g>', () => {
  it('writes data-node-id from nodeId', () => {
    const tree = renderL3({ nodeId: 'gx' });
    expect((tree.props as { 'data-node-id': string })['data-node-id']).toBe('gx');
  });

  it('opacity 0.3 when invalid-target', () => {
    const tree = renderL3({ connectionDragState: 'invalid-target' });
    expect((tree.props as { style: { opacity: number } }).style.opacity).toBe(0.3);
  });

  it('opacity 0.85 when isDragging (no invalid)', () => {
    const tree = renderL3({ isDragging: true });
    expect((tree.props as { style: { opacity: number } }).style.opacity).toBe(0.85);
  });

  it('opacity 1 default', () => {
    const tree = renderL3({});
    expect((tree.props as { style: { opacity: number } }).style.opacity).toBe(1);
  });

  it('forwards onMouseEnter/onMouseLeave', () => {
    const calls: string[] = [];
    const tree = renderL3({
      onMouseEnter: () => calls.push('e'),
      onMouseLeave: () => calls.push('l'),
    });
    const props = tree.props as { onMouseEnter: () => void; onMouseLeave: () => void };
    props.onMouseEnter();
    props.onMouseLeave();
    expect(calls).toEqual(['e', 'l']);
  });
});

describe('GroupLod3 — overlays', () => {
  it('SelectionRing only when isSelected', () => {
    expect(findByType(renderL3({ isSelected: true }), MockSelectionRing)).toHaveLength(1);
    expect(findByType(renderL3({ isSelected: false }), MockSelectionRing)).toHaveLength(0);
  });

  it('DragOverGlow only when isDragOver', () => {
    expect(findByType(renderL3({ isDragOver: true }), MockDragOverGlow)).toHaveLength(1);
    expect(findByType(renderL3({ isDragOver: false }), MockDragOverGlow)).toHaveLength(0);
  });

  it('ChildExitingIndicator only when isChildExiting', () => {
    expect(findByType(renderL3({ isChildExiting: true }), MockChildExitingIndicator)).toHaveLength(1);
    expect(findByType(renderL3({ isChildExiting: false }), MockChildExitingIndicator)).toHaveLength(0);
  });
});

describe('GroupLod3 — rect border', () => {
  it('orange when childExiting (highest)', () => {
    const r = findRect(renderL3({ isChildExiting: true, isDragOver: true, isSelected: true }));
    expect((r.props as { stroke: string }).stroke).toBe('#f97316');
  });

  it('green when dragOver (no childExiting)', () => {
    const r = findRect(renderL3({ isDragOver: true, isSelected: true }));
    expect((r.props as { stroke: string }).stroke).toBe('#22c55e');
  });

  it('text-secondary var when selected (no dragOver)', () => {
    const r = findRect(renderL3({ isSelected: true }));
    expect((r.props as { stroke: string }).stroke).toBe('var(--ice-text-secondary)');
  });

  it('text-secondary var when hovered (not selected)', () => {
    const r = findRect(renderL3({ isHovered: true }));
    expect((r.props as { stroke: string }).stroke).toBe('var(--ice-text-secondary)');
  });

  it('groupBorderColor default', () => {
    const r = findRect(renderL3({ groupBorderColor: '#deadbe' }));
    expect((r.props as { stroke: string }).stroke).toBe('#deadbe');
  });
});

describe('GroupLod3 — rect stroke / fill', () => {
  it('strokeWidth 1.5 when selected, 1 otherwise', () => {
    expect((findRect(renderL3({ isSelected: true })).props as { strokeWidth: number }).strokeWidth).toBe(1.5);
    expect((findRect(renderL3({})).props as { strokeWidth: number }).strokeWidth).toBe(1);
  });

  it('strokeDasharray "8 4" when dragOver (drop affordance), undefined otherwise — Blender-frame chrome uses a solid border by default', () => {
    expect((findRect(renderL3({ isDragOver: true })).props as { strokeDasharray?: string }).strokeDasharray).toBe(
      '8 4',
    );
    expect((findRect(renderL3({})).props as { strokeDasharray?: string }).strokeDasharray).toBeUndefined();
  });

  it('fill = groupTint', () => {
    const r = findRect(renderL3({ groupTint: 'rgba(1, 2, 3, 0.5)' }));
    expect((r.props as { fill: string }).fill).toBe('rgba(1, 2, 3, 0.5)');
  });
});

describe('GroupLod3 — label + fold + content', () => {
  it('renders GroupLabelRow with displayLabel + childCount', () => {
    const tree = renderL3({ displayLabel: 'My Group', childCount: 5 });
    const lbl = findByType(tree, MockGroupLabelRow)[0];
    const props = lbl.props as { label: string; childCount: number };
    expect(props.label).toBe('My Group');
    expect(props.childCount).toBe(5);
  });

  it('forwards userColor to GroupLabelRow', () => {
    const tree = renderL3({ userColor: '#abc123' });
    const lbl = findByType(tree, MockGroupLabelRow)[0];
    expect((lbl.props as { color?: string }).color).toBe('#abc123');
  });

  it('FoldButton: opacity 0.95 when hovered, 0.6 otherwise (raised from 0.8/0.4 with the tab restyle)', () => {
    expect((findByType(renderL3({ isHovered: true }), MockFoldButton)[0].props as { opacity: number }).opacity).toBe(
      0.95,
    );
    expect((findByType(renderL3({}), MockFoldButton)[0].props as { opacity: number }).opacity).toBe(0.6);
  });

  it('FoldButton onClick = onToggleFold', () => {
    const fold = vi.fn();
    const tree = renderL3({ onToggleFold: fold });
    const btn = findByType(tree, MockFoldButton)[0];
    expect((btn.props as { onClick: () => void }).onClick).toBe(fold);
  });

  it('FoldButton folded={folded}', () => {
    expect((findByType(renderL3({ folded: true }), MockFoldButton)[0].props as { folded: boolean }).folded).toBe(true);
    expect((findByType(renderL3({ folded: false }), MockFoldButton)[0].props as { folded: boolean }).folded).toBe(
      false,
    );
  });

  it('EmptyStateText only when !folded + childCount === 0', () => {
    expect(findByType(renderL3({ folded: false, childCount: 0 }), MockEmptyStateText)).toHaveLength(1);
    expect(findByType(renderL3({ folded: true, childCount: 0 }), MockEmptyStateText)).toHaveLength(0);
    expect(findByType(renderL3({ folded: false, childCount: 1 }), MockEmptyStateText)).toHaveLength(0);
  });

  it('ResizeHandle only when !folded', () => {
    expect(findByType(renderL3({ folded: false }), MockResizeHandle)).toHaveLength(1);
    expect(findByType(renderL3({ folded: true }), MockResizeHandle)).toHaveLength(0);
  });

  it('ResizeHandle isHovered={isHovered}', () => {
    const tree = renderL3({ folded: false, isHovered: true });
    const rh = findByType(tree, MockResizeHandle)[0];
    expect((rh.props as { isHovered: boolean }).isHovered).toBe(true);
  });
});
