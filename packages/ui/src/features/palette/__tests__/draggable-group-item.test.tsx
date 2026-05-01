/**
 * rf-rpal-6 — DraggableGroupItem.
 *
 * Layer 1 leaf-component extraction. The amber dashed-border "New Group"
 * affordance at the bottom of the blocks list. Drag semantics are
 * load-bearing — the test pins the three `dataTransfer.setData()` keys,
 * the cycling color via nextGroupColor, and the drag-image accent.
 *
 * `useTranslation` mocked to identity. `cn` mocked to a space-joined
 * truthy concat. GROUP_COLOR_PRESETS mocked to a fixed three-entry list
 * so the cycling test is deterministic.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../../config/color-palette', () => ({
  GROUP_COLOR_PRESETS: ['#aa0000', '#00aa00', '#0000aa'],
}));

import {
  DraggableGroupItem,
  nextGroupColor,
  __resetGroupColorIndex,
} from '../components/draggable-group-item';

// ─── Tree-walker ───────────────────────────────────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  if (typeof el.type === 'function') {
    try {
      const FC = el.type as (props: unknown) => React.ReactNode;
      yield* walk(FC(el.props) as ReactNodeLike);
    } catch {
      /* skip exotic */
    }
    return;
  }
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  function visit(n: ReactNodeLike): void {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string') {
      parts.push(n);
      return;
    }
    if (typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    const el = n as React.ReactElement;
    if (typeof el.type === 'function') {
      try {
        const FC = el.type as (props: unknown) => React.ReactNode;
        visit(FC(el.props) as ReactNodeLike);
      } catch {
        /* skip */
      }
      return;
    }
    const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
    if (children != null) visit(children);
  }
  visit(tree);
  return parts.join('');
}

const renderItem = () =>
  (DraggableGroupItem as unknown as () => React.ReactElement)();

beforeEach(() => {
  __resetGroupColorIndex();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests: nextGroupColor ─────────────────────────────────────────────────

describe('nextGroupColor', () => {
  it('returns the first preset on first call', () => {
    __resetGroupColorIndex();
    expect(nextGroupColor()).toBe('#aa0000');
  });

  it('cycles through presets in order', () => {
    __resetGroupColorIndex();
    expect(nextGroupColor()).toBe('#aa0000');
    expect(nextGroupColor()).toBe('#00aa00');
    expect(nextGroupColor()).toBe('#0000aa');
  });

  it('wraps to the first preset after the last', () => {
    __resetGroupColorIndex();
    nextGroupColor();
    nextGroupColor();
    nextGroupColor();
    expect(nextGroupColor()).toBe('#aa0000');
    expect(nextGroupColor()).toBe('#00aa00');
  });

  it('is deterministic for a given count', () => {
    __resetGroupColorIndex();
    const colors: string[] = [];
    for (let i = 0; i < 9; i++) colors.push(nextGroupColor());
    expect(colors).toEqual([
      '#aa0000',
      '#00aa00',
      '#0000aa',
      '#aa0000',
      '#00aa00',
      '#0000aa',
      '#aa0000',
      '#00aa00',
      '#0000aa',
    ]);
  });
});

// ─── Tests: outer container ────────────────────────────────────────────────

describe('DraggableGroupItem — outer container', () => {
  it('returns a single root <div> with draggable + dashed-border classes', () => {
    const tree = renderItem();
    expect(tree.type).toBe('div');
    const props = tree.props as Record<string, unknown>;
    expect(props.draggable).toBe(true);
    const className = props.className as string;
    expect(className).toContain('border-dashed');
    expect(className).toContain('rounded-lg');
    expect(className).toContain('cursor-grab');
    expect(className).toContain('hover:bg-amber-500/[0.03]');
  });

  it('attaches an onDragStart handler', () => {
    const tree = renderItem();
    const props = tree.props as Record<string, unknown>;
    expect(typeof props.onDragStart).toBe('function');
  });
});

// ─── Tests: contents ───────────────────────────────────────────────────────

describe('DraggableGroupItem — children', () => {
  it('renders the Folder lucide icon (non-string el.type) with the docked icon className', () => {
    const tree = renderItem();
    // Folder is a forwardRef — el.type !== 'function', so we predicate on
    // the rendered element by className substring.
    const all = findByPredicate(tree, (el) => {
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('w-3.5') && cn.includes('h-3.5');
    });
    expect(all.length).toBeGreaterThanOrEqual(1);
    const className = (all[0].props as { className: string }).className;
    expect(className).toContain('shrink-0');
  });

  it('renders the translated palette.group key in the inner span', () => {
    const tree = renderItem();
    const text = collectText(tree);
    expect(text).toContain('palette.group');
  });

  it('inner span carries the amber-friendly group-hover classes', () => {
    const tree = renderItem();
    const spans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('group-hover:text-ice-text-1');
    });
    expect(spans).toHaveLength(1);
  });
});

