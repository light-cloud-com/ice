/**
 * Tests for `ProjectBrowser` — Project Browser orchestrator shell.
 *
 * Strategy: direct-FC tree-walker. Mock the two extracted hooks
 * (useProjectBrowserData, useProjectBrowserActions) plus useResolvePath +
 * react-redux to control branches — loading vs empty vs populated — and
 * assert the orchestrator's render decisions, drag/drop wiring, and
 * dispatch on header buttons. Component leaves (PanelHeader, TreeItem)
 * are replaced with vi.fn stubs so we can compare element type to the
 * mock reference and read the props passed by the orchestrator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  state: {
    account: {
      selectedOrg: { id: 'org-1', name: 'Acme', role: 'admin' } as { id: string; name: string; role: string } | null,
    },
  },
  pathname: '/canvas/some-project',
  data: {
    items: [] as Array<{
      id: string;
      name: string;
      type: 'folder' | 'project';
      parent_id: string | null;
      cards: unknown[];
      children: unknown[];
    }>,
    flatFolders: [] as Array<unknown>,
    loading: false,
    expanded: new Set<string>(),
    setExpanded: vi.fn(),
    search: '',
    setSearch: vi.fn(),
    fetchProjects: vi.fn(),
    toggleExpand: vi.fn(),
  },
  actions: {
    handleCreate: vi.fn(),
    handleRename: vi.fn(),
    handleDelete: vi.fn(),
    handleMove: vi.fn(),
    handleNavigateSubpage: vi.fn(),
    handleOpen: vi.fn(),
  },
  resolved: {
    loading: false,
    type: 'project' as 'root' | 'folder' | 'project' | 'notFound',
    id: 'p-1',
    name: 'My Project',
    subpage: 'canvas',
    breadcrumbs: [],
    orgPrefix: '',
  },
  // Mock component refs
  MockPanelHeader: vi.fn((p: unknown) => p),
  MockPanelHeaderAction: vi.fn((p: unknown) => p),
  MockTreeItem: vi.fn((p: unknown) => p),
}));

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mocks.pathname }),
  useNavigate: () => vi.fn(),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../shared/hooks/use-resolve-path', () => ({
  useResolvePath: () => mocks.resolved,
}));

vi.mock('../../hooks/use-project-browser-data', () => ({
  useProjectBrowserData: () => mocks.data,
}));

vi.mock('../../hooks/use-project-browser-actions', () => ({
  useProjectBrowserActions: () => mocks.actions,
}));

vi.mock('../../../../store/slices/ui-slice', () => ({
  openDialog: (name: string) => ({ type: 'ui/openDialog', payload: name }),
}));

vi.mock('../../../../shared/components/ui/panel-header', () => ({
  PanelHeader: mocks.MockPanelHeader,
  PanelHeaderAction: mocks.MockPanelHeaderAction,
}));

vi.mock('../tree-item', () => ({
  TreeItem: mocks.MockTreeItem,
}));

import { PanelHeader, PanelHeaderAction } from '../../../../shared/components/ui/panel-header';
import { ProjectBrowser } from '../project-browser';
import { TreeItem } from '../tree-item';

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

const render = (): unknown => (ProjectBrowser as unknown as () => unknown)();

beforeEach(() => {
  mocks.dispatch.mockReset();
  // Mutate (do not replace) the inner objects so the references the mock
  // factories captured remain live.
  mocks.data.items = [];
  mocks.data.flatFolders = [];
  mocks.data.loading = false;
  mocks.data.expanded = new Set<string>();
  mocks.data.search = '';
  mocks.data.setExpanded = vi.fn();
  mocks.data.setSearch = vi.fn();
  mocks.data.fetchProjects = vi.fn();
  mocks.data.toggleExpand = vi.fn();
  mocks.actions.handleCreate = vi.fn();
  mocks.actions.handleRename = vi.fn();
  mocks.actions.handleDelete = vi.fn();
  mocks.actions.handleMove = vi.fn();
  mocks.actions.handleNavigateSubpage = vi.fn();
  mocks.actions.handleOpen = vi.fn();
  mocks.state.account.selectedOrg = { id: 'org-1', name: 'Acme', role: 'admin' };
  mocks.pathname = '/canvas/proj';
  mocks.resolved.loading = false;
  mocks.resolved.type = 'project';
  mocks.resolved.id = 'p-1';
  mocks.resolved.name = 'My Project';
  mocks.resolved.subpage = 'canvas';
});

describe('ProjectBrowser — header', () => {
  it('renders a PanelHeader element', () => {
    const tree = render();
    const header = findFirst(tree, (el) => el.type === PanelHeader);
    expect(header).toBeDefined();
  });

  it('passes search.value and onChange wired to setSearch', () => {
    mocks.data.search = 'foo';
    const tree = render();
    const header = findFirst(tree, (el) => el.type === PanelHeader);
    const searchProps = header!.props.search as { value: string; onChange: (s: string) => void };
    expect(searchProps.value).toBe('foo');
    searchProps.onChange('bar');
    expect(mocks.data.setSearch).toHaveBeenCalledWith('bar');
  });

  it('renders both PanelHeaderAction buttons inside the header actions slot', () => {
    const tree = render();
    const header = findFirst(tree, (el) => el.type === PanelHeader);
    // The actions prop holds a fragment of two PanelHeaderAction elements.
    const actions = findAll(header!.props.actions, (el) => el.type === PanelHeaderAction);
    expect(actions.length).toBe(2);
  });

  it('clicking the new-project action dispatches openDialog("projectWizard")', () => {
    const tree = render();
    const header = findFirst(tree, (el) => el.type === PanelHeader);
    const actions = findAll(header!.props.actions, (el) => el.type === PanelHeaderAction);
    const newProjectAction = actions.find((a) => a.props.label === 'projectBrowser.newProject');
    (newProjectAction!.props.onClick as () => void)();
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'ui/openDialog',
      payload: 'projectWizard',
    });
  });

  it('clicking the new-folder action calls handleCreate("folder")', () => {
    const tree = render();
    const header = findFirst(tree, (el) => el.type === PanelHeader);
    const actions = findAll(header!.props.actions, (el) => el.type === PanelHeaderAction);
    const newFolderAction = actions.find((a) => a.props.label === 'projectBrowser.newFolderName');
    (newFolderAction!.props.onClick as () => void)();
    expect(mocks.actions.handleCreate).toHaveBeenCalledWith('folder');
  });
});

describe('ProjectBrowser — loading state', () => {
  it('renders a spinner when loading=true', () => {
    mocks.data.loading = true;
    const tree = render();
    const spinners = findAll(tree, (el) => {
      const cn = el.props.className;
      return typeof cn === 'string' && cn.includes('animate-spin');
    });
    expect(spinners.length).toBeGreaterThan(0);
  });

  it('does NOT render TreeItem when loading=true', () => {
    mocks.data.loading = true;
    mocks.data.items = [{ id: 'p1', name: 'P', type: 'project', parent_id: null, cards: [], children: [] }];
    const tree = render();
    const treeItems = findAll(tree, (el) => el.type === TreeItem);
    expect(treeItems.length).toBe(0);
  });
});

describe('ProjectBrowser — empty state', () => {
  it('renders the empty hint with a Create button when items.length=0', () => {
    mocks.data.loading = false;
    mocks.data.items = [];
    const tree = render();
    const createBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('bg-ice-accent'),
    );
    expect(createBtn).toBeDefined();
  });

  it('clicking the empty-state Create button dispatches openDialog', () => {
    mocks.data.items = [];
    const tree = render();
    const createBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('bg-ice-accent'),
    );
    (createBtn!.props.onClick as () => void)();
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'ui/openDialog',
      payload: 'projectWizard',
    });
  });
});

describe('ProjectBrowser — populated state', () => {
  beforeEach(() => {
    mocks.data.items = [
      { id: 'a', name: 'A', type: 'folder', parent_id: null, cards: [], children: [] },
      { id: 'b', name: 'B', type: 'project', parent_id: null, cards: [], children: [] },
    ];
    mocks.data.flatFolders = [{ id: 'a', name: 'A', type: 'folder', parent_id: null, cards: [], children: [] }];
  });

  it('renders one TreeItem per top-level item', () => {
    const tree = render();
    const treeItems = findAll(tree, (el) => el.type === TreeItem);
    expect(treeItems.length).toBe(2);
  });

  it('passes node, level=0, expandedIds, activeNodeId, activeSubpage to each TreeItem', () => {
    const tree = render();
    const treeItems = findAll(tree, (el) => el.type === TreeItem);
    expect(treeItems[0].props.level).toBe(0);
    expect(treeItems[0].props.activeNodeId).toBe('p-1');
    expect(treeItems[0].props.activeSubpage).toBe('canvas');
    expect(treeItems[0].props.expandedIds).toBe(mocks.data.expanded);
  });

  it('TreeItem.onCreateIn proxies to handleCreate("project", parentId)', () => {
    const tree = render();
    const treeItems = findAll(tree, (el) => el.type === TreeItem);
    (treeItems[0].props.onCreateIn as (id: string) => void)('parent-id');
    expect(mocks.actions.handleCreate).toHaveBeenCalledWith('project', 'parent-id');
  });

  it('TreeItem.onMove forwards to actions.handleMove', () => {
    const tree = render();
    const treeItems = findAll(tree, (el) => el.type === TreeItem);
    expect(treeItems[0].props.onMove).toBe(mocks.actions.handleMove);
  });

  it('TreeItem.onToggle is the data hook toggleExpand', () => {
    const tree = render();
    const treeItems = findAll(tree, (el) => el.type === TreeItem);
    expect(treeItems[0].props.onToggle).toBe(mocks.data.toggleExpand);
  });

  it('does NOT render the empty state when items are present', () => {
    const tree = render();
    const createBtn = findFirst(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('bg-ice-accent'),
    );
    expect(createBtn).toBeUndefined();
  });
});

describe('ProjectBrowser — drop on tree container', () => {
  it('container onDragOver sets dropEffect=move and prevents default', () => {
    const tree = render();
    const container = findFirst(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        el.props.className.includes('flex-1 overflow-y-auto overflow-x-hidden'),
    );
    const event = {
      preventDefault: vi.fn(),
      dataTransfer: { dropEffect: '' },
    };
    (container!.props.onDragOver as (e: unknown) => void)(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe('move');
  });

  it('container onDrop with a draggedId calls handleMove(id, null)', () => {
    const tree = render();
    const container = findFirst(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        el.props.className.includes('flex-1 overflow-y-auto overflow-x-hidden'),
    );
    const event = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: vi.fn(() => 'dragged-id') },
    };
    (container!.props.onDrop as (e: unknown) => void)(event);
    expect(mocks.actions.handleMove).toHaveBeenCalledWith('dragged-id', null);
  });

  it('container onDrop with empty draggedId is a no-op', () => {
    const tree = render();
    const container = findFirst(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        el.props.className.includes('flex-1 overflow-y-auto overflow-x-hidden'),
    );
    const event = {
      preventDefault: vi.fn(),
      dataTransfer: { getData: vi.fn(() => '') },
    };
    (container!.props.onDrop as (e: unknown) => void)(event);
    expect(mocks.actions.handleMove).not.toHaveBeenCalled();
  });
});

describe('ProjectBrowser — activeSubpage derivation', () => {
  beforeEach(() => {
    mocks.data.items = [{ id: 'a', name: 'A', type: 'project', parent_id: null, cards: [], children: [] }];
  });

  it('activeSubpage is null when resolved.type is not "project"', () => {
    mocks.resolved.type = 'folder';
    const tree = render();
    const treeItems = findAll(tree, (el) => el.type === TreeItem);
    expect(treeItems[0].props.activeSubpage).toBeNull();
  });

  it('activeSubpage falls back to "canvas" when subpage is empty', () => {
    mocks.resolved.type = 'project';
    mocks.resolved.subpage = '';
    const tree = render();
    const treeItems = findAll(tree, (el) => el.type === TreeItem);
    expect(treeItems[0].props.activeSubpage).toBe('canvas');
  });

  it('activeSubpage echoes the resolved subpage when set', () => {
    mocks.resolved.type = 'project';
    mocks.resolved.subpage = 'settings';
    const tree = render();
    const treeItems = findAll(tree, (el) => el.type === TreeItem);
    expect(treeItems[0].props.activeSubpage).toBe('settings');
  });
});

describe('ProjectBrowser — pathname segment extraction', () => {
  it('strips leading/trailing slashes when computing segments', () => {
    mocks.pathname = '///foo//bar///';
    expect(() => render()).not.toThrow();
  });

  it('handles a root pathname', () => {
    mocks.pathname = '/';
    expect(() => render()).not.toThrow();
  });
});

describe('ProjectBrowser — without selectedOrg', () => {
  it('renders without crashing when selectedOrg is null', () => {
    mocks.state.account.selectedOrg = null;
    expect(() => render()).not.toThrow();
  });
});
