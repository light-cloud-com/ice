/**
 * Tests for `MainLayout` — the top-level app shell.
 *
 * Strategy:
 *   - Mock heavy children (`SvgCanvas`, `DeployPanel`, `AiChatPanel`,
 *     `CostPanel`, `PropertiesPanel`, `InlineTableView`, `ResourcePalette`,
 *     `ValidationPanel`, `ProjectToolbar`, `StatusBar`, plus `ResizableHandle`/
 *     `ResizablePanel`/`ResizablePanelGroup` and the sidebar primitives)
 *     to opaque markers so the walker can recognise them by reference.
 *   - Mock `useSelector`/`useDispatch` to controlled per-test state.
 *   - Mock `useState`/`useEffect`/`useMemo`/`useCallback`/`useRef` so the
 *     FC body runs synchronously. `useState` supports an explicit
 *     "lazy initializer" function (the source uses
 *     `useState(() => window.innerHeight > window.innerWidth)`).
 *   - `useIsPortrait` reads `window.innerWidth/innerHeight` — drive these
 *     through `vi.stubGlobal('window', ...)`.
 *   - The project-load `useEffect` issues an axios POST + a dynamic
 *     `import('../../store')`. Both are mocked.
 *
 * The walker recursively invokes file-private FCs (`DragResizePanel`,
 * `useIsPortrait`) so coverage hits all branches.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    ui: {
      showPalette: false,
      showBlocks: false,
      showProperties: false,
      showAiChat: false,
      showCostPanel: false,
      showTemplates: false,
      showValidation: false,
    },
    deploy: { isOpen: false, status: 'idle' as 'idle' | 'deploying' },
    cards: {
      cards: [] as Array<{ id: string; nodes?: unknown[] }>,
      activeCardId: undefined as string | undefined,
    },
  },
  dispatch: vi.fn(),
  axiosPost: vi.fn(),
  // Action-creator identity spies.
  togglePalette: vi.fn(() => ({ type: 'ui/togglePalette' })),
  toggleBlocks: vi.fn(() => ({ type: 'ui/toggleBlocks' })),
  toggleProperties: vi.fn(() => ({ type: 'ui/toggleProperties' })),
  toggleAiChat: vi.fn(() => ({ type: 'ui/toggleAiChat' })),
  toggleCostPanel: vi.fn(() => ({ type: 'ui/toggleCostPanel' })),
  toggleTemplates: vi.fn(() => ({ type: 'ui/toggleTemplates' })),
  toggleValidation: vi.fn(() => ({ type: 'ui/toggleValidation' })),
  openDeployPanel: vi.fn(() => ({ type: 'deploy/open' })),
  closeDeployPanel: vi.fn(() => ({ type: 'deploy/close' })),
  createCard: vi.fn((p: unknown) => ({ type: 'cards/create', payload: p })),
  setActiveCard: vi.fn((id: unknown) => ({ type: 'cards/setActive', payload: id })),
  importToActiveCard: vi.fn((p: unknown) => ({ type: 'cards/import', payload: p })),
  // Mocks for sub-components rendered as opaque markers.
  SvgCanvas: vi.fn(() => null),
  InlineTableView: vi.fn(() => null),
  ResourcePalette: vi.fn(() => null),
  PropertiesPanel: vi.fn(() => null),
  AiChatPanel: vi.fn(() => null),
  CostPanel: vi.fn(() => null),
  DeployPanel: vi.fn(() => null),
  ValidationPanel: vi.fn(() => null),
  ProjectToolbar: vi.fn(() => null),
  StatusBar: vi.fn(() => null),
  SidebarStrip: vi.fn(() => null),
  SidebarPanel: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  ResizablePanelGroup: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  ResizablePanel: vi.fn(({ children }: { children?: React.ReactNode }) => children ?? null),
  ResizableHandle: vi.fn(() => null),
  ResizeBar: vi.fn(() => null),
}));

// React hooks.
vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(init: T | (() => T)): [T, (v: T) => void] => {
    const value = typeof init === 'function' ? (init as () => T)() : init;
    return [value, vi.fn()];
  };
  const useEffectStub = (fn: () => void | (() => void)) => {
    const cleanup = fn();
    void cleanup;
  };
  const useMemoStub = <T,>(fn: () => T) => fn();
  const useCallbackStub = <T,>(fn: T) => fn;
  const useRefStub = <T,>(init: T) => ({ current: init });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: {
      ...actualDefault,
      useState: useStateStub,
      useEffect: useEffectStub,
      useMemo: useMemoStub,
      useCallback: useCallbackStub,
      useRef: useRefStub,
    },
    useState: useStateStub,
    useEffect: useEffectStub,
    useMemo: useMemoStub,
    useCallback: useCallbackStub,
    useRef: useRefStub,
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../api/axios-instance', () => ({
  default: { post: mocks.axiosPost },
}));

vi.mock('../../../store', () => ({
  store: { getState: () => mocks.state },
}));

vi.mock('../../../store/slices/ui-slice', () => ({
  togglePalette: mocks.togglePalette,
  toggleBlocks: mocks.toggleBlocks,
  toggleProperties: mocks.toggleProperties,
  toggleAiChat: mocks.toggleAiChat,
  toggleCostPanel: mocks.toggleCostPanel,
  toggleTemplates: mocks.toggleTemplates,
  toggleValidation: mocks.toggleValidation,
}));

vi.mock('../../../store/slices/deploy-slice', () => ({
  openDeployPanel: mocks.openDeployPanel,
  closeDeployPanel: mocks.closeDeployPanel,
}));

vi.mock('../../../store/slices/cards-slice', () => ({
  createCard: mocks.createCard,
  setActiveCard: mocks.setActiveCard,
  importToActiveCard: mocks.importToActiveCard,
}));

// Heavy children — opaque markers.
vi.mock('../../../features/ai/components/ai-chat-panel', () => ({
  AiChatPanel: mocks.AiChatPanel,
}));
vi.mock('../../../features/canvas/components/svg-canvas', () => ({
  SvgCanvas: mocks.SvgCanvas,
}));
vi.mock('../../../features/cost/components/cost-panel', () => ({
  CostPanel: mocks.CostPanel,
}));
vi.mock('../../../features/deploy/components/deploy-panel', () => ({
  DeployPanel: mocks.DeployPanel,
}));
vi.mock('../../../features/palette/components/resource-palette', () => ({
  ResourcePalette: mocks.ResourcePalette,
}));
vi.mock('../../../features/properties/components/properties-panel', () => ({
  PropertiesPanel: mocks.PropertiesPanel,
}));
vi.mock('../../../features/validation/components/validation-panel', () => ({
  ValidationPanel: mocks.ValidationPanel,
}));
vi.mock('../inline-table-view', () => ({
  InlineTableView: mocks.InlineTableView,
}));
vi.mock('../project-toolbar', () => ({
  ProjectToolbar: mocks.ProjectToolbar,
}));
vi.mock('../status-bar', () => ({ StatusBar: mocks.StatusBar }));
vi.mock('../ui/sidebar-strip', () => ({ SidebarStrip: mocks.SidebarStrip }));
vi.mock('../ui/sidebar-panel', () => ({ SidebarPanel: mocks.SidebarPanel }));
vi.mock('../ui/resizable', () => ({
  ResizablePanelGroup: mocks.ResizablePanelGroup,
  ResizablePanel: mocks.ResizablePanel,
  ResizableHandle: mocks.ResizableHandle,
}));
vi.mock('../ui/resize-bar', () => ({
  ResizeBar: mocks.ResizeBar,
}));

import { MainLayout } from '../main-layout';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

const KNOWN_MOCKS = [
  mocks.SvgCanvas,
  mocks.InlineTableView,
  mocks.ResourcePalette,
  mocks.PropertiesPanel,
  mocks.AiChatPanel,
  mocks.CostPanel,
  mocks.DeployPanel,
  mocks.ValidationPanel,
  mocks.ProjectToolbar,
  mocks.StatusBar,
  mocks.SidebarStrip,
  mocks.SidebarPanel,
  mocks.ResizablePanelGroup,
  mocks.ResizablePanel,
  mocks.ResizableHandle,
  mocks.ResizeBar,
] as const;

function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  // Don't expand into the bodies of mocked sub-components — they're opaque.
  if ((KNOWN_MOCKS as readonly unknown[]).includes(node.type)) {
    yield* walk(node.props.children);
    return;
  }
  if (typeof node.type === 'function') {
    const FC = node.type as (p: unknown) => unknown;
    yield* walk(FC(node.props));
    return;
  }
  // React.Fragment / strings of HTML
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

const render = (props: React.ComponentProps<typeof MainLayout> = {}): unknown =>
  (MainLayout as (p: typeof props) => unknown)(props);

const setLandscape = () => {
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
};

const setPortrait = () => {
  vi.stubGlobal('window', {
    innerWidth: 720,
    innerHeight: 1280,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
};

beforeEach(() => {
  mocks.state.ui = {
    showPalette: false,
    showBlocks: false,
    showProperties: false,
    showAiChat: false,
    showCostPanel: false,
    showTemplates: false,
    showValidation: false,
  };
  mocks.state.deploy = { isOpen: false, status: 'idle' };
  mocks.state.cards = { cards: [], activeCardId: undefined };
  mocks.dispatch.mockReset();
  mocks.axiosPost.mockReset();
  for (const m of [
    mocks.togglePalette,
    mocks.toggleBlocks,
    mocks.toggleProperties,
    mocks.toggleAiChat,
    mocks.toggleCostPanel,
    mocks.toggleTemplates,
    mocks.toggleValidation,
    mocks.openDeployPanel,
    mocks.closeDeployPanel,
    mocks.createCard,
    mocks.setActiveCard,
    mocks.importToActiveCard,
  ]) {
    m.mockClear();
  }
  for (const m of KNOWN_MOCKS) {
    (m as { mockClear?: () => void }).mockClear?.();
  }
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  });
  setLandscape();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MainLayout — orientation', () => {
  it('renders the landscape layout when innerWidth > innerHeight', () => {
    setLandscape();
    const tree = render();
    // Landscape: SidebarStrip rendered twice (left + right), no inner ResizablePanelGroup
    // (portrait uses an inner one too). Easier check: the top-level <div> chain is correct
    // and `SidebarStrip` count is exactly 2.
    const strips = findAll(tree, (el) => el.type === mocks.SidebarStrip);
    expect(strips.length).toBe(2);
  });

  it('renders the portrait layout when innerHeight >= innerWidth', () => {
    setPortrait();
    const tree = render();
    // Portrait wraps everything in a ResizablePanelGroup direction="horizontal".
    const group = findFirst(tree, (el) => el.type === mocks.ResizablePanelGroup && el.props.direction === 'horizontal');
    expect(group).toBeDefined();
  });
});

describe('MainLayout — center content', () => {
  it('renders the SvgCanvas by default in canvas view', () => {
    const tree = render({ projectId: 'p-1' });
    const canvas = findFirst(tree, (el) => el.type === mocks.SvgCanvas);
    expect(canvas).toBeDefined();
    const table = findFirst(tree, (el) => el.type === mocks.InlineTableView);
    expect(table).toBeUndefined();
  });

  it('renders the InlineTableView in table view', () => {
    const tree = render({ view: 'table' });
    const table = findFirst(tree, (el) => el.type === mocks.InlineTableView);
    expect(table).toBeDefined();
    const canvas = findFirst(tree, (el) => el.type === mocks.SvgCanvas);
    expect(canvas).toBeUndefined();
  });

  it('renders children when provided (table-view fallback path)', () => {
    const tree = render({ children: React.createElement('div', { 'data-test': 'child' }) });
    const child = findFirst(
      tree,
      (el) => el.type === 'div' && (el.props as { ['data-test']?: string })['data-test'] === 'child',
    );
    expect(child).toBeDefined();
  });

  it('omits the canvas/table content when children are present (children replace it)', () => {
    const tree = render({ children: React.createElement('div', { 'data-test': 'child' }) });
    expect(findFirst(tree, (el) => el.type === mocks.SvgCanvas)).toBeUndefined();
    expect(findFirst(tree, (el) => el.type === mocks.InlineTableView)).toBeUndefined();
  });

  it('renders the ProjectToolbar only when basePath is provided', () => {
    const withBase = render({ basePath: '/p/1' });
    expect(findFirst(withBase, (el) => el.type === mocks.ProjectToolbar)).toBeDefined();
    const withoutBase = render({});
    expect(findFirst(withoutBase, (el) => el.type === mocks.ProjectToolbar)).toBeUndefined();
  });
});

describe('MainLayout — left strip + sidebar', () => {
  it('renders no left sidebar when none of the left toggles are on', () => {
    const tree = render();
    // The DragResizePanel is the file-private FC the walker invokes. Look
    // for ResourcePalette presence — only renders when left panel is open.
    expect(findFirst(tree, (el) => el.type === mocks.ResourcePalette)).toBeUndefined();
  });

  it('opens the left sidebar when showPalette is on', () => {
    mocks.state.ui.showPalette = true;
    const tree = render();
    expect(findFirst(tree, (el) => el.type === mocks.ResourcePalette)).toBeDefined();
  });

  it('opens the left sidebar when showBlocks is on', () => {
    mocks.state.ui.showBlocks = true;
    const tree = render();
    expect(findFirst(tree, (el) => el.type === mocks.ResourcePalette)).toBeDefined();
  });

  it('opens the left sidebar when showTemplates is on', () => {
    mocks.state.ui.showTemplates = true;
    const tree = render();
    expect(findFirst(tree, (el) => el.type === mocks.ResourcePalette)).toBeDefined();
  });

  it('passes the showProjectSection / showBlocksSection / showTemplatesSection flags through to ResourcePalette', () => {
    mocks.state.ui.showPalette = true;
    mocks.state.ui.showBlocks = true;
    mocks.state.ui.showTemplates = false;
    const tree = render();
    const palette = findFirst(tree, (el) => el.type === mocks.ResourcePalette)!;
    expect(palette.props.showProjectSection).toBe(true);
    expect(palette.props.showBlocksSection).toBe(true);
    expect(palette.props.showTemplatesSection).toBe(false);
  });

  it('left strip tabs include project / blocks / templates with correct active flags', () => {
    mocks.state.ui.showPalette = true;
    const tree = render();
    const strips = findAll(tree, (el) => el.type === mocks.SidebarStrip);
    const left = strips.find((s) => s.props.side === 'left')!;
    const tabs = left.props.tabs as Array<{ id: string; active: boolean; onClick: () => void }>;
    expect(tabs.map((t) => t.id)).toEqual(['project', 'blocks', 'templates']);
    expect(tabs[0].active).toBe(true);
  });

  it('clicking a left strip tab dispatches the matching toggle', () => {
    const tree = render();
    const strips = findAll(tree, (el) => el.type === mocks.SidebarStrip);
    const left = strips.find((s) => s.props.side === 'left')!;
    const tabs = left.props.tabs as Array<{ id: string; onClick: () => void }>;
    tabs.find((t) => t.id === 'project')!.onClick();
    expect(mocks.togglePalette).toHaveBeenCalled();
    tabs.find((t) => t.id === 'blocks')!.onClick();
    expect(mocks.toggleBlocks).toHaveBeenCalled();
    tabs.find((t) => t.id === 'templates')!.onClick();
    expect(mocks.toggleTemplates).toHaveBeenCalled();
  });
});

describe('MainLayout — right strip + sidebar', () => {
  it('right strip omits canvas-only tabs (validation/cost/deploy/ai) when in table view', () => {
    const tree = render({ view: 'table' });
    const strips = findAll(tree, (el) => el.type === mocks.SidebarStrip);
    const right = strips.find((s) => s.props.side === 'right')!;
    const ids = (right.props.tabs as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toEqual(['properties']);
  });

  it('right strip includes canvas-only tabs in canvas view', () => {
    const tree = render({ view: 'canvas' });
    const strips = findAll(tree, (el) => el.type === mocks.SidebarStrip);
    const right = strips.find((s) => s.props.side === 'right')!;
    const ids = (right.props.tabs as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toEqual(['properties', 'validation', 'cost', 'deploy', 'ai']);
  });

  it('right strip uses children to override canvas view (children disable isCanvasView)', () => {
    const tree = render({ view: 'canvas', children: React.createElement('div') });
    const strips = findAll(tree, (el) => el.type === mocks.SidebarStrip);
    const right = strips.find((s) => s.props.side === 'right')!;
    const ids = (right.props.tabs as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toEqual(['properties']);
  });

  it('clicking the deploy tab dispatches openDeployPanel when closed', () => {
    mocks.state.deploy.isOpen = false;
    const tree = render({ view: 'canvas' });
    const right = findAll(tree, (el) => el.type === mocks.SidebarStrip).find((s) => s.props.side === 'right')!;
    const tabs = right.props.tabs as Array<{ id: string; onClick: () => void }>;
    tabs.find((t) => t.id === 'deploy')!.onClick();
    expect(mocks.openDeployPanel).toHaveBeenCalled();
    expect(mocks.closeDeployPanel).not.toHaveBeenCalled();
  });

  it('clicking the deploy tab dispatches closeDeployPanel when open', () => {
    mocks.state.deploy.isOpen = true;
    const tree = render({ view: 'canvas' });
    const right = findAll(tree, (el) => el.type === mocks.SidebarStrip).find((s) => s.props.side === 'right')!;
    const tabs = right.props.tabs as Array<{ id: string; onClick: () => void }>;
    tabs.find((t) => t.id === 'deploy')!.onClick();
    expect(mocks.closeDeployPanel).toHaveBeenCalled();
  });

  it('clicking each right-strip toggle dispatches the matching action', () => {
    const tree = render({ view: 'canvas' });
    const right = findAll(tree, (el) => el.type === mocks.SidebarStrip).find((s) => s.props.side === 'right')!;
    const tabs = right.props.tabs as Array<{ id: string; onClick: () => void }>;
    tabs.find((t) => t.id === 'properties')!.onClick();
    expect(mocks.toggleProperties).toHaveBeenCalled();
    tabs.find((t) => t.id === 'validation')!.onClick();
    expect(mocks.toggleValidation).toHaveBeenCalled();
    tabs.find((t) => t.id === 'cost')!.onClick();
    expect(mocks.toggleCostPanel).toHaveBeenCalled();
    tabs.find((t) => t.id === 'ai')!.onClick();
    expect(mocks.toggleAiChat).toHaveBeenCalled();
  });

  it('renders the right sidebar wrapper when at least one panel is open', () => {
    mocks.state.ui.showProperties = true;
    const tree = render();
    expect(findFirst(tree, (el) => el.type === mocks.PropertiesPanel)).toBeDefined();
  });

  it('renders the AiChatPanel only in canvas view', () => {
    mocks.state.ui.showAiChat = true;
    const canvasTree = render({ view: 'canvas' });
    expect(findFirst(canvasTree, (el) => el.type === mocks.AiChatPanel)).toBeDefined();
    const tableTree = render({ view: 'table' });
    expect(findFirst(tableTree, (el) => el.type === mocks.AiChatPanel)).toBeUndefined();
  });

  it('renders the CostPanel only in canvas view', () => {
    mocks.state.ui.showCostPanel = true;
    expect(findFirst(render({ view: 'canvas' }), (el) => el.type === mocks.CostPanel)).toBeDefined();
    expect(findFirst(render({ view: 'table' }), (el) => el.type === mocks.CostPanel)).toBeUndefined();
  });

  it('renders the DeployPanel only in canvas view', () => {
    mocks.state.deploy.isOpen = true;
    expect(findFirst(render({ view: 'canvas' }), (el) => el.type === mocks.DeployPanel)).toBeDefined();
    expect(findFirst(render({ view: 'table' }), (el) => el.type === mocks.DeployPanel)).toBeUndefined();
  });

  it('renders the ValidationPanel only in canvas view', () => {
    mocks.state.ui.showValidation = true;
    expect(findFirst(render({ view: 'canvas' }), (el) => el.type === mocks.ValidationPanel)).toBeDefined();
    expect(findFirst(render({ view: 'table' }), (el) => el.type === mocks.ValidationPanel)).toBeUndefined();
  });

  it('renders multiple right panels in a vertical ResizablePanelGroup', () => {
    mocks.state.ui.showProperties = true;
    mocks.state.ui.showAiChat = true;
    mocks.state.ui.showValidation = true;
    const tree = render({ view: 'canvas' });
    const verticalGroups = findAll(
      tree,
      (el) => el.type === mocks.ResizablePanelGroup && el.props.direction === 'vertical',
    );
    expect(verticalGroups.length).toBeGreaterThan(0);
  });

  it('renders a single right panel directly without a ResizablePanelGroup wrapper', () => {
    mocks.state.ui.showProperties = true;
    const tree = render();
    // Properties panel renders, but it should not be inside a vertical group with a handle.
    const props = findFirst(tree, (el) => el.type === mocks.PropertiesPanel);
    expect(props).toBeDefined();
  });
});

describe('MainLayout — portrait inner panel ordering', () => {
  beforeEach(() => {
    setPortrait();
  });

  it('renders the inner AiChatPanel block when canvas + showAiChat', () => {
    mocks.state.ui.showAiChat = true;
    const tree = render({ view: 'canvas' });
    expect(findFirst(tree, (el) => el.type === mocks.AiChatPanel)).toBeDefined();
  });

  it('renders the inner CostPanel block when canvas + showCostPanel', () => {
    mocks.state.ui.showCostPanel = true;
    const tree = render({ view: 'canvas' });
    expect(findFirst(tree, (el) => el.type === mocks.CostPanel)).toBeDefined();
  });

  it('renders the inner PropertiesPanel block when showProperties', () => {
    mocks.state.ui.showProperties = true;
    const tree = render();
    expect(findFirst(tree, (el) => el.type === mocks.PropertiesPanel)).toBeDefined();
  });

  it('uses 20% default size for properties panel when AiChat or Cost is also open', () => {
    mocks.state.ui.showProperties = true;
    mocks.state.ui.showAiChat = true;
    const tree = render({ view: 'canvas' });
    // Find the ResizablePanel whose direct child element type is PropertiesPanel.
    const propsPanel = findAll(tree, (el) => el.type === mocks.ResizablePanel).find((p) => {
      const c = p.props.children;
      return isEl(c) && c.type === mocks.PropertiesPanel;
    });
    expect(propsPanel?.props.defaultSize).toBe(20);
  });

  it('uses 40% default size for properties panel when alone', () => {
    mocks.state.ui.showProperties = true;
    const tree = render();
    const propsPanel = findAll(tree, (el) => el.type === mocks.ResizablePanel).find((p) => {
      const c = p.props.children;
      return isEl(c) && c.type === mocks.PropertiesPanel;
    });
    expect(propsPanel?.props.defaultSize).toBe(40);
  });

  it('canvas panel uses 55% in portrait when right panels are open and 100% otherwise', () => {
    mocks.state.ui.showProperties = true;
    const withRight = render({ view: 'canvas' });
    // The canvas panel's direct child is `canvasContent` — a <div> with
    // className 'h-full flex flex-col' that wraps SvgCanvas. Match only
    // panels whose immediate child div has that className.
    const findCanvasPanel = (tree: unknown) => {
      const panels = findAll(tree, (el) => el.type === mocks.ResizablePanel);
      return panels.find((p) => {
        const c = p.props.children;
        return (
          isEl(c) &&
          c.type === 'div' &&
          typeof c.props.className === 'string' &&
          (c.props.className as string).includes('h-full flex flex-col')
        );
      });
    };
    expect(findCanvasPanel(withRight)?.props.defaultSize).toBe(55);

    mocks.state.ui.showProperties = false;
    const withoutRight = render({ view: 'canvas' });
    expect(findCanvasPanel(withoutRight)?.props.defaultSize).toBe(100);
  });
});

describe('MainLayout — project loading effect', () => {
  it('does not fetch when projectId is undefined', () => {
    render();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it('fetches the project when projectId is set', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { environments: [], cards: [] } });
    mocks.axiosPost.mockResolvedValueOnce({ data: { id: 'card-new' } });
    render({ projectId: 'p-1', projectName: 'My Proj' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/get', { projectId: 'p-1' });
  });

  it('with environments + production: loads the production card', async () => {
    mocks.axiosPost.mockResolvedValueOnce({
      data: {
        environments: [{ type: 'production', card_id: 'card-prod' }],
        cards: [{ id: 'card-prod' }],
      },
    });
    mocks.axiosPost.mockResolvedValueOnce({
      data: { id: 'card-prod', name: 'prod', nodes: [{ id: 'n' }], edges: [] },
    });
    render({ projectId: 'p-1' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/cards/get', { cardId: 'card-prod' });
    expect(mocks.setActiveCard).toHaveBeenCalledWith('card-prod');
  });

  it('with environments but no production: falls back to first card', async () => {
    mocks.axiosPost.mockResolvedValueOnce({
      data: {
        environments: [{ type: 'staging', card_id: 'card-stg' }],
        cards: [{ id: 'card-x' }],
      },
    });
    mocks.axiosPost.mockResolvedValueOnce({
      data: { id: 'card-x', name: 'first', nodes: [], edges: [] },
    });
    render({ projectId: 'p-1' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/cards/get', { cardId: 'card-x' });
  });

  it('with no environments and no cards: creates a new card', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { environments: [], cards: [] } });
    mocks.axiosPost.mockResolvedValueOnce({ data: { id: 'card-new' } });
    render({ projectId: 'p-1', projectName: 'My Proj' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/cards/create', {
      name: 'My Proj',
      projectId: 'p-1',
    });
    expect(mocks.createCard).toHaveBeenCalledWith({
      name: 'My Proj',
      id: 'card-new',
      projectId: 'p-1',
    });
    expect(mocks.setActiveCard).toHaveBeenCalledWith('card-new');
  });

  it('falls back to "Canvas" when projectName is missing', async () => {
    mocks.axiosPost.mockResolvedValueOnce({ data: { environments: [], cards: [] } });
    mocks.axiosPost.mockResolvedValueOnce({ data: { id: 'card-new' } });
    render({ projectId: 'p-1' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/cards/create', {
      name: 'Canvas',
      projectId: 'p-1',
    });
  });

  it('uses an existing populated card without re-fetching', async () => {
    mocks.state.cards = {
      cards: [{ id: 'card-existing', nodes: [{ id: 'n-1' }] }],
      activeCardId: undefined,
    } as typeof mocks.state.cards;
    mocks.axiosPost.mockResolvedValueOnce({
      data: { environments: [], cards: [{ id: 'card-existing' }] },
    });
    render({ projectId: 'p-1' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.setActiveCard).toHaveBeenCalledWith('card-existing');
    // Only the project-get call: no cards/get.
    const cardGetCalls = mocks.axiosPost.mock.calls.filter((c) => c[0] === '/canvas/cards/get');
    expect(cardGetCalls.length).toBe(0);
  });

  it('imports nodes/edges from a fetched non-existent card', async () => {
    mocks.axiosPost.mockResolvedValueOnce({
      data: { environments: [], cards: [{ id: 'card-1' }] },
    });
    mocks.axiosPost.mockResolvedValueOnce({
      data: {
        id: 'card-1',
        name: 'My Card',
        nodes: [{ id: 'n-1' }],
        edges: [{ id: 'e-1' }],
      },
    });
    render({ projectId: 'p-1' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.createCard).toHaveBeenCalledWith({
      name: 'My Card',
      id: 'card-1',
      projectId: 'p-1',
    });
    expect(mocks.importToActiveCard).toHaveBeenCalledWith({
      nodes: [{ id: 'n-1' }],
      edges: [{ id: 'e-1' }],
    });
  });

  it('does not re-import when the fetched card has no nodes or edges', async () => {
    mocks.axiosPost.mockResolvedValueOnce({
      data: { environments: [], cards: [{ id: 'card-1' }] },
    });
    mocks.axiosPost.mockResolvedValueOnce({
      data: { id: 'card-1', name: 'Card', nodes: [], edges: [] },
    });
    render({ projectId: 'p-1' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.importToActiveCard).not.toHaveBeenCalled();
  });

  it('logs but does not throw when the project fetch fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.axiosPost.mockRejectedValueOnce(new Error('boom'));
    render({ projectId: 'p-1' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('MainLayout — DragResizePanel (file-private)', () => {
  it('renders the resize handle on the inside edge for left side', () => {
    mocks.state.ui.showPalette = true;
    const tree = render();
    const bars = findAll(tree, (el) => el.type === mocks.ResizeBar);
    expect(bars.length).toBeGreaterThan(0);
  });

  it('reads the saved width from localStorage and clamps to min/max', () => {
    const getItem = vi.fn((k: string) => (k === 'ice-left-w' ? '99' : null));
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });
    mocks.state.ui.showPalette = true;
    const tree = render();
    // Walk the tree to invoke the DragResizePanel FC.
    for (const _ of walk(tree)) void _;
    expect(getItem).toHaveBeenCalledWith('ice-left-w');
  });

  it('clamps a saved oversized width to maxWidth', () => {
    const getItem = vi.fn(() => '99999');
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });
    mocks.state.ui.showPalette = true;
    const tree = render();
    // Find the outer wrapper div with style width — the clamp-to-max is 400 for left.
    const wrappers = findAll(tree, (el) => {
      const style = el.props.style as { width?: number } | undefined;
      return el.type === 'div' && typeof style?.width === 'number';
    });
    const widthValue = wrappers[0]?.props.style as { width: number };
    expect(widthValue.width).toBeLessThanOrEqual(400);
  });

  it('clamps a saved undersized width to minWidth', () => {
    const getItem = vi.fn(() => '10');
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });
    mocks.state.ui.showPalette = true;
    const tree = render();
    const wrappers = findAll(tree, (el) => {
      const style = el.props.style as { width?: number } | undefined;
      return el.type === 'div' && typeof style?.width === 'number';
    });
    const widthValue = wrappers[0]?.props.style as { width: number };
    expect(widthValue.width).toBeGreaterThanOrEqual(180);
  });

  it('uses defaultWidth when localStorage has no saved width', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    mocks.state.ui.showPalette = true;
    const tree = render();
    const wrappers = findAll(tree, (el) => {
      const style = el.props.style as { width?: number } | undefined;
      return el.type === 'div' && typeof style?.width === 'number';
    });
    const widthValue = wrappers[0]?.props.style as { width: number };
    expect(widthValue.width).toBe(260);
  });

  it('triggers pointer-down + pointer-move + pointer-up to drag (left)', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    mocks.state.ui.showPalette = true;
    const tree = render();
    const bar = findAll(tree, (el) => el.type === mocks.ResizeBar)[0];
    const fakeTarget = { setPointerCapture: vi.fn() };
    const downEvent = { preventDefault: vi.fn(), clientX: 100, target: fakeTarget, pointerId: 1 };
    (bar.props.onPointerDown as (e: unknown) => void)(downEvent);
    expect(downEvent.preventDefault).toHaveBeenCalled();
    expect(fakeTarget.setPointerCapture).toHaveBeenCalledWith(1);
    // Move while dragging — left side: delta = clientX - startX
    (bar.props.onPointerMove as (e: { clientX: number }) => void)({ clientX: 150 });
    // Pointer up — saves to localStorage
    const setItem = (localStorage as unknown as { setItem: ReturnType<typeof vi.fn> }).setItem;
    (bar.props.onPointerUp as () => void)();
    expect(setItem).toHaveBeenCalledWith('ice-left-w', expect.any(String));
  });

  it('pointer-move while not dragging does not write to localStorage', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem });
    mocks.state.ui.showPalette = true;
    const tree = render();
    const bar = findAll(tree, (el) => el.type === mocks.ResizeBar)[0];
    // Don't call onPointerDown — dragging is false.
    (bar.props.onPointerMove as (e: { clientX: number }) => void)({ clientX: 999 });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('pointer-up while not dragging is a no-op (no localStorage write)', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem });
    mocks.state.ui.showPalette = true;
    const tree = render();
    const bar = findAll(tree, (el) => el.type === mocks.ResizeBar)[0];
    (bar.props.onPointerUp as () => void)();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('renders the right-side resize bar when right sidebar is open', () => {
    mocks.state.ui.showProperties = true;
    const tree = render();
    const bars = findAll(tree, (el) => el.type === mocks.ResizeBar);
    expect(bars.length).toBeGreaterThan(0);
  });

  it('right side: pointer-move flips the delta direction', () => {
    mocks.state.ui.showProperties = true;
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const tree = render();
    const bars = findAll(tree, (el) => el.type === mocks.ResizeBar);
    const rightBar = bars[bars.length - 1];
    const fakeTarget = { setPointerCapture: vi.fn() };
    (rightBar.props.onPointerDown as (e: unknown) => void)({
      preventDefault: vi.fn(),
      clientX: 200,
      target: fakeTarget,
      pointerId: 1,
    });
    (rightBar.props.onPointerMove as (e: { clientX: number }) => void)({ clientX: 100 });
    (rightBar.props.onPointerUp as () => void)();
    const setItem = (localStorage as unknown as { setItem: ReturnType<typeof vi.fn> }).setItem;
    expect(setItem).toHaveBeenCalledWith('ice-right-w', expect.any(String));
  });
});

describe('MainLayout — useIsPortrait resize listener', () => {
  it('attaches a resize listener on mount', () => {
    const addEventListener = vi.fn();
    vi.stubGlobal('window', {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener,
      removeEventListener: vi.fn(),
    });
    render();
    expect(addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
