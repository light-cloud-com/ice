/**
 * UserSettingsPage tests — direct-FC tree-walker.
 *
 * Pins the Community-edition profile editor: name pre-fill from selector,
 * form submit handler, success/error banner, and the disabled-button gate.
 *
 * React hooks are stubbed via passthrough so we can re-render at will and
 * pin slot-by-position state values; redux selectors / dispatch are mocked.
 * axiosInstance.put is mocked at module level.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // useState slot-by-position; first call -> idx 0, etc.
  useStateOverrides: {} as Record<number, unknown>,
  useStateCount: 0,
  useStateSetters: [] as Array<ReturnType<typeof vi.fn>>,
  effects: [] as Array<() => void | (() => void)>,
  // redux
  useSelectorReturn: { user: null as null | { name?: string; email?: string } },
  dispatch: vi.fn(),
  fetchProfile: vi.fn(() => ({ type: 'account/fetchProfile' })),
  // axios
  put: vi.fn(async () => ({ data: {} })),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(init: T): [T, (v: T) => void] => {
    const idx = mocks.useStateCount;
    mocks.useStateCount += 1;
    const setter = vi.fn();
    mocks.useStateSetters[idx] = setter;
    const override = mocks.useStateOverrides[idx];
    const value = idx in mocks.useStateOverrides ? (override as T) : init;
    return [value, setter];
  };
  const useEffectStub = (fn: () => void | (() => void)) => {
    mocks.effects.push(fn);
  };
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: { ...actualDefault, useState: useStateStub, useEffect: useEffectStub },
    useState: useStateStub,
    useEffect: useEffectStub,
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: <T,>(sel: (s: { account: typeof mocks.useSelectorReturn }) => T) =>
    sel({ account: mocks.useSelectorReturn }),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `[t:${k}]` }),
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: { put: mocks.put },
}));

vi.mock('../../../../store/slices/account-slice', () => ({
  fetchProfile: mocks.fetchProfile,
}));

import { UserSettingsPage } from '../user-settings-page';

// ─── Tree walker ──────────────────────────────────────────────────────────

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
      /* skip */
    }
    return;
  }
  yield* walk(node.props.children);
}
function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}
function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

const render = () => (UserSettingsPage as unknown as () => unknown)();

beforeEach(() => {
  mocks.useStateOverrides = {};
  mocks.useStateCount = 0;
  mocks.useStateSetters = [];
  mocks.effects = [];
  mocks.useSelectorReturn = { user: null };
  mocks.dispatch.mockClear();
  mocks.fetchProfile.mockClear();
  mocks.put.mockReset();
  mocks.put.mockResolvedValue({ data: {} });
});

// ─── Rendering / structure ────────────────────────────────────────────────

describe('UserSettingsPage — render', () => {
  it('renders the settings root with id="ice-settings-panel"', () => {
    const tree = render();
    const root = findFirst(
      tree,
      (el) => el.type === 'div' && (el.props as { id?: string }).id === 'ice-settings-panel',
    );
    expect(root).toBeDefined();
  });

  it('shows the email input as disabled with the user email when present', () => {
    mocks.useSelectorReturn = { user: { name: 'Ada Lovelace', email: 'ada@x.com' } };
    const tree = render();
    const emailInput = findFirst(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'email',
    );
    expect(emailInput).toBeDefined();
    expect((emailInput!.props as { disabled?: boolean }).disabled).toBe(true);
    expect((emailInput!.props as { value?: string }).value).toBe('ada@x.com');
  });

  it('email input falls back to empty string when user has no email', () => {
    mocks.useSelectorReturn = { user: null };
    const tree = render();
    const emailInput = findFirst(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'email',
    );
    expect((emailInput!.props as { value?: string }).value).toBe('');
  });
});

// ─── useEffect: prefilling first/last name ────────────────────────────────

