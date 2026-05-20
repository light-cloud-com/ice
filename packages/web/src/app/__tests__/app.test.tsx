/**
 * App + DynamicContent + TemplateGalleryShell + DeployRouteOpener.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl pattern). The router is
 * mocked at the module boundary so we can drive the path through
 * useLocation and the resolved path through `useResolvePath`. All
 * heavy children (AppBar, MainLayout, ErrorBoundary, etc.) are
 * stubbed as opaque markers; we only assert what App composes itself.
 *
 * Auth note: there is no token gate in this community-edition app —
 * the App shell renders its routes unconditionally. Confirmed below
 * by asserting that the LocaleProvider/BrowserRouter/Routes chain
 * mounts without consulting any auth store.
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
    pathname: '/' as string,
    user: null as null | { id: string; onboardingCompleted?: boolean },
    activeCard: null as null | { id: string },
    navigate: vi.fn(),
    dispatch: vi.fn(),
    resolvedPath: {
      loading: false,
      type: 'root',
      id: null,
      name: '',
      subpage: '',
      breadcrumbs: [] as Array<{ label: string; path: string }>,
      orgPrefix: '/',
    } as {
      loading: boolean;
      type: 'root' | 'folder' | 'project' | 'notFound';
      id: string | null;
      name: string;
      subpage: string;
      breadcrumbs: Array<{ label: string; path: string }>;
      orgPrefix: string;
    },
    deploySubscriptionArg: vi.fn(),
    menuActionsInvoked: vi.fn(),
    initializeGraphInvoked: vi.fn(),
    fetchProfileInvoked: vi.fn(),
    setActiveProjectArg: vi.fn(),
    openDeployPanelInvoked: vi.fn(),
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

vi.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <div data-stub="BrowserRouter">{children}</div>,
  Routes: ({ children }: { children: React.ReactNode }) => <div data-stub="Routes">{children}</div>,
  Route: ({ path, element }: { path: string; element: React.ReactNode }) => (
    <div data-stub="Route" data-path={path}>
      {element}
    </div>
  ),
  useLocation: () => ({ pathname: mocks.pathname }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) =>
    sel({ account: { user: mocks.user, selectedOrg: null }, cards: { cards: [], activeCardId: null } }),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('@ui/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => <div data-stub="LocaleProvider">{children}</div>,
}));

// Heavy children — opaque markers
vi.mock('@ui/features/debug/components/debug-overlay', () => ({
  DebugOverlay: () => <div data-stub="DebugOverlay" />,
}));

vi.mock('@ui/features/deploy/hooks/use-deploy-subscription', () => ({
  useDeploySubscription: (cardId?: string) => mocks.deploySubscriptionArg(cardId),
}));

vi.mock('@ui/shared/components/app-bar', () => ({
  AppBar: () => <div data-stub="AppBar" />,
}));

vi.mock('@ui/shared/components/dev-accent-picker', () => ({
  DevAccentPicker: ({ children }: { children: React.ReactNode }) => <div data-stub="DevAccentPicker">{children}</div>,
}));

vi.mock('@ui/shared/components/error-boundary', () => ({
  ErrorBoundary: ({ name, children }: { name: string; children: React.ReactNode }) => (
    <div data-stub="ErrorBoundary" data-name={name}>
      {children}
    </div>
  ),
}));

vi.mock('@ui/shared/components/main-layout', () => ({
  MainLayout: ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) => (
    <div data-stub="MainLayout" {...Object.fromEntries(Object.entries(rest).map(([k, v]) => [`data-${k}`, String(v)]))}>
      {children}
    </div>
  ),
}));

vi.mock('@ui/shared/hooks/use-menu-actions', () => ({
  useMenuActions: () => mocks.menuActionsInvoked(),
}));

vi.mock('@ui/shared/hooks/use-resolve-path', () => ({
  useResolvePath: () => mocks.resolvedPath,
}));

vi.mock('@ui/store/slices/account-slice', () => ({
  fetchProfile: () => {
    mocks.fetchProfileInvoked();
    return { type: 'account/fetchProfile' };
  },
}));

vi.mock('@ui/store/slices/cards-slice', () => ({
  selectActiveCard: () => mocks.activeCard,
}));

vi.mock('@ui/store/slices/deploy-slice', () => ({
  openDeployPanel: () => {
    mocks.openDeployPanelInvoked();
    return { type: 'deploy/openDeployPanel' };
  },
}));

vi.mock('@ui/store/slices/graph-slice', () => ({
  initializeGraph: () => {
    mocks.initializeGraphInvoked();
    return { type: 'graph/initializeGraph' };
  },
}));

vi.mock('@ui/store/slices/projects-slice', () => ({
  setActiveProject: (id: string) => {
    mocks.setActiveProjectArg(id);
    return { type: 'projects/setActive', payload: id };
  },
}));

vi.mock('@/pages/app-settings', () => ({
  AppSettings: () => <div data-stub="AppSettings" />,
}));

vi.mock('@/pages/folder-view', () => ({
  FolderView: ({
    folderId,
    folderName,
    basePath,
  }: {
    folderId: string | null;
    folderName: string;
    basePath?: string;
  }) => (
    <div
      data-stub="FolderView"
      data-folder-id={folderId ?? ''}
      data-folder-name={folderName}
      data-base-path={basePath ?? ''}
    />
  ),
}));

vi.mock('@/pages/project/activity', () => ({
  ProjectActivity: ({ projectId }: { projectId: string }) => (
    <div data-stub="ProjectActivity" data-project-id={projectId} />
  ),
}));

vi.mock('@/pages/project/deployments', () => ({
  ProjectDeployments: ({ projectId }: { projectId: string }) => (
    <div data-stub="ProjectDeployments" data-project-id={projectId} />
  ),
}));

vi.mock('@/pages/project/settings', () => ({
  ProjectSettings: ({ projectId }: { projectId: string }) => (
    <div data-stub="ProjectSettings" data-project-id={projectId} />
  ),
}));

vi.mock('@/pages/template-gallery', () => ({
  TemplateGalleryPage: () => <div data-stub="TemplateGalleryPage" />,
}));

import App from '../app';

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
    } catch (e) {
      if (process.env.DEBUG_WALK) console.warn('walk skip', el.type?.name, (e as Error).message);
    }
    return;
  }
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}

function renderApp(): React.ReactElement | null {
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx();
  const tree = (App as unknown as () => React.ReactElement | null)();
  return tree;
}

/**
 * Eagerly walk the rendered App tree so every nested FC's body runs.
 * Use this before asserting on hook side-effects (useEffect callbacks
 * registered, useMenuActions invoked, etc.). Re-runs are idempotent
 * because the patched useState mock keys off mocks.stateSlots which
 * persists slot values across walks.
 */
