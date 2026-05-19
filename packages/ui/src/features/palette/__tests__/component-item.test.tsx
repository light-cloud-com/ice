/**
 * rf-rpal-5 — ComponentItem.
 *
 * Layer 1 leaf-component extraction. The micro-card with accent edge +
 * optional runtime selector. Drag semantics are load-bearing — the test
 * pins the four `dataTransfer.setData()` keys, the runtime payload branch,
 * and the drag-image accent color.
 *
 * Two `useState` slots — `isDragging` (boolean) and `selectedRuntime`
 * (string | null) — are mocked via the queued-ref-dispatch pattern (cite
 * `queued-ref-dispatch-extends-the-mutable-ref-usestate-mock-to-multi-state-fcs`).
 * Each slot has an independent setter spy so the test can verify
 * `setIsDragging(true)` fires on dragstart and the selected runtime updates
 * on chip-click.
 *
 * `Tooltip*` are mocked to passthrough children so the walker sees the
 * inline tree without Radix's portal/state machinery.
 *
 * `setTimeout`, `document.createElement`, `document.body.appendChild` and
 * `document.body.removeChild` are stubbed so handleDragStart's drag-image
 * dance runs in node without DOM globals.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  isDraggingRef: { current: false as boolean },
  selectedRuntimeRef: { current: null as string | null },
  setIsDraggingSpy: vi.fn(),
  setSelectedRuntimeSpy: vi.fn(),
}));

// Patch React.useState (named + default-export form).
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let callIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    callIdx = 0;
  };
  const dispatch = [
    () => [mocks.isDraggingRef.current, mocks.setIsDraggingSpy] as const,
    () => [mocks.selectedRuntimeRef.current, mocks.setSelectedRuntimeSpy] as const,
  ];
  const patchedUseState = vi.fn((initial?: unknown) => {
    const slot = dispatch[callIdx] ?? dispatch[dispatch.length - 1];
    // Seed selectedRuntime from initial when test asks.
    if (
      callIdx === 1 &&
      (mocks as unknown as { __seedRuntime: boolean }).__seedRuntime &&
      mocks.selectedRuntimeRef.current === null
    ) {
      mocks.selectedRuntimeRef.current = (initial as string | null) ?? null;
    }
    callIdx += 1;
    return slot();
  });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    default: {
      ...actualDefault,
      useState: patchedUseState,
    },
  };
});

// Tooltip primitives — passthrough children. The walker still descends.
vi.mock('../../../shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) =>
    React.createElement(React.Fragment, null, children),
  TooltipContent: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('div', { 'data-tooltip-content': true, ...rest }, children),
}));

// `cn` returns space-joined truthy classes — match the source's behavior.
vi.mock('../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

import { ComponentItem } from '../components/component-item';
import type { ComponentDef } from '../types';

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
      const rendered = FC(el.props);
      yield* walk(rendered as ReactNodeLike);
    } catch {
      /* lucide forwardRef + exotics may throw — safe to skip */
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

// ─── Helpers ───────────────────────────────────────────────────────────────

const FakeIcon = vi.fn((props: { className?: string; style?: React.CSSProperties }) =>
  React.createElement('svg', { 'data-icon': 'FakeIcon', className: props.className, style: props.style }),
);

function makeComponent(overrides: Partial<ComponentDef> = {}): ComponentDef {
  return {
    type: 'Compute.Container',
    name: 'Container',
    description: 'A container.',
    tooltip: 'Container tooltip',
    icon: FakeIcon as unknown as ComponentDef['icon'],
    providers: ['aws', 'gcp', 'azure'],
    category: 'Compute',
    ...overrides,
  };
}

const renderItem = (props: Parameters<typeof ComponentItem>[0]): React.ReactElement => {
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  return (ComponentItem as unknown as (p: Parameters<typeof ComponentItem>[0]) => React.ReactElement)(props);
};

beforeEach(() => {
  mocks.isDraggingRef.current = false;
  mocks.selectedRuntimeRef.current = null;
  mocks.setIsDraggingSpy.mockClear();
  mocks.setSelectedRuntimeSpy.mockClear();
  (mocks as unknown as { __seedRuntime: boolean }).__seedRuntime = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
  (mocks as unknown as { __seedRuntime: boolean }).__seedRuntime = false;
});