describe('UserSettingsPage — name prefill effect', () => {
  it('splits the user name into firstName and lastName setters when user.name is present', () => {
    mocks.useSelectorReturn = { user: { name: 'Ada Lovelace' } };
    render();
    // Run the prefill effect.
    mocks.effects[0]?.();
    // Slot 0 -> firstName setter; slot 1 -> lastName setter.
    expect(mocks.useStateSetters[0]).toHaveBeenCalledWith('Ada');
    expect(mocks.useStateSetters[1]).toHaveBeenCalledWith('Lovelace');
  });

  it('joins everything after the first space into lastName', () => {
    mocks.useSelectorReturn = { user: { name: 'Ada Augusta King' } };
    render();
    mocks.effects[0]?.();
    expect(mocks.useStateSetters[0]).toHaveBeenCalledWith('Ada');
    expect(mocks.useStateSetters[1]).toHaveBeenCalledWith('Augusta King');
  });

  it('handles a single-word name with empty lastName', () => {
    mocks.useSelectorReturn = { user: { name: 'Ada' } };
    render();
    mocks.effects[0]?.();
    expect(mocks.useStateSetters[0]).toHaveBeenCalledWith('Ada');
    expect(mocks.useStateSetters[1]).toHaveBeenCalledWith('');
  });

  it('does NOT call the firstName/lastName setters when user has no name', () => {
    mocks.useSelectorReturn = { user: { email: 'x@x.com' } };
    render();
    mocks.effects[0]?.();
    expect(mocks.useStateSetters[0]).not.toHaveBeenCalled();
    expect(mocks.useStateSetters[1]).not.toHaveBeenCalled();
  });

  it('does NOT call the setters when user is null', () => {
    mocks.useSelectorReturn = { user: null };
    render();
    mocks.effects[0]?.();
    expect(mocks.useStateSetters[0]).not.toHaveBeenCalled();
    expect(mocks.useStateSetters[1]).not.toHaveBeenCalled();
  });
});

// ─── First-name input wiring ──────────────────────────────────────────────

describe('UserSettingsPage — first-name input', () => {
  it('changing the first-name input invokes setFirstName with the new value', () => {
    mocks.useStateOverrides = { 0: 'Ada' };
    const tree = render();
    const input = findFirst(
      tree,
      (el) => el.type === 'input' && (el.props as { id?: string }).id === 'ice-settings-input-name',
    )!;
    const onChange = (input.props as { onChange: (e: { target: { value: string } }) => void }).onChange;
    onChange({ target: { value: 'Brian' } });
    expect(mocks.useStateSetters[0]).toHaveBeenCalledWith('Brian');
  });

  it('changing the second (last name) input invokes the lastName setter', () => {
    const tree = render();
    const inputs = findAll(
      tree,
      (el) => el.type === 'input' && (el.props as { type?: string }).type === 'text',
    );
    // First text input is firstName, second is lastName.
    const onChange = (inputs[1].props as { onChange: (e: { target: { value: string } }) => void }).onChange;
    onChange({ target: { value: 'Kernighan' } });
    expect(mocks.useStateSetters[1]).toHaveBeenCalledWith('Kernighan');
  });
});

// ─── handleProfileSave ────────────────────────────────────────────────────

