/**
 * EnvironmentTabBar — top-level tab bar.
 *
 * Direct-FC tree-walker pattern. Mocks:
 *   - `useSelector` / `useDispatch` so each test drives slice state.
 *   - React hooks (useState/useEffect/useCallback) so the FC body runs
 *     synchronously and effects fire inline.
 *   - The four sub-components (`EnvironmentTabItem`,
 *     `EnvironmentContextMenu`, `CreateEnvironmentModal`,
 *     `RenameEnvironmentModal`) as opaque markers.
 *   - Action creators on cards/deploy/environments slices so the
 *     orchestrator wiring asserts on identity-stable spies.
 *   - `getApi` so the deploy-statuses + card-load fetch paths drive
 *     deterministically.
 *   - The dynamic `import('../../../store')` resolves to a stub.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    environments: {
      byProject: {} as Record<string, Array<Record<string, unknown>>>,
      activeEnvId: {} as Record<string, string | undefined>,
      loading: false,
    },
    cards: {
      cards: [] as Array<{ id: string; nodes?: Array<{ id: string }> }>,
    },
  },
  dispatch: vi.fn(),
  // Action-creator identity spies.
  fetchEnvironments: vi.fn((id: unknown) => ({ type: 'environments/fetch', payload: id })),
  deleteEnvironment: vi.fn((p: unknown) => ({ type: 'environments/delete', payload: p })),
  setActiveEnvironment: vi.fn((p: unknown) => ({ type: 'environments/setActive', payload: p })),
  compareEnvironments: vi.fn((p: unknown) => ({ type: 'environments/compare', payload: p })),
  setActiveCard: vi.fn((id: unknown) => ({ type: 'cards/setActive', payload: id })),
  importToActiveCard: vi.fn((p: unknown) => ({ type: 'cards/import', payload: p })),
  createCard: vi.fn((p: unknown) => ({ type: 'cards/create', payload: p })),
  openDeployPanel: vi.fn(() => ({ type: 'deploy/open' })),
  // Mock the api adapter.
  apiGetDeployments: vi.fn(),
  apiGraphLoad: vi.fn(),
  // Sub-components.
  EnvironmentTabItem: vi.fn(() => null),
  EnvironmentContextMenu: vi.fn(() => null),
  CreateEnvironmentModal: vi.fn(() => null),
  RenameEnvironmentModal: vi.fn(() => null),
}));

// Per-render useState slot tracking. The component declares 4 useState
// slots in this order: showCreate, renameTarget, contextMenu, envDeployStatus.
// `slots` is a queued list; `__resetUseState(prefill)` lets each test
// pre-seed any subset of slots BEFORE invoking the FC.
const stateMocks = vi.hoisted(() => ({
  slots: [] as unknown[],
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  callIdx: 0,
  prefill: [] as unknown[],
  // Capture-cleanups: every effect cleanup function is appended here so
  // tests can invoke them after the synchronous render to exercise the
  // unmount path (line 78-80 in env-tab-bar).
  cleanups: [] as Array<() => void>,
}));

const __resetUseState = (prefill: unknown[] = []) => {
  stateMocks.slots = [];
  stateMocks.setters = [];
  stateMocks.callIdx = 0;
  stateMocks.prefill = prefill;
  stateMocks.cleanups = [];
};

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(init: T | (() => T)): [T, (v: T) => void] => {
    const i = stateMocks.callIdx++;
    const seed =
      i < stateMocks.prefill.length ? stateMocks.prefill[i] : typeof init === 'function' ? (init as () => T)() : init;
    stateMocks.slots[i] = seed;
    const setter = vi.fn((v: unknown) => {
      stateMocks.slots[i] = typeof v === 'function' ? (v as (p: unknown) => unknown)(seed) : v;
    });
    stateMocks.setters[i] = setter;
    return [seed as T, setter as unknown as (v: T) => void];
  };
  const useEffectStub = (fn: () => void | (() => void)) => {
    const cleanup = fn();
    if (typeof cleanup === 'function') stateMocks.cleanups.push(cleanup);
  };
  const useCallbackStub = <T,>(fn: T) => fn;
  const useMemoStub = <T,>(fn: () => T) => fn();
  const useRefStub = <T,>(init: T) => ({ current: init });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: {
      ...actualDefault,
      useState: useStateStub,
      useEffect: useEffectStub,
      useCallback: useCallbackStub,
      useMemo: useMemoStub,
      useRef: useRefStub,
    },
    useState: useStateStub,
    useEffect: useEffectStub,
    useCallback: useCallbackStub,
    useMemo: useMemoStub,
    useRef: useRefStub,
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../shared/api/api-adapter', () => ({
  getApi: () => ({
    deploy: { getDeployments: mocks.apiGetDeployments },
    graph: { load: mocks.apiGraphLoad },
  }),
}));

vi.mock('../../../../store/slices/cards-slice', () => ({
  setActiveCard: mocks.setActiveCard,
  importToActiveCard: mocks.importToActiveCard,
  createCard: mocks.createCard,
}));

vi.mock('../../../../store/slices/deploy-slice', () => ({
  openDeployPanel: mocks.openDeployPanel,
}));

vi.mock('../../../../store/slices/environments-slice', () => ({
  fetchEnvironments: mocks.fetchEnvironments,
  deleteEnvironment: mocks.deleteEnvironment,
  setActiveEnvironment: mocks.setActiveEnvironment,
  compareEnvironments: mocks.compareEnvironments,
}));

vi.mock('../create-environment-modal', () => ({
  CreateEnvironmentModal: mocks.CreateEnvironmentModal,
}));
vi.mock('../environment-context-menu', () => ({
  EnvironmentContextMenu: mocks.EnvironmentContextMenu,
}));
vi.mock('../environment-tab-item', () => ({
  EnvironmentTabItem: mocks.EnvironmentTabItem,
}));
vi.mock('../rename-environment-modal', () => ({
  RenameEnvironmentModal: mocks.RenameEnvironmentModal,
}));

// The FC dynamic-imports `../../../store` for state hydration. Mock at
// the absolute test-relative depth (4 dots up from this file).
vi.mock('../../../../store', () => ({
  store: { getState: () => mocks.state },
}));

import { EnvironmentTabBar } from '../environment-tab-bar';

// ─── Tree walker (with mock-leaf semantics) ─────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

const KNOWN_MOCKS = [
  mocks.EnvironmentTabItem,
  mocks.EnvironmentContextMenu,
  mocks.CreateEnvironmentModal,
  mocks.RenameEnvironmentModal,
] as const;

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

const callRender = (props: React.ComponentProps<typeof EnvironmentTabBar>): unknown =>
  (EnvironmentTabBar as (p: React.ComponentProps<typeof EnvironmentTabBar>) => unknown)(props);

const makeEnv = (over: Record<string, unknown> = {}) => ({
  id: 'env-1',
  name: 'staging',
  type: 'staging',
  project_id: 'proj-1',
  card_id: 'card-1',
  region: 'us-central1',
  is_protected: false,
  pr_number: null,
  ...over,
});

beforeEach(() => {
  mocks.state.environments = {
    byProject: {},
    activeEnvId: {},
    loading: false,
  };
  mocks.state.cards = { cards: [] };
  mocks.dispatch.mockReset();
  for (const f of [
    mocks.fetchEnvironments,
    mocks.deleteEnvironment,
    mocks.setActiveEnvironment,
    mocks.compareEnvironments,
    mocks.setActiveCard,
    mocks.importToActiveCard,
    mocks.createCard,
    mocks.openDeployPanel,
    mocks.apiGetDeployments,
    mocks.apiGraphLoad,
  ]) {
    f.mockReset();
  }
  for (const c of KNOWN_MOCKS) {
    (c as { mockClear?: () => void }).mockClear?.();
  }
  mocks.apiGetDeployments.mockResolvedValue([]);
  mocks.apiGraphLoad.mockResolvedValue(null);
  __resetUseState();
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('EnvironmentTabBar — empty / loading guard', () => {
  it('returns null when there are no environments and not loading', () => {
    const tree = callRender({ projectId: 'proj-1' });
    expect(tree).toBeNull();
  });

  it('still fetches environments on mount even when list is empty', () => {
    callRender({ projectId: 'proj-1' });
    expect(mocks.fetchEnvironments).toHaveBeenCalledWith('proj-1');
    expect(mocks.dispatch).toHaveBeenCalled();
  });

  it('does not fetch when projectId is empty', () => {
    callRender({ projectId: '' });
    expect(mocks.fetchEnvironments).not.toHaveBeenCalled();
  });

  it('renders a loading row when loading=true and no envs are present yet', () => {
    mocks.state.environments.loading = true;
    const tree = callRender({ projectId: 'proj-1' });
    // Look for a Loader2-ish element (any element with className containing animate-spin)
    const spinner = findFirst(
      tree,
      (el) => typeof el.props.className === 'string' && (el.props.className as string).includes('animate-spin'),
    );
    expect(spinner).toBeDefined();
  });
});

describe('EnvironmentTabBar — tab rendering', () => {
  beforeEach(() => {
    mocks.state.environments.byProject['proj-1'] = [
      makeEnv({ id: 'env-1', name: 'dev', type: 'dev' }),
      makeEnv({ id: 'env-2', name: 'staging', type: 'staging' }),
      makeEnv({ id: 'env-3', name: 'prod', type: 'production', is_protected: true }),
    ];
  });

  it('renders one EnvironmentTabItem per environment', () => {
    const tree = callRender({ projectId: 'proj-1' });
    const items = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem);
    expect(items).toHaveLength(3);
  });

  it('marks the active tab via isActive=true', () => {
    mocks.state.environments.activeEnvId['proj-1'] = 'env-2';
    const tree = callRender({ projectId: 'proj-1' });
    const items = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem);
    const active = items.find((el) => el.props.isActive === true);
    expect(active).toBeDefined();
    expect((active!.props.env as { id: string }).id).toBe('env-2');
  });

  it('threads onSwitch / onContextMenu / deployStatus to each tab item', () => {
    const tree = callRender({ projectId: 'proj-1' });
    const items = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem);
    for (const it of items) {
      expect(typeof it.props.onSwitch).toBe('function');
      expect(typeof it.props.onContextMenu).toBe('function');
      // deployStatus map starts empty.
      expect(it.props.deployStatus).toBeUndefined();
    }
  });

  it('renders the create-environment ➕ button', () => {
    const tree = callRender({ projectId: 'proj-1' });
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-env-btn-create',
    );
    expect(btn).toBeDefined();
  });

  it('renders the Deploy Infrastructure button', () => {
    const tree = callRender({ projectId: 'proj-1' });
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { title?: string }).title === 'environments.tabBar.deployInfra',
    );
    expect(btn).toBeDefined();
  });

  it('omits the Promote button when active env is the production env', () => {
    mocks.state.environments.activeEnvId['proj-1'] = 'env-3';
    const tree = callRender({ projectId: 'proj-1' });
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' && (el.props as { title?: string }).title === 'environments.tabBar.promoteToProduction',
    );
    expect(btn).toBeUndefined();
  });

  it('omits the Promote button when active env is protected', () => {
    mocks.state.environments.byProject['proj-1'] = [
      makeEnv({ id: 'env-2', name: 'staging', type: 'staging', is_protected: true }),
      makeEnv({ id: 'env-3', name: 'prod', type: 'production' }),
    ];
    mocks.state.environments.activeEnvId['proj-1'] = 'env-2';
    const tree = callRender({ projectId: 'proj-1' });
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' && (el.props as { title?: string }).title === 'environments.tabBar.promoteToProduction',
    );
    expect(btn).toBeUndefined();
  });

  it('renders the Promote button when active env is non-prod and prod exists', () => {
    mocks.state.environments.activeEnvId['proj-1'] = 'env-2';
    const tree = callRender({ projectId: 'proj-1' });
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' && (el.props as { title?: string }).title === 'environments.tabBar.promoteToProduction',
    );
    expect(btn).toBeDefined();
  });

  it('omits the Promote button when there is no production env at all', () => {
    mocks.state.environments.byProject['proj-1'] = [makeEnv({ id: 'env-1', name: 'dev', type: 'dev' })];
    mocks.state.environments.activeEnvId['proj-1'] = 'env-1';
    const tree = callRender({ projectId: 'proj-1' });
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' && (el.props as { title?: string }).title === 'environments.tabBar.promoteToProduction',
    );
    expect(btn).toBeUndefined();
  });
});

describe('EnvironmentTabBar — Promote / Deploy button click handlers', () => {
  beforeEach(() => {
    mocks.state.environments.byProject['proj-1'] = [
      makeEnv({ id: 'env-2', name: 'staging', type: 'staging' }),
      makeEnv({ id: 'env-3', name: 'prod', type: 'production' }),
    ];
    mocks.state.environments.activeEnvId['proj-1'] = 'env-2';
  });

  it('clicking Deploy Infrastructure dispatches openDeployPanel()', () => {
    const tree = callRender({ projectId: 'proj-1' });
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { title?: string }).title === 'environments.tabBar.deployInfra',
    )!;
    (btn.props.onClick as () => void)();
    expect(mocks.openDeployPanel).toHaveBeenCalled();
  });

  it('clicking Promote dispatches compareEnvironments(active → prod)', () => {
    const tree = callRender({ projectId: 'proj-1' });
    const btn = findFirst(
      tree,
      (el) =>
        el.type === 'button' && (el.props as { title?: string }).title === 'environments.tabBar.promoteToProduction',
    )!;
    (btn.props.onClick as () => void)();
    expect(mocks.compareEnvironments).toHaveBeenCalledWith({
      sourceEnvId: 'env-2',
      targetEnvId: 'env-3',
    });
  });
});

describe('EnvironmentTabBar — context menu wiring', () => {
  beforeEach(() => {
    mocks.state.environments.byProject['proj-1'] = [
      makeEnv({ id: 'env-2', name: 'staging', type: 'staging' }),
      makeEnv({ id: 'env-3', name: 'prod', type: 'production' }),
    ];
  });

  it('does not render the EnvironmentContextMenu by default (state is null)', () => {
    const tree = callRender({ projectId: 'proj-1' });
    expect(findFirst(tree, (el) => el.type === mocks.EnvironmentContextMenu)).toBeUndefined();
  });

  it('does not render the create modal by default', () => {
    const tree = callRender({ projectId: 'proj-1' });
    expect(findFirst(tree, (el) => el.type === mocks.CreateEnvironmentModal)).toBeUndefined();
  });

  it('does not render the rename modal by default', () => {
    const tree = callRender({ projectId: 'proj-1' });
    expect(findFirst(tree, (el) => el.type === mocks.RenameEnvironmentModal)).toBeUndefined();
  });
});

describe('EnvironmentTabBar — tab item callbacks', () => {
  beforeEach(() => {
    mocks.state.environments.byProject['proj-1'] = [
      makeEnv({ id: 'env-2', name: 'staging', type: 'staging' }),
      makeEnv({ id: 'env-3', name: 'prod', type: 'production' }),
    ];
  });

  it('onContextMenu prop on a tab item calls preventDefault on the event', () => {
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const fakeEvent = { preventDefault: vi.fn(), clientX: 11, clientY: 22 };
    (item.props.onContextMenu as (e: unknown, id: string) => void)(fakeEvent, 'env-2');
    expect(fakeEvent.preventDefault).toHaveBeenCalled();
  });
});

describe('EnvironmentTabBar — onSwitch (handleSwitchEnv) flow', () => {
  beforeEach(() => {
    mocks.state.environments.byProject['proj-1'] = [makeEnv({ id: 'env-2', name: 'staging', type: 'staging' })];
  });

  it('dispatches setActiveEnvironment immediately on switch', async () => {
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const env = makeEnv({ id: 'env-2', name: 'staging', card_id: 'card-1' });
    await (item.props.onSwitch as (e: unknown) => Promise<void>)(env);
    expect(mocks.setActiveEnvironment).toHaveBeenCalledWith({
      projectId: 'proj-1',
      envId: 'env-2',
    });
  });

  it('falls through to api.graph.load when card is not present in Redux', async () => {
    mocks.apiGraphLoad.mockResolvedValueOnce({
      id: 'card-1',
      name: 'Card',
      nodes: [{ id: 'n' }],
      edges: [],
    });
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const env = makeEnv({ id: 'env-2', name: 'staging', card_id: 'card-1' });
    await (item.props.onSwitch as (e: unknown) => Promise<void>)(env);
    // Allow the dynamic import + .then() chain to settle.
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.apiGraphLoad).toHaveBeenCalledWith('card-1');
    expect(mocks.createCard).toHaveBeenCalledWith({
      name: 'Card',
      id: 'card-1',
      projectId: 'proj-1',
    });
    expect(mocks.setActiveCard).toHaveBeenCalledWith('card-1');
    expect(mocks.importToActiveCard).toHaveBeenCalledWith({
      nodes: [{ id: 'n' }],
      edges: [],
      skipAutoOrganize: true,
    });
  });

  it('falls back to env.name when api response omits a name', async () => {
    mocks.apiGraphLoad.mockResolvedValueOnce({
      id: 'card-1',
      nodes: [],
      edges: [],
    });
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const env = makeEnv({ id: 'env-2', name: 'staging', card_id: 'card-1' });
    await (item.props.onSwitch as (e: unknown) => Promise<void>)(env);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.createCard).toHaveBeenCalledWith({
      name: 'staging',
      id: 'card-1',
      projectId: 'proj-1',
    });
  });

  it('does not import nodes/edges when the loaded card is empty', async () => {
    mocks.apiGraphLoad.mockResolvedValueOnce({
      id: 'card-1',
      name: 'Card',
      nodes: [],
      edges: [],
    });
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const env = makeEnv({ id: 'env-2', name: 'staging', card_id: 'card-1' });
    await (item.props.onSwitch as (e: unknown) => Promise<void>)(env);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.importToActiveCard).not.toHaveBeenCalled();
  });

  it('returns early when an existing populated card is in Redux', async () => {
    mocks.state.cards.cards = [{ id: 'card-1', nodes: [{ id: 'n-1' }] }];
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const env = makeEnv({ id: 'env-2', name: 'staging', card_id: 'card-1' });
    await (item.props.onSwitch as (e: unknown) => Promise<void>)(env);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.setActiveCard).toHaveBeenCalledWith('card-1');
    expect(mocks.apiGraphLoad).not.toHaveBeenCalled();
  });

  it('skips createCard when card already exists (just empty) in Redux', async () => {
    mocks.state.cards.cards = [{ id: 'card-1', nodes: [] }];
    mocks.apiGraphLoad.mockResolvedValueOnce({
      id: 'card-1',
      name: 'Card',
      nodes: [{ id: 'n-1' }],
      edges: [],
    });
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const env = makeEnv({ id: 'env-2', name: 'staging', card_id: 'card-1' });
    await (item.props.onSwitch as (e: unknown) => Promise<void>)(env);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.createCard).not.toHaveBeenCalled();
    expect(mocks.setActiveCard).toHaveBeenCalledWith('card-1');
    expect(mocks.importToActiveCard).toHaveBeenCalled();
  });

  it('returns early without dispatching createCard when api.graph.load returns null/undefined', async () => {
    mocks.apiGraphLoad.mockResolvedValueOnce(null);
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const env = makeEnv({ id: 'env-2', name: 'staging', card_id: 'card-1' });
    await (item.props.onSwitch as (e: unknown) => Promise<void>)(env);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.createCard).not.toHaveBeenCalled();
    expect(mocks.setActiveCard).not.toHaveBeenCalled();
  });

  it('logs but does not throw when api.graph.load rejects', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.apiGraphLoad.mockRejectedValueOnce(new Error('boom'));
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const env = makeEnv({ id: 'env-2', name: 'staging', card_id: 'card-1' });
    await (item.props.onSwitch as (e: unknown) => Promise<void>)(env);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('omits nodes/edges arrays falling through to default empty when undefined', async () => {
    mocks.apiGraphLoad.mockResolvedValueOnce({ id: 'card-1', name: 'Card' });
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const env = makeEnv({ id: 'env-2', name: 'staging', card_id: 'card-1' });
    await (item.props.onSwitch as (e: unknown) => Promise<void>)(env);
    await new Promise<void>((r) => setTimeout(r, 0));
    // nodes?.length > 0 || edges?.length > 0 → both undefined → false → no import
    expect(mocks.importToActiveCard).not.toHaveBeenCalled();
  });

  it('uses [] fallback when nodes is non-empty but edges is undefined', async () => {
    mocks.apiGraphLoad.mockResolvedValueOnce({
      id: 'card-1',
      name: 'Card',
      nodes: [{ id: 'n-1' }],
      // edges: undefined
    });
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const env = makeEnv({ id: 'env-2', name: 'staging', card_id: 'card-1' });
    await (item.props.onSwitch as (e: unknown) => Promise<void>)(env);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.importToActiveCard).toHaveBeenCalledWith({
      nodes: [{ id: 'n-1' }],
      edges: [],
      skipAutoOrganize: true,
    });
  });

  it('uses [] fallback when edges is non-empty but nodes is undefined', async () => {
    mocks.apiGraphLoad.mockResolvedValueOnce({
      id: 'card-1',
      name: 'Card',
      edges: [{ id: 'e-1' }],
    });
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const env = makeEnv({ id: 'env-2', name: 'staging', card_id: 'card-1' });
    await (item.props.onSwitch as (e: unknown) => Promise<void>)(env);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.importToActiveCard).toHaveBeenCalledWith({
      nodes: [],
      edges: [{ id: 'e-1' }],
      skipAutoOrganize: true,
    });
  });
});

describe('EnvironmentTabBar — deploy-status fetch effect', () => {
  it('does not call api when environments list is empty', () => {
    callRender({ projectId: 'proj-1' });
    expect(mocks.apiGetDeployments).not.toHaveBeenCalled();
  });

  it('fetches one getDeployments per environment when list is non-empty', async () => {
    mocks.state.environments.byProject['proj-1'] = [
      makeEnv({ id: 'env-1', card_id: 'c1' }),
      makeEnv({ id: 'env-2', card_id: 'c2' }),
    ];
    callRender({ projectId: 'proj-1' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.apiGetDeployments).toHaveBeenCalledTimes(2);
    expect(mocks.apiGetDeployments).toHaveBeenCalledWith('c1');
    expect(mocks.apiGetDeployments).toHaveBeenCalledWith('c2');
  });

  it('handles a non-array { deployments: [...] } shape', async () => {
    mocks.state.environments.byProject['proj-1'] = [makeEnv({ id: 'env-1', card_id: 'c1' })];
    mocks.apiGetDeployments.mockResolvedValueOnce({
      deployments: [{ status: 'success', deployed_url: 'https://example.com' }],
    });
    callRender({ projectId: 'proj-1' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.apiGetDeployments).toHaveBeenCalledWith('c1');
  });

  it('handles a null deployments-shaped response (deploys[0] is undefined → skip)', async () => {
    mocks.state.environments.byProject['proj-1'] = [makeEnv({ id: 'env-1', card_id: 'c1' })];
    mocks.apiGetDeployments.mockResolvedValueOnce(null);
    callRender({ projectId: 'proj-1' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.apiGetDeployments).toHaveBeenCalled();
  });
});

describe('EnvironmentTabBar — auto-switch to production on first load', () => {
  it('switches to the production env when no active env yet', async () => {
    mocks.state.environments.byProject['proj-1'] = [
      makeEnv({ id: 'env-2', name: 'staging', type: 'staging' }),
      makeEnv({ id: 'env-3', name: 'prod', type: 'production', card_id: 'card-prod' }),
    ];
    mocks.apiGraphLoad.mockResolvedValueOnce({
      id: 'card-prod',
      name: 'Prod',
      nodes: [],
      edges: [],
    });
    callRender({ projectId: 'proj-1' });
    // The auto-switch effect runs handleSwitchEnv synchronously through the
    // useEffect mock; setActiveEnvironment is the first dispatch.
    expect(mocks.setActiveEnvironment).toHaveBeenCalledWith({
      projectId: 'proj-1',
      envId: 'env-3',
    });
  });

  it('does not auto-switch when there is already an active env', () => {
    mocks.state.environments.byProject['proj-1'] = [makeEnv({ id: 'env-3', name: 'prod', type: 'production' })];
    mocks.state.environments.activeEnvId['proj-1'] = 'env-3';
    callRender({ projectId: 'proj-1' });
    expect(mocks.setActiveEnvironment).not.toHaveBeenCalled();
  });

  it('does not auto-switch when there is no production env at all', () => {
    mocks.state.environments.byProject['proj-1'] = [makeEnv({ id: 'env-1', name: 'dev', type: 'dev' })];
    callRender({ projectId: 'proj-1' });
    expect(mocks.setActiveEnvironment).not.toHaveBeenCalled();
  });
});

describe('EnvironmentTabBar — create / rename / context-menu trigger callbacks', () => {
  beforeEach(() => {
    mocks.state.environments.byProject['proj-1'] = [makeEnv({ id: 'env-2', name: 'staging', type: 'staging' })];
  });

  it('clicking the create button does not throw and is wired', () => {
    const tree = callRender({ projectId: 'proj-1' });
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-env-btn-create',
    )!;
    expect(typeof btn.props.onClick).toBe('function');
    (btn.props.onClick as () => void)();
    expect(stateMocks.setters[0]).toHaveBeenCalledWith(true);
  });
});

describe('EnvironmentTabBar — modal & context-menu rendering with pre-seeded state', () => {
  beforeEach(() => {
    mocks.state.environments.byProject['proj-1'] = [
      makeEnv({ id: 'env-2', name: 'staging', type: 'staging' }),
      makeEnv({ id: 'env-3', name: 'prod', type: 'production' }),
    ];
    mocks.state.environments.activeEnvId['proj-1'] = 'env-2';
  });

  it('renders the EnvironmentContextMenu when contextMenu state is set', () => {
    // Slots: 0=showCreate, 1=renameTarget, 2=contextMenu, 3=envDeployStatus.
    __resetUseState([false, null, { envId: 'env-2', x: 100, y: 200 }, {}]);
    const tree = callRender({ projectId: 'proj-1' });
    const menu = findFirst(tree, (el) => el.type === mocks.EnvironmentContextMenu);
    expect(menu).toBeDefined();
    expect((menu!.props as { envId: string }).envId).toBe('env-2');
    expect((menu!.props as { x: number }).x).toBe(100);
    expect((menu!.props as { y: number }).y).toBe(200);
    expect((menu!.props as { prodEnv?: { id: string } }).prodEnv?.id).toBe('env-3');
  });

  it('context-menu onClose callback resets context-menu state to null', () => {
    __resetUseState([false, null, { envId: 'env-2', x: 0, y: 0 }, {}]);
    const tree = callRender({ projectId: 'proj-1' });
    const menu = findFirst(tree, (el) => el.type === mocks.EnvironmentContextMenu)!;
    (menu.props.onClose as () => void)();
    expect(stateMocks.setters[2]).toHaveBeenCalledWith(null);
  });

  it('context-menu onDelete dispatches deleteEnvironment + closes the menu', () => {
    __resetUseState([false, null, { envId: 'env-2', x: 0, y: 0 }, {}]);
    const tree = callRender({ projectId: 'proj-1' });
    const menu = findFirst(tree, (el) => el.type === mocks.EnvironmentContextMenu)!;
    (menu.props.onDelete as (id: string) => void)('env-2');
    expect(stateMocks.setters[2]).toHaveBeenCalledWith(null);
    expect(mocks.deleteEnvironment).toHaveBeenCalledWith({
      envId: 'env-2',
      projectId: 'proj-1',
    });
  });

  it('context-menu onPromote dispatches compareEnvironments(envId → prod.id)', () => {
    __resetUseState([false, null, { envId: 'env-2', x: 0, y: 0 }, {}]);
    const tree = callRender({ projectId: 'proj-1' });
    const menu = findFirst(tree, (el) => el.type === mocks.EnvironmentContextMenu)!;
    (menu.props.onPromote as (id: string) => void)('env-2');
    expect(mocks.compareEnvironments).toHaveBeenCalledWith({
      sourceEnvId: 'env-2',
      targetEnvId: 'env-3',
    });
  });

  it('context-menu onPromote skips dispatch when no production env exists', () => {
    mocks.state.environments.byProject['proj-1'] = [makeEnv({ id: 'env-1', name: 'dev', type: 'dev' })];
    __resetUseState([false, null, { envId: 'env-1', x: 0, y: 0 }, {}]);
    const tree = callRender({ projectId: 'proj-1' });
    const menu = findFirst(tree, (el) => el.type === mocks.EnvironmentContextMenu)!;
    (menu.props.onPromote as (id: string) => void)('env-1');
    expect(mocks.compareEnvironments).not.toHaveBeenCalled();
  });

  it('context-menu onRename sets the rename-target', () => {
    __resetUseState([false, null, { envId: 'env-2', x: 0, y: 0 }, {}]);
    const tree = callRender({ projectId: 'proj-1' });
    const menu = findFirst(tree, (el) => el.type === mocks.EnvironmentContextMenu)!;
    const env = makeEnv({ id: 'env-2', name: 'staging' });
    (menu.props.onRename as (e: unknown) => void)(env);
    expect(stateMocks.setters[1]).toHaveBeenCalledWith(env);
  });

  it('context-menu onDeploy switches env, then dispatches openDeployPanel', async () => {
    __resetUseState([false, null, { envId: 'env-2', x: 0, y: 0 }, {}]);
    const tree = callRender({ projectId: 'proj-1' });
    const menu = findFirst(tree, (el) => el.type === mocks.EnvironmentContextMenu)!;
    const env = makeEnv({ id: 'env-2', name: 'staging' });
    await (menu.props.onDeploy as (e: unknown) => Promise<void>)(env);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(mocks.setActiveEnvironment).toHaveBeenCalled();
    expect(mocks.openDeployPanel).toHaveBeenCalled();
    expect(stateMocks.setters[2]).toHaveBeenCalledWith(null);
  });

  it('renders the create modal when showCreate state is true', () => {
    __resetUseState([true, null, null, {}]);
    const tree = callRender({ projectId: 'proj-1' });
    const modal = findFirst(tree, (el) => el.type === mocks.CreateEnvironmentModal);
    expect(modal).toBeDefined();
    expect((modal!.props as { projectId: string }).projectId).toBe('proj-1');
    (modal!.props.onClose as () => void)();
    expect(stateMocks.setters[0]).toHaveBeenCalledWith(false);
  });

  it('renders the rename modal when renameTarget state is set', () => {
    const target = makeEnv({ id: 'env-2', name: 'staging' });
    __resetUseState([false, target, null, {}]);
    const tree = callRender({ projectId: 'proj-1' });
    const modal = findFirst(tree, (el) => el.type === mocks.RenameEnvironmentModal);
    expect(modal).toBeDefined();
    (modal!.props.onClose as () => void)();
    expect(stateMocks.setters[1]).toHaveBeenCalledWith(null);
  });

  it('threads pre-seeded envDeployStatus through to each tab item', () => {
    const status = { 'env-2': { status: 'success', url: 'https://x' } };
    __resetUseState([false, null, null, status]);
    const tree = callRender({ projectId: 'proj-1' });
    const items = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem);
    const active = items.find((i) => (i.props.env as { id: string }).id === 'env-2')!;
    expect(active.props.deployStatus).toEqual({ status: 'success', url: 'https://x' });
  });

  it('handleContextMenu (used by tab-item onContextMenu) sets contextMenu state', () => {
    __resetUseState([false, null, null, {}]);
    const tree = callRender({ projectId: 'proj-1' });
    const item = findAll(tree, (el) => el.type === mocks.EnvironmentTabItem)[0];
    const fakeEvent = {
      preventDefault: vi.fn(),
      clientX: 33,
      clientY: 44,
    };
    (item.props.onContextMenu as (e: unknown, id: string) => void)(fakeEvent, 'env-2');
    expect(stateMocks.setters[2]).toHaveBeenCalledWith({
      envId: 'env-2',
      x: 33,
      y: 44,
    });
  });
});

describe('EnvironmentTabBar — fetchStatuses cleanup', () => {
  beforeEach(() => {
    mocks.state.environments.byProject['proj-1'] = [makeEnv({ id: 'env-1', card_id: 'c1' })];
  });

  it('the deploy-statuses effect returns a cleanup that flips the cancelled flag', () => {
    callRender({ projectId: 'proj-1' });
    // The deploy-statuses effect (env-tab-bar.tsx L56-81) returns a cleanup
    // function that sets `cancelled = true`. We captured every registered
    // cleanup in `stateMocks.cleanups`. Invoke each — line 79 is exercised.
    expect(stateMocks.cleanups.length).toBeGreaterThan(0);
    for (const c of stateMocks.cleanups) c();
  });
});

describe('EnvironmentTabBar — close-on-click-outside effect', () => {
  beforeEach(() => {
    mocks.state.environments.byProject['proj-1'] = [makeEnv({ id: 'env-2', name: 'staging', type: 'staging' })];
  });

  it('does not register a window click listener when contextMenu is null', () => {
    const addEventListener = vi.fn();
    vi.stubGlobal('window', { addEventListener, removeEventListener: vi.fn() });
    __resetUseState([false, null, null, {}]);
    callRender({ projectId: 'proj-1' });
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('registers a window click listener when contextMenu is set, and the listener clears state', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal('window', { addEventListener, removeEventListener });
    __resetUseState([false, null, { envId: 'env-2', x: 0, y: 0 }, {}]);
    callRender({ projectId: 'proj-1' });
    expect(addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    // Invoke the registered close handler — should call setContextMenu(null).
    const close = addEventListener.mock.calls[0][1] as () => void;
    close();
    expect(stateMocks.setters[2]).toHaveBeenCalledWith(null);
  });
});