// ─── Tests: outer container ────────────────────────────────────────────────

describe('ComponentItem — outer container', () => {
  it('returns a single root <div> with palette-item-enter class', () => {
    const tree = renderItem({
      component: makeComponent(),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    expect(tree.type).toBe('div');
    const className = (tree.props as { className: string }).className;
    expect(className).toBe('palette-item-enter');
  });

  it('sets animationDelay 0ms when staggerIndex is 0', () => {
    const tree = renderItem({
      component: makeComponent(),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const style = (tree.props as { style: React.CSSProperties }).style;
    expect(style.animationDelay).toBe('0ms');
  });

  it('sets animationDelay = staggerIndex * 15 ms when positive', () => {
    const tree = renderItem({
      component: makeComponent(),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 3,
    });
    const style = (tree.props as { style: React.CSSProperties }).style;
    expect(style.animationDelay).toBe('45ms');
  });
});

// ─── Tests: drag row ───────────────────────────────────────────────────────

describe('ComponentItem — drag row', () => {
  it('marks the inner row as draggable with data-block-type and data-testid', () => {
    const tree = renderItem({
      component: makeComponent({ type: 'Database.PostgreSQL' }),
      selectedProvider: 'gcp',
      categoryColor: '#f59e0b',
      staggerIndex: 0,
    });
    const rows = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return (
        el.type === 'div' &&
        props.draggable === true &&
        typeof props['data-block-type'] === 'string'
      );
    });
    expect(rows).toHaveLength(1);
    const props = rows[0].props as Record<string, unknown>;
    expect(props['data-block-type']).toBe('Database.PostgreSQL');
    expect(props['data-testid']).toBe('block-item-Database.PostgreSQL');
  });

  it('renders the component icon with the half-opacity (80) category color tint', () => {
    const tree = renderItem({
      component: makeComponent(),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const icons = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'svg' && (props as { 'data-icon'?: string })['data-icon'] === 'FakeIcon';
    });
    expect(icons).toHaveLength(1);
    const style = (icons[0].props as { style: React.CSSProperties }).style;
    expect(style.color).toBe('#22c55e80');
    const className = (icons[0].props as { className: string }).className;
    expect(className).toContain('w-3');
    expect(className).toContain('h-3');
    expect(className).toContain('mr-2');
  });

  it('renders the block name in the truncated label span', () => {
    const tree = renderItem({
      component: makeComponent({ name: 'My Block' }),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const text = collectText(tree);
    expect(text).toContain('My Block');
  });

  it('flags isDragging via opacity-40 class when state is true', () => {
    mocks.isDraggingRef.current = true;
    const tree = renderItem({
      component: makeComponent(),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const rows = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props.draggable === true;
    });
    expect(rows).toHaveLength(1);
    const className = (rows[0].props as { className: string }).className;
    expect(className).toContain('opacity-40');
  });

  it('omits opacity-40 when isDragging is false', () => {
    mocks.isDraggingRef.current = false;
    const tree = renderItem({
      component: makeComponent(),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const rows = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props.draggable === true;
    });
    const className = (rows[0].props as { className: string }).className;
    expect(className).not.toContain('opacity-40');
  });
});

// ─── Tests: tooltip content ────────────────────────────────────────────────

describe('ComponentItem — tooltip content', () => {
  it('renders the component name in a font-medium <p>', () => {
    const tree = renderItem({
      component: makeComponent({ name: 'Container' }),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const ps = findByPredicate(tree, (el) => {
      if (el.type !== 'p') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('font-medium');
    });
    expect(ps).toHaveLength(1);
    expect(collectText(ps[0])).toBe('Container');
  });

  it('renders the description in a text-ice-text-2 <p>', () => {
    const tree = renderItem({
      component: makeComponent({ description: 'Run your code in a container' }),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const ps = findByPredicate(tree, (el) => {
      if (el.type !== 'p') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn === 'text-ice-text-2';
    });
    expect(ps).toHaveLength(1);
    expect(collectText(ps[0])).toBe('Run your code in a container');
  });

  it('renders one <span> per provider with the uppercase + 2xs class', () => {
    const tree = renderItem({
      component: makeComponent({ providers: ['aws', 'gcp', 'azure'] }),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const spans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('uppercase') && cn.includes('text-ice-2xs');
    });
    expect(spans).toHaveLength(3);
    expect(spans.map((s) => collectText(s))).toEqual(['aws', 'gcp', 'azure']);
  });
});

// ─── Tests: runtime chips ──────────────────────────────────────────────────

describe('ComponentItem — runtime chips', () => {
  it('does not render a chip container when component has no runtimes', () => {
    const tree = renderItem({
      component: makeComponent(),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const chipContainers = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('flex-wrap');
    });
    expect(chipContainers).toHaveLength(0);
  });

  it('renders one button per runtime when provided', () => {
    const tree = renderItem({
      component: makeComponent({
        runtimes: [
          { label: 'Node', value: 'Node.js 20' },
          { label: 'Python', value: 'Python 3.12' },
          { label: 'Go', value: 'Go 1.22' },
        ],
      }),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => collectText(b))).toEqual(['Node', 'Python', 'Go']);
  });

  it('marks the chip whose value === selectedRuntime as selected (categoryColor styling)', () => {
    mocks.selectedRuntimeRef.current = 'Python 3.12';
    const tree = renderItem({
      component: makeComponent({
        runtimes: [
          { label: 'Node', value: 'Node.js 20' },
          { label: 'Python', value: 'Python 3.12' },
        ],
      }),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    const pythonStyle = (buttons[1].props as { style: React.CSSProperties }).style;
    expect(pythonStyle.color).toBe('#22c55e');
    expect(pythonStyle.backgroundColor).toBe('#22c55e12');
    expect(pythonStyle.borderColor).toBe('#22c55e30');

    const nodeStyle = (buttons[0].props as { style: React.CSSProperties }).style;
    expect(nodeStyle.color).toBe('var(--ice-text-tertiary)');
    expect(nodeStyle.backgroundColor).toBeUndefined();
  });

  it('clicking a chip fires setSelectedRuntime with that runtime value', () => {
    mocks.selectedRuntimeRef.current = 'Node.js 20';
    const tree = renderItem({
      component: makeComponent({
        runtimes: [
          { label: 'Node', value: 'Node.js 20' },
          { label: 'Python', value: 'Python 3.12' },
        ],
      }),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    const onClick = (buttons[1].props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.setSelectedRuntimeSpy).toHaveBeenCalledWith('Python 3.12');
  });
});

// ─── Tests: handleDragStart ─────────────────────────────────────────────────

describe('ComponentItem — handleDragStart', () => {
  function buildDragEvent() {
    const setData = vi.fn();
    const setDragImage = vi.fn();
    const dataTransfer = {
      setData,
      setDragImage,
      effectAllowed: '' as string,
    };
    return {
      event: { dataTransfer } as unknown as React.DragEvent,
      setData,
      setDragImage,
      dataTransfer,
    };
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

  it('calls setIsDragging(true) and forwards block, name, provider via setData', () => {
    setupDocumentStubs();
    const tree = renderItem({
      component: makeComponent({ type: 'Database.Redis', name: 'Redis' }),
      selectedProvider: 'gcp',
      categoryColor: '#ef4444',
      staggerIndex: 0,
    });
    const rows = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props.draggable === true;
    });
    const onDragStart = (rows[0].props as { onDragStart: (e: React.DragEvent) => void }).onDragStart;
    const { event, setData } = buildDragEvent();
    onDragStart(event);
    expect(mocks.setIsDraggingSpy).toHaveBeenCalledWith(true);
    expect(setData).toHaveBeenCalledWith('application/ice-block', 'Database.Redis');
    expect(setData).toHaveBeenCalledWith('application/ice-block-name', 'Redis');
    expect(setData).toHaveBeenCalledWith('application/ice-block-provider', 'gcp');
  });

  it('writes JSON payload with description (no runtime) when no runtime selected', () => {
    setupDocumentStubs();
    mocks.selectedRuntimeRef.current = null;
    const tree = renderItem({
      component: makeComponent({ description: 'cache' }),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const rows = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props.draggable === true;
    });
    const onDragStart = (rows[0].props as { onDragStart: (e: React.DragEvent) => void }).onDragStart;
    const { event, setData } = buildDragEvent();
    onDragStart(event);
    const payloadCall = setData.mock.calls.find((c) => c[0] === 'application/ice-block-data');
    expect(payloadCall).toBeTruthy();
    expect(JSON.parse(payloadCall![1] as string)).toEqual({ description: 'cache' });
  });

  it('writes JSON payload with runtime field when a runtime is selected', () => {
    setupDocumentStubs();
    mocks.selectedRuntimeRef.current = 'Python 3.12';
    const tree = renderItem({
      component: makeComponent({
        description: 'fn',
        runtimes: [{ label: 'Python', value: 'Python 3.12' }],
      }),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const rows = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props.draggable === true;
    });
    const onDragStart = (rows[0].props as { onDragStart: (e: React.DragEvent) => void }).onDragStart;
    const { event, setData } = buildDragEvent();
    onDragStart(event);
    const payloadCall = setData.mock.calls.find((c) => c[0] === 'application/ice-block-data');
    expect(JSON.parse(payloadCall![1] as string)).toEqual({ description: 'fn', runtime: 'Python 3.12' });
  });

  it('sets effectAllowed = "move"', () => {
    setupDocumentStubs();
    const tree = renderItem({
      component: makeComponent(),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const rows = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props.draggable === true;
    });
    const onDragStart = (rows[0].props as { onDragStart: (e: React.DragEvent) => void }).onDragStart;
    const { event, dataTransfer } = buildDragEvent();
    onDragStart(event);
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  it('builds a drag-image element with category color accent and registers it via setDragImage', () => {
    const stubs = setupDocumentStubs();
    const tree = renderItem({
      component: makeComponent({ name: 'My Block' }),
      selectedProvider: 'aws',
      categoryColor: '#3b82f6',
      staggerIndex: 0,
    });
    const rows = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props.draggable === true;
    });
    const onDragStart = (rows[0].props as { onDragStart: (e: React.DragEvent) => void }).onDragStart;
    const { event, setDragImage } = buildDragEvent();
    onDragStart(event);
    expect(stubs.created).toHaveLength(1);
    expect(stubs.created[0].innerHTML).toContain('My Block');
    expect(stubs.created[0].innerHTML).toContain('border-left: 3px solid #3b82f6');
    expect(stubs.created[0].style.position).toBe('absolute');
    expect(stubs.created[0].style.top).toBe('-1000px');
    expect(setDragImage).toHaveBeenCalledWith(stubs.created[0], 0, 0);
    // setTimeout(...,0) fires synchronously in the stub — drag-image should be removed.
    expect(stubs.removed).toHaveLength(1);
    expect(stubs.removed[0]).toBe(stubs.created[0]);
  });

  it('renders the runtime label suffix in the drag-image when a runtime is selected', () => {
    const stubs = setupDocumentStubs();
    mocks.selectedRuntimeRef.current = 'Node.js 20';
    const tree = renderItem({
      component: makeComponent({
        name: 'Container',
        runtimes: [{ label: 'Node', value: 'Node.js 20' }],
      }),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const rows = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props.draggable === true;
    });
    const onDragStart = (rows[0].props as { onDragStart: (e: React.DragEvent) => void }).onDragStart;
    const { event } = buildDragEvent();
    onDragStart(event);
    expect(stubs.created[0].innerHTML).toContain('(Node.js 20)');
  });
});

// ─── Tests: handleDragEnd ───────────────────────────────────────────────────

describe('ComponentItem — handleDragEnd', () => {
  it('clears isDragging via setIsDragging(false)', () => {
    const tree = renderItem({
      component: makeComponent(),
      selectedProvider: 'aws',
      categoryColor: '#22c55e',
      staggerIndex: 0,
    });
    const rows = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props.draggable === true;
    });
    const onDragEnd = (rows[0].props as { onDragEnd: () => void }).onDragEnd;
    onDragEnd();
    expect(mocks.setIsDraggingSpy).toHaveBeenCalledWith(false);
  });
});
