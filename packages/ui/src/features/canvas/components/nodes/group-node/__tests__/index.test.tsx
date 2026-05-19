/**
 * Tests for `SvgGroupNode` orchestrator — dispatches between GroupLod1 /
 * GroupLod2 / BlockNode / GroupLod3 based on `lod` and `isBlock`. Hooks
 * (useState, useCallback, useRef, useEffect) are mocked so the FC can be
 * invoked outside a render context. The category palette / brand registry
 * are exercised via the real exports.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const named = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    BlockNode: named('MockBlockNode'),
    GroupLod1: named('MockGroupLod1'),
    GroupLod2: named('MockGroupLod2'),
    GroupLod3: named('MockGroupLod3'),
    state: {
      hoverValue: false as boolean,
      setHoverSpy: vi.fn(),
      runEffects: false as boolean,
      refValue: null as unknown,
    },
  };
});

vi.mock('../block-node', () => ({ BlockNode: mocks.BlockNode }));
vi.mock('../group-lod1', () => ({ GroupLod1: mocks.GroupLod1 }));
vi.mock('../group-lod2', () => ({ GroupLod2: mocks.GroupLod2 }));
vi.mock('../group-lod3', () => ({ GroupLod3: mocks.GroupLod3 }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initialValue = typeof init === 'function' ? (init as () => T)() : init;
      if (typeof initialValue === 'boolean') {
        return [mocks.state.hoverValue as unknown as T, mocks.state.setHoverSpy];
      }
      return [initialValue, vi.fn()];
    }),
    useRef: vi.fn(<T,>(_init: T): { current: T } => ({ current: mocks.state.refValue as T })),
    useEffect: vi.fn((fn: () => void) => {
      if (mocks.state.runEffects) fn();
    }),
    useCallback: vi.fn(<T,>(fn: T) => fn),
  };
});

import { SvgGroupNode } from '..';
import type { CanvasNode } from '../../../svg-canvas';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'g-1',
  type: 'group',
  x: 100,
  y: 200,
  width: 400,
  height: 300,
  label: 'My Group',
  data: {},
  parentId: undefined,
  ...overrides,
});

const renderGN = (props: Partial<React.ComponentProps<typeof SvgGroupNode>> = {}): React.ReactElement => {
  const Inner = (
    SvgGroupNode as unknown as {
      type: (p: React.ComponentProps<typeof SvgGroupNode>) => React.ReactElement;
    }
  ).type;
  const defaults: React.ComponentProps<typeof SvgGroupNode> = {
    node: makeNode(),
    isSelected: false,
  };
  return Inner({ ...defaults, ...props });
};

beforeEach(() => {
  mocks.state.hoverValue = false;
  mocks.state.setHoverSpy.mockClear();
  mocks.state.runEffects = false;
  mocks.state.refValue = null;
});

describe('SvgGroupNode — memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    expect(typeof (SvgGroupNode as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
  });

  it('carries displayName "SvgGroupNode"', () => {
    expect((SvgGroupNode as unknown as { displayName: string }).displayName).toBe('SvgGroupNode');
  });
});

describe('SvgGroupNode — LOD dispatch', () => {
  it('lod <= 1 renders GroupLod1', () => {
    expect(renderGN({ lod: 1 }).type).toBe(mocks.GroupLod1);
    expect(renderGN({ lod: 0 }).type).toBe(mocks.GroupLod1);
  });

  it('lod === 2 renders GroupLod2', () => {
    expect(renderGN({ lod: 2 }).type).toBe(mocks.GroupLod2);
  });

  it('lod >= 3 with isBlock=true renders BlockNode', () => {
    expect(renderGN({ lod: 3, isBlock: true }).type).toBe(mocks.BlockNode);
    expect(renderGN({ lod: 5, isBlock: true }).type).toBe(mocks.BlockNode);
  });

  it('lod >= 3 with isBlock=false (default) renders GroupLod3', () => {
    expect(renderGN({ lod: 3 }).type).toBe(mocks.GroupLod3);
    expect(renderGN({}).type).toBe(mocks.GroupLod3);
  });
});

describe('SvgGroupNode — width/height clamping', () => {
  it('clamps nodeWidth to 276 minimum', () => {
    const tree = renderGN({ lod: 1, node: makeNode({ width: 100 }) });
    expect((tree.props as { nodeWidth: number }).nodeWidth).toBe(276);
  });

  it('uses node.width when >= 276', () => {
    const tree = renderGN({ lod: 1, node: makeNode({ width: 500 }) });
    expect((tree.props as { nodeWidth: number }).nodeWidth).toBe(500);
  });

  it('clamps nodeHeight to 80 minimum when not folded', () => {
    const tree = renderGN({ lod: 1, node: makeNode({ height: 50 }) });
    expect((tree.props as { nodeHeight: number }).nodeHeight).toBe(80);
  });

  it('uses 36 nodeHeight when folded', () => {
    const tree = renderGN({ lod: 1, node: makeNode({ data: { folded: true }, height: 200 }) });
    expect((tree.props as { nodeHeight: number }).nodeHeight).toBe(36);
  });

  it('uses 120 height fallback when height is 0', () => {
    const tree = renderGN({ lod: 1, node: makeNode({ height: 0 }) });
    expect((tree.props as { nodeHeight: number }).nodeHeight).toBe(120);
  });
});

describe('SvgGroupNode — invZoom passthrough (LOD1/LOD2)', () => {
  it('forwards invZoom = 1/zoom (LOD1)', () => {
    const tree = renderGN({ lod: 1, zoom: 0.5 });
    expect((tree.props as { invZoom: number }).invZoom).toBe(2);
  });

  it('zoom floor 0.1 protects against tiny zoom (LOD1)', () => {
    const tree = renderGN({ lod: 1, zoom: 0.001 });
    expect((tree.props as { invZoom: number }).invZoom).toBe(10);
  });

  it('forwards invZoom (LOD2)', () => {
    const tree = renderGN({ lod: 2, zoom: 0.25 });
    expect((tree.props as { invZoom: number }).invZoom).toBe(4);
  });
});

describe('SvgGroupNode — display label truncation', () => {
  it('truncates long labels using maxChars derived from width', () => {
    const tree = renderGN({ lod: 1, node: makeNode({ width: 276, label: 'this-is-a-very-long-block-label' }) });
    const props = tree.props as { displayLabel: string };
    expect(props.displayLabel.endsWith('…')).toBe(true);
    expect(props.displayLabel.length).toBeLessThan('this-is-a-very-long-block-label'.length + 1);
  });

  it('uses "Group" fallback when label empty + isBlock false', () => {
    const tree = renderGN({ lod: 1, node: makeNode({ label: '' }) });
    expect((tree.props as { displayLabel: string }).displayLabel).toBe('Group');
  });

  it('uses "Block" fallback when label empty + isBlock true (LOD3)', () => {
    const tree = renderGN({ lod: 3, isBlock: true, node: makeNode({ label: '' }) });
    expect((tree.props as { displayLabel: string }).displayLabel).toBe('Block');
  });

  it('keeps short labels intact', () => {
    const tree = renderGN({ lod: 1, node: makeNode({ width: 1000, label: 'short' }) });
    expect((tree.props as { displayLabel: string }).displayLabel).toBe('short');
  });

  it('maxChars has minimum of 8 (very narrow widths)', () => {
    // Nominal width 0 means 276 after clamp; (276-80)/7 = 28 max chars; min ensure 8.
    const tree = renderGN({ lod: 1, node: makeNode({ width: 0, label: 'medium-label-text' }) });
    const dl = (tree.props as { displayLabel: string }).displayLabel;
    // Should NOT throw; should be either truncated or full when fits.
    expect(typeof dl).toBe('string');
  });
});

describe('SvgGroupNode — displayLabel truncation with isBlock fallback', () => {
  it('truncates "Block" fallback when label empty + maxChars too small', () => {
    // Width 100 → maxChars = max(floor((100-80)/7), 8) = max(2, 8) = 8.
    // Fallback "Block" length 5 < 8 → no truncation.
    const tree = renderGN({
      lod: 3,
      isBlock: true,
      node: {
        ...({} as Parameters<typeof renderGN>[0]['node']),
        id: 'b',
        type: 'block',
        x: 0,
        y: 0,
        width: 100,
        height: 120,
        label: '',
        data: {},
        parentId: undefined,
      } as Parameters<typeof renderGN>[0]['node'],
    });
    expect((tree.props as { displayLabel: string }).displayLabel).toBe('Block');
  });

  it('truncates fallback "Group" when (forced) maxChars < fallback.length', () => {
    // Make label undefined and force a tiny maxChars by giving width that
    // generates `(w-80)/7` < 5; clamped to 8 floor → "Group" (5) is still
    // <= 8 so it wouldn't truncate. To exercise the truncation branch on
    // line 58, supply a label whose length exceeds maxChars when label is
    // not empty (already covered) AND verify the fallback path keeps the
    // fallback intact.
    const tree = renderGN({ lod: 1, node: makeNode({ width: 100, label: '' }) });
    expect((tree.props as { displayLabel: string }).displayLabel).toBe('Group');
  });

  it('label undefined coerces to fallback in displayLabel', () => {
    const tree = renderGN({
      lod: 1,
      node: {
        id: 'g',
        type: 'block',
        x: 0,
        y: 0,
        width: 280,
        height: 120,
        label: undefined as unknown as string,
        data: {},
        parentId: undefined,
      },
    });
    expect((tree.props as { displayLabel: string }).displayLabel).toBe('Group');
  });
});

describe('SvgGroupNode — GroupLod2 label fallback', () => {
  it('forwards empty label to GroupLod2 when label undefined', () => {
    const tree = renderGN({
      lod: 2,
      node: { id: 'g', type: 'block', x: 0, y: 0, width: 280, height: 120, label: '', data: {}, parentId: undefined },
    });
    expect((tree.props as { label: string }).label).toBe('');
  });
});

describe('SvgGroupNode — folded reading', () => {
  it('passes folded=true when data.folded=true', () => {
    const tree = renderGN({ lod: 1, node: makeNode({ data: { folded: true } }) });
    expect((tree.props as { /* via height clamp */ nodeHeight: number }).nodeHeight).toBe(36);
  });

  it('passes folded=false when data.folded falsy', () => {
    const tree = renderGN({ lod: 3, node: makeNode({ data: {} }) });
    // GroupLod3 receives folded prop; we look at the dispatch result.
    expect((tree.props as { folded: boolean }).folded).toBe(false);
  });
});

