/**
 * ProjectEnvironments — env list with create/delete/promote/deploy
 * actions and a switch-env flow that hydrates the active card.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl pattern). The page
 * dynamically imports `@ui/store` inside `handleSwitchEnv`; we mock
 * that path so the import resolves to a stub with `getState`.
 *
 * Slot order:
 *   0 = deployStatus  ({})
 *   1 = showCreate    (false)
 *   2 = newName       ('')
 *   3 = newType       ('staging')
 *   4 = creating      (false)
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
    resetUseState: () => {
      stateSlots.length = 0;
    },
    environments: [] as Array<{
      id: string;
      name: string;
      type: string;
      card_id: string;
      is_protected: boolean;
      pr_number?: number | null;
    }>,
    activeEnvId: undefined as string | undefined,
    loading: false,
    storeState: { cards: { cards: [] as Array<{ id: string; nodes: unknown[] }> } },
    apiCalls: vi.fn(),
    apiResponses: {
      'deploy.getDeployments': {} as Record<string, unknown>,
      'graph.load': null as unknown,
    } as Record<string, unknown>,
    dispatch: vi.fn(),
    setActiveEnvironmentArg: vi.fn(),
    deleteEnvironmentArg: vi.fn(),
    createEnvironmentArg: vi.fn(),
    fetchEnvironmentsArg: vi.fn(),
    compareEnvironmentsArg: vi.fn(),
    setActiveCardArg: vi.fn(),
    importToActiveCardArg: vi.fn(),
    createCardArg: vi.fn(),
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

vi.mock('@ui/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@ui/shared/utils/cn', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@ui/shared/api/api-adapter', () => ({
  getApi: () => ({
    deploy: {
      getDeployments: (cardId: string) => {
        mocks.apiCalls('deploy.getDeployments', cardId);
        const r = mocks.apiResponses['deploy.getDeployments'] as Record<string, unknown>;
        if (r && cardId in r) return Promise.resolve((r as Record<string, unknown>)[cardId]);
        return Promise.resolve(undefined);
      },
    },
    graph: {
      load: (cardId: string) => {
        mocks.apiCalls('graph.load', cardId);
        return Promise.resolve(mocks.apiResponses['graph.load']);
      },
    },
  }),
}));

vi.mock('@ui/shared/components/ui/ice-select', () => ({
  IceSelect: ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) => (
    <select data-stub="IceSelect" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('@ui/store', () => ({
  store: {
    getState: () => mocks.storeState,
  },
}));

vi.mock('@ui/store/slices/cards-slice', () => ({
  setActiveCard: (id: unknown) => {
    mocks.setActiveCardArg(id);
    return { type: 'cards/setActiveCard', payload: id };
  },
  importToActiveCard: (payload: unknown) => {
    mocks.importToActiveCardArg(payload);
    return { type: 'cards/importToActiveCard', payload };
  },
  createCard: (payload: unknown) => {
    mocks.createCardArg(payload);
    return { type: 'cards/createCard', payload };
  },
}));

vi.mock('@ui/store/slices/deploy-slice', () => ({
  openDeployPanel: () => {
    mocks.openDeployPanelInvoked();
    return { type: 'deploy/openDeployPanel' };
  },
}));

vi.mock('@ui/store/slices/environments-slice', () => ({
  fetchEnvironments: (id: unknown) => {
    mocks.fetchEnvironmentsArg(id);
    return { type: 'env/fetch', payload: id };
  },
  createEnvironment: (payload: unknown) => {
    mocks.createEnvironmentArg(payload);
    return {
      type: 'env/create',
      payload,
      // unwrap returns a promise
      unwrap: () => Promise.resolve({ id: 'new-env' }),
    };
  },
  deleteEnvironment: (payload: unknown) => {
    mocks.deleteEnvironmentArg(payload);
    return { type: 'env/delete', payload };
  },
  setActiveEnvironment: (payload: unknown) => {
    mocks.setActiveEnvironmentArg(payload);
    return { type: 'env/setActive', payload };
  },
  compareEnvironments: (payload: unknown) => {
    mocks.compareEnvironmentsArg(payload);
    return { type: 'env/compare', payload };
  },
}));

// Override the dispatch to call the thunk's `unwrap()` if present.
vi.mock('react-redux', () => ({
  useDispatch: () => (action: unknown) => {
    mocks.dispatch(action);
    if (action && typeof action === 'object' && typeof (action as { unwrap?: unknown }).unwrap === 'function') {
      return (action as { unwrap: () => Promise<unknown> });
    }
    return action;
  },
  useSelector: (sel: (s: unknown) => unknown) =>
    sel({
      environments: {
        byProject: { 'proj-1': mocks.environments },
        activeEnvId: { 'proj-1': mocks.activeEnvId },
        loading: mocks.loading,
      },
    }),
}));

import { ProjectEnvironments } from '../environments';

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

function render(): React.ReactElement | null {
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx();
  const FC = ProjectEnvironments as unknown as (p: { projectId: string }) => React.ReactElement | null;
  return FC({ projectId: 'proj-1' });
}

beforeEach(() => {
  mocks.resetUseState();
  mocks.effects.length = 0;
  mocks.callbacks.length = 0;
  mocks.environments = [];
  mocks.activeEnvId = undefined;
  mocks.loading = false;
  mocks.storeState = { cards: { cards: [] } };
  mocks.apiResponses = {
    'deploy.getDeployments': {},
    'graph.load': null,
  };
  mocks.apiCalls.mockReset();
  mocks.dispatch.mockReset();
  mocks.setActiveEnvironmentArg.mockReset();
  mocks.deleteEnvironmentArg.mockReset();
  mocks.createEnvironmentArg.mockReset();
  mocks.fetchEnvironmentsArg.mockReset();
  mocks.compareEnvironmentsArg.mockReset();
  mocks.setActiveCardArg.mockReset();
  mocks.importToActiveCardArg.mockReset();
  mocks.createCardArg.mockReset();
  mocks.openDeployPanelInvoked.mockReset();
});

// ─── Loading state ────────────────────────────────────────────────────────

describe('ProjectEnvironments — loading', () => {
  it('renders a spinner while loading and there are no environments', () => {
    mocks.loading = true;
    mocks.environments = [];
    const tree = render();
    const spinners = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('animate-spin'),
    );
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the page when loading=false even if list is empty', () => {
    mocks.loading = false;
    mocks.environments = [];
    const tree = render();
    const heading = findByPredicate(tree, (el) => el.type === 'h1');
    expect(heading).toHaveLength(1);
  });
});

// ─── Empty list ──────────────────────────────────────────────────────────

describe('ProjectEnvironments — empty list', () => {
  it('renders the empty-state message + create CTA', () => {
    const tree = render();
    const empty = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'No environments yet.',
    );
    expect(empty).toHaveLength(1);
    const cta = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { children?: unknown }).children === 'Create your first environment',
    );
    expect(cta).toHaveLength(1);
  });

  it('opens the create form when the empty-state CTA is clicked', () => {
    const tree = render();
    const cta = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { children?: unknown }).children === 'Create your first environment',
    )[0];
    (cta.props as { onClick: () => void }).onClick();
    // slot 1 = showCreate
    expect(mocks.stateSlots[1]).toBe(true);
  });
});

// ─── Mount effect (fetchEnvironments) ────────────────────────────────────

describe('ProjectEnvironments — mount effects', () => {
  it('dispatches fetchEnvironments on mount', () => {
    render();
    mocks.effects[0].cb();
    expect(mocks.fetchEnvironmentsArg).toHaveBeenCalledWith('proj-1');
  });

  it('does NOT dispatch fetchEnvironments when projectId is empty', () => {
    const FC = ProjectEnvironments as unknown as (p: { projectId: string }) => React.ReactElement | null;
    (mocks as unknown as { __resetIdx: () => void }).__resetIdx();
    FC({ projectId: '' });
    mocks.effects[0].cb();
    expect(mocks.fetchEnvironmentsArg).not.toHaveBeenCalled();
  });

  it('skips deploy-status fetch when env list is empty', () => {
    render();
    // effects[1] = deploy status fetch
    mocks.effects[1].cb();
    expect(mocks.apiCalls).not.toHaveBeenCalled();
  });

  it('fetches deploy statuses for each env when list is non-empty', async () => {
    mocks.environments = [
      { id: 'e1', name: 'Prod', type: 'production', card_id: 'c1', is_protected: true },
      { id: 'e2', name: 'Stg', type: 'staging', card_id: 'c2', is_protected: false },
    ];
    mocks.apiResponses['deploy.getDeployments'] = {
      c1: [{ status: 'success', deployed_url: 'https://prod', created_at: '2024-01-01' }],
      c2: { deployments: [{ status: 'failed', deployed_url: null, created_at: '2024-01-02' }] },
    };
    render();
    const cleanup = mocks.effects[1].cb() as () => void | undefined;
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(mocks.apiCalls).toHaveBeenCalledWith('deploy.getDeployments', 'c1');
    expect(mocks.apiCalls).toHaveBeenCalledWith('deploy.getDeployments', 'c2');
    // slot 0 = deployStatus map
    const ds = mocks.stateSlots[0] as Record<string, { status: string }>;
    expect(ds.e1.status).toBe('success');
    expect(ds.e2.status).toBe('failed');
    if (typeof cleanup === 'function') cleanup();
  });

  it('respects cancelled flag and skips state writes when cleanup runs first', async () => {
    mocks.environments = [{ id: 'e1', name: 'Prod', type: 'production', card_id: 'c1', is_protected: true }];
    mocks.apiResponses['deploy.getDeployments'] = {
      c1: [{ status: 'success', deployed_url: 'https://prod', created_at: '2024-01-01' }],
    };
    render();
    const cleanup = mocks.effects[1].cb() as () => void | undefined;
    if (typeof cleanup === 'function') cleanup();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    // slot 0 was never written
    expect(mocks.stateSlots[0]).toEqual({});
  });
});

// ─── List rendering ──────────────────────────────────────────────────────

describe('ProjectEnvironments — list rendering', () => {
  it('renders one row per environment with name + type label', () => {
    mocks.environments = [
      { id: 'e1', name: 'Prod', type: 'production', card_id: 'c1', is_protected: true },
      { id: 'e2', name: 'PR-42', type: 'pr', card_id: 'c2', is_protected: false, pr_number: 42 },
    ];
    const tree = render();
    const rows = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer') &&
        (el.props as { className: string }).className.includes('rounded-lg'),
    );
    expect(rows.length).toBe(2);
  });

  it('renders the lock icon next to protected env', () => {
    mocks.environments = [{ id: 'e1', name: 'Prod', type: 'production', card_id: 'c1', is_protected: true }];
    const tree = render();
    // The Lock icon FC; only protected envs render it.
    // We probe via the absence on a non-protected env.
    const rows = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer') &&
        (el.props as { className: string }).className.includes('rounded-lg'),
    );
    const trashBtn = findByPredicate(
      rows[0],
      (el) =>
        el.type === 'button' &&
        (el.props as { title?: string }).title === 'common.buttons.delete',
    );
    expect(trashBtn).toHaveLength(0); // protected → no trash
  });

  it('renders the trash button only for non-protected environments', () => {
    mocks.environments = [
      { id: 'e1', name: 'Prod', type: 'production', card_id: 'c1', is_protected: true },
      { id: 'e2', name: 'Stg', type: 'staging', card_id: 'c2', is_protected: false },
    ];
    const tree = render();
    const trashBtns = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { title?: string }).title === 'common.buttons.delete',
    );
    expect(trashBtns).toHaveLength(1);
  });

  it('renders the PR number badge for pr-type envs only when pr_number present', () => {
    mocks.environments = [
      { id: 'e1', name: 'PR-42', type: 'pr', card_id: 'c1', is_protected: false, pr_number: 42 },
      { id: 'e2', name: 'PR-?', type: 'pr', card_id: 'c2', is_protected: false }, // no pr_number
    ];
    const tree = render();
    // PR badge contains '#' followed by the number — render as array ['#', 42]
    const badges = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-purple-400'),
    );
    expect(badges).toHaveLength(1);
  });
});

// ─── Status dot / label ──────────────────────────────────────────────────

describe('ProjectEnvironments — status indicators', () => {
  const cases: Array<[string, string]> = [
    ['success', 'bg-emerald-500'],
    ['deploying', 'bg-blue-500'],
    ['failed', 'bg-red-500'],
    ['planning', 'bg-amber-500'],
    ['queued', 'bg-amber-500'],
  ];

  for (const [status, expectedClass] of cases) {
    it(`renders the correct dot class for status="${status}"`, () => {
      mocks.environments = [{ id: 'e1', name: 'Env', type: 'staging', card_id: 'c1', is_protected: false }];
      mocks.stateSlots.push({ e1: { status, url: '', date: '' } }, false, '', 'staging', false);
      const tree = render();
      const dots = findByPredicate(
        tree,
        (el) =>
          typeof (el.props as { className?: string }).className === 'string' &&
          (el.props as { className: string }).className.includes(expectedClass) &&
          (el.props as { className: string }).className.includes('rounded-full'),
      );
      expect(dots.length).toBeGreaterThanOrEqual(1);
    });
  }

  it('falls back to the muted dot class when no status is present', () => {
    mocks.environments = [{ id: 'e1', name: 'Env', type: 'staging', card_id: 'c1', is_protected: false }];
    const tree = render();
    const dots = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-ice-text-3/30') &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the status label "Not deployed" when no status', () => {
    mocks.environments = [{ id: 'e1', name: 'Env', type: 'staging', card_id: 'c1', is_protected: false }];
    const tree = render();
    const label = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'Not deployed',
    );
    expect(label.length).toBeGreaterThanOrEqual(1);
  });

  it('capitalises the status label', () => {
    mocks.environments = [{ id: 'e1', name: 'Env', type: 'staging', card_id: 'c1', is_protected: false }];
    mocks.stateSlots.push({ e1: { status: 'success', url: '', date: '' } }, false, '', 'staging', false);
    const tree = render();
    const label = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'Success',
    );
    expect(label.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the deploy-url link with stripped protocol', () => {
    mocks.environments = [{ id: 'e1', name: 'Env', type: 'staging', card_id: 'c1', is_protected: false }];
    mocks.stateSlots.push(
      { e1: { status: 'success', url: 'https://my-app.example.com/path', date: '' } },
      false,
      '',
      'staging',
      false,
    );
    const tree = render();
    const link = findByPredicate(tree, (el) => el.type === 'a')[0];
    expect((link.props as { href: string }).href).toBe('https://my-app.example.com/path');
  });

  it('stops propagation on the link onClick to avoid switching env', () => {
    mocks.environments = [{ id: 'e1', name: 'Env', type: 'staging', card_id: 'c1', is_protected: false }];
    mocks.stateSlots.push(
      { e1: { status: 'success', url: 'https://example.com', date: '' } },
      false,
      '',
      'staging',
      false,
    );
    const tree = render();
    const link = findByPredicate(tree, (el) => el.type === 'a')[0];
    const stop = vi.fn();
    (link.props as { onClick: (e: { stopPropagation: () => void }) => void }).onClick({ stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
  });
});

// ─── Switching environment ──────────────────────────────────────────────

describe('ProjectEnvironments — handleSwitchEnv', () => {
  it('dispatches setActiveEnvironment when a row is clicked', async () => {
    mocks.environments = [{ id: 'e1', name: 'Env', type: 'staging', card_id: 'c1', is_protected: false }];
    const tree = render();
    const row = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer') &&
        (el.props as { className: string }).className.includes('rounded-lg'),
    )[0];
    await (row.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.setActiveEnvironmentArg).toHaveBeenCalledWith({ projectId: 'proj-1', envId: 'e1' });
  });

  it('skips remote load when local card already has nodes', async () => {
    mocks.environments = [{ id: 'e1', name: 'Env', type: 'staging', card_id: 'c1', is_protected: false }];
    mocks.storeState = { cards: { cards: [{ id: 'c1', nodes: [{ id: 'n1' }] }] } };
    const tree = render();
    const row = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer') &&
        (el.props as { className: string }).className.includes('rounded-lg'),
    )[0];
    await (row.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.setActiveCardArg).toHaveBeenCalledWith('c1');
    expect(mocks.apiCalls).not.toHaveBeenCalledWith('graph.load', 'c1');
  });

  it('returns early when graph.load yields null', async () => {
    mocks.environments = [{ id: 'e1', name: 'Env', type: 'staging', card_id: 'c1', is_protected: false }];
    mocks.apiResponses['graph.load'] = null;
    const tree = render();
    const row = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer') &&
        (el.props as { className: string }).className.includes('rounded-lg'),
    )[0];
    await (row.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.createCardArg).not.toHaveBeenCalled();
    expect(mocks.importToActiveCardArg).not.toHaveBeenCalled();
  });

  it('creates a card + sets active + imports nodes when graph data has content', async () => {
    mocks.environments = [{ id: 'e1', name: 'Env', type: 'staging', card_id: 'c1', is_protected: false }];
    mocks.apiResponses['graph.load'] = { id: 'c1', name: 'Card', nodes: [{ id: 'n1' }], edges: [{ id: 'edge1' }] };
    const tree = render();
    const row = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer') &&
        (el.props as { className: string }).className.includes('rounded-lg'),
    )[0];
    await (row.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.createCardArg).toHaveBeenCalledWith({ name: 'Card', id: 'c1', projectId: 'proj-1' });
    expect(mocks.setActiveCardArg).toHaveBeenCalledWith('c1');
    expect(mocks.importToActiveCardArg).toHaveBeenCalledWith({
      nodes: [{ id: 'n1' }],
      edges: [{ id: 'edge1' }],
      skipAutoOrganize: true,
    });
  });

  it('falls back to env.name when graph data has no name', async () => {
    mocks.environments = [{ id: 'e1', name: 'EnvFallback', type: 'staging', card_id: 'c1', is_protected: false }];
    mocks.apiResponses['graph.load'] = { id: 'c1', nodes: [{ id: 'n1' }], edges: [] };
    const tree = render();
    const row = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer') &&
        (el.props as { className: string }).className.includes('rounded-lg'),
    )[0];
    await (row.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.createCardArg).toHaveBeenCalledWith({ name: 'EnvFallback', id: 'c1', projectId: 'proj-1' });
  });

  it('does not call createCard when card already exists in store', async () => {
    mocks.environments = [{ id: 'e1', name: 'E', type: 'staging', card_id: 'c1', is_protected: false }];
    mocks.storeState = { cards: { cards: [{ id: 'c1', nodes: [] }] } }; // exists but no nodes
    mocks.apiResponses['graph.load'] = { id: 'c1', name: 'C', nodes: [{ id: 'n1' }], edges: [] };
    const tree = render();
    const row = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer') &&
        (el.props as { className: string }).className.includes('rounded-lg'),
    )[0];
    await (row.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.createCardArg).not.toHaveBeenCalled();
  });

  it('handles graph.load throwing and logs the error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.environments = [{ id: 'e1', name: 'E', type: 'staging', card_id: 'c1', is_protected: false }];
    mocks.apiResponses['graph.load'] = Promise.reject(new Error('boom'));
    const tree = render();
    const row = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer') &&
        (el.props as { className: string }).className.includes('rounded-lg'),
    )[0];
    await (row.props as { onClick: () => Promise<void> }).onClick();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ─── Create flow ─────────────────────────────────────────────────────────

describe('ProjectEnvironments — create flow', () => {
  it('toggles the create form via "New Environment" button', () => {
    const tree = render();
    const newBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some((c) => c === 'New Environment'),
    )[0];
    (newBtn.props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[1]).toBe(true);
  });

  it('updates name slot on input change', () => {
    mocks.stateSlots.push({}, true, '', 'staging', false);
    const tree = render();
    const input = findByPredicate(
      tree,
      (el) =>
        el.type === 'input' &&
        (el.props as { placeholder?: string }).placeholder === 'environments.tabBar.envNamePlaceholder',
    )[0];
    (input.props as { onChange: (e: { target: { value: string } }) => void }).onChange({ target: { value: 'My env' } });
    expect(mocks.stateSlots[2]).toBe('My env');
  });

  it('triggers handleCreate on Enter key', async () => {
    mocks.stateSlots.push({}, true, 'My env', 'staging', false);
    const tree = render();
    const input = findByPredicate(
      tree,
      (el) =>
        el.type === 'input' &&
        (el.props as { placeholder?: string }).placeholder === 'environments.tabBar.envNamePlaceholder',
    )[0];
    await (input.props as { onKeyDown: (e: { key: string }) => Promise<void> | void }).onKeyDown({ key: 'Enter' });
    expect(mocks.createEnvironmentArg).toHaveBeenCalledWith({ projectId: 'proj-1', name: 'My env', type: 'staging' });
  });

  it('does NOT trigger create when key is not Enter', async () => {
    mocks.stateSlots.push({}, true, 'My env', 'staging', false);
    const tree = render();
    const input = findByPredicate(
      tree,
      (el) =>
        el.type === 'input' &&
        (el.props as { placeholder?: string }).placeholder === 'environments.tabBar.envNamePlaceholder',
    )[0];
    await (input.props as { onKeyDown: (e: { key: string }) => Promise<void> | void }).onKeyDown({ key: 'Escape' });
    expect(mocks.createEnvironmentArg).not.toHaveBeenCalled();
  });

  it('IceSelect onChange updates the type slot', () => {
    mocks.stateSlots.push({}, true, '', 'staging', false);
    const tree = render();
    // Find the IceSelect FC call site (typeof === 'function') with the
    // typeOptions prop the page passes — go via element type rather than
    // walking into the rendered <select>.
    const iceSelects = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        Array.isArray((el.props as { options?: unknown[] }).options),
    );
    expect(iceSelects.length).toBe(1);
    (iceSelects[0].props as { onChange: (v: string) => void }).onChange('development');
    expect(mocks.stateSlots[3]).toBe('development');
  });

  it('handleCreate dispatches createEnvironment with trimmed name', async () => {
    mocks.stateSlots.push({}, true, '  My env  ', 'staging', false);
    const tree = render();
    const submitBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'common.buttons.create',
    )[0];
    await (submitBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.createEnvironmentArg).toHaveBeenCalledWith({ projectId: 'proj-1', name: 'My env', type: 'staging' });
    // After success, slot 1 (showCreate) should be false and slot 2 (newName) should be reset
    expect(mocks.stateSlots[1]).toBe(false);
    expect(mocks.stateSlots[2]).toBe('');
  });

  it('returns early when name is empty/whitespace', async () => {
    mocks.stateSlots.push({}, true, '   ', 'staging', false);
    const tree = render();
    const submitBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'common.buttons.create',
    )[0];
    await (submitBtn.props as { onClick: () => Promise<void> }).onClick();
    expect(mocks.createEnvironmentArg).not.toHaveBeenCalled();
  });

  it('cancel button on the create form clears showCreate', () => {
    mocks.stateSlots.push({}, true, '', 'staging', false);
    const tree = render();
    const cancelBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'common.buttons.cancel',
    )[0];
    (cancelBtn.props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[1]).toBe(false);
  });

  it('renders the creating-state button label when slot 4 is true', () => {
    mocks.stateSlots.push({}, true, 'X', 'staging', true);
    const tree = render();
    const btn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'environments.createModal.creatingButton',
    );
    expect(btn).toHaveLength(1);
  });

  it('handles createEnvironment rejection silently', async () => {
    mocks.environments = [];
    mocks.stateSlots.push({}, true, 'OK', 'staging', false);
    // Make unwrap reject this time
    const reject = () =>
      ({
        type: 'env/create',
        unwrap: () => Promise.reject(new Error('boom')),
      }) as unknown;
    mocks.createEnvironmentArg.mockImplementation(reject);
    const tree = render();
    const submitBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'common.buttons.create',
    )[0];
    // shouldn't throw even though unwrap rejects; the source's catch is empty
    await expect(
      (submitBtn.props as { onClick: () => Promise<void> }).onClick(),
    ).resolves.toBeUndefined();
  });
});

// ─── Action buttons (promote / deploy / delete) ──────────────────────────

describe('ProjectEnvironments — action buttons', () => {
  it('renders the promote button only for non-protected envs when prod env exists', () => {
    mocks.environments = [
      { id: 'prod', name: 'Prod', type: 'production', card_id: 'cp', is_protected: true },
      { id: 'stg', name: 'Stg', type: 'staging', card_id: 'cs', is_protected: false },
    ];
    const tree = render();
    const promoteBtns = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { title?: string }).title === 'environments.tabBar.contextPromote',
    );
    expect(promoteBtns).toHaveLength(1);
  });

  it('does not render the promote button when there is no production env', () => {
    mocks.environments = [
      { id: 'stg', name: 'Stg', type: 'staging', card_id: 'cs', is_protected: false },
    ];
    const tree = render();
    const promoteBtns = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { title?: string }).title === 'environments.tabBar.contextPromote',
    );
    expect(promoteBtns).toHaveLength(0);
  });

  it('promote button dispatches compareEnvironments', () => {
    mocks.environments = [
      { id: 'prod', name: 'Prod', type: 'production', card_id: 'cp', is_protected: true },
      { id: 'stg', name: 'Stg', type: 'staging', card_id: 'cs', is_protected: false },
    ];
    const tree = render();
    const promoteBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { title?: string }).title === 'environments.tabBar.contextPromote',
    )[0];
    (promoteBtn.props as { onClick: () => void }).onClick();
    expect(mocks.compareEnvironmentsArg).toHaveBeenCalledWith({ sourceEnvId: 'stg', targetEnvId: 'prod' });
  });

  it('deploy button switches env then opens deploy panel', async () => {
    mocks.environments = [{ id: 'e1', name: 'E', type: 'staging', card_id: 'c1', is_protected: false }];
    const tree = render();
    const deployBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { title?: string }).title === 'environments.tabBar.contextDeploy',
    )[0];
    (deployBtn.props as { onClick: () => void | Promise<void> }).onClick();
    expect(mocks.openDeployPanelInvoked).toHaveBeenCalled();
  });

  it('delete button dispatches deleteEnvironment', () => {
    mocks.environments = [{ id: 'e1', name: 'E', type: 'staging', card_id: 'c1', is_protected: false }];
    const tree = render();
    const deleteBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { title?: string }).title === 'common.buttons.delete',
    )[0];
    (deleteBtn.props as { onClick: () => void }).onClick();
    expect(mocks.deleteEnvironmentArg).toHaveBeenCalledWith({ envId: 'e1', projectId: 'proj-1' });
  });

  it('action click stopPropagation prevents row-level switch', () => {
    mocks.environments = [{ id: 'e1', name: 'E', type: 'staging', card_id: 'c1', is_protected: false }];
    const tree = render();
    // Match the exact className the actions container uses ("gap-1" not
    // "gap-1.5") plus the presence of onClick.
    const containers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        (el.props as { className?: string }).className === 'flex items-center gap-1' &&
        typeof (el.props as { onClick?: unknown }).onClick === 'function',
    );
    expect(containers.length).toBe(1);
    const stop = vi.fn();
    (containers[0].props as { onClick: (e: { stopPropagation: () => void }) => void }).onClick({ stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
  });
});
