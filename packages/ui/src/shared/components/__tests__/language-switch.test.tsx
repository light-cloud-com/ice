/**
 * Tests for `LanguageSwitch` — direct-FC tree-walker.
 *
 * The component reads `useTranslation` and uses `useState` (open) +
 * `useRef` (containerRef). Mocks:
 *   - `useTranslation` returns a controllable locale + setLocale spy.
 *   - `useState` is a passthrough with mutable ref so tests can drive
 *     the open/closed state.
 *   - `useRef` is a passthrough.
 *   - `LOCALES` is the real array (small fixture).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  setLocaleSpy: vi.fn(),
  locale: 'en' as 'en' | 'es' | 'fr' | 'de',
  // Single useState slot — `open` boolean. Mutable so tests can drive it.
  openRef: { current: false },
  setOpenSpy: vi.fn(),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  return {
    ...actual,
    useState: vi.fn(<T,>(initial: T | (() => T)) => {
      void initial;
      return [mocks.openRef.current as unknown as T, mocks.setOpenSpy as unknown];
    }),
    useRef: vi.fn(<T,>(initial: T) => ({ current: initial })),
  };
});

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({
    locale: mocks.locale,
    setLocale: mocks.setLocaleSpy,
  }),
  LOCALES: [
    { id: 'en', label: 'English', nativeLabel: 'English' },
    { id: 'es', label: 'Spanish', nativeLabel: 'Español' },
    { id: 'fr', label: 'French', nativeLabel: 'Français' },
  ],
}));

vi.mock('../../utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

import { LanguageSwitch } from '../language-switch';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* opaque */
    }
    return;
  }
  yield* walk(node.props.children);
}

function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}

function collectText(tree: unknown): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = el.props.children;
    if (typeof c === 'string') s += c;
    else if (typeof c === 'number') s += String(c);
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
        else if (typeof item === 'number') s += String(item);
      }
    }
  }
  return s;
}

const render = (props: { className?: string } = {}): React.ReactElement =>
  (LanguageSwitch as unknown as (p: typeof props) => React.ReactElement)(props);

beforeEach(() => {
  mocks.setLocaleSpy.mockReset();
  mocks.setOpenSpy.mockReset();
  mocks.openRef.current = false;
  mocks.locale = 'en';
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LanguageSwitch — closed state', () => {
  it('renders only the toggle button when open=false', () => {
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('en');
    // No locale options visible.
    expect(text).not.toContain('Español');
    expect(text).not.toContain('Français');
  });

  it('renders the current locale (uppercased) on the button', () => {
    mocks.locale = 'fr';
    const tree = render();
    const text = collectText(tree);
    // Locale shown verbatim (uppercase className not enforced as text — the
    // raw text is still 'fr', uppercased visually via Tailwind).
    expect(text).toContain('fr');
  });

  it("renders the current locale's nativeLabel as the title attribute", () => {
    mocks.locale = 'es';
    const tree = render();
    const btn = findFirst(tree, (el) => el.type === 'button');
    expect((btn!.props as { title?: string }).title).toBe('Español');
  });

  it('clicking the toggle button calls setOpen(!open)', () => {
    const tree = render();
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    const onClick = (btn.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.setOpenSpy).toHaveBeenCalledWith(true);
  });

  it('passes className through to the outer container', () => {
    const tree = render({ className: 'shrink-0 ml-2' });
    expect((tree.props as { className: string }).className).toContain('shrink-0 ml-2');
  });
});

describe('LanguageSwitch — open state', () => {
  beforeEach(() => {
    mocks.openRef.current = true;
  });

  it('renders one option per LOCALE entry when open=true', () => {
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('English');
    expect(text).toContain('Español');
    expect(text).toContain('Français');
  });

  it('renders the locale id (lowercase) next to each native label', () => {
    const tree = render();
    const text = collectText(tree);
    // The 3 ids are rendered in a separate <span>.
    expect(text).toContain('en');
    expect(text).toContain('es');
    expect(text).toContain('fr');
  });

  it('clicking an option calls setLocale + setOpen(false)', () => {
    const tree = render();
    // 1 toggle button + 3 option buttons.
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons.length).toBe(4);
    const esBtn = buttons[2]; // English, then Spanish (index 2)
    const onClick = (esBtn.props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.setLocaleSpy).toHaveBeenCalledWith('es');
    expect(mocks.setOpenSpy).toHaveBeenCalledWith(false);
  });

  it('the active locale option gets the active className (text-ice-accent)', () => {
    mocks.locale = 'fr';
    const tree = render();
    const buttons = findAll(tree, (el) => el.type === 'button');
    // index 0 toggle, 1 'en', 2 'es', 3 'fr'.
    expect((buttons[3].props as { className: string }).className).toContain('text-ice-accent');
    // Non-active gets text-ice-text-2.
    expect((buttons[1].props as { className: string }).className).toContain('text-ice-text-2');
  });
});

describe('LanguageSwitch — onBlur', () => {
  it('closes the dropdown when blur target is outside the container', () => {
    const tree = render();
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    const onBlur = (
      btn.props as {
        onBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;
      }
    ).onBlur;
    // containerRef.current is null in our useRef stub, so .contains(...)
    // would throw — but the optional chain returns undefined → !undefined
    // → enters the close branch.
    onBlur({ relatedTarget: null } as unknown as React.FocusEvent<HTMLButtonElement>);
    expect(mocks.setOpenSpy).toHaveBeenCalledWith(false);
  });

  it('keeps the dropdown open when blur target is inside the container', async () => {
    // Override useRef return for this test only — re-mock the module reference.
    mocks.setOpenSpy.mockReset();
    // Provide a containerRef.current that "contains" the related target.
    const containerStub = {
      contains: vi.fn(() => true),
    };
    // Hack: mutate the React mock so useRef returns our stub.
    const useRefSpy = (await import('react')).useRef as unknown as ReturnType<typeof vi.fn>;
    useRefSpy.mockReturnValueOnce({ current: containerStub });
    const tree = render();
    const btn = findFirst(tree, (el) => el.type === 'button')!;
    const onBlur = (
      btn.props as {
        onBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;
      }
    ).onBlur;
    onBlur({ relatedTarget: { x: 1 } } as unknown as React.FocusEvent<HTMLButtonElement>);
    expect(containerStub.contains).toHaveBeenCalledWith({ x: 1 });
    expect(mocks.setOpenSpy).not.toHaveBeenCalled();
  });
});
