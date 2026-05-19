/**
 * Tests for `Combobox` — searchable dropdown built on plain HTML.
 *
 * Strategy:
 *  - Mock React hooks (useState/useRef/useCallback/useEffect/useMemo) so the
 *    FC can be invoked outside a render context.
 *  - Mock `react-dom.createPortal` to identity-passthrough so the dropdown
 *    JSX is observable in the walked tree.
 *  - Mock `i18n.t` to identity translation.
 *
 * Branch coverage targets:
 *  - filtering: empty query, query matches label, query matches description,
 *  - active item highlighting,
 *  - empty/loading states,
 *  - badge with/without description,
 *  - selected option label,
 *  - clear vs chevron rendering,
 *  - keyboard handler: closed → ArrowDown/Enter, open → ArrowDown/ArrowUp/Enter/Escape,
 *  - outside-click handler,
 *  - portal-element creation effect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const stateMocks = vi.hoisted(() => ({
  /** values for each useState call, indexed by call order. */
  pinnedSlots: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  /** counter reset per render */
  stateCounter: 0,
  effects: [] as Array<{ deps: unknown[]; cb: () => void | (() => void) }>,
  refs: [] as Array<{ current: unknown }>,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(<T,>(init: T | (() => T)): [T, ReturnType<typeof vi.fn>] => {
      const idx = stateMocks.stateCounter++;
      const initialValue = typeof init === 'function' ? (init as () => T)() : init;
      const setter = vi.fn();
      stateMocks.setters[idx] = setter;
      const value = idx in stateMocks.pinnedSlots ? (stateMocks.pinnedSlots[idx] as T) : initialValue;
      return [value, setter];
    }),
    useRef: vi.fn(<T,>(init: T): { current: T } => {
      const ref = { current: init };
      stateMocks.refs.push(ref as unknown as { current: unknown });
      return ref;
    }),
    useCallback: vi.fn(<T,>(fn: T) => fn),
    useMemo: vi.fn((factory: () => unknown) => factory()),
    useEffect: vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
      stateMocks.effects.push({ cb, deps: deps ?? [] });
    }),
  };
});

const portalMock = vi.hoisted(() => ({
  createPortal: vi.fn((node: unknown, _container: unknown) => node),
}));

vi.mock('react-dom', () => portalMock);

const i18nMock = vi.hoisted(() => ({
  t: (k: string) => k,
}));

// vi.mock paths resolve relative to the TEST file, not the SUT.
// The SUT imports from '../../../i18n' (3 ../ from src/shared/components/ui).
// The TEST file lives at src/shared/components/ui/__tests__, so we need 4 ../.
vi.mock('../../../../i18n', () => i18nMock);

import { Combobox, type ComboboxOption } from '../combobox';

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

const opts3: ComboboxOption[] = [
  { value: 'a', label: 'Apple', description: 'fruit', badge: 'red' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry', description: 'small' },
];

const baseProps = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  value: '',
  options: opts3,
  onSelect: () => {},
  ...over,
});

const render = (props: Record<string, unknown>): ElLike => (Combobox as unknown as (p: unknown) => ElLike)(props);

