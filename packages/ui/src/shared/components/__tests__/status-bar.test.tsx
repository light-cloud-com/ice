/**
 * StatusBar tests — direct-FC tree-walker pattern.
 *
 * Mocks useSelector / useDispatch, useSystemStats, IntegrationStatusDots,
 * deriveRollup/deriveRollupPercentage, parseCostRange, openValidation.
 *
 * The component's body invokes useSelector eight times (activeCard,
 * graph, selection, activePaneId, panes, validation.summary, plus two in
 * DeployStatusIndicator). We pass a single state blob; selectors call it
 * directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  dispatch: vi.fn(),
  selectActiveCard: vi.fn(() => null as unknown),
  deriveRollup: vi.fn(() => ({ ok: 0, total: 0 })),
  deriveRollupPercentage: vi.fn(() => 0),
  parseCostRange: vi.fn(() => 0),
  openValidation: vi.fn(() => ({ type: 'ui/openValidation' })),
  useSystemStats: vi.fn(() => null as null | { ram: number; cpu: number }),
  IntegrationStatusDots: vi.fn(() => null),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(init: T | (() => T)): [T, (v: T) => void] => {
    const v = typeof init === 'function' ? (init as () => T)() : init;
    return [v, vi.fn()];
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
  // status-bar passes shallowEqual as the second arg to useSelector for
  // deployNodesById; the mock ignores it.
  shallowEqual: () => true,
}));

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({
    // Render the key + interpolated values so tests can assert on key+pct.
    t: (k: string, params?: Record<string, unknown>) => (params ? `${k}:${JSON.stringify(params)}` : k),
  }),
}));

vi.mock('../../../features/cost/utils/cost-calculator', () => ({
  parseCostRange: mocks.parseCostRange,
}));

vi.mock('../../../features/integrations', () => ({
  IntegrationStatusDots: mocks.IntegrationStatusDots,
}));

vi.mock('../../../store/slices/cards-slice', () => ({
  selectActiveCard: mocks.selectActiveCard,
}));

vi.mock('../../../store/slices/deploy-slice', () => ({
  deriveRollup: mocks.deriveRollup,
  deriveRollupPercentage: mocks.deriveRollupPercentage,
}));

vi.mock('../../../store/slices/ui-slice', () => ({
  openValidation: mocks.openValidation,
}));

vi.mock('../../hooks/use-system-stats', () => ({
  useSystemStats: mocks.useSystemStats,
}));

import { StatusBar } from '../status-bar';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

const KNOWN_MOCKS = [mocks.IntegrationStatusDots] as const;

function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if ((KNOWN_MOCKS as readonly unknown[]).includes(node.type)) {
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

function collectText(tree: unknown): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = el.props.children;
    if (typeof c === 'string') s += c;
    else if (typeof c === 'number') s += String(c);
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
        else if (typeof item === 'number') s += String(item);
      }
    }
  }
  return s;
}

const callRender = (): unknown => (StatusBar as unknown as () => unknown)();

const baseState = () => ({
  graph: { isDirty: false, iceGraph: null },
  selection: { selectedNodes: [], selectedEdges: [] },
  ui: {
    splitView: {
      activePaneId: undefined,
      panes: [],
    },
  },
  validation: undefined,
  deploy: {
    status: 'idle' as const,
    nodesById: {},
  },
});

beforeEach(() => {
  mocks.state = baseState();
  mocks.dispatch.mockReset();
  mocks.selectActiveCard.mockReset();
  mocks.selectActiveCard.mockReturnValue(null);
  mocks.deriveRollup.mockReset();
  mocks.deriveRollup.mockReturnValue({ ok: 0, total: 0 });
  mocks.deriveRollupPercentage.mockReset();
  mocks.deriveRollupPercentage.mockReturnValue(0);
  mocks.parseCostRange.mockReset();
  mocks.parseCostRange.mockReturnValue(0);
  mocks.openValidation.mockClear();
  mocks.useSystemStats.mockReset();
  mocks.useSystemStats.mockReturnValue(null);
  mocks.IntegrationStatusDots.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StatusBar — graph name', () => {
  it("renders the active card's name when present", () => {
    mocks.selectActiveCard.mockReturnValue({
      name: 'My Card',
      nodes: [],
      edges: [],
    });
    const tree = callRender();
    expect(collectText(tree)).toContain('My Card');
  });

  it('falls back to iceGraph.name when no active card', () => {
    (mocks.state as Record<string, unknown>).graph = {
      isDirty: false,
      iceGraph: { name: 'IceGraph!' },
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('IceGraph!');
  });

  it("falls back to t('common.labels.untitled') when neither is set", () => {
    const tree = callRender();
    expect(collectText(tree)).toContain('common.labels.untitled');
  });

  it('renders the dirty indicator (filled circle) when isDirty', () => {
    (mocks.state as Record<string, unknown>).graph = { isDirty: true, iceGraph: null };
    const tree = callRender();
    const dirtyCircle = findFirst(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('fill-current') &&
        (el.props.className as string).includes('text-ice-accent'),
    );
    expect(dirtyCircle).toBeDefined();
  });

  it('does not render the dirty indicator when isDirty is false', () => {
    const tree = callRender();
    const dirtyCircle = findFirst(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        (el.props.className as string).includes('text-ice-accent') &&
        (el.props.className as string).includes('fill-current'),
    );
    expect(dirtyCircle).toBeUndefined();
  });
});

describe('StatusBar — node / edge count pluralisation', () => {
  it('uses singular form for 1 node', () => {
    mocks.selectActiveCard.mockReturnValue({ name: 'C', nodes: [{ id: 'n' }], edges: [] });
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.node');
    expect(collectText(tree)).not.toContain('statusBar.nodes');
  });

  it('uses plural form for >1 nodes', () => {
    mocks.selectActiveCard.mockReturnValue({
      name: 'C',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [],
    });
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.nodes');
  });

  it('uses plural form for 0 nodes (the `!== 1` predicate)', () => {
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.nodes');
  });

  it('uses singular form for 1 edge', () => {
    mocks.selectActiveCard.mockReturnValue({ name: 'C', nodes: [], edges: [{ id: 'e' }] });
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.edge');
  });

  it('uses plural form for >1 edges', () => {
    mocks.selectActiveCard.mockReturnValue({
      name: 'C',
      nodes: [],
      edges: [{ id: 'a' }, { id: 'b' }],
    });
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.edges');
  });
});

describe('StatusBar — cost rollup', () => {
  it('does not render the cost section when totalCost is 0', () => {
    mocks.selectActiveCard.mockReturnValue({ name: 'C', nodes: [], edges: [] });
    const tree = callRender();
    expect(collectText(tree)).not.toContain('statusBar.moEst');
  });

  it('sums each node estimatedCost via parseCostRange', () => {
    (mocks.parseCostRange as any).mockImplementation((s: unknown) => (s === '$10' ? 10 : s === '$5' ? 5 : 0));
    mocks.selectActiveCard.mockReturnValue({
      name: 'C',
      nodes: [
        { id: 'a', data: { estimatedCost: '$10' } },
        { id: 'b', data: { estimatedCost: '$5' } },
      ],
      edges: [],
    });
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('$15');
    expect(text).toContain('statusBar.moEst');
  });

  it('uses empty-string fallback when node.data.estimatedCost is missing', () => {
    mocks.parseCostRange.mockReturnValue(0);
    mocks.selectActiveCard.mockReturnValue({
      name: 'C',
      nodes: [{ id: 'a' }, { id: 'b', data: {} }],
      edges: [],
    });
    callRender();
    expect(mocks.parseCostRange).toHaveBeenCalledWith('');
  });

  it('returns 0 when activeCard is null (memo guard)', () => {
    mocks.selectActiveCard.mockReturnValue(null);
    const tree = callRender();
    expect(collectText(tree)).not.toContain('statusBar.moEst');
  });
});

describe('StatusBar — selection summary', () => {
  it('does not render selection block when nothing selected', () => {
    const tree = callRender();
    expect(collectText(tree)).not.toContain('statusBar.selectedCount');
  });

  it('renders nodes-only selection text', () => {
    (mocks.state as Record<string, unknown>).selection = {
      selectedNodes: ['a', 'b'],
      selectedEdges: [],
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.selectedCount');
  });

  it('renders edges-only selection text', () => {
    (mocks.state as Record<string, unknown>).selection = {
      selectedNodes: [],
      selectedEdges: ['e'],
    };
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('statusBar.edge');
    expect(text).not.toContain('statusBar.selectedCount');
  });

  it('renders mixed selection text with comma between', () => {
    (mocks.state as Record<string, unknown>).selection = {
      selectedNodes: ['a'],
      selectedEdges: ['e'],
    };
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('statusBar.selectedCount');
    expect(text).toContain(', ');
  });

  it('selected edges plural form when count > 1', () => {
    (mocks.state as Record<string, unknown>).selection = {
      selectedNodes: [],
      selectedEdges: ['e1', 'e2'],
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.edges');
  });

  it('selected edges singular form when count === 1', () => {
    (mocks.state as Record<string, unknown>).selection = {
      selectedNodes: [],
      selectedEdges: ['e1'],
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.edge');
  });
});

describe('StatusBar — validation pill', () => {
  it("renders 'valid' state when no errors and no warnings", () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('statusBar.valid');
    expect(text).not.toContain('statusBar.error');
  });

  it('renders error count + plural label when errors > 1', () => {
    (mocks.state as Record<string, unknown>).validation = {
      summary: { errors: 3, warnings: 0 },
    };
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('statusBar.errors');
    expect(text).toContain('3');
  });

  it('renders error count + singular label when errors === 1', () => {
    (mocks.state as Record<string, unknown>).validation = {
      summary: { errors: 1, warnings: 0 },
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.error');
  });

  it('renders warnings count when warnings > 0', () => {
    (mocks.state as Record<string, unknown>).validation = {
      summary: { errors: 0, warnings: 2 },
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('2');
  });

  it('renders warnings alongside errors', () => {
    (mocks.state as Record<string, unknown>).validation = {
      summary: { errors: 1, warnings: 1 },
    };
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('statusBar.error');
    expect(text).toContain('1');
  });

  it('clicking the validation button when issues exist dispatches openValidation', () => {
    (mocks.state as Record<string, unknown>).validation = {
      summary: { errors: 2, warnings: 0 },
    };
    const tree = callRender();
    const btn = findFirst(tree, (el) => el.type === 'button' && typeof el.props.onClick === 'function')!;
    (btn.props.onClick as () => void)();
    expect(mocks.openValidation).toHaveBeenCalled();
  });

  it('clicking the validation button when no issues does NOT dispatch openValidation', () => {
    const tree = callRender();
    const btn = findFirst(tree, (el) => el.type === 'button' && typeof el.props.onClick === 'function')!;
    (btn.props.onClick as () => void)();
    expect(mocks.openValidation).not.toHaveBeenCalled();
  });

  it('handles a validation slice that is undefined (?? 0 fallback)', () => {
    (mocks.state as Record<string, unknown>).validation = undefined;
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.valid');
  });

  it('handles a validation.summary that is undefined (?? 0 fallback)', () => {
    (mocks.state as Record<string, unknown>).validation = {};
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.valid');
  });
});

describe('StatusBar — zoom level', () => {
  it('renders zoom from card viewport when no active pane', () => {
    mocks.selectActiveCard.mockReturnValue({
      name: 'C',
      nodes: [],
      edges: [],
      viewport: { scale: 0.5 },
    });
    const tree = callRender();
    expect(collectText(tree)).toContain('50%');
  });

  it('renders zoom from active pane when its scale != 1', () => {
    mocks.selectActiveCard.mockReturnValue({
      name: 'C',
      nodes: [],
      edges: [],
      viewport: { scale: 0.5 },
    });
    (mocks.state as Record<string, unknown>).ui = {
      splitView: {
        activePaneId: 'pane-1',
        panes: [{ id: 'pane-1', viewport: { scale: 2.0 } }],
      },
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('200%');
  });

  it('falls back to card scale when pane scale is 1 (the !==1 check fails)', () => {
    mocks.selectActiveCard.mockReturnValue({
      name: 'C',
      nodes: [],
      edges: [],
      viewport: { scale: 0.75 },
    });
    (mocks.state as Record<string, unknown>).ui = {
      splitView: {
        activePaneId: 'pane-1',
        panes: [{ id: 'pane-1', viewport: { scale: 1 } }],
      },
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('75%');
  });

  it('uses 100% when no card and no pane viewport', () => {
    const tree = callRender();
    expect(collectText(tree)).toContain('100%');
  });

  it('falls back to card scale when active pane viewport is undefined', () => {
    mocks.selectActiveCard.mockReturnValue({
      name: 'C',
      nodes: [],
      edges: [],
      viewport: { scale: 0.5 },
    });
    (mocks.state as Record<string, unknown>).ui = {
      splitView: {
        activePaneId: 'pane-1',
        panes: [{ id: 'pane-1' }],
      },
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('50%');
  });
});

describe('StatusBar — system stats row', () => {
  it('does not render when systemStats is null', () => {
    const tree = callRender();
    expect(collectText(tree)).not.toContain('statusBar.ram');
    expect(collectText(tree)).not.toContain('statusBar.cpu');
  });

  it('renders RAM in MB when below 1024', () => {
    mocks.useSystemStats.mockReturnValue({ ram: 512, cpu: 30 });
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('statusBar.ram');
    expect(text).toContain('512MB');
    expect(text).toContain('30%');
  });

  it('renders RAM in GB when ≥1024', () => {
    mocks.useSystemStats.mockReturnValue({ ram: 2048, cpu: 50 });
    const tree = callRender();
    expect(collectText(tree)).toContain('2.0GB');
  });
});

describe('StatusBar — IntegrationStatusDots is rendered', () => {
  it('renders the IntegrationStatusDots child', () => {
    const tree = callRender();
    expect(findFirst(tree, (el) => el.type === mocks.IntegrationStatusDots)).toBeDefined();
  });

  it('renders the version pill', () => {
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.version');
  });
});

describe('StatusBar — DeployStatusIndicator', () => {
  it('returns null when deploy.status === idle (no deploy section text)', () => {
    const tree = callRender();
    expect(collectText(tree)).not.toContain('statusBar.connecting');
    expect(collectText(tree)).not.toContain('statusBar.deploying');
    expect(collectText(tree)).not.toContain('statusBar.planning');
    expect(collectText(tree)).not.toContain('statusBar.deployed');
    expect(collectText(tree)).not.toContain('statusBar.deployFailed');
    expect(collectText(tree)).not.toContain('statusBar.planReady');
  });

  it('renders the authenticating banner', () => {
    (mocks.state as Record<string, unknown>).deploy = {
      status: 'authenticating',
      nodesById: {},
    };
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.connecting');
  });

  it('renders the deploying banner with rollup percentage', () => {
    (mocks.state as Record<string, unknown>).deploy = {
      status: 'deploying',
      nodesById: { a: {} },
    };
    mocks.deriveRollup.mockReturnValue({ ok: 1, total: 4 });
    mocks.deriveRollupPercentage.mockReturnValue(25);
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('statusBar.deploying');
    expect(text).toContain('"pct":25');
    expect(mocks.deriveRollup).toHaveBeenCalledWith({ a: {} });
  });

  it('renders the planning banner', () => {
    (mocks.state as Record<string, unknown>).deploy = { status: 'planning', nodesById: {} };
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.planning');
  });

  it('renders the success banner', () => {
    (mocks.state as Record<string, unknown>).deploy = { status: 'success', nodesById: {} };
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.deployed');
  });

  it('renders the error banner', () => {
    (mocks.state as Record<string, unknown>).deploy = { status: 'error', nodesById: {} };
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.deployFailed');
  });

  it('renders the planned banner', () => {
    (mocks.state as Record<string, unknown>).deploy = { status: 'planned', nodesById: {} };
    const tree = callRender();
    expect(collectText(tree)).toContain('statusBar.planReady');
  });
});