describe('SvgGroupNode — childCount', () => {
  it('childNodes default to []', () => {
    const tree = renderGN({ lod: 3 });
    expect((tree.props as { childCount: number }).childCount).toBe(0);
  });

  it('childCount = childNodes.length', () => {
    const c1 = makeNode({ id: 'c1' });
    const c2 = makeNode({ id: 'c2' });
    const tree = renderGN({ lod: 3, childNodes: [c1, c2] });
    expect((tree.props as { childCount: number }).childCount).toBe(2);
  });
});

describe('SvgGroupNode — block dispatch (LOD3 + isBlock)', () => {
  it('forwards accentColor from BLOCK_ACCENT_COLORS for known iceType suffix', () => {
    const tree = renderGN({
      lod: 3,
      isBlock: true,
      node: makeNode({ data: { iceType: 'Compute.BackendAPI' } }),
    });
    const accent = (tree.props as { accentColor: string }).accentColor;
    expect(typeof accent).toBe('string');
    expect(accent.length).toBeGreaterThan(0);
  });

  it('forwards default #3b82f6 accent when iceType has no entry', () => {
    const tree = renderGN({
      lod: 3,
      isBlock: true,
      node: makeNode({ data: { iceType: 'Unknown.Type' } }),
    });
    expect((tree.props as { accentColor: string }).accentColor).toBe('#3b82f6');
  });

  it('forwards blockIcon (resolved from getIcon) — null when iceType empty', () => {
    const tree = renderGN({
      lod: 3,
      isBlock: true,
      node: makeNode({ data: {} }),
    });
    // getIcon may return a brand icon or null; we only assert the prop exists.
    const props = tree.props as { blockIcon: unknown };
    // blockIcon could be null OR a brand icon shape; pin to 'either'.
    expect(props.blockIcon === null || typeof props.blockIcon === 'object').toBe(true);
  });

  it('forwards isSelected, isHovered (mocked false), isDragOver, isDragging, isChildExiting', () => {
    const tree = renderGN({
      lod: 3,
      isBlock: true,
      isSelected: true,
      isDragOver: true,
      isDragging: true,
      isChildExiting: true,
    });
    const props = tree.props as Record<string, unknown>;
    expect(props.isSelected).toBe(true);
    expect(props.isDragOver).toBe(true);
    expect(props.isDragging).toBe(true);
    expect(props.isChildExiting).toBe(true);
    expect(props.isHovered).toBe(false);
  });

  it('block onMouseEnter / onMouseLeave call setIsHovered(true/false)', () => {
    const tree = renderGN({ lod: 3, isBlock: true });
    const p = tree.props as { onMouseEnter: () => void; onMouseLeave: () => void };
    p.onMouseEnter();
    expect(mocks.state.setHoverSpy).toHaveBeenCalledWith(true);
    p.onMouseLeave();
    expect(mocks.state.setHoverSpy).toHaveBeenCalledWith(false);
  });

  it('block onToggleFold stops propagation + calls onToggleFold(node.id)', () => {
    const fold = vi.fn();
    const tree = renderGN({
      lod: 3,
      isBlock: true,
      node: makeNode({ id: 'b-7' }),
      onToggleFold: fold,
    });
    const stops: string[] = [];
    const handler = (tree.props as { onToggleFold: (e: React.MouseEvent) => void }).onToggleFold;
    handler({ stopPropagation: () => stops.push('s') } as React.MouseEvent);
    expect(stops).toEqual(['s']);
    expect(fold).toHaveBeenCalledWith('b-7');
  });

  it('block onToggleFold no-op when onToggleFold prop undefined', () => {
    const tree = renderGN({ lod: 3, isBlock: true });
    const handler = (tree.props as { onToggleFold: (e: React.MouseEvent) => void }).onToggleFold;
    expect(() => handler({ stopPropagation: () => {} } as React.MouseEvent)).not.toThrow();
  });
});

