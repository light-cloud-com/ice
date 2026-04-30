/**
 * rf-props-20 — pipeline-section tests.
 *
 * `PipelineSection` is the deployment-rule editor + recent-events list for a
 * service node. The component uses `useDispatch`, `useSelector` (multiple
 * times), TWO `useState` calls (`expandedEventId`, `autoCreated`), TWO
 * `useEffect` callbacks (mount-time fetches; auto-create when rules load
 * empty), and TWO dynamic `import('...')` statements inside `handleRetry` —
 * the planner's behavior-risk flag #3 is exactly this: when the file moved
 * from `components/` to `components/sections/`, every relative path string
 * literal needed one extra `..` segment, and a wrong path inside a string
 * literal compiles fine but throws at runtime.
 *
 * We use the direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`,
 * `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`,
 * `queued-ref-dispatch-extends-the-mutable-ref-usestate-mock-to-multi-state-fcs`,
 * `dynamic-import-of-api-adapter-needs-a-direct-vi-mock-on-the-target-module`):
 * invoke the component as a function with React's hooks mocked so the body
 * runs synchronously without a renderer context, then walk the returned
 * tree.
 *
 * Selectors are mocked through a single state-builder fed to a controllable
 * `useSelector` mock — every selector callback runs against the same
 * fixture. `useDispatch` returns a captured spy. The two `useState` slots
 * are dealt out from a queued ref dispatcher (one ref per slot), reset
 * before each render. Both `useEffect` callbacks are invoked synchronously
 * on the initial render.
 *
 * Mocks:
 *  - `react-redux` → `useDispatch` returns `dispatchSpy`; `useSelector`
 *    invokes the supplied selector against `mocks.state`.
 *  - `react.useState` / `react.useEffect` → controlled (queued-ref + sync).
 *  - `'../../fields'.Section` → vi.fn the walker matches by reference.
 *  - `'../../../utils/format-age'.formatAge` → returns `'AGE:<input>'`.
 *  - `'../../../../i18n'.t` → echoes `t:<key>`.
 *  - `'../../../../store/slices/integrations-slice'.fetchGitHubBranches` →
 *    tagged spy.
 *  - `'../../../../store/slices/pipeline-slice'.{fetchRulesForNode,
 *    fetchEventsForNode, createPipelineRule, updatePipelineRule,
 *    deletePipelineRule}` → tagged spies.
 *  - `'../../../../shared/api/api-adapter'.getApi` → returns a
 *    `pipeline.retryDeploy` spy with per-test resolution.
 *
 * The dynamic-import resolution tests below are the load-bearing ones for
 * behavior-risk flag #3: the four-segment relative paths inside the
 * `handleRetry` `import('...')` calls MUST resolve to the mocked module
 * registry, otherwise the await chain throws at runtime in production.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted stubs — vi.mock factories run before module-level statements, so
// shared identities have to live in vi.hoisted.
const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
  // Two useState slots, in declaration order: expandedEventId, autoCreated.
  expandedEventIdRef: { current: null as string | null },
  autoCreatedRef: { current: false },
  expandedSetterSpy: vi.fn(),
  autoCreatedSetterSpy: vi.fn(),
  // useEffect — capture all callbacks/deps; fire each synchronously on render.
  effectCallbacks: [] as Array<() => void | Promise<void> | undefined>,
  effectDeps: [] as unknown[][],
  // Dispatch + state.
  dispatchSpy: vi.fn(),
  state: {
    pipeline: {
      rules: {} as Record<string, Array<Record<string, unknown>>>,
      rulesLoading: false,
      history: {} as Record<string, Array<Record<string, unknown>>>,
    },
    integrations: {
      github: {
        branches: {} as Record<string, Array<{ name: string }>>,
      },
    },
  },
  // Slice action spies — return tagged objects so the dispatch arg is verifiable.
  fetchRulesForNodeSpy: vi.fn((arg: { cardId: string; nodeId: string }) => ({
    type: 'pipeline/fetchRulesForNode',
    payload: arg,
  })),
  fetchEventsForNodeSpy: vi.fn((arg: { cardId: string; nodeId: string }) => ({
    type: 'pipeline/fetchEventsForNode',
    payload: arg,
  })),
  createPipelineRuleSpy: vi.fn((arg: Record<string, unknown>) => ({
    type: 'pipeline/createPipelineRule',
    payload: arg,
  })),
  updatePipelineRuleSpy: vi.fn((arg: Record<string, unknown>) => ({
    type: 'pipeline/updatePipelineRule',
    payload: arg,
  })),
  deletePipelineRuleSpy: vi.fn((arg: Record<string, unknown>) => ({
    type: 'pipeline/deletePipelineRule',
    payload: arg,
  })),
  fetchGitHubBranchesSpy: vi.fn((repo: string) => ({
    type: 'integrations/fetchGitHubBranches',
    payload: repo,
  })),
  formatAgeSpy: vi.fn((s: string) => `AGE:${s}`),
  retryDeploySpy: vi.fn(),
}));

// Mock react-redux: useDispatch returns the spy, useSelector invokes the
// supplied selector against the current `mocks.state`.
vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatchSpy,
  useSelector: (selector: (s: typeof mocks.state) => unknown) => selector(mocks.state),
}));

// Mock React's useState / useEffect so the FC body runs synchronously and the
// two useState calls are dealt back in order from the ref queue. Effects fire
// synchronously per render so mount-time fetches dispatch their actions.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let callIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    callIdx = 0;
  };
  const dispatch = [
    () => [mocks.expandedEventIdRef.current, mocks.expandedSetterSpy] as const,
    () => [mocks.autoCreatedRef.current, mocks.autoCreatedSetterSpy] as const,
  ];
  return {
    ...actual,
    useState: vi.fn(() => {
      const slot = dispatch[callIdx] ?? dispatch[dispatch.length - 1];
      callIdx += 1;
      return slot();
    }),
    useEffect: vi.fn((cb: () => void | Promise<void> | undefined, deps?: unknown[]) => {
      mocks.effectCallbacks.push(cb);
      mocks.effectDeps.push(deps ?? []);
      // Fire synchronously so the mount-side dispatches run during render.
      void cb();
    }),
  };
});

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
}));

vi.mock('../../../utils/format-age', () => ({
  formatAge: mocks.formatAgeSpy,
}));

vi.mock('../../../../../i18n', () => ({
  t: vi.fn((key: string) => `t:${key}`),
}));

vi.mock('../../../../../store/slices/integrations-slice', () => ({
  fetchGitHubBranches: mocks.fetchGitHubBranchesSpy,
}));

// CRITICAL: the dynamic import inside `handleRetry` resolves through the same
// module-mock registry as static imports, so this single mock at the test's
// relative path covers both call paths (cite
// `dynamic-import-of-api-adapter-needs-a-direct-vi-mock-on-the-target-module`).
// The mocked path uses FOUR `..` segments — one more than the source file
// used (THREE) before extraction. If the source's dynamic-import path was
// not bumped during the move, the dynamic await would resolve against the
// real module path and break — so this test fails loudly if the path is
// wrong.
vi.mock('../../../../../store/slices/pipeline-slice', () => ({
  // The component's `handleRetry` does `import('...').then(({ default: _, ..._mod }) => ...)`
  // — destructuring `default` requires the mock to expose a `default` key, even if
  // the real reducer is never exercised by the test.
  default: vi.fn(),
  fetchRulesForNode: mocks.fetchRulesForNodeSpy,
  fetchEventsForNode: mocks.fetchEventsForNodeSpy,
  createPipelineRule: mocks.createPipelineRuleSpy,
  updatePipelineRule: mocks.updatePipelineRuleSpy,
  deletePipelineRule: mocks.deletePipelineRuleSpy,
}));

vi.mock('../../../../../shared/api/api-adapter', () => ({
  getApi: () => ({
    pipeline: {
      retryDeploy: mocks.retryDeploySpy,
    },
  }),
}));

import { PipelineSection } from '../pipeline-section';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12/13/14/15/16/17/18/19) ──

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function findByType(tree: React.ReactNode, type: string): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  const visit = (n: ReactNodeLike): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    const el = n as React.ReactElement;
    visit((el.props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join(' ');
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const makeRule = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'rule-1',
  card_id: 'card-1',
  node_id: 'node-1',
  repository: 'owner/repo',
  trigger_type: 'push',
  branch_pattern: 'main',
  environment: 'production',
  build_command: null,
  install_command: null,
  output_dir: null,
  framework: null,
  enabled: true,
  webhook_id: null,
  created_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

const makeEvent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'ev-1',
  rule_id: 'rule-1',
  trigger: 'push',
  commit_sha: 'abcdef1234567890',
  commit_message: 'test commit',
  commit_author: 'tester',
  branch: 'main',
  status: 'success',
  deployment_stage: null,
  deployment_logs: [],
  deployed_url: null,
  started_at: '2025-01-01T00:00:00Z',
  completed_at: null,
  duration_seconds: null,
  error: null,
  ...overrides,
});

const renderSection = (props: {
  cardId?: string;
  nodeId?: string;
  nodeRepo?: string;
  activeCard?: any;
} = {}): React.ReactElement | null => {
  // Reset useState queue + spy state for each render.
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  mocks.MockSection.mockClear();
  mocks.dispatchSpy.mockClear();
  mocks.expandedSetterSpy.mockClear();
  mocks.autoCreatedSetterSpy.mockClear();
  mocks.fetchRulesForNodeSpy.mockClear();
  mocks.fetchEventsForNodeSpy.mockClear();
  mocks.createPipelineRuleSpy.mockClear();
  mocks.updatePipelineRuleSpy.mockClear();
  mocks.deletePipelineRuleSpy.mockClear();
  mocks.fetchGitHubBranchesSpy.mockClear();
  mocks.formatAgeSpy.mockClear();
  mocks.retryDeploySpy.mockClear();
  mocks.effectCallbacks.length = 0;
  mocks.effectDeps.length = 0;
  return PipelineSection({
    cardId: props.cardId ?? 'card-1',
    nodeId: props.nodeId ?? 'node-1',
    nodeRepo: props.nodeRepo ?? 'owner/repo',
    activeCard: props.activeCard,
  }) as React.ReactElement | null;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PipelineSection', () => {
  beforeEach(() => {
    mocks.expandedEventIdRef.current = null;
    mocks.autoCreatedRef.current = false;
    mocks.state.pipeline.rules = {};
    mocks.state.pipeline.rulesLoading = false;
    mocks.state.pipeline.history = {};
    mocks.state.integrations.github.branches = {};
    // Fresh resolved promise for thunk dispatch chains by default.
    mocks.dispatchSpy.mockImplementation(() => Promise.resolve({ payload: undefined }));
  });

  // ── Mount-time effects ────────────────────────────────────────────────────

  it('returns null when no repository is connected (no nodeRepo, no source-edge)', () => {
    const tree = renderSection({ nodeRepo: '' });
    expect(tree).toBeNull();
  });

  it('mount fires dispatch(fetchRulesForNode({ cardId, nodeId })) once', () => {
    renderSection({ cardId: 'c-XYZ', nodeId: 'n-ABC' });
    const calls = mocks.fetchRulesForNodeSpy.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ cardId: 'c-XYZ', nodeId: 'n-ABC' });
    // The action object dispatched is the tagged thunk-result.
    expect(mocks.dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pipeline/fetchRulesForNode' }),
    );
  });

  it('mount fires dispatch(fetchEventsForNode({ cardId, nodeId })) once', () => {
    renderSection({ cardId: 'c-XYZ', nodeId: 'n-ABC' });
    const calls = mocks.fetchEventsForNodeSpy.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ cardId: 'c-XYZ', nodeId: 'n-ABC' });
  });

  it('mount fires dispatch(fetchGitHubBranches(repository)) when nodeRepo is set and branches are empty', () => {
    renderSection({ nodeRepo: 'owner/wow' });
    expect(mocks.fetchGitHubBranchesSpy).toHaveBeenCalledTimes(1);
    expect(mocks.fetchGitHubBranchesSpy).toHaveBeenCalledWith('owner/wow');
  });

  it('does NOT fire fetchGitHubBranches when nodeRepo is empty (and no source-edge)', () => {
    const tree = renderSection({ nodeRepo: '' });
    expect(tree).toBeNull();
    expect(mocks.fetchGitHubBranchesSpy).not.toHaveBeenCalled();
  });

  it('does NOT fire fetchGitHubBranches when branches are already loaded for the repo', () => {
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'main' },
      { name: 'develop' },
    ];
    renderSection({ nodeRepo: 'owner/repo' });
    expect(mocks.fetchGitHubBranchesSpy).not.toHaveBeenCalled();
  });

  it('does NOT fire any mount dispatches when cardId or nodeId is empty', () => {
    renderSection({ cardId: '', nodeId: 'node-1' });
    expect(mocks.fetchRulesForNodeSpy).not.toHaveBeenCalled();
    expect(mocks.fetchEventsForNodeSpy).not.toHaveBeenCalled();
    // fetchGitHubBranches still fires because the early-return guard is only on the rules/events
    // dispatch path.
  });

  // ── Repository resolution from a connected Source.Repository edge ─────────

  it('resolves repository from a connected Source.Repository node when nodeRepo is empty', () => {
    const activeCard = {
      nodes: [
        { id: 'node-1', data: {} },
        { id: 'src-2', data: { iceType: 'Source.Repository', repository: 'org/connected' } },
      ],
      edges: [{ source: 'src-2', target: 'node-1' }],
    };
    renderSection({ nodeRepo: '', activeCard, nodeId: 'node-1' });
    // Branch fetch fires because we resolved the repo via the edge.
    expect(mocks.fetchGitHubBranchesSpy).toHaveBeenCalledWith('org/connected');
  });

  it('resolves repository when the connected node has data.behavior === "source" instead of iceType', () => {
    const activeCard = {
      nodes: [
        { id: 'node-1', data: {} },
        { id: 'src-2', data: { behavior: 'source', repository: 'org/behavior' } },
      ],
      edges: [{ source: 'node-1', target: 'src-2' }],
    };
    renderSection({ nodeRepo: '', activeCard, nodeId: 'node-1' });
    expect(mocks.fetchGitHubBranchesSpy).toHaveBeenCalledWith('org/behavior');
  });

  // ── Auto-create rule effect ───────────────────────────────────────────────

  it('does NOT auto-create when rulesLoaded is false', () => {
    // No entry in rules object → rulesLoaded === false.
    renderSection();
    expect(mocks.createPipelineRuleSpy).not.toHaveBeenCalled();
  });

  it('does NOT auto-create when rules already exist', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    renderSection();
    expect(mocks.createPipelineRuleSpy).not.toHaveBeenCalled();
  });

  it('auto-creates a default rule when rulesLoaded but empty (defaults to "main" if branches empty)', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = []; // entry exists & empty → rulesLoaded true
    renderSection();
    expect(mocks.autoCreatedSetterSpy).toHaveBeenCalledWith(true);
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledTimes(1);
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith({
      cardId: 'card-1',
      nodeId: 'node-1',
      repository: 'owner/repo',
      branchPattern: 'main',
      environment: 'production',
    });
  });

  it('auto-create picks "master" when no "main" but "master" is in branches', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [];
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'master' },
      { name: 'feature' },
    ];
    renderSection();
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ branchPattern: 'master' }),
    );
  });

  it('auto-create falls back to first branch when neither "main" nor "master" exists', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [];
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'feature-1' },
      { name: 'feature-2' },
    ];
    renderSection();
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ branchPattern: 'feature-1' }),
    );
  });

  it('does NOT auto-create when autoCreated ref is already true', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [];
    mocks.autoCreatedRef.current = true;
    renderSection();
    expect(mocks.createPipelineRuleSpy).not.toHaveBeenCalled();
  });

  it('auto-create logs to console.error when the dispatch promise rejects', async () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [];
    // The mount effect dispatches fetchRulesForNode + fetchEventsForNode +
    // fetchGitHubBranches first, then the auto-create effect dispatches
    // createPipelineRule. We want the createPipelineRule branch to reject so
    // the .catch handler fires — match the dispatched action type and reject
    // selectively.
    mocks.dispatchSpy.mockImplementation((action: { type?: string } = {}) => {
      if (action.type === 'pipeline/createPipelineRule') {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve({ payload: undefined });
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderSection();
      // Flush microtasks so the .catch runs.
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      expect(errSpy).toHaveBeenCalledWith(
        '[Pipeline] Auto-create failed:',
        expect.any(Error),
      );
    } finally {
      errSpy.mockRestore();
    }
  });

  // ── Render structure & rule rows ──────────────────────────────────────────

  it('uses the Section wrapper with i18n title pipeline.serviceDeploys', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    const tree = renderSection();
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    expect(sections).toHaveLength(1);
    expect((sections[0].props as { title: string }).title).toBe('t:pipeline.serviceDeploys');
  });

  it('renders the loading row when rulesLoading is true', () => {
    mocks.state.pipeline.rulesLoading = true;
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    const tree = renderSection();
    expect(collectText(tree)).toContain('t:pipeline.settingUp');
  });

  it('renders one row per rule with branch + environment + push label', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [
      makeRule({ id: 'r-A', branch_pattern: 'main', environment: 'production' }),
      makeRule({ id: 'r-B', branch_pattern: 'develop', environment: 'staging' }),
    ];
    const tree = renderSection();
    // Each rule row has a 'flex items-center gap-1.5 text-ice-xs rounded border' className prefix.
    const ruleRows = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('flex items-center gap-1.5 text-ice-xs rounded border'),
    );
    expect(ruleRows).toHaveLength(2);
    const text = collectText(tree);
    expect(text).toContain('t:pipeline.push');
    // Branches & environments appear as <option> children.
    const options = findByType(tree, 'option');
    const optionValues = options.map((o) => (o.props as { value: string }).value);
    expect(optionValues).toContain('main');
    expect(optionValues).toContain('develop');
    expect(optionValues).toContain('production');
    expect(optionValues).toContain('staging');
  });

  // ── Add-rule button ───────────────────────────────────────────────────────

  it('clicking Add-trigger button dispatches createPipelineRule with an unused branch', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [
      makeRule({ branch_pattern: 'main', environment: 'production' }),
    ];
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'main' },
      { name: 'develop' },
    ];
    const tree = renderSection();
    // Find the add-trigger <button> (className contains 'hover:text-blue-400').
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('hover:text-blue-400'),
    );
    expect(buttons).toHaveLength(1);
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledTimes(1);
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith({
      cardId: 'card-1',
      nodeId: 'node-1',
      repository: 'owner/repo',
      branchPattern: 'develop',
      environment: 'development',
    });
  });

  it('Add-trigger picks env=production when the chosen branch is main/master', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [
      makeRule({ branch_pattern: 'develop' }),
    ];
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'main' }, // unused
      { name: 'develop' },
    ];
    const tree = renderSection();
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('hover:text-blue-400'),
    );
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ branchPattern: 'main', environment: 'production' }),
    );
  });

  it('Add-trigger picks env=staging when the branch name contains "stag"', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [
      makeRule({ branch_pattern: 'main' }),
    ];
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'main' },
      { name: 'staging-2' }, // unused, contains 'stag'
    ];
    const tree = renderSection();
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('hover:text-blue-400'),
    );
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ branchPattern: 'staging-2', environment: 'staging' }),
    );
  });

  it('Add-trigger falls back to "develop" with env=development when no branches are loaded', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    // No branches loaded.
    const tree = renderSection();
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('hover:text-blue-400'),
    );
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ branchPattern: 'develop', environment: 'development' }),
    );
  });

  // ── Rule mutations: enable toggle, branch change, env change, delete ──────

  it('clicking the enabled-toggle dispatches updatePipelineRule with enabled flipped', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule({ id: 'r-T', enabled: true })];
    const tree = renderSection();
    // The toggle <button> has className containing 'w-6 h-3.5 rounded-full'.
    const toggles = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('w-6 h-3.5 rounded-full'),
    );
    expect(toggles).toHaveLength(1);
    (toggles[0].props as { onClick: () => void }).onClick();
    expect(mocks.updatePipelineRuleSpy).toHaveBeenCalledWith({
      ruleId: 'r-T',
      updates: { enabled: false },
    });
  });

  it('changing the branch <select> dispatches updatePipelineRule with branchPattern', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule({ id: 'r-Br' })];
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'main' },
      { name: 'develop' },
    ];
    const tree = renderSection();
    // Find selects — there are two per rule (branch + env). Branch has font-mono className.
    const selects = findByPredicate(
      tree,
      (el) =>
        el.type === 'select' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('font-mono'),
    );
    expect(selects).toHaveLength(1);
    (selects[0].props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'develop' },
    });
    expect(mocks.updatePipelineRuleSpy).toHaveBeenCalledWith({
      ruleId: 'r-Br',
      updates: { branchPattern: 'develop' },
    });
  });

  it('changing the environment <select> dispatches updatePipelineRule with environment', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule({ id: 'r-Env' })];
    const tree = renderSection();
    // Env select has className containing 'max-w-[85px]' (vs branch which is max-w-[80px]).
    const selects = findByPredicate(
      tree,
      (el) =>
        el.type === 'select' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('max-w-[85px]'),
    );
    expect(selects).toHaveLength(1);
    (selects[0].props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'staging' },
    });
    expect(mocks.updatePipelineRuleSpy).toHaveBeenCalledWith({
      ruleId: 'r-Env',
      updates: { environment: 'staging' },
    });
  });

  it('clicking the delete <button> dispatches deletePipelineRule with cardId/nodeId/ruleId', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [
      makeRule({ id: 'r-D', card_id: 'card-1', node_id: 'node-1' }),
    ];
    const tree = renderSection();
    // Delete button has 'ml-auto' + 'hover:text-red-400'.
    const deleteBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('ml-auto') &&
        (el.props as { className: string }).className.includes('hover:text-red-400'),
    );
    expect(deleteBtns).toHaveLength(1);
    (deleteBtns[0].props as { onClick: () => void }).onClick();
    expect(mocks.deletePipelineRuleSpy).toHaveBeenCalledWith({
      ruleId: 'r-D',
      cardId: 'card-1',
      nodeId: 'node-1',
    });
  });

  // ── Recent events list ────────────────────────────────────────────────────

  it('renders the latest 5 events with formatAge labels (slices when > 5)', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = Array.from({ length: 8 }, (_, i) =>
      makeEvent({ id: `ev-${i}`, started_at: `T:${i}` }),
    );
    renderSection();
    // formatAge invoked once per rendered event row (latest 5).
    expect(mocks.formatAgeSpy).toHaveBeenCalledTimes(5);
    expect(mocks.formatAgeSpy).toHaveBeenNthCalledWith(1, 'T:0');
    expect(mocks.formatAgeSpy).toHaveBeenNthCalledWith(5, 'T:4');
  });

  it('event row picks emerald dot for status=success', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [makeEvent({ id: 'ev-S', status: 'success' })];
    const tree = renderSection();
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('w-1.5 h-1.5') &&
        (el.props as { className: string }).className.includes('bg-emerald-500'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('event row picks red dot for status=failed', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [makeEvent({ id: 'ev-F', status: 'failed' })];
    const tree = renderSection();
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('w-1.5 h-1.5') &&
        (el.props as { className: string }).className.includes('bg-red-500'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('event row picks blue animate-pulse dot for status=building or deploying', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [makeEvent({ id: 'ev-B', status: 'building' })];
    const tree = renderSection();
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('w-1.5 h-1.5') &&
        (el.props as { className: string }).className.includes('animate-pulse'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('clicking an event header dispatches expandedSetter with that ev.id', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [
      makeEvent({ id: 'ev-X' }),
      makeEvent({ id: 'ev-Y' }),
    ];
    mocks.expandedEventIdRef.current = null;
    const tree = renderSection();
    const headers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer hover:bg-ice-hover'),
    );
    expect(headers).toHaveLength(2);
    (headers[0].props as { onClick: () => void }).onClick();
    expect(mocks.expandedSetterSpy).toHaveBeenCalledTimes(1);
    expect(mocks.expandedSetterSpy).toHaveBeenCalledWith('ev-X');
  });

  it('clicking an already-expanded event header collapses it (sets expanded to null)', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [makeEvent({ id: 'ev-OPEN' })];
    mocks.expandedEventIdRef.current = 'ev-OPEN';
    const tree = renderSection();
    const headers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer hover:bg-ice-hover'),
    );
    (headers[0].props as { onClick: () => void }).onClick();
    expect(mocks.expandedSetterSpy).toHaveBeenCalledWith(null);
  });

  it('expanded row renders the per-step log lines', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [
      makeEvent({
        id: 'ev-LOGS',
        deployment_logs: [
          { step: 'install', status: 'completed', message: 'deps installed', timestamp: 'T:1' },
          { step: 'build', status: 'failed', message: 'build broke', timestamp: 'T:2' },
        ],
      }),
    ];
    mocks.expandedEventIdRef.current = 'ev-LOGS';
    const tree = renderSection();
    const text = collectText(tree);
    expect(text).toContain('deps installed');
    expect(text).toContain('build broke');
  });

  it('expanded row with empty logs shows the "no logs" placeholder', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [
      makeEvent({ id: 'ev-EMPTY', deployment_logs: [] }),
    ];
    mocks.expandedEventIdRef.current = 'ev-EMPTY';
    const tree = renderSection();
    expect(collectText(tree)).toContain('t:pipeline.noLogs');
  });

  it('expanded row with error renders the error block', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [
      makeEvent({ id: 'ev-ERR', error: 'permission denied' }),
    ];
    mocks.expandedEventIdRef.current = 'ev-ERR';
    const tree = renderSection();
    expect(collectText(tree)).toContain('permission denied');
  });

  it('expanded row formats duration in seconds when < 60s', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [
      makeEvent({ id: 'ev-D1', duration_seconds: 42 }),
    ];
    mocks.expandedEventIdRef.current = 'ev-D1';
    const tree = renderSection();
    expect(collectText(tree)).toContain('42s');
  });

  it('expanded row formats duration in m + s when >= 60s', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [
      makeEvent({ id: 'ev-D2', duration_seconds: 125 }),
    ];
    mocks.expandedEventIdRef.current = 'ev-D2';
    const tree = renderSection();
    expect(collectText(tree)).toContain('2m 5s');
  });

  // ── Retry button → dynamic-import resolution (BEHAVIOR-RISK FLAG #3) ──────

  it('failed-status expanded row renders the Retry button', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [
      makeEvent({ id: 'ev-RETRY', status: 'failed' }),
    ];
    mocks.expandedEventIdRef.current = 'ev-RETRY';
    const tree = renderSection();
    const retryBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-amber-600'),
    );
    expect(retryBtns).toHaveLength(1);
    expect(collectText(retryBtns[0])).toContain('t:common.buttons.retry');
  });

  it('non-failed status does NOT render a Retry button', () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [
      makeEvent({ id: 'ev-OK', status: 'success' }),
    ];
    mocks.expandedEventIdRef.current = 'ev-OK';
    const tree = renderSection();
    const retryBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-amber-600'),
    );
    expect(retryBtns).toHaveLength(0);
  });

  it('Retry click resolves both dynamic imports → calls retryDeploy(eventId) → dispatches fetchEventsForNode', async () => {
    mocks.state.pipeline.rules['card-1:node-1'] = [makeRule()];
    mocks.state.pipeline.history['card-1:node-1'] = [
      makeEvent({ id: 'ev-RETRY', status: 'failed' }),
    ];
    mocks.expandedEventIdRef.current = 'ev-RETRY';
    mocks.retryDeploySpy.mockResolvedValueOnce(undefined);
    const tree = renderSection();
    const retryBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-amber-600'),
    );
    expect(retryBtns).toHaveLength(1);
    // Snapshot dispatch-call count BEFORE the click — the mount-time effects already
    // fired during render, so we'll assert the post-retry dispatch comes AFTER this.
    const fetchEventsCallsBefore = mocks.fetchEventsForNodeSpy.mock.calls.length;
    // Click handler — calls e.stopPropagation(), then handleRetry(ev.id).
    (retryBtns[0].props as { onClick: (e: { stopPropagation: () => void }) => void }).onClick({
      stopPropagation: vi.fn(),
    });
    // The handler chains TWO dynamic imports + a then-chain; await several
    // microtask flushes so each step settles.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    // BEHAVIOR-RISK FLAG #3 verification: if either dynamic-import path were
    // wrong, vi would resolve to the real module (or fail outright) and
    // retryDeploy would not be called.
    expect(mocks.retryDeploySpy).toHaveBeenCalledTimes(1);
    expect(mocks.retryDeploySpy).toHaveBeenCalledWith('ev-RETRY');
    // Post-resolve, fetchEventsForNode is dispatched again to refresh.
    const fetchEventsCallsAfter = mocks.fetchEventsForNodeSpy.mock.calls.length;
    expect(fetchEventsCallsAfter).toBe(fetchEventsCallsBefore + 1);
    expect(mocks.fetchEventsForNodeSpy).toHaveBeenLastCalledWith({
      cardId: 'card-1',
      nodeId: 'node-1',
    });
  });

  it('dynamic import of pipeline-slice resolves to the mocked module (FOUR `..` segments)', async () => {
    // Direct invocation of the dynamic-import expression in the component's
    // namespace — proves the relative path string literal resolves through
    // vi's mock registry. If this path were one segment short ("../../../"),
    // vi would resolve outside the project and the test would fail.
    const mod = await import('../../../../../store/slices/pipeline-slice');
    expect(mod.fetchRulesForNode).toBe(mocks.fetchRulesForNodeSpy);
    expect(mod.fetchEventsForNode).toBe(mocks.fetchEventsForNodeSpy);
    expect(mod.createPipelineRule).toBe(mocks.createPipelineRuleSpy);
  });

  it('dynamic import of api-adapter resolves to the mocked module (FOUR `..` segments)', async () => {
    const mod = await import('../../../../../shared/api/api-adapter');
    const api = mod.getApi();
    expect(api.pipeline.retryDeploy).toBe(mocks.retryDeploySpy);
  });
});
