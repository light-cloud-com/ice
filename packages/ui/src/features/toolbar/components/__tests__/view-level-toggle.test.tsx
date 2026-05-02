/**
 * ViewLevelToggle — 2-state toggle button + keyboard shortcuts (1/2).
 *
 * Direct-FC tree-walker. We capture the useEffect callback so we can
 * drive keydown events without relying on jsdom.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  effects: [] as Array<{ cb: () => void | (() => void); deps?: unknown[] }>,
  resetEffects() {
    this.effects.length = 0;
  },
  dispatch: vi.fn(),
  state: {
    viewLevel: 1 as 1 | 2,
  },
  addListener: vi.fn(),
  removeListener: vi.fn(),
  setViewLevelSpy: vi.fn((lvl: 1 | 2) => ({ type: 'view/setLevel', payload: lvl })),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps });
  });
  const def = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return { ...actual, useEffect, default: { ...def, useEffect } };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: (s: unknown) => unknown) => sel({ view: mocks.state }),
}));

vi.mock('../../../../config/visualization-config', () => ({
  VIEW_LEVELS: {
    1: { name: 'Architecture', tooltip: 'Arch tip', description: 'Arch desc' },
    2: { name: 'Infrastructure', tooltip: 'Infra tip', description: 'Infra desc' },
  },
}));

vi.mock('../../../../store/slices/view-slice', () => ({
  setViewLevel: (lvl: 1 | 2) => mocks.setViewLevelSpy(lvl),
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

import { ViewLevelToggle } from '../view-level-toggle';

interface ReactElementLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isElement(x: unknown): x is ReactElementLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ReactElementLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isElement(node)) return;
  yield node;
  yield* walk(node.props.children);
}
function findAll(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}

const callRender = (): unknown => (ViewLevelToggle as () => unknown)();

beforeEach(() => {
  mocks.resetEffects();
  mocks.state.viewLevel = 1;
  mocks.dispatch.mockClear();
  mocks.setViewLevelSpy.mockClear();
});

describe('ViewLevelToggle — render', () => {
  it('renders two level buttons', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons).toHaveLength(2);
  });

  it('marks the active level button with the bg-primary class', () => {
    mocks.state.viewLevel = 2;
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect((buttons[0].props.className as string)).not.toContain('bg-primary');
    expect((buttons[1].props.className as string)).toContain('bg-primary');
  });

  it('passes title="<tooltip>\\n<description>" on each button', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons[0].props.title).toBe('Arch tip\nArch desc');
    expect(buttons[1].props.title).toBe('Infra tip\nInfra desc');
  });

  it('shows the level name (sm:inline) and the level digit (sm:hidden)', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    const innerSpans1 = findAll(buttons[0], (el) => el.type === 'span');
    expect((innerSpans1[0].props.children as string)).toBe('Architecture');
    expect(innerSpans1[1].props.children).toBe(1);
  });
});

describe('ViewLevelToggle — click handler', () => {
  it('clicking a level dispatches setViewLevel with that level', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[1].props.onClick as () => void)?.();
    expect(mocks.setViewLevelSpy).toHaveBeenCalledWith(2);
    expect(mocks.dispatch).toHaveBeenCalled();
  });
});

describe('ViewLevelToggle — keyboard shortcut', () => {
  // We stub a fake `window` on globalThis. The effect closure captures the
  // current value of `window` at call-time, so we install a fake right
  // before invoking the effect.
  const getKeydownHandler = (): ((e: KeyboardEvent) => void) => {
    callRender();
    let captured: (e: Event) => void = () => {};
    const fakeWindow = {
      addEventListener: vi.fn((evt: string, handler: (e: Event) => void) => {
        if (evt === 'keydown') captured = handler;
      }),
      removeEventListener: vi.fn(),
    };
    const g = globalThis as { window?: unknown };
    const prev = g.window;
    g.window = fakeWindow;
    try {
      mocks.effects[0].cb();
    } finally {
      g.window = prev;
    }
    return captured as (e: KeyboardEvent) => void;
  };

  // jsdom-free fake input/textarea — the source uses instanceof checks
  // against globalThis.HTMLInputElement / HTMLTextAreaElement.
  class FakeHTMLInputElement {}
  class FakeHTMLTextAreaElement {}

  beforeEach(() => {
    (globalThis as { HTMLInputElement?: unknown }).HTMLInputElement = FakeHTMLInputElement;
    (globalThis as { HTMLTextAreaElement?: unknown }).HTMLTextAreaElement = FakeHTMLTextAreaElement;
  });

  it('pressing 1 dispatches setViewLevel(1)', () => {
    const handler = getKeydownHandler();
    const e = {
      key: '1',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: {},
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    handler(e);
    expect(mocks.setViewLevelSpy).toHaveBeenCalledWith(1);
    expect((e.preventDefault as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(0);
  });

  it('pressing 2 dispatches setViewLevel(2)', () => {
    const handler = getKeydownHandler();
    const e = {
      key: '2',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: {},
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    handler(e);
    expect(mocks.setViewLevelSpy).toHaveBeenCalledWith(2);
  });

  it('ignores keypresses inside HTMLInputElement', () => {
    const handler = getKeydownHandler();
    const input = new FakeHTMLInputElement();
    const e = {
      key: '1',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: input,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    handler(e);
    expect(mocks.setViewLevelSpy).not.toHaveBeenCalled();
  });

  it('ignores keypresses inside HTMLTextAreaElement', () => {
    const handler = getKeydownHandler();
    const ta = new FakeHTMLTextAreaElement();
    const e = {
      key: '1',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: ta,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    handler(e);
    expect(mocks.setViewLevelSpy).not.toHaveBeenCalled();
  });

  it('ignores keypresses with a modifier key (ctrl/meta/alt/shift)', () => {
    const handler = getKeydownHandler();
    const e = {
      key: '1',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: {},
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    handler(e);
    expect(mocks.setViewLevelSpy).not.toHaveBeenCalled();
  });

  it('ignores keys other than 1 and 2', () => {
    const handler = getKeydownHandler();
    const e = {
      key: '3',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: {},
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    handler(e);
    expect(mocks.setViewLevelSpy).not.toHaveBeenCalled();
  });

  it('cleanup removes the keydown listener', () => {
    callRender();
    const removeSpy = vi.fn();
    const fakeWindow = {
      addEventListener: vi.fn(),
      removeEventListener: removeSpy,
    };
    const g = globalThis as { window?: unknown };
    const prev = g.window;
    g.window = fakeWindow;
    try {
      const cleanup = mocks.effects[0].cb() as () => void;
      cleanup?.();
    } finally {
      g.window = prev;
    }
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