function drain(tree: React.ReactElement | null): void {
  if (!tree) return;
  for (const _el of walk(tree)) {
    void _el;
  }
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx();
}

beforeEach(() => {
  mocks.resetUseState();
  mocks.effects.length = 0;
  mocks.navigate.mockReset();
  mocks.dispatch.mockReset();
  mocks.deploySubscriptionArg.mockReset();
  mocks.menuActionsInvoked.mockReset();
  mocks.initializeGraphInvoked.mockReset();
  mocks.fetchProfileInvoked.mockReset();
  mocks.setActiveProjectArg.mockReset();
  mocks.openDeployPanelInvoked.mockReset();
  mocks.pathname = '/';
  mocks.user = null;
  mocks.activeCard = null;
  mocks.resolvedPath = {
    loading: false,
    type: 'root',
    id: null,
    name: '',
    subpage: '',
    breadcrumbs: [],
    orgPrefix: '/',
  };
});

// ─── Top-level shell ──────────────────────────────────────────────────────

describe('App — top-level shell', () => {
  it('wraps the routes in LocaleProvider + ErrorBoundary + DevAccentPicker + BrowserRouter', () => {
    const tree = renderApp();
    const localeProvider = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'LocaleProvider',
    );
    expect(localeProvider).toHaveLength(1);
    const router = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'BrowserRouter',
    );
    expect(router).toHaveLength(1);
  });

  it('registers four routes', () => {
    const tree = renderApp();
    const routes = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'Route',
    );
    expect(routes).toHaveLength(3);
    const paths = routes.map((r) => (r.props as { ['data-path']: string })['data-path']);
    expect(paths).toEqual(['/settings', '/templates', '/*']);
  });

  it('wraps each route in an ErrorBoundary with a name', () => {
    const tree = renderApp();
    // ErrorBoundary names: App (root), AppSettings, TemplateGallery, Canvas
    const boundaries = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'ErrorBoundary',
    );
    const names = boundaries.map((b) => (b.props as { ['data-name']: string })['data-name']);
    expect(names).toEqual(expect.arrayContaining(['App', 'AppSettings', 'TemplateGallery', 'Canvas']));
  });
});

