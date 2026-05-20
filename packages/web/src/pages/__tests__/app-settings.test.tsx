/**
 * AppSettings — three-tab settings UI (Appearance / Language / Reset)
 * + back button.
 *
 * Direct-FC tree-walker. useState / useCallback are patched so we can
 * read the tab state slot directly. useTheme / useThemePicker / useNavigate
 * / axios / i18n are mocked at their import boundaries.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const stateSlots: unknown[] = [];
  return {
    stateSlots,
    resetUseState: () => {
      stateSlots.length = 0;
    },
    locale: 'en' as string,
    setLocale: vi.fn(),
    theme: 'dark' as string,
    setTheme: vi.fn(),
    fontSize: 'default' as string,
    setFontSize: vi.fn(),
    toggleThemePicker: vi.fn(),
    navigate: vi.fn(),
    axiosPost: vi.fn(),
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let useStateIdx = 0;
  const patchedUseState = vi.fn((initial?: unknown) => {
    const slot = useStateIdx;
    if (mocks.stateSlots.length <= slot) {
      const init = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      mocks.stateSlots.push(init);
    }
    const setter = vi.fn((next: unknown) => {
      const cur = mocks.stateSlots[slot];
      const resolved = typeof next === 'function' ? (next as (prev: unknown) => unknown)(cur) : next;
      mocks.stateSlots[slot] = resolved;
    });
    useStateIdx += 1;
    return [mocks.stateSlots[slot], setter];
  });
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx = () => {
    useStateIdx = 0;
  };
  // useCallback returns the callback verbatim so the test can invoke it directly
  const patchedUseCallback = vi.fn((cb: () => void) => cb);
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useCallback: patchedUseCallback,
    default: {
      ...actualDefault,
      useState: patchedUseState,
      useCallback: patchedUseCallback,
    },
  };
});

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@ui/i18n', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    locale: mocks.locale,
    setLocale: mocks.setLocale,
  }),
  LOCALES: [
    { id: 'en', label: 'English', nativeLabel: 'English' },
    { id: 'zh', label: 'Chinese', nativeLabel: '中文' },
  ],
}));

vi.mock('@ui/shared/api/axios-instance', () => ({
  default: {
    post: (...args: unknown[]) => mocks.axiosPost(...args),
  },
}));

vi.mock('@ui/shared/components/dev-accent-picker', () => ({
  useThemePicker: () => ({ toggle: mocks.toggleThemePicker }),
}));

vi.mock('@ui/shared/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: mocks.theme,
    setTheme: mocks.setTheme,
    fontSize: mocks.fontSize,
    setFontSize: mocks.setFontSize,
  }),
}));

vi.mock('@ui/shared/utils/cn', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

import { AppSettings } from '../app-settings';

// ─── Tree-walker helpers ──────────────────────────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
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
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}

function render(): React.ReactElement | null {
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx();
  return (AppSettings as unknown as () => React.ReactElement | null)();
}

beforeEach(() => {
  mocks.resetUseState();
  mocks.setLocale.mockReset();
  mocks.setTheme.mockReset();
  mocks.setFontSize.mockReset();
  mocks.toggleThemePicker.mockReset();
  mocks.navigate.mockReset();
  mocks.axiosPost.mockReset();
  mocks.locale = 'en';
  mocks.theme = 'dark';
  mocks.fontSize = 'default';
});

// Slot order for AppSettings: just one slot now — the tab (default 'appearance').

// ─── Back button ──────────────────────────────────────────────────────────

describe('AppSettings — back button', () => {
  function findBackButton(tree: React.ReactNode): React.ReactElement | undefined {
    return findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { ['aria-label']?: string })['aria-label'] === 'common.buttons.back',
    )[0];
  }

  it('renders a back button with the i18n aria-label', () => {
    const tree = render();
    expect(findBackButton(tree)).toBeDefined();
  });

  it('calls navigate(-1) when history has entries', () => {
    vi.stubGlobal('window', { history: { length: 5 } });
    const tree = render();
    const btn = findBackButton(tree)!;
    (btn.props as { onClick: () => void }).onClick();
    expect(mocks.navigate).toHaveBeenCalledWith(-1);
    vi.unstubAllGlobals();
  });

  it("falls back to navigate('/') when there's nothing to pop", () => {
    vi.stubGlobal('window', { history: { length: 1 } });
    const tree = render();
    const btn = findBackButton(tree)!;
    (btn.props as { onClick: () => void }).onClick();
    expect(mocks.navigate).toHaveBeenCalledWith('/');
    vi.unstubAllGlobals();
  });
});

// ─── Tabs ─────────────────────────────────────────────────────────────────

describe('AppSettings — tabs', () => {
  it('renders all three tab buttons by i18n label (no AI tab)', () => {
    const tree = render();
    const tabLabels = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { label?: string }).label === 'string' &&
        (el.props as { label: string }).label.startsWith('appSettings.tabs.'),
    ).map((el) => (el.props as { label: string }).label);

    expect(tabLabels).toEqual(['appSettings.tabs.appearance', 'appSettings.tabs.language', 'appSettings.tabs.reset']);
    expect(tabLabels).not.toContain('appSettings.tabs.ai');
  });

  it('shows the appearance panel by default', () => {
    const tree = render();
    const themeHeading = findByPredicate(
      tree,
      (el) => el.type === 'h2' && (el.props as { children?: unknown }).children === 'appSettings.appearance.themeTitle',
    );
    expect(themeHeading).toHaveLength(1);
  });

  it('shows the language panel when slot 0 is "language"', () => {
    mocks.stateSlots[0] = 'language';
    const tree = render();
    const langHeading = findByPredicate(
      tree,
      (el) => el.type === 'h2' && (el.props as { children?: unknown }).children === 'appSettings.language.title',
    );
    expect(langHeading).toHaveLength(1);
  });

  it('TabButton onClick switches the tab via setTab (language)', () => {
    const tree = render();
    const tab = findByPredicate(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { label?: string }).label === 'appSettings.tabs.language',
    )[0];
    (tab.props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[0]).toBe('language');
  });

  it('TabButton onClick switches the tab via setTab (appearance)', () => {
    mocks.stateSlots[0] = 'language';
    const tree = render();
    const tab = findByPredicate(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { label?: string }).label === 'appSettings.tabs.appearance',
    )[0];
    (tab.props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[0]).toBe('appearance');
  });
});

// ─── Appearance tab — theme / font / picker ───────────────────────────────

describe('AppSettings — appearance handlers', () => {
  it('clicking a theme option calls setTheme with the id', () => {
    const tree = render();
    const lightBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown[] }).children) &&
        JSON.stringify((el.props as { children: unknown[] }).children).includes('appSettings.appearance.light'),
    )[0];
    expect(lightBtn).toBeDefined();
    (lightBtn.props as { onClick: () => void }).onClick();
    expect(mocks.setTheme).toHaveBeenCalledWith('light');
  });

  it('clicking a font-size option calls setFontSize with the id', () => {
    const tree = render();
    const largeBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { children?: unknown }).children !== 'undefined' &&
        JSON.stringify((el.props as { children: unknown }).children).includes('appSettings.appearance.large'),
    )[0];
    expect(largeBtn).toBeDefined();
    (largeBtn.props as { onClick: () => void }).onClick();
    expect(mocks.setFontSize).toHaveBeenCalledWith('large');
  });

  it('color picker button calls toggleThemePicker on click', () => {
    const tree = render();
    const pickerBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        JSON.stringify((el.props as { children: unknown }).children).includes('appSettings.appearance.openThemePicker'),
    )[0];
    expect(pickerBtn).toBeDefined();
    (pickerBtn.props as { onClick: () => void }).onClick();
    expect(mocks.toggleThemePicker).toHaveBeenCalled();
  });
});

// ─── Language tab — locale switching ──────────────────────────────────────

describe('AppSettings — language handlers', () => {
  it('clicking a locale calls setLocale with the locale id', () => {
    mocks.stateSlots[0] = 'language';
    const tree = render();
    const zhBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && JSON.stringify((el.props as { children: unknown }).children).includes('zh'),
    )[0];
    expect(zhBtn).toBeDefined();
    (zhBtn.props as { onClick: () => void }).onClick();
    expect(mocks.setLocale).toHaveBeenCalledWith('zh');
  });
});

// ─── Reset tab — destructive flow ─────────────────────────────────────────

describe('AppSettings — reset workspace', () => {
  // Slot order on the reset tab: [tab, confirmReset, resetting, resetError]
  function seedResetTab(confirm = '', resetting = false, error: string | null = null): void {
    mocks.stateSlots.push('reset', confirm, resetting, error);
  }

  function findResetButton(tree: React.ReactNode): React.ReactElement {
    return findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        JSON.stringify((el.props as { children: unknown }).children).includes('appSettings.reset.resetButton'),
    )[0];
  }

  it('reset button is disabled until the user types RESET', () => {
    seedResetTab('');
    const tree = render();
    const btn = findResetButton(tree);
    expect(btn).toBeDefined();
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('reset button is enabled once the confirmation matches', () => {
    seedResetTab('RESET');
    const tree = render();
    const btn = findResetButton(tree);
    expect((btn.props as { disabled?: boolean }).disabled).toBe(false);
  });

  it('clicking reset POSTs to /profile/reset-workspace and replaces window.location', async () => {
    mocks.axiosPost.mockResolvedValueOnce({});
    const replace = vi.fn();
    vi.stubGlobal('window', { history: { length: 5 }, location: { replace } });
    seedResetTab('RESET');
    const tree = render();
    const btn = findResetButton(tree);
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/profile/reset-workspace');
    expect(replace).toHaveBeenCalledWith('/');
    vi.unstubAllGlobals();
  });

  it('surfaces an error message when the POST fails', async () => {
    mocks.axiosPost.mockRejectedValueOnce(new Error('boom'));
    seedResetTab('RESET');
    const tree = render();
    const btn = findResetButton(tree);
    await (btn.props as { onClick: () => Promise<void> }).onClick();
    // slot 3 is resetError — should now be the human-readable message
    expect(mocks.stateSlots[3]).toMatch(/Reset failed/i);
  });
});