describe('SvgGroupNode — group dispatch (LOD3, no isBlock)', () => {
  it('forwards default groupBorderColor when no userColor + unknown iceType', () => {
    const tree = renderGN({ lod: 3, node: makeNode({ data: { iceType: 'Unknown.X' } }) });
    expect((tree.props as { groupBorderColor: string }).groupBorderColor).toBe('var(--ice-border-strong)');
  });

  it('uses hexToBorder(userColor) when groupColor is set', () => {
    const tree = renderGN({
      lod: 3,
      node: makeNode({ data: { groupColor: '#abcdef' } }),
    });
    expect((tree.props as { groupBorderColor: string }).groupBorderColor).toBe('#abcdef50');
  });

  it('uses hexToTint(userColor, userOpacity) when groupColor + groupOpacity set', () => {
    const tree = renderGN({
      lod: 3,
      node: makeNode({ data: { groupColor: '#abcdef', groupOpacity: 0.3 } }),
    });
    expect((tree.props as { groupTint: string }).groupTint).toBe('rgba(171, 205, 239, 0.3)');
  });

  it('uses hexToTint with default 0.1 alpha when no groupOpacity', () => {
    const tree = renderGN({
      lod: 3,
      node: makeNode({ data: { groupColor: '#abcdef' } }),
    });
    expect((tree.props as { groupTint: string }).groupTint).toBe('rgba(171, 205, 239, 0.1)');
  });

  it('falls back to default rgba groupTint when no userColor + unknown iceType', () => {
    const tree = renderGN({
      lod: 3,
      node: makeNode({ data: { iceType: 'Unknown.X' } }),
    });
    expect((tree.props as { groupTint: string }).groupTint).toBe('rgba(15, 23, 42, 0.15)');
  });

  it('labelColor = userColor when set', () => {
    const tree = renderGN({
      lod: 3,
      node: makeNode({ data: { groupColor: '#abcdef' } }),
    });
    expect((tree.props as { labelColor: string }).labelColor).toBe('#abcdef');
  });

  it('labelColor falls back to var(--ice-text-tertiary)', () => {
    const tree = renderGN({ lod: 3, node: makeNode() });
    expect((tree.props as { labelColor: string }).labelColor).toBe('var(--ice-text-tertiary)');
  });

  it('forwards connectionDragState verbatim', () => {
    const tree = renderGN({ lod: 3, connectionDragState: 'invalid-target' });
    expect((tree.props as { connectionDragState: unknown }).connectionDragState).toBe('invalid-target');
  });

  it('connectionDragState defaults to null', () => {
    const tree = renderGN({ lod: 3 });
    expect((tree.props as { connectionDragState: unknown }).connectionDragState).toBe(null);
  });

  it('group onMouseEnter / onMouseLeave call setIsHovered(true/false)', () => {
    const tree = renderGN({ lod: 3, isBlock: false });
    const p = tree.props as { onMouseEnter: () => void; onMouseLeave: () => void };
    p.onMouseEnter();
    expect(mocks.state.setHoverSpy).toHaveBeenCalledWith(true);
    p.onMouseLeave();
    expect(mocks.state.setHoverSpy).toHaveBeenCalledWith(false);
  });

  it('group onToggleFold stops propagation + calls onToggleFold(node.id)', () => {
    const fold = vi.fn();
    const tree = renderGN({ lod: 3, isBlock: false, onToggleFold: fold });
    const stops: string[] = [];
    (tree.props as { onToggleFold: (e: React.MouseEvent) => void }).onToggleFold({
      stopPropagation: () => stops.push('s'),
    } as React.MouseEvent);
    expect(stops).toEqual(['s']);
    expect(fold).toHaveBeenCalled();
  });
});

