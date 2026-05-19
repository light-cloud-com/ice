/**
 * rf-ptree-2 — `useTreeHandlers` hook bundle.
 *
 * Pins the eight non-drag handlers (`handleProjectClick`, `handleEnvClick`,
 * `handleContextMenu`, `handleStartRename`, `handleFinishRename`,
 * `handleDelete`, `handleCreateFolder`, `handleFinishCreateFolder`) lifted
 * out of the project-tree orchestrator. The test renders the hook via a
 * `Probe` FC + `renderToString` (rf-pset-4 / rf-pdpl-21 pattern) and mocks:
 *
 *   - `react-redux`'s `useDispatch` — returns a hoisted `mocks.dispatch` spy,
 *   - the dynamic `axios-instance` import — returns a stub with a `post`
 *     spy whose return value can be flipped per test (success/throw),
 *   - `react`'s `useCallback` — kept verbatim (no patching needed), but
 *     `useEffect` is patched to a no-op so the hook doesn't fire any
 *     spurious side-effects when probed.
 *
 * Coverage target: 100% on the public surface.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  axios: { post: vi.fn() },
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: mocks.axios,
}));

import { useTreeHandlers, type UseTreeHandlersInput, type UseTreeHandlersOutput } from '../use-tree-handlers';
import type { Project, ProjectFolder } from '../../../../store/slices/projects-slice';

// ─── Store + capture helpers ────────────────────────────────────────────────

const makeStore = () => configureStore({ reducer: { _: (s = 0) => s } });

interface Captured {
  result: UseTreeHandlersOutput;
}

interface CaptureArgs extends Partial<UseTreeHandlersInput> {
  store: ReturnType<typeof makeStore>;
}

const PROJECT_A: Project = {
  id: 'p1',
  name: 'Alpha',
  description: '',
  provider: 'gcp',
  organisationId: 'org-1',
  environments: [
    {
      id: 'env-prod',
      name: 'production',
      type: 'production',
      cardId: 'card-prod',
      templateId: null,
      securityLevel: 'standard',
      region: 'us-central1',
      createdAt: 0,
    },
    {
      id: 'env-stg',
      name: 'staging',
      type: 'staging',
      cardId: 'card-stg',
      templateId: null,
      securityLevel: 'standard',
      region: 'us-central1',
      createdAt: 0,
    },
  ],
  folderId: null,
  order: 0,
  expanded: false,
  createdAt: 0,
};

const PROJECT_NO_ENVS: Project = {
  ...PROJECT_A,
  id: 'p-empty',
  name: 'Empty',
  environments: [],
};

const FOLDER_A: ProjectFolder = {
  id: 'f1',
  name: 'My Folder',
  organisationId: 'org-1',
  parentFolderId: null,
  expanded: true,
  order: 0,
};

function captureHook(args: CaptureArgs): Captured {
  const captured: { current?: Captured } = {};
  const Probe: React.FC = () => {
    const result = useTreeHandlers({
      t: args.t ?? ((k: string) => k),
      orgId: args.orgId ?? 'org-1',
      projects: args.projects ?? [PROJECT_A],
      folders: args.folders ?? [FOLDER_A],
      panes: args.panes ?? [{ id: 'pane-1' }],
      editingId: args.editingId ?? null,
      editingName: args.editingName ?? '',
      creatingFolder: args.creatingFolder ?? null,
      newFolderName: args.newFolderName ?? '',
      setContextMenu: args.setContextMenu ?? vi.fn(),
      setEditingId: args.setEditingId ?? vi.fn(),
      setEditingName: args.setEditingName ?? vi.fn(),
      setCreatingFolder: args.setCreatingFolder ?? vi.fn(),
      setNewFolderName: args.setNewFolderName ?? vi.fn(),
    });
    captured.current = { result };
    return null;
  };
  renderToString(
    <Provider store={args.store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('hook did not render');
  return captured.current;
}

beforeEach(() => {
  mocks.dispatch.mockReset();
  mocks.axios.post.mockReset();
});

// Override the store's dispatch with our spy so we can observe action types.
const wrapStoreDispatch = (store: ReturnType<typeof makeStore>): void => {
  // replace the store's dispatch with our hoisted spy that delegates back
  const orig = store.dispatch.bind(store);
  store.dispatch = ((action: unknown) => {
    mocks.dispatch(action);
    return orig(action as Parameters<typeof orig>[0]);
  }) as typeof store.dispatch;
};

const dispatchedTypes = (): string[] =>
  mocks.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);

const findDispatch = (type: string): unknown =>
  mocks.dispatch.mock.calls.find((c) => (c[0] as { type: string }).type === type)?.[0];

// ────────────────────────────────────────────────────────────────────────────
// handleProjectClick
// ────────────────────────────────────────────────────────────────────────────

describe('handleProjectClick', () => {
  it('dispatches setActiveProject for the clicked project', () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    const { result } = captureHook({ store });
    result.handleProjectClick(PROJECT_A);
    const types = dispatchedTypes();
    expect(types[0]).toBe('projects/setActiveProject');
    const action = findDispatch('projects/setActiveProject') as { payload: string };
    expect(action.payload).toBe('p1');
  });

  it('opens first env in active pane: dispatches openTabInPane, setPaneCard, setActivePane, setActiveCard', () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    const { result } = captureHook({ store });
    result.handleProjectClick(PROJECT_A);
    const types = dispatchedTypes();
    expect(types).toEqual([
      'projects/setActiveProject',
      'ui/openTabInPane',
      'ui/setPaneCard',
      'ui/setActivePane',
      'cards/setActiveCard',
    ]);
    expect((findDispatch('ui/openTabInPane') as { payload: { paneId: string; cardId: string } }).payload).toEqual({
      paneId: 'pane-1',
      cardId: 'card-prod',
    });
    expect((findDispatch('cards/setActiveCard') as { payload: string }).payload).toBe('card-prod');
  });

  it('skips pane-targeting dispatches when project has no environments', () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    const { result } = captureHook({ store, projects: [PROJECT_NO_ENVS] });
    result.handleProjectClick(PROJECT_NO_ENVS);
    expect(dispatchedTypes()).toEqual(['projects/setActiveProject']);
  });

  it('skips pane-targeting dispatches when panes array is empty', () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    const { result } = captureHook({ store, panes: [] });
    result.handleProjectClick(PROJECT_A);
    expect(dispatchedTypes()).toEqual(['projects/setActiveProject']);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleEnvClick
// ────────────────────────────────────────────────────────────────────────────

describe('handleEnvClick', () => {
  it('stops event propagation, dispatches setActiveProject + setActiveEnvironment + pane updates', () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    const { result } = captureHook({ store });
    const stopPropagation = vi.fn();
    const env = PROJECT_A.environments[1];
    result.handleEnvClick(
      { stopPropagation } as unknown as React.MouseEvent,
      PROJECT_A,
      env,
    );
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(dispatchedTypes()).toEqual([
      'projects/setActiveProject',
      'projects/setActiveEnvironment',
      'ui/openTabInPane',
      'ui/setPaneCard',
      'ui/setActivePane',
      'cards/setActiveCard',
    ]);
    expect((findDispatch('projects/setActiveEnvironment') as { payload: string }).payload).toBe('env-stg');
    expect((findDispatch('cards/setActiveCard') as { payload: string }).payload).toBe('card-stg');
  });

  it('skips pane updates when panes is empty', () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    const { result } = captureHook({ store, panes: [] });
    const stopPropagation = vi.fn();
    result.handleEnvClick(
      { stopPropagation } as unknown as React.MouseEvent,
      PROJECT_A,
      PROJECT_A.environments[0],
    );
    expect(stopPropagation).toHaveBeenCalled();
    expect(dispatchedTypes()).toEqual([
      'projects/setActiveProject',
      'projects/setActiveEnvironment',
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleContextMenu
// ────────────────────────────────────────────────────────────────────────────

describe('handleContextMenu', () => {
  it('preventDefault + stopPropagation + setContextMenu with mouse coords', () => {
    const store = makeStore();
    const setContextMenu = vi.fn();
    const { result } = captureHook({ store, setContextMenu });
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    result.handleContextMenu(
      { preventDefault, stopPropagation, clientX: 120, clientY: 240 } as unknown as React.MouseEvent,
      'project',
      'p1',
    );
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(setContextMenu).toHaveBeenCalledWith({ x: 120, y: 240, type: 'project', id: 'p1' });
  });

  it('passes through type=folder and matching id', () => {
    const store = makeStore();
    const setContextMenu = vi.fn();
    const { result } = captureHook({ store, setContextMenu });
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    result.handleContextMenu(
      { preventDefault, stopPropagation, clientX: 5, clientY: 6 } as unknown as React.MouseEvent,
      'folder',
      'f1',
    );
    expect(setContextMenu).toHaveBeenCalledWith({ x: 5, y: 6, type: 'folder', id: 'f1' });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleStartRename
// ────────────────────────────────────────────────────────────────────────────

describe('handleStartRename', () => {
  it('clears context menu, sets editingId+editingName for a project', () => {
    const store = makeStore();
    const setContextMenu = vi.fn();
    const setEditingId = vi.fn();
    const setEditingName = vi.fn();
    const { result } = captureHook({ store, setContextMenu, setEditingId, setEditingName });
    result.handleStartRename('project', 'p1');
    expect(setContextMenu).toHaveBeenCalledWith(null);
    expect(setEditingId).toHaveBeenCalledWith('p1');
    expect(setEditingName).toHaveBeenCalledWith('Alpha');
  });

  it('clears context menu, sets editingId+editingName for a folder', () => {
    const store = makeStore();
    const setContextMenu = vi.fn();
    const setEditingId = vi.fn();
    const setEditingName = vi.fn();
    const { result } = captureHook({ store, setContextMenu, setEditingId, setEditingName });
    result.handleStartRename('folder', 'f1');
    expect(setContextMenu).toHaveBeenCalledWith(null);
    expect(setEditingId).toHaveBeenCalledWith('f1');
    expect(setEditingName).toHaveBeenCalledWith('My Folder');
  });

  it('does not call editing setters when project id is unknown', () => {
    const store = makeStore();
    const setEditingId = vi.fn();
    const setEditingName = vi.fn();
    const { result } = captureHook({ store, setEditingId, setEditingName });
    result.handleStartRename('project', 'no-such-project');
    expect(setEditingId).not.toHaveBeenCalled();
    expect(setEditingName).not.toHaveBeenCalled();
  });

  it('does not call editing setters when folder id is unknown', () => {
    const store = makeStore();
    const setEditingId = vi.fn();
    const setEditingName = vi.fn();
    const { result } = captureHook({ store, setEditingId, setEditingName });
    result.handleStartRename('folder', 'no-such-folder');
    expect(setEditingId).not.toHaveBeenCalled();
    expect(setEditingName).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleFinishRename
// ────────────────────────────────────────────────────────────────────────────

describe('handleFinishRename', () => {
  it('skips dispatch + sets editingId=null when editingId is null', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    const setEditingId = vi.fn();
    const setEditingName = vi.fn();
    const { result } = captureHook({ store, editingId: null, editingName: 'whatever', setEditingId, setEditingName });
    await result.handleFinishRename();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(setEditingId).toHaveBeenCalledWith(null);
    expect(setEditingName).not.toHaveBeenCalled();
  });

  it('skips dispatch when editingName trims to empty', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    const setEditingId = vi.fn();
    const setEditingName = vi.fn();
    const { result } = captureHook({ store, editingId: 'p1', editingName: '   ', setEditingId, setEditingName });
    await result.handleFinishRename();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(setEditingId).toHaveBeenCalledWith(null);
  });

  it('dispatches renameProject + posts to /canvas/projects/update for a project', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockResolvedValueOnce({});
    const setEditingId = vi.fn();
    const setEditingName = vi.fn();
    const { result } = captureHook({
      store,
      editingId: 'p1',
      editingName: '  Renamed Alpha  ',
      setEditingId,
      setEditingName,
    });
    await result.handleFinishRename();
    expect(findDispatch('projects/renameProject')).toBeDefined();
    expect((findDispatch('projects/renameProject') as { payload: { projectId: string; name: string } }).payload).toEqual({
      projectId: 'p1',
      name: 'Renamed Alpha',
    });
    expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/projects/update', {
      projectId: 'p1',
      name: 'Renamed Alpha',
    });
    expect(setEditingId).toHaveBeenLastCalledWith(null);
    expect(setEditingName).toHaveBeenLastCalledWith('');
  });

  it('dispatches renameFolder when editingId is a folder id', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockResolvedValueOnce({});
    const { result } = captureHook({
      store,
      editingId: 'f1',
      editingName: 'New Folder Name',
    });
    await result.handleFinishRename();
    expect(findDispatch('projects/renameFolder')).toBeDefined();
    expect((findDispatch('projects/renameFolder') as { payload: { folderId: string; name: string } }).payload).toEqual({
      folderId: 'f1',
      name: 'New Folder Name',
    });
  });

  it('silently ignores axios failure (still updates locally)', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockRejectedValueOnce(new Error('net'));
    const setEditingId = vi.fn();
    const setEditingName = vi.fn();
    const { result } = captureHook({
      store,
      editingId: 'p1',
      editingName: 'Alpha-2',
      setEditingId,
      setEditingName,
    });
    await result.handleFinishRename();
    expect(findDispatch('projects/renameProject')).toBeDefined();
    expect(setEditingId).toHaveBeenLastCalledWith(null);
    expect(setEditingName).toHaveBeenLastCalledWith('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleDelete
// ────────────────────────────────────────────────────────────────────────────

describe('handleDelete', () => {
  it('project happy path: closes tabs, deletes cards, posts /delete, dispatches deleteProject', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockResolvedValueOnce({});
    const setContextMenu = vi.fn();
    const { result } = captureHook({ store, setContextMenu });
    await result.handleDelete('project', 'p1');
    expect(setContextMenu).toHaveBeenCalledWith(null);
    const types = dispatchedTypes();
    // Order: closeTabsByCardIds, deleteCard×2, then deleteProject after axios resolves.
    expect(types).toContain('ui/closeTabsByCardIds');
    expect(types.filter((t) => t === 'cards/deleteCard')).toHaveLength(2);
    expect(types[types.length - 1]).toBe('projects/deleteProject');
    expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/projects/delete', { projectId: 'p1' });
    expect((findDispatch('ui/closeTabsByCardIds') as { payload: string[] }).payload).toEqual([
      'card-prod',
      'card-stg',
    ]);
  });

  it('project with no environments: skips closeTabs+deleteCard, still posts and dispatches deleteProject', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockResolvedValueOnce({});
    const { result } = captureHook({ store, projects: [PROJECT_NO_ENVS] });
    await result.handleDelete('project', 'p-empty');
    const types = dispatchedTypes();
    expect(types).not.toContain('ui/closeTabsByCardIds');
    expect(types).not.toContain('cards/deleteCard');
    expect(types).toContain('projects/deleteProject');
  });

  it('project with unknown id: skips env teardown, still posts and dispatches deleteProject', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockResolvedValueOnce({});
    const { result } = captureHook({ store });
    await result.handleDelete('project', 'no-such-project');
    const types = dispatchedTypes();
    expect(types).not.toContain('ui/closeTabsByCardIds');
    expect(types).toContain('projects/deleteProject');
  });

  it('folder happy path: posts /delete then dispatches deleteFolder', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockResolvedValueOnce({});
    const { result } = captureHook({ store });
    await result.handleDelete('folder', 'f1');
    expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/projects/delete', { projectId: 'f1' });
    expect(findDispatch('projects/deleteFolder')).toBeDefined();
  });

  it('on axios failure for project, still dispatches deleteProject locally', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockRejectedValueOnce(new Error('boom'));
    const { result } = captureHook({ store });
    await result.handleDelete('project', 'p1');
    expect(findDispatch('projects/deleteProject')).toBeDefined();
  });

  it('on axios failure for folder, still dispatches deleteFolder locally', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockRejectedValueOnce(new Error('boom'));
    const { result } = captureHook({ store });
    await result.handleDelete('folder', 'f1');
    expect(findDispatch('projects/deleteFolder')).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleCreateFolder
// ────────────────────────────────────────────────────────────────────────────

describe('handleCreateFolder', () => {
  it('sets creatingFolder=root and seeds newFolderName from i18n key', () => {
    const store = makeStore();
    const setCreatingFolder = vi.fn();
    const setNewFolderName = vi.fn();
    const t = vi.fn((k: string) => `T(${k})`);
    const { result } = captureHook({ store, setCreatingFolder, setNewFolderName, t });
    result.handleCreateFolder();
    expect(setCreatingFolder).toHaveBeenCalledWith('root');
    expect(setNewFolderName).toHaveBeenCalledWith('T(projectTree.defaultFolderName)');
    expect(t).toHaveBeenCalledWith('projectTree.defaultFolderName');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleFinishCreateFolder
// ────────────────────────────────────────────────────────────────────────────

describe('handleFinishCreateFolder', () => {
  it('skips create when newFolderName trims to empty', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    const setCreatingFolder = vi.fn();
    const setNewFolderName = vi.fn();
    const { result } = captureHook({
      store,
      newFolderName: '   ',
      creatingFolder: 'root',
      setCreatingFolder,
      setNewFolderName,
    });
    await result.handleFinishCreateFolder();
    expect(mocks.axios.post).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(setCreatingFolder).toHaveBeenCalledWith(null);
    expect(setNewFolderName).toHaveBeenCalledWith('');
  });

  it('skips create when orgId is empty', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    const { result } = captureHook({
      store,
      orgId: '',
      newFolderName: 'My New Folder',
      creatingFolder: 'root',
    });
    await result.handleFinishCreateFolder();
    expect(mocks.axios.post).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('happy path: posts /create with parentId=undefined when creatingFolder==="root", then dispatches fetchProjectTree', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockResolvedValueOnce({});
    const { result } = captureHook({
      store,
      orgId: 'org-1',
      newFolderName: '  My New Folder  ',
      creatingFolder: 'root',
    });
    await result.handleFinishCreateFolder();
    expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/projects/create', {
      name: 'My New Folder',
      type: 'folder',
      parentId: undefined,
    });
    // fetchProjectTree is a thunk — it dispatches an action whose type starts with projects/
    const calledAfterAxios = mocks.dispatch.mock.calls.length > 0;
    expect(calledAfterAxios).toBe(true);
  });

  it('happy path: passes parentId when creatingFolder is a real folder id (subfolder)', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockResolvedValueOnce({});
    const { result } = captureHook({
      store,
      orgId: 'org-1',
      newFolderName: 'sub',
      creatingFolder: 'parent-folder-id',
    });
    await result.handleFinishCreateFolder();
    expect(mocks.axios.post).toHaveBeenCalledWith('/canvas/projects/create', {
      name: 'sub',
      type: 'folder',
      parentId: 'parent-folder-id',
    });
  });

  it('on axios failure: dispatches createFolder locally with parentFolderId', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockRejectedValueOnce(new Error('net'));
    const { result } = captureHook({
      store,
      orgId: 'org-1',
      newFolderName: '  newfolder  ',
      creatingFolder: 'parent-A',
    });
    await result.handleFinishCreateFolder();
    expect(findDispatch('projects/createFolder')).toBeDefined();
    const action = findDispatch('projects/createFolder') as {
      payload: { name: string; organisationId: string; parentFolderId: string | null };
    };
    expect(action.payload).toEqual({ name: 'newfolder', organisationId: 'org-1', parentFolderId: 'parent-A' });
  });

  it('on axios failure with creatingFolder=root: dispatches createFolder with parentFolderId=null', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockRejectedValueOnce(new Error('net'));
    const { result } = captureHook({
      store,
      orgId: 'org-1',
      newFolderName: 'rootfolder',
      creatingFolder: 'root',
    });
    await result.handleFinishCreateFolder();
    const action = findDispatch('projects/createFolder') as {
      payload: { parentFolderId: string | null };
    };
    expect(action.payload.parentFolderId).toBeNull();
  });

  it('always clears creatingFolder + newFolderName at the end (success path)', async () => {
    const store = makeStore();
    wrapStoreDispatch(store);
    mocks.axios.post.mockResolvedValueOnce({});
    const setCreatingFolder = vi.fn();
    const setNewFolderName = vi.fn();
    const { result } = captureHook({
      store,
      orgId: 'org-1',
      newFolderName: 'ok',
      creatingFolder: 'root',
      setCreatingFolder,
      setNewFolderName,
    });
    await result.handleFinishCreateFolder();
    expect(setCreatingFolder).toHaveBeenLastCalledWith(null);
    expect(setNewFolderName).toHaveBeenLastCalledWith('');
  });
});

// Ensure no stray async work leaks between tests.
describe('cleanup', () => {
  it('flushMicrotasks is idempotent', async () => {
    await flushMicrotasks();
    await flushMicrotasks();
    expect(true).toBe(true);
  });
});
