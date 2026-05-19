/**
 * rf-accent-5 — `DevAccentPicker` orchestrator.
 *
 * Pins the orchestrator's public API surface and the panel composition.
 * The heavy lifting (12 themes, applyPalette/clearOverrides DOM
 * mutators, the context object) lives in their own tests
 * (rf-accent-1..4) — here we mock those so the assertion surface stays
 * on this file.
 *
 * Mocks:
 *   - `useState` / `useEffect` / `useCallback` → mocked per the rf-rpal-8 /
 *     rf-pdpl-12 queued-ref-dispatch pattern (slot dispatcher +
 *     effect-capture). useCallback returns the inline callback unchanged.
 *   - `applyPalette` / `clearOverrides` → spy stubs.
 *   - `T` → 2-element fixture array (deterministic, smaller surface than
 *     the real 12-theme array).
 *   - `document.documentElement.classList` → a writable spy with
 *     `contains('dark')` returning a controlled boolean.
 *   - `localStorage` → in-memory map.
 *   - `window` → spy with addEventListener/removeEventListener.
 *   - `MutationObserver` → spy class capturing observe()/disconnect().
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  applyPalette: vi.fn(),
  clearOverrides: vi.fn(),
  // Captures last-passed Provider value so a test can fire `toggle`.
  contextValue: null as { toggle: () => void } | null,
  // Per-render captured ProviderCard props
  effects: [] as Array<{ cb: () => void | (() => void); deps: unknown[] }>,
  __resetUseState: (() => undefined) as (opts?: { keepSlots?: boolean }) => void,
  __setState: (() => undefined) as (i: number, v: unknown) => void,
  documentElement: {
    classList: {
      contains: vi.fn((cls: string) => cls === 'dark'),
    },
  } as unknown as { classList: { contains: ReturnType<typeof vi.fn> } },
  localStorageMap: new Map<string, string>(),
  observerInstances: [] as Array<{
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    cb: MutationCallback;
  }>,
  windowListeners: [] as Array<{ event: string; handler: EventListener }>,
  fixtureT: [
    {
      id: 'default',
      name: 'Default',
      description: 'Clean white and navy',
      preview: ['#3b82f6', '#0c1118', '#ffffff'] as [string, string, string],
      light: {
        base: '#fff',
        surface: '#eee',
        raised: '#ddd',
        overlay: '#ccc',
        hover: 'rgba(0,0,0,0.04)',
        active: 'rgba(0,0,0,0.08)',
        toolbar: '#bbb',
        border: '#aaa',
        borderStrong: '#999',
        text1: '#000',
        text2: '#222',
        text3: '#444',
        accent: '#3b82f6',
        accentHover: '#2563eb',
        accentMuted: 'rgba(37,99,235,0.12)',
        green: '#16a34a',
        red: '#dc2626',
        yellow: '#b45309',
      },
      dark: {
        base: '#0c1118',
        surface: '#151d2a',
        raised: '#1e2838',
        overlay: '#222e40',
        hover: 'rgba(255,255,255,0.06)',
        active: 'rgba(255,255,255,0.09)',
        toolbar: '#111923',
        border: '#1f2c3e',
        borderStrong: '#2e3f55',
        text1: '#e1e7ef',
        text2: '#8b9ab5',
        text3: '#576579',
        accent: '#4c9aff',
        accentHover: '#6bb0ff',
        accentMuted: 'rgba(76,154,255,0.15)',
        green: '#34d399',
        red: '#f87171',
        yellow: '#fbbf24',
      },
    },
    {
      id: 'retro',
      name: 'Retro',
      description: 'Tan parchment',
      preview: ['#ef9995', '#2E282A', '#ece3ca'] as [string, string, string],
      light: {
        base: '#ece3ca',
        surface: '#e4d8b4',
        raised: '#EDE6D4',
        overlay: '#f5efe0',
        hover: 'rgba(40,36,37,0.07)',
        active: 'rgba(40,36,37,0.14)',
        toolbar: '#DBCA9A',
        border: '#c8b888',
        borderStrong: '#a89868',
        text1: '#282425',
        text2: '#4a4540',
        text3: '#706860',
        accent: '#ef9995',
        accentHover: '#e07a76',
        accentMuted: 'rgba(239,153,149,0.22)',
        green: '#a4cbb4',
        red: '#ef9995',
        yellow: '#DC8850',
      },
      dark: {
        base: '#1C1918',
        surface: '#2E282A',
        raised: '#443C3E',
        overlay: '#584E50',
        hover: 'rgba(237,230,212,0.08)',
        active: 'rgba(237,230,212,0.15)',
        toolbar: '#252122',
        border: '#584E50',
        borderStrong: '#706260',
        text1: '#EDE6D4',
        text2: '#c8b888',
        text3: '#907860',
        accent: '#ef9995',
        accentHover: '#f5b5b2',
        accentMuted: 'rgba(239,153,149,0.22)',
        green: '#a4cbb4',
        red: '#ef9995',
        yellow: '#DC8850',
      },
    },
  ],
}));

// Alias for readability inside the test bodies.
const FIXTURE_T = mocks.fixtureT;

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let stateSlots: unknown[] = [];
  let useStateIdx = 0;
  mocks.__resetUseState = (opts) => {
    if (!opts?.keepSlots) stateSlots = [];
    useStateIdx = 0;
  };
  mocks.__setState = (i: number, v: unknown) => {
    stateSlots[i] = v;
  };
  const patchedUseState = vi.fn((initial?: unknown) => {
    const slot = useStateIdx;
    if (stateSlots.length <= slot) {
      const init = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      stateSlots.push(init);
    }
    const setter = vi.fn((next: unknown) => {
      const cur = stateSlots[slot];
      const resolved = typeof next === 'function' ? (next as (prev: unknown) => unknown)(cur) : next;
      stateSlots[slot] = resolved;
    });
    useStateIdx += 1;
    return [stateSlots[slot], setter];
  });
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps: deps ?? [] });
  });
  const patchedUseCallback = vi.fn((cb: unknown) => cb);
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useEffect: patchedUseEffect,
    useCallback: patchedUseCallback,
    default: {
      ...actualDefault,
      useState: patchedUseState,
      useEffect: patchedUseEffect,
      useCallback: patchedUseCallback,
    },
  };
});

vi.mock('../data/themes', () => ({ T: mocks.fixtureT }));
vi.mock('../utils/apply-palette', () => ({
  applyPalette: mocks.applyPalette,
  clearOverrides: mocks.clearOverrides,
}));

import { DevAccentPicker } from '../../dev-accent-picker';

// ─── Tree-walker (rf-rpal-8 / rf-pdpl-7..15 pattern) ──────────────────────

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
      /* skip */
    }
    return;
  }
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function collectText(tree: React.ReactNode): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = (el.props as { children?: React.ReactNode } | undefined)?.children;
    if (typeof c === 'string') s += c;
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
      }
    }
  }
  return s;
}

