/**
 * AppSettings — three-tab settings UI (AI / Appearance / Language).
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl pattern). useState/useEffect
 * are patched to expose state slots and effect callbacks for direct
 * invocation. useTheme / useThemePicker / axios / i18n are mocked at
 * their import boundaries.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const stateSlots: unknown[] = [];
  const effects: Array<{ cb: () => void | (() => void); deps: unknown[] }> = [];
  return {
    stateSlots,
    effects,
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
    axiosGet: vi.fn(),
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
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps: deps ?? [] });
  });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useEffect: patchedUseEffect,
    default: {
      ...actualDefault,
      useState: patchedUseState,
      useEffect: patchedUseEffect,
    },
  };
});

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
    get: (...args: unknown[]) => mocks.axiosGet(...args),
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

function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
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
  mocks.effects.length = 0;
  mocks.setLocale.mockReset();
  mocks.setTheme.mockReset();
  mocks.setFontSize.mockReset();
  mocks.toggleThemePicker.mockReset();
  mocks.axiosGet.mockReset();
  mocks.axiosPost.mockReset();
  mocks.locale = 'en';
  mocks.theme = 'dark';
  mocks.fontSize = 'default';
});

// Slot order for AppSettings:
//  0 = tab            (default 'ai')
//  1 = anthropicKey   (default '')
//  2 = aiUrl          (default '')
//  3 = aiStatus       (default 'idle')
//  4 = saving         (default false)
//  5 = message        (default null)

// ─── Tabs ─────────────────────────────────────────────────────────────────

describe('AppSettings — tab navigation', () => {
  it('renders all three tab buttons by their i18n labels', () => {
    const tree = render();
    const tabs = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { label?: string }).label === 'string' &&
        ['appSettings.tabs.ai', 'appSettings.tabs.appearance', 'appSettings.tabs.language'].includes(
          (el.props as { label: string }).label,
        ),
    );
    expect(tabs.length).toBe(3);
  });

  it('shows AI panel by default and hides appearance + language headings', () => {
    const tree = render();
    const aiHeading = findByPredicate(
      tree,
      (el) => el.type === 'h2' && (el.props as { children?: unknown }).children === 'appSettings.ai.providerTitle',
    );
    const appearanceHeading = findByPredicate(
      tree,
      (el) => el.type === 'h2' && (el.props as { children?: unknown }).children === 'appSettings.appearance.themeTitle',
    );
    expect(aiHeading).toHaveLength(1);
    expect(appearanceHeading).toHaveLength(0);
  });

  it('shows the appearance panel when slot 0 is "appearance"', () => {
    mocks.stateSlots[0] = 'appearance';
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

  it('TabButton onClick switches the tab via setTab (ai)', () => {
    mocks.stateSlots[0] = 'language';
    const tree = render();
    const tabs = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        (el.props as { label?: string }).label === 'appSettings.tabs.ai',
    );
    expect(tabs).toHaveLength(1);
    (tabs[0].props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[0]).toBe('ai');
  });

  it('TabButton onClick switches the tab via setTab (appearance)', () => {
    const tree = render();
    const tabs = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        (el.props as { label?: string }).label === 'appSettings.tabs.appearance',
    );
    expect(tabs).toHaveLength(1);
    (tabs[0].props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[0]).toBe('appearance');
  });

  it('TabButton onClick switches the tab via setTab (language)', () => {
    const tree = render();
    const tabs = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        (el.props as { label?: string }).label === 'appSettings.tabs.language',
    );
    expect(tabs).toHaveLength(1);
    (tabs[0].props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[0]).toBe('language');
  });
});

// ─── AI tab — config load ────────────────────────────────────────────────

describe('AppSettings — AI config load', () => {
  it('hits /ai/config on mount and seeds anthropicKey + aiUrl when configured', async () => {
    mocks.axiosGet.mockResolvedValueOnce({ data: { anthropicKey: 'real-key', aiUrl: 'http://x', configured: true } });
    render();
    await mocks.effects[0].cb();
    expect(mocks.axiosGet).toHaveBeenCalledWith('/ai/config');
    // slot 1 = anthropicKey is set to the masked '••••••••' (truthy key)
    expect(mocks.stateSlots[1]).toBe('••••••••');
    // slot 2 = aiUrl
    expect(mocks.stateSlots[2]).toBe('http://x');
    // slot 3 = aiStatus
    expect(mocks.stateSlots[3]).toBe('connected');
  });

  it('leaves anthropicKey empty when response has no key', async () => {
    mocks.axiosGet.mockResolvedValueOnce({ data: { anthropicKey: '', aiUrl: '', configured: false } });
    render();
    await mocks.effects[0].cb();
    expect(mocks.stateSlots[1]).toBe('');
    expect(mocks.stateSlots[3]).toBe('idle');
  });

  it('handles missing data gracefully (defaults to empty strings)', async () => {
    mocks.axiosGet.mockResolvedValueOnce({ data: undefined });
    render();
    await mocks.effects[0].cb();
    expect(mocks.stateSlots[1]).toBe('');
    expect(mocks.stateSlots[2]).toBe('');
    expect(mocks.stateSlots[3]).toBe('idle');
  });

  it('catches load failure and leaves status=idle', async () => {
    mocks.axiosGet.mockRejectedValueOnce(new Error('500'));
    render();
    await mocks.effects[0].cb();
    expect(mocks.stateSlots[3]).toBe('idle');
  });
});

// ─── AI tab — render with status branches ────────────────────────────────

describe('AppSettings — AI status indicators', () => {
  it('renders the connected message when aiStatus="connected"', () => {
    mocks.stateSlots.push('ai', '••••', '', 'connected', false, null);
    const tree = render();
    const connected = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'appSettings.ai.connected',
    );
    expect(connected).toHaveLength(1);
  });

  it('renders the notConfigured message when aiStatus="idle"', () => {
    mocks.stateSlots.push('ai', '', '', 'idle', false, null);
    const tree = render();
    const notConfigured = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'appSettings.ai.notConfigured',
    );
    expect(notConfigured).toHaveLength(1);
  });
});

// ─── AI tab — input handlers ─────────────────────────────────────────────

describe('AppSettings — AI inputs', () => {
  it('updates anthropicKey on change', () => {
    mocks.stateSlots.push('ai', '', '', 'idle', false, null);
    const tree = render();
    // first input is type=password
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'password',
    )[0];
    (input.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'sk-ant-NEW' },
    });
    expect(mocks.stateSlots[1]).toBe('sk-ant-NEW');
  });

  it('clears the masked key on focus when value starts with bullets', () => {
    mocks.stateSlots.push('ai', '••••••••', '', 'idle', false, null);
    const tree = render();
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'password',
    )[0];
    (input.props as { onFocus: () => void }).onFocus();
    expect(mocks.stateSlots[1]).toBe('');
  });

  it('does NOT clear the key on focus when value does NOT start with bullets', () => {
    mocks.stateSlots.push('ai', 'sk-ant-VISIBLE', '', 'idle', false, null);
    const tree = render();
    const input = findByPredicate(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'password',
    )[0];
    (input.props as { onFocus: () => void }).onFocus();
    expect(mocks.stateSlots[1]).toBe('sk-ant-VISIBLE');
  });

  it('updates aiUrl on the second input', () => {
    mocks.stateSlots.push('ai', '', '', 'idle', false, null);
    const tree = render();
    const inputs = findByPredicate(tree, (el) => el.type === 'input' && (el.props as { type?: string }).type === 'text');
    const urlInput = inputs[0];
    (urlInput.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'http://localhost:11434' },
    });
    expect(mocks.stateSlots[2]).toBe('http://localhost:11434');
  });
});

// ─── AI tab — handleSaveAi ───────────────────────────────────────────────

describe('AppSettings — handleSaveAi', () => {
  it('posts both fields when key is unmasked + URL is set', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    mocks.stateSlots.push('ai', 'sk-ant-NEW', 'http://x', 'idle', false, null);
    const tree = render();
    const saveBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'common.buttons.save',
        ),
    )[0];
    await (saveBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/ai/config', {
      anthropicKey: 'sk-ant-NEW',
      aiUrl: 'http://x',
    });
  });

  it('omits anthropicKey when value still starts with bullets (masked)', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    mocks.stateSlots.push('ai', '••••••', 'http://x', 'idle', false, null);
    const tree = render();
    const saveBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'common.buttons.save',
        ),
    )[0];
    await (saveBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/ai/config', { aiUrl: 'http://x' });
  });

  it('omits aiUrl when empty', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    mocks.stateSlots.push('ai', 'sk-ant-NEW', '', 'idle', false, null);
    const tree = render();
    const saveBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'common.buttons.save',
        ),
    )[0];
    await (saveBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/ai/config', { anthropicKey: 'sk-ant-NEW' });
  });

  it('sets a success message and connected status after a successful save', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    mocks.stateSlots.push('ai', 'sk-ant-NEW', '', 'idle', false, null);
    const tree = render();
    const saveBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'common.buttons.save',
        ),
    )[0];
    await (saveBtn.props as { onClick: () => Promise<void> }).onClick();
    // slot 5 = message
    expect(mocks.stateSlots[5]).toEqual({ type: 'success', text: 'appSettings.ai.saved' });
    expect(mocks.stateSlots[3]).toBe('connected');
  });

  it('sets an error message on save failure (status stays the same)', async () => {
    mocks.axiosPost.mockRejectedValueOnce(new Error('500'));
    mocks.stateSlots.push('ai', 'sk-ant-NEW', '', 'idle', false, null);
    const tree = render();
    const saveBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'common.buttons.save',
        ),
    )[0];
    await (saveBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.stateSlots[5]).toEqual({ type: 'error', text: 'appSettings.ai.saveFailed' });
  });

  it('renders a success message <p> when slot 5 is success', () => {
    mocks.stateSlots.push('ai', '', '', 'idle', false, { type: 'success', text: 'Saved!' });
    const tree = render();
    const successPara = findByPredicate(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-emerald-400') &&
        (el.props as { children?: unknown }).children === 'Saved!',
    );
    expect(successPara).toHaveLength(1);
  });

  it('renders an error message <p> when slot 5 is error', () => {
    mocks.stateSlots.push('ai', '', '', 'idle', false, { type: 'error', text: 'Failed!' });
    const tree = render();
    const errorPara = findByPredicate(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-red-400'),
    );
    expect(errorPara).toHaveLength(1);
  });

  it('shows the spinning icon in the save button when saving=true', () => {
    mocks.stateSlots.push('ai', '', '', 'idle', true, null);
    const tree = render();
    const spinners = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('animate-spin'),
    );
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Appearance tab ──────────────────────────────────────────────────────

describe('AppSettings — Appearance tab', () => {
  it('calls setTheme when a theme button is clicked', () => {
    mocks.stateSlots.push('appearance', '', '', 'idle', false, null);
    const tree = render();
    // theme buttons live in the appearance card body; find by className
    // pattern that includes 'rounded-lg' and an inner span text matching the
    // light/dark/system option label.
    const themeButtons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) =>
            (c as React.ReactElement)?.props?.children === 'appSettings.appearance.light',
        ),
    );
    expect(themeButtons).toHaveLength(1);
    (themeButtons[0].props as { onClick: () => void }).onClick();
    expect(mocks.setTheme).toHaveBeenCalledWith('light');
  });

  it('calls setFontSize when a font size button is clicked', () => {
    mocks.stateSlots.push('appearance', '', '', 'idle', false, null);
    const tree = render();
    const sizeButtons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { children?: unknown }).children === 'appSettings.appearance.large',
    );
    expect(sizeButtons).toHaveLength(1);
    (sizeButtons[0].props as { onClick: () => void }).onClick();
    expect(mocks.setFontSize).toHaveBeenCalledWith('large');
  });

  it('marks the active theme button with the accent border', () => {
    mocks.theme = 'light';
    mocks.stateSlots.push('appearance', '', '', 'idle', false, null);
    const tree = render();
    const lightBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) =>
            (c as React.ReactElement)?.props?.children === 'appSettings.appearance.light',
        ),
    )[0];
    expect((lightBtn.props as { className: string }).className).toContain('border-ice-accent');
  });

  it('marks the active fontSize button with the accent border', () => {
    mocks.fontSize = 'small';
    mocks.stateSlots.push('appearance', '', '', 'idle', false, null);
    const tree = render();
    const smallBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' && (el.props as { children?: unknown }).children === 'appSettings.appearance.small',
    )[0];
    expect((smallBtn.props as { className: string }).className).toContain('border-ice-accent');
  });

  it('renders a theme picker button that wires to toggleThemePicker', () => {
    mocks.stateSlots.push('appearance', '', '', 'idle', false, null);
    const tree = render();
    const pickerBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) =>
            (c as React.ReactElement)?.props?.children === 'appSettings.appearance.openThemePicker',
        ),
    )[0];
    (pickerBtn.props as { onClick: () => void }).onClick();
    expect(mocks.toggleThemePicker).toHaveBeenCalled();
  });
});

// ─── Language tab ────────────────────────────────────────────────────────

describe('AppSettings — Language tab', () => {
  it('renders one button per LOCALES entry', () => {
    mocks.stateSlots.push('language', '', '', 'idle', false, null);
    const tree = render();
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-lg') &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) =>
            (c as React.ReactElement)?.props?.className?.includes?.('uppercase'),
        ),
    );
    expect(buttons).toHaveLength(2);
  });

  it('calls setLocale when a locale button is clicked', () => {
    mocks.stateSlots.push('language', '', '', 'idle', false, null);
    const tree = render();
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-lg') &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) =>
            (c as React.ReactElement)?.props?.className?.includes?.('uppercase'),
        ),
    );
    // first is en
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(mocks.setLocale).toHaveBeenCalledWith('en');
    // second is zh
    (buttons[1].props as { onClick: () => void }).onClick();
    expect(mocks.setLocale).toHaveBeenCalledWith('zh');
  });

  it('marks the active locale with accent border', () => {
    mocks.locale = 'zh';
    mocks.stateSlots.push('language', '', '', 'idle', false, null);
    const tree = render();
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-lg') &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) =>
            (c as React.ReactElement)?.props?.className?.includes?.('uppercase'),
        ),
    );
    expect((buttons[1].props as { className: string }).className).toContain('border-ice-accent');
    expect((buttons[0].props as { className: string }).className).not.toContain('border-ice-accent');
  });
});

// ─── Tour anchors (tour-9) ───────────────────────────────────────────────

describe('AppSettings — tour anchors', () => {
  it('AI tab button has data-tour-id="app-settings-tab-ai" and Save button has data-tour-id="app-settings-btn-save"', () => {
    const tree = render();
    const aiTabButton = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { ['data-tour-id']?: string })['data-tour-id'] === 'app-settings-tab-ai',
    );
    expect(aiTabButton).toHaveLength(1);
    const saveButton = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { ['data-tour-id']?: string })['data-tour-id'] === 'app-settings-btn-save',
    );
    expect(saveButton).toHaveLength(1);
  });
});
