/**
 * tour-11 — `useTourKeyboard` hook tests.
 *
 * Per decision 2026-05-08, this is a leaf hook with a tiny DOM surface
 * (`window.addEventListener` + `document.activeElement`), so we run
 * under node-env with `vi.stubGlobal` rather than jsdom — matching the
 * pattern from `stubbing-window-and-keyboardevent-for-node-env-keydown-listener-tests`.
 *
 * Mocks:
 *   - `useEffect` runs synchronously so the hook attaches the listener
 *     during the same tick as the call. Cleanups are stashed so we can
 *     drive unmount manually.
 *   - `useRef` returns a real-ish ref slot for `callbacksRef`. The hook
 *     re-writes `.current` on every call, so a single hoisted slot is
 *     fine.
 *   - `window` is a stub event bus (Map<type, Set<listener>>): supports
 *     `addEventListener` / `removeEventListener` with capture flag, plus
 *     a manual `dispatch(type, init)` helper for tests to trigger
 *     keypresses without a real DOM.
 *   - `document` is a stub object with a writable `activeElement` so
 *     each test can flip the focus state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ListenerEntry {
  cb: (e: KeyboardEvent) => void;
  capture: boolean;
}

const mocks = vi.hoisted(() => ({
  // Each test gets a fresh map; cleared in `beforeEach`.
  listeners: new Map<string, ListenerEntry[]>(),
  effectCleanups: [] as Array<() => void>,
  // Single ref slot — the hook only uses one.
  refSlot: { current: null as unknown },
  // Test-controlled active element. Tests overwrite via `setActiveTag`.
  activeElement: null as (Element & { isContentEditable?: boolean }) | null,
}));

vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void)) => {
      const cleanup = cb();
      if (typeof cleanup === 'function') {
        mocks.effectCleanups.push(cleanup);
      }
    },
    useRef: (initial: unknown) => {
      // First call seeds; later calls return the same wrapper. The hook
      // overwrites `.current` itself so we don't need to track writes.
      if (mocks.refSlot.current === null) {
        mocks.refSlot.current = { current: initial };
      }
      return mocks.refSlot.current;
    },
  };
});

import { useTourKeyboard } from '../use-tour-keyboard';

class StubKeyboardEvent {
  type: string;
  key: string;
  defaultPrevented = false;
  constructor(type: string, init?: { key?: string }) {
    this.type = type;
    this.key = init?.key ?? '';
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

function setActiveElement(spec: null | { tagName: string; isContentEditable?: boolean } | Element): void {
  if (spec === null) {
    mocks.activeElement = null;
    return;
  }
  if ('tagName' in spec && typeof spec.tagName === 'string') {
    mocks.activeElement = {
      tagName: spec.tagName.toUpperCase(),
      isContentEditable: 'isContentEditable' in spec ? spec.isContentEditable : false,
    } as unknown as Element & { isContentEditable?: boolean };
    return;
  }
  mocks.activeElement = spec as unknown as Element & {
    isContentEditable?: boolean;
  };
}

function dispatchKey(key: string): StubKeyboardEvent {
  const ev = new StubKeyboardEvent('keydown', { key });
  const entries = mocks.listeners.get('keydown') ?? [];
  // Capture-phase listeners always run before bubble-phase listeners,
  // regardless of registration order — that's the DOM event contract.
  // Within each phase, registration order is preserved.
  const captures = entries.filter((e) => e.capture);
  const bubbles = entries.filter((e) => !e.capture);
  for (const entry of [...captures, ...bubbles]) {
    entry.cb(ev as unknown as KeyboardEvent);
  }
  return ev;
}

beforeEach(() => {
  mocks.listeners = new Map();
  mocks.effectCleanups = [];
  mocks.refSlot.current = null;
  mocks.activeElement = null;

  vi.stubGlobal('window', {
    addEventListener: vi.fn(
      (type: string, cb: (e: KeyboardEvent) => void, opts?: boolean | AddEventListenerOptions) => {
        const capture = typeof opts === 'boolean' ? opts : opts?.capture === true;
        if (!mocks.listeners.has(type)) mocks.listeners.set(type, []);
        mocks.listeners.get(type)!.push({ cb, capture });
      },
    ),
    removeEventListener: vi.fn(
      (
        type: string,
        cb: (e: KeyboardEvent) => void,
        // capture flag is part of the matching key — accept it but don't
        // require equality (the hook always passes the same shape).
      ) => {
        const list = mocks.listeners.get(type);
        if (!list) return;
        const idx = list.findIndex((l) => l.cb === cb);
        if (idx >= 0) list.splice(idx, 1);
      },
    ),
  });
  vi.stubGlobal(
    'document',
    new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'activeElement') return mocks.activeElement;
          return undefined;
        },
      },
    ),
  );
  vi.stubGlobal('KeyboardEvent', StubKeyboardEvent);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface CallSpies {
  onAdvance: ReturnType<typeof vi.fn<() => void>>;
  onPrevious: ReturnType<typeof vi.fn<() => void>>;
  onSkip: ReturnType<typeof vi.fn<() => void>>;
}

function freshSpies(): CallSpies {
  return {
    onAdvance: vi.fn<() => void>(),
    onPrevious: vi.fn<() => void>(),
    onSkip: vi.fn<() => void>(),
  };
}

function mount(active: boolean, spies: CallSpies): void {
  // Test harness — `mount` is a deliberate name for the per-test
  // "render once with these args" pattern, not a custom hook.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useTourKeyboard({
    active,
    onAdvance: spies.onAdvance,
    onPrevious: spies.onPrevious,
    onSkip: spies.onSkip,
  });
}

// ────────────────────────────────────────────────────────────────────────────

describe('useTourKeyboard — listener lifecycle', () => {
  it('attaches a single keydown listener when active=true', () => {
    mount(true, freshSpies());
    expect(mocks.listeners.get('keydown')?.length ?? 0).toBe(1);
  });

  it('attaches the listener with capture: true', () => {
    mount(true, freshSpies());
    const entry = mocks.listeners.get('keydown')?.[0];
    expect(entry?.capture).toBe(true);
  });

  it('capture-phase handler runs before bubble-phase listeners on dispatch', () => {
    // Pre-register a bubble listener BEFORE the hook installs its
    // capture-phase one. Real DOM event semantics: capture listeners
    // run before bubble listeners regardless of registration order.
    // The dispatch helper enforces that ordering, so the capture
    // listener — registered second, in the hook's effect — must still
    // fire first.
    const callOrder: string[] = [];
    const bubbleSpy = vi.fn<() => void>(() => {
      callOrder.push('bubble-handler');
    });
    (window as unknown as Window).addEventListener(
      'keydown',
      bubbleSpy as EventListener,
      // capture-flag absent → bubble phase
    );
    const spies: CallSpies = {
      onAdvance: vi.fn<() => void>(() => {
        callOrder.push('tour-handler');
      }),
      onPrevious: vi.fn<() => void>(),
      onSkip: vi.fn<() => void>(),
    };
    mount(true, spies);
    dispatchKey('ArrowRight');
    expect(callOrder).toEqual(['tour-handler', 'bubble-handler']);
  });

  it('does not attach a listener when active=false', () => {
    mount(false, freshSpies());
    expect(mocks.listeners.get('keydown')?.length ?? 0).toBe(0);
  });

  it('detaches the listener when the cleanup fn fires (active flips false)', () => {
    mount(true, freshSpies());
    expect(mocks.listeners.get('keydown')?.length).toBe(1);
    // Run effect cleanup — equivalent to `active` flipping from true to
    // false on a re-render (or unmount).
    mocks.effectCleanups.forEach((c) => c());
    expect(mocks.listeners.get('keydown')?.length ?? 0).toBe(0);
  });

  it('listener detached on unmount path', () => {
    mount(true, freshSpies());
    expect(mocks.listeners.get('keydown')?.length).toBe(1);
    mocks.effectCleanups.forEach((c) => c());
    expect(mocks.listeners.get('keydown')?.length ?? 0).toBe(0);
  });
});

describe('useTourKeyboard — Escape', () => {
  it('Escape → onSkip + preventDefault', () => {
    const spies = freshSpies();
    mount(true, spies);
    const ev = dispatchKey('Escape');
    expect(spies.onSkip).toHaveBeenCalledTimes(1);
    expect(spies.onAdvance).not.toHaveBeenCalled();
    expect(spies.onPrevious).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Escape fires onSkip even when an INPUT is focused', () => {
    const spies = freshSpies();
    mount(true, spies);
    setActiveElement({ tagName: 'INPUT' });
    dispatchKey('Escape');
    expect(spies.onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('useTourKeyboard — ArrowRight / Enter (advance)', () => {
  it('ArrowRight → onAdvance + preventDefault', () => {
    const spies = freshSpies();
    mount(true, spies);
    const ev = dispatchKey('ArrowRight');
    expect(spies.onAdvance).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Enter → onAdvance + preventDefault', () => {
    const spies = freshSpies();
    mount(true, spies);
    const ev = dispatchKey('Enter');
    expect(spies.onAdvance).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('ArrowRight while INPUT is focused → no advance', () => {
    const spies = freshSpies();
    mount(true, spies);
    setActiveElement({ tagName: 'INPUT' });
    dispatchKey('ArrowRight');
    expect(spies.onAdvance).not.toHaveBeenCalled();
  });

  it('ArrowRight while TEXTAREA is focused → no advance', () => {
    const spies = freshSpies();
    mount(true, spies);
    setActiveElement({ tagName: 'TEXTAREA' });
    dispatchKey('ArrowRight');
    expect(spies.onAdvance).not.toHaveBeenCalled();
  });

  it('ArrowRight while SELECT is focused → no advance', () => {
    const spies = freshSpies();
    mount(true, spies);
    setActiveElement({ tagName: 'SELECT' });
    dispatchKey('ArrowRight');
    expect(spies.onAdvance).not.toHaveBeenCalled();
  });

  it('ArrowRight while contentEditable element is focused → no advance', () => {
    const spies = freshSpies();
    mount(true, spies);
    setActiveElement({ tagName: 'DIV', isContentEditable: true });
    dispatchKey('ArrowRight');
    expect(spies.onAdvance).not.toHaveBeenCalled();
  });

  it('Enter on INPUT → no advance (do not steal form submit/commit)', () => {
    const spies = freshSpies();
    mount(true, spies);
    setActiveElement({ tagName: 'INPUT' });
    dispatchKey('Enter');
    expect(spies.onAdvance).not.toHaveBeenCalled();
  });

  it('Enter on TEXTAREA → no advance', () => {
    const spies = freshSpies();
    mount(true, spies);
    setActiveElement({ tagName: 'TEXTAREA' });
    dispatchKey('Enter');
    expect(spies.onAdvance).not.toHaveBeenCalled();
  });

  it('Space → onAdvance + preventDefault', () => {
    const spies = freshSpies();
    mount(true, spies);
    const ev = dispatchKey(' ');
    expect(spies.onAdvance).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Space on INPUT → no advance (do not steal typing)', () => {
    const spies = freshSpies();
    mount(true, spies);
    setActiveElement({ tagName: 'INPUT' });
    dispatchKey(' ');
    expect(spies.onAdvance).not.toHaveBeenCalled();
  });
});

describe('useTourKeyboard — ArrowLeft (previous)', () => {
  it('ArrowLeft → onPrevious + preventDefault', () => {
    const spies = freshSpies();
    mount(true, spies);
    const ev = dispatchKey('ArrowLeft');
    expect(spies.onPrevious).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('ArrowLeft while INPUT is focused → no previous', () => {
    const spies = freshSpies();
    mount(true, spies);
    setActiveElement({ tagName: 'INPUT' });
    dispatchKey('ArrowLeft');
    expect(spies.onPrevious).not.toHaveBeenCalled();
  });

  it('ArrowLeft while contentEditable is focused → no previous', () => {
    const spies = freshSpies();
    mount(true, spies);
    setActiveElement({ tagName: 'DIV', isContentEditable: true });
    dispatchKey('ArrowLeft');
    expect(spies.onPrevious).not.toHaveBeenCalled();
  });
});

describe('useTourKeyboard — non-matching keys', () => {
  it('non-matching key (e.g. "a") → no handler fires', () => {
    const spies = freshSpies();
    mount(true, spies);
    dispatchKey('a');
    expect(spies.onAdvance).not.toHaveBeenCalled();
    expect(spies.onPrevious).not.toHaveBeenCalled();
    expect(spies.onSkip).not.toHaveBeenCalled();
  });

  it('Tab is ignored (focus trap is a separate concern)', () => {
    const spies = freshSpies();
    mount(true, spies);
    dispatchKey('Tab');
    expect(spies.onAdvance).not.toHaveBeenCalled();
    expect(spies.onPrevious).not.toHaveBeenCalled();
    expect(spies.onSkip).not.toHaveBeenCalled();
  });
});

describe('useTourKeyboard — multi-key sequences', () => {
  it('multiple keys in a row each fire the correct handler', () => {
    const spies = freshSpies();
    mount(true, spies);
    dispatchKey('ArrowRight');
    dispatchKey('ArrowRight');
    dispatchKey('ArrowLeft');
    dispatchKey('Escape');
    expect(spies.onAdvance).toHaveBeenCalledTimes(2);
    expect(spies.onPrevious).toHaveBeenCalledTimes(1);
    expect(spies.onSkip).toHaveBeenCalledTimes(1);
  });
});
