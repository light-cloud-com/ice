/**
 * Project Tree — branch coverage suite.
 *
 * The smoke test in `project-tree.test.tsx` renders the orchestrator to a
 * string with a real Redux store + Provider — it exercises the layout but
 * does NOT drive the inline arrow handlers (`onToggleExpanded` per row,
 * the header dispatch, the create-folder input keydown branches, the
 * tree-container drag/drop). This file mocks react.useState/useEffect so
 * we can drive every state branch without re-rendering.
 *
 * The leaf components (FolderRow, ProjectRow, TreeContextMenu) are
 * stubbed with vi.fn so element comparisons by reference work.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  state: {
    account: { selectedOrg: { id: 'org-1', name: 'Acme', role: 'admin' } },
    deploy: { currentDeployCardId: null, status: 'idle' },
    ui: { splitView: { panes: [] } },
  } as Record<string, unknown>,
  // Selector → value table keyed by selector identity
  selectorTable: new Map<unknown, unknown>(),
  // useState slots: 0=contextMenu, 1=editingId, 2=editingName, 3=creatingFolder, 4=newFolderName
  contextMenuRef: { current: null as null | { x: number; y: number; type: 'project' | 'folder'; id: string } },
  editingIdRef: { current: null as null | string },
  editingNameRef: { current: '' as string },
  creatingFolderRef: { current: null as null | string },
  newFolderNameRef: { current: '' as string },
  setContextMenuSpy: vi.fn(),
  setEditingIdSpy: vi.fn(),
  setEditingNameSpy: vi.fn(),
  setCreatingFolderSpy: vi.fn(),
  setNewFolderNameSpy: vi.fn(),
  // Hook returns
  useTreeEffectsRet: { menuRef: { current: null }, editInputRef: { current: null }, newFolderRef: { current: null } },
  useTreeHandlersRet: {
    handleProjectClick: vi.fn(),
    handleEnvClick: vi.fn(),
    handleContextMenu: vi.fn(),
    handleStartRename: vi.fn(),
    handleFinishRename: vi.fn(),
    handleDelete: vi.fn(),
    handleCreateFolder: vi.fn(),
    handleFinishCreateFolder: vi.fn(),
  },
  useTreeDragRet: {
    dragOverId: null as null | string,
    handleDragStart: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
  },
  // Selectors — identity references shared between SUT and test
  selectProjectsByOrg: vi.fn(),
  selectFoldersByOrg: vi.fn(),
  selectActiveProjectId: vi.fn(),
  selectActiveEnvironmentId: vi.fn(),
  selectLoadedOrgId: vi.fn(),
  toggleFolderExpanded: vi.fn((id: string) => ({ type: 'projects/toggleFolderExpanded', payload: id })),
  toggleProjectExpanded: vi.fn((id: string) => ({ type: 'projects/toggleProjectExpanded', payload: id })),
  openDialog: vi.fn((name: string) => ({ type: 'ui/openDialog', payload: name })),
  fetchProjectTree: vi.fn((orgId: string) => ({ type: 'projects/fetchProjectTree', payload: orgId })),
  createEmptyProjectAndNavigate: vi.fn(),
  // Mock leaf components
  MockFolderRow: vi.fn((p: unknown) => p),
  MockProjectRow: vi.fn((p: unknown) => p),
  MockTreeContextMenu: vi.fn((p: unknown) => p),
  // Data
  projects: [] as Array<{ id: string; folderId: string | null; order: number; name: string }>,
  folders: [] as Array<{ id: string; parentFolderId: string | null; order: number; name: string }>,
  activeProjectId: null as null | string,
  activeEnvId: null as null | string,
  loadedOrgId: 'org-1' as string,
}));

vi.mock('react', async (orig) => {
  const r = (await orig()) as typeof import('react');
  let useStateIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    useStateIdx = 0;
  };
  const dispatchTable = [
    () => [mocks.contextMenuRef.current, mocks.setContextMenuSpy] as const,
    () => [mocks.editingIdRef.current, mocks.setEditingIdSpy] as const,
    () => [mocks.editingNameRef.current, mocks.setEditingNameSpy] as const,
    () => [mocks.creatingFolderRef.current, mocks.setCreatingFolderSpy] as const,
    () => [mocks.newFolderNameRef.current, mocks.setNewFolderNameSpy] as const,
  ];
  const useState = <T,>(_init: T): [T, (v: T) => void] => {
    const slot = dispatchTable[useStateIdx] ?? (() => [_init, vi.fn()] as const);
    useStateIdx += 1;
    return slot() as unknown as [T, (v: T) => void];
  };
  return {
    ...r,
    useState,
    useEffect: vi.fn(),
    useCallback: <F,>(fn: F) => fn,
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: unknown) => {
    if (mocks.selectorTable.has(sel)) return mocks.selectorTable.get(sel);
    if (typeof sel === 'function') return (sel as (s: unknown) => unknown)(mocks.state);
    return undefined;
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../../../wizard/utils/create-empty-project', () => ({
  createEmptyProjectAndNavigate: mocks.createEmptyProjectAndNavigate,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter((a) => typeof a === 'string').join(' '),
}));

vi.mock('../../../../store/slices/projects-slice', () => ({
  selectProjectsByOrg: (orgId: string) => {
    const fn = (s: unknown) => mocks.projects;
    mocks.selectProjectsByOrg.mockReturnValueOnce(fn);
    return fn;
  },
  selectFoldersByOrg: (orgId: string) => {
    const fn = (s: unknown) => mocks.folders;
    mocks.selectFoldersByOrg.mockReturnValueOnce(fn);
    return fn;
  },
  selectActiveProjectId: (() => {
    const fn = (s: unknown) => mocks.activeProjectId;
    return fn;
  })(),
  selectActiveEnvironmentId: (() => {
    const fn = (s: unknown) => mocks.activeEnvId;
    return fn;
  })(),
  selectLoadedOrgId: (() => {
    const fn = (s: unknown) => mocks.loadedOrgId;
    return fn;
  })(),
  toggleFolderExpanded: mocks.toggleFolderExpanded,
  toggleProjectExpanded: mocks.toggleProjectExpanded,
  fetchProjectTree: mocks.fetchProjectTree,
}));

vi.mock('../../../../store/slices/ui-slice', () => ({
  openDialog: mocks.openDialog,
}));

vi.mock('../../hooks/use-tree-effects', () => ({
  useTreeEffects: () => mocks.useTreeEffectsRet,
}));

vi.mock('../../hooks/use-tree-handlers', () => ({
  useTreeHandlers: () => mocks.useTreeHandlersRet,
}));

vi.mock('../../hooks/use-tree-drag', () => ({
  useTreeDrag: () => mocks.useTreeDragRet,
}));

vi.mock('../folder-row', () => ({
  FolderRow: mocks.MockFolderRow,
}));

vi.mock('../project-row', () => ({
  ProjectRow: mocks.MockProjectRow,
}));

vi.mock('../tree-context-menu', () => ({
  TreeContextMenu: mocks.MockTreeContextMenu,
}));

import { FolderRow } from '../folder-row';
import { ProjectRow } from '../project-row';
import { ProjectTree } from '../project-tree';
import { TreeContextMenu } from '../tree-context-menu';

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

const render = (): unknown => {
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  return (ProjectTree as unknown as () => unknown)();
};

beforeEach(() => {
  mocks.dispatch.mockReset();
  mocks.contextMenuRef.current = null;
  mocks.editingIdRef.current = null;
  mocks.editingNameRef.current = '';
  mocks.creatingFolderRef.current = null;
  mocks.newFolderNameRef.current = '';
  mocks.setContextMenuSpy.mockReset();
  mocks.setEditingIdSpy.mockReset();
  mocks.setEditingNameSpy.mockReset();
  mocks.setCreatingFolderSpy.mockReset();
  mocks.setNewFolderNameSpy.mockReset();
  mocks.projects = [];
  mocks.folders = [];
  mocks.activeProjectId = null;
  mocks.activeEnvId = null;
  mocks.loadedOrgId = 'org-1';
  mocks.MockFolderRow.mockClear();
  mocks.MockProjectRow.mockClear();
  mocks.MockTreeContextMenu.mockClear();
  mocks.createEmptyProjectAndNavigate.mockReset();
  Object.values(mocks.useTreeHandlersRet).forEach((h) => (h as ReturnType<typeof vi.fn>).mockReset());
  mocks.useTreeDragRet.dragOverId = null;
  mocks.useTreeDragRet.handleDragStart.mockReset();
  mocks.useTreeDragRet.handleDragOver.mockReset();
  mocks.useTreeDragRet.handleDragLeave.mockReset();
  mocks.useTreeDragRet.handleDrop.mockReset();
});

describe('ProjectTree — header buttons', () => {
  it('renders the New Project button with onClick=createEmptyProjectAndNavigate', () => {
    const tree = render();
    const buttons = findAll(tree, (el) => el.type === 'button');
    const newProj = buttons.find((b) => {
      const text = JSON.stringify(b.props.children);
      return text.includes('projectTree.newProject');
    });
    expect(newProj).toBeDefined();
    (newProj!.props.onClick as () => void)();
    expect(mocks.createEmptyProjectAndNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ organisationId: 'org-1', organisationName: 'Acme' }),
    );
  });

  it('renders the New Folder button with onClick=handleCreateFolder', () => {
    const tree = render();
    const buttons = findAll(tree, (el) => el.type === 'button');
    const newFolder = buttons.find((b) => {
      const text = JSON.stringify(b.props.children);
      return text.includes('projectTree.newFolder');
    });
    expect(newFolder).toBeDefined();
    (newFolder!.props.onClick as () => void)();
    expect(mocks.useTreeHandlersRet.handleCreateFolder).toHaveBeenCalled();
  });
});

describe('ProjectTree — populated tree', () => {
  beforeEach(() => {
    mocks.projects = [
      { id: 'p1', folderId: null, order: 0, name: 'Project 1' },
      { id: 'p2', folderId: 'f1', order: 1, name: 'Project 2' },
    ];
    mocks.folders = [{ id: 'f1', parentFolderId: null, order: 0, name: 'Folder 1' }];
  });

  it('renders one FolderRow per top-level folder', () => {
    const tree = render();
    const folderRows = findAll(tree, (el) => el.type === FolderRow);
    expect(folderRows.length).toBe(1);
  });

  it('renders one ProjectRow per top-level project', () => {
    const tree = render();
    const projectRows = findAll(tree, (el) => el.type === ProjectRow);
    expect(projectRows.length).toBe(1);
  });

  it('FolderRow.onToggleExpanded dispatches toggleFolderExpanded(folder.id)', () => {
    const tree = render();
    const folderRow = findFirst(tree, (el) => el.type === FolderRow);
    (folderRow!.props.onToggleExpanded as (id: string) => void)('f1');
    expect(mocks.toggleFolderExpanded).toHaveBeenCalledWith('f1');
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'projects/toggleFolderExpanded',
      payload: 'f1',
    });
  });

  it('ProjectRow.onToggleExpanded dispatches toggleProjectExpanded(project.id)', () => {
    const tree = render();
    const projectRow = findFirst(tree, (el) => el.type === ProjectRow);
    (projectRow!.props.onToggleExpanded as (id: string) => void)('p1');
    expect(mocks.toggleProjectExpanded).toHaveBeenCalledWith('p1');
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'projects/toggleProjectExpanded',
      payload: 'p1',
    });
  });

  it('renderFolder is passed as renderProject prop reference, callable', () => {
    const tree = render();
    const folderRow = findFirst(tree, (el) => el.type === FolderRow);
    const renderProject = folderRow!.props.renderProject as (
      project: { id: string; folderId: string | null; order: number; name: string },
      depth: number,
    ) => unknown;
    const projectEl = renderProject({ id: 'p2', folderId: 'f1', order: 1, name: 'Project 2' }, 1);
    expect(projectEl).toBeDefined();
    expect((projectEl as ElLike).type).toBe(ProjectRow);
    expect((projectEl as ElLike).props.depth).toBe(1);
  });
});

describe('ProjectTree — empty state', () => {
  it('renders the empty hint when both projects and folders are empty AND not creating', () => {
    mocks.projects = [];
    mocks.folders = [];
    mocks.creatingFolderRef.current = null;
    const tree = render();
    const text = JSON.stringify(tree);
    expect(text).toContain('projectTree.emptyNoProjects');
    expect(text).toContain('projectTree.emptyHint');
  });

  it('does NOT render the empty hint while creatingFolder is open', () => {
    mocks.projects = [];
    mocks.folders = [];
    mocks.creatingFolderRef.current = 'pending';
    const tree = render();
    const text = JSON.stringify(tree);
    expect(text).not.toContain('projectTree.emptyNoProjects');
  });

  it('does NOT render the empty hint when folders are present', () => {
    mocks.folders = [{ id: 'f1', parentFolderId: null, order: 0, name: 'F1' }];
    const tree = render();
    const text = JSON.stringify(tree);
    expect(text).not.toContain('projectTree.emptyNoProjects');
  });
});

describe('ProjectTree — new-folder inline input', () => {
  beforeEach(() => {
    mocks.creatingFolderRef.current = 'pending';
    mocks.newFolderNameRef.current = 'My Folder';
  });

  it('renders the input + Check + X buttons when creatingFolder is non-null', () => {
    const tree = render();
    const input = findFirst(tree, (el) => el.type === 'input');
    expect(input).toBeDefined();
    expect(input!.props.value).toBe('My Folder');
  });

  it('input onChange calls setNewFolderName', () => {
    const tree = render();
    const input = findFirst(tree, (el) => el.type === 'input');
    (input!.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: 'Renamed' },
    });
    expect(mocks.setNewFolderNameSpy).toHaveBeenCalledWith('Renamed');
  });

  it('input onBlur calls handleFinishCreateFolder', () => {
    const tree = render();
    const input = findFirst(tree, (el) => el.type === 'input');
    (input!.props.onBlur as () => void)();
    expect(mocks.useTreeHandlersRet.handleFinishCreateFolder).toHaveBeenCalled();
  });

  it('input Enter key calls handleFinishCreateFolder', () => {
    const tree = render();
    const input = findFirst(tree, (el) => el.type === 'input');
    (input!.props.onKeyDown as (e: { key: string }) => void)({ key: 'Enter' });
    expect(mocks.useTreeHandlersRet.handleFinishCreateFolder).toHaveBeenCalled();
  });

  it('input Escape key clears creatingFolder and newFolderName', () => {
    const tree = render();
    const input = findFirst(tree, (el) => el.type === 'input');
    (input!.props.onKeyDown as (e: { key: string }) => void)({ key: 'Escape' });
    expect(mocks.setCreatingFolderSpy).toHaveBeenCalledWith(null);
    expect(mocks.setNewFolderNameSpy).toHaveBeenCalledWith('');
  });

  it('non-Enter/Escape key does NOT call any setter', () => {
    const tree = render();
    const input = findFirst(tree, (el) => el.type === 'input');
    (input!.props.onKeyDown as (e: { key: string }) => void)({ key: 'a' });
    expect(mocks.useTreeHandlersRet.handleFinishCreateFolder).not.toHaveBeenCalled();
    expect(mocks.setCreatingFolderSpy).not.toHaveBeenCalled();
  });

  it('Check button onClick calls handleFinishCreateFolder', () => {
    const tree = render();
    const buttons = findAll(tree, (el) => el.type === 'button');
    const checkBtn = buttons.find(
      (b) => typeof b.props.className === 'string' && (b.props.className as string).includes('hover:bg-green-500/20'),
    );
    expect(checkBtn).toBeDefined();
    (checkBtn!.props.onClick as () => void)();
    expect(mocks.useTreeHandlersRet.handleFinishCreateFolder).toHaveBeenCalled();
  });

  it('X button onClick clears creatingFolder + newFolderName state', () => {
    const tree = render();
    const buttons = findAll(tree, (el) => el.type === 'button');
    const xBtn = buttons.find(
      (b) => typeof b.props.className === 'string' && (b.props.className as string).includes('hover:bg-red-500/20'),
    );
    expect(xBtn).toBeDefined();
    (xBtn!.props.onClick as () => void)();
    expect(mocks.setCreatingFolderSpy).toHaveBeenCalledWith(null);
    expect(mocks.setNewFolderNameSpy).toHaveBeenCalledWith('');
  });
});

describe('ProjectTree — tree container drag/drop wiring', () => {
  it('container onDragOver delegates to handleDragOver(e, null)', () => {
    const tree = render();
    const container = findFirst(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        el.props.className.includes('flex-1 overflow-y-auto overflow-x-hidden'),
    );
    const event = {};
    (container!.props.onDragOver as (e: unknown, parent: unknown) => void)(event, null);
    expect(mocks.useTreeDragRet.handleDragOver).toHaveBeenCalledWith(event, null);
  });

  it('container onDragLeave delegates to handleDragLeave', () => {
    const tree = render();
    const container = findFirst(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        el.props.className.includes('flex-1 overflow-y-auto overflow-x-hidden'),
    );
    expect(container!.props.onDragLeave).toBe(mocks.useTreeDragRet.handleDragLeave);
  });

  it('container onDrop delegates to handleDrop(e, null)', () => {
    const tree = render();
    const container = findFirst(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        el.props.className.includes('flex-1 overflow-y-auto overflow-x-hidden'),
    );
    const event = {};
    (container!.props.onDrop as (e: unknown, parent: unknown) => void)(event, null);
    expect(mocks.useTreeDragRet.handleDrop).toHaveBeenCalledWith(event, null);
  });
});

describe('ProjectTree — context menu render', () => {
  it('renders TreeContextMenu when contextMenu state is non-null', () => {
    mocks.contextMenuRef.current = { x: 10, y: 20, type: 'project', id: 'p1' };
    const tree = render();
    const menu = findFirst(tree, (el) => el.type === TreeContextMenu);
    expect(menu).toBeDefined();
    expect(menu!.props.contextMenu).toEqual({ x: 10, y: 20, type: 'project', id: 'p1' });
  });

  it('does NOT render TreeContextMenu when contextMenu is null', () => {
    mocks.contextMenuRef.current = null;
    const tree = render();
    const menu = findFirst(tree, (el) => el.type === TreeContextMenu);
    expect(menu).toBeUndefined();
  });
});

describe('ProjectTree — orgId fallback', () => {
  it('uses empty string for orgId when selectedOrg is null', () => {
    mocks.state.account = { selectedOrg: null };
    expect(() => render()).not.toThrow();
  });
});
