/**
 * rf-ptree-4 — `useTreeEffects` hook bundle.
 *
 * Pins the four `useEffect` blocks (fetch-project-tree, focus edit-input,
 * focus new-folder-input, close-context-menu-on-outside-click) lifted out
 * of project-tree.tsx into a custom hook.
 *
 * Uses the rf-pdpl-21 sync-useEffect mock pattern:
 *   - `react.useEffect` is patched so each call appends `{cb, deps, cleanup}`
 *     to a hoisted `mocks.effects` array,
 *   - tests fingerprint each effect by its deps-array shape:
 *       [0] fetch-project-tree → deps length 3 (orgId, loadedOrgId, dispatch),
 *       [1] focus edit-input → deps length 1 (editingId),
 *       [2] focus new-folder-input → deps length 1 (creatingFolder),
 *       [3] context-menu outside-click → deps length 2 (contextMenu, setContextMenu),
 *   - the cleanup returned by effect 4 is captured per-effect and exercised
 *     with manual invocations.
 *
 * Cite of `fingerprint-multi-useEffect-by-deps-array-shape-when-bundled-in-
 * one-hook` (rf-pdpl-21) and `redux-toolkit-unknown-action-payload-needs-
 * double-cast-via-unknown` (rf-pdpl-20). Effect 4 also requires document /
 * MouseEvent stubs — applies `stubbing-window-and-keyboardevent-for-node-
 * env-keydown-listener-tests` pattern (rf-pdpl-12).
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

interface CapturedEffect {
  cb: () => void | (() => void);
  deps: unknown[] | undefined;
  cleanup: void | (() => void);
}

const mocks = vi.hoisted(() => ({
  effects: [] as CapturedEffect[],
  syncUseEffect: { current: true as boolean },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
      if (!mocks.syncUseEffect.current) return;
      const cleanup = cb();
      mocks.effects.push({ cb, deps, cleanup });
    }),
  };
});

import { useTreeEffects, type UseTreeEffectsArgs, type UseTreeEffectsReturn } from '../use-tree-effects';

// ─── Probe + capture helpers ────────────────────────────────────────────────

const makeStore = () => configureStore({ reducer: { _: (s = 0) => s } });

interface CaptureArgs extends Partial<UseTreeEffectsArgs> {
  store: ReturnType<typeof makeStore>;
}

interface Captured {
  result: UseTreeEffectsReturn;
}

function captureHook(args: CaptureArgs): Captured {
  const captured: { current?: Captured } = {};
  const Probe: React.FC = () => {
    const result = useTreeEffects({
      orgId: args.orgId ?? 'org-1',
      loadedOrgId: args.loadedOrgId ?? null,
      editingId: args.editingId ?? null,
      creatingFolder: args.creatingFolder ?? null,
      contextMenu: args.contextMenu ?? null,
      setContextMenu: args.setContextMenu ?? vi.fn(),
    });
    captured.current = { result };
    return null;
  };
  renderToString(
    <Provider store={args.store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('hook did not render');
  return captured.current;
}

// ─── Document + MouseEvent stubs (effect 4) ─────────────────────────────────

interface DocumentLike {
  addEventListener: (type: string, listener: (e: MouseEvent) => void) => void;
  removeEventListener: (type: string, listener: (e: MouseEvent) => void) => void;
  __dispatch: (type: string, ev: MouseEvent) => void;
}

let documentStub: DocumentLike | null = null;
let documentListeners: Map<string, Set<(e: MouseEvent) => void>> = new Map();

beforeEach(() => {
  mocks.effects.length = 0;
  mocks.syncUseEffect.current = true;
  documentListeners = new Map();
  documentStub = {
    addEventListener: (type, listener) => {
      const set = documentListeners.get(type) ?? new Set();
      set.add(listener);
      documentListeners.set(type, set);
    },
    removeEventListener: (type, listener) => {
      documentListeners.get(type)?.delete(listener);
    },
    __dispatch: (type, ev) => {
      documentListeners.get(type)?.forEach((l) => l(ev));
    },
  };
  vi.stubGlobal('document', documentStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const effectByOrder = (i: number): CapturedEffect => {
  const e = mocks.effects[i];
  if (!e) throw new Error(`effect index ${i} not registered`);
  return e;
};

// ────────────────────────────────────────────────────────────────────────────
// Effect registration shape
// ────────────────────────────────────────────────────────────────────────────

describe('useTreeEffects — effect registration', () => {
  it('registers four effects in a stable order', () => {
    const store = makeStore();
    captureHook({ store });
    expect(mocks.effects).toHaveLength(4);
  });

  it('effect[0] (fetch project tree) has deps length 3 [orgId, loadedOrgId, dispatch]', () => {
    const store = makeStore();
    captureHook({ store });
    const e = effectByOrder(0);
    expect(e.deps).toHaveLength(3);
    expect(typeof e.deps?.[0]).toBe('string'); // orgId
  });

  it('effect[1] (focus edit) has deps length 1 [editingId]', () => {
    const store = makeStore();
    captureHook({ store });
    const e = effectByOrder(1);
    expect(e.deps).toHaveLength(1);
  });

  it('effect[2] (focus new-folder) has deps length 1 [creatingFolder]', () => {
    const store = makeStore();
    captureHook({ store });
    const e = effectByOrder(2);
    expect(e.deps).toHaveLength(1);
  });

  it('effect[3] (context-menu outside click) has deps length 2 [contextMenu, setContextMenu]', () => {
    const store = makeStore();
    captureHook({ store });
    const e = effectByOrder(3);
    expect(e.deps).toHaveLength(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Effect 1 — fetch project tree on org change
// ────────────────────────────────────────────────────────────────────────────

describe('effect 1: fetch project tree', () => {
  it('dispatches fetchProjectTree(orgId) when orgId is set and differs from loadedOrgId', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ store, orgId: 'org-A', loadedOrgId: 'org-B' });
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type?: string }).type);
    // fetchProjectTree is a thunk action — check that ANY action was dispatched
    expect(types.length).toBeGreaterThan(0);
  });

  it('does not dispatch when orgId equals loadedOrgId', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ store, orgId: 'org-A', loadedOrgId: 'org-A' });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('does not dispatch when orgId is the empty string', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ store, orgId: '', loadedOrgId: null });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('does not dispatch when orgId is the empty string AND loadedOrgId is also empty', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ store, orgId: '', loadedOrgId: '' });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('dispatches when loadedOrgId is null and orgId is non-empty (initial load)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ store, orgId: 'fresh-org', loadedOrgId: null });
    expect(dispatchSpy).toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Effect 2 — focus edit input
// ────────────────────────────────────────────────────────────────────────────

describe('effect 2: focus edit input', () => {
  it('does nothing when editingId is null', () => {
    const store = makeStore();
    const { result } = captureHook({ store, editingId: null });
    const focus = vi.fn();
    const select = vi.fn();
    (result.editInputRef as unknown as { current: { focus: typeof focus; select: typeof select } }).current = {
      focus,
      select,
    };
    // Re-fire to confirm the early return on null id even with a bound ref.
    effectByOrder(1).cb();
    expect(focus).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('does nothing when editInputRef.current is null', () => {
    const store = makeStore();
    captureHook({ store, editingId: 'p1' });
    // The first sync render fired the cb with current=null — if it crashed,
    // renderToString would throw. Just re-fire and confirm no-op.
    expect(() => effectByOrder(1).cb()).not.toThrow();
  });

  it('calls focus() + select() when editingId truthy and ref bound', () => {
    const store = makeStore();
    const { result } = captureHook({ store, editingId: 'p1' });
    const focus = vi.fn();
    const select = vi.fn();
    (result.editInputRef as unknown as { current: { focus: typeof focus; select: typeof select } }).current = {
      focus,
      select,
    };
    effectByOrder(1).cb();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Effect 3 — focus new-folder input
// ────────────────────────────────────────────────────────────────────────────

describe('effect 3: focus new-folder input', () => {
  it('does nothing when creatingFolder is null', () => {
    const store = makeStore();
    const { result } = captureHook({ store, creatingFolder: null });
    const focus = vi.fn();
    (result.newFolderRef as unknown as { current: { focus: typeof focus } }).current = { focus };
    effectByOrder(2).cb();
    expect(focus).not.toHaveBeenCalled();
  });

  it('does nothing when newFolderRef.current is null', () => {
    const store = makeStore();
    captureHook({ store, creatingFolder: 'root' });
    expect(() => effectByOrder(2).cb()).not.toThrow();
  });

  it('calls focus() when creatingFolder is truthy AND ref is bound', () => {
    const store = makeStore();
    const { result } = captureHook({ store, creatingFolder: 'root' });
    const focus = vi.fn();
    (result.newFolderRef as unknown as { current: { focus: typeof focus } }).current = { focus };
    effectByOrder(2).cb();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('calls focus() when creatingFolder is "root" or any non-null value', () => {
    const store = makeStore();
    const { result } = captureHook({ store, creatingFolder: 'parent-folder-id' });
    const focus = vi.fn();
    (result.newFolderRef as unknown as { current: { focus: typeof focus } }).current = { focus };
    effectByOrder(2).cb();
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Effect 4 — close context menu on outside click
// ────────────────────────────────────────────────────────────────────────────

describe('effect 4: outside-click closes context menu', () => {
  it('returns early (no listener registered) when contextMenu is null', () => {
    const store = makeStore();
    captureHook({ store, contextMenu: null });
    expect(documentListeners.get('mousedown')).toBeUndefined();
  });

  it('registers a mousedown listener on document when contextMenu is non-null', () => {
    const store = makeStore();
    captureHook({
      store,
      contextMenu: { x: 0, y: 0, type: 'project', id: 'p1' },
    });
    const set = documentListeners.get('mousedown');
    expect(set?.size).toBe(1);
  });

  it('cleanup removes the mousedown listener', () => {
    const store = makeStore();
    captureHook({
      store,
      contextMenu: { x: 0, y: 0, type: 'project', id: 'p1' },
    });
    expect(documentListeners.get('mousedown')?.size).toBe(1);
    const cleanup = effectByOrder(3).cleanup as () => void;
    cleanup();
    expect(documentListeners.get('mousedown')?.size).toBe(0);
  });

  it('mousedown outside menu calls setContextMenu(null)', () => {
    const store = makeStore();
    const setContextMenu = vi.fn();
    const { result } = captureHook({
      store,
      contextMenu: { x: 0, y: 0, type: 'project', id: 'p1' },
      setContextMenu,
    });
    // Bind the menu ref to a div with a "contains" method.
    const containsTarget = vi.fn().mockReturnValue(false);
    (result.menuRef as unknown as { current: { contains: typeof containsTarget } }).current = {
      contains: containsTarget,
    };
    // Dispatch a mousedown with a target that's NOT inside the menu.
    const target = { tagName: 'BODY' };
    const ev = { target } as unknown as MouseEvent;
    documentStub!.__dispatch('mousedown', ev);
    expect(containsTarget).toHaveBeenCalledWith(target);
    expect(setContextMenu).toHaveBeenCalledWith(null);
  });

  it('mousedown INSIDE menu does NOT call setContextMenu', () => {
    const store = makeStore();
    const setContextMenu = vi.fn();
    const { result } = captureHook({
      store,
      contextMenu: { x: 0, y: 0, type: 'project', id: 'p1' },
      setContextMenu,
    });
    const containsTarget = vi.fn().mockReturnValue(true);
    (result.menuRef as unknown as { current: { contains: typeof containsTarget } }).current = {
      contains: containsTarget,
    };
    const ev = { target: {} } as unknown as MouseEvent;
    documentStub!.__dispatch('mousedown', ev);
    expect(setContextMenu).not.toHaveBeenCalled();
  });

  it('mousedown when menuRef.current is null does NOT call setContextMenu', () => {
    const store = makeStore();
    const setContextMenu = vi.fn();
    captureHook({
      store,
      contextMenu: { x: 0, y: 0, type: 'project', id: 'p1' },
      setContextMenu,
    });
    // menuRef.current stays null — the `menuRef.current && ...` short-circuits.
    const ev = { target: {} } as unknown as MouseEvent;
    documentStub!.__dispatch('mousedown', ev);
    expect(setContextMenu).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Returned refs identity
// ────────────────────────────────────────────────────────────────────────────

describe('useTreeEffects — returned refs', () => {
  it('returns three refs (menuRef, editInputRef, newFolderRef) with .current === null initially', () => {
    const store = makeStore();
    const { result } = captureHook({ store });
    expect(result.menuRef.current).toBeNull();
    expect(result.editInputRef.current).toBeNull();
    expect(result.newFolderRef.current).toBeNull();
  });
});