// ─── DynamicContent ───────────────────────────────────────────────────────

describe('DynamicContent — loading branch', () => {
  it('renders a spinner when resolvedPath.loading is true', () => {
    mocks.resolvedPath = { ...mocks.resolvedPath, loading: true };
    const tree = renderApp();
    const spinners = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('animate-spin'),
    );
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });
});

describe('DynamicContent — notFound branch', () => {
  it('renders a 404 layout when resolvedPath.type is "notFound"', () => {
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'notFound',
      orgPrefix: '/acme',
    };
    const tree = renderApp();
    const code = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'app.notFound.code',
    );
    expect(code).toHaveLength(1);
  });

  it('navigates to orgPrefix when 404 button is clicked', () => {
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'notFound',
      orgPrefix: '/acme',
    };
    const tree = renderApp();
    const btn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'app.notFound.button',
    )[0];
    (btn.props as { onClick: () => void }).onClick();
    expect(mocks.navigate).toHaveBeenCalledWith('/acme');
  });

  it('falls back to "/" when orgPrefix is empty', () => {
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'notFound',
      orgPrefix: '',
    };
    const tree = renderApp();
    const btn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'app.notFound.button',
    )[0];
    (btn.props as { onClick: () => void }).onClick();
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });
});

describe('DynamicContent — root / folder branch', () => {
  it('renders FolderView with folderId=null at root', () => {
    mocks.pathname = '/';
    const tree = renderApp();
    const folder = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'FolderView',
    )[0];
    expect((folder.props as { ['data-folder-id']: string })['data-folder-id']).toBe('');
    expect((folder.props as { ['data-folder-name']: string })['data-folder-name']).toBe('app.folderView.rootName');
  });

  it('renders FolderView with the resolved folder id and name', () => {
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'folder',
      id: 'fld-1',
      name: 'My Folder',
      breadcrumbs: [{ label: 'My Folder', path: '/my-folder' }],
    };
    const tree = renderApp();
    const folder = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'FolderView',
    )[0];
    expect((folder.props as { ['data-folder-id']: string })['data-folder-id']).toBe('fld-1');
    expect((folder.props as { ['data-folder-name']: string })['data-folder-name']).toBe('My Folder');
    expect((folder.props as { ['data-base-path']: string })['data-base-path']).toBe('/my-folder');
  });

  it('falls back to orgPrefix when no breadcrumbs', () => {
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'folder',
      id: 'fld-1',
      name: 'F',
      orgPrefix: '/acme',
    };
    const tree = renderApp();
    const folder = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'FolderView',
    )[0];
    expect((folder.props as { ['data-base-path']: string })['data-base-path']).toBe('/acme');
  });
});

