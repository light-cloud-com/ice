/**
 * Tests for `BlockNode` — the LOD-3 sub-renderer used when group-node
 * dispatches with isBlock=true. Renders a foreignObject card with header
 * (icon + title + child count + concept-info + fold button) and a body
 * with optional empty state, cost label, resize handle.
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
    ConceptInfoTrigger: named('MockConceptInfoTrigger'),
    ChildExitingIndicator: named('MockChildExitingIndicator'),
    CostLabel: named('MockCostLabel'),
    DragOverGlow: named('MockDragOverGlow'),
    EmptyStateText: named('MockEmptyStateText'),
    FoldButton: named('MockFoldButton'),
    ResizeHandle: named('MockResizeHandle'),
  };
});

vi.mock('../../../../../concept-info', () => ({ ConceptInfoTrigger: mocks.ConceptInfoTrigger }));
vi.mock('../../_shared/child-exiting-indicator', () => ({ ChildExitingIndicator: mocks.ChildExitingIndicator }));
vi.mock('../../_shared/cost-label', () => ({ CostLabel: mocks.CostLabel }));
vi.mock('../../_shared/drag-over-glow', () => ({ DragOverGlow: mocks.DragOverGlow }));
vi.mock('../../_shared/empty-state-text', () => ({ EmptyStateText: mocks.EmptyStateText }));
vi.mock('../../_shared/fold-button', () => ({ FoldButton: mocks.FoldButton }));
vi.mock('../../_shared/resize-handle', () => ({ ResizeHandle: mocks.ResizeHandle }));

import { BlockNode } from '../block-node';
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
function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
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
  return parts.join('');
}

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'b-1',
  type: 'block',
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  label: 'Block',
  data: {},
  ...overrides,
});

const renderBN = (
  props: Partial<React.ComponentProps<typeof BlockNode>> = {},
): React.ReactElement => {
  const Inner = (BlockNode as unknown as {
    type: (p: React.ComponentProps<typeof BlockNode>) => React.ReactElement;
  }).type;
  const defaults: React.ComponentProps<typeof BlockNode> = {
    node: makeNode(),
    x: 0,
    y: 0,
    nodeWidth: 300,
    nodeHeight: 200,
    displayLabel: 'Block',
    folded: false,
    childCount: 0,
    accentColor: '#3b82f6',
    blockIcon: null,
    isSelected: false,
    isHovered: false,
    isDragOver: false,
    isDragging: false,
    isChildExiting: false,
    onMouseEnter: () => {},
    onMouseLeave: () => {},
    onToggleFold: () => {},
  };
  return Inner({ ...defaults, ...props });
};

describe('BlockNode — memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    expect(typeof (BlockNode as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
  });
  it('carries displayName "BlockNode"', () => {
    expect((BlockNode as unknown as { displayName: string }).displayName).toBe('BlockNode');
  });
});

describe('BlockNode — outer <g> attributes', () => {
  it('writes data-node-id and data-ice-type from node', () => {
    const tree = renderBN({ node: makeNode({ id: 'b-7', data: { iceType: 'Compute.BackendAPI' } }) });
    const props = tree.props as { 'data-node-id': string; 'data-ice-type': string };
    expect(props['data-node-id']).toBe('b-7');
    expect(props['data-ice-type']).toBe('Compute.BackendAPI');
  });

  it('writes empty data-ice-type when iceType absent', () => {
    const tree = renderBN({ node: makeNode({ data: {} }) });
    expect((tree.props as { 'data-ice-type': string })['data-ice-type']).toBe('');
  });

  it('outer opacity reflects isDragging', () => {
    const tree = renderBN({ isDragging: true });
    expect((tree.props as { style: { opacity: number } }).style.opacity).toBe(0.85);
  });

  it('outer opacity is 1 when not dragging', () => {
    const tree = renderBN({});
    expect((tree.props as { style: { opacity: number } }).style.opacity).toBe(1);
  });

  it('outer onMouseEnter/onMouseLeave forward to props', () => {
    const enter = vi.fn();
    const leave = vi.fn();
    const tree = renderBN({ onMouseEnter: enter, onMouseLeave: leave });
    const p = tree.props as { onMouseEnter: () => void; onMouseLeave: () => void };
    p.onMouseEnter();
    p.onMouseLeave();
    expect(enter).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledTimes(1);
  });
});

describe('BlockNode — overlays', () => {
  it('renders DragOverGlow only when isDragOver', () => {
    expect(findByType(renderBN({ isDragOver: true }), mocks.DragOverGlow)).toHaveLength(1);
    expect(findByType(renderBN({}), mocks.DragOverGlow)).toHaveLength(0);
  });

  it('renders ChildExitingIndicator only when isChildExiting', () => {
    expect(findByType(renderBN({ isChildExiting: true }), mocks.ChildExitingIndicator)).toHaveLength(1);
    expect(findByType(renderBN({}), mocks.ChildExitingIndicator)).toHaveLength(0);
  });
});

describe('BlockNode — card border/shadow', () => {
  const findCard = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { boxSizing?: string } }).style;
      return style?.boxSizing === 'border-box';
    })[0];

  it('orange border when isChildExiting', () => {
    const card = findCard(renderBN({ isChildExiting: true }))!;
    const border = (card.props as { style: { border: string } }).style.border;
    expect(border).toContain('#f97316');
  });

  it('green border when isDragOver (no childExiting)', () => {
    const card = findCard(renderBN({ isDragOver: true }))!;
    const border = (card.props as { style: { border: string } }).style.border;
    expect(border).toContain('#22c55e');
  });

  it('accent border when selected/hovered (no overrides)', () => {
    const card = findCard(renderBN({ isSelected: true, accentColor: '#abcdef' }))!;
    expect((card.props as { style: { border: string } }).style.border).toBe('1px solid #abcdef');
  });

  it('accent + 55 (faded) by default', () => {
    const card = findCard(renderBN({ accentColor: '#abcdef' }))!;
    expect((card.props as { style: { border: string } }).style.border).toBe('1px solid #abcdef55');
  });

  it('selected shadow: glow with accent', () => {
    const card = findCard(renderBN({ isSelected: true, accentColor: '#abcdef' }))!;
    const shadow = (card.props as { style: { boxShadow: string } }).style.boxShadow;
    expect(shadow).toContain('#abcdef');
    expect(shadow).toContain('1.5px');
  });

  it('hover shadow when hovered (not selected)', () => {
    const card = findCard(renderBN({ isHovered: true }))!;
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toBe('0 2px 8px -2px rgba(0,0,0,0.15)');
  });

  it('resting shadow otherwise', () => {
    const card = findCard(renderBN({}))!;
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toBe('0 1px 3px rgba(0,0,0,0.06)');
  });
});

describe('BlockNode — header', () => {
  it('renders the displayLabel inside the header', () => {
    const tree = renderBN({ displayLabel: 'MY-BLOCK' });
    expect(collectText(tree)).toContain('MY-BLOCK');
  });

  it('renders blockIcon img when provided', () => {
    const tree = renderBN({ blockIcon: { icon: 'data:img', label: 'L', color: '#000' } });
    const imgs = findByType(tree, 'img');
    expect(imgs).toHaveLength(1);
    expect((imgs[0].props as { src: string }).src).toBe('data:img');
  });

  it('omits img when blockIcon is null', () => {
    const tree = renderBN({ blockIcon: null });
    expect(findByType(tree, 'img')).toHaveLength(0);
  });

  it('renders childCount when > 0', () => {
    const tree = renderBN({ childCount: 5 });
    expect(collectText(tree)).toContain('5');
  });

  it('does NOT render childCount when 0', () => {
    const tree = renderBN({ childCount: 0, displayLabel: 'X' });
    // Look for a span that's exactly the count.
    const countSpan = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const c = (el.props as { children?: unknown }).children;
      return c === 0;
    });
    expect(countSpan).toHaveLength(0);
  });

  it('forwards iceType + displayLabel to ConceptInfoTrigger', () => {
    const tree = renderBN({
      node: makeNode({ data: { iceType: 'Compute.X' } }),
      displayLabel: 'My',
    });
    const trigger = findByType(tree, mocks.ConceptInfoTrigger)[0];
    const props = trigger.props as { iceType: string; displayName: string; opacity: number };
    expect(props.iceType).toBe('Compute.X');
    expect(props.displayName).toBe('My');
  });

  it('ConceptInfoTrigger opacity 0.85 when hovered, 0.45 otherwise', () => {
    const hov = renderBN({ isHovered: true });
    const idle = renderBN({});
    expect((findByType(hov, mocks.ConceptInfoTrigger)[0].props as { opacity: number }).opacity).toBe(0.85);
    expect((findByType(idle, mocks.ConceptInfoTrigger)[0].props as { opacity: number }).opacity).toBe(0.45);
  });

  it('renders FoldButton in header with onToggleFold + folded forwarded', () => {
    const fold = vi.fn();
    const tree = renderBN({ folded: true, onToggleFold: fold });
    const btn = findByType(tree, mocks.FoldButton)[0];
    const props = btn.props as { folded: boolean; onClick: () => void; opacity: number };
    expect(props.folded).toBe(true);
    expect(props.onClick).toBe(fold);
  });

  it('FoldButton opacity 0.8 when hovered, 0.4 otherwise', () => {
    const hov = renderBN({ isHovered: true });
    const idle = renderBN({});
    expect((findByType(hov, mocks.FoldButton)[0].props as { opacity: number }).opacity).toBe(0.8);
    expect((findByType(idle, mocks.FoldButton)[0].props as { opacity: number }).opacity).toBe(0.4);
  });
});

describe('BlockNode — body content', () => {
  it('renders body when not folded', () => {
    const tree = renderBN({ folded: false });
    // ResizeHandle is body-only.
    expect(findByType(tree, mocks.ResizeHandle)).toHaveLength(1);
  });

  it('omits body content when folded', () => {
    const tree = renderBN({ folded: true });
    expect(findByType(tree, mocks.ResizeHandle)).toHaveLength(0);
    expect(findByType(tree, mocks.EmptyStateText)).toHaveLength(0);
  });

  it('renders EmptyStateText when not folded + childCount=0', () => {
    const tree = renderBN({ folded: false, childCount: 0 });
    expect(findByType(tree, mocks.EmptyStateText)).toHaveLength(1);
  });

  it('omits EmptyStateText when childCount > 0', () => {
    const tree = renderBN({ folded: false, childCount: 3 });
    expect(findByType(tree, mocks.EmptyStateText)).toHaveLength(0);
  });

  it('renders CostLabel when estimatedCost set + not folded', () => {
    const tree = renderBN({
      folded: false,
      node: makeNode({ data: { estimatedCost: '$0.42' } }),
    });
    expect(findByType(tree, mocks.CostLabel)).toHaveLength(1);
  });

  it('omits CostLabel when estimatedCost not set', () => {
    const tree = renderBN({ folded: false });
    expect(findByType(tree, mocks.CostLabel)).toHaveLength(0);
  });

  it('forwards cost string to CostLabel', () => {
    const tree = renderBN({
      folded: false,
      node: makeNode({ data: { estimatedCost: '$1.00/h' } }),
    });
    const cl = findByType(tree, mocks.CostLabel)[0];
    expect((cl.props as { cost: string }).cost).toBe('$1.00/h');
  });
});
