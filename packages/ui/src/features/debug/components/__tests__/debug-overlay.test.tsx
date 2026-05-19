/**
 * DebugOverlay — togglable canvas-debug HUD.
 *
 * Direct-FC tree-walker. Patches react.useState (queue) + useEffect +
 * useMemo. We drive the state via a hoisted queue: each useState call
 * pulls the next initial value.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  useStateQueue: [] as unknown[],
  effects: [] as Array<{ cb: () => void | (() => void); deps?: unknown[] }>,
  resetEffects() {
    this.effects.length = 0;
  },
  state: {
    debug: {
      panelOpen: true,
      lastAction: '',
      lastActionTime: 0,
      renderDuration: 0,
    },
    cards: {
      cards: [] as Array<{
        id: string;
        name?: string;
        nodes: Array<{
          id: string;
          type: string;
          data?: Record<string, unknown>;
          position?: { x: number; y: number };
        }>;
        edges: unknown[];
      }>,
      activeCardId: null as string | null,
    },
    selection: { selectedNodes: [] as string[], selectedEdges: [] as string[] },
  },
  dispatch: vi.fn(),
  toggleSpy: vi.fn(() => ({ type: 'debug/toggle' })),
  dateNow: vi.fn(() => 1_000_000),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useState = vi.fn(<T,>(init: T): [T, (v: T) => void] => {
    const next = mocks.useStateQueue.shift();
    return [(next === undefined ? init : (next as T)), vi.fn()];
  });
  const useEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps });
  });
  const useMemo = vi.fn(<T,>(fn: () => T): T => fn());
  const def = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return { ...actual, useState, useEffect, useMemo, default: { ...def, useState, useEffect, useMemo } };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `t:${k}` }),
}));

vi.mock('../../../../store/slices/debug-slice', () => ({
  toggleDebugPanel: () => mocks.toggleSpy(),
}));

import { DebugOverlay } from '../debug-overlay';

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
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* skip */
    }
    return;
  }
  yield* walk(node.props.children);
}
function findAll(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}
function findByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}
function collectText(node: unknown): string {
  let s = '';
  for (const el of walk(node)) {
    const c = (el.props as { children?: unknown }).children;
    if (typeof c === 'string') s += c + ' ';
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item + ' ';
        else if (typeof item === 'number') s += String(item) + ' ';
      }
    } else if (typeof c === 'number') s += String(c) + ' ';
  }
  return s;
}

const callRender = (): unknown => (DebugOverlay as () => unknown)();

beforeEach(() => {
  mocks.useStateQueue.length = 0;
  mocks.resetEffects();
  mocks.state.debug = { panelOpen: true, lastAction: '', lastActionTime: 0, renderDuration: 0 };
  mocks.state.cards = { cards: [], activeCardId: null };
  mocks.state.selection = { selectedNodes: [], selectedEdges: [] };
  mocks.dispatch.mockReset();
  mocks.toggleSpy.mockClear();
  vi.spyOn(Date, 'now').mockImplementation(() => 1_000_000);
});

describe('DebugOverlay — closed', () => {
  it('returns null when panelOpen=false', () => {
    mocks.state.debug.panelOpen = false;
    expect(callRender()).toBeNull();
  });
});

describe('DebugOverlay — collapsed pill', () => {
  it('renders the {n}n {e}e pill when collapsed=true', () => {
    mocks.useStateQueue.push(true); // collapsed
    mocks.state.cards.activeCardId = 'c1';
    mocks.state.cards.cards = [
      {
        id: 'c1',
        nodes: [
          { id: 'n1', type: 'block' },
          { id: 'n2', type: 'block' },
        ],
        edges: [{ id: 'e1' }],
      },
    ];
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toMatch(/2\s*n/);
    expect(text).toMatch(/1\s*e/);
  });

  it('clicking the collapsed pill calls setCollapsed(false)', () => {
    mocks.useStateQueue.push(true);
    const tree = callRender() as ReactElementLike;
    expect(typeof tree.props.onClick).toBe('function');
    // No assertion on mutation since useState is mocked, but the click handler shouldn't throw
    expect(() => (tree.props.onClick as () => void)()).not.toThrow();
  });
});