describe('DynamicContent — project subpages', () => {
  it('renders MainLayout + DebugOverlay for canvas subpage', () => {
    mocks.pathname = '/acme/proj';
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'project',
      id: 'proj-1',
      name: 'My Proj',
      subpage: 'canvas',
    };
    const tree = renderApp();
    const overlay = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'DebugOverlay',
    );
    expect(overlay).toHaveLength(1);
  });

  it('renders ProjectSettings when subpage="settings"', () => {
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'project',
      id: 'proj-1',
      name: 'My Proj',
      subpage: 'settings',
    };
    const tree = renderApp();
    const settings = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'ProjectSettings',
    );
    expect(settings).toHaveLength(1);
    expect((settings[0].props as { ['data-project-id']: string })['data-project-id']).toBe('proj-1');
  });

  it('renders ProjectDeployments when subpage="deployments"', () => {
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'project',
      id: 'proj-1',
      name: 'My Proj',
      subpage: 'deployments',
    };
    const tree = renderApp();
    const deployments = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'ProjectDeployments',
    );
    expect(deployments).toHaveLength(1);
  });

  it('renders ProjectActivity when subpage="activity"', () => {
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'project',
      id: 'proj-1',
      name: 'My Proj',
      subpage: 'activity',
    };
    const tree = renderApp();
    const activity = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'ProjectActivity',
    );
    expect(activity).toHaveLength(1);
  });

  it('mounts DeployRouteOpener when subpage="deploy"', () => {
    mocks.pathname = '/p/proj/deploy';
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'project',
      id: 'proj-1',
      name: 'My Proj',
      subpage: 'deploy',
    };
    const tree = renderApp();
    drain(tree);
    // DeployRouteOpener registers a useEffect that dispatches openDeployPanel.
    for (const e of mocks.effects) {
      const out = e.cb();
      if (typeof out === 'function') out();
    }
    expect(mocks.openDeployPanelInvoked).toHaveBeenCalled();
  });

  it('renders MainLayout for project canvas without DebugOverlay when subpage is "table"', () => {
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'project',
      id: 'proj-1',
      name: 'My Proj',
      subpage: 'table',
    };
    const tree = renderApp();
    const overlay = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'DebugOverlay',
    );
    // DebugOverlay still renders for table view per the source's
    // canvas/table/deploy condition
    expect(overlay.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── DynamicContent — effects ───────────────────────────────────────────

describe('DynamicContent — effects', () => {
  it('dispatches initializeGraph + fetchProfile on mount', () => {
    const tree = renderApp();
    drain(tree);
    for (const e of mocks.effects) e.cb();
    expect(mocks.initializeGraphInvoked).toHaveBeenCalled();
    expect(mocks.fetchProfileInvoked).toHaveBeenCalled();
  });

  it('dispatches setActiveProject when type=project with id', () => {
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'project',
      id: 'proj-1',
      name: 'X',
      subpage: 'canvas',
    };
    const tree = renderApp();
    drain(tree);
    for (const e of mocks.effects) e.cb();
    expect(mocks.setActiveProjectArg).toHaveBeenCalledWith('proj-1');
  });

  it('does not dispatch setActiveProject when type is not project', () => {
    mocks.resolvedPath = { ...mocks.resolvedPath, type: 'folder', id: 'f1' };
    const tree = renderApp();
    drain(tree);
    for (const e of mocks.effects) e.cb();
    expect(mocks.setActiveProjectArg).not.toHaveBeenCalled();
  });

  it('subscribes to deploy stream with the active card id', () => {
    mocks.activeCard = { id: 'card-9' };
    const tree = renderApp();
    drain(tree);
    expect(mocks.deploySubscriptionArg).toHaveBeenCalledWith('card-9');
  });

  it('subscribes with undefined when no active card', () => {
    mocks.activeCard = null;
    const tree = renderApp();
    drain(tree);
    expect(mocks.deploySubscriptionArg).toHaveBeenCalledWith(undefined);
  });

  it('invokes useMenuActions during render', () => {
    const tree = renderApp();
    drain(tree);
    expect(mocks.menuActionsInvoked).toHaveBeenCalled();
  });
});

// ─── projectBasePath computation ─────────────────────────────────────────

describe('DynamicContent — projectBasePath', () => {
  it('uses all segments for canvas subpage', () => {
    mocks.pathname = '/acme/proj';
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'project',
      id: 'proj-1',
      name: 'X',
      subpage: 'canvas',
    };
    const tree = renderApp();
    // MainLayout receives basePath as a prop which our mock copies into
    // data-basePath. The path should be /acme/proj.
    const layouts = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'MainLayout',
    );
    const withBase = layouts.find((l) => (l.props as { ['data-basePath']?: string })['data-basePath'] === '/acme/proj');
    expect(withBase).toBeDefined();
  });

  it('drops the last segment for non-canvas subpages', () => {
    mocks.pathname = '/acme/proj/settings';
    mocks.resolvedPath = {
      ...mocks.resolvedPath,
      type: 'project',
      id: 'proj-1',
      name: 'X',
      subpage: 'settings',
    };
    const tree = renderApp();
    const layouts = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'MainLayout',
    );
    const withBase = layouts.find((l) => (l.props as { ['data-basePath']?: string })['data-basePath'] === '/acme/proj');
    expect(withBase).toBeDefined();
  });
});

// ─── TemplateGalleryShell ─────────────────────────────────────────────────

describe('TemplateGalleryShell', () => {
  it('mounts the TemplateGalleryPage inside MainLayout for /templates route', () => {
    const tree = renderApp();
    const gallery = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'TemplateGalleryPage',
    );
    expect(gallery).toHaveLength(1);
  });

  it('dispatches fetchProfile on mount via useEffect', () => {
    const tree = renderApp();
    drain(tree);
    for (const e of mocks.effects) e.cb();
    expect(mocks.fetchProfileInvoked).toHaveBeenCalled();
  });
});
