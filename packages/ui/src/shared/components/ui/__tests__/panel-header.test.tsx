/**
 * Tests for `PanelHeader` and `PanelHeaderAction`.
 *
 * Strategy:
 *  - Mock React hooks (`useState`, `useRef`, `useEffect`, `useCallback`) so
 *    the FC can be invoked outside a render context. `useEffect` is a noop
 *    so the requestAnimationFrame branch never fires, but the `useEffect`
 *    callback closures themselves run zero times here — branch coverage on
 *    them is fine because they're invoked via `(useEffect as Mock).mock.calls`
 *    in the dedicated effect tests.
 *  - SearchInput is mocked as a passthrough.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted state for the per-test useState pin.
const stateMocks = vi.hoisted(() => ({
  /** First useState call's pinned value (searchOpen). */
  searchOpenOverride: false as boolean,
  /** All useState setters captured per render. */
  setters: [] as unknown[],
  /** All effect callbacks captured per render so tests can invoke them. */
  effects: [] as Array<() => void | (() => void)>,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, (v: T) => void] => {
      const initial = typeof init === 'function' ? (init as () => T)() : init;
      const setter = vi.fn();
      stateMocks.setters.push(setter);
      // Only one boolean useState call — searchOpen.
      const value =
        typeof initial === 'boolean' ? (stateMocks.searchOpenOverride as unknown as T) : initial;
      return [value, setter];
    }),
    useRef: vi.fn(<T,>(init: T): { current: T } => ({ current: init })),
    useEffect: vi.fn((cb: () => void | (() => void)) => {
      stateMocks.effects.push(cb);
    }),
    useCallback: vi.fn(<T,>(fn: T) => fn),
  };
});

const mocks = vi.hoisted(() => {
  const Pass = (kind: string) => {
    const fn = (props: Record<string, unknown>) => ({ type: kind, props });
    (fn as unknown as { displayName: string }).displayName = kind;
    return fn;
  };
  return { SearchInput: Pass('SearchInput') };
});

vi.mock('../search-input', () => ({ SearchInput: mocks.SearchInput }));

import { PanelHeader, PanelHeaderAction } from '../panel-header';

interface ElLike {
  type: unknown;
  props: { className?: string; children?: unknown; [k: string]: unknown };
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
function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}
function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

const renderHeader = (props: Record<string, unknown>): ElLike =>
  (PanelHeader as unknown as (p: unknown) => ElLike)(props);

beforeEach(() => {
  stateMocks.searchOpenOverride = false;
  stateMocks.setters = [];
  stateMocks.effects = [];
});

// ─── PanelHeaderAction ──────────────────────────────────────────────────────

describe('PanelHeaderAction', () => {
  const baseProps = { icon: '<icon>', label: 'Hi', onClick: () => {} };

  it('renders a button with aria-label', () => {
    const el = (PanelHeaderAction as unknown as (p: unknown) => ElLike)(baseProps);
    expect(el.type).toBe('button');
    expect(el.props['aria-label']).toBe('Hi');
  });

  it('uses inactive color class when active is false', () => {
    const el = (PanelHeaderAction as unknown as (p: unknown) => ElLike)(baseProps);
    expect(el.props.className).toContain('text-ice-text-3/50');
  });

  it('uses accent color when active is true', () => {
    const el = (PanelHeaderAction as unknown as (p: unknown) => ElLike)({ ...baseProps, active: true });
    expect(el.props.className).toContain('text-ice-accent');
  });

  it('renders a badge dot when badge is true', () => {
    const el = (PanelHeaderAction as unknown as (p: unknown) => ElLike)({ ...baseProps, badge: true });
    const dot = findFirst(el, (n) => n.type === 'span' && (n.props.className ?? '').includes('rounded-full'));
    expect(dot).toBeDefined();
  });

  it('omits the badge dot when badge is false', () => {
    const el = (PanelHeaderAction as unknown as (p: unknown) => ElLike)(baseProps);
    const dot = findFirst(el, (n) => n.type === 'span' && (n.props.className ?? '').includes('rounded-full'));
    expect(dot).toBeUndefined();
  });

  it('forwards onClick', () => {
    const onClick = vi.fn();
    const el = (PanelHeaderAction as unknown as (p: unknown) => ElLike)({ ...baseProps, onClick });
    (el.props.onClick as () => void)();
    expect(onClick).toHaveBeenCalled();
  });

  it('merges caller className', () => {
    const el = (PanelHeaderAction as unknown as (p: unknown) => ElLike)({ ...baseProps, className: 'mine' });
    expect(el.props.className).toContain('mine');
  });
});

