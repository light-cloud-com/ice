/**
 * useUndoRedo — Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y keyboard wiring.
 *
 * Test strategy:
 *   - Mock React's `useEffect` to fire synchronously.
 *   - Stub `window.addEventListener('keydown', ...)` to capture the
 *     handler the hook installs.
 *   - Mount through `<Provider>` + `<Probe>` and drive synthetic keydown
 *     events directly. Spy on `store.dispatch` to assert which slice
 *     action fired.
 */

import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

interface KeydownInit {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: unknown;
}

const mocks = vi.hoisted(() => {
  const keydownListeners: Array<(e: unknown) => void> = [];
  return {
    keydownListeners,
    preventDefault: vi.fn(),
  };
});

const effectCleanups = vi.hoisted(() => ({ list: [] as Array<() => void> }));

vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void)) => {
      const cleanup = cb();
      if (typeof cleanup === 'function') effectCleanups.list.push(cleanup);
    },
  };
});

// ─── Imports after mocks ────────────────────────────────────────────────────

import cardsReducer from '../../../store/slices/cards-slice';
import selectionReducer from '../../../store/slices/selection-slice';
import { useUndoRedo } from '../use-undo-redo';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: { cards: cardsReducer, selection: selectionReducer } as any,
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
}

function mount(store: ReturnType<typeof makeStore>) {
  const Probe: React.FC = () => {
    useUndoRedo();
    return null;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
}

function fire(init: KeydownInit) {
  const ev = {
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    target: init.target ?? { tagName: 'DIV', isContentEditable: false },
    preventDefault: mocks.preventDefault,
  };
  for (const cb of [...mocks.keydownListeners]) cb(ev);
  return ev;
}

beforeEach(() => {
  mocks.keydownListeners.length = 0;
  mocks.preventDefault.mockReset();
  effectCleanups.list.length = 0;

  vi.stubGlobal('window', {
    addEventListener: (type: string, cb: (e: unknown) => void) => {
      if (type === 'keydown') mocks.keydownListeners.push(cb);
    },
    removeEventListener: (type: string, cb: (e: unknown) => void) => {
      if (type === 'keydown') {
        const i = mocks.keydownListeners.indexOf(cb);
        if (i >= 0) mocks.keydownListeners.splice(i, 1);
      }
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ────────────────────────────────────────────────────────────────────────────

describe('useUndoRedo', () => {
  it('registers a keydown listener', () => {
    const store = makeStore();
    mount(store);
    expect(mocks.keydownListeners.length).toBe(1);
  });

  it('dispatches undoCardChange on Ctrl+Z', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    fire({ key: 'z', ctrlKey: true });
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('cards/undoCardChange');
    expect(mocks.preventDefault).toHaveBeenCalled();
  });

  it('dispatches undoCardChange on Cmd+Z (metaKey path)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    fire({ key: 'z', metaKey: true });
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('cards/undoCardChange');
  });

  it('dispatches redoCardChange on Ctrl+Shift+Z', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    fire({ key: 'z', ctrlKey: true, shiftKey: true });
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('cards/redoCardChange');
    expect(mocks.preventDefault).toHaveBeenCalled();
  });

  it('dispatches redoCardChange on Ctrl+Y', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    fire({ key: 'y', ctrlKey: true });
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('cards/redoCardChange');
  });

  it('ignores keypresses without Ctrl/Meta modifier', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    fire({ key: 'z' });
    fire({ key: 'y' });
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mocks.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores keypresses targeting an INPUT element', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    fire({ key: 'z', ctrlKey: true, target: { tagName: 'INPUT', isContentEditable: false } });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('ignores keypresses targeting a TEXTAREA element', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    fire({ key: 'z', ctrlKey: true, target: { tagName: 'TEXTAREA', isContentEditable: false } });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('ignores keypresses targeting a contentEditable element', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    fire({ key: 'z', ctrlKey: true, target: { tagName: 'DIV', isContentEditable: true } });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('ignores other keys with the modifier (e.g. Ctrl+A)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    fire({ key: 'a', ctrlKey: true });
    fire({ key: 'Enter', ctrlKey: true });
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('cards/undoCardChange');
    expect(types).not.toContain('cards/redoCardChange');
  });

  it('cleanup removes the keydown listener', () => {
    const store = makeStore();
    mount(store);
    const beforeCount = mocks.keydownListeners.length;
    expect(beforeCount).toBeGreaterThan(0);
    // Run all effect cleanups.
    for (const c of effectCleanups.list) c();
    expect(mocks.keydownListeners.length).toBe(beforeCount - 1);
  });
});