describe('UserSettingsPage — handleProfileSave', () => {
  const submitForm = async (preventDefault?: ReturnType<typeof vi.fn>) => {
    const tree = render();
    const form = findFirst(tree, (el) => el.type === 'form')!;
    const onSubmit = (form.props as { onSubmit: (e: React.FormEvent) => Promise<void> }).onSubmit;
    await onSubmit({ preventDefault: preventDefault ?? vi.fn() } as unknown as React.FormEvent);
  };

  it('calls preventDefault and short-circuits when firstName is empty (whitespace-only)', async () => {
    mocks.useStateOverrides = { 0: '   ', 1: 'Doe' };
    const preventDefault = vi.fn();
    await submitForm(preventDefault);
    expect(preventDefault).toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('PUTs /profile/name with trimmed first/last names on a successful submit', async () => {
    mocks.useStateOverrides = { 0: '  Ada  ', 1: '  Lovelace  ' };
    await submitForm();
    expect(mocks.put).toHaveBeenCalledWith('/profile/name', {
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });

  it('on success: sets profileLoading=true then false, dispatches fetchProfile, and stamps a success message', async () => {
    mocks.useStateOverrides = { 0: 'Ada' };
    await submitForm();
    // Slot 2 = profileLoading; slot 3 = profileMessage.
    expect(mocks.useStateSetters[2]).toHaveBeenCalledWith(true);
    expect(mocks.useStateSetters[2]).toHaveBeenLastCalledWith(false);
    expect(mocks.useStateSetters[3]).toHaveBeenCalledWith({
      type: 'success',
      text: '[t:account.settings.profileSaved]',
    });
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'account/fetchProfile' });
  });

  it('on PUT failure: stamps an error message and still flips profileLoading off', async () => {
    mocks.useStateOverrides = { 0: 'Ada' };
    mocks.put.mockRejectedValueOnce(new Error('boom'));
    await submitForm();
    expect(mocks.useStateSetters[3]).toHaveBeenCalledWith({
      type: 'error',
      text: '[t:account.settings.profileSaveFailed]',
    });
    expect(mocks.useStateSetters[2]).toHaveBeenLastCalledWith(false);
    // Don't dispatch fetchProfile when PUT fails.
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('clears any prior message before submitting (setProfileMessage(null))', async () => {
    mocks.useStateOverrides = { 0: 'Ada' };
    await submitForm();
    expect(mocks.useStateSetters[3]).toHaveBeenNthCalledWith(1, null);
  });
});

// ─── Profile message render branches ──────────────────────────────────────

describe('UserSettingsPage — profileMessage banner', () => {
  it('renders nothing when profileMessage is null', () => {
    mocks.useStateOverrides = { 3: null };
    const tree = render();
    // Look for a <p> with success or error styling — it should not exist.
    const banners = findAll(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        ((el.props as { className: string }).className.includes('text-[#3fb950]') ||
          (el.props as { className: string }).className.includes('text-red-400')),
    );
    expect(banners).toHaveLength(0);
  });

  it('renders the success banner when profileMessage.type is "success"', () => {
    mocks.useStateOverrides = { 3: { type: 'success', text: 'saved!' } };
    const tree = render();
    const banner = findFirst(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-[#3fb950]'),
    );
    expect(banner).toBeDefined();
    expect((banner!.props as { children: string }).children).toBe('saved!');
  });

  it('renders the error banner when profileMessage.type is "error"', () => {
    mocks.useStateOverrides = { 3: { type: 'error', text: 'oops' } };
    const tree = render();
    const banner = findFirst(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-red-400'),
    );
    expect(banner).toBeDefined();
    expect((banner!.props as { children: string }).children).toBe('oops');
  });
});

// ─── Submit button disabled gating ────────────────────────────────────────

describe('UserSettingsPage — submit button', () => {
  it('disables the submit button when firstName is empty', () => {
    mocks.useStateOverrides = { 0: '' };
    const tree = render();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { type?: string }).type === 'submit',
    )!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disables the submit button when profileLoading is true', () => {
    mocks.useStateOverrides = { 0: 'Ada', 2: true };
    const tree = render();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { type?: string }).type === 'submit',
    )!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('renders an animate-spin icon when profileLoading is true', () => {
    mocks.useStateOverrides = { 0: 'Ada', 2: true };
    const tree = render();
    // Loader2 (lucide) renders an SVG; check for any element whose className
    // (props OR rendered output) carries 'animate-spin'.
    const hit = findFirst(
      tree,
      (el) => {
        const cn = (el.props as { className?: unknown }).className;
        return typeof cn === 'string' && cn.includes('animate-spin');
      },
    );
    expect(hit).toBeDefined();
  });

  it('does NOT render an animate-spin icon when profileLoading is false (Save renders)', () => {
    mocks.useStateOverrides = { 0: 'Ada', 2: false };
    const tree = render();
    const hit = findFirst(
      tree,
      (el) => {
        const cn = (el.props as { className?: unknown }).className;
        return typeof cn === 'string' && cn.includes('animate-spin');
      },
    );
    expect(hit).toBeUndefined();
  });

  it('enables the submit button when firstName is non-empty and profileLoading is false', () => {
    mocks.useStateOverrides = { 0: 'Ada', 2: false };
    const tree = render();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { type?: string }).type === 'submit',
    )!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(false);
  });
});