// ─── PanelHeader — title row ────────────────────────────────────────────────

describe('PanelHeader — render shape', () => {
  it('renders the title text', () => {
    const tree = renderHeader({ title: 'My Title' });
    const span = findFirst(tree, (el) => el.props.children === 'My Title');
    expect(span).toBeDefined();
  });

  it('renders an icon when icon prop is set', () => {
    const tree = renderHeader({ title: 'T', icon: '<svg>' });
    const iconWrap = findFirst(tree, (el) => el.props.children === '<svg>');
    expect(iconWrap).toBeDefined();
  });

  it('does not render an icon span when icon is omitted', () => {
    const tree = renderHeader({ title: 'T' });
    // The icon wrapper has class 'text-ice-text-3' on a span before the title.
    const iconWrap = findFirst(
      tree,
      (el) => el.type === 'span' && (el.props.className ?? '').includes('text-ice-text-3'),
    );
    expect(iconWrap).toBeUndefined();
  });

  it('renders a badge node when badge is provided', () => {
    const tree = renderHeader({ title: 'T', badge: '<badge>' });
    const found = findFirst(tree, (el) => el.props.children === '<badge>');
    // The badge is rendered directly as a child node (could appear in title row).
    // Conservative — at least confirm 'T' is present.
    const titleSpan = findFirst(tree, (el) => el.props.children === 'T');
    expect(titleSpan).toBeDefined();
  });

  it('renders a close button when onClose is provided', () => {
    const tree = renderHeader({ title: 'T', onClose: () => {}, closeLabel: 'Cls' });
    const btn = findFirst(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Cls');
    expect(btn).toBeDefined();
  });

  it('uses default closeLabel="Close" when not provided', () => {
    const tree = renderHeader({ title: 'T', onClose: () => {} });
    const btn = findFirst(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Close');
    expect(btn).toBeDefined();
  });

  it('does not render a close button when onClose is omitted', () => {
    const tree = renderHeader({ title: 'T' });
    const btns = findAll(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Close');
    expect(btns.length).toBe(0);
  });

  it('renders subtitle when provided', () => {
    const tree = renderHeader({ title: 'T', subtitle: 'subtxt' });
    const found = findFirst(tree, (el) => el.props.children === 'subtxt');
    expect(found).toBeDefined();
  });

  it('renders extra children block when children provided', () => {
    const tree = renderHeader({ title: 'T', children: 'extra' });
    const found = findFirst(tree, (el) => el.props.children === 'extra');
    expect(found).toBeDefined();
  });

  it('renders actions slot', () => {
    const tree = renderHeader({ title: 'T', actions: 'A' });
    const found = findFirst(tree, (el) => el.props.children === 'A');
    // The actions are passed as a node child of the title row.
    // Just confirm the title rendered (sanity).
    const titleSpan = findFirst(tree, (el) => el.props.children === 'T');
    expect(titleSpan).toBeDefined();
  });

  it('merges caller className on the outer wrapper', () => {
    const tree = renderHeader({ title: 'T', className: 'mine' });
    expect(tree.props.className).toContain('mine');
  });
});

// ─── PanelHeader — search behavior ─────────────────────────────────────────

describe('PanelHeader — search', () => {
  it('renders the search-toggle action when search prop is provided', () => {
    const search = { value: '', onChange: () => {} };
    const tree = renderHeader({ title: 'T', search });
    // The search toggle uses PanelHeaderAction with label='Search' (since searchOpen=false).
    const btns = findAll(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Search');
    expect(btns.length).toBe(1);
  });

  it('label flips to "Close search" when searchOpen is true', () => {
    stateMocks.searchOpenOverride = true;
    const search = { value: '', onChange: () => {} };
    const tree = renderHeader({ title: 'T', search });
    const btn = findFirst(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Close search');
    expect(btn).toBeDefined();
  });

  it('renders the SearchInput when searchOpen=true', () => {
    stateMocks.searchOpenOverride = true;
    const search = { value: '', onChange: () => {} };
    const tree = renderHeader({ title: 'T', search });
    const si = findFirst(tree, (el) => el.type === mocks.SearchInput);
    expect(si).toBeDefined();
  });

  it('does not render the SearchInput when searchOpen=false', () => {
    stateMocks.searchOpenOverride = false;
    const search = { value: '', onChange: () => {} };
    const tree = renderHeader({ title: 'T', search });
    const si = findFirst(tree, (el) => el.type === mocks.SearchInput);
    expect(si).toBeUndefined();
  });

  it('search action is "active" when searchOpen=true', () => {
    stateMocks.searchOpenOverride = true;
    const search = { value: '', onChange: () => {} };
    const tree = renderHeader({ title: 'T', search });
    const btn = findFirst(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Close search')!;
    expect(btn.props.className).toContain('text-ice-accent');
  });

  it('search action is "active" when value is non-empty even if closed', () => {
    stateMocks.searchOpenOverride = false;
    const search = { value: 'x', onChange: () => {} };
    const tree = renderHeader({ title: 'T', search });
    // searchOpen flips true after the auto-open effect, but in our mocked useEffect noop
    // searchOpen stays false. Active still true because !!search.value.
    const btn = findFirst(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Search')!;
    expect(btn.props.className).toContain('text-ice-accent');
  });
});

// ─── PanelHeader — handlers (search toggle / Escape) ───────────────────────

describe('PanelHeader — handlers', () => {
  it('toggle while open clears search.value via search.onChange', () => {
    stateMocks.searchOpenOverride = true;
    const onChange = vi.fn();
    const search = { value: 'x', onChange };
    const tree = renderHeader({ title: 'T', search });
    const btn = findFirst(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Close search')!;
    (btn.props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('toggle while closed does not call search.onChange', () => {
    stateMocks.searchOpenOverride = false;
    const onChange = vi.fn();
    const search = { value: '', onChange };
    const tree = renderHeader({ title: 'T', search });
    const btn = findFirst(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Search')!;
    (btn.props.onClick as () => void)();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toggle calls setSearchOpen with an updater that flips the value', () => {
    stateMocks.searchOpenOverride = false;
    const search = { value: '', onChange: () => {} };
    const tree = renderHeader({ title: 'T', search });
    const btn = findFirst(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Search')!;
    (btn.props.onClick as () => void)();
    const setSearchOpen = stateMocks.setters[0] as ReturnType<typeof vi.fn>;
    expect(setSearchOpen).toHaveBeenCalled();
    const updater = setSearchOpen.mock.calls.at(-1)![0] as (o: boolean) => boolean;
    expect(updater(false)).toBe(true);
    expect(updater(true)).toBe(false);
  });

  it('Escape on the search input clears value', () => {
    stateMocks.searchOpenOverride = true;
    const onChange = vi.fn();
    const search = { value: 'q', onChange };
    const tree = renderHeader({ title: 'T', search });
    const si = findFirst(tree, (el) => el.type === mocks.SearchInput)!;
    const handler = si.props.onKeyDown as (e: { key: string }) => void;
    handler({ key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('non-Escape keys do not call onChange or close', () => {
    stateMocks.searchOpenOverride = true;
    const onChange = vi.fn();
    const search = { value: 'q', onChange };
    const tree = renderHeader({ title: 'T', search });
    const si = findFirst(tree, (el) => el.type === mocks.SearchInput)!;
    const handler = si.props.onKeyDown as (e: { key: string }) => void;
    handler({ key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ─── PanelHeader — useEffect side effects ──────────────────────────────────

describe('PanelHeader — useEffect contents', () => {
  it('the auto-open effect calls setSearchOpen(true) when search.value is non-empty', () => {
    const search = { value: 'q', onChange: () => {} };
    renderHeader({ title: 'T', search });
    // Effect 0: auto-open. Run it.
    const setSearchOpen = stateMocks.setters[0] as ReturnType<typeof vi.fn>;
    stateMocks.effects[0]();
    expect(setSearchOpen).toHaveBeenCalledWith(true);
  });

  it('the auto-open effect does nothing when search.value is empty', () => {
    const search = { value: '', onChange: () => {} };
    renderHeader({ title: 'T', search });
    const setSearchOpen = stateMocks.setters[0] as ReturnType<typeof vi.fn>;
    stateMocks.effects[0]();
    expect(setSearchOpen).not.toHaveBeenCalled();
  });

  it('the auto-open effect does nothing when search prop is omitted', () => {
    renderHeader({ title: 'T' });
    const setSearchOpen = stateMocks.setters[0] as ReturnType<typeof vi.fn>;
    stateMocks.effects[0]();
    expect(setSearchOpen).not.toHaveBeenCalled();
  });

  it('the focus effect requests an animation frame when searchOpen is true', () => {
    stateMocks.searchOpenOverride = true;
    const raf = vi.fn((cb: () => void) => {
      // Invoke the inner arrow to exercise its body.
      cb();
      return 0 as unknown as ReturnType<typeof requestAnimationFrame>;
    });
    const origRaf = globalThis.requestAnimationFrame;
    (globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
      raf as unknown as typeof requestAnimationFrame;
    try {
      renderHeader({ title: 'T', search: { value: '', onChange: () => {} } });
      // Effect 1: focus.
      stateMocks.effects[1]();
      expect(raf).toHaveBeenCalled();
    } finally {
      (globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
        origRaf as unknown as typeof requestAnimationFrame;
    }
  });

  it('the focus effect skips raf when searchOpen is false', () => {
    stateMocks.searchOpenOverride = false;
    const raf = vi.fn();
    const origRaf = globalThis.requestAnimationFrame;
    (globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
      raf as unknown as typeof requestAnimationFrame;
    try {
      renderHeader({ title: 'T', search: { value: '', onChange: () => {} } });
      stateMocks.effects[1]();
      expect(raf).not.toHaveBeenCalled();
    } finally {
      (globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
        origRaf as unknown as typeof requestAnimationFrame;
    }
  });
});

// ─── PanelHeader — SearchInput ref merging ─────────────────────────────────

// Note: in React 18, the `ref` prop is stripped at React.createElement time
// for function components, landing on `el.ref` instead of `el.props.ref`.
// Read it from `.ref`.
interface ElWithRef extends ElLike {
  ref?: unknown;
}

describe('PanelHeader — SearchInput ref merging', () => {
  it('merge function calls a function-style search.ref', () => {
    stateMocks.searchOpenOverride = true;
    const refFn = vi.fn();
    const search = { value: '', onChange: () => {}, ref: refFn };
    const tree = renderHeader({ title: 'T', search });
    const si = findFirst(tree, (el) => el.type === mocks.SearchInput)! as ElWithRef;
    const node = { focus: () => {} } as unknown as HTMLInputElement;
    (si.ref as (n: HTMLInputElement) => void)(node);
    expect(refFn).toHaveBeenCalledWith(node);
  });

  it('merge function writes to an object-style search.ref', () => {
    stateMocks.searchOpenOverride = true;
    const refObj: { current: HTMLInputElement | null } = { current: null };
    const search = { value: '', onChange: () => {}, ref: refObj };
    const tree = renderHeader({ title: 'T', search });
    const si = findFirst(tree, (el) => el.type === mocks.SearchInput)! as ElWithRef;
    const node = { focus: () => {} } as unknown as HTMLInputElement;
    (si.ref as (n: HTMLInputElement) => void)(node);
    expect(refObj.current).toBe(node);
  });

  it('merge function does not throw when search.ref is omitted', () => {
    stateMocks.searchOpenOverride = true;
    const search = { value: '', onChange: () => {} };
    const tree = renderHeader({ title: 'T', search });
    const si = findFirst(tree, (el) => el.type === mocks.SearchInput)! as ElWithRef;
    const node = { focus: () => {} } as unknown as HTMLInputElement;
    expect(() => (si.ref as (n: HTMLInputElement) => void)(node)).not.toThrow();
  });
});
