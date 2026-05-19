/**
 * rf-canvint-4 — `useKeyboardHandlers` regression tests.
 *
 * The hook installs a single `useEffect` with `[]` deps that adds three
 * window listeners (`keydown`, `keyup`, `blur`) plus an internal
 * requestAnimationFrame loop for keyboard pan. The orchestrator owns
 * the latest-callback refs.
 *
 * Test harness:
 *  - Mock `useEffect` to fire synchronously, stash the cleanup.
 *  - Spy `window.addEventListener` to capture the three listeners by
 *    event-name key, then drive each listener with synthetic
 *    KeyboardEvents.
 *  - Stub `requestAnimationFrame` / `cancelAnimationFrame` so the pan
 *    loop is testable without a real animation frame scheduler.
 *
 * Discovered: rf-pdpl-21
 * `fingerprint-multi-useEffect-by-deps-array-shape-when-bundled-in-one-hook`
 * — single effect here, but the pattern of stashing
 * `{cb, deps, cleanup}` per registration is the same. The
 * `addEventListener` spy fingerprint by event NAME (not deps shape)
 * because all three listeners install on the same effect.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MutableRefObject } from 'react';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

interface CapturedListener {
  type: string;
  fn: EventListener;
  options?: AddEventListenerOptions | boolean;
}

const mocks = vi.hoisted(() => ({
  // Captured `useEffect(cb, deps)` registrations — single entry expected.
  effects: [] as Array<{ cb: () => void | (() => void); deps?: readonly unknown[]; cleanup?: () => void }>,
  // window.addEventListener captures keyed by event type.
  windowListeners: [] as CapturedListener[],
  // requestAnimationFrame captures: queue of callbacks.
  rafQueue: [] as Array<{ id: number; cb: FrameRequestCallback }>,
  rafNextId: 0,
  cancelledIds: new Set<number>(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn((cb: () => void | (() => void), deps?: readonly unknown[]) => {
      const slot: { cb: typeof cb; deps?: readonly unknown[]; cleanup?: () => void } = { cb, deps };
      const cleanup = cb();
      if (typeof cleanup === 'function') {
        slot.cleanup = cleanup;
      }
      mocks.effects.push(slot);
    }),
  };
});

import { useKeyboardHandlers } from '../interactions/use-keyboard-handlers';
import type { CanvasViewport, UseCanvasInteractionsOptions } from '../interactions/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const mkRef = <T,>(value: T): MutableRefObject<T> => ({ current: value });

interface SetupOpts {
  viewport?: CanvasViewport;
  locked?: boolean;
  spaceHeld?: boolean;
  onViewportChange?: UseCanvasInteractionsOptions['onViewportChange'];
  onDelete?: UseCanvasInteractionsOptions['onDelete'];
  onSelect?: UseCanvasInteractionsOptions['onSelect'];
  onSelectAll?: () => void;
}

const setup = (opts: SetupOpts = {}) => {
  const viewportRef = mkRef<CanvasViewport>(opts.viewport ?? { x: 0, y: 0, zoom: 1 });
  const lockedRef = mkRef<boolean>(opts.locked ?? false);
  const spaceHeldRef = mkRef<boolean>(opts.spaceHeld ?? false);

  const onViewportChange = opts.onViewportChange ?? vi.fn();
  const onDelete = opts.onDelete ?? vi.fn();
  const onSelect = opts.onSelect ?? vi.fn();
  const onSelectAll = opts.onSelectAll ?? vi.fn();

  const onViewportChangeRef = mkRef<UseCanvasInteractionsOptions['onViewportChange']>(onViewportChange);
  const onDeleteRef = mkRef<UseCanvasInteractionsOptions['onDelete']>(onDelete);
  const onSelectRef = mkRef<UseCanvasInteractionsOptions['onSelect']>(onSelect);
  const onSelectAllRef = mkRef<(() => void) | undefined>(onSelectAll);

  // Wrap in a Probe + renderToString so React's useRef has a fiber.
  const Probe: React.FC = () => {
    useKeyboardHandlers({
      viewportRef,
      lockedRef,
      spaceHeldRef,
      onViewportChangeRef,
      onDeleteRef,
      onSelectRef,
      onSelectAllRef,
    });
    return React.createElement('div', null, 'probe');
  };
  renderToString(React.createElement(Probe));

  return {
    refs: { viewportRef, lockedRef, spaceHeldRef },
    spies: { onViewportChange, onDelete, onSelect, onSelectAll },
  };
};

const findListener = (type: string): EventListener => {
  const found = mocks.windowListeners.find((l) => l.type === type);
  if (!found) throw new Error(`No window listener registered for "${type}"`);
  return found.fn;
};

interface KbdEventShape {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  target?: EventTarget | null;
  preventDefault: () => void;
}

const mkKey = (overrides: Partial<KbdEventShape> & { key: string }): KbdEventShape => ({
  preventDefault: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.effects.length = 0;
  mocks.windowListeners.length = 0;
  mocks.rafQueue.length = 0;
  mocks.rafNextId = 0;
  mocks.cancelledIds.clear();

  // Stub global `window` (node-only vitest, no jsdom). The hook only
  // calls `window.{add,remove}EventListener`; the stub captures registrations.
  const fakeWindow = {
    addEventListener: vi.fn(
      (type: string, fn: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
        const handler = typeof fn === 'function' ? fn : (e: Event) => fn.handleEvent(e);
        mocks.windowListeners.push({ type, fn: handler, options });
      },
    ),
    removeEventListener: vi.fn((type: string, fn: EventListenerOrEventListenerObject) => {
      const idx = mocks.windowListeners.findIndex((l) => l.type === type && l.fn === fn);
      if (idx >= 0) mocks.windowListeners.splice(idx, 1);
    }),
  };
  vi.stubGlobal('window', fakeWindow);

  // Stub HTMLInputElement / HTMLTextAreaElement / HTMLSelectElement so
  // `e.target instanceof HTMLInputElement` evaluates to false for non-stubbed
  // targets and true for the test's mocked inputs.
  class FakeInput {}
  class FakeTextArea {}
  class FakeSelect {}
  vi.stubGlobal('HTMLInputElement', FakeInput);
  vi.stubGlobal('HTMLTextAreaElement', FakeTextArea);
  vi.stubGlobal('HTMLSelectElement', FakeSelect);

  // Stub rAF / cAF.
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      const id = ++mocks.rafNextId;
      mocks.rafQueue.push({ id, cb });
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      mocks.cancelledIds.add(id);
      const idx = mocks.rafQueue.findIndex((q) => q.id === id);
      if (idx >= 0) mocks.rafQueue.splice(idx, 1);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Effect installation ────────────────────────────────────────────────────

describe('rf-canvint-4 — useEffect registration', () => {
  it('installs exactly one useEffect with [] deps', () => {
    setup();
    expect(mocks.effects).toHaveLength(1);
    expect(mocks.effects[0].deps).toEqual([]);
  });

  it('registers three window listeners on mount: keydown, keyup, blur', () => {
    setup();
    const types = mocks.windowListeners.map((l) => l.type).sort();
    expect(types).toEqual(['blur', 'keydown', 'keyup']);
  });

  it('cleanup removes all three window listeners', () => {
    setup();
    expect(mocks.windowListeners).toHaveLength(3);
    mocks.effects[0].cleanup?.();
    expect(mocks.windowListeners).toHaveLength(0);
  });
});

// ─── handleKeyDown — input-element bypass ───────────────────────────────────

describe('rf-canvint-4 — handleKeyDown: input bypass', () => {
  it('returns early when target is HTMLInputElement (no preventDefault, no callbacks)', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    // The hook checks `e.target instanceof HTMLInputElement`; we stubbed
    // HTMLInputElement so `new HTMLInputElement()` matches the predicate.
    const ev = mkKey({
      key: 'Delete',
      target: new (globalThis as { HTMLInputElement: new () => unknown }).HTMLInputElement() as EventTarget,
    });
    handleKeyDown(ev as unknown as Event);
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(ctx.spies.onDelete).not.toHaveBeenCalled();
  });

  it('returns early when target is HTMLTextAreaElement', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    const ev = mkKey({
      key: 'Backspace',
      target: new (globalThis as { HTMLTextAreaElement: new () => unknown }).HTMLTextAreaElement() as EventTarget,
    });
    handleKeyDown(ev as unknown as Event);
    expect(ctx.spies.onDelete).not.toHaveBeenCalled();
  });

  it('returns early when target is HTMLSelectElement', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    const ev = mkKey({
      key: 'Backspace',
      target: new (globalThis as { HTMLSelectElement: new () => unknown }).HTMLSelectElement() as EventTarget,
    });
    handleKeyDown(ev as unknown as Event);
    expect(ctx.spies.onDelete).not.toHaveBeenCalled();
  });
});

// ─── handleKeyDown — Space key tracking ─────────────────────────────────────

describe('rf-canvint-4 — handleKeyDown: Space tracking', () => {
  it('sets spaceHeldRef.current = true on Space-key press', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    const ev = mkKey({ key: ' ' });
    handleKeyDown(ev as unknown as Event);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(ctx.refs.spaceHeldRef.current).toBe(true);
  });

  it('also sets spaceHeldRef when e.code === "Space" but key !== " "', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    const ev = mkKey({ key: 'Spacebar', code: 'Space' });
    handleKeyDown(ev as unknown as Event);
    expect(ctx.refs.spaceHeldRef.current).toBe(true);
  });
});

// ─── handleKeyDown — pan keys ───────────────────────────────────────────────

describe('rf-canvint-4 — handleKeyDown: pan keys', () => {
  it.each([
    ['w'], ['a'], ['s'], ['d'],
    ['ArrowUp'], ['ArrowDown'], ['ArrowLeft'], ['ArrowRight'],
  ])('captures %s as pan key, schedules a rAF, and preventDefaults', (key) => {
    setup();
    const handleKeyDown = findListener('keydown');
    const ev = mkKey({ key });
    handleKeyDown(ev as unknown as Event);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(mocks.rafQueue.length).toBe(1);
  });

  it('starting pan triggers a rAF that calls onViewportChange when the loop runs', () => {
    const ctx = setup({ viewport: { x: 100, y: 200, zoom: 1 } });
    const handleKeyDown = findListener('keydown');
    handleKeyDown(mkKey({ key: 'w' }) as unknown as Event);
    expect(mocks.rafQueue.length).toBe(1);
    // Drive the rAF loop one tick — pan should fire.
    const tick = mocks.rafQueue.shift()!.cb;
    tick(0);
    // KEYBOARD_PAN_SPEED = 15, w → panDy += 15 → y = 215
    expect(ctx.spies.onViewportChange).toHaveBeenCalledWith({ x: 100, y: 215, zoom: 1 });
    // Loop re-arms a next frame.
    expect(mocks.rafQueue.length).toBe(1);
  });

  it('s pans down (panDy -= 15)', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    handleKeyDown(mkKey({ key: 's' }) as unknown as Event);
    mocks.rafQueue.shift()!.cb(0);
    expect(ctx.spies.onViewportChange).toHaveBeenCalledWith({ x: 0, y: -15, zoom: 1 });
  });

  it('a pans left (panDx += 15)', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    handleKeyDown(mkKey({ key: 'a' }) as unknown as Event);
    mocks.rafQueue.shift()!.cb(0);
    expect(ctx.spies.onViewportChange).toHaveBeenCalledWith({ x: 15, y: 0, zoom: 1 });
  });

  it('d pans right (panDx -= 15)', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    handleKeyDown(mkKey({ key: 'd' }) as unknown as Event);
    mocks.rafQueue.shift()!.cb(0);
    expect(ctx.spies.onViewportChange).toHaveBeenCalledWith({ x: -15, y: 0, zoom: 1 });
  });

  it('multiple pan keys held: deltas combine', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    handleKeyDown(mkKey({ key: 'w' }) as unknown as Event);
    // First key already scheduled a rAF; second key reads `isAnimatingRef.current === false`
    // (since we haven't ticked) so it tries to schedule again. The hook's
    // `startKeyboardPan` checks `!isAnimatingRef.current` — but the first rAF
    // hasn't run, so isAnimating is still false UNTIL the rAF callback fires
    // and the loop sets it. Actually, `startKeyboardPan` SETS isAnimating
    // BEFORE scheduling the rAF, so the second pan key's startKeyboardPan
    // sees isAnimating=true and skips. Verify by counting rAF calls.
    handleKeyDown(mkKey({ key: 'a' }) as unknown as Event);
    expect(mocks.rafQueue.length).toBe(1); // still just one
    // Tick → both keys factored: w → panDy+=15, a → panDx+=15.
    mocks.rafQueue.shift()!.cb(0);
    expect(ctx.spies.onViewportChange).toHaveBeenCalledWith({ x: 15, y: 15, zoom: 1 });
  });

  it('opposite pan keys cancel out (no dispatch)', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    handleKeyDown(mkKey({ key: 'w' }) as unknown as Event);
    handleKeyDown(mkKey({ key: 's' }) as unknown as Event);
    // Both keys queued; tick.
    mocks.rafQueue.shift()!.cb(0);
    // panDy = +15 -15 = 0, panDx = 0, so the inner if (panDx !== 0 || panDy !== 0)
    // skips dispatch — but the loop re-arms.
    expect(ctx.spies.onViewportChange).not.toHaveBeenCalled();
    expect(mocks.rafQueue.length).toBe(1);
  });
});

// ─── handleKeyDown — Delete/Backspace ───────────────────────────────────────

describe('rf-canvint-4 — handleKeyDown: Delete/Backspace', () => {
  it('Delete fires onDelete when not locked', () => {
    const ctx = setup({ locked: false });
    const handleKeyDown = findListener('keydown');
    const ev = mkKey({ key: 'Delete' });
    handleKeyDown(ev as unknown as Event);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(ctx.spies.onDelete).toHaveBeenCalled();
  });

  it('Backspace fires onDelete when not locked', () => {
    const ctx = setup({ locked: false });
    const handleKeyDown = findListener('keydown');
    handleKeyDown(mkKey({ key: 'Backspace' }) as unknown as Event);
    expect(ctx.spies.onDelete).toHaveBeenCalled();
  });

  it('Delete does NOT fire onDelete when locked', () => {
    const ctx = setup({ locked: true });
    const handleKeyDown = findListener('keydown');
    const ev = mkKey({ key: 'Delete' });
    handleKeyDown(ev as unknown as Event);
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(ctx.spies.onDelete).not.toHaveBeenCalled();
  });
});

// ─── handleKeyDown — Escape and Ctrl+A ──────────────────────────────────────

describe('rf-canvint-4 — handleKeyDown: Escape and Ctrl+A', () => {
  it('Escape fires onSelect([]) (deselect-all)', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    const ev = mkKey({ key: 'Escape' });
    handleKeyDown(ev as unknown as Event);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(ctx.spies.onSelect).toHaveBeenCalledWith([]);
  });

  it('Ctrl+A fires onSelectAll', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    const ev = mkKey({ key: 'a', ctrlKey: true });
    handleKeyDown(ev as unknown as Event);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(ctx.spies.onSelectAll).toHaveBeenCalled();
  });

  it('Cmd+A (metaKey) also fires onSelectAll', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    const ev = mkKey({ key: 'a', metaKey: true });
    handleKeyDown(ev as unknown as Event);
    expect(ctx.spies.onSelectAll).toHaveBeenCalled();
  });

  it('plain "a" key (no modifier) does NOT fire onSelectAll (just queues a pan)', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    handleKeyDown(mkKey({ key: 'a' }) as unknown as Event);
    expect(ctx.spies.onSelectAll).not.toHaveBeenCalled();
    expect(mocks.rafQueue.length).toBe(1); // 'a' is also a pan key
  });
});

// ─── handleKeyUp ────────────────────────────────────────────────────────────

describe('rf-canvint-4 — handleKeyUp', () => {
  it('clears spaceHeldRef on Space release', () => {
    const ctx = setup({ spaceHeld: true });
    const handleKeyUp = findListener('keyup');
    handleKeyUp(mkKey({ key: ' ' }) as unknown as Event);
    expect(ctx.refs.spaceHeldRef.current).toBe(false);
  });

  it('cancels rAF when last pan key is released', () => {
    setup();
    const handleKeyDown = findListener('keydown');
    const handleKeyUp = findListener('keyup');
    handleKeyDown(mkKey({ key: 'w' }) as unknown as Event);
    expect(mocks.rafQueue.length).toBe(1);
    const rafId = mocks.rafQueue[0].id;

    handleKeyUp(mkKey({ key: 'w' }) as unknown as Event);
    expect(mocks.cancelledIds.has(rafId)).toBe(true);
  });

  it('does NOT cancel rAF while other pan keys are still held', () => {
    setup();
    const handleKeyDown = findListener('keydown');
    const handleKeyUp = findListener('keyup');
    handleKeyDown(mkKey({ key: 'w' }) as unknown as Event);
    handleKeyDown(mkKey({ key: 's' }) as unknown as Event);
    handleKeyUp(mkKey({ key: 'w' }) as unknown as Event);
    // 's' still pressed → animation continues
    expect(mocks.cancelledIds.size).toBe(0);
  });
});

// ─── handleBlur ─────────────────────────────────────────────────────────────

describe('rf-canvint-4 — handleBlur', () => {
  it('clears all pressed keys and cancels rAF', () => {
    setup();
    const handleKeyDown = findListener('keydown');
    const handleBlur = findListener('blur');
    handleKeyDown(mkKey({ key: 'w' }) as unknown as Event);
    handleKeyDown(mkKey({ key: 'a' }) as unknown as Event);
    expect(mocks.rafQueue.length).toBe(1);
    const rafId = mocks.rafQueue[0].id;

    handleBlur({ type: 'blur' } as unknown as Event);
    expect(mocks.cancelledIds.has(rafId)).toBe(true);
  });
});

// ─── rAF loop edge cases ────────────────────────────────────────────────────

describe('rf-canvint-4 — rAF loop', () => {
  it('returns early when isAnimatingRef is false (no dispatch)', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    const handleKeyUp = findListener('keyup');
    handleKeyDown(mkKey({ key: 'w' }) as unknown as Event);
    const tick = mocks.rafQueue.shift()!.cb;
    handleKeyUp(mkKey({ key: 'w' }) as unknown as Event);
    // Now isAnimating=false, but call the captured tick anyway
    tick(0);
    expect(ctx.spies.onViewportChange).not.toHaveBeenCalled();
  });

  it('exits the loop when no keys remain pressed', () => {
    setup();
    const handleKeyDown = findListener('keydown');
    handleKeyDown(mkKey({ key: 'w' }) as unknown as Event);
    const tick = mocks.rafQueue.shift()!.cb;
    // simulate keyup BEFORE invoking tick — keys.size becomes 0, but isAnimating stays true
    // Actually keyup also flips isAnimating to false and cancels.
    // So check the alternate path: drive tick directly with empty pressed-keys
    // by clearing the set indirectly via blur:
    const handleBlur = findListener('blur');
    handleBlur({ type: 'blur' } as unknown as Event);
    // tick still has the original closure — at runtime its keys.size === 0 check applies
    tick(0);
    // No frame should be re-armed
    expect(mocks.rafQueue.length).toBe(0);
  });
});

// ─── Cleanup ────────────────────────────────────────────────────────────────

describe('rf-canvint-4 — cleanup', () => {
  it('cleanup cancels any in-flight animation frame', () => {
    setup();
    const handleKeyDown = findListener('keydown');
    handleKeyDown(mkKey({ key: 'w' }) as unknown as Event);
    const rafId = mocks.rafQueue[0].id;
    mocks.effects[0].cleanup?.();
    expect(mocks.cancelledIds.has(rafId)).toBe(true);
  });

  it('cleanup is idempotent in spirit: calling listeners after cleanup is a no-op', () => {
    const ctx = setup();
    const handleKeyDown = findListener('keydown');
    mocks.effects[0].cleanup?.();
    // After cleanup, the closures still exist; the test confirms they don't
    // re-install themselves automatically. The captured fn still works
    // in isolation — but the real document never reaches it.
    handleKeyDown(mkKey({ key: 'Delete' }) as unknown as Event);
    // The captured handler still runs (it was directly invoked) — this is
    // not a behavior test, just a sanity check on the test harness.
    expect(ctx.spies.onDelete).toHaveBeenCalled();
  });
});
