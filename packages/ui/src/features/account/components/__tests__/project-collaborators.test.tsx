/**
 * Tests for `ProjectCollaborators` — manage project member access.
 *
 * Strategy:
 *  - Direct-FC tree-walker pattern.
 *  - `useState` mocked via slot-by-call-index (6 slots: members, orgMembers,
 *    loading, showAdd, addUserId, addRole, adding).
 *  - `useEffect` mocked to fire callbacks synchronously so mount-side fetch
 *    fires inside the FC body.
 *  - `useCallback` is identity passthrough — the captured callback is the
 *    actual function under test.
 *  - `react-redux.useSelector` reads from a hoisted `state.account`.
 *  - `axiosInstance.post` returns test-controlled response/error.
 *  - `useTranslation` returns identity-key `t`.
 *  - `cn` returns a joined string.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  // useState slots in source order:
  //   0=members ([]), 1=orgMembers ([]), 2=loading (true),
  //   3=showAdd (false), 4=addUserId (''), 5=addRole ('editor'), 6=adding (false)
  membersRef: { current: [] as Array<Record<string, unknown>> },
  orgMembersRef: { current: [] as Array<Record<string, unknown>> },
  loadingRef: { current: true as boolean },
  showAddRef: { current: false as boolean },
  addUserIdRef: { current: '' as string },
  addRoleRef: { current: 'editor' as string },
  addingRef: { current: false as boolean },
  setMembersSpy: vi.fn(),
  setOrgMembersSpy: vi.fn(),
  setLoadingSpy: vi.fn(),
  setShowAddSpy: vi.fn(),
  setAddUserIdSpy: vi.fn(),
  setAddRoleSpy: vi.fn(),
  setAddingSpy: vi.fn(),
  // useEffect / useCallback
  effectCallbacks: [] as Array<() => void | Promise<void>>,
  effectDeps: [] as unknown[][],
  capturedCallbacks: [] as Array<(...args: unknown[]) => unknown>,
  // Redux state
  state: {
    account: {
      user: { id: 'user-1', email: 'me@example.com', name: 'Me' } as { id: string; email: string; name: string } | null,
      selectedOrg: { id: 'org-1', name: 'Acme', role: 'admin' } as { id: string; name: string; role: string } | null,
    },
  },
  // axios
  axiosPost: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let useStateIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    useStateIdx = 0;
  };
  const dispatch = [
    () => [mocks.membersRef.current, mocks.setMembersSpy] as const,
    () => [mocks.orgMembersRef.current, mocks.setOrgMembersSpy] as const,
    () => [mocks.loadingRef.current, mocks.setLoadingSpy] as const,
    () => [mocks.showAddRef.current, mocks.setShowAddSpy] as const,
    () => [mocks.addUserIdRef.current, mocks.setAddUserIdSpy] as const,
    () => [mocks.addRoleRef.current, mocks.setAddRoleSpy] as const,
    () => [mocks.addingRef.current, mocks.setAddingSpy] as const,
  ];
  const useStateStub = <T,>(): [T, (v: T) => void] => {
    const slot = dispatch[useStateIdx] ?? dispatch[dispatch.length - 1];
    useStateIdx += 1;
    return slot() as unknown as [T, (v: T) => void];
  };
  const useEffectStub = (cb: () => void | Promise<void>, deps?: unknown[]): void => {
    mocks.effectCallbacks.push(cb);
    mocks.effectDeps.push(deps ?? []);
    void cb();
  };
  const useCallbackStub = <T extends (...args: never[]) => unknown>(fn: T): T => {
    mocks.capturedCallbacks.push(fn as unknown as (...args: unknown[]) => unknown);
    return fn;
  };
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: useStateStub,
    useEffect: useEffectStub,
    useCallback: useCallbackStub,
    default: {
      ...actualDefault,
      useState: useStateStub,
      useEffect: useEffectStub,
      useCallback: useCallbackStub,
    },
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: { post: mocks.axiosPost },
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

import { ProjectCollaborators } from '../project-collaborators';

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

const flush = async (): Promise<void> => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

const render = (props: { projectId: string }): unknown => {
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  return (ProjectCollaborators as unknown as (p: { projectId: string }) => unknown)(props);
};

// ─── Per-test reset ─────────────────────────────────────────────────────────
beforeEach(() => {
  mocks.membersRef.current = [];
  mocks.orgMembersRef.current = [];
  mocks.loadingRef.current = true;
  mocks.showAddRef.current = false;
  mocks.addUserIdRef.current = '';
  mocks.addRoleRef.current = 'editor';
  mocks.addingRef.current = false;
  mocks.setMembersSpy.mockReset();
  mocks.setOrgMembersSpy.mockReset();
  mocks.setLoadingSpy.mockReset();
  mocks.setShowAddSpy.mockReset();
  mocks.setAddUserIdSpy.mockReset();
  mocks.setAddRoleSpy.mockReset();
  mocks.setAddingSpy.mockReset();
  mocks.effectCallbacks = [];
  mocks.effectDeps = [];
  mocks.capturedCallbacks = [];
  mocks.axiosPost.mockReset();
  mocks.state.account.user = { id: 'user-1', email: 'me@example.com', name: 'Me' };
  mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'admin' };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProjectCollaborators — loading state', () => {
  it('renders a spinner when loading=true', () => {
    mocks.loadingRef.current = true;
    const tree = render({ projectId: 'p-1' });
    const spinners = findAll(tree, (el) => {
      const cn = el.props.className;
      return typeof cn === 'string' && cn.includes('animate-spin');
    });
    expect(spinners.length).toBeGreaterThan(0);
  });

  it('does not render the title when loading', () => {
    mocks.loadingRef.current = true;
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    expect(text).not.toContain('account.collaborators.title');
  });
});

describe('ProjectCollaborators — header section', () => {
  beforeEach(() => {
    mocks.loadingRef.current = false;
  });

  it('renders the title and member count copy', () => {
    mocks.membersRef.current = [
      { userId: 'a', email: 'a@x.com', name: 'A', avatar: null, role: 'editor', grantedAt: '' },
    ];
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    expect(text).toContain('account.collaborators.title');
    expect(text).toContain('account.collaborators.memberCount');
  });

  it('renders the count "1 member" without trailing s for a single member', () => {
    mocks.membersRef.current = [
      { userId: 'a', email: 'a@x.com', name: 'A', avatar: null, role: 'editor', grantedAt: '' },
    ];
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    // Member count text contains '1 ' and 'memberCount' but NOT 's' after.
    expect(text).toContain('1 ');
  });

  it('appends "s" suffix when members.length is not 1', () => {
    mocks.membersRef.current = [
      { userId: 'a', email: 'a@x.com', name: 'A', avatar: null, role: 'editor', grantedAt: '' },
      { userId: 'b', email: 'b@x.com', name: 'B', avatar: null, role: 'viewer', grantedAt: '' },
    ];
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    // Look for the "s" suffix as separate child text.
    const allText = text;
    expect(allText.includes('s')).toBe(true);
  });

  it('shows the add-member button when there are available users to add', () => {
    mocks.membersRef.current = [];
    mocks.orgMembersRef.current = [{ id: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'member' }];
    const tree = render({ projectId: 'p-1' });
    const addBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('text-ice-accent'),
    );
    expect(addBtn).toBeDefined();
    expect(collectText(addBtn)).toContain('account.collaborators.addMember');
  });

  it('hides the add-member button when no org members are available to add', () => {
    mocks.orgMembersRef.current = [];
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    expect(text).not.toContain('account.collaborators.addMember');
  });

  it('hides the add-member button when all org members are already in the project', () => {
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'editor', grantedAt: '' },
    ];
    mocks.orgMembersRef.current = [{ id: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'member' }];
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    expect(text).not.toContain('account.collaborators.addMember');
  });

  it('clicking the add-member button toggles showAdd state', () => {
    mocks.membersRef.current = [];
    mocks.orgMembersRef.current = [{ id: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'member' }];
    const tree = render({ projectId: 'p-1' });
    const addBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('text-ice-accent'),
    );
    (addBtn!.props.onClick as () => void)();
    expect(mocks.setShowAddSpy).toHaveBeenCalledWith(true);
  });

  it('clicking the add-member button when showAdd=true toggles to false', () => {
    mocks.membersRef.current = [];
    mocks.orgMembersRef.current = [{ id: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'member' }];
    mocks.showAddRef.current = true;
    const tree = render({ projectId: 'p-1' });
    const addBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('text-ice-accent'),
    );
    (addBtn!.props.onClick as () => void)();
    expect(mocks.setShowAddSpy).toHaveBeenCalledWith(false);
  });
});

describe('ProjectCollaborators — add member form', () => {
  beforeEach(() => {
    mocks.loadingRef.current = false;
    mocks.showAddRef.current = true;
    mocks.orgMembersRef.current = [
      { id: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'member' },
      { id: 'u-3', email: 'c@x.com', name: 'Carol', avatar: null, role: 'member' },
    ];
  });

  it('does not render the form when showAdd=false', () => {
    mocks.showAddRef.current = false;
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    expect(text).not.toContain('account.collaborators.teamMemberLabel');
  });

  it('renders the team-member label and select when showAdd=true', () => {
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    expect(text).toContain('account.collaborators.teamMemberLabel');
    expect(text).toContain('account.collaborators.selectMember');
  });

  it('renders one option per available member with "name (email)"', () => {
    const tree = render({ projectId: 'p-1' });
    const options = findAll(tree, (el) => el.type === 'option');
    // 1 placeholder + 2 members = 3
    expect(options).toHaveLength(3);
    expect(options[0].props.value).toBe('');
    expect(options[1].props.value).toBe('u-2');
    expect(options[2].props.value).toBe('u-3');
  });

  it('changing the user select calls setAddUserId with selected value', () => {
    const tree = render({ projectId: 'p-1' });
    const sel = findFirst(tree, (el) => el.type === 'select')!;
    (sel.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: 'u-2' },
    });
    expect(mocks.setAddUserIdSpy).toHaveBeenCalledWith('u-2');
  });

  it('renders three role buttons (owner, editor, viewer)', () => {
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    expect(text).toContain('common.roles.owner');
    expect(text).toContain('common.roles.editor');
    expect(text).toContain('common.roles.viewer');
  });

  it('clicking a role button calls setAddRole with the role value', () => {
    const tree = render({ projectId: 'p-1' });
    // Role buttons live inside the add-form container; filter by class fragment
    // unique to them.
    const roleButtons = findAll(
      tree,
      (el) =>
        el.type === 'button' &&
        el.props.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('items-center gap-2 px-3 py-2 rounded-md border'),
    );
    expect(roleButtons.length).toBe(3);
    // Order: owner, editor, viewer
    (roleButtons[0].props.onClick as () => void)();
    expect(mocks.setAddRoleSpy).toHaveBeenCalledWith('owner');
    (roleButtons[2].props.onClick as () => void)();
    expect(mocks.setAddRoleSpy).toHaveBeenCalledWith('viewer');
  });

  it('selected role button uses the active border-ice-accent class', () => {
    mocks.addRoleRef.current = 'owner';
    const tree = render({ projectId: 'p-1' });
    const roleButtons = findAll(
      tree,
      (el) =>
        el.type === 'button' &&
        el.props.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('items-center gap-2 px-3 py-2 rounded-md border'),
    );
    expect(roleButtons[0].props.className).toContain('border-ice-accent');
    // Non-selected (editor) should NOT contain 'border-ice-accent' but should
    // contain 'border-ice-border'.
    expect(roleButtons[1].props.className).toContain('border-ice-border');
    expect(roleButtons[1].props.className).not.toContain('border-ice-accent bg-ice-accent/5');
  });

  it('clicking the cancel button toggles showAdd off', () => {
    const tree = render({ projectId: 'p-1' });
    const cancelBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.children === 'account.collaborators.cancelButton',
    );
    expect(cancelBtn).toBeDefined();
    (cancelBtn!.props.onClick as () => void)();
    expect(mocks.setShowAddSpy).toHaveBeenCalledWith(false);
  });

  it('the Add button is disabled when addUserId is empty', () => {
    mocks.addUserIdRef.current = '';
    const tree = render({ projectId: 'p-1' });
    // Add button has class 'ice-btn-primary'.
    const addBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('ice-btn-primary'),
    );
    expect(addBtn!.props.disabled).toBe(true);
  });

  it('the Add button is enabled when addUserId is set', () => {
    mocks.addUserIdRef.current = 'u-2';
    const tree = render({ projectId: 'p-1' });
    const addBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('ice-btn-primary'),
    );
    expect(addBtn!.props.disabled).toBe(false);
  });

  it('the Add button is disabled while adding=true', () => {
    mocks.addUserIdRef.current = 'u-2';
    mocks.addingRef.current = true;
    const tree = render({ projectId: 'p-1' });
    const addBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('ice-btn-primary'),
    );
    expect(addBtn!.props.disabled).toBe(true);
  });

  it('shows a spinner inside the Add button when adding=true', () => {
    mocks.addUserIdRef.current = 'u-2';
    mocks.addingRef.current = true;
    const tree = render({ projectId: 'p-1' });
    const addBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('ice-btn-primary'),
    )!;
    const spinners = findAll(addBtn, (el) => {
      const cn = el.props.className;
      return typeof cn === 'string' && cn.includes('animate-spin');
    });
    expect(spinners.length).toBeGreaterThan(0);
  });
});

describe('ProjectCollaborators — handleAdd', () => {
  beforeEach(() => {
    mocks.loadingRef.current = false;
    mocks.showAddRef.current = true;
    mocks.orgMembersRef.current = [{ id: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'member' }];
  });

  it('returns early when addUserId is empty (no axios call)', async () => {
    mocks.addUserIdRef.current = '';
    const tree = render({ projectId: 'p-1' });
    const addBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('ice-btn-primary'),
    )!;
    mocks.axiosPost.mockClear();
    await (addBtn.props.onClick as () => Promise<void>)();
    expect(mocks.axiosPost).not.toHaveBeenCalledWith('/project-members/add', expect.anything());
    expect(mocks.setAddingSpy).not.toHaveBeenCalledWith(true);
  });

  it('posts /project-members/add then clears userId, hides form, and refetches', async () => {
    mocks.addUserIdRef.current = 'u-2';
    mocks.addRoleRef.current = 'editor';
    mocks.axiosPost.mockResolvedValue({ data: [] });
    const tree = render({ projectId: 'p-1' });
    const addBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('ice-btn-primary'),
    )!;
    mocks.axiosPost.mockClear();
    mocks.setAddUserIdSpy.mockClear();
    mocks.setShowAddSpy.mockClear();
    await (addBtn.props.onClick as () => Promise<void>)();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/project-members/add', {
      projectId: 'p-1',
      userId: 'u-2',
      role: 'editor',
    });
    expect(mocks.setAddUserIdSpy).toHaveBeenCalledWith('');
    expect(mocks.setShowAddSpy).toHaveBeenCalledWith(false);
    expect(mocks.setAddingSpy).toHaveBeenCalledWith(true);
    expect(mocks.setAddingSpy).toHaveBeenLastCalledWith(false);
  });

  it('swallows axios errors and still flips adding back to false', async () => {
    mocks.addUserIdRef.current = 'u-2';
    mocks.axiosPost.mockRejectedValueOnce(new Error('boom'));
    const tree = render({ projectId: 'p-1' });
    const addBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('ice-btn-primary'),
    )!;
    await expect((addBtn.props.onClick as () => Promise<void>)()).resolves.toBeUndefined();
    expect(mocks.setAddingSpy).toHaveBeenLastCalledWith(false);
  });
});

describe('ProjectCollaborators — member list', () => {
  beforeEach(() => {
    mocks.loadingRef.current = false;
  });

  it('renders one row per member with name + email', () => {
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'editor', grantedAt: '' },
      { userId: 'u-3', email: 'c@x.com', name: 'Carol', avatar: null, role: 'viewer', grantedAt: '' },
    ];
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    expect(text).toContain('Bob');
    expect(text).toContain('b@x.com');
    expect(text).toContain('Carol');
    expect(text).toContain('c@x.com');
  });

  it('renders an avatar <img> when member has avatar URL', () => {
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: '/bob.png', role: 'editor', grantedAt: '' },
    ];
    const tree = render({ projectId: 'p-1' });
    const img = findFirst(tree, (el) => el.type === 'img');
    expect(img).toBeDefined();
    expect(img!.props.src).toBe('/bob.png');
  });

  it('renders the first letter of name when avatar is null', () => {
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'bob', avatar: null, role: 'editor', grantedAt: '' },
    ];
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    expect(text).toContain('B'); // uppercased first letter
  });

  it('marks the current user with a (you) badge', () => {
    mocks.membersRef.current = [
      {
        userId: 'user-1',
        email: 'me@example.com',
        name: 'Me',
        avatar: null,
        role: 'owner',
        grantedAt: '',
      },
    ];
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    expect(text).toContain('account.collaborators.youBadge');
  });

  it('does not mark other users with a (you) badge', () => {
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'editor', grantedAt: '' },
    ];
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    expect(text).not.toContain('account.collaborators.youBadge');
  });

  it('handles a null user (no current-user comparison)', () => {
    mocks.state.account.user = null;
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'editor', grantedAt: '' },
    ];
    const tree = render({ projectId: 'p-1' });
    const text = collectText(tree);
    // Other members should still show the role <select>
    expect(text).toContain('Bob');
    const sel = findFirst(tree, (el) => el.type === 'select' && (el.props.value as string) === 'editor');
    expect(sel).toBeDefined();
  });
});

describe('ProjectCollaborators — role select / read-only role', () => {
  beforeEach(() => {
    mocks.loadingRef.current = false;
  });

  it('renders a role <select> for non-current-user rows', () => {
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'editor', grantedAt: '' },
    ];
    const tree = render({ projectId: 'p-1' });
    // The first <select> in the tree (not in add-form because showAdd=false).
    const sel = findFirst(tree, (el) => el.type === 'select');
    expect(sel).toBeDefined();
    expect(sel!.props.value).toBe('editor');
    const options = findAll(sel, (el) => el.type === 'option');
    expect(options.map((o) => o.props.value)).toEqual(['owner', 'editor', 'viewer']);
  });

  it('renders read-only role text for current user (no select, no remove button)', () => {
    mocks.membersRef.current = [
      {
        userId: 'user-1',
        email: 'me@example.com',
        name: 'Me',
        avatar: null,
        role: 'owner',
        grantedAt: '',
      },
    ];
    const tree = render({ projectId: 'p-1' });
    const sel = findFirst(tree, (el) => el.type === 'select');
    expect(sel).toBeUndefined();
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.collaborators.removeTitle',
    );
    expect(removeBtn).toBeUndefined();
    const text = collectText(tree);
    expect(text).toContain('owner');
  });

  it('changing the role select calls handleRoleChange via axios POST', async () => {
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'editor', grantedAt: '' },
    ];
    mocks.axiosPost.mockResolvedValue({ data: [] });
    const tree = render({ projectId: 'p-1' });
    const sel = findFirst(tree, (el) => el.type === 'select')!;
    mocks.axiosPost.mockClear();
    await (sel.props.onChange as (e: { target: { value: string } }) => Promise<void>)({
      target: { value: 'viewer' },
    });
    expect(mocks.axiosPost).toHaveBeenCalledWith('/project-members/update-role', {
      projectId: 'p-1',
      userId: 'u-2',
      role: 'viewer',
    });
  });

  it('handleRoleChange swallows axios errors', async () => {
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'editor', grantedAt: '' },
    ];
    mocks.axiosPost.mockRejectedValueOnce(new Error('boom'));
    const tree = render({ projectId: 'p-1' });
    const sel = findFirst(tree, (el) => el.type === 'select')!;
    await expect(
      (sel.props.onChange as (e: { target: { value: string } }) => Promise<void>)({
        target: { value: 'viewer' },
      }),
    ).resolves.toBeUndefined();
  });
});

describe('ProjectCollaborators — remove member', () => {
  beforeEach(() => {
    mocks.loadingRef.current = false;
  });

  it('renders a remove (Trash2) button for non-self', () => {
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'editor', grantedAt: '' },
    ];
    const tree = render({ projectId: 'p-1' });
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.collaborators.removeTitle',
    );
    expect(removeBtn).toBeDefined();
  });

  it('clicking the remove button posts /project-members/remove and refetches', async () => {
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'editor', grantedAt: '' },
    ];
    mocks.axiosPost.mockResolvedValue({ data: [] });
    const tree = render({ projectId: 'p-1' });
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.collaborators.removeTitle',
    )!;
    mocks.axiosPost.mockClear();
    await (removeBtn.props.onClick as () => Promise<void>)();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/project-members/remove', {
      projectId: 'p-1',
      userId: 'u-2',
    });
  });

  it('handleRemove swallows axios errors', async () => {
    mocks.membersRef.current = [
      { userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'editor', grantedAt: '' },
    ];
    mocks.axiosPost.mockRejectedValueOnce(new Error('boom'));
    const tree = render({ projectId: 'p-1' });
    const removeBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props.title as string) === 'account.collaborators.removeTitle',
    )!;
    await expect((removeBtn.props.onClick as () => Promise<void>)()).resolves.toBeUndefined();
  });
});

describe('ProjectCollaborators — fetchMembers (mount-side useEffect)', () => {
  it('issues POST /project-members/list with projectId and sets members', async () => {
    mocks.axiosPost.mockResolvedValueOnce({
      data: [{ userId: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'editor' }],
    });
    // Second call is the org-members fetch
    mocks.axiosPost.mockResolvedValueOnce({ data: { items: [] } });
    render({ projectId: 'p-9' });
    await flush();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/project-members/list', { projectId: 'p-9' });
    expect(mocks.setMembersSpy).toHaveBeenCalled();
    expect(mocks.setLoadingSpy).toHaveBeenCalledWith(false);
  });

  it('swallows fetchMembers axios errors and still flips loading off', async () => {
    mocks.axiosPost.mockRejectedValueOnce(new Error('boom'));
    mocks.axiosPost.mockResolvedValueOnce({ data: { items: [] } });
    render({ projectId: 'p-1' });
    await flush();
    expect(mocks.setLoadingSpy).toHaveBeenCalledWith(false);
    expect(mocks.setMembersSpy).not.toHaveBeenCalled();
  });

  it('issues POST /users for the org members fetch', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: [] });
    mocks.axiosPost.mockResolvedValueOnce({
      data: { items: [{ id: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'member' }] },
    });
    render({ projectId: 'p-1' });
    await flush();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/users', {
      targetOrganisationId: 'org-1',
      limit: 100,
    });
    expect(mocks.setOrgMembersSpy).toHaveBeenCalledWith([
      { id: 'u-2', email: 'b@x.com', name: 'Bob', avatar: null, role: 'member' },
    ]);
  });

  it('returns early on org-members fetch when selectedOrg is null', async () => {
    mocks.state.account.selectedOrg = null;
    mocks.axiosPost.mockResolvedValueOnce({ data: [] });
    render({ projectId: 'p-1' });
    await flush();
    // Only the project-members POST should fire — not /users.
    expect(mocks.axiosPost).toHaveBeenCalledWith('/project-members/list', { projectId: 'p-1' });
    expect(mocks.axiosPost).not.toHaveBeenCalledWith('/users', expect.anything());
  });

  it('swallows fetchOrgMembers axios errors silently', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: [] });
    mocks.axiosPost.mockRejectedValueOnce(new Error('users boom'));
    render({ projectId: 'p-1' });
    await flush();
    expect(mocks.setOrgMembersSpy).not.toHaveBeenCalled();
  });
});
