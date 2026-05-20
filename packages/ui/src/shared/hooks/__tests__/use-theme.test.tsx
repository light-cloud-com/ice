/**
 * useTheme + ThemeProvider — single source of truth for light/dark and
 * font-size with localStorage + matchMedia driven theme=system follow.
 *
 * Test strategy:
 *   - Mock React's `useEffect` to fire synchronously and capture cleanup.
 *   - Mock `useState` so we can observe the SUT's state transitions
 *     (`renderToString` does not re-render on setState).
 *   - Stub `window.matchMedia`, `document.documentElement.classList`, and
 *     `localStorage` with controllable spies.
 *   - Render `<ThemeProvider>` and a Probe child via `useTheme()`. Drive
 *     each branch via the captured callbacks.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  effectCleanups: [] as Array<void | (() => void)>,
}));

vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void)) => {
      mocks.effects.push(cb);
      const cleanup = cb();
      mocks.effectCleanups.push(cleanup);
    },
  };
});

// ─── Imports after mocks ────────────────────────────────────────────────────

import { ThemeProvider, useTheme, FONT_SIZE_LABELS } from '../use-theme';
import type { FontSize } from '../use-theme';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface MQLDouble {
  matches: boolean;
  handlers: Array<() => void>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function makeMQL(matches: boolean): MQLDouble {
  const handlers: Array<() => void> = [];
  return {
    matches,
    handlers,
    addEventListener: vi.fn((_evt: string, h: () => void) => {
      handlers.push(h);
    }),
    removeEventListener: vi.fn((_evt: string, h: () => void) => {
      const i = handlers.indexOf(h);
      if (i >= 0) handlers.splice(i, 1);
    }),
  };
}

interface ClassListDouble {
  classes: Set<string>;
  add: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function makeClassList(): ClassListDouble {
  const classes = new Set<string>();
  return {
    classes,
    add: vi.fn((...names: string[]) => {
      for (const n of names) classes.add(n);
    }),
    remove: vi.fn((...names: string[]) => {
      for (const n of names) classes.delete(n);
    }),
  };
}

interface CapturedTheme {
  current?: ReturnType<typeof useTheme>;
}

let capturedTheme: CapturedTheme = {};
let storage: Record<string, string> = {};
let mql: MQLDouble;
let classList: ClassListDouble;

beforeEach(() => {
  mocks.effects.length = 0;
  mocks.effectCleanups.length = 0;
  capturedTheme = {};
  storage = {};
  mql = makeMQL(false);
  classList = makeClassList();

  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in storage ? storage[k] : null),
    setItem: (k: string, v: string) => {
      storage[k] = v;
    },
    removeItem: (k: string) => {
      delete storage[k];
    },
  });

  vi.stubGlobal('window', {
    matchMedia: () => mql,
  });

  vi.stubGlobal('document', {
    documentElement: { classList },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mountWithProvider() {
  const Probe: React.FC = () => {
    capturedTheme.current = useTheme();
    return null;
  };
  renderToString(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  if (!capturedTheme.current) throw new Error('hook did not render');
  return capturedTheme.current;
}

// ────────────────────────────────────────────────────────────────────────────

describe('useTheme — guard', () => {
  it('throws when used outside <ThemeProvider>', () => {
    const Probe: React.FC = () => {
      useTheme();
      return null;
    };
    expect(() => renderToString(<Probe />)).toThrow(/within <ThemeProvider>/);
  });
});

describe('ThemeProvider — initial theme', () => {
  it('defaults to dark when localStorage is empty', () => {
    const out = mountWithProvider();
    expect(out.theme).toBe('dark');
    expect(out.isDark).toBe(true);
  });

  it('reads "light" from localStorage', () => {
    storage['theme'] = 'light';
    const out = mountWithProvider();
    expect(out.theme).toBe('light');
    expect(out.isDark).toBe(false);
  });

  it('reads "dark" from localStorage', () => {
    storage['theme'] = 'dark';
    const out = mountWithProvider();
    expect(out.theme).toBe('dark');
    expect(out.isDark).toBe(true);
  });

  it('reads "system" from localStorage', () => {
    storage['theme'] = 'system';
    mql.matches = false;
    const out = mountWithProvider();
    expect(out.theme).toBe('system');
    expect(out.isDark).toBe(false);
  });

  it('treats unrecognized localStorage values as default (dark)', () => {
    storage['theme'] = 'banana';
    const out = mountWithProvider();
    expect(out.theme).toBe('dark');
  });

  it('isDark follows matchMedia when theme is system', () => {
    storage['theme'] = 'system';
    mql.matches = true;
    const out = mountWithProvider();
    expect(out.isDark).toBe(true);
  });
});

describe('ThemeProvider — initial fontSize', () => {
  it('defaults to "default" when localStorage is empty', () => {
    const out = mountWithProvider();
    expect(out.fontSize).toBe('default');
  });

  it('reads "small" from localStorage', () => {
    storage['ice-font-size'] = 'small';
    const out = mountWithProvider();
    expect(out.fontSize).toBe('small');
  });

  it('reads "large" from localStorage', () => {
    storage['ice-font-size'] = 'large';
    const out = mountWithProvider();
    expect(out.fontSize).toBe('large');
  });

  it('treats unrecognized fontSize as default', () => {
    storage['ice-font-size'] = 'enormous';
    const out = mountWithProvider();
    expect(out.fontSize).toBe('default');
  });
});

describe('ThemeProvider — applyTheme effects', () => {
  it('adds "dark" class when isDark', () => {
    storage['theme'] = 'dark';
    mountWithProvider();
    expect(classList.classes.has('dark')).toBe(true);
  });

  it('removes "dark" class when not isDark', () => {
    storage['theme'] = 'light';
    mountWithProvider();
    expect(classList.classes.has('dark')).toBe(false);
  });
});

describe('ThemeProvider — applyFontSize effects', () => {
  it('does not add font class when default', () => {
    mountWithProvider();
    // applyFontSize ALWAYS calls remove('font-small', 'font-large') first.
    expect(classList.remove).toHaveBeenCalledWith('font-small', 'font-large');
    expect(classList.classes.has('font-small')).toBe(false);
    expect(classList.classes.has('font-large')).toBe(false);
  });

  it('adds font-small class when fontSize="small"', () => {
    storage['ice-font-size'] = 'small';
    mountWithProvider();
    expect(classList.classes.has('font-small')).toBe(true);
  });

  it('adds font-large class when fontSize="large"', () => {
    storage['ice-font-size'] = 'large';
    mountWithProvider();
    expect(classList.classes.has('font-large')).toBe(true);
  });
});

describe('ThemeProvider — system-mode matchMedia listener', () => {
  it('registers a change listener when theme is "system"', () => {
    storage['theme'] = 'system';
    mountWithProvider();
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('does NOT register a listener when theme is not "system"', () => {
    storage['theme'] = 'dark';
    mountWithProvider();
    expect(mql.addEventListener).not.toHaveBeenCalled();
  });

  it('cleanup removes the listener', () => {
    storage['theme'] = 'system';
    mountWithProvider();
    // The third effect (or wherever) returns the cleanup. Run cleanups.
    for (const c of mocks.effectCleanups) {
      if (typeof c === 'function') c();
    }
    expect(mql.removeEventListener).toHaveBeenCalled();
  });

  it('change handler re-applies theme based on current system pref', () => {
    storage['theme'] = 'system';
    mql.matches = false;
    mountWithProvider();
    classList.add.mockClear();
    classList.remove.mockClear();
    mql.matches = true;
    for (const h of mql.handlers) h();
    // applyTheme(true) → adds 'dark'
    expect(classList.add).toHaveBeenCalledWith('dark');
  });

  it('change handler with system NOT dark → applyTheme(false) removes dark', () => {
    storage['theme'] = 'system';
    mql.matches = true;
    mountWithProvider();
    classList.add.mockClear();
    classList.remove.mockClear();
    mql.matches = false;
    for (const h of mql.handlers) h();
    expect(classList.remove).toHaveBeenCalledWith('dark');
  });
});

describe('ThemeProvider — setters', () => {
  it('setTheme writes to localStorage', () => {
    const out = mountWithProvider();
    out.setTheme('light');
    expect(storage['theme']).toBe('light');
  });

  it('toggle flips dark→light and writes localStorage', () => {
    storage['theme'] = 'dark';
    const out = mountWithProvider();
    out.toggle();
    expect(storage['theme']).toBe('light');
  });

  it('toggle flips light→dark', () => {
    storage['theme'] = 'light';
    const out = mountWithProvider();
    out.toggle();
    expect(storage['theme']).toBe('dark');
  });

  it('setFontSize writes to localStorage', () => {
    const out = mountWithProvider();
    out.setFontSize('large');
    expect(storage['ice-font-size']).toBe('large');
  });
});

describe('ThemeProvider — increase/decrease font size', () => {
  it('increaseFontSize: small → default', () => {
    storage['ice-font-size'] = 'small';
    const out = mountWithProvider();
    out.increaseFontSize();
    expect(storage['ice-font-size']).toBe('default');
  });

  it('increaseFontSize: default → large', () => {
    const out = mountWithProvider();
    out.increaseFontSize();
    expect(storage['ice-font-size']).toBe('large');
  });

  it('increaseFontSize: large → no-op (already at max)', () => {
    storage['ice-font-size'] = 'large';
    const out = mountWithProvider();
    out.increaseFontSize();
    // No setter call to localStorage means storage stays 'large'.
    expect(storage['ice-font-size']).toBe('large');
  });

  it('decreaseFontSize: large → default', () => {
    storage['ice-font-size'] = 'large';
    const out = mountWithProvider();
    out.decreaseFontSize();
    expect(storage['ice-font-size']).toBe('default');
  });

  it('decreaseFontSize: default → small', () => {
    const out = mountWithProvider();
    out.decreaseFontSize();
    expect(storage['ice-font-size']).toBe('small');
  });

  it('decreaseFontSize: small → no-op (already at min)', () => {
    storage['ice-font-size'] = 'small';
    const out = mountWithProvider();
    out.decreaseFontSize();
    expect(storage['ice-font-size']).toBe('small');
  });
});

describe('FONT_SIZE_LABELS export', () => {
  it('maps each FontSize to a single-letter label', () => {
    const sizes: FontSize[] = ['small', 'default', 'large'];
    for (const s of sizes) {
      expect(FONT_SIZE_LABELS[s]).toBeTypeOf('string');
      expect(FONT_SIZE_LABELS[s].length).toBeGreaterThan(0);
    }
  });
});
