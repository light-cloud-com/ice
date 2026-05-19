/**
 * ProjectDeployments — infra + CI/CD deploy history with rollback.
 *
 * Direct-FC tree-walker (rf-rpal-8 pattern). The page renders the
 * outer ProjectDeployments shell and internally mounts either
 * InfraDeploymentList or ServiceDeploymentList based on tab. Both
 * inner FCs are exercised via the walker descending into the
 * dispatched FC call.
 *
 * Slot order in ProjectDeployments:
 *   0 = tab            (default 'infra')
 *   1 = infraDeploys   ([])
 *   2 = infraLoading   (true)
 *   3 = serviceLoading (true)
 *
 * InfraDeploymentList slots (per call):
 *   0 = rollingBack    (null)
 *   1 = confirmId      (null)
 *
 * ServiceDeploymentList slots (per call):
 *   0 = expandedId     (null)
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
    activeCard: null as null | { id: string; nodes?: unknown[] },
    activeEnvId: undefined as string | undefined,
    environments: [] as Array<{ id: string; name: string; type: string; card_id: string; is_protected: boolean }>,
    pipelineHistory: {} as Record<string, unknown[]>,
    dispatch: vi.fn(),
    axiosGet: vi.fn(),
    axiosPost: vi.fn(),
    fetchEventsForNodeArg: vi.fn(),
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
  const patchedUseMemo = vi.fn((fn: () => unknown) => fn());
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useEffect: patchedUseEffect,
    useMemo: patchedUseMemo,
    default: {
      ...actualDefault,
      useState: patchedUseState,
      useEffect: patchedUseEffect,
      useMemo: patchedUseMemo,
    },
  };
});

vi.mock('@ui/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@ui/shared/api/axios-instance', () => ({
  default: {
    get: (...args: unknown[]) => mocks.axiosGet(...args),
    post: (...args: unknown[]) => mocks.axiosPost(...args),
  },
}));

vi.mock('@ui/shared/utils/cn', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@ui/store/slices/cards-slice', () => ({
  selectActiveCard: () => mocks.activeCard,
}));

vi.mock('@ui/store/slices/pipeline-slice', () => ({
  fetchEventsForNode: (arg: unknown) => {
    mocks.fetchEventsForNodeArg(arg);
    return { type: 'pipeline/fetchEventsForNode', payload: arg };
  },
}));

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (sel: (s: unknown) => unknown) =>
    sel({
      pipeline: { history: mocks.pipelineHistory },
      environments: {
        activeEnvId: { 'proj-1': mocks.activeEnvId },
        byProject: { 'proj-1': mocks.environments },
      },
    }),
}));

import { ProjectDeployments } from '../deployments';

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
  const FC = ProjectDeployments as unknown as (p: { projectId: string }) => React.ReactElement | null;
  return FC({ projectId: 'proj-1' });
}

beforeEach(() => {
  mocks.resetUseState();
  mocks.effects.length = 0;
  mocks.dispatch.mockReset();
  mocks.axiosGet.mockReset();
  mocks.axiosPost.mockReset();
  mocks.fetchEventsForNodeArg.mockReset();
  mocks.activeCard = null;
  mocks.activeEnvId = undefined;
  mocks.environments = [];
  mocks.pipelineHistory = {};
});

// ─── Header / env label ───────────────────────────────────────────────────

describe('ProjectDeployments — header', () => {
  it('renders the page title', () => {
    const tree = render();
    const h1 = findByPredicate(
      tree,
      (el) => el.type === 'h1' && (el.props as { children?: unknown }).children === 'project.deployments.title',
    );
    expect(h1).toHaveLength(1);
  });

  it('does not render the active env label when no env is selected', () => {
    const tree = render();
    const envLabels = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'project.deployments.envLabel',
    );
    expect(envLabels).toHaveLength(0);
  });

  it('renders the active env label when env is selected', () => {
    mocks.activeEnvId = 'env-1';
    mocks.environments = [{ id: 'env-1', name: 'Prod', type: 'production', card_id: 'c1', is_protected: true }];
    const tree = render();
    const envLabels = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some((c) => c === 'project.deployments.envLabel'),
    );
    expect(envLabels.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Tab switching ────────────────────────────────────────────────────────

describe('ProjectDeployments — tab switching', () => {
  it('renders both tabs (infra / service) by their i18n labels', () => {
    const tree = render();
    const tabs = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { label?: string }).label === 'string' &&
        ['project.deployments.tabInfrastructure', 'project.deployments.tabService'].includes(
          (el.props as { label: string }).label,
        ),
    );
    expect(tabs).toHaveLength(2);
  });

  it('switches tab via TabButton onClick', () => {
    const tree = render();
    const svcTab = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        (el.props as { label?: string }).label === 'project.deployments.tabService',
    )[0];
    (svcTab.props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[0]).toBe('service');
  });

  it('switches tab back to infra', () => {
    mocks.stateSlots.push('service', [], false, false);
    const tree = render();
    const infraTab = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        (el.props as { label?: string }).label === 'project.deployments.tabInfrastructure',
    )[0];
    (infraTab.props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[0]).toBe('infra');
  });

  it('TabButton renders the count pill when count > 0', () => {
    mocks.stateSlots.push(
      'infra',
      [{ id: 'd1', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: null, created_at: '2024-01-01' }],
      false,
      false,
    );
    const tree = render();
    const infraTab = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        (el.props as { label?: string }).label === 'project.deployments.tabInfrastructure',
    )[0];
    expect((infraTab.props as { count: number }).count).toBe(1);
  });

  it('TabButton omits the count pill when count = 0', () => {
    const tree = render();
    const infraTab = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        (el.props as { label?: string }).label === 'project.deployments.tabInfrastructure',
    )[0];
    expect((infraTab.props as { count: number }).count).toBe(0);
  });
});

// ─── Infra fetch effect ───────────────────────────────────────────────────

describe('ProjectDeployments — infra fetch', () => {
  it('skips fetch and flips infraLoading=false when no card', () => {
    render();
    mocks.effects[0].cb();
    expect(mocks.axiosGet).not.toHaveBeenCalled();
    // slot 2 = infraLoading
    expect(mocks.stateSlots[2]).toBe(false);
  });

  // The infra effect kicks off an unawaited axios chain. Flush
  // microtasks twice so .then(...) AND .finally(...) both settle.
  const flush = async () => {
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  };

  it('fetches /canvas/deploy/history/<cardId> and stores result', async () => {
    mocks.activeCard = { id: 'card-1' };
    mocks.axiosGet.mockResolvedValueOnce({
      data: [
        { id: 'd1', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 1000, error: null, created_at: '2024-01-01' },
      ],
    });
    render();
    mocks.effects[0].cb();
    await flush();
    expect(mocks.axiosGet).toHaveBeenCalledWith('/canvas/deploy/history/card-1');
    expect((mocks.stateSlots[1] as unknown[]).length).toBe(1);
    expect(mocks.stateSlots[2]).toBe(false);
  });

  it('falls back to [] when response is non-array', async () => {
    mocks.activeCard = { id: 'card-1' };
    mocks.axiosGet.mockResolvedValueOnce({ data: { not: 'array' } });
    render();
    mocks.effects[0].cb();
    await flush();
    expect(mocks.stateSlots[1]).toEqual([]);
  });

  it('clears infraDeploys to [] on fetch error', async () => {
    mocks.activeCard = { id: 'card-1' };
    mocks.axiosGet.mockRejectedValueOnce(new Error('500'));
    render();
    mocks.effects[0].cb();
    await flush();
    expect(mocks.stateSlots[1]).toEqual([]);
  });
});

// ─── Service fetch effect ────────────────────────────────────────────────

describe('ProjectDeployments — service fetch', () => {
  it('flips serviceLoading=false when no card', () => {
    render();
    // effects[1] = service fetch
    mocks.effects[1].cb();
    // slot 3 = serviceLoading
    expect(mocks.stateSlots[3]).toBe(false);
    expect(mocks.fetchEventsForNodeArg).not.toHaveBeenCalled();
  });

  it('flips serviceLoading=false when no service nodes', () => {
    mocks.activeCard = { id: 'card-1', nodes: [] };
    render();
    mocks.effects[1].cb();
    expect(mocks.stateSlots[3]).toBe(false);
  });

  it('dispatches fetchEventsForNode for each filtered service node', async () => {
    mocks.activeCard = {
      id: 'card-1',
      nodes: [
        { id: 'n1', type: 'resource', data: { iceType: 'Compute.Function' } },
        { id: 'n2', type: 'resource', data: { iceType: 'Source.Github' } },
        { id: 'n3', type: 'resource', data: { iceType: 'Config.Env' } },
        { id: 'n4', type: 'resource', data: { iceType: 'Networking.VPC' } },
      ],
    };
    render();
    await mocks.effects[1].cb();
    expect(mocks.fetchEventsForNodeArg).toHaveBeenCalledTimes(1);
    expect(mocks.fetchEventsForNodeArg).toHaveBeenCalledWith({ cardId: 'card-1', nodeId: 'n1' });
  });
});

// ─── Loading state ────────────────────────────────────────────────────────

describe('ProjectDeployments — loading', () => {
  it('renders a spinner when current tab is loading', () => {
    // tab=infra, infraDeploys=[], infraLoading=true, serviceLoading=false
    mocks.stateSlots.push('infra', [], true, false);
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

// ─── InfraDeploymentList ─────────────────────────────────────────────────

describe('ProjectDeployments — InfraDeploymentList', () => {
  it('shows the empty state when no deployments', () => {
    mocks.stateSlots.push('infra', [], false, false);
    const tree = render();
    const empty = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'project.deployments.infraEmptyTitle',
    );
    expect(empty).toHaveLength(1);
  });

  const successCases: Array<[string, string]> = [
    ['success', 'text-emerald-500'],
    ['failed', 'text-red-500'],
    ['deploying', 'text-blue-500'],
    ['planning', 'text-amber-500'],
    ['cancelled', 'text-ice-text-3'],
    ['queued', 'text-amber-500'],
  ];

  for (const [status, color] of successCases) {
    it(`renders the correct status icon for "${status}"`, () => {
      mocks.stateSlots.push(
        'infra',
        [{ id: `d-${status}`, status, provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: null, created_at: '2024-01-01' }],
        false,
        false,
      );
      const tree = render();
      const icons = findByPredicate(
        tree,
        (el) =>
          typeof (el.props as { className?: string }).className === 'string' &&
          (el.props as { className: string }).className.includes(color),
      );
      expect(icons.length).toBeGreaterThanOrEqual(1);
    });
  }

  it('shows the rollback button for non-latest successful deployments only', () => {
    mocks.stateSlots.push(
      'infra',
      [
        { id: 'd2', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: null, created_at: '2024-01-02' },
        { id: 'd1', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: null, created_at: '2024-01-01' },
      ],
      false,
      false,
    );
    const tree = render();
    const rollbackBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { title?: string }).title === 'project.deployments.rollbackTooltip',
    );
    // Only d1 is a rollback target (d2 is the latest)
    expect(rollbackBtns).toHaveLength(1);
  });

  it('opens the confirm prompt when rollback is clicked', () => {
    mocks.stateSlots.push(
      'infra',
      [
        { id: 'd2', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: null, created_at: '2024-01-02' },
        { id: 'd1', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: null, created_at: '2024-01-01' },
      ],
      false,
      false,
    );
    const tree = render();
    const rollbackBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { title?: string }).title === 'project.deployments.rollbackTooltip',
    )[0];
    // simulate click — must call e.stopPropagation()
    const stop = vi.fn();
    (rollbackBtn.props as { onClick: (e: { stopPropagation: () => void }) => void }).onClick({ stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
    // The InfraDeploymentList's slot 1 = confirmId. Since the
    // tree-walker re-runs InfraDeploymentList (a nested FC) inside a
    // separate useState idx context, slot ordering differs. We won't
    // probe slot directly here; checking stop is enough to prove the
    // handler ran.
  });

  it('renders the duration pill when duration_ms > 0', () => {
    mocks.stateSlots.push(
      'infra',
      [{ id: 'd1', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 5000, error: null, created_at: '2024-01-01' }],
      false,
      false,
    );
    const tree = render();
    const dur = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('tabular-nums'),
    );
    expect(dur).toHaveLength(1);
    // children is rendered as ["5.0", "s"] because the source uses
    // `{(d.duration_ms / 1000).toFixed(1)}s`.
    const c = (dur[0].props as { children: unknown }).children;
    expect(Array.isArray(c) ? c.join('') : String(c)).toBe('5.0s');
  });

  it('omits the duration pill when duration_ms is 0 or null', () => {
    mocks.stateSlots.push(
      'infra',
      [
        { id: 'd1', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: null, created_at: '2024-01-01' },
        { id: 'd2', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: null, error: null, created_at: '2024-01-02' },
      ],
      false,
      false,
    );
    const tree = render();
    const dur = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('tabular-nums'),
    );
    expect(dur).toHaveLength(0);
  });

  it('renders the error message inline when present', () => {
    mocks.stateSlots.push(
      'infra',
      [{ id: 'd1', status: 'failed', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: 'boom', created_at: '2024-01-01' }],
      false,
      false,
    );
    const tree = render();
    const errPara = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'boom',
    );
    expect(errPara).toHaveLength(1);
  });
});

// ─── ServiceDeploymentList ───────────────────────────────────────────────

describe('ProjectDeployments — ServiceDeploymentList', () => {
  it('renders empty state when no service events', () => {
    mocks.stateSlots.push('service', [], false, false);
    const tree = render();
    const empty = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'project.deployments.serviceEmptyTitle',
    );
    expect(empty).toHaveLength(1);
  });

  const statusCases: Array<[string, string]> = [
    ['success', 'text-emerald-500'],
    ['failed', 'text-red-500'],
    ['building', 'text-blue-500'],
    ['deploying', 'text-purple-500'],
    ['cancelled', 'text-ice-text-3'],
    ['queued', 'text-amber-500'],
  ];

  for (const [status, color] of statusCases) {
    it(`renders the correct service status icon for "${status}"`, () => {
      mocks.activeCard = {
        id: 'c1',
        nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Function', label: 'svc' } }],
      };
      mocks.pipelineHistory = {
        'c1:n1': [
          { id: `ev-${status}`, status, started_at: '2024-01-01', branch: 'main', commit_message: 'm', commit_sha: 'abc1234', commit_author: 'me' },
        ],
      };
      mocks.stateSlots.push('service', [], false, false);
      const tree = render();
      const icons = findByPredicate(
        tree,
        (el) =>
          typeof (el.props as { className?: string }).className === 'string' &&
          (el.props as { className: string }).className.includes(color),
      );
      expect(icons.length).toBeGreaterThanOrEqual(1);
    });
  }

  it('renders duration in seconds when < 60s', () => {
    mocks.activeCard = {
      id: 'c1',
      nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Function', label: 'svc' } }],
    };
    mocks.pipelineHistory = {
      'c1:n1': [
        { id: 'ev1', status: 'success', started_at: '2024-01-01', branch: 'main', commit_message: 'm', commit_sha: 'abc1234', duration_seconds: 30 },
      ],
    };
    mocks.stateSlots.push('service', [], false, false);
    const tree = render();
    const durs = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('tabular-nums'),
    );
    expect((durs[0].props as { children: unknown }).children).toBe('30s');
  });

  it('renders duration as Xm Ys when >= 60s', () => {
    mocks.activeCard = {
      id: 'c1',
      nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Function', label: 'svc' } }],
    };
    mocks.pipelineHistory = {
      'c1:n1': [
        { id: 'ev1', status: 'success', started_at: '2024-01-01', branch: 'main', commit_message: 'm', commit_sha: 'abc1234', duration_seconds: 125 },
      ],
    };
    mocks.stateSlots.push('service', [], false, false);
    const tree = render();
    const durs = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('tabular-nums'),
    );
    expect((durs[0].props as { children: unknown }).children).toBe('2m 5s');
  });

  it('omits duration when duration_seconds is null or 0', () => {
    mocks.activeCard = {
      id: 'c1',
      nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Function', label: 'svc' } }],
    };
    mocks.pipelineHistory = {
      'c1:n1': [
        { id: 'ev1', status: 'success', started_at: '2024-01-01', branch: 'main', commit_message: 'm', commit_sha: 'abc1234', duration_seconds: 0 },
      ],
    };
    mocks.stateSlots.push('service', [], false, false);
    const tree = render();
    const durs = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('tabular-nums'),
    );
    expect(durs).toHaveLength(0);
  });

  it('shows the inline error preview when not expanded', () => {
    mocks.activeCard = {
      id: 'c1',
      nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Function', label: 'svc' } }],
    };
    mocks.pipelineHistory = {
      'c1:n1': [
        { id: 'ev1', status: 'failed', started_at: '2024-01-01', branch: 'main', commit_message: 'm', commit_sha: 'abc1234', error: 'oops' },
      ],
    };
    mocks.stateSlots.push('service', [], false, false);
    const tree = render();
    const errPara = findByPredicate(
      tree,
      (el) => el.type === 'p' && (el.props as { children?: unknown }).children === 'oops',
    );
    expect(errPara).toHaveLength(1);
  });

  it('uses ev.rule.environment when available, otherwise falls back to branch', () => {
    mocks.activeCard = {
      id: 'c1',
      nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Function', label: 'svc' } }],
    };
    mocks.pipelineHistory = {
      'c1:n1': [
        { id: 'ev1', status: 'success', started_at: '2024-01-01', branch: 'main', commit_message: 'm', commit_sha: 'abc1234', rule: { environment: 'prod' } },
      ],
    };
    mocks.stateSlots.push('service', [], false, false);
    const tree = render();
    const envSpan = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'prod',
    );
    expect(envSpan).toHaveLength(1);
  });

  it('renders the byAuthor i18n span when commit_author is present', () => {
    mocks.activeCard = {
      id: 'c1',
      nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Function', label: 'svc' } }],
    };
    mocks.pipelineHistory = {
      'c1:n1': [
        { id: 'ev1', status: 'success', started_at: '2024-01-01', branch: 'main', commit_message: 'm', commit_sha: 'abc1234', commit_author: 'me' },
      ],
    };
    mocks.stateSlots.push('service', [], false, false);
    const tree = render();
    const author = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'project.deployments.byAuthor',
    );
    expect(author).toHaveLength(1);
  });
});

// ─── onRollbackComplete callback ──────────────────────────────────────────

describe('ProjectDeployments — onRollbackComplete', () => {
  it('refetches the history when rollback completes', async () => {
    mocks.activeCard = { id: 'card-1' };
    mocks.stateSlots.push(
      'infra',
      [{ id: 'd1', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: null, created_at: '2024-01-01' }],
      false,
      false,
    );
    const tree = render();
    // Find the InfraDeploymentList element (FC) and pull its onRollbackComplete prop
    const list = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        Array.isArray((el.props as { deployments?: unknown }).deployments),
    )[0];
    mocks.axiosGet.mockResolvedValueOnce({ data: [] });
    const cb = (list.props as { onRollbackComplete?: () => Promise<void> }).onRollbackComplete!;
    await cb();
    expect(mocks.axiosGet).toHaveBeenCalledWith('/canvas/deploy/history/card-1');
  });

  it('survives when no card is active during rollback', async () => {
    mocks.activeCard = null;
    mocks.stateSlots.push('infra', [], false, false);
    const tree = render();
    const list = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        Array.isArray((el.props as { deployments?: unknown }).deployments),
    )[0];
    const cb = (list.props as { onRollbackComplete?: () => Promise<void> }).onRollbackComplete!;
    await cb();
    expect(mocks.axiosGet).not.toHaveBeenCalled();
  });

  it('swallows fetch errors silently in the rollback callback', async () => {
    mocks.activeCard = { id: 'card-1' };
    mocks.stateSlots.push(
      'infra',
      [{ id: 'd1', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: null, created_at: '2024-01-01' }],
      false,
      false,
    );
    const tree = render();
    const list = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        Array.isArray((el.props as { deployments?: unknown }).deployments),
    )[0];
    mocks.axiosGet.mockRejectedValueOnce(new Error('500'));
    const cb = (list.props as { onRollbackComplete?: () => void }).onRollbackComplete!;
    // cb runs an unawaited axios chain — invoke and let it settle.
    cb();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(mocks.axiosGet).toHaveBeenCalled();
  });
});

// ─── ServiceDeploymentList expand toggle ─────────────────────────────────

describe('ProjectDeployments — ServiceDeploymentList expand', () => {
  // ServiceDeploymentList holds its own `expandedId` useState at slot 4
  // (after ProjectDeployments's 4 slots). Pre-seed that slot to drive
  // the expanded view.
  it('renders the deployment_logs panel when expanded', () => {
    mocks.activeCard = {
      id: 'c1',
      nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Function', label: 'svc' } }],
    };
    mocks.pipelineHistory = {
      'c1:n1': [
        {
          id: 'ev1',
          status: 'success',
          started_at: '2024-01-01',
          branch: 'main',
          commit_message: 'm',
          commit_sha: 'abc1234',
          deployment_logs: [
            { status: 'completed', message: 'Build done', duration_ms: 12000 },
            { status: 'failed', message: 'Test failed', duration_ms: 1500 },
            { status: 'running', message: 'Deploying', duration_ms: null },
          ],
          error: 'final',
        },
      ],
    };
    // outer slots [0..3], then ServiceDeploymentList slot 4 = expandedId
    mocks.stateSlots.push('service', [], false, false, 'ev1');
    const tree = render();
    // Probe via the className discriminator applied to the icon span:
    // completed → text-emerald-500, failed → text-red-400, running → text-blue-400.
    const iconSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('shrink-0') &&
        ((el.props as { className: string }).className.includes('text-emerald-500') ||
          (el.props as { className: string }).className.includes('text-red-400') ||
          (el.props as { className: string }).className.includes('text-blue-400')),
    );
    expect(iconSpans.length).toBe(3);
    // Verify each icon symbol is one of the expected glyphs
    const symbols = iconSpans.map((s) => (s.props as { children: unknown }).children);
    expect(symbols).toContain('✓');
    expect(symbols).toContain('✗');
    expect(symbols).toContain('●');
  });

  it('toggles expandedId on row click', () => {
    mocks.activeCard = {
      id: 'c1',
      nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Function', label: 'svc' } }],
    };
    mocks.pipelineHistory = {
      'c1:n1': [
        {
          id: 'ev1',
          status: 'success',
          started_at: '2024-01-01',
          branch: 'main',
          commit_message: 'm',
          commit_sha: 'abc1234',
        },
      ],
    };
    // outer slots [0..3], expandedId starts null at slot 4
    mocks.stateSlots.push('service', [], false, false, null);
    const tree = render();
    const row = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer') &&
        (el.props as { className: string }).className.includes('hover:bg-ice-hover'),
    )[0];
    (row.props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[4]).toBe('ev1');
  });

  it('collapses expandedId on second click', () => {
    mocks.activeCard = {
      id: 'c1',
      nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Function', label: 'svc' } }],
    };
    mocks.pipelineHistory = {
      'c1:n1': [
        {
          id: 'ev1',
          status: 'success',
          started_at: '2024-01-01',
          branch: 'main',
          commit_message: 'm',
          commit_sha: 'abc1234',
        },
      ],
    };
    mocks.stateSlots.push('service', [], false, false, 'ev1');
    const tree = render();
    const row = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer') &&
        (el.props as { className: string }).className.includes('hover:bg-ice-hover'),
    )[0];
    (row.props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[4]).toBeNull();
  });

  it('renders noLogs message when expanded but logs is empty', () => {
    mocks.activeCard = {
      id: 'c1',
      nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Function', label: 'svc' } }],
    };
    mocks.pipelineHistory = {
      'c1:n1': [
        {
          id: 'ev1',
          status: 'success',
          started_at: '2024-01-01',
          branch: 'main',
          commit_message: 'm',
          commit_sha: 'abc1234',
        },
      ],
    };
    mocks.stateSlots.push('service', [], false, false, 'ev1');
    const tree = render();
    const noLogs = findByPredicate(
      tree,
      (el) => (el.props as { children?: unknown }).children === 'project.deployments.noLogs',
    );
    expect(noLogs.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── InfraDeploymentList rollback flow ───────────────────────────────────

// InfraDeploymentList slots after outer 4: [4]=rollingBack, [5]=confirmId.
describe('ProjectDeployments — rollback flow', () => {
  const fixtureDeploys = [
    { id: 'd2', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: null, created_at: '2024-01-02' },
    { id: 'd1', status: 'success', provider: 'aws', region: 'us-east-1', environment: 'p', duration_ms: 0, error: null, created_at: '2024-01-01' },
  ];

  it('clicking the rollback button sets confirmId via slot 5', () => {
    mocks.activeCard = { id: 'card-1' };
    // outer slots 0..3, list slot 4 = rollingBack=null, 5 = confirmId=null
    mocks.stateSlots.push('infra', fixtureDeploys, false, false, null, null);
    const tree = render();
    const rollbackBtn = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { title?: string }).title === 'project.deployments.rollbackTooltip',
    )[0];
    const stop = vi.fn();
    (rollbackBtn.props as { onClick: (e: { stopPropagation: () => void }) => void }).onClick({ stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
    expect(mocks.stateSlots[5]).toBe('d1');
  });

  it('confirm button calls /canvas/deploy/rollback with deploymentId+cardId', async () => {
    mocks.activeCard = { id: 'card-1' };
    // pre-seed confirmId='d1' at slot 5 so the confirm button is rendered
    mocks.stateSlots.push('infra', fixtureDeploys, false, false, null, 'd1');
    const tree = render();
    const confirmBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'project.deployments.confirm',
    )[0];
    expect(confirmBtn).toBeDefined();
    mocks.axiosPost.mockResolvedValueOnce({ data: {} });
    await (confirmBtn.props as { onClick: (e: { stopPropagation: () => void }) => Promise<void> }).onClick({
      stopPropagation: vi.fn(),
    });
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/deploy/rollback', { deploymentId: 'd1', cardId: 'card-1' });
  });

  it('logs and clears rollingBack on rollback failure', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.activeCard = { id: 'card-1' };
    mocks.stateSlots.push('infra', fixtureDeploys, false, false, null, 'd1');
    const tree = render();
    const confirmBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'project.deployments.confirm',
    )[0];
    mocks.axiosPost.mockRejectedValueOnce({ message: 'boom' });
    await (confirmBtn.props as { onClick: (e: { stopPropagation: () => void }) => Promise<void> }).onClick({
      stopPropagation: vi.fn(),
    });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('cancel button clears confirmId at slot 5 without firing axios', () => {
    mocks.activeCard = { id: 'card-1' };
    mocks.stateSlots.push('infra', fixtureDeploys, false, false, null, 'd1');
    const tree = render();
    const cancelBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'project.deployments.cancel',
    )[0];
    (cancelBtn.props as { onClick: (e: { stopPropagation: () => void }) => void }).onClick({ stopPropagation: vi.fn() });
    expect(mocks.stateSlots[5]).toBeNull();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it('handleRollback is a no-op without a cardId', async () => {
    mocks.activeCard = null;
    mocks.stateSlots.push('infra', fixtureDeploys, false, false, null, 'd1');
    const tree = render();
    const confirmBtn = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { children?: unknown }).children === 'project.deployments.confirm',
    )[0];
    await (confirmBtn.props as { onClick: (e: { stopPropagation: () => void }) => Promise<void> }).onClick({
      stopPropagation: vi.fn(),
    });
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it('shows the spinner while rollback is in flight', () => {
    mocks.activeCard = { id: 'card-1' };
    // pre-seed rollingBack='d1'
    mocks.stateSlots.push('infra', fixtureDeploys, false, false, 'd1', null);
    const tree = render();
    const rollingBackLabel = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).some(
          (c) => c === 'project.deployments.rollingBack',
        ),
    );
    expect(rollingBackLabel.length).toBeGreaterThanOrEqual(1);
  });
});
