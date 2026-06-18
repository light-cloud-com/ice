/**
 * Tests for `ProjectToolbar` — the top sub-page nav + canvas action bar.
 *
 * Mocks:
 *   - `react.useState`, `useEffect`, `useCallback`, `useMemo` — passthrough
 *     where the body just runs the factory (memoization is moot for
 *     synchronous test assertions).
 *   - `useSelector` — invokes the selector against per-test `mockState`.
 *   - `useDispatch` — returns a hoisted spy.
 *   - `useNavigate` — returns a hoisted spy.
 *   - `useTranslation` — `{ t: (k) => k }`.
 *   - Heavy children (`IceSelect`, `Tooltip*`) are mocked to opaque markers
 *     that the walker can recognize via reference equality.
 *   - `getApi` — returns a stub graph API.
 *   - `setEdgeStyle`/`toggleSnapToGrid`/`autoOrganizeCard` etc. action
 *     creators are stubbed to pass-through identity payloads so the
 *     dispatched action is observable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    ui: {
      edgeStyle: 'bezier' as 'bezier' | 'straight' | 'rectangular',
      snapToGrid: false,
      canvasLocked: false,
    },
    deploy: { status: 'idle' as 'idle' | 'deploying' | 'error' },
    selection: { selectedNodes: [] as string[] },
    cards: {
      cards: [] as Array<{ id: string; nodes?: unknown[]; viewport?: { scale: number } }>,
      activeCardId: undefined as string | undefined,
    },
    projects: { activeProjectId: 'proj-1' as string | undefined },
    environments: {
      byProject: {} as Record<
        string,
        Array<{ id: string; name: string; type: string; pr_number?: number; is_protected?: boolean; card_id: string }>
      >,
      activeEnvId: {} as Record<string, string | undefined>,
    },
  },
  selectCanUndoValue: false,
  selectCanRedoValue: false,
  dispatch: vi.fn(),
  navigate: vi.fn(),
  setSearchParams: vi.fn(),
  // Action-creator identity spies — return action objects we can assert on.
  setEdgeStyle: vi.fn((s: unknown) => ({ type: 'ui/setEdgeStyle', payload: s })),
  setAutoOrganizeStyle: vi.fn((s: unknown) => ({ type: 'ui/setAutoOrganizeStyle', payload: s })),
  toggleSnapToGrid: vi.fn(() => ({ type: 'ui/toggleSnapToGrid' })),
  toggleCanvasLocked: vi.fn(() => ({ type: 'ui/toggleCanvasLocked' })),
  autoOrganizeCard: vi.fn((p: unknown) => ({ type: 'cards/autoOrganize', payload: p })),
  undoCardChange: vi.fn(() => ({ type: 'cards/undo' })),
  redoCardChange: vi.fn(() => ({ type: 'cards/redo' })),
  setCardViewport: vi.fn((p: unknown) => ({ type: 'cards/setViewport', payload: p })),
  setActiveCard: vi.fn((id: unknown) => ({ type: 'cards/setActive', payload: id })),
  importToActiveCard: vi.fn((p: unknown) => ({ type: 'cards/import', payload: p })),
  createCard: vi.fn((p: unknown) => ({ type: 'cards/create', payload: p })),
  fetchEnvironments: vi.fn((id: unknown) => ({ type: 'env/fetch', payload: id })),
  setActiveEnvironment: vi.fn((p: unknown) => ({ type: 'env/setActive', payload: p })),
  apiGraphLoad: vi.fn(),
  IceSelectMock: vi.fn(),
  TooltipMock: vi.fn(),
  TooltipTriggerMock: vi.fn(),
  TooltipContentMock: vi.fn(),
  TooltipProviderMock: vi.fn(),
}));

// Hooks passthrough.
vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  return {
    ...actual,
    useState: <T,>(init: T): [T, (v: T) => void] => [init, vi.fn()],
    useEffect: (fn: () => void | (() => void)) => {
      const cleanup = fn();
      // Don't bother tracking cleanup — tests assert on dispatch side effects.
      void cleanup;
    },
    useMemo: <T,>(fn: () => T) => fn(),
    useCallback: <T,>(fn: T) => fn,
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams(), mocks.setSearchParams],
}));

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../ui/ice-select', () => ({
  IceSelect: mocks.IceSelectMock,
}));

vi.mock('../ui/tooltip', () => ({
  Tooltip: mocks.TooltipMock,
  TooltipTrigger: mocks.TooltipTriggerMock,
  TooltipContent: mocks.TooltipContentMock,
  TooltipProvider: mocks.TooltipProviderMock,
}));

vi.mock('../../api/api-adapter', () => ({
  getApi: () => ({ graph: { load: mocks.apiGraphLoad } }),
}));

vi.mock('../../../store/slices/cards-slice', () => ({
  autoOrganizeCard: mocks.autoOrganizeCard,
  undoCardChange: mocks.undoCardChange,
  redoCardChange: mocks.redoCardChange,
  selectCanUndo: () => mocks.selectCanUndoValue,
  selectCanRedo: () => mocks.selectCanRedoValue,
  setCardViewport: mocks.setCardViewport,
  setActiveCard: mocks.setActiveCard,
  importToActiveCard: mocks.importToActiveCard,
  createCard: mocks.createCard,
}));

vi.mock('../../../store/slices/environments-slice', () => ({
  fetchEnvironments: mocks.fetchEnvironments,
  setActiveEnvironment: mocks.setActiveEnvironment,
}));

vi.mock('../../../store/slices/ui-slice', () => ({
  setEdgeStyle: mocks.setEdgeStyle,
  setAutoOrganizeStyle: mocks.setAutoOrganizeStyle,
  toggleSnapToGrid: mocks.toggleSnapToGrid,
  toggleCanvasLocked: mocks.toggleCanvasLocked,
}));

// `handleSwitchEnv` does `await import('../../store')` to read the store
// state. Mock the store module to return our controllable state.
vi.mock('../../../store', () => ({
  store: {
    getState: () => mocks.state,
  },
}));

import { ProjectToolbar } from '../project-toolbar';

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
  // Don't descend into mocked component bodies (we keep them opaque).
  if (
    node.type === mocks.IceSelectMock ||
    node.type === mocks.TooltipMock ||
    node.type === mocks.TooltipTriggerMock ||
    node.type === mocks.TooltipContentMock ||
    node.type === mocks.TooltipProviderMock
  ) {
    yield* walk(node.props.children);
    return;
  }
  if (typeof node.type === 'function') {
    const FC = node.type as (p: unknown) => unknown;
    yield* walk(FC(node.props));
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

const render = (props: { basePath: string; activeSubpage: string }): unknown =>
  (ProjectToolbar as (p: typeof props) => unknown)(props);

beforeEach(() => {
  mocks.state.ui = { edgeStyle: 'bezier', snapToGrid: false, canvasLocked: false };
  mocks.state.deploy = { status: 'idle' };
  mocks.state.selection = { selectedNodes: [] };
  mocks.state.cards = { cards: [], activeCardId: undefined };
  mocks.state.projects = { activeProjectId: 'proj-1' };
  mocks.state.environments = { byProject: {}, activeEnvId: {} };
  mocks.selectCanUndoValue = false;
  mocks.selectCanRedoValue = false;
  mocks.dispatch.mockReset();
  mocks.navigate.mockReset();
  mocks.apiGraphLoad.mockReset();
  mocks.setEdgeStyle.mockClear();
  mocks.setAutoOrganizeStyle.mockClear();
  mocks.toggleSnapToGrid.mockClear();
  mocks.toggleCanvasLocked.mockClear();
  mocks.autoOrganizeCard.mockClear();
  mocks.undoCardChange.mockClear();
  mocks.redoCardChange.mockClear();
  mocks.setCardViewport.mockClear();
  mocks.setActiveCard.mockClear();
  mocks.importToActiveCard.mockClear();
  mocks.createCard.mockClear();
  mocks.fetchEnvironments.mockClear();
  mocks.setActiveEnvironment.mockClear();
  mocks.setSearchParams.mockClear();
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, open: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProjectToolbar — sub-page navigation', () => {
  it('renders four sub-page buttons + the settings cog', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const buttons = findAll(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof el.props.children === 'string' &&
        (el.props.children as string).startsWith('projectBrowser.sub'),
    );
    const labels = buttons.map((b) => b.props.children);
    expect(labels).toEqual(
      expect.arrayContaining([
        'projectBrowser.subCanvas',
        'projectBrowser.subTable',
        'projectBrowser.subDeployments',
        'projectBrowser.subActivity',
        'projectBrowser.subSettings',
      ]),
    );
  });

  it('marks the active sub-page with the bold + active background class', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'table' });
    const tableBtn = findFirst(tree, (el) => el.type === 'button' && el.props.children === 'projectBrowser.subTable')!;
    expect(tableBtn.props.className as string).toContain('bg-ice-active');
    expect(tableBtn.props.className as string).toContain('font-medium');
  });

  it('uses the muted style for inactive sub-pages', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const tableBtn = findFirst(tree, (el) => el.type === 'button' && el.props.children === 'projectBrowser.subTable')!;
    expect(tableBtn.props.className as string).toContain('text-ice-text-3');
  });

  it('navigates to /basePath when clicking the canvas sub-page', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'table' });
    const canvasBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.children === 'projectBrowser.subCanvas',
    )!;
    (canvasBtn.props.onClick as () => void)();
    expect(mocks.navigate).toHaveBeenCalledWith('/p/1');
  });

  it('navigates to /basePath/<subpage> for non-canvas pages', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const tableBtn = findFirst(tree, (el) => el.type === 'button' && el.props.children === 'projectBrowser.subTable')!;
    (tableBtn.props.onClick as () => void)();
    expect(mocks.navigate).toHaveBeenCalledWith('/p/1/table');
  });

  it('marks the settings page active when activeSubpage=settings', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'settings' });
    const settingsBtn = findFirst(
      tree,
      (el) => el.type === 'button' && el.props.children === 'projectBrowser.subSettings',
    )!;
    expect(settingsBtn.props.className as string).toContain('bg-ice-active');
  });
});

describe('ProjectToolbar — canvas-only action group', () => {
  it('renders the canvas action group only when activeSubpage is canvas', () => {
    const onCanvas = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const offCanvas = render({ basePath: '/p/1', activeSubpage: 'table' });
    // The canvas action group renders the snap-to-grid tooltip text.
    const onText = JSON.stringify(Array.from(walk(onCanvas)).map((e) => e.props.tip));
    const offText = JSON.stringify(Array.from(walk(offCanvas)).map((e) => e.props.tip));
    expect(onText).toContain('Snap to grid');
    expect(offText).not.toContain('Snap to grid');
  });

  it('clicking the vertical-organize button dispatches autoOrganizeCard + auto-organize-style + edge-style', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const vBtn = findFirst(tree, (el) => el.props.tip === 'Auto-organize all (vertical)')!;
    (vBtn.props.onClick as () => void)();
    expect(mocks.autoOrganizeCard).toHaveBeenCalledWith({
      direction: 'vertical',
      containerId: undefined,
      zoom: 1,
    });
    expect(mocks.setAutoOrganizeStyle).toHaveBeenCalledWith('vertical');
    expect(mocks.setEdgeStyle).toHaveBeenCalledWith('rectangular');
  });

  it('uses the "Organize group" tip when a single container is selected', () => {
    mocks.state.selection = { selectedNodes: ['c-1'] };
    mocks.state.cards = {
      cards: [{ id: 'card-1', nodes: [{ id: 'c-1', type: 'container' }] }],
      activeCardId: 'card-1',
    } as typeof mocks.state.cards;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const vBtn = findFirst(tree, (el) => el.props.tip === 'Organize group (vertical)');
    expect(vBtn).toBeDefined();
  });

  it('passes the active container id through to autoOrganizeCard when one is selected', () => {
    mocks.state.selection = { selectedNodes: ['c-1'] };
    mocks.state.cards = {
      cards: [{ id: 'card-1', nodes: [{ id: 'c-1', type: 'container' }], viewport: { scale: 0.5 } }],
      activeCardId: 'card-1',
    } as typeof mocks.state.cards;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const hBtn = findFirst(tree, (el) => el.props.tip === 'Organize group (horizontal)')!;
    (hBtn.props.onClick as () => void)();
    expect(mocks.autoOrganizeCard).toHaveBeenCalledWith({
      direction: 'horizontal',
      containerId: 'c-1',
      zoom: 0.5,
    });
  });

  it('does not pass containerId when the selected node is not a container', () => {
    mocks.state.selection = { selectedNodes: ['n-1'] };
    mocks.state.cards = {
      cards: [{ id: 'card-1', nodes: [{ id: 'n-1', type: 'service' }] }],
      activeCardId: 'card-1',
    } as typeof mocks.state.cards;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const cBtn = findFirst(tree, (el) => el.props.tip === 'Auto-organize all (circular)');
    expect(cBtn).toBeDefined();
    (cBtn!.props.onClick as () => void)();
    expect(mocks.autoOrganizeCard).toHaveBeenCalledWith({
      layout: 'circular',
      containerId: undefined,
      zoom: 1,
    });
    expect(mocks.setAutoOrganizeStyle).toHaveBeenCalledWith('circular');
  });

  it('does not pass containerId when more than one node is selected', () => {
    mocks.state.selection = { selectedNodes: ['a', 'b'] };
    mocks.state.cards = {
      cards: [
        {
          id: 'card-1',
          nodes: [
            { id: 'a', type: 'container' },
            { id: 'b', type: 'container' },
          ],
        },
      ],
      activeCardId: 'card-1',
    } as typeof mocks.state.cards;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const vBtn = findFirst(tree, (el) => el.props.tip === 'Auto-organize all (vertical)')!;
    (vBtn.props.onClick as () => void)();
    expect(mocks.autoOrganizeCard).toHaveBeenCalledWith(expect.objectContaining({ containerId: undefined }));
  });

  it('cycles the edge-style bezier → straight → rectangular → bezier', () => {
    mocks.state.ui.edgeStyle = 'bezier';
    let tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    let btn = findFirst(tree, (el) => el.props.tip === 'Connection style: bezier')!;
    (btn.props.onClick as () => void)();
    expect(mocks.setEdgeStyle).toHaveBeenLastCalledWith('straight');

    mocks.state.ui.edgeStyle = 'straight';
    tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    btn = findFirst(tree, (el) => el.props.tip === 'Connection style: straight')!;
    (btn.props.onClick as () => void)();
    expect(mocks.setEdgeStyle).toHaveBeenLastCalledWith('rectangular');

    mocks.state.ui.edgeStyle = 'rectangular';
    tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    btn = findFirst(tree, (el) => el.props.tip === 'Connection style: rectangular')!;
    (btn.props.onClick as () => void)();
    expect(mocks.setEdgeStyle).toHaveBeenLastCalledWith('bezier');
  });

  it('snap-to-grid tip flips ON/OFF based on snapEnabled', () => {
    mocks.state.ui.snapToGrid = false;
    const offTree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    expect(findFirst(offTree, (el) => el.props.tip === 'Snap to grid: OFF')).toBeDefined();
    mocks.state.ui.snapToGrid = true;
    const onTree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    expect(findFirst(onTree, (el) => el.props.tip === 'Snap to grid: ON')).toBeDefined();
  });

  it('clicking the snap-to-grid button dispatches toggleSnapToGrid', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.tip === 'Snap to grid: OFF')!;
    (btn.props.onClick as () => void)();
    expect(mocks.toggleSnapToGrid).toHaveBeenCalled();
  });

  it('lock tip flips between Canvas locked / Lock canvas', () => {
    mocks.state.ui.canvasLocked = false;
    const unlocked = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    expect(findFirst(unlocked, (el) => el.props.tip === 'Lock canvas')).toBeDefined();
    mocks.state.ui.canvasLocked = true;
    const locked = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    expect(findFirst(locked, (el) => el.props.tip === 'Canvas locked')).toBeDefined();
  });

  it('clicking the lock button dispatches toggleCanvasLocked', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.tip === 'Lock canvas')!;
    (btn.props.onClick as () => void)();
    expect(mocks.toggleCanvasLocked).toHaveBeenCalled();
  });

  it('undo button is disabled when canUndo is false', () => {
    mocks.selectCanUndoValue = false;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.tip === 'appBar.undo')!;
    expect(btn.props.disabled).toBe(true);
  });

  it('undo button is enabled when canUndo is true and dispatches undoCardChange', () => {
    mocks.selectCanUndoValue = true;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.tip === 'appBar.undo')!;
    expect(btn.props.disabled).toBe(false);
    (btn.props.onClick as () => void)();
    expect(mocks.undoCardChange).toHaveBeenCalled();
  });

  it('redo button is disabled when canRedo is false', () => {
    mocks.selectCanRedoValue = false;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.tip === 'appBar.redo')!;
    expect(btn.props.disabled).toBe(true);
  });

  it('clicking redo dispatches redoCardChange', () => {
    mocks.selectCanRedoValue = true;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.tip === 'appBar.redo')!;
    (btn.props.onClick as () => void)();
    expect(mocks.redoCardChange).toHaveBeenCalled();
  });

  it('clicking fit-to-view does nothing when there are no nodes', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.tip === 'Fit to view')!;
    (btn.props.onClick as () => void)();
    expect(mocks.setCardViewport).not.toHaveBeenCalled();
  });

  it('clicking fit-to-view computes a viewport matching the node bounds', () => {
    mocks.state.cards = {
      cards: [
        {
          id: 'card-1',
          nodes: [
            { id: 'a', position: { x: 0, y: 0 }, width: 240, height: 80 },
            { id: 'b', position: { x: 500, y: 200 }, width: 240, height: 80 },
          ] as Array<{ id: string; position: { x: number; y: number }; width: number; height: number }>,
        },
      ],
      activeCardId: 'card-1',
    } as typeof mocks.state.cards;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.tip === 'Fit to view')!;
    (btn.props.onClick as () => void)();
    expect(mocks.setCardViewport).toHaveBeenCalledTimes(1);
    const [arg] = mocks.setCardViewport.mock.calls[0];
    expect(arg).toHaveProperty('panX');
    expect(arg).toHaveProperty('panY');
    expect(arg).toHaveProperty('scale');
    expect((arg as { scale: number }).scale).toBeGreaterThan(0);
  });

  it('clicking fit-to-view falls back to default node width/height when missing', () => {
    mocks.state.cards = {
      cards: [
        {
          id: 'card-1',
          nodes: [{ id: 'a', position: { x: 0, y: 0 } }] as Array<{ id: string; position: { x: number; y: number } }>,
        },
      ],
      activeCardId: 'card-1',
    } as typeof mocks.state.cards;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.tip === 'Fit to view')!;
    (btn.props.onClick as () => void)();
    expect(mocks.setCardViewport).toHaveBeenCalled();
  });
});

describe('ProjectToolbar — environment selector', () => {
  it('does not render the IceSelect when there are no environments', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const select = findFirst(tree, (el) => el.type === mocks.IceSelectMock);
    expect(select).toBeUndefined();
  });

  it('does not render when projectId is undefined', () => {
    mocks.state.projects = { activeProjectId: undefined };
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const select = findFirst(tree, (el) => el.type === mocks.IceSelectMock);
    expect(select).toBeUndefined();
  });

  it('renders the IceSelect with formatted env labels (lock + pr number)', () => {
    mocks.state.environments = {
      byProject: {
        'proj-1': [
          { id: 'env-1', name: 'staging', type: 'staging', card_id: 'c-s' },
          { id: 'env-2', name: 'pr-feature', type: 'pr', pr_number: 42, card_id: 'c-p' },
          { id: 'env-3', name: 'prod', type: 'production', is_protected: true, card_id: 'c-pr' },
        ],
      },
      activeEnvId: { 'proj-1': 'env-1' },
    } as typeof mocks.state.environments;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const select = findFirst(tree, (el) => el.type === mocks.IceSelectMock)!;
    const options = select.props.options as Array<{ value: string; label: string }>;
    expect(options).toEqual([
      { value: 'env-1', label: 'staging' },
      { value: 'env-2', label: 'pr-feature #42' },
      { value: 'env-3', label: '🔒 prod' },
    ]);
    expect(select.props.value).toBe('env-1');
  });

  it('falls back to empty string when activeEnvId is missing', () => {
    mocks.state.environments = {
      byProject: { 'proj-1': [{ id: 'env-1', name: 'staging', type: 'staging', card_id: 'c-s' }] },
      activeEnvId: {},
    } as typeof mocks.state.environments;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const select = findFirst(tree, (el) => el.type === mocks.IceSelectMock)!;
    expect(select.props.value).toBe('');
  });

  it('clicking an env in the selector dispatches setActiveEnvironment + setActiveCard from store', async () => {
    mocks.state.environments = {
      byProject: {
        'proj-1': [{ id: 'env-1', name: 'staging', type: 'staging', card_id: 'c-1' }],
      },
      activeEnvId: { 'proj-1': 'env-1' },
    } as typeof mocks.state.environments;
    mocks.state.cards = {
      cards: [{ id: 'c-1', nodes: [{}] } as { id: string; nodes: unknown[] }],
      activeCardId: undefined,
    } as typeof mocks.state.cards;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const select = findFirst(tree, (el) => el.type === mocks.IceSelectMock)!;
    await (select.props.onChange as (id: string) => Promise<void>)('env-1');
    expect(mocks.setActiveEnvironment).toHaveBeenCalledWith({ projectId: 'proj-1', envId: 'env-1' });
    expect(mocks.setActiveCard).toHaveBeenCalledWith('c-1');
    // IA6 — the switch also writes ?env= so the env is shareable.
    expect(mocks.setSearchParams).toHaveBeenCalled();
    const updater = mocks.setSearchParams.mock.calls[0][0] as (p: URLSearchParams) => URLSearchParams;
    expect(updater(new URLSearchParams()).get('env')).toBe('env-1');
  });

  it('falls back to API graph.load when the card has no nodes yet', async () => {
    mocks.state.environments = {
      byProject: {
        'proj-1': [{ id: 'env-1', name: 'staging', type: 'staging', card_id: 'c-1' }],
      },
      activeEnvId: { 'proj-1': 'env-1' },
    } as typeof mocks.state.environments;
    mocks.state.cards = {
      cards: [{ id: 'c-1', nodes: [] } as { id: string; nodes: unknown[] }],
      activeCardId: undefined,
    } as typeof mocks.state.cards;
    mocks.apiGraphLoad.mockResolvedValue({
      id: 'c-1',
      name: 'staging',
      nodes: [{ id: 'n-1' }],
      edges: [],
    });
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const select = findFirst(tree, (el) => el.type === mocks.IceSelectMock)!;
    await (select.props.onChange as (id: string) => Promise<void>)('env-1');
    expect(mocks.apiGraphLoad).toHaveBeenCalledWith('c-1');
    expect(mocks.setActiveCard).toHaveBeenCalledWith('c-1');
    expect(mocks.importToActiveCard).toHaveBeenCalledWith({
      nodes: [{ id: 'n-1' }],
      edges: [],
      skipAutoOrganize: true,
    });
  });

  it('creates a new card via createCard when graph.load returns a card we do not have yet', async () => {
    mocks.state.environments = {
      byProject: {
        'proj-1': [{ id: 'env-1', name: 'staging', type: 'staging', card_id: 'c-1' }],
      },
      activeEnvId: { 'proj-1': 'env-1' },
    } as typeof mocks.state.environments;
    mocks.state.cards = { cards: [], activeCardId: undefined } as typeof mocks.state.cards;
    mocks.apiGraphLoad.mockResolvedValue({ id: 'c-1', name: 'staging', nodes: [], edges: [] });
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const select = findFirst(tree, (el) => el.type === mocks.IceSelectMock)!;
    await (select.props.onChange as (id: string) => Promise<void>)('env-1');
    expect(mocks.createCard).toHaveBeenCalledWith({ name: 'staging', id: 'c-1', projectId: 'proj-1' });
  });

  it('does nothing when the env id is unknown', async () => {
    mocks.state.environments = {
      byProject: {
        'proj-1': [{ id: 'env-1', name: 'staging', type: 'staging', card_id: 'c-1' }],
      },
      activeEnvId: { 'proj-1': 'env-1' },
    } as typeof mocks.state.environments;
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const select = findFirst(tree, (el) => el.type === mocks.IceSelectMock)!;
    await (select.props.onChange as (id: string) => Promise<void>)('unknown');
    expect(mocks.setActiveEnvironment).not.toHaveBeenCalled();
  });

  it('returns early when graph.load returns null/undefined', async () => {
    mocks.state.environments = {
      byProject: {
        'proj-1': [{ id: 'env-1', name: 'staging', type: 'staging', card_id: 'c-1' }],
      },
      activeEnvId: { 'proj-1': 'env-1' },
    } as typeof mocks.state.environments;
    mocks.state.cards = { cards: [], activeCardId: undefined } as typeof mocks.state.cards;
    mocks.apiGraphLoad.mockResolvedValue(null);
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const select = findFirst(tree, (el) => el.type === mocks.IceSelectMock)!;
    await (select.props.onChange as (id: string) => Promise<void>)('env-1');
    expect(mocks.setActiveCard).not.toHaveBeenCalled();
  });

  it('logs but does not throw when graph.load rejects', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.state.environments = {
      byProject: {
        'proj-1': [{ id: 'env-1', name: 'staging', type: 'staging', card_id: 'c-1' }],
      },
      activeEnvId: { 'proj-1': 'env-1' },
    } as typeof mocks.state.environments;
    mocks.state.cards = { cards: [], activeCardId: undefined } as typeof mocks.state.cards;
    mocks.apiGraphLoad.mockRejectedValue(new Error('boom'));
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const select = findFirst(tree, (el) => el.type === mocks.IceSelectMock)!;
    await (select.props.onChange as (id: string) => Promise<void>)('env-1');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('ProjectToolbar — deploy button', () => {
  it('renders the deploy button with id="ice-btn-deploy"', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.id === 'ice-btn-deploy');
    expect(btn).toBeDefined();
  });

  it('navigates to /basePath/deploy when clicked', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.id === 'ice-btn-deploy')!;
    (btn.props.onClick as () => void)();
    expect(mocks.navigate).toHaveBeenCalledWith('/p/1/deploy');
  });

  it('animates pulse when deployStatus is "deploying"', () => {
    mocks.state.deploy = { status: 'deploying' };
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.id === 'ice-btn-deploy')!;
    expect(btn.props.className as string).toContain('animate-pulse');
  });

  it('marks the deploy button as active when on the deploy sub-page', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'deploy' });
    const btn = findFirst(tree, (el) => el.props.id === 'ice-btn-deploy')!;
    expect(btn.props.className as string).toContain('bg-ice-active');
  });

  it('omits the active background when not on the deploy sub-page', () => {
    const tree = render({ basePath: '/p/1', activeSubpage: 'canvas' });
    const btn = findFirst(tree, (el) => el.props.id === 'ice-btn-deploy')!;
    expect(btn.props.className as string).not.toContain('bg-ice-active');
  });
});

describe('ProjectToolbar — environment fetch effect', () => {
  it('dispatches fetchEnvironments when projectId is set', () => {
    render({ basePath: '/p/1', activeSubpage: 'canvas' });
    expect(mocks.fetchEnvironments).toHaveBeenCalledWith('proj-1');
    expect(mocks.dispatch).toHaveBeenCalled();
  });

  it('does not dispatch fetchEnvironments when projectId is undefined', () => {
    mocks.state.projects = { activeProjectId: undefined };
    render({ basePath: '/p/1', activeSubpage: 'canvas' });
    expect(mocks.fetchEnvironments).not.toHaveBeenCalled();
  });
});
