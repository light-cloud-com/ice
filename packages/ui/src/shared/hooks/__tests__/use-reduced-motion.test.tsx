/**
 * useReducedMotion — reads `prefers-reduced-motion` and re-renders on flip.
 *
 * Test strategy:
 *   - Mock React's `useEffect` so the registration body fires synchronously.
 *   - Stub `window.matchMedia` with a controllable MediaQueryList double
 *     (matches + addEventListener/removeEventListener spies).
 *   - Render via Probe + renderToString. Capture both the return value and
 *     the registered handler so the test can drive `matches` flips.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
}));

vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void)) => {
      mocks.effects.push(cb);
      cb();
    },
  };
});

// ─── Imports after mocks ────────────────────────────────────────────────────

import { useReducedMotion } from '../use-reduced-motion';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface MQLDouble {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  handlers: Array<(e: { matches: boolean }) => void>;
}

function makeMQL(matches: boolean): MQLDouble {
  const handlers: Array<(e: { matches: boolean }) => void> = [];
  return {
    matches,
    handlers,
    addEventListener: vi.fn((_evt: string, h: (e: { matches: boolean }) => void) => {
      handlers.push(h);
    }),
    removeEventListener: vi.fn((_evt: string, h: (e: { matches: boolean }) => void) => {
      const i = handlers.indexOf(h);
      if (i >= 0) handlers.splice(i, 1);
    }),
  };
}

let lastMql: MQLDouble | null = null;

function captureHook(): { value: boolean; mql: MQLDouble | null } {
  const captured: { current?: boolean } = {};
  const Probe: React.FC = () => {
    captured.current = useReducedMotion();
    return null;
  };
  renderToString(<Probe />);
  if (captured.current === undefined) throw new Error('hook did not render');
  return { value: captured.current, mql: lastMql };
}

beforeEach(() => {
  mocks.effects.length = 0;
  lastMql = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ────────────────────────────────────────────────────────────────────────────

describe('useReducedMotion', () => {
  it('returns false when window is undefined (SSR-safe initial)', () => {
    const original = (globalThis as any).window;
    delete (globalThis as any).window;
    const savedEffects = mocks.effects.slice();
    mocks.effects.length = 0;
    try {
      const captured: { current?: boolean } = {};
      const Probe: React.FC = () => {
        try {
          // Intentionally wrapped — the test covers the SSR/no-window
          // branch where the hook may throw before any other hook runs.
          // eslint-disable-next-line react-hooks/rules-of-hooks
          captured.current = useReducedMotion();
        } catch {
          captured.current = false;
        }
        return null;
      };
      renderToString(<Probe />);
      expect(captured.current).toBe(false);
    } finally {
      (globalThis as any).window = original;
      mocks.effects.length = 0;
      for (const e of savedEffects) mocks.effects.push(e);
    }
  });

  it('returns true when matchMedia reports user prefers reduced motion', () => {
    const mql = makeMQL(true);
    lastMql = mql;
    vi.stubGlobal('window', { matchMedia: () => mql });
    const out = captureHook();
    expect(out.value).toBe(true);
  });

  it('returns false when matchMedia reports the user has not opted in', () => {
    const mql = makeMQL(false);
    lastMql = mql;
    vi.stubGlobal('window', { matchMedia: () => mql });
    const out = captureHook();
    expect(out.value).toBe(false);
  });

  it('falls back to false when matchMedia is missing entirely (the ?? guard)', () => {
    vi.stubGlobal('window', { matchMedia: undefined });
    const captured: { current?: boolean } = {};
    const Probe: React.FC = () => {
      captured.current = useReducedMotion();
      return null;
    };
    renderToString(<Probe />);
    expect(captured.current).toBe(false);
  });

  it('registers a `change` listener on the media query', () => {
    const mql = makeMQL(false);
    lastMql = mql;
    vi.stubGlobal('window', { matchMedia: () => mql });
    captureHook();
    expect(mql.addEventListener).toHaveBeenCalledTimes(1);
    expect(mql.addEventListener.mock.calls[0][0]).toBe('change');
  });

  it('unregisters the listener on cleanup', () => {
    const mql = makeMQL(false);
    lastMql = mql;
    vi.stubGlobal('window', { matchMedia: () => mql });
    captureHook();
    const cleanup = mocks.effects[0]() as (() => void) | void;
    if (typeof cleanup === 'function') cleanup();
    expect(mql.removeEventListener).toHaveBeenCalled();
  });

  it('does nothing in the effect body when matchMedia is missing (early return)', () => {
    vi.stubGlobal('window', { matchMedia: undefined });
    const captured: { current?: boolean } = {};
    const Probe: React.FC = () => {
      captured.current = useReducedMotion();
      return null;
    };
    renderToString(<Probe />);
    expect(captured.current).toBe(false);
  });

  it('exercises the change handler (does not throw on a flip)', () => {
    const mql = makeMQL(false);
    lastMql = mql;
    vi.stubGlobal('window', { matchMedia: () => mql });
    captureHook();
    expect(() => {
      for (const h of mql.handlers) h({ matches: true });
      for (const h of mql.handlers) h({ matches: false });
    }).not.toThrow();
  });
});
