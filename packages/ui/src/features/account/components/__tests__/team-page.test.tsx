/**
 * Tests for `TeamPage` — team management page (members, invites, roles).
 *
 * Strategy:
 *  - Direct-FC tree-walker pattern: invoke `TeamPage()` synchronously,
 *    walk the returned tree, exercise `onClick` / `onChange` handlers,
 *    assert on dispatched calls (`axiosInstance.post`, setter spies).
 *  - `useState` is mocked to deal-out slots from a queued list. Five
 *    slots in source order: `members`, `invites`, `loading`,
 *    `showInviteModal`, `actionLoading`.
 *  - `useEffect` is mocked to invoke its callback synchronously so the
 *    mount-side `fetchMembers()` POST + GET fires inside `TeamPage()`.
 *  - `useCallback` is identity passthrough so the captured callback is
 *    the actual function under test.
 *  - `useSelector` reads from a hoisted `state.account` shape — tests
 *    flip `selectedOrg` / `user` / `selectedOrg.role` per test.
 *  - `axiosInstance` is mocked at the module-import boundary so the
 *    Promise.all([POST /users, GET /users/invitations]) resolves to a
 *    test-controlled response.
 *  - `InviteUserModal` is an opaque mock matched by reference (so the
 *    walker can find the conditionally-rendered modal node).
 *  - `useTranslation` returns identity-key `t`.
 *  - `lucide-react` icons remain unmocked (used by reference-equality
 *    walks via displayName) — they render as opaque <svg> elements.
 *  - `cn` returns a joined string so className-based predicates work.
 *  - `window.confirm` stubbed per-test for the remove-user guard.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  // useState slots (in source order):
  //   0=members, 1=invites, 2=loading, 3=showInviteModal, 4=actionLoading
  membersRef: { current: [] as Array<Record<string, unknown>> },
  invitesRef: { current: [] as Array<Record<string, unknown>> },
  loadingRef: { current: true },
  showInviteModalRef: { current: false },
  actionLoadingRef: { current: null as string | null },
  // Per-slot setter spies
  setMembersSpy: vi.fn(),
  setInvitesSpy: vi.fn(),
  setLoadingSpy: vi.fn(),
  setShowInviteModalSpy: vi.fn(),
  setActionLoadingSpy: vi.fn(),
  // Effect / callback queues
  effectCallbacks: [] as Array<() => void | Promise<void>>,
  effectDeps: [] as unknown[][],
  capturedCallback: null as null | ((...args: unknown[]) => unknown),
  // Redux state
  state: {
    account: {
      selectedOrg: { id: 'org-1', name: 'Acme', role: 'owner' } as
        | { id: string; name: string; role: string }
        | null,
      user: { id: 'user-1', email: 'me@example.com', name: 'Me' } as
        | { id: string; email: string; name: string }
        | null,
    },
  },
  // axios spies
  axiosPost: vi.fn(),
  axiosGet: vi.fn(),
  // Reference for the InviteUserModal mock (so the walker can find it)
  InviteUserModalRef: vi.fn((_p: { onClose: () => void; onInvited: () => void }) => null),
}));

// React hooks: useState/useEffect/useCallback controlled.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let useStateIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    useStateIdx = 0;
  };
  const dispatch = [
    () => [mocks.membersRef.current, mocks.setMembersSpy] as const,
    () => [mocks.invitesRef.current, mocks.setInvitesSpy] as const,
    () => [mocks.loadingRef.current, mocks.setLoadingSpy] as const,
    () => [mocks.showInviteModalRef.current, mocks.setShowInviteModalSpy] as const,
    () => [mocks.actionLoadingRef.current, mocks.setActionLoadingSpy] as const,
  ];
  const useStateStub = <T,>(): [T, (v: T) => void] => {
    const slot = dispatch[useStateIdx] ?? dispatch[dispatch.length - 1];
    useStateIdx += 1;
    return slot() as unknown as [T, (v: T) => void];
  };
  const useEffectStub = (cb: () => void | Promise<void>, deps?: unknown[]) => {
    mocks.effectCallbacks.push(cb);
    mocks.effectDeps.push(deps ?? []);
    void cb();
  };
  const useCallbackStub = <T extends (...args: never[]) => unknown>(fn: T): T => {
    // Capture the most recently-built callback so tests can drive it directly.
    mocks.capturedCallback = fn as unknown as (...args: unknown[]) => unknown;
    return fn;
  };
  return {
    ...actual,
    useState: useStateStub,
    useEffect: useEffectStub,
    useCallback: useCallbackStub,
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, string | number>) =>
      vars ? `${k}:${JSON.stringify(vars)}` : k,
  }),
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: { post: mocks.axiosPost, get: mocks.axiosGet },
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../invite-user-modal', () => ({
  InviteUserModal: mocks.InviteUserModalRef,
}));

import { TeamPage } from '../team-page';

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
  // Don't expand into the InviteUserModal mock body
  if (node.type === mocks.InviteUserModalRef) {
    return;
  }
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

const flush = async (): Promise<void> => {
  // Allow the mount-side `fetchMembers` Promise.all chain to settle.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

const render = (): unknown => {
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  return (TeamPage as unknown as () => unknown)();
};

// ─── Per-test reset ─────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.membersRef.current = [];
  mocks.invitesRef.current = [];
  mocks.loadingRef.current = true;
  mocks.showInviteModalRef.current = false;
  mocks.actionLoadingRef.current = null;
  mocks.setMembersSpy.mockReset();
  mocks.setInvitesSpy.mockReset();
  mocks.setLoadingSpy.mockReset();
  mocks.setShowInviteModalSpy.mockReset();
  mocks.setActionLoadingSpy.mockReset();
  mocks.effectCallbacks = [];
  mocks.effectDeps = [];
  mocks.capturedCallback = null;
  mocks.axiosPost.mockReset();
  mocks.axiosGet.mockReset();
  mocks.InviteUserModalRef.mockReset();
  mocks.InviteUserModalRef.mockImplementation(() => null);
  mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'owner' };
  mocks.state.account.user = { id: 'user-1', email: 'me@example.com', name: 'Me' };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('TeamPage — header and admin gating', () => {
  it('renders the title and selected-org name in the subtitle', () => {
    mocks.loadingRef.current = false;
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('account.team.title');
    expect(text).toContain('Acme');
  });

  it('uses subtitleFallback when selectedOrg is null', () => {
    mocks.state.account.selectedOrg = null;
    mocks.loadingRef.current = false;
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('account.team.subtitleFallback');
  });

  it('shows invite button for admin role', () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'admin' };
    mocks.loadingRef.current = false;
    const tree = render();
    const inviteBtn = findFirst(tree, (el) => el.props.id === 'ice-team-btn-invite');
    expect(inviteBtn).toBeDefined();
  });

  it('shows invite button for owner role', () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'owner' };
    mocks.loadingRef.current = false;
    const tree = render();
    const inviteBtn = findFirst(tree, (el) => el.props.id === 'ice-team-btn-invite');
    expect(inviteBtn).toBeDefined();
  });

  it('hides invite button when role is member', () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'member' };
    mocks.loadingRef.current = false;
    const tree = render();
    const inviteBtn = findFirst(tree, (el) => el.props.id === 'ice-team-btn-invite');
    expect(inviteBtn).toBeUndefined();
  });

  it('hides invite button when role is undefined', () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: '' };
    mocks.loadingRef.current = false;
    const tree = render();
    const inviteBtn = findFirst(tree, (el) => el.props.id === 'ice-team-btn-invite');
    expect(inviteBtn).toBeUndefined();
  });

  it('treats role case-insensitively (uppercase OWNER)', () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'OWNER' };
    mocks.loadingRef.current = false;
    const tree = render();
    const inviteBtn = findFirst(tree, (el) => el.props.id === 'ice-team-btn-invite');
    expect(inviteBtn).toBeDefined();
  });

  it('clicking the invite button toggles the modal flag on', () => {
    mocks.loadingRef.current = false;
    const tree = render();
    const inviteBtn = findFirst(tree, (el) => el.props.id === 'ice-team-btn-invite');
    expect(inviteBtn).toBeDefined();
    (inviteBtn!.props.onClick as () => void)();
    expect(mocks.setShowInviteModalSpy).toHaveBeenCalledWith(true);
  });
});

describe('TeamPage — loading + empty + members table', () => {
  it('shows the loading spinner when loading=true', () => {
    mocks.loadingRef.current = true;
    const tree = render();
    const spinners = findAll(
      tree,
      (el) =>
        typeof el.type === 'object' &&
        el.type !== null &&
        (el.type as { displayName?: string }).displayName === 'LoaderCircle',
    );
    expect(spinners.length).toBeGreaterThan(0);
  });

  it('renders empty-state copy when not loading and members is empty', () => {
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [];
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('account.team.emptyState');
  });

  it('does not render empty-state copy when loading', () => {
    mocks.loadingRef.current = true;
    mocks.membersRef.current = [];
    const tree = render();
    const text = collectText(tree);
    expect(text).not.toContain('account.team.emptyState');
  });

  it('renders one row per member with name + email', () => {
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [
      { id: 'u-1', email: 'a@example.com', name: 'Alice', role: 'admin', status: 'Active', lastLogin: null },
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'member', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('Alice');
    expect(text).toContain('a@example.com');
    expect(text).toContain('Bob');
    expect(text).toContain('b@example.com');
  });

  it('marks the current user with a (you) badge', () => {
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [
      { id: 'user-1', email: 'me@example.com', name: 'Me', role: 'owner', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('account.team.youBadge');
  });

  it('does not mark other users with a (you) badge', () => {
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const text = collectText(tree);
    expect(text).not.toContain('account.team.youBadge');
  });

  it('formats a non-null lastLogin into a localized date', () => {
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [
      {
        id: 'u-2',
        email: 'b@example.com',
        name: 'Bob',
        role: 'admin',
        status: 'Active',
        lastLogin: '2024-03-15T12:00:00.000Z',
      },
    ];
    const tree = render();
    const text = collectText(tree);
    // Locale string includes "Mar" or "2024"
    expect(text).toMatch(/2024/);
  });

  it('renders never-label when lastLogin is null', () => {
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('common.time.never');
  });
});

describe('TeamPage — role selector vs read-only role badge', () => {
  it('admin viewing another member: renders a role <select>', () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'admin' };
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const sel = findFirst(tree, (el) => el.type === 'select');
    expect(sel).toBeDefined();
    const options = findAll(tree, (el) => el.type === 'option');
    expect(options.map((o) => o.props.value)).toEqual(['owner', 'admin', 'member', 'viewer']);
  });

  it('admin viewing self: renders a read-only role badge (no select)', () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'admin' };
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [
      { id: 'user-1', email: 'me@example.com', name: 'Me', role: 'admin', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const sel = findFirst(tree, (el) => el.type === 'select');
    expect(sel).toBeUndefined();
    const text = collectText(tree);
    expect(text).toContain('common.roles.admin');
  });

  it('non-admin viewing other member: renders read-only role badge', () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'member' };
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'owner', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const sel = findFirst(tree, (el) => el.type === 'select');
    expect(sel).toBeUndefined();
    const text = collectText(tree);
    expect(text).toContain('common.roles.owner');
  });

  it('falls back to "member" role meta when role is unknown', () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'member' };
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [
      {
        id: 'u-2',
        email: 'b@example.com',
        name: 'Bob',
        role: 'mystery-role',
        status: 'Active',
        lastLogin: null,
      },
    ];
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('common.roles.member');
  });

  it('admin selecting a new role posts /users/update-role and updates state', async () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'admin' };
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    mocks.axiosPost.mockResolvedValueOnce({ data: { ok: true } });
    const tree = render();
    const sel = findFirst(tree, (el) => el.type === 'select')!;
    await (sel.props.onChange as (e: { target: { value: string } }) => Promise<void>)({
      target: { value: 'viewer' },
    });
    expect(mocks.axiosPost).toHaveBeenCalledWith('/users/update-role', {
      userId: 'u-2',
      role: 'viewer',
      targetOrganisationId: 'org-1',
    });
    expect(mocks.setActionLoadingSpy).toHaveBeenCalledWith('u-2');
    expect(mocks.setActionLoadingSpy).toHaveBeenLastCalledWith(null);
    // setMembers updater invoked: previous members → patched role
    const updater = mocks.setMembersSpy.mock.calls.find((c) => typeof c[0] === 'function')?.[0] as (
      prev: Array<Record<string, unknown>>,
    ) => Array<Record<string, unknown>>;
    expect(updater).toBeTypeOf('function');
    const next = updater([
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
      { id: 'u-3', email: 'c@example.com', name: 'Carol', role: 'member', status: 'Active', lastLogin: null },
    ]);
    expect(next.find((m) => m.id === 'u-2')?.role).toBe('viewer');
    expect(next.find((m) => m.id === 'u-3')?.role).toBe('member');
  });

  it('handleRoleChange swallows axios errors', async () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'admin' };
    mocks.loadingRef.current = false;
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    mocks.axiosPost.mockRejectedValueOnce(new Error('boom'));
    const tree = render();
    const sel = findFirst(tree, (el) => el.type === 'select')!;
    await expect(
      (sel.props.onChange as (e: { target: { value: string } }) => Promise<void>)({
        target: { value: 'viewer' },
      }),
    ).resolves.toBeUndefined();
    expect(mocks.setActionLoadingSpy).toHaveBeenLastCalledWith(null);
  });

  // NOTE: `handleRoleChange` is not memoized via `useCallback`, so its
  // closure binds the render-time `selectedOrg`. The early-return branch
  // (`if (!selectedOrg) return;`) is defensive code that the UI never
  // exposes — the role <select> is only rendered when `isAdmin` is true,
  // which requires `selectedOrg.role`. The branch is therefore unreachable
  // through the UI and intentionally skipped here.

  it('select is disabled while actionLoading matches the row', () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'admin' };
    mocks.loadingRef.current = false;
    mocks.actionLoadingRef.current = 'u-2';
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const sel = findFirst(tree, (el) => el.type === 'select')!;
    expect(sel.props.disabled).toBe(true);
  });
});

describe('TeamPage — remove member', () => {
  beforeEach(() => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'admin' };
    mocks.loadingRef.current = false;
  });

  it('renders a remove (Trash2) button for non-self when admin', () => {
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.team.removeTitle',
    );
    expect(removeBtn).toBeDefined();
  });

  it('does not render remove button for self', () => {
    mocks.membersRef.current = [
      { id: 'user-1', email: 'me@example.com', name: 'Me', role: 'owner', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.team.removeTitle',
    );
    expect(removeBtn).toBeUndefined();
  });

  it('does not render remove button for non-admin viewers', () => {
    mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'member' };
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.team.removeTitle',
    );
    expect(removeBtn).toBeUndefined();
  });

  it('confirm:false aborts the remove (no axios POST, no setter)', async () => {
    vi.stubGlobal('window', { confirm: vi.fn(() => false) });
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.team.removeTitle',
    )!;
    // Clear mount-side fetchMembers spy calls before the click.
    mocks.axiosPost.mockClear();
    mocks.setActionLoadingSpy.mockClear();
    await (removeBtn.props.onClick as () => Promise<void>)();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
    expect(mocks.setActionLoadingSpy).not.toHaveBeenCalled();
  });

  it('confirm:true posts /users/remove and patches state', async () => {
    vi.stubGlobal('window', { confirm: vi.fn(() => true) });
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    mocks.axiosPost.mockResolvedValueOnce({ data: { ok: true } });
    const tree = render();
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.team.removeTitle',
    )!;
    await (removeBtn.props.onClick as () => Promise<void>)();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/users/remove', {
      userId: 'u-2',
      targetOrganisationId: 'org-1',
    });
    expect(mocks.setActionLoadingSpy).toHaveBeenCalledWith('u-2');
    expect(mocks.setActionLoadingSpy).toHaveBeenLastCalledWith(null);
    // setMembers filter updater patches the list
    const updater = mocks.setMembersSpy.mock.calls.find((c) => typeof c[0] === 'function')?.[0] as (
      prev: Array<Record<string, unknown>>,
    ) => Array<Record<string, unknown>>;
    expect(updater).toBeTypeOf('function');
    const next = updater([
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
      { id: 'u-3', email: 'c@example.com', name: 'Carol', role: 'member', status: 'Active', lastLogin: null },
    ]);
    expect(next.map((m) => m.id)).toEqual(['u-3']);
  });

  // NOTE: `handleRemoveUser`'s `if (!selectedOrg ...)` early-return is
  // defensive — the remove button only renders when `isAdmin === true`,
  // which requires `selectedOrg.role`. The branch is unreachable through
  // the UI and skipped intentionally.

  it('handleRemoveUser swallows axios errors', async () => {
    vi.stubGlobal('window', { confirm: vi.fn(() => true) });
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    mocks.axiosPost.mockRejectedValueOnce(new Error('boom'));
    const tree = render();
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.team.removeTitle',
    )!;
    await (removeBtn.props.onClick as () => Promise<void>)();
    expect(mocks.setActionLoadingSpy).toHaveBeenLastCalledWith(null);
  });

  it('shows spinner in the remove button while actionLoading=row.id', () => {
    mocks.actionLoadingRef.current = 'u-2';
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.team.removeTitle',
    )!;
    // Spinner shown: the button's child is a Loader2 lucide icon
    // (lucide-react aliases Loader2 → LoaderCircle internally so the displayName
    // is 'LoaderCircle').
    const spinners = findAll(removeBtn, (el) => {
      const dn = (el.type as { displayName?: string })?.displayName;
      return dn === 'LoaderCircle';
    });
    expect(spinners.length).toBeGreaterThan(0);
    expect(removeBtn.props.disabled).toBe(true);
  });

  it('shows trash icon when actionLoading does not match this row', () => {
    mocks.actionLoadingRef.current = 'someone-else';
    mocks.membersRef.current = [
      { id: 'u-2', email: 'b@example.com', name: 'Bob', role: 'admin', status: 'Active', lastLogin: null },
    ];
    const tree = render();
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.team.removeTitle',
    )!;
    const trash = findAll(removeBtn, (el) => {
      const dn = (el.type as { displayName?: string })?.displayName;
      return dn === 'Trash2';
    });
    expect(trash.length).toBeGreaterThan(0);
  });
});

describe('TeamPage — pending invitations', () => {
  it('hides the pending-invitations section when invites is empty', () => {
    mocks.loadingRef.current = false;
    mocks.invitesRef.current = [];
    const tree = render();
    const text = collectText(tree);
    expect(text).not.toContain('account.team.pendingInvitations');
  });

  it('renders one row per pending invite with email + role + expires', () => {
    mocks.loadingRef.current = false;
    mocks.invitesRef.current = [
      {
        id: 'inv-1',
        email: 'pending@example.com',
        role: 'member',
        created_at: '2024-01-01T00:00:00.000Z',
        expires_at: '2024-04-01T00:00:00.000Z',
      },
      {
        id: 'inv-2',
        email: 'pending2@example.com',
        role: 'admin',
        created_at: '2024-01-02T00:00:00.000Z',
        expires_at: '2024-04-02T00:00:00.000Z',
      },
    ];
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('account.team.pendingInvitations');
    expect(text).toContain('pending@example.com');
    expect(text).toContain('pending2@example.com');
    expect(text).toContain('account.team.invitedAs');
    expect(text).toContain('account.team.expires');
    expect(text).toMatch(/2024/);
  });
});

describe('TeamPage — invite modal mount', () => {
  it('does not render the InviteUserModal when showInviteModal=false', () => {
    mocks.loadingRef.current = false;
    mocks.showInviteModalRef.current = false;
    const tree = render();
    const modal = findFirst(tree, (el) => el.type === mocks.InviteUserModalRef);
    expect(modal).toBeUndefined();
  });

  it('renders the InviteUserModal when showInviteModal=true and wires onClose+onInvited', () => {
    mocks.loadingRef.current = false;
    mocks.showInviteModalRef.current = true;
    const tree = render();
    const modal = findFirst(tree, (el) => el.type === mocks.InviteUserModalRef);
    expect(modal).toBeDefined();
    const props = modal!.props as { onClose: () => void; onInvited: () => void };
    expect(typeof props.onClose).toBe('function');
    expect(typeof props.onInvited).toBe('function');
    // onClose flips the show flag off
    props.onClose();
    expect(mocks.setShowInviteModalSpy).toHaveBeenCalledWith(false);
  });

  it('onInvited triggers a re-fetch (the captured useCallback function)', async () => {
    mocks.loadingRef.current = false;
    mocks.showInviteModalRef.current = true;
    mocks.axiosPost.mockResolvedValue({ data: [] });
    mocks.axiosGet.mockResolvedValue({ data: [] });
    const tree = render();
    const modal = findFirst(tree, (el) => el.type === mocks.InviteUserModalRef)!;
    mocks.axiosPost.mockClear();
    mocks.axiosGet.mockClear();
    await (modal.props.onInvited as () => Promise<void>)();
    await flush();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/users', { targetOrganisationId: 'org-1' });
    expect(mocks.axiosGet).toHaveBeenCalledWith('/users/invitations?organisationId=org-1');
  });
});

describe('TeamPage — fetchMembers (mount-side useEffect)', () => {
  it('returns early when selectedOrg is null at mount', async () => {
    mocks.state.account.selectedOrg = null;
    render();
    await flush();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
    expect(mocks.axiosGet).not.toHaveBeenCalled();
    expect(mocks.setLoadingSpy).not.toHaveBeenCalled();
  });

  it('captured fetchMembers callback returns early when selectedOrg becomes null', async () => {
    // Render with org=null so the captured `useCallback` instance binds to a
    // null `selectedOrg`. Then invoke the captured function directly to hit
    // the `if (!selectedOrg) return;` guard inside the async body.
    mocks.state.account.selectedOrg = null;
    render();
    expect(mocks.capturedCallback).toBeTypeOf('function');
    mocks.axiosPost.mockClear();
    mocks.axiosGet.mockClear();
    mocks.setLoadingSpy.mockClear();
    await mocks.capturedCallback!();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
    expect(mocks.axiosGet).not.toHaveBeenCalled();
    expect(mocks.setLoadingSpy).not.toHaveBeenCalled();
  });

  it('issues POST /users + GET /users/invitations with the org id', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: [] });
    mocks.axiosGet.mockResolvedValueOnce({ data: [] });
    render();
    await flush();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/users', { targetOrganisationId: 'org-1' });
    expect(mocks.axiosGet).toHaveBeenCalledWith('/users/invitations?organisationId=org-1');
    expect(mocks.setLoadingSpy).toHaveBeenCalledWith(true);
    expect(mocks.setLoadingSpy).toHaveBeenLastCalledWith(false);
  });

  it('maps array-shape members response into TeamMember rows', async () => {
    mocks.axiosPost.mockResolvedValueOnce({
      data: [
        { id: 'a', email: 'a@example.com', name: 'Alice', role: 'ADMIN', lastLogin: '2024-01-01' },
        { id: 'b', email: 'b@example.com', role: null, lastLogin: null },
      ],
    });
    mocks.axiosGet.mockResolvedValueOnce({ data: [{ id: 'i-1' }] });
    render();
    await flush();
    expect(mocks.setMembersSpy).toHaveBeenCalled();
    const callArg = mocks.setMembersSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(callArg).toEqual([
      {
        id: 'a',
        email: 'a@example.com',
        name: 'Alice',
        role: 'admin',
        status: 'Active',
        lastLogin: '2024-01-01',
      },
      {
        id: 'b',
        email: 'b@example.com',
        name: 'b@example.com',
        role: 'member',
        status: 'Active',
        lastLogin: null,
      },
    ]);
    expect(mocks.setInvitesSpy).toHaveBeenCalledWith([{ id: 'i-1' }]);
  });

  it('maps items-shape members response into TeamMember rows', async () => {
    mocks.axiosPost.mockResolvedValueOnce({
      data: { items: [{ id: 'a', email: 'a@example.com', name: 'Alice', role: 'ADMIN' }] },
    });
    mocks.axiosGet.mockResolvedValueOnce({ data: [] });
    render();
    await flush();
    const callArg = mocks.setMembersSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(callArg[0].id).toBe('a');
    expect(callArg[0].role).toBe('admin');
  });

  it('falls back to [] when items-shape is missing', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { items: undefined } });
    mocks.axiosGet.mockResolvedValueOnce({ data: [] });
    render();
    await flush();
    expect(mocks.setMembersSpy).toHaveBeenCalledWith([]);
  });

  it('swallows axios errors and still flips loading off', async () => {
    mocks.axiosPost.mockRejectedValueOnce(new Error('boom'));
    mocks.axiosGet.mockRejectedValueOnce(new Error('boom'));
    render();
    await flush();
    expect(mocks.setLoadingSpy).toHaveBeenCalledWith(true);
    expect(mocks.setLoadingSpy).toHaveBeenLastCalledWith(false);
    expect(mocks.setMembersSpy).not.toHaveBeenCalled();
  });
});