// ─── Tests: handleDragStart ─────────────────────────────────────────────────

describe('DraggableGroupItem — handleDragStart', () => {
  function buildDragEvent() {
    const setData = vi.fn();
    const setDragImage = vi.fn();
    const dataTransfer = { setData, setDragImage, effectAllowed: '' as string };
    return { event: { dataTransfer } as unknown as React.DragEvent, setData, setDragImage, dataTransfer };
  }

  function setupDocumentStubs() {
    const created: { innerHTML: string; style: Record<string, string> }[] = [];
    const appended: unknown[] = [];
    const removed: unknown[] = [];
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const el = { innerHTML: '', style: {} as Record<string, string> };
        created.push(el);
        return el;
      }),
      body: {
        appendChild: vi.fn((el: unknown) => {
          appended.push(el);
          return el;
        }),
        removeChild: vi.fn((el: unknown) => {
          removed.push(el);
          return el;
        }),
      },
    });
    vi.stubGlobal('setTimeout', vi.fn((fn: () => void) => {
      fn();
      return 0;
    }));
    return { created, appended, removed };
  }

  it('forwards "Custom", "New Group", and the next color via setData', () => {
    setupDocumentStubs();
    const tree = renderItem();
    const onDragStart = (tree.props as { onDragStart: (e: React.DragEvent) => void }).onDragStart;
    const { event, setData } = buildDragEvent();
    onDragStart(event);
    expect(setData).toHaveBeenCalledWith('application/ice-group', 'Custom');
    expect(setData).toHaveBeenCalledWith('application/ice-group-name', 'New Group');
    // First color is preset[0] under our mock.
    expect(setData).toHaveBeenCalledWith('application/ice-group-color', '#aa0000');
  });

  it('rotates color on each drag — second drag picks preset[1]', () => {
    setupDocumentStubs();
    const tree = renderItem();
    const onDragStart = (tree.props as { onDragStart: (e: React.DragEvent) => void }).onDragStart;
    const e1 = buildDragEvent();
    onDragStart(e1.event);
    const e2 = buildDragEvent();
    onDragStart(e2.event);
    const c1 = e1.setData.mock.calls.find((c) => c[0] === 'application/ice-group-color')?.[1];
    const c2 = e2.setData.mock.calls.find((c) => c[0] === 'application/ice-group-color')?.[1];
    expect(c1).toBe('#aa0000');
    expect(c2).toBe('#00aa00');
  });

  it('sets effectAllowed = "move"', () => {
    setupDocumentStubs();
    const tree = renderItem();
    const onDragStart = (tree.props as { onDragStart: (e: React.DragEvent) => void }).onDragStart;
    const { event, dataTransfer } = buildDragEvent();
    onDragStart(event);
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  it('builds drag-image with the picked color in the box-shadow + dashed border', () => {
    const stubs = setupDocumentStubs();
    const tree = renderItem();
    const onDragStart = (tree.props as { onDragStart: (e: React.DragEvent) => void }).onDragStart;
    const { event, setDragImage } = buildDragEvent();
    onDragStart(event);
    expect(stubs.created).toHaveLength(1);
    const html = stubs.created[0].innerHTML;
    expect(html).toContain('color: #aa0000');
    expect(html).toContain('0 0 0 1px #aa000030');
    expect(html).toContain('border: 1px dashed #aa000050');
    expect(html).toContain('New Group');
    expect(setDragImage).toHaveBeenCalledWith(stubs.created[0], 0, 0);
    // Cleanup via setTimeout(...,0) — synchronous in stub.
    expect(stubs.removed).toHaveLength(1);
    expect(stubs.removed[0]).toBe(stubs.created[0]);
  });
});