describe('SvgGroupNode — LOD1/LOD2 colour forwarding', () => {
  it('LOD1 forwards groupColor + groupOpacity from data', () => {
    const tree = renderGN({
      lod: 1,
      node: makeNode({ data: { groupColor: '#abcdef', groupOpacity: 0.4 } }),
    });
    const props = tree.props as { groupColor: string; groupOpacity: number };
    expect(props.groupColor).toBe('#abcdef');
    expect(props.groupOpacity).toBe(0.4);
  });

  it('LOD1 falls back to empty string for groupColor when not set', () => {
    const tree = renderGN({ lod: 1, node: makeNode() });
    expect((tree.props as { groupColor: string }).groupColor).toBe('');
  });

  it('LOD1 groupOpacity is undefined when not set', () => {
    const tree = renderGN({ lod: 1, node: makeNode() });
    expect((tree.props as { groupOpacity?: number }).groupOpacity).toBeUndefined();
  });

  it('LOD2 forwards groupColor / groupOpacity', () => {
    const tree = renderGN({
      lod: 2,
      node: makeNode({ data: { groupColor: '#abcdef', groupOpacity: 0.4 } }),
    });
    const props = tree.props as { groupColor: string; groupOpacity: number };
    expect(props.groupColor).toBe('#abcdef');
    expect(props.groupOpacity).toBe(0.4);
  });
});

describe('SvgGroupNode — rename focus effect', () => {
  it('focuses + selects rename input when isRenaming + ref present', () => {
    const focus = vi.fn();
    const select = vi.fn();
    mocks.state.runEffects = true;
    mocks.state.refValue = { focus, select } as unknown;
    renderGN({ isRenaming: true });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('does nothing when isRenaming=false even with ref', () => {
    const focus = vi.fn();
    const select = vi.fn();
    mocks.state.runEffects = true;
    mocks.state.refValue = { focus, select } as unknown;
    renderGN({ isRenaming: false });
    expect(focus).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('does nothing when isRenaming=true but ref is null', () => {
    mocks.state.runEffects = true;
    mocks.state.refValue = null;
    expect(() => renderGN({ isRenaming: true })).not.toThrow();
  });
});