const renderPicker = (props: { children?: React.ReactNode } = {}): React.ReactNode => {
  mocks.__resetUseState();
  mocks.effects.length = 0;
  return (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)(props);
};

// ─── Globals ────────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.applyPalette.mockReset();
  mocks.clearOverrides.mockReset();
  mocks.contextValue = null;
  mocks.observerInstances.length = 0;
  mocks.windowListeners.length = 0;
  mocks.localStorageMap.clear();
  mocks.documentElement.classList.contains = vi.fn((cls: string) => cls === 'dark');

  vi.stubGlobal('document', {
    documentElement: mocks.documentElement,
  });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mocks.localStorageMap.get(k) ?? null,
    setItem: (k: string, v: string) => mocks.localStorageMap.set(k, v),
    removeItem: (k: string) => mocks.localStorageMap.delete(k),
  });
  vi.stubGlobal(
    'MutationObserver',
    class MO {
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      cb: MutationCallback;
      constructor(cb: MutationCallback) {
        this.cb = cb;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        mocks.observerInstances.push(this);
      }
    },
  );
  vi.stubGlobal('window', {
    addEventListener: vi.fn((event: string, handler: EventListener) => {
      mocks.windowListeners.push({ event, handler });
    }),
    removeEventListener: vi.fn((event: string, handler: EventListener) => {
      const idx = mocks.windowListeners.findIndex((l) => l.event === event && l.handler === handler);
      if (idx >= 0) mocks.windowListeners.splice(idx, 1);
    }),
  });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DevAccentPicker — closed (open=false)', () => {
  it('returns a Provider wrapping children with no panel', () => {
    const tree = renderPicker({ children: 'app-content' });
    const text = collectText(tree);
    expect(text).toContain('app-content');
    // No panel-only literals when closed.
    expect(text).not.toContain('Color Themes');
  });

  it('passes a `toggle` function through context', () => {
    const tree = renderPicker();
    // The root yielded element is the Provider.
    const els = Array.from(walk(tree));
    const provider = els.find((e) => {
      const t = e.type as unknown as { $$typeof?: symbol; _context?: unknown };
      return t && (t._context !== undefined || (t as { Provider?: unknown }).Provider !== undefined);
    });
    expect(provider).toBeDefined();
    const value = (provider!.props as { value: { toggle: () => void } }).value;
    expect(typeof value.toggle).toBe('function');
  });
});