beforeEach(() => {
  stateMocks.pinnedSlots = {};
  stateMocks.setters = [];
  stateMocks.stateCounter = 0;
  stateMocks.effects = [];
  stateMocks.refs = [];
  portalMock.createPortal.mockClear();
  // Stub document for portal-creation effect
  (globalThis as unknown as { document: Document }).document = {
    getElementById: vi.fn(() => null),
    createElement: vi.fn(() => ({ id: '', appendChild: vi.fn() })),
    body: { appendChild: vi.fn(), contains: vi.fn(() => false) },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Document;
});

// useState slot order in Combobox source:
//  0: open (false)
//  1: query ('')
//  2: activeIndex (0)
//  3: dropdownPos ({ top: 0, left: 0, width: 0 })

describe('Combobox — closed shape', () => {
  it('renders an outer wrapper div with relative class', () => {
    const tree = render(baseProps());
    expect(tree.type).toBe('div');
    expect(tree.props.className).toContain('relative');
  });

  it('renders an input', () => {
    const tree = render(baseProps());
    const input = findFirst(tree, (el) => el.type === 'input');
    expect(input).toBeDefined();
  });

  it('input value is the selected label when not open and value is set', () => {
    const tree = render(baseProps({ value: 'a' }));
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.value).toBe('Apple');
  });

  it('input value is empty string when no value set and not open', () => {
    const tree = render(baseProps());
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.value).toBe('');
  });

  it('input placeholder defaults to translation key when value empty', () => {
    const tree = render(baseProps());
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.placeholder).toBe('combobox.defaultPlaceholder');
  });

  it('uses custom placeholder', () => {
    const tree = render(baseProps({ placeholder: 'Pick' }));
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.placeholder).toBe('Pick');
  });

  it('placeholder reflects selected label when value set (so caller sees current pick)', () => {
    const tree = render(baseProps({ value: 'b' }));
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.placeholder).toBe('Banana');
  });

  it('renders the chevron when no value and not open', () => {
    const tree = render(baseProps());
    // chevron container has 'pointer-events-none'
    const chev = findFirst(
      tree,
      (el) => el.type === 'div' && (el.props.className ?? '').includes('pointer-events-none'),
    );
    expect(chev).toBeDefined();
  });

  it('renders the clear button when value is set and not open', () => {
    const tree = render(baseProps({ value: 'a' }));
    const btn = findFirst(tree, (el) => el.type === 'button');
    expect(btn).toBeDefined();
  });

  it('does not render the dropdown when not open', () => {
    const tree = render(baseProps());
    expect(portalMock.createPortal).not.toHaveBeenCalled();
  });
});

describe('Combobox — sizing variants', () => {
  it('uses h-7 (default-size) when compact is false', () => {
    const tree = render(baseProps());
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.className).toContain('h-7');
  });

  it('uses h-6 when compact is true', () => {
    const tree = render(baseProps({ compact: true }));
    const input = findFirst(tree, (el) => el.type === 'input')!;
    expect(input.props.className).toContain('h-6');
  });
});

