/**
 * Tests for `InviteUserModal` — invite-by-email modal with role selection.
 *
 * Strategy:
 *  - Direct-FC tree-walker pattern.
 *  - `useState` mocked via slot-by-call-index (5 slots: email, role, loading,
 *    error, success).
 *  - `react-redux.useSelector` reads from a hoisted `state.account.selectedOrg`.
 *  - `axiosInstance.post` returns test-controlled response/error.
 *  - `react-dom.createPortal` is identity (returns its first arg verbatim).
 *  - `useTranslation` returns identity-key `t`.
 *  - `setTimeout` is left as a real timer (we drive it via vi.useFakeTimers).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  // useState slots in source order:
  //   0=email (string), 1=role (string), 2=loading (boolean),
  //   3=error (string|null), 4=success (boolean)
  emailRef: { current: '' as string },
  roleRef: { current: 'member' as string },
  loadingRef: { current: false as boolean },
  errorRef: { current: null as string | null },
  successRef: { current: false as boolean },
  setEmailSpy: vi.fn(),
  setRoleSpy: vi.fn(),
  setLoadingSpy: vi.fn(),
  setErrorSpy: vi.fn(),
  setSuccessSpy: vi.fn(),
  // Redux state
  state: {
    account: {
      selectedOrg: { id: 'org-1', name: 'Acme', role: 'admin' } as { id: string; name: string; role: string } | null,
    },
  },
  // axios
  axiosPost: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let callIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    callIdx = 0;
  };
  const dispatch = [
    () => [mocks.emailRef.current, mocks.setEmailSpy] as const,
    () => [mocks.roleRef.current, mocks.setRoleSpy] as const,
    () => [mocks.loadingRef.current, mocks.setLoadingSpy] as const,
    () => [mocks.errorRef.current, mocks.setErrorSpy] as const,
    () => [mocks.successRef.current, mocks.setSuccessSpy] as const,
  ];
  const useStateStub = <T,>(): [T, (v: T) => void] => {
    const slot = dispatch[callIdx] ?? dispatch[dispatch.length - 1];
    callIdx += 1;
    return slot() as unknown as [T, (v: T) => void];
  };
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: useStateStub,
    default: { ...actualDefault, useState: useStateStub },
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('react-dom', () => ({
  createPortal: (el: React.ReactElement) => el,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: { post: mocks.axiosPost },
}));

vi.stubGlobal('document', { body: {} });

import { InviteUserModal } from '../invite-user-modal';

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
function collectText(tree: unknown): string {
  let out = '';
  for (const el of walk(tree)) {
    const c = el.props.children;
    if (typeof c === 'string') out += c + ' ';
    else if (typeof c === 'number') out += String(c) + ' ';
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') out += item + ' ';
        else if (typeof item === 'number') out += String(item) + ' ';
      }
    }
  }
  return out;
}

type Props = { onClose: () => void; onInvited?: () => void };
const render = (props: Props): unknown => {
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  return (InviteUserModal as unknown as (p: Props) => unknown)(props);
};

const flush = async (): Promise<void> => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

// ─── Per-test reset ─────────────────────────────────────────────────────────
beforeEach(() => {
  mocks.emailRef.current = '';
  mocks.roleRef.current = 'member';
  mocks.loadingRef.current = false;
  mocks.errorRef.current = null;
  mocks.successRef.current = false;
  mocks.setEmailSpy.mockReset();
  mocks.setRoleSpy.mockReset();
  mocks.setLoadingSpy.mockReset();
  mocks.setErrorSpy.mockReset();
  mocks.setSuccessSpy.mockReset();
  mocks.axiosPost.mockReset();
  mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'admin' };
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('InviteUserModal — render', () => {
  it('renders the title and label translation keys', () => {
    const tree = render({ onClose: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('account.invite.title');
    expect(text).toContain('account.invite.emailLabel');
    expect(text).toContain('account.invite.roleLabel');
  });

  it('renders an email input wired to setEmail', () => {
    const tree = render({ onClose: vi.fn() });
    const input = findFirst(tree, (el) => el.type === 'input' && el.props.type === 'email');
    expect(input).toBeDefined();
    (input!.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: 'a@b.c' },
    });
    expect(mocks.setEmailSpy).toHaveBeenCalledWith('a@b.c');
  });

  it('email input value reflects current state', () => {
    mocks.emailRef.current = 'pre@filled.com';
    const tree = render({ onClose: vi.fn() });
    const input = findFirst(tree, (el) => el.type === 'input' && el.props.type === 'email');
    expect(input!.props.value).toBe('pre@filled.com');
  });

  it('email input has autoFocus', () => {
    const tree = render({ onClose: vi.fn() });
    const input = findFirst(tree, (el) => el.type === 'input' && el.props.type === 'email');
    expect(input!.props.autoFocus).toBe(true);
  });

  it('renders three role buttons (admin, member, viewer)', () => {
    const tree = render({ onClose: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('common.roles.admin');
    expect(text).toContain('common.roles.member');
    expect(text).toContain('common.roles.viewer');
    expect(text).toContain('account.invite.roleAdminDesc');
    expect(text).toContain('account.invite.roleMemberDesc');
    expect(text).toContain('account.invite.roleViewerDesc');
  });
});

describe('InviteUserModal — role selection', () => {
  // Role buttons each have type='button' and arrayed children (Icon + label-block).
  // Pick them out by matching their unique className signature ('rounded-md border').
  const findRoleButtons = (tree: unknown): ElLike[] =>
    findAll(tree, (el) => {
      if (el.type !== 'button' || el.props.type !== 'button') return false;
      const cn = el.props.className;
      return typeof cn === 'string' && cn.includes('items-start gap-3 rounded-md border');
    });

  it('clicking the admin role button calls setRole(admin)', () => {
    const tree = render({ onClose: vi.fn() });
    const roleButtons = findRoleButtons(tree);
    expect(roleButtons).toHaveLength(3);
    // Order in source: admin(0), member(1), viewer(2)
    (roleButtons[0].props.onClick as () => void)();
    expect(mocks.setRoleSpy).toHaveBeenCalledWith('admin');
  });

  it('clicking the viewer role button calls setRole(viewer)', () => {
    const tree = render({ onClose: vi.fn() });
    const roleButtons = findRoleButtons(tree);
    expect(roleButtons).toHaveLength(3);
    (roleButtons[2].props.onClick as () => void)();
    expect(mocks.setRoleSpy).toHaveBeenCalledWith('viewer');
  });

  it('clicking the member role button calls setRole(member)', () => {
    mocks.roleRef.current = 'admin';
    const tree = render({ onClose: vi.fn() });
    const roleButtons = findRoleButtons(tree);
    expect(roleButtons).toHaveLength(3);
    (roleButtons[1].props.onClick as () => void)();
    expect(mocks.setRoleSpy).toHaveBeenCalledWith('member');
  });

  it('selected role button uses the active border class', () => {
    mocks.roleRef.current = 'admin';
    const tree = render({ onClose: vi.fn() });
    const roleButtons = findRoleButtons(tree);
    const cn = roleButtons[0].props.className as string;
    expect(cn).toContain('border-ice-accent');
    expect(cn).toContain('bg-ice-base');
  });

  it('non-selected role button uses the default border class', () => {
    mocks.roleRef.current = 'admin';
    const tree = render({ onClose: vi.fn() });
    const roleButtons = findRoleButtons(tree);
    const cn = roleButtons[2].props.className as string;
    expect(cn).toContain('border-ice-border');
    expect(cn).toContain('hover:border-ice-border-strong');
  });
});

describe('InviteUserModal — email validation', () => {
  it('submit button is disabled when email is empty', () => {
    mocks.emailRef.current = '';
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.disabled).toBe(true);
  });

  it('submit button is disabled for malformed email', () => {
    mocks.emailRef.current = 'not-an-email';
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.disabled).toBe(true);
  });

  it('submit button is enabled for valid email', () => {
    mocks.emailRef.current = 'user@example.com';
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.disabled).toBe(false);
  });

  it('submit button is disabled while loading even with valid email', () => {
    mocks.emailRef.current = 'user@example.com';
    mocks.loadingRef.current = true;
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.disabled).toBe(true);
  });

  it('submit button is disabled in success state', () => {
    mocks.emailRef.current = 'user@example.com';
    mocks.successRef.current = true;
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.disabled).toBe(true);
  });
});

describe('InviteUserModal — submit button label', () => {
  it('shows the send label when not loading', () => {
    mocks.loadingRef.current = false;
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.children).toBe('account.invite.sendButton');
  });

  it('shows the sending label when loading', () => {
    mocks.loadingRef.current = true;
    const tree = render({ onClose: vi.fn() });
    const submit = findFirst(tree, (el) => el.type === 'button' && el.props.type === 'submit');
    expect(submit!.props.children).toBe('account.invite.sendingButton');
  });
});

describe('InviteUserModal — error and success banners', () => {
  it('renders neither banner when error is null and success is false', () => {
    mocks.errorRef.current = null;
    mocks.successRef.current = false;
    const tree = render({ onClose: vi.fn() });
    const text = collectText(tree);
    expect(text).not.toContain('account.invite.successMessage');
  });

  it('renders the error banner when error is set', () => {
    mocks.errorRef.current = 'unable to send';
    const tree = render({ onClose: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('unable to send');
  });

  it('renders the success banner when success is true', () => {
    mocks.successRef.current = true;
    const tree = render({ onClose: vi.fn() });
    const text = collectText(tree);
    expect(text).toContain('account.invite.successMessage');
  });
});

describe('InviteUserModal — onClose handlers', () => {
  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn();
    const tree = render({ onClose });
    const backdrop = findFirst(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('absolute inset-0 bg-black/60'),
    );
    expect(backdrop).toBeDefined();
    (backdrop!.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the X header button calls onClose', () => {
    const onClose = vi.fn();
    const tree = render({ onClose });
    const buttons = findAll(tree, (el) => el.type === 'button');
    const xBtn = buttons.find((b) => b.props.type === undefined);
    expect(xBtn).toBeDefined();
    (xBtn!.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the cancel button calls onClose', () => {
    const onClose = vi.fn();
    const tree = render({ onClose });
    const cancelBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.type === 'button' && el.props.children === 'account.invite.cancelButton',
    );
    expect(cancelBtn).toBeDefined();
    (cancelBtn!.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('InviteUserModal — handleSubmit happy path', () => {
  it('posts /users/invite with email + role + selectedOrg.id, sets success, calls onInvited', async () => {
    mocks.emailRef.current = 'user@example.com';
    mocks.roleRef.current = 'admin';
    mocks.axiosPost.mockResolvedValueOnce({ data: { ok: true } });
    const onInvited = vi.fn();
    const tree = render({ onClose: vi.fn(), onInvited });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    const preventDefault = vi.fn();
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/users/invite', {
      email: 'user@example.com',
      role: 'admin',
      targetOrganisationId: 'org-1',
    });
    expect(mocks.setSuccessSpy).toHaveBeenCalledWith(true);
    expect(onInvited).toHaveBeenCalled();
    expect(mocks.setLoadingSpy).toHaveBeenLastCalledWith(false);
  });

  it('does not throw if onInvited is not provided', async () => {
    mocks.emailRef.current = 'a@b.com';
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await expect(
      (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
        preventDefault: vi.fn(),
      }),
    ).resolves.toBeUndefined();
    expect(mocks.setSuccessSpy).toHaveBeenCalledWith(true);
  });

  it('schedules onClose via setTimeout(1500) after success', async () => {
    vi.useFakeTimers();
    mocks.emailRef.current = 'a@b.com';
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    const onClose = vi.fn();
    const tree = render({ onClose });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    // Drive the async chain
    const submitPromise = (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);
    await submitPromise;
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('InviteUserModal — handleSubmit guards', () => {
  it('returns early on invalid email (no axios call)', async () => {
    mocks.emailRef.current = 'bad-email';
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.axiosPost).not.toHaveBeenCalled();
    expect(mocks.setLoadingSpy).not.toHaveBeenCalled();
  });

  it('returns early when loading is true', async () => {
    mocks.emailRef.current = 'user@example.com';
    mocks.loadingRef.current = true;
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it('returns early when selectedOrg is null', async () => {
    mocks.emailRef.current = 'user@example.com';
    mocks.state.account.selectedOrg = null;
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it('preventDefault is always called even on early-return', async () => {
    mocks.emailRef.current = 'bad-email';
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    const preventDefault = vi.fn();
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe('InviteUserModal — handleSubmit error path', () => {
  it('catches an Error and calls setError with err.message', async () => {
    mocks.emailRef.current = 'user@example.com';
    mocks.axiosPost.mockRejectedValueOnce(new Error('rate limited'));
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.setErrorSpy).toHaveBeenLastCalledWith('rate limited');
    expect(mocks.setLoadingSpy).toHaveBeenLastCalledWith(false);
    expect(mocks.setSuccessSpy).not.toHaveBeenCalled();
  });

  it('falls back to t(errorFallback) when thrown value is not an Error instance', async () => {
    mocks.emailRef.current = 'user@example.com';
    mocks.axiosPost.mockRejectedValueOnce({ message: 'object-not-error' });
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.setErrorSpy).toHaveBeenLastCalledWith('account.invite.errorFallback');
  });

  it('falls back to t(errorFallback) when thrown value is null', async () => {
    mocks.emailRef.current = 'user@example.com';
    mocks.axiosPost.mockRejectedValueOnce(null);
    const tree = render({ onClose: vi.fn() });
    const form = findFirst(tree, (el) => el.type === 'form')!;
    await (form.props.onSubmit as (e: { preventDefault: () => void }) => Promise<void>)({
      preventDefault: vi.fn(),
    });
    expect(mocks.setErrorSpy).toHaveBeenLastCalledWith('account.invite.errorFallback');
  });
});
