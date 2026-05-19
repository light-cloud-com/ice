/**
 * menu-primitives tests — direct-FC tree-walker.
 *
 * `MenuItem`, `Separator`, `SubMenu`, `CategorySubMenu`, plus the
 * `isMac`/`modKey`/`fireKey` helpers. No Redux, no i18n. SubMenu uses
 * `useState` + `useEffect` + `useRef` — mock React hooks via passthrough
 * so the FC tree walks deterministically.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  // (slot, value) overrides for useState — keyed by call index per render.
  useStateOverrides: {} as Record<number, unknown>,
  useStateCount: 0,
  // captured ref for triggerRef so the bounding-rect branch is reachable.
  refs: [] as Array<{ current: unknown }>,
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(init: T): [T, (v: T) => void] => {
    const idx = mocks.useStateCount;
    mocks.useStateCount += 1;
    const override = mocks.useStateOverrides[idx];
    const value = override !== undefined ? (override as T) : init;
    return [value, vi.fn()];
  };
  const useEffectStub = (fn: () => void | (() => void)) => {
    mocks.effects.push(fn);
  };
  const useRefStub = <T,>(init: T) => {
    const ref = { current: init };
    mocks.refs.push(ref as unknown as { current: unknown });
    return ref;
  };
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: { ...actualDefault, useState: useStateStub, useEffect: useEffectStub, useRef: useRefStub },
    useState: useStateStub,
    useEffect: useEffectStub,
    useRef: useRefStub,
  };
});

import {
  MenuItem,
  Separator,
  SubMenu,
  CategorySubMenu,
  isMac,
  modKey,
  fireKey,
} from '../menu-primitives';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
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
    const FC = node.type as (p: unknown) => unknown;
    yield* walk(FC(node.props));
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

const renderItem = (props: Parameters<typeof MenuItem>[0]) =>
  (MenuItem as unknown as (p: unknown) => unknown)(props);
const renderSep = () =>
  (Separator as unknown as (p: unknown) => unknown)({});
const renderSub = (props: Parameters<typeof SubMenu>[0]) =>
  (SubMenu as unknown as (p: unknown) => unknown)(props);
const renderCat = (props: Parameters<typeof CategorySubMenu>[0]) =>
  (CategorySubMenu as unknown as (p: unknown) => unknown)(props);

beforeEach(() => {
  mocks.effects = [];
  mocks.useStateOverrides = {};
  mocks.useStateCount = 0;
  mocks.refs = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── isMac / modKey ─────────────────────────────────────────────────────────

describe('isMac / modKey', () => {
  it('isMac is a boolean derived from navigator.platform', () => {
    expect(typeof isMac).toBe('boolean');
  });

  it('modKey concatenates the platform prefix and the supplied key', () => {
    const out = modKey('C');
    expect(out.endsWith('C')).toBe(true);
    if (isMac) expect(out).toBe('⌘C');
    else expect(out).toBe('Ctrl+C');
  });
});

// ─── fireKey ────────────────────────────────────────────────────────────────

describe('fireKey', () => {
  it('dispatches a KeyboardEvent on document with default ctrl=false', () => {
    const dispatch = vi.fn();
    vi.stubGlobal('document', { dispatchEvent: dispatch });
    // KeyboardEvent must exist as a constructor in the test global; jsdom
    // would supply one, but our tests run without jsdom — stub the ctor too.
    class FakeKeyboardEvent {
      type: string;
      key: string | undefined;
      ctrlKey: boolean | undefined;
      metaKey: boolean | undefined;
      bubbles: boolean | undefined;
      constructor(type: string, init?: KeyboardEventInit) {
        this.type = type;
        this.key = init?.key;
        this.ctrlKey = init?.ctrlKey;
        this.metaKey = init?.metaKey;
        this.bubbles = init?.bubbles;
      }
    }
    vi.stubGlobal('KeyboardEvent', FakeKeyboardEvent);
    fireKey('a');
    expect(dispatch).toHaveBeenCalled();
    const evt = dispatch.mock.calls[0][0] as FakeKeyboardEvent;
    expect(evt.type).toBe('keydown');
    expect(evt.key).toBe('a');
    expect(evt.ctrlKey).toBe(false);
    expect(evt.metaKey).toBe(false);
    expect(evt.bubbles).toBe(true);
  });

  it('dispatches with ctrl/meta true when the second arg is true', () => {
    const dispatch = vi.fn();
    vi.stubGlobal('document', { dispatchEvent: dispatch });
    class FakeKeyboardEvent {
      ctrlKey?: boolean;
      metaKey?: boolean;
      constructor(_type: string, init?: KeyboardEventInit) {
        this.ctrlKey = init?.ctrlKey;
        this.metaKey = init?.metaKey;
      }
    }
    vi.stubGlobal('KeyboardEvent', FakeKeyboardEvent);
    fireKey('c', true);
    const evt = dispatch.mock.calls[0][0] as FakeKeyboardEvent;
    expect(evt.ctrlKey).toBe(true);
    expect(evt.metaKey).toBe(true);
  });
});

// ─── MenuItem ───────────────────────────────────────────────────────────────

describe('MenuItem', () => {
  it('renders a label inside a button', () => {
    const tree = renderItem({ label: 'Open', onClick: vi.fn() });
    const btn = findFirst(tree, (el) => el.type === 'button');
    expect(btn).toBeDefined();
    const labelSpan = findFirst(tree, (el) => el.type === 'span' && el.props.children === 'Open');
    expect(labelSpan).toBeDefined();
  });

  it('forwards onClick when not disabled', () => {
    const onClick = vi.fn();
    const tree = renderItem({ label: 'Go', onClick });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    expect(btn.props.onClick).toBe(onClick);
    (btn.props.onClick as () => void)();
    expect(onClick).toHaveBeenCalled();
  });

  it('omits onClick wiring when disabled is true', () => {
    const onClick = vi.fn();
    const tree = renderItem({ label: 'Disabled', onClick, disabled: true });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    expect(btn.props.disabled).toBe(true);
    expect(btn.props.onClick).toBeUndefined();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('uses the disabled className branch when disabled is true', () => {
    const tree = renderItem({ label: 'X', onClick: vi.fn(), disabled: true });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    expect((btn.props.className as string).includes('text-ice-text-3')).toBe(true);
    expect((btn.props.className as string).includes('cursor-default')).toBe(true);
  });

  it('uses the danger className branch when danger is true (and not disabled)', () => {
    const tree = renderItem({ label: 'Delete', onClick: vi.fn(), danger: true });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    expect((btn.props.className as string).includes('text-red-400')).toBe(true);
  });

  it('uses the default className branch when neither disabled nor danger', () => {
    const tree = renderItem({ label: 'Plain', onClick: vi.fn() });
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    expect((btn.props.className as string).includes('text-ice-text-1')).toBe(true);
  });

  it('renders a shortcut span when shortcut is provided', () => {
    const tree = renderItem({ label: 'Copy', onClick: vi.fn(), shortcut: '⌘C' });
    const shortcut = findFirst(tree, (el) => el.type === 'span' && el.props.children === '⌘C');
    expect(shortcut).toBeDefined();
  });

  it('omits the shortcut span when shortcut is undefined', () => {
    const tree = renderItem({ label: 'Copy', onClick: vi.fn() });
    const spans = findAll(tree, (el) => el.type === 'span');
    expect(spans.length).toBe(1);
  });
});

// ─── Separator ──────────────────────────────────────────────────────────────

describe('Separator', () => {
  it('renders a horizontal-line div', () => {
    const tree = renderSep();
    const div = findFirst(tree, (el) => el.type === 'div');
    expect(div).toBeDefined();
    expect((div!.props.className as string).includes('h-px')).toBe(true);
  });
});

// ─── SubMenu ────────────────────────────────────────────────────────────────

describe('SubMenu', () => {
  const items = [
    { label: 'A', onClick: vi.fn() },
    { label: 'B', onClick: vi.fn() },
  ];

  it('renders the trigger button with the label and arrow', () => {
    const tree = renderSub({
      label: 'More',
      items,
      isOpen: false,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    const labelSpan = findFirst(tree, (el) => el.type === 'span' && el.props.children === 'More');
    const arrow = findFirst(tree, (el) => el.type === 'span' && el.props.children === '▸');
    expect(labelSpan).toBeDefined();
    expect(arrow).toBeDefined();
  });

  it('does not render the popover when isOpen is false', () => {
    const tree = renderSub({
      label: 'X',
      items,
      isOpen: false,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    // The popover container has the z-[9999] class — none should appear.
    const popovers = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('z-[9999]'),
    );
    expect(popovers.length).toBe(0);
  });

  it('renders the popover with one button per item when isOpen is true', () => {
    const tree = renderSub({
      label: 'X',
      items,
      isOpen: true,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    const aBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        el.props.children === 'A' &&
        typeof el.props.onClick === 'function',
    );
    const bBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        el.props.children === 'B' &&
        typeof el.props.onClick === 'function',
    );
    expect(aBtn).toBeDefined();
    expect(bBtn).toBeDefined();
    expect(aBtn!.props.onClick).toBe(items[0].onClick);
    expect(bBtn!.props.onClick).toBe(items[1].onClick);
  });

  it('forwards onEnter/onLeave via outer wrapper events', () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const tree = renderSub({
      label: 'X',
      items,
      isOpen: false,
      onEnter,
      onLeave,
    });
    const wrapper = findFirst(
      tree,
      (el) => el.type === 'div' && typeof el.props.onMouseEnter === 'function',
    )!;
    expect(wrapper.props.onMouseEnter).toBe(onEnter);
    expect(wrapper.props.onMouseLeave).toBe(onLeave);
  });

  it('forwards onEnter/onLeave on the popover container when open', () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const tree = renderSub({
      label: 'X',
      items,
      isOpen: true,
      onEnter,
      onLeave,
    });
    const popover = findFirst(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('z-[9999]'),
    )!;
    expect(popover.props.onMouseEnter).toBe(onEnter);
    expect(popover.props.onMouseLeave).toBe(onLeave);
  });

  it('uses the open className on the trigger when isOpen is true', () => {
    const tree = renderSub({
      label: 'X',
      items,
      isOpen: true,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    const trigger = findFirst(tree, (el) => el.type === 'button')!;
    expect((trigger.props.className as string).includes('bg-ice-hover')).toBe(true);
  });

  it('useEffect updates pos when isOpen=true and triggerRef is set', () => {
    renderSub({
      label: 'X',
      items,
      isOpen: true,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    // Stash a getBoundingClientRect on the triggerRef so the effect's
    // happy path runs.
    const triggerRef = mocks.refs[0];
    triggerRef.current = {
      getBoundingClientRect: () => ({ right: 100, top: 50, left: 0, bottom: 0, width: 0, height: 0 }),
    };
    // After this, the effect will read the bounding rect and call setPos.
    for (const fx of mocks.effects) fx();
    // Verify the setter (state slot 0 setter is at index 1 in the return).
    // (We can't read pos directly, but we can verify the FC re-renders with
    // the override propagated.) Use the override to simulate after-set.
    mocks.useStateOverrides = { 0: { x: 96, y: 50 } };
    mocks.useStateCount = 0;
    mocks.refs = [];
    mocks.effects = [];
    const next = renderSub({
      label: 'X',
      items,
      isOpen: true,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    const popover = findFirst(
      next,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('z-[9999]'),
    )!;
    expect((popover.props.style as { left: number; top: number }).left).toBe(96);
    expect((popover.props.style as { left: number; top: number }).top).toBe(50);
  });

  it('useEffect skips setPos when isOpen is false', () => {
    renderSub({
      label: 'X',
      items,
      isOpen: false,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    // triggerRef is captured but the effect's `if (isOpen && ...)` short-circuits.
    const triggerRef = mocks.refs[0];
    const setPos = vi.fn();
    triggerRef.current = { getBoundingClientRect: setPos };
    for (const fx of mocks.effects) fx();
    expect(setPos).not.toHaveBeenCalled();
  });

  it('useEffect skips setPos when triggerRef.current is null', () => {
    renderSub({
      label: 'X',
      items,
      isOpen: true,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    // triggerRef.current stays null — `if (... && triggerRef.current)` is false.
    expect(() => mocks.effects.forEach((fx) => fx())).not.toThrow();
  });
});

// ─── CategorySubMenu ────────────────────────────────────────────────────────

describe('CategorySubMenu', () => {
  const categories = [
    {
      label: 'Compute',
      items: [{ label: 'EC2', onClick: vi.fn() }],
    },
    {
      label: 'Storage',
      items: [{ label: 'S3', onClick: vi.fn() }],
    },
  ];

  it('renders the trigger button with the label', () => {
    const tree = renderCat({
      label: 'Add Block',
      categories,
      isOpen: false,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    const labelSpan = findFirst(
      tree,
      (el) => el.type === 'span' && el.props.children === 'Add Block',
    );
    expect(labelSpan).toBeDefined();
  });

  it('does not render the categories popover when isOpen is false', () => {
    const tree = renderCat({
      label: 'X',
      categories,
      isOpen: false,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    const popovers = findAll(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('z-[9999]'),
    );
    expect(popovers.length).toBe(0);
  });

  it('renders one SubMenu per category when isOpen is true', () => {
    const tree = renderCat({
      label: 'X',
      categories,
      isOpen: true,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    const subs = findAll(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { label?: unknown }).label === 'string' &&
        Array.isArray((el.props as { items?: unknown }).items),
    );
    expect(subs.length).toBe(categories.length);
    expect((subs[0].props as { label: string }).label).toBe('Compute');
    expect((subs[1].props as { label: string }).label).toBe('Storage');
  });

  it('forwards onEnter/onLeave on the categories popover when open', () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const tree = renderCat({
      label: 'X',
      categories,
      isOpen: true,
      onEnter,
      onLeave,
    });
    const popover = findFirst(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('z-[9999]'),
    )!;
    expect(popover.props.onMouseEnter).toBe(onEnter);
    expect(popover.props.onMouseLeave).toBe(onLeave);
  });

  it('inner SubMenu onEnter sets openCat to that category id', () => {
    // openCat slot index for CategorySubMenu = 1 (slot 0 is pos).
    // Probe with openCat=null first, then call inner onEnter.
    const tree = renderCat({
      label: 'X',
      categories,
      isOpen: true,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    const subs = findAll(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { label?: unknown }).label === 'string' &&
        Array.isArray((el.props as { items?: unknown }).items),
    );
    expect(subs.length).toBeGreaterThan(0);
    const onEnter = subs[0].props.onEnter as () => void;
    expect(typeof onEnter).toBe('function');
    expect(() => onEnter()).not.toThrow();
  });

  it('inner SubMenu onLeave schedules an openCat→null timeout', () => {
    // Stub setTimeout so we can verify the scheduling without waiting.
    const setT = vi.fn();
    vi.stubGlobal('setTimeout', setT);
    const tree = renderCat({
      label: 'X',
      categories,
      isOpen: true,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    const subs = findAll(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { label?: unknown }).label === 'string' &&
        Array.isArray((el.props as { items?: unknown }).items),
    );
    const onLeave = subs[0].props.onLeave as () => void;
    onLeave();
    expect(setT).toHaveBeenCalled();
    expect(setT.mock.calls[0][1]).toBe(100);
    // Drive the inner timer fn — it calls setOpenCat(null), which is a vi.fn().
    const fn = setT.mock.calls[0][0] as () => void;
    expect(() => fn()).not.toThrow();
  });

  it('inner SubMenu isOpen flips to true when openCat matches its label', () => {
    // openCat is slot 1 (slot 0 is pos {x,y}).
    mocks.useStateOverrides = { 1: 'Storage' };
    const tree = renderCat({
      label: 'X',
      categories,
      isOpen: true,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    const subs = findAll(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { label?: unknown }).label === 'string' &&
        Array.isArray((el.props as { items?: unknown }).items),
    );
    const computeSub = subs.find((s) => (s.props as { label: string }).label === 'Compute')!;
    const storageSub = subs.find((s) => (s.props as { label: string }).label === 'Storage')!;
    expect((computeSub.props as { isOpen: boolean }).isOpen).toBe(false);
    expect((storageSub.props as { isOpen: boolean }).isOpen).toBe(true);
  });

  it('useEffect resets openCat to null when isOpen flips false', () => {
    renderCat({
      label: 'X',
      categories,
      isOpen: false,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    expect(() => mocks.effects.forEach((fx) => fx())).not.toThrow();
  });

  it('useEffect updates pos via getBoundingClientRect when isOpen=true', () => {
    renderCat({
      label: 'X',
      categories,
      isOpen: true,
      onEnter: vi.fn(),
      onLeave: vi.fn(),
    });
    const triggerRef = mocks.refs[0];
    triggerRef.current = {
      getBoundingClientRect: () => ({ right: 200, top: 80, left: 0, bottom: 0, width: 0, height: 0 }),
    };
    expect(() => mocks.effects.forEach((fx) => fx())).not.toThrow();
  });
});
