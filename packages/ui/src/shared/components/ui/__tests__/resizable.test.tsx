/**
 * Tests for `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`.
 *
 * The underlying `react-resizable-panels` primitives are mocked as
 * pass-through markers, and the local `ResizeBar` is mocked likewise.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return {
    PanelGroup: Pass('PanelGroup'),
    Panel: Pass('Panel'),
    PanelResizeHandle: Pass('PanelResizeHandle'),
    ResizeBar: Pass('ResizeBar'),
  };
});

vi.mock('react-resizable-panels', () => ({
  PanelGroup: mocks.PanelGroup,
  Panel: mocks.Panel,
  PanelResizeHandle: mocks.PanelResizeHandle,
}));

vi.mock('../resize-bar', () => ({ ResizeBar: mocks.ResizeBar }));

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../resizable';

interface ElLike {
  type: unknown;
  props: { className?: string; children?: unknown; direction?: string; [k: string]: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  yield* walk(node.props.children);
}
function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

describe('ResizablePanelGroup', () => {
  it('renders the underlying PanelGroup with default flex classes', () => {
    const el = (ResizablePanelGroup as unknown as (p: unknown) => ElLike)({});
    expect(el.type).toBe(mocks.PanelGroup);
    expect(el.props.className).toContain('flex');
    expect(el.props.className).toContain('h-full');
  });

  it('merges caller className', () => {
    const el = (ResizablePanelGroup as unknown as (p: unknown) => ElLike)({ className: 'mine' });
    expect(el.props.className).toContain('mine');
  });
});

describe('ResizablePanel', () => {
  it('is a direct re-export of the underlying Panel', () => {
    expect(ResizablePanel).toBe(mocks.Panel);
  });
});

describe('ResizableHandle', () => {
  it('renders the underlying PanelResizeHandle with focus classes', () => {
    const el = (ResizableHandle as unknown as (p: unknown) => ElLike)({});
    expect(el.type).toBe(mocks.PanelResizeHandle);
    expect(el.props.className).toContain('focus-visible:ring-1');
  });

  it('does not render any ResizeBar children when withHandle is omitted', () => {
    const el = (ResizableHandle as unknown as (p: unknown) => ElLike)({});
    const bars = findAll(el, (n) => n.type === mocks.ResizeBar);
    expect(bars.length).toBe(0);
  });

  it('renders both vertical and horizontal ResizeBar when withHandle is true', () => {
    const el = (ResizableHandle as unknown as (p: unknown) => ElLike)({ withHandle: true });
    const bars = findAll(el, (n) => n.type === mocks.ResizeBar);
    expect(bars.length).toBe(2);
    const directions = bars.map((b) => b.props.direction).sort();
    expect(directions).toEqual(['horizontal', 'vertical']);
  });

  it('merges caller className', () => {
    const el = (ResizableHandle as unknown as (p: unknown) => ElLike)({ className: 'mine' });
    expect(el.props.className).toContain('mine');
  });
});