describe('Combobox — clear button', () => {
  it('clear button onClick calls onSelect with empty', () => {
    const onSelect = vi.fn();
    const tree = render(baseProps({ value: 'a', onSelect }));
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    (btn.props.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: () => {} });
    expect(onSelect).toHaveBeenCalledWith('');
  });

  it('clear button onMouseDown stops propagation without calling onSelect', () => {
    const onSelect = vi.fn();
    const tree = render(baseProps({ value: 'a', onSelect }));
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    const stop = vi.fn();
    (btn.props.onMouseDown as (e: { stopPropagation: () => void }) => void)({ stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('Combobox — open dropdown', () => {
  it('renders the dropdown via createPortal when open=true', () => {
    stateMocks.pinnedSlots = { 0: true };
    const tree = render(baseProps());
    // walk into createPortal arg (we inlined it)
    expect(portalMock.createPortal).toHaveBeenCalled();
  });

  it('renders one item div per option when no query', () => {
    stateMocks.pinnedSlots = { 0: true };
    const tree = render(baseProps());
    // Items are divs with onMouseDown handler that also stops propagation
    const items = findAll(
      tree,
      (el) =>
        el.type === 'div' && typeof el.props.onMouseEnter === 'function' && typeof el.props.onMouseDown === 'function',
    );
    expect(items.length).toBe(opts3.length);
  });

  it('filters items by label match in query', () => {
    stateMocks.pinnedSlots = { 0: true, 1: 'app' };
    const tree = render(baseProps());
    const items = findAll(
      tree,
      (el) =>
        el.type === 'div' && typeof el.props.onMouseEnter === 'function' && typeof el.props.onMouseDown === 'function',
    );
    expect(items.length).toBe(1);
  });

  it('filters items by description match in query', () => {
    stateMocks.pinnedSlots = { 0: true, 1: 'small' };
    const tree = render(baseProps());
    const items = findAll(
      tree,
      (el) =>
        el.type === 'div' && typeof el.props.onMouseEnter === 'function' && typeof el.props.onMouseDown === 'function',
    );
    expect(items.length).toBe(1);
  });

  it('renders empty-text when filtered list is empty and not loading', () => {
    stateMocks.pinnedSlots = { 0: true, 1: 'zzz' };
    const tree = render(baseProps({ emptyText: 'NoMatches' }));
    const empty = findFirst(tree, (el) => el.props.children === 'NoMatches');
    expect(empty).toBeDefined();
  });

  it('falls back to translation key emptyText', () => {
    stateMocks.pinnedSlots = { 0: true, 1: 'zzz' };
    const tree = render(baseProps());
    const empty = findFirst(tree, (el) => el.props.children === 'combobox.defaultEmptyText');
    expect(empty).toBeDefined();
  });

  it('renders loading text when loading=true (and items list suppressed)', () => {
    stateMocks.pinnedSlots = { 0: true };
    const tree = render(baseProps({ loading: true }));
    const loading = findFirst(tree, (el) => el.props.children === 'combobox.loading');
    expect(loading).toBeDefined();
    // Items not rendered while loading
    const items = findAll(
      tree,
      (el) =>
        el.type === 'div' && typeof el.props.onMouseEnter === 'function' && typeof el.props.onMouseDown === 'function',
    );
    expect(items.length).toBe(0);
  });
});

describe('Combobox — option visuals', () => {
  it('shows badge inline next to description when both present', () => {
    stateMocks.pinnedSlots = { 0: true };
    const tree = render(baseProps());
    // Apple has description+badge; assert presence of "red" string somewhere.
    const badgeWrap = findFirst(tree, (el) => el.props.children === 'red');
    expect(badgeWrap).toBeDefined();
  });

  it('shows badge as standalone span when no description', () => {
    stateMocks.pinnedSlots = { 0: true };
    const opt: ComboboxOption[] = [{ value: 'x', label: 'X', badge: 'beta' }];
    const tree = render(baseProps({ options: opt }));
    const badge = findFirst(tree, (el) => el.props.children === 'beta');
    expect(badge).toBeDefined();
  });

  it('selected option uses text-blue-400 highlight', () => {
    stateMocks.pinnedSlots = { 0: true };
    const tree = render(baseProps({ value: 'a' }));
    const items = findAll(
      tree,
      (el) =>
        el.type === 'div' && typeof el.props.onMouseEnter === 'function' && typeof el.props.onMouseDown === 'function',
    );
    const selected = items.find((el) => (el.props.className ?? '').includes('text-blue-400'));
    expect(selected).toBeDefined();
  });

  it('active item uses bg-blue-600/30 highlight', () => {
    stateMocks.pinnedSlots = { 0: true, 2: 1 }; // activeIndex = 1
    const tree = render(baseProps());
    const items = findAll(
      tree,
      (el) =>
        el.type === 'div' && typeof el.props.onMouseEnter === 'function' && typeof el.props.onMouseDown === 'function',
    );
    const active = items.find((el) => (el.props.className ?? '').includes('bg-blue-600/30'));
    expect(active).toBeDefined();
  });

  it('item onMouseEnter sets activeIndex to its position', () => {
    stateMocks.pinnedSlots = { 0: true };
    const tree = render(baseProps());
    const items = findAll(
      tree,
      (el) =>
        el.type === 'div' && typeof el.props.onMouseEnter === 'function' && typeof el.props.onMouseDown === 'function',
    );
    (items[1].props.onMouseEnter as () => void)();
    // Setter for activeIndex (slot 2)
    const setActive = stateMocks.setters[2] as ReturnType<typeof vi.fn>;
    expect(setActive).toHaveBeenCalledWith(1);
  });

  it('item onMouseDown selects, closes, clears query', () => {
    const onSelect = vi.fn();
    stateMocks.pinnedSlots = { 0: true };
    const tree = render(baseProps({ onSelect }));
    const items = findAll(
      tree,
      (el) =>
        el.type === 'div' && typeof el.props.onMouseEnter === 'function' && typeof el.props.onMouseDown === 'function',
    );
    const stop = vi.fn();
    const prevent = vi.fn();
    (items[2].props.onMouseDown as (e: { preventDefault: () => void; stopPropagation: () => void }) => void)({
      preventDefault: prevent,
      stopPropagation: stop,
    });
    expect(onSelect).toHaveBeenCalledWith('c');
    expect(prevent).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    // setOpen(false), setQuery('')
    expect(stateMocks.setters[0]).toHaveBeenCalledWith(false);
    expect(stateMocks.setters[1]).toHaveBeenCalledWith('');
  });
});

describe('Combobox — input handlers', () => {
  it('input.onChange (when closed) sets query and opens', () => {
    const tree = render(baseProps());
    const input = findFirst(tree, (el) => el.type === 'input')!;
    (input.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'q' } });
    expect(stateMocks.setters[1]).toHaveBeenCalledWith('q'); // setQuery
    expect(stateMocks.setters[0]).toHaveBeenCalledWith(true); // setOpen
  });

  it('input.onChange (when already open) sets query and does NOT call setOpen', () => {
    stateMocks.pinnedSlots = { 0: true };
    const tree = render(baseProps());
    const input = findFirst(tree, (el) => el.type === 'input')!;
    (input.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'q' } });
    expect(stateMocks.setters[1]).toHaveBeenCalledWith('q');
    expect(stateMocks.setters[0]).not.toHaveBeenCalled();
  });

  it('input.onFocus opens the combobox', () => {
    const tree = render(baseProps());
    const input = findFirst(tree, (el) => el.type === 'input')!;
    (input.props.onFocus as () => void)();
    expect(stateMocks.setters[0]).toHaveBeenCalledWith(true);
  });

  it('input.onClick stops propagation', () => {
    const tree = render(baseProps());
    const input = findFirst(tree, (el) => el.type === 'input')!;
    const stop = vi.fn();
    (input.props.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
  });

  it('input.onMouseDown stops propagation', () => {
    const tree = render(baseProps());
    const input = findFirst(tree, (el) => el.type === 'input')!;
    const stop = vi.fn();
    (input.props.onMouseDown as (e: { stopPropagation: () => void }) => void)({ stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
  });
});

describe('Combobox — keyboard navigation', () => {
  function callKey(props: Record<string, unknown>, key: string) {
    const tree = render(props);
    const input = findFirst(tree, (el) => el.type === 'input')!;
    const prevent = vi.fn();
    (input.props.onKeyDown as (e: { key: string; preventDefault: () => void }) => void)({
      key,
      preventDefault: prevent,
    });
    return { prevent };
  }

  it('closed + ArrowDown opens', () => {
    const { prevent } = callKey(baseProps(), 'ArrowDown');
    expect(prevent).toHaveBeenCalled();
    expect(stateMocks.setters[0]).toHaveBeenCalledWith(true);
  });

  it('closed + Enter opens', () => {
    callKey(baseProps(), 'Enter');
    expect(stateMocks.setters[0]).toHaveBeenCalledWith(true);
  });

  it('closed + non-handled key does nothing', () => {
    const { prevent } = callKey(baseProps(), 'a');
    expect(prevent).not.toHaveBeenCalled();
    expect(stateMocks.setters[0]).not.toHaveBeenCalled();
  });

  it('open + ArrowDown increments activeIndex (clamped)', () => {
    stateMocks.pinnedSlots = { 0: true, 2: 0 };
    const { prevent } = callKey(baseProps(), 'ArrowDown');
    expect(prevent).toHaveBeenCalled();
    const setActive = stateMocks.setters[2] as ReturnType<typeof vi.fn>;
    expect(setActive).toHaveBeenCalled();
    const updater = setActive.mock.calls[0][0] as (i: number) => number;
    expect(updater(0)).toBe(1);
    expect(updater(opts3.length - 1)).toBe(opts3.length - 1);
  });

  it('open + ArrowUp decrements activeIndex (clamped at 0)', () => {
    stateMocks.pinnedSlots = { 0: true };
    callKey(baseProps(), 'ArrowUp');
    const setActive = stateMocks.setters[2] as ReturnType<typeof vi.fn>;
    const updater = setActive.mock.calls[0][0] as (i: number) => number;
    expect(updater(2)).toBe(1);
    expect(updater(0)).toBe(0);
  });

  it('open + Enter selects current activeIndex', () => {
    const onSelect = vi.fn();
    stateMocks.pinnedSlots = { 0: true, 2: 1 };
    callKey(baseProps({ onSelect }), 'Enter');
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('open + Enter does not call onSelect when filtered list is empty at index', () => {
    const onSelect = vi.fn();
    stateMocks.pinnedSlots = { 0: true, 2: 99 }; // out of range
    callKey(baseProps({ onSelect }), 'Enter');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('open + Escape closes and clears', () => {
    stateMocks.pinnedSlots = { 0: true };
    callKey(baseProps(), 'Escape');
    expect(stateMocks.setters[0]).toHaveBeenCalledWith(false);
    expect(stateMocks.setters[1]).toHaveBeenCalledWith('');
  });

  it('open + non-handled key falls through (no setter call)', () => {
    stateMocks.pinnedSlots = { 0: true };
    const { prevent } = callKey(baseProps(), 'q');
    expect(prevent).not.toHaveBeenCalled();
  });
});

describe('Combobox — useEffect bodies', () => {
  it('the active-index reset effect resets to 0', () => {
    render(baseProps());
    // Effect 0: setActiveIndex(0). Find by deps shape — dep is filtered.length.
    // Here: 5 effects total. Reset effect dep contains a number.
    const effect = stateMocks.effects[0]; // index-reset
    effect.cb();
    const setActive = stateMocks.setters[2] as ReturnType<typeof vi.fn>;
    expect(setActive).toHaveBeenCalledWith(0);
  });

  it('the scroll-into-view effect: when not open, no-ops', () => {
    render(baseProps());
    // Effect 1: scroll-into-view; should early-return when listRef.current is null.
    expect(() => stateMocks.effects[1].cb()).not.toThrow();
  });

  it('the scroll-into-view effect: when open and listRef has a child at activeIndex, scrolls', () => {
    stateMocks.pinnedSlots = { 0: true, 2: 1 };
    render(baseProps());
    // listRef is one of the refs; it's the third ref (index 2).
    const scrollSpy = vi.fn();
    const listRef = stateMocks.refs[2];
    listRef.current = {
      children: { 1: { scrollIntoView: scrollSpy } as unknown as HTMLElement },
    } as unknown;
    stateMocks.effects[1].cb();
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('the outside-click effect: when not open, no-ops; when open, registers and cleans up', () => {
    stateMocks.pinnedSlots = { 0: true };
    render(baseProps());
    // Effect 2: outside-click. We registered addEventListener.
    const cleanup = stateMocks.effects[2].cb() as (() => void) | undefined;
    expect(globalThis.document.addEventListener as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(cleanup).toBeTypeOf('function');
    cleanup?.();
    expect(globalThis.document.removeEventListener as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });

  it('the outside-click effect early-returns when open is false (no listener attached)', () => {
    // open defaults to false here.
    render(baseProps());
    const out = stateMocks.effects[2].cb();
    // Should NOT register a listener and should return undefined.
    expect(out).toBeUndefined();
    expect(globalThis.document.addEventListener as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('outside-click handler closes when click outside container and outside portal', () => {
    stateMocks.pinnedSlots = { 0: true };
    render(baseProps());
    // Manually capture the handler
    let registeredHandler: undefined | ((e: MouseEvent) => void);
    const addSpy = globalThis.document.addEventListener as unknown as ReturnType<typeof vi.fn>;
    addSpy.mockImplementation((_evt: string, h: (e: MouseEvent) => void) => {
      registeredHandler = h;
    });
    stateMocks.effects[2].cb();
    expect(registeredHandler).toBeTypeOf('function');
    // Make containerRef have a value with contains() returning false
    const containerRef = stateMocks.refs[1];
    containerRef.current = { contains: () => false } as unknown;
    registeredHandler?.({ target: {} } as unknown as MouseEvent);
    expect(stateMocks.setters[0]).toHaveBeenCalledWith(false);
  });

  it('outside-click handler does nothing when click is inside container', () => {
    stateMocks.pinnedSlots = { 0: true };
    render(baseProps());
    let registeredHandler: undefined | ((e: MouseEvent) => void);
    const addSpy = globalThis.document.addEventListener as unknown as ReturnType<typeof vi.fn>;
    addSpy.mockImplementation((_evt: string, h: (e: MouseEvent) => void) => {
      registeredHandler = h;
    });
    stateMocks.effects[2].cb();
    const containerRef = stateMocks.refs[1];
    containerRef.current = { contains: () => true } as unknown;
    registeredHandler?.({ target: {} } as unknown as MouseEvent);
    // setOpen not called
    expect(stateMocks.setters[0]).not.toHaveBeenCalled();
  });

  it('outside-click handler skips closing when target is inside the portal', () => {
    stateMocks.pinnedSlots = { 0: true };
    const portalEl = { contains: () => true };
    (globalThis.document.getElementById as unknown as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      id === 'ice-combobox-portal' ? portalEl : null,
    );
    render(baseProps());
    let registeredHandler: undefined | ((e: MouseEvent) => void);
    const addSpy = globalThis.document.addEventListener as unknown as ReturnType<typeof vi.fn>;
    addSpy.mockImplementation((_evt: string, h: (e: MouseEvent) => void) => {
      registeredHandler = h;
    });
    stateMocks.effects[2].cb();
    const containerRef = stateMocks.refs[1];
    containerRef.current = { contains: () => false } as unknown;
    registeredHandler?.({ target: {} } as unknown as MouseEvent);
    expect(stateMocks.setters[0]).not.toHaveBeenCalled();
  });

  it('the dropdown-position effect: noop when closed', () => {
    render(baseProps());
    expect(() => stateMocks.effects[3].cb()).not.toThrow();
  });

  it('the dropdown-position effect: when open, reads getBoundingClientRect and calls setDropdownPos', () => {
    stateMocks.pinnedSlots = { 0: true };
    render(baseProps());
    const containerRef = stateMocks.refs[1];
    containerRef.current = {
      getBoundingClientRect: () => ({ top: 10, bottom: 30, left: 5, width: 100 }),
    } as unknown;
    stateMocks.effects[3].cb();
    const setDropdownPos = stateMocks.setters[3] as ReturnType<typeof vi.fn>;
    expect(setDropdownPos).toHaveBeenCalledWith({ top: 32, left: 5, width: 100 });
  });

  it('the portal-creation effect creates the portal element when missing', () => {
    const append = vi.fn();
    const created = { id: '', appendChild: vi.fn() };
    (globalThis.document as unknown as { createElement: (tag: string) => unknown }).createElement = vi.fn(
      () => created,
    );
    (globalThis.document as unknown as { body: { appendChild: (n: unknown) => void } }).body = {
      appendChild: append,
    } as unknown as { appendChild: (n: unknown) => void };
    (globalThis.document as unknown as { getElementById: (id: string) => null }).getElementById = vi.fn(() => null);
    render(baseProps());
    // Last effect is portal creation.
    stateMocks.effects[4].cb();
    expect(created.id).toBe('ice-combobox-portal');
    expect(append).toHaveBeenCalledWith(created);
  });

  it('the portal-creation effect skips when the portal already exists', () => {
    const append = vi.fn();
    (globalThis.document as unknown as { body: { appendChild: (n: unknown) => void } }).body = {
      appendChild: append,
    } as unknown as { appendChild: (n: unknown) => void };
    (globalThis.document as unknown as { getElementById: (id: string) => unknown }).getElementById = vi.fn(() => ({}));
    render(baseProps());
    stateMocks.effects[4].cb();
    expect(append).not.toHaveBeenCalled();
  });
});

describe('Combobox — outer wrapper className', () => {
  it('merges caller className', () => {
    const tree = render(baseProps({ className: 'mine' }));
    expect(tree.props.className).toContain('mine');
  });
});

describe('Combobox — dropdown body', () => {
  it('dropdown wrapper onMouseDown stops propagation', () => {
    stateMocks.pinnedSlots = { 0: true };
    const tree = render(baseProps());
    // Find the fixed-position wrapper in the dropdown
    const fixedWrap = findFirst(
      tree,
      (el) => el.type === 'div' && (el.props.style as { position?: string })?.position === 'fixed',
    )!;
    const stop = vi.fn();
    (fixedWrap.props.onMouseDown as (e: { stopPropagation: () => void }) => void)({ stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
  });

  it('createPortal is invoked with the portal element when present', () => {
    stateMocks.pinnedSlots = { 0: true };
    const portalEl = { id: 'ice-combobox-portal' };
    (globalThis.document as unknown as { getElementById: (id: string) => unknown }).getElementById = vi.fn(
      (id: string) => (id === 'ice-combobox-portal' ? portalEl : null),
    );
    render(baseProps());
    expect(portalMock.createPortal).toHaveBeenCalled();
    const args = portalMock.createPortal.mock.calls[0];
    expect(args[1]).toBe(portalEl);
  });

  it('createPortal falls back to body when the portal element is missing', () => {
    stateMocks.pinnedSlots = { 0: true };
    const body = { appendChild: vi.fn() };
    (globalThis.document as unknown as { body: unknown }).body = body;
    (globalThis.document as unknown as { getElementById: (id: string) => null }).getElementById = vi.fn(() => null);
    render(baseProps());
    const args = portalMock.createPortal.mock.calls[0];
    expect(args[1]).toBe(body);
  });
});
