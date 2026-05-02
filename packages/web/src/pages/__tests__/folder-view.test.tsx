/**
 * FolderView — folder hierarchy + create/navigate flows.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl pattern). Hooks
 * (useState/useEffect/useCallback) are patched so loadItems/handleCreate
 * are observable as `mocks.callbacks` and useEffect cbs can be driven
 * test-by-test.
 *
 * Loading semantics: the source initialises `loading=true`, so the
 * first render returns the spinner. To exercise the empty-state and
 * list paths, tests pre-seed slot 1 (loading) to `false` and slot 0
 * (items) with the desired array — same pattern as
 * template-gallery-page.test.tsx.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const stateSlots: unknown[] = [];
  const effects: Array<{ cb: () => void | (() => void); deps: unknown[] }> = [];
  const callbacks: unknown[] = [];
  return {
    stateSlots,
    effects,
    callbacks,
    selectedOrg: { id: 'org-1', name: 'Acme' } as { id: string; name: string } | null,
    navigate: vi.fn(),
    axiosPost: vi.fn(),
    resetUseState: () => {
      stateSlots.length = 0;
    },
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
  const patchedUseCallback = vi.fn((fn: unknown) => {
    mocks.callbacks.push(fn);
    return fn;
  });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useEffect: patchedUseEffect,
    useCallback: patchedUseCallback,
    default: {
      ...actualDefault,
      useState: patchedUseState,
      useEffect: patchedUseEffect,
      useCallback: patchedUseCallback,
    },
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel({ account: { selectedOrg: mocks.selectedOrg } }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@ui/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Note: the i18n mock above ignores vars, so `t('folder.cards', { count: N })`
// returns just `'folder.cards'` — assertions key off the bare key.

vi.mock('@ui/shared/api/axios-instance', () => ({
  default: { post: (...args: unknown[]) => mocks.axiosPost(...args) },
}));

import { FolderView } from '../folder-view';

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

function render(props: {
  folderId?: string | null;
  folderName?: string;
  basePath?: string;
} = {}): React.ReactElement | null {
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx();
  const FC = FolderView as unknown as (p: {
    folderId: string | null;
    folderName: string;
    basePath?: string;
  }) => React.ReactElement | null;
  return FC({
    folderId: props.folderId ?? null,
    folderName: props.folderName ?? 'Root',
    basePath: props.basePath,
  });
}

beforeEach(() => {
  mocks.resetUseState();
  mocks.effects.length = 0;
  mocks.callbacks.length = 0;
  mocks.navigate.mockReset();
  mocks.axiosPost.mockReset();
  mocks.selectedOrg = { id: 'org-1', name: 'Acme' };
});

// ─── Loading state ────────────────────────────────────────────────────────

describe('FolderView — loading', () => {
  it('renders a spinner before items load', () => {
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

// ─── Header buttons ───────────────────────────────────────────────────────

describe('FolderView — header', () => {
  it('renders the folderName as the h1 heading', () => {
    mocks.stateSlots.push([], false); // items, loading
    const tree = render({ folderName: 'My Folder' });
    const h1 = findByPredicate(tree, (el) => el.type === 'h1')[0];
    expect((h1.props as { children: unknown }).children).toBe('My Folder');
  });

  it('renders both create-project and create-folder buttons by id', () => {
    mocks.stateSlots.push([], false);
    const tree = render();
    const projectBtn = findByPredicate(
      tree,
      (el) => (el.props as { id?: string }).id === 'ice-folder-btn-create-project',
    );
    const folderBtn = findByPredicate(
      tree,
      (el) => (el.props as { id?: string }).id === 'ice-folder-btn-create-folder',
    );
    expect(projectBtn).toHaveLength(1);
    expect(folderBtn).toHaveLength(1);
  });
});

// ─── Empty states ─────────────────────────────────────────────────────────

describe('FolderView — empty state', () => {
  it('shows the noProjects copy at the root (folderId=null)', () => {
    mocks.stateSlots.push([], false);
    const tree = render({ folderId: null });
    const labels = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'folder.noProjects',
    );
    expect(labels).toHaveLength(1);
  });

  it('shows the emptyFolder copy when inside a folder (folderId set)', () => {
    mocks.stateSlots.push([], false);
    const tree = render({ folderId: 'fld-1' });
    const labels = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'folder.emptyFolder',
    );
    expect(labels).toHaveLength(1);
  });
});

// ─── List rendering ───────────────────────────────────────────────────────

describe('FolderView — list rendering', () => {
  // Source mutates the array via .sort(), so each test owns its own copy.
  const fresh = () => [
    { id: 'p1', name: 'Banana', slug: 'banana', type: 'project', parent_id: null, cards: [{ id: 'c1' }, { id: 'c2' }] },
    { id: 'f1', name: 'Apple', slug: 'apple', type: 'folder', parent_id: null, cards: [] },
    { id: 'p2', name: 'Cherry', slug: 'cherry', type: 'project', parent_id: null, cards: [] },
  ];

  it('sorts folders before projects, then alphabetically', () => {
    mocks.stateSlots.push(fresh(), false);
    const tree = render();
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('hover:bg-ice-hover') &&
        (el.props as { onClick?: unknown }).onClick !== undefined &&
        (el.props as { id?: string }).id === undefined,
    );
    expect(buttons.length).toBe(3);
    // first child of each row is the icon, second is the <span>name</span>
    const names = buttons.map((b) => {
      const children = (b.props as { children: unknown[] }).children;
      // children[1] is the name <span>
      const nameSpan = children[1] as React.ReactElement;
      return (nameSpan.props as { children: string }).children;
    });
    expect(names).toEqual(['Apple', 'Banana', 'Cherry']);
  });

  it('renders the cards count i18n with count when item is a project', () => {
    const items = fresh();
    mocks.stateSlots.push([items[0]], false);
    const tree = render();
    const labels = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('ml-auto'),
    );
    expect(labels).toHaveLength(1);
    // The mocked t() returns the key verbatim
    expect((labels[0].props as { children: unknown }).children).toBe('folder.cards');
  });

  it('renders the typeFolder label for a folder item', () => {
    const items = fresh();
    mocks.stateSlots.push([items[1]], false);
    const tree = render();
    const labels = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('ml-auto'),
    );
    expect((labels[0].props as { children: unknown }).children).toBe('folder.typeFolder');
  });

  it('handles cards being undefined (defaults count to 0)', () => {
    const itemNoCards = {
      id: 'p3',
      name: 'NoCards',
      slug: 'nocards',
      type: 'project',
      parent_id: null,
      cards: undefined as unknown as { id: string }[],
    };
    mocks.stateSlots.push([itemNoCards], false);
    // shouldn't throw on render
    expect(() => render()).not.toThrow();
  });
});

// ─── Click → navigate ─────────────────────────────────────────────────────

describe('FolderView — handleClick', () => {
  it('navigates with basePath joined to item.slug', () => {
    const item = { id: 'p1', name: 'P', slug: 'banana', type: 'project', parent_id: null, cards: [] };
    mocks.stateSlots.push([item], false);
    const tree = render({ basePath: '/foo' });
    const button = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { id?: string }).id === undefined &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('hover:bg-ice-hover'),
    )[0];
    (button.props as { onClick: () => void }).onClick();
    expect(mocks.navigate).toHaveBeenCalledWith('/foo/banana');
  });

  it('falls back to "" when basePath is omitted, navigating to /<slug>', () => {
    const item = { id: 'p1', name: 'P', slug: 'banana', type: 'project', parent_id: null, cards: [] };
    mocks.stateSlots.push([item], false);
    const tree = render(); // basePath defaults to ''
    const button = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { id?: string }).id === undefined &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('hover:bg-ice-hover'),
    )[0];
    (button.props as { onClick: () => void }).onClick();
    expect(mocks.navigate).toHaveBeenCalledWith('/banana');
  });
});

// ─── loadItems (via useCallback / effect) ────────────────────────────────

describe('FolderView — loadItems', () => {
  it('posts to /canvas/projects with org + parent and stores response', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: [{ id: 'a' }] });
    render({ folderId: 'fld-1' });
    const loadItems = mocks.callbacks[0] as () => Promise<void>;
    await loadItems();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects', {
      organisationId: 'org-1',
      parentId: 'fld-1',
    });
    // slot 0 = items
    expect(mocks.stateSlots[0]).toEqual([{ id: 'a' }]);
  });

  it('returns early without calling axios when selectedOrg is null', async () => {
    mocks.selectedOrg = null;
    render();
    const loadItems = mocks.callbacks[0] as () => Promise<void>;
    await loadItems();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it('clears items to [] when the request rejects', async () => {
    mocks.axiosPost.mockRejectedValueOnce(new Error('500'));
    // pre-seed something into items so we can see it cleared
    mocks.stateSlots.push([{ id: 'preexisting' }], true);
    render();
    const loadItems = mocks.callbacks[0] as () => Promise<void>;
    await loadItems();
    expect(mocks.stateSlots[0]).toEqual([]);
  });
});

// ─── handleCreate ─────────────────────────────────────────────────────────

describe('FolderView — handleCreate', () => {
  it('returns early when selectedOrg is null', async () => {
    mocks.selectedOrg = null;
    // render past the initial loading state so the button is visible
    mocks.stateSlots.push([], false); // slot 0 = items, slot 1 = loading
    const tree = render();
    const projectBtn = findByPredicate(
      tree,
      (el) => (el.props as { id?: string }).id === 'ice-folder-btn-create-project',
    )[0];
    expect(projectBtn).toBeDefined();
    await (projectBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it('posts to /canvas/projects/create for a project, then navigates to its slug', async () => {
    mocks.axiosPost
      .mockResolvedValueOnce({ data: { id: 'p9', slug: 'new-app' } }) // /create
      .mockResolvedValueOnce({ data: [] }); // loadItems re-fetch
    mocks.stateSlots.push([], false);
    const tree = render({ basePath: '/foo' });
    const projectBtn = findByPredicate(
      tree,
      (el) => (el.props as { id?: string }).id === 'ice-folder-btn-create-project',
    )[0];
    await (projectBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.axiosPost.mock.calls[0]).toEqual([
      '/canvas/projects/create',
      {
        name: 'folder.defaultProjectName',
        type: 'project',
        parentId: null,
        organisationId: 'org-1',
      },
    ]);
    expect(mocks.navigate).toHaveBeenCalledWith('/foo/new-app');
  });

  it('does NOT navigate when create is for a folder (no slug-navigation)', async () => {
    mocks.axiosPost
      .mockResolvedValueOnce({ data: { id: 'f9', slug: 'new-folder' } })
      .mockResolvedValueOnce({ data: [] });
    mocks.stateSlots.push([], false);
    const tree = render();
    const folderBtn = findByPredicate(
      tree,
      (el) => (el.props as { id?: string }).id === 'ice-folder-btn-create-folder',
    )[0];
    await (folderBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.axiosPost.mock.calls[0][1]).toMatchObject({ type: 'folder', name: 'folder.defaultFolderName' });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when project create response omits slug', async () => {
    mocks.axiosPost
      .mockResolvedValueOnce({ data: { id: 'p9' /* no slug */ } })
      .mockResolvedValueOnce({ data: [] });
    mocks.stateSlots.push([], false);
    const tree = render();
    const projectBtn = findByPredicate(
      tree,
      (el) => (el.props as { id?: string }).id === 'ice-folder-btn-create-project',
    )[0];
    await (projectBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when project create response has no data field', async () => {
    mocks.axiosPost.mockResolvedValueOnce({}).mockResolvedValueOnce({ data: [] });
    mocks.stateSlots.push([], false);
    const tree = render();
    const projectBtn = findByPredicate(
      tree,
      (el) => (el.props as { id?: string }).id === 'ice-folder-btn-create-project',
    )[0];
    await (projectBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('logs and stays on page when /create rejects', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.axiosPost.mockRejectedValueOnce(new Error('500'));
    mocks.stateSlots.push([], false);
    const tree = render();
    const projectBtn = findByPredicate(
      tree,
      (el) => (el.props as { id?: string }).id === 'ice-folder-btn-create-project',
    )[0];
    await (projectBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(errSpy).toHaveBeenCalledWith('Failed to create:', expect.any(Error));
    expect(mocks.navigate).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ─── Mount effect ─────────────────────────────────────────────────────────

describe('FolderView — mount effect', () => {
  it('drives loadItems via useEffect on mount', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: [{ id: 'x' }] });
    render();
    // useEffect cb invokes loadItems
    expect(mocks.effects).toHaveLength(1);
    await mocks.effects[0].cb();
    expect(mocks.axiosPost).toHaveBeenCalled();
  });
});
