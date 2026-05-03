/**
 * Tests for `SidebarPanel` — collapsible / resizable panel orchestrator.
 *
 * Covers all four branches of the visible/collapsedTabs/side matrix.
 */

import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return {
    ResizableHandle: Pass('ResizableHandle'),
    ResizablePanel: Pass('ResizablePanel'),
    SidebarStrip: Pass('SidebarStrip'),
  };
});

vi.mock('../resizable', () => ({
  ResizableHandle: mocks.ResizableHandle,
  ResizablePanel: mocks.ResizablePanel,
}));

vi.mock('../sidebar-strip', () => ({ SidebarStrip: mocks.SidebarStrip }));

import { SidebarPanel } from '../sidebar-panel';

interface ElLike {
  type: unknown;
  props: { children?: unknown; collapsible?: boolean; [k: string]: unknown };
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
function flatTopLevel(tree: unknown): ElLike[] {
  // The top of SidebarPanel returns a Fragment with multiple children. We
  // want the immediate children of the Fragment (or Fragment-shaped object).
  if (Array.isArray(tree)) return tree.filter(isEl);
  if (!isEl(tree)) return [];
  // In React, Fragment children appear as `props.children` on the fragment.
  const children = tree.props.children;
  if (Array.isArray(children)) return children.filter(isEl);
  if (isEl(children)) return [children];
  return [tree];
}

const baseProps = {
  defaultSize: 20,
  minSize: 10,
  maxSize: 40,
  children: 'PANEL_KIDS',
};

const render = (props: Record<string, unknown>): unknown =>
  (SidebarPanel as unknown as (p: unknown) => unknown)(props);

describe('SidebarPanel — collapsed (visible=false) with collapsedTabs', () => {
  it('renders SidebarStrip when collapsedTabs is non-empty', () => {
    const tabs = [{ id: 't1', label: 'T1', icon: () => null, active: false, onClick: () => {} }];
    const out = render({ ...baseProps, visible: false, side: 'left', collapsedTabs: tabs });
    const strips = findAll(out, (el) => el.type === mocks.SidebarStrip);
    expect(strips.length).toBe(1);
    expect(strips[0].props.tabs).toBe(tabs);
    expect(strips[0].props.side).toBe('left');
  });
});

describe('SidebarPanel — collapsed (visible=false) without collapsedTabs', () => {
  it('left side: renders a 0-size ResizablePanel followed by a ResizableHandle', () => {
    const tree = render({ ...baseProps, visible: false, side: 'left' });
    const panels = findAll(tree, (el) => el.type === mocks.ResizablePanel);
    const handles = findAll(tree, (el) => el.type === mocks.ResizableHandle);
    expect(panels.length).toBe(1);
    expect(handles.length).toBe(1);
    expect(panels[0].props.defaultSize).toBe(0);
    expect(panels[0].props.collapsedSize).toBe(0);
    expect((panels[0].props.style as Record<string, unknown>).overflow).toBe('hidden');
  });

  it('right side: renders a ResizableHandle followed by a 0-size ResizablePanel', () => {
    const tree = render({ ...baseProps, visible: false, side: 'right' });
    const panels = findAll(tree, (el) => el.type === mocks.ResizablePanel);
    const handles = findAll(tree, (el) => el.type === mocks.ResizableHandle);
    expect(panels.length).toBe(1);
    expect(handles.length).toBe(1);
    expect(panels[0].props.defaultSize).toBe(0);
  });

  it('treats an empty collapsedTabs array as "no tabs" (falls through to the invisible-panel branch)', () => {
    const tree = render({ ...baseProps, visible: false, side: 'left', collapsedTabs: [] });
    const strips = findAll(tree, (el) => el.type === mocks.SidebarStrip);
    expect(strips.length).toBe(0);
    const panels = findAll(tree, (el) => el.type === mocks.ResizablePanel);
    expect(panels.length).toBe(1);
  });
});

describe('SidebarPanel — expanded (visible=true)', () => {
  it('left side: panel comes before handle', () => {
    const tree = render({ ...baseProps, visible: true, side: 'left', className: 'mine' });
    const top = flatTopLevel(tree);
    const types = top.map((n) => n.type);
    expect(types[0]).toBe(mocks.ResizablePanel);
    expect(types[1]).toBe(mocks.ResizableHandle);
  });

  it('right side: handle comes before panel', () => {
    const tree = render({ ...baseProps, visible: true, side: 'right' });
    const top = flatTopLevel(tree);
    const types = top.map((n) => n.type);
    expect(types[0]).toBe(mocks.ResizableHandle);
    expect(types[1]).toBe(mocks.ResizablePanel);
  });

  it('forwards defaultSize, minSize, maxSize and className to the panel', () => {
    const tree = render({ ...baseProps, visible: true, side: 'left', className: 'mine' });
    const panels = findAll(tree, (el) => el.type === mocks.ResizablePanel);
    expect(panels[0].props.defaultSize).toBe(20);
    expect(panels[0].props.minSize).toBe(10);
    expect(panels[0].props.maxSize).toBe(40);
    expect(panels[0].props.className).toBe('mine');
  });

  it('panel keeps the children', () => {
    const tree = render({ ...baseProps, visible: true, side: 'left' });
    const panels = findAll(tree, (el) => el.type === mocks.ResizablePanel);
    expect(panels[0].props.children).toBe('PANEL_KIDS');
  });

  it('handle has withHandle=true', () => {
    const tree = render({ ...baseProps, visible: true, side: 'left' });
    const handles = findAll(tree, (el) => el.type === mocks.ResizableHandle);
    expect(handles[0].props.withHandle).toBe(true);
  });
});
