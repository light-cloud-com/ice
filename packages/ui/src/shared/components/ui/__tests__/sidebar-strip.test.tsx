/**
 * Tests for `SidebarStrip` — narrow vertical bar with stacked icon buttons.
 *
 * Covers:
 *  - early `null` return when tabs.length === 0
 *  - 'left' vs 'right' border-side branch
 *  - active vs inactive button styling and active indicator bar
 *  - left-side rotate(180deg) transform vs right-side undefined
 *  - onClick wiring
 */

import { describe, it, expect, vi } from 'vitest';
import { SidebarStrip, type SidebarStripTab } from '../sidebar-strip';

interface ElLike {
  type: unknown;
  props: { className?: string; children?: unknown; style?: Record<string, unknown>; [k: string]: unknown };
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
  if (typeof node.type === 'function') {
    try {
      yield* walk((node.type as (p: unknown) => unknown)(node.props));
    } catch {
      /* skip */
    }
    return;
  }
  yield* walk(node.props.children);
}
function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}
function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}

const FakeIcon = (props: Record<string, unknown>) => ({ type: 'fake-icon', props });

const render = (props: Record<string, unknown>): unknown =>
  (SidebarStrip as unknown as (p: unknown) => unknown)(props);

describe('SidebarStrip — empty', () => {
  it('returns null when tabs is empty', () => {
    const out = render({ side: 'left', tabs: [] });
    expect(out).toBeNull();
  });
});

describe('SidebarStrip — orientation', () => {
  const oneTab: SidebarStripTab = {
    id: 't1',
    label: 'Tab 1',
    icon: FakeIcon as unknown as React.ElementType,
    active: false,
    onClick: () => {},
  };

  it('uses border-r when side="left"', () => {
    const out = render({ side: 'left', tabs: [oneTab] }) as ElLike;
    expect(out.props.className).toContain('border-r');
    expect(out.props.className).not.toContain('border-l');
  });

  it('uses border-l when side="right"', () => {
    const out = render({ side: 'right', tabs: [oneTab] }) as ElLike;
    expect(out.props.className).toContain('border-l');
  });

  it('sets a fixed 28px width via inline style', () => {
    const out = render({ side: 'left', tabs: [oneTab] }) as ElLike;
    expect(out.props.style).toEqual({ width: 28 });
  });
});

describe('SidebarStrip — buttons', () => {
  const tab = (overrides: Partial<SidebarStripTab>): SidebarStripTab => ({
    id: 'x',
    label: 'X',
    icon: FakeIcon as unknown as React.ElementType,
    active: false,
    onClick: () => {},
    ...overrides,
  });

  it('renders one <button> per tab', () => {
    const out = render({
      side: 'left',
      tabs: [tab({ id: 'a' }), tab({ id: 'b' }), tab({ id: 'c' })],
    });
    const btns = findAll(out, (el) => el.type === 'button');
    expect(btns.length).toBe(3);
  });

  it('inactive button uses tertiary text class', () => {
    const out = render({ side: 'left', tabs: [tab({ active: false })] });
    const btn = findFirst(out, (el) => el.type === 'button')!;
    expect(btn.props.className).toContain('text-ice-text-tertiary');
  });

  it('active button uses accent text class and renders the active indicator bar', () => {
    const out = render({ side: 'left', tabs: [tab({ active: true })] });
    const btn = findFirst(out, (el) => el.type === 'button')!;
    expect(btn.props.className).toContain('text-ice-accent');
    // The active indicator is a div with bg-ice-accent
    const indicator = findFirst(out, (el) => el.type === 'div' && (el.props.className ?? '').includes('bg-ice-accent'));
    expect(indicator).toBeDefined();
  });

  it('active indicator bar is positioned on left when side=left', () => {
    const out = render({ side: 'left', tabs: [tab({ active: true })] });
    const indicator = findFirst(out, (el) => el.type === 'div' && (el.props.className ?? '').includes('bg-ice-accent'))!;
    expect(indicator.props.style).toEqual({ left: 0 });
  });

  it('active indicator bar is positioned on right when side=right', () => {
    const out = render({ side: 'right', tabs: [tab({ active: true })] });
    const indicator = findFirst(out, (el) => el.type === 'div' && (el.props.className ?? '').includes('bg-ice-accent'))!;
    expect(indicator.props.style).toEqual({ right: 0 });
  });

  it('inactive tabs do not render the indicator bar', () => {
    const out = render({ side: 'left', tabs: [tab({ active: false })] });
    const indicator = findFirst(out, (el) => el.type === 'div' && (el.props.className ?? '').includes('bg-ice-accent'));
    expect(indicator).toBeUndefined();
  });

  it('label span uses transform: rotate(180deg) on left side', () => {
    const out = render({ side: 'left', tabs: [tab({})] });
    const span = findFirst(
      out,
      (el) => el.type === 'span' && (el.props.style as { writingMode?: string })?.writingMode === 'vertical-lr',
    )!;
    expect(span.props.style?.transform).toBe('rotate(180deg)');
  });

  it('label span has undefined transform on right side', () => {
    const out = render({ side: 'right', tabs: [tab({})] });
    const span = findFirst(
      out,
      (el) => el.type === 'span' && (el.props.style as { writingMode?: string })?.writingMode === 'vertical-lr',
    )!;
    expect(span.props.style?.transform).toBeUndefined();
  });

  it('button onClick wires through to the tab', () => {
    const onClick = vi.fn();
    const out = render({ side: 'left', tabs: [tab({ onClick })] });
    const btn = findFirst(out, (el) => el.type === 'button')!;
    (btn.props.onClick as () => void)();
    expect(onClick).toHaveBeenCalled();
  });

  it('button title is the tab label', () => {
    const out = render({ side: 'left', tabs: [tab({ label: 'Hello' })] });
    const btn = findFirst(out, (el) => el.type === 'button')!;
    expect(btn.props.title).toBe('Hello');
  });

  it('button gets a data-tour-id derived from tab.id (sidebar-strip-${id})', () => {
    const out = render({ side: 'right', tabs: [tab({ id: 'cost' })] });
    const btn = findFirst(out, (el) => el.type === 'button')!;
    expect(btn.props['data-tour-id']).toBe('sidebar-strip-cost');
  });
});