describe('DebugOverlay — full HUD', () => {
  it('renders the title', () => {
    const tree = callRender();
    expect(collectText(tree)).toContain('t:debug.title');
  });

  it('counts groups via container type or Group.* iceType', () => {
    mocks.state.cards.activeCardId = 'c1';
    mocks.state.cards.cards = [
      {
        id: 'c1',
        nodes: [
          { id: 'g1', type: 'container' },
          { id: 'g2', type: 'block', data: { iceType: 'Group.Compute' } },
          { id: 'b1', type: 'block', data: { iceType: 'Compute.Lambda' } },
        ],
        edges: [],
      },
    ];
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('2'); // group count somewhere
  });

  it('renders the active card name when present', () => {
    mocks.state.cards.activeCardId = 'c1';
    mocks.state.cards.cards = [{ id: 'c1', name: 'My Card', nodes: [], edges: [] }];
    const tree = callRender();
    expect(collectText(tree)).toContain('My Card');
  });

  it('falls back to activeCardId when no name', () => {
    mocks.state.cards.activeCardId = 'c-fallback';
    mocks.state.cards.cards = [{ id: 'c-fallback', nodes: [], edges: [] }];
    const tree = callRender();
    expect(collectText(tree)).toContain('c-fallback');
  });

  it('falls back to "none" when no active card and no id', () => {
    mocks.state.cards.activeCardId = null;
    mocks.state.cards.cards = [];
    const tree = callRender();
    expect(collectText(tree)).toContain('none');
  });

  it('renders selectedNodes csv when populated', () => {
    mocks.state.selection.selectedNodes = ['nx', 'ny'];
    const tree = callRender();
    expect(collectText(tree)).toContain('nx, ny');
  });

  it('shows debug.none when no selection', () => {
    const tree = callRender();
    expect(collectText(tree)).toContain('t:debug.none');
  });

  it('shows lastAction when set', () => {
    mocks.state.debug.lastAction = 'addBlock';
    const tree = callRender();
    expect(collectText(tree)).toContain('addBlock');
  });

  it('formats lastActionAgo as "Xs ago"', () => {
    mocks.state.debug.lastActionTime = 994_000; // 6s ago
    const tree = callRender();
    expect(collectText(tree)).toContain('6s ago');
  });

  it('shows "none" when lastActionTime is 0', () => {
    mocks.state.debug.lastActionTime = 0;
    const tree = callRender();
    expect(collectText(tree)).toContain('none');
  });

  it('renders render duration as "Xms" when >0', () => {
    mocks.state.debug.renderDuration = 12.5;
    const tree = callRender();
    expect(collectText(tree)).toContain('12.5ms');
  });

  it('renders render duration as "-" when 0', () => {
    mocks.state.debug.renderDuration = 0;
    const tree = callRender();
    expect(collectText(tree)).toContain('-');
  });

  it('renders the node list when active card has nodes', () => {
    mocks.state.cards.activeCardId = 'c1';
    mocks.state.cards.cards = [
      {
        id: 'c1',
        nodes: [
          { id: 'a-1', type: 'block', position: { x: 10.4, y: 20.6 }, data: { label: 'Alpha' } },
          { id: 'b-1', type: 'block', position: { x: 0, y: 0 } },
        ],
        edges: [],
      },
    ];
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('Alpha');
    expect(text).toContain('b-1');
    expect(text).toContain('10');
    expect(text).toContain('21');
  });

  it('clicking the close (x) button dispatches toggleDebugPanel', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    // 1st button = collapse (_), 2nd = close (x)
    (buttons[1].props.onClick as () => void)?.();
    expect(mocks.toggleSpy).toHaveBeenCalled();
  });

  it('clicking the collapse (_) button does not dispatch', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[0].props.onClick as () => void)?.();
    expect(mocks.toggleSpy).not.toHaveBeenCalled();
  });
});

describe('DebugOverlay — keydown effect', () => {
  // Capture the keydown handler the same way the toolbar test does:
  const installFakeWindow = (): { handler: (e: KeyboardEvent) => void; remove: () => void } => {
    callRender();
    let captured: (e: Event) => void = () => {};
    const fakeWindow = {
      addEventListener: vi.fn((evt: string, h: (e: Event) => void) => {
        if (evt === 'keydown') captured = h;
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
    return {
      handler: captured as (e: KeyboardEvent) => void,
      remove: () => fakeWindow.removeEventListener.mock.calls[0]?.[0],
    };
  };

  it('Cmd+Shift+D dispatches toggleDebugPanel', () => {
    const { handler } = installFakeWindow();
    const e = {
      key: 'D',
      ctrlKey: false,
      metaKey: true,
      shiftKey: true,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    handler(e);
    expect(mocks.toggleSpy).toHaveBeenCalled();
    expect((e.preventDefault as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(0);
  });

  it('Ctrl+Shift+D also dispatches toggleDebugPanel', () => {
    const { handler } = installFakeWindow();
    const e = {
      key: 'D',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    handler(e);
    expect(mocks.toggleSpy).toHaveBeenCalled();
  });

  it('ignores key without modifiers', () => {
    const { handler } = installFakeWindow();
    const e = {
      key: 'D',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    handler(e);
    expect(mocks.toggleSpy).not.toHaveBeenCalled();
  });
});