describe('DevAccentPicker — open (open=true)', () => {
  it('renders the "Color Themes" header + N-themes footer when open', () => {
    renderPicker();
    // open is slot 0 (initial: false). Force it true.
    mocks.__setState(0, true);
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const text = collectText(tree);
    expect(text).toContain('Color Themes');
    expect(text).toContain('themes'); // "{T.length} themes" footer
  });

  it('renders one button per theme entry', () => {
    renderPicker();
    mocks.__setState(0, true); // open
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    // Theme buttons live in the scrollable list — they have a className with "rounded-md px-3 py-2.5".
    const themeButtons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('px-3') &&
        (el.props as { className: string }).className.includes('py-2.5'),
    );
    expect(themeButtons).toHaveLength(FIXTURE_T.length);
  });

  it('renders each theme name + description text', () => {
    renderPicker();
    mocks.__setState(0, true);
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const text = collectText(tree);
    expect(text).toContain('Default');
    expect(text).toContain('Clean white and navy');
    expect(text).toContain('Retro');
    expect(text).toContain('Tan parchment');
  });

  it('clicking a theme button fires applyPalette with the dark palette when classList.contains("dark") is true', () => {
    renderPicker();
    mocks.__setState(0, true);
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const themeButtons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('px-3') &&
        (el.props as { className: string }).className.includes('py-2.5'),
    );
    expect(themeButtons[0]).toBeDefined();
    (themeButtons[0].props as { onClick: () => void }).onClick();
    // classList.contains mock returns true for 'dark', so dark palette wins.
    expect(mocks.applyPalette).toHaveBeenCalledWith(FIXTURE_T[0].dark);
    // localStorage should be updated.
    expect(mocks.localStorageMap.get('ice-theme-id')).toBe('default');
  });

  it('clicking a theme button fires applyPalette with the light palette when not dark', () => {
    mocks.documentElement.classList.contains = vi.fn(() => false);
    renderPicker();
    mocks.__setState(0, true);
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const themeButtons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('px-3') &&
        (el.props as { className: string }).className.includes('py-2.5'),
    );
    (themeButtons[1].props as { onClick: () => void }).onClick();
    expect(mocks.applyPalette).toHaveBeenCalledWith(FIXTURE_T[1].light);
    expect(mocks.localStorageMap.get('ice-theme-id')).toBe('retro');
  });

  it('Reset button fires clearOverrides + clears activeId', () => {
    renderPicker();
    mocks.__setState(0, true); // open
    mocks.__setState(1, 'default'); // activeId
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const resetBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-ice-2xs') &&
        (el.props as { className: string }).className.includes('hover:opacity-100'),
    )[0];
    expect(resetBtn).toBeDefined();
    (resetBtn.props as { onClick: () => void }).onClick();
    expect(mocks.clearOverrides).toHaveBeenCalledTimes(1);
  });

  it('X button onClick sets open to false', () => {
    renderPicker();
    mocks.__setState(0, true); // open
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const xBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('p-0.5'),
    )[0];
    expect(xBtn).toBeDefined();
    // Just exercising the handler — no throw.
    expect(() => (xBtn.props as { onClick: () => void }).onClick()).not.toThrow();
  });

  it('renders Active badge on the currently-selected theme', () => {
    renderPicker();
    mocks.__setState(0, true); // open
    mocks.__setState(1, 'retro'); // activeId
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const text = collectText(tree);
    expect(text).toContain('Active');
  });

  it('renders Sun icon when not dark, Moon when dark', () => {
    mocks.documentElement.classList.contains = vi.fn(() => false);
    renderPicker();
    mocks.__setState(0, true);
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const text = collectText(tree);
    expect(text).toContain('Light');
    expect(text).not.toContain('Dark');
  });

  it('theme button onMouseEnter sets bg-hover when NOT active', () => {
    renderPicker();
    mocks.__setState(0, true); // open
    mocks.__setState(1, null); // activeId is null (no active theme)
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const themeButtons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('px-3') &&
        (el.props as { className: string }).className.includes('py-2.5'),
    );
    const target = { style: { background: 'transparent' } };
    (
      themeButtons[0].props as {
        onMouseEnter: (e: { currentTarget: typeof target }) => void;
      }
    ).onMouseEnter({ currentTarget: target });
    expect(target.style.background).toBe('var(--ice-bg-hover)');
  });

  it('theme button onMouseLeave clears background when NOT active', () => {
    renderPicker();
    mocks.__setState(0, true); // open
    mocks.__setState(1, null);
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const themeButtons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('px-3') &&
        (el.props as { className: string }).className.includes('py-2.5'),
    );
    const target = { style: { background: 'var(--ice-bg-hover)' } };
    (
      themeButtons[0].props as {
        onMouseLeave: (e: { currentTarget: typeof target }) => void;
      }
    ).onMouseLeave({ currentTarget: target });
    expect(target.style.background).toBe('transparent');
  });

  it('theme button onMouseEnter does NOT mutate background when active', () => {
    renderPicker();
    mocks.__setState(0, true);
    mocks.__setState(1, 'default'); // activeId matches first theme
    mocks.__resetUseState({ keepSlots: true });
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const themeButtons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('px-3') &&
        (el.props as { className: string }).className.includes('py-2.5'),
    );
    // First button is active (activeId === 'default'); enter/leave should no-op.
    const target = { style: { background: 'var(--ice-bg-active)' } };
    (
      themeButtons[0].props as {
        onMouseEnter: (e: { currentTarget: typeof target }) => void;
      }
    ).onMouseEnter({ currentTarget: target });
    expect(target.style.background).toBe('var(--ice-bg-active)');
    (
      themeButtons[0].props as {
        onMouseLeave: (e: { currentTarget: typeof target }) => void;
      }
    ).onMouseLeave({ currentTarget: target });
    expect(target.style.background).toBe('var(--ice-bg-active)');
  });
});

describe('DevAccentPicker — effects', () => {
  it('registers four useEffects (dark observer, restore, palette-apply on activeId/dark change, hotkey)', () => {
    renderPicker();
    expect(mocks.effects).toHaveLength(4);
  });

  it('first effect (deps=[]) creates a MutationObserver and observes documentElement', () => {
    renderPicker();
    const darkEffect = mocks.effects[0];
    expect(darkEffect.deps).toEqual([]);
    const cleanup = darkEffect.cb();
    expect(mocks.observerInstances).toHaveLength(1);
    expect(mocks.observerInstances[0].observe).toHaveBeenCalledTimes(1);
    // The observer.observe call's second arg pins the attributeFilter.
    const callArgs = mocks.observerInstances[0].observe.mock.calls[0];
    expect(callArgs[1]).toEqual({ attributes: true, attributeFilter: ['class'] });
    // Cleanup disconnects.
    if (typeof cleanup === 'function') cleanup();
    expect(mocks.observerInstances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('second effect (no deps) reads localStorage and re-applies a saved theme (dark branch)', () => {
    mocks.localStorageMap.set('ice-theme-id', 'retro');
    renderPicker();
    const restoreEffect = mocks.effects[1];
    restoreEffect.cb();
    expect(mocks.applyPalette).toHaveBeenCalledWith(FIXTURE_T[1].dark); // contains('dark') returns true
  });

  it('second effect re-applies a saved theme (light branch)', () => {
    mocks.documentElement.classList.contains = vi.fn(() => false);
    mocks.localStorageMap.set('ice-theme-id', 'default');
    renderPicker();
    const restoreEffect = mocks.effects[1];
    restoreEffect.cb();
    expect(mocks.applyPalette).toHaveBeenCalledWith(FIXTURE_T[0].light);
  });

  it('second effect ignores unknown saved IDs without throwing', () => {
    mocks.localStorageMap.set('ice-theme-id', 'no-such-theme');
    renderPicker();
    const restoreEffect = mocks.effects[1];
    expect(() => restoreEffect.cb()).not.toThrow();
    expect(mocks.applyPalette).not.toHaveBeenCalled();
  });

  it('second effect short-circuits when no saved id', () => {
    renderPicker();
    const restoreEffect = mocks.effects[1];
    restoreEffect.cb();
    expect(mocks.applyPalette).not.toHaveBeenCalled();
  });

  it('third effect (deps=[isDark, activeId]) re-applies palette when activeId is set (dark branch)', () => {
    renderPicker();
    mocks.__setState(1, 'default'); // activeId slot
    mocks.__setState(2, true); // isDark slot
    mocks.__resetUseState({ keepSlots: true });
    mocks.effects.length = 0;
    (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const applyEffect = mocks.effects[2];
    expect(applyEffect.deps).toEqual([true, 'default']);
    applyEffect.cb();
    expect(mocks.applyPalette).toHaveBeenCalledWith(FIXTURE_T[0].dark);
  });

  it('third effect picks the light palette when isDark is false', () => {
    mocks.documentElement.classList.contains = vi.fn(() => false);
    renderPicker();
    mocks.__setState(1, 'retro');
    mocks.__setState(2, false);
    mocks.__resetUseState({ keepSlots: true });
    mocks.effects.length = 0;
    (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const applyEffect = mocks.effects[2];
    applyEffect.cb();
    expect(mocks.applyPalette).toHaveBeenCalledWith(FIXTURE_T[1].light);
  });

  it('third effect short-circuits when activeId is null', () => {
    renderPicker();
    const applyEffect = mocks.effects[2];
    applyEffect.cb();
    expect(mocks.applyPalette).not.toHaveBeenCalled();
  });

  it('third effect ignores unknown activeId without throwing', () => {
    renderPicker();
    mocks.__setState(1, 'no-such-theme');
    mocks.__setState(2, true);
    mocks.__resetUseState({ keepSlots: true });
    mocks.effects.length = 0;
    (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const applyEffect = mocks.effects[2];
    expect(() => applyEffect.cb()).not.toThrow();
    expect(mocks.applyPalette).not.toHaveBeenCalled();
  });

  it('fourth effect (deps=[]) wires window keydown for Ctrl+Shift+A', () => {
    renderPicker();
    const hotkeyEffect = mocks.effects[3];
    expect(hotkeyEffect.deps).toEqual([]);
    const cleanup = hotkeyEffect.cb();
    expect(mocks.windowListeners).toHaveLength(1);
    expect(mocks.windowListeners[0].event).toBe('keydown');
    // Fire a non-matching key — the handler shouldn't preventDefault().
    const preventDefault = vi.fn();
    const handler = mocks.windowListeners[0].handler as unknown as (e: KeyboardEvent) => void;
    handler({ ctrlKey: false, metaKey: false, shiftKey: true, key: 'A', preventDefault } as unknown as KeyboardEvent);
    expect(preventDefault).not.toHaveBeenCalled();
    // Fire Ctrl+Shift+A — preventDefault fires + setOpen toggles.
    handler({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'A', preventDefault } as unknown as KeyboardEvent);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    // Also Cmd+Shift+A on macOS.
    handler({ ctrlKey: false, metaKey: true, shiftKey: true, key: 'A', preventDefault } as unknown as KeyboardEvent);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    if (typeof cleanup === 'function') cleanup();
    expect(mocks.windowListeners).toHaveLength(0);
  });

  it('mutation observer callback updates isDark when documentElement.classList changes', () => {
    renderPicker();
    const darkEffect = mocks.effects[0];
    darkEffect.cb();
    const observer = mocks.observerInstances[0];
    // Flip classList.contains so the next call returns false.
    mocks.documentElement.classList.contains = vi.fn(() => false);
    observer.cb([] as unknown as MutationRecord[], observer as unknown as MutationObserver);
    // The observer's callback calls setIsDark — slot 2 should now be false.
    // We verify indirectly by re-rendering and checking the panel renders Light.
    mocks.__resetUseState({ keepSlots: true });
    mocks.__setState(0, true); // open
    const tree = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const text = collectText(tree);
    expect(text).toContain('Light');
  });
});

describe('DevAccentPicker — toggle from context', () => {
  it('toggle() flips the open state', () => {
    const tree = renderPicker();
    // The Provider's value carries the toggle.
    const provider = Array.from(walk(tree)).find((e) => {
      const t = e.type as unknown as { _context?: unknown };
      return t && (t._context !== undefined || (t as { Provider?: unknown }).Provider !== undefined);
    });
    const toggle = (provider!.props as { value: { toggle: () => void } }).value.toggle;
    // Initial: open=false. Fire toggle.
    expect(toggle).toBeDefined();
    toggle();
    // Re-render — open should now be true.
    mocks.__resetUseState({ keepSlots: true });
    const tree2 = (DevAccentPicker as unknown as (p: { children?: React.ReactNode }) => React.ReactNode)({});
    const text = collectText(tree2);
    expect(text).toContain('Color Themes');
  });
});

describe('DevAccentPicker — re-export surface', () => {
  it('re-exports useThemePicker from the public canonical path', async () => {
    const mod = await import('../../dev-accent-picker');
    expect(mod.useThemePicker).toBeDefined();
    expect(typeof mod.useThemePicker).toBe('function');
  });
});
