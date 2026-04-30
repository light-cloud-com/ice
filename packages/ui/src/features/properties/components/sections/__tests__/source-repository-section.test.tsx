/**
 * rf-props-21 — source-repository-section tests.
 *
 * `SourceRepositorySection` is the Source.Repository node configuration
 * panel — repo picker + branch dropdown + build command + output directory
 * + per-service trigger toggle row + live-build block + the
 * `RepoDeployList` (rf-props-17 sibling) for aggregated recent events.
 *
 * It uses `useDispatch`, `useSelector` (six selectors against integrations
 * + pipeline state), `useMemo` (pulled from real React via importOriginal),
 * ONE `useState` slot (`autoCreated`), and THREE `useEffect` callbacks
 * (mount-time branch fetch, per-service rule/event fetches, auto-create
 * default rule). The "manual deploy" button uses a dynamic
 * `import('../../../../store/slices/pipeline-slice')` to lazy-load the
 * `triggerManualDeploy` thunk — the rf-props blueprint behavior-risk flag #3
 * applies (a wrong relative-path string literal compiles fine but throws at
 * runtime), so the test asserts the dynamic import resolves through the
 * mock registry.
 *
 * We use the direct-FC tree-walker pattern with the queued-ref-dispatch
 * extension for `useState` (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`,
 * `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`,
 * `queued-ref-dispatch-extends-the-mutable-ref-usestate-mock-to-multi-state-fcs`,
 * `dynamic-import-of-api-adapter-needs-a-direct-vi-mock-on-the-target-module`):
 * invoke the component as a function with React's hooks mocked so the body
 * runs synchronously without a renderer context, then walk the returned
 * tree.
 *
 * Mocks:
 *  - `react-redux` → `useDispatch` returns `dispatchSpy`; `useSelector`
 *    invokes the supplied selector against `mocks.state`.
 *  - `react.useState` / `react.useEffect` → controlled (queued-ref + sync).
 *  - `'../../fields'` → `Section`, `TextField` are vi.fns the walker matches
 *    by reference.
 *  - `'../repo-deploy-list'` → `RepoDeployList` is a vi.fn the walker
 *    matches by reference (we assert prop forwarding rather than its
 *    rendered output).
 *  - `'../../../../../integrations/components/repo-selector'` →
 *    `RepoSelector` is a vi.fn the walker matches by reference.
 *  - `'../../../../i18n'.t` → echoes `t:<key>` for stable text assertions.
 *  - `'../../../../store/slices/integrations-slice'.fetchGitHubBranches` →
 *    tagged spy.
 *  - `'../../../../store/slices/pipeline-slice'.{fetchRulesForNode,
 *    fetchEventsForNode, createPipelineRule, updatePipelineRule,
 *    triggerManualDeploy}` → tagged spies. The mock factory exposes
 *    `default` so the dynamic-import destructure (used by triggerManualDeploy
 *    in our handler) resolves cleanly even though we don't destructure
 *    `default` here.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted stubs — vi.mock factories run before module-level statements, so
// shared identities have to live in vi.hoisted.
const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
  MockTextField: vi.fn(),
  MockRepoSelector: vi.fn(),
  MockRepoDeployList: vi.fn(),
  // ONE useState slot: autoCreated
  autoCreatedRef: { current: false },
  autoCreatedSetterSpy: vi.fn(),
  // useEffect — capture all callbacks/deps; fire each synchronously on render.
  effectCallbacks: [] as Array<() => void | Promise<void> | undefined>,
  effectDeps: [] as unknown[][],
  // Dispatch + state.
  dispatchSpy: vi.fn(),
  state: {
    integrations: {
      github: {
        branches: {} as Record<string, Array<{ name: string; protected?: boolean }>>,
      },
    },
    pipeline: {
      nodeStatus: {} as Record<
        string,
        { status: string; stage?: string; startedAt?: string }
      >,
      rules: {} as Record<string, Array<Record<string, unknown>>>,
      history: {} as Record<string, Array<Record<string, unknown>>>,
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
  triggerManualDeploySpy: vi.fn((arg: Record<string, unknown>) => ({
    type: 'pipeline/triggerManualDeploy',
    payload: arg,
  })),
  fetchGitHubBranchesSpy: vi.fn((repo: string) => ({
    type: 'integrations/fetchGitHubBranches',
    payload: repo,
  })),
}));

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatchSpy,
  useSelector: (selector: (s: typeof mocks.state) => unknown) => selector(mocks.state),
}));

// Mock React.useState / React.useEffect so the FC body runs synchronously and
// the one useState call is dealt back from the ref queue (single-slot here,
// but using the queued-ref pattern so additional slots can be added without
// reshaping). Effects fire synchronously per render so mount-time fetches
// dispatch their actions.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let callIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    callIdx = 0;
  };
  const dispatch = [
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
    // Direct-FC invocation has no React dispatcher context; useMemo just runs
    // the factory eagerly. Memoization is irrelevant for synchronous test
    // assertions.
    useMemo: vi.fn((factory: () => unknown, _deps?: unknown[]) => factory()),
  };
});

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
  TextField: mocks.MockTextField,
}));

vi.mock('../repo-deploy-list', () => ({
  RepoDeployList: mocks.MockRepoDeployList,
}));

vi.mock('../../../../integrations/components/repo-selector', () => ({
  RepoSelector: mocks.MockRepoSelector,
}));

vi.mock('../../../../../i18n', () => ({
  t: vi.fn((key: string) => `t:${key}`),
}));

vi.mock('../../../../../store/slices/integrations-slice', () => ({
  fetchGitHubBranches: mocks.fetchGitHubBranchesSpy,
}));

// CRITICAL: the dynamic import inside the manual-deploy click handler resolves
// through the same module-mock registry as static imports, so this mock at
// the test's relative path (FOUR `..` segments) covers both call paths (cite
// `dynamic-import-of-api-adapter-needs-a-direct-vi-mock-on-the-target-module`
// and `dynamic-import-with-default-destructure-needs-the-mock-to-expose-default`).
// If the source's dynamic-import path was not bumped during the move, the
// dynamic await would resolve against the real module path and break — so
// this test fails loudly if the path is wrong.
vi.mock('../../../../../store/slices/pipeline-slice', () => ({
  // Expose `default` for completeness — even though our dynamic import only
  // destructures `triggerManualDeploy`, future code may add `{ default: _, ...}`
  // patterns, and the rf-props-20 lesson says mock the default key up-front.
  default: vi.fn(),
  fetchRulesForNode: mocks.fetchRulesForNodeSpy,
  fetchEventsForNode: mocks.fetchEventsForNodeSpy,
  createPipelineRule: mocks.createPipelineRuleSpy,
  updatePipelineRule: mocks.updatePipelineRuleSpy,
  triggerManualDeploy: mocks.triggerManualDeploySpy,
}));

import { SourceRepositorySection } from '../source-repository-section';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12/13/14/15/16/17/18/19/20) ──

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
  node_id: 'svc-1',
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

const makeCard = (overrides: Record<string, unknown> = {}): any => ({
  id: 'card-1',
  nodes: [
    { id: 'src-1', type: 'resource', data: { iceType: 'Source.Repository' } },
    { id: 'svc-1', type: 'resource', data: { iceType: 'Compute.Service', label: 'svc-1-lbl' } },
  ],
  edges: [{ source: 'src-1', target: 'svc-1' }],
  ...overrides,
});

type RenderProps = Partial<{
  nodeRepo: string;
  nodeBranch: string;
  buildCommand: string;
  outputDirectory: string;
  onUpdateField: (field: string, value: unknown) => void;
  sourceNodeId: string;
  activeCard: any;
  activeEnvName: string;
}>;

const HAS_ACTIVE_CARD = (props: RenderProps): boolean =>
  Object.prototype.hasOwnProperty.call(props, 'activeCard');

const renderSection = (props: RenderProps = {}): React.ReactElement | null => {
  // Reset useState queue + spy state for each render.
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  mocks.MockSection.mockClear();
  mocks.MockTextField.mockClear();
  mocks.MockRepoSelector.mockClear();
  mocks.MockRepoDeployList.mockClear();
  mocks.dispatchSpy.mockClear();
  mocks.autoCreatedSetterSpy.mockClear();
  mocks.fetchRulesForNodeSpy.mockClear();
  mocks.fetchEventsForNodeSpy.mockClear();
  mocks.createPipelineRuleSpy.mockClear();
  mocks.updatePipelineRuleSpy.mockClear();
  mocks.triggerManualDeploySpy.mockClear();
  mocks.fetchGitHubBranchesSpy.mockClear();
  mocks.effectCallbacks.length = 0;
  mocks.effectDeps.length = 0;
  return SourceRepositorySection({
    nodeRepo: props.nodeRepo ?? 'owner/repo',
    nodeBranch: props.nodeBranch ?? 'main',
    buildCommand: props.buildCommand ?? '',
    outputDirectory: props.outputDirectory ?? '',
    onUpdateField: props.onUpdateField ?? vi.fn(),
    sourceNodeId: props.sourceNodeId ?? 'src-1',
    // Use hasOwnProperty so we can distinguish "no override" (use the default
    // makeCard()) from "explicit null/undefined" (pass it through verbatim).
    activeCard: HAS_ACTIVE_CARD(props) ? props.activeCard : makeCard(),
    activeEnvName: props.activeEnvName ?? 'production',
  }) as React.ReactElement | null;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SourceRepositorySection', () => {
  beforeEach(() => {
    mocks.autoCreatedRef.current = false;
    mocks.state.integrations.github.branches = {};
    mocks.state.pipeline.nodeStatus = {};
    mocks.state.pipeline.rules = {};
    mocks.state.pipeline.history = {};
    // Fresh resolved promise for thunk dispatch chains by default.
    mocks.dispatchSpy.mockImplementation(() => Promise.resolve({ payload: undefined }));
  });

  // ── Mount-time effects ────────────────────────────────────────────────────

  it('mount fires fetchGitHubBranches when nodeRepo is set and branches cache is empty', () => {
    renderSection({ nodeRepo: 'owner/repo' });
    expect(mocks.fetchGitHubBranchesSpy).toHaveBeenCalledTimes(1);
    expect(mocks.fetchGitHubBranchesSpy).toHaveBeenCalledWith('owner/repo');
  });

  it('mount does NOT fire fetchGitHubBranches when nodeRepo is empty', () => {
    renderSection({ nodeRepo: '' });
    expect(mocks.fetchGitHubBranchesSpy).not.toHaveBeenCalled();
  });

  it('mount does NOT fire fetchGitHubBranches when branches cache is already populated', () => {
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'main' },
      { name: 'develop' },
    ];
    renderSection({ nodeRepo: 'owner/repo' });
    expect(mocks.fetchGitHubBranchesSpy).not.toHaveBeenCalled();
  });

  it('mount fires fetchRulesForNode + fetchEventsForNode for every connected service', () => {
    const card = makeCard({
      nodes: [
        { id: 'src-1', type: 'resource', data: { iceType: 'Source.Repository' } },
        { id: 'svc-A', type: 'resource', data: { iceType: 'Compute.Service', label: 'A' } },
        { id: 'svc-B', type: 'resource', data: { iceType: 'Compute.Service', label: 'B' } },
      ],
      edges: [
        { source: 'src-1', target: 'svc-A' },
        { source: 'svc-B', target: 'src-1' },
      ],
    });
    renderSection({ activeCard: card });
    const ruleCalls = mocks.fetchRulesForNodeSpy.mock.calls.map((c) => c[0]);
    const eventCalls = mocks.fetchEventsForNodeSpy.mock.calls.map((c) => c[0]);
    expect(ruleCalls).toContainEqual({ cardId: 'card-1', nodeId: 'svc-A' });
    expect(ruleCalls).toContainEqual({ cardId: 'card-1', nodeId: 'svc-B' });
    expect(eventCalls).toContainEqual({ cardId: 'card-1', nodeId: 'svc-A' });
    expect(eventCalls).toContainEqual({ cardId: 'card-1', nodeId: 'svc-B' });
  });

  it('connectedServices excludes Source.* nodes (only resource non-source)', () => {
    const card = makeCard({
      nodes: [
        { id: 'src-1', type: 'resource', data: { iceType: 'Source.Repository' } },
        { id: 'src-2', type: 'resource', data: { iceType: 'Source.Image' } }, // excluded
        { id: 'svc-1', type: 'resource', data: { iceType: 'Compute.Service' } },
      ],
      edges: [
        { source: 'src-1', target: 'src-2' },
        { source: 'src-1', target: 'svc-1' },
      ],
    });
    renderSection({ activeCard: card });
    expect(mocks.fetchRulesForNodeSpy).toHaveBeenCalledTimes(1);
    expect(mocks.fetchRulesForNodeSpy).toHaveBeenCalledWith({ cardId: 'card-1', nodeId: 'svc-1' });
  });

  it('connectedServices excludes non-resource node types', () => {
    const card = makeCard({
      nodes: [
        { id: 'src-1', type: 'resource', data: { iceType: 'Source.Repository' } },
        { id: 'group-1', type: 'group', data: {} }, // excluded
      ],
      edges: [{ source: 'src-1', target: 'group-1' }],
    });
    renderSection({ activeCard: card });
    expect(mocks.fetchRulesForNodeSpy).not.toHaveBeenCalled();
  });

  it('connectedServices is empty when activeCard is missing', () => {
    renderSection({ activeCard: null, sourceNodeId: 'src-1' });
    expect(mocks.fetchRulesForNodeSpy).not.toHaveBeenCalled();
    expect(mocks.fetchEventsForNodeSpy).not.toHaveBeenCalled();
  });

  it('connectedServices is empty when sourceNodeId is missing/empty', () => {
    renderSection({ sourceNodeId: '' });
    expect(mocks.fetchRulesForNodeSpy).not.toHaveBeenCalled();
    expect(mocks.fetchEventsForNodeSpy).not.toHaveBeenCalled();
  });

  it('connectedServices service label falls back to id-prefix when data.label is absent', () => {
    const card = makeCard({
      nodes: [
        { id: 'src-1', type: 'resource', data: { iceType: 'Source.Repository' } },
        { id: 'service-with-long-id', type: 'resource', data: { iceType: 'Compute.Service' } },
      ],
      edges: [{ source: 'src-1', target: 'service-with-long-id' }],
    });
    mocks.state.pipeline.rules['card-1:service-with-long-id'] = []; // rules-loaded, empty
    renderSection({ activeCard: card });
    // Auto-create uses the service's id, so we can verify the connection succeeded.
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'service-with-long-id' }),
    );
  });

  // ── Auto-create rule effect ───────────────────────────────────────────────

  it('does NOT auto-create when nodeRepo is empty', () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [];
    renderSection({ nodeRepo: '' });
    expect(mocks.createPipelineRuleSpy).not.toHaveBeenCalled();
  });

  it('does NOT auto-create when no rules entry has loaded for any service', () => {
    // No entry in rules object → anyRulesLoaded === false.
    renderSection();
    expect(mocks.createPipelineRuleSpy).not.toHaveBeenCalled();
  });

  it('does NOT auto-create when rules already exist', () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [makeRule()];
    renderSection();
    expect(mocks.createPipelineRuleSpy).not.toHaveBeenCalled();
  });

  it('does NOT auto-create when autoCreated ref is already true', () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [];
    mocks.autoCreatedRef.current = true;
    renderSection();
    expect(mocks.createPipelineRuleSpy).not.toHaveBeenCalled();
  });

  it('auto-creates a default rule when rules loaded empty (defaults to "main" if branches empty)', () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = []; // entry exists & empty → loaded
    renderSection();
    expect(mocks.autoCreatedSetterSpy).toHaveBeenCalledWith(true);
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledTimes(1);
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith({
      cardId: 'card-1',
      nodeId: 'svc-1',
      repository: 'owner/repo',
      branchPattern: 'main',
      environment: 'production',
      buildCommand: undefined,
      installCommand: undefined,
      outputDir: undefined,
    });
  });

  it('auto-create picks "master" when no "main" but "master" is in branches', () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [];
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
    mocks.state.pipeline.rules['card-1:svc-1'] = [];
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'feature-1' },
      { name: 'feature-2' },
    ];
    renderSection();
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ branchPattern: 'feature-1' }),
    );
  });

  it('auto-create forwards buildCommand/outputDirectory when set', () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [];
    renderSection({ buildCommand: 'npm run build', outputDirectory: 'dist' });
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ buildCommand: 'npm run build', outputDir: 'dist' }),
    );
  });

  it('auto-create uses the first connected service as the target', () => {
    const card = makeCard({
      nodes: [
        { id: 'src-1', type: 'resource', data: { iceType: 'Source.Repository' } },
        { id: 'svc-A', type: 'resource', data: { iceType: 'Compute.Service', label: 'A' } },
        { id: 'svc-B', type: 'resource', data: { iceType: 'Compute.Service', label: 'B' } },
      ],
      edges: [
        { source: 'src-1', target: 'svc-A' },
        { source: 'src-1', target: 'svc-B' },
      ],
    });
    mocks.state.pipeline.rules['card-1:svc-A'] = [];
    renderSection({ activeCard: card });
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'svc-A' }),
    );
  });

  it('auto-create uses activeEnvName for environment', () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [];
    renderSection({ activeEnvName: 'staging' });
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'staging' }),
    );
  });

  it('auto-create logs to console.error when the dispatch promise rejects', async () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [];
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

  it('auto-create chains fetchRulesForNode after the create resolves', async () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [];
    renderSection();
    // The fetchRulesForNode dispatch is chained after the create resolves —
    // wait microtasks for the promise chain.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    // fetchRulesForNode is called once on mount + once after auto-create resolves.
    expect(mocks.fetchRulesForNodeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  // ── Repo selector wiring ──────────────────────────────────────────────────

  it('renders a Section with title "t:properties.source.repository" containing the RepoSelector', () => {
    const tree = renderSection();
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    const repoSection = sections.find(
      (s) => (s.props as { title: string }).title === 't:properties.source.repository',
    );
    expect(repoSection).toBeDefined();
    const repoSelectors = findByPredicate(repoSection!, (el) => el.type === mocks.MockRepoSelector);
    expect(repoSelectors).toHaveLength(1);
    expect((repoSelectors[0].props as { value: string }).value).toBe('owner/repo');
  });

  it('RepoSelector onChange dispatches onUpdateField("repository", repo) and resets branch on switch', () => {
    const onUpdateField = vi.fn();
    const tree = renderSection({ nodeRepo: 'owner/old', onUpdateField });
    const repoSelectors = findByPredicate(tree, (el) => el.type === mocks.MockRepoSelector);
    const onChange = (repoSelectors[0].props as { onChange: (r: string) => void }).onChange;
    onChange('owner/new');
    expect(onUpdateField).toHaveBeenCalledWith('repository', 'owner/new');
    expect(onUpdateField).toHaveBeenCalledWith('branch', 'main');
    expect(mocks.fetchGitHubBranchesSpy).toHaveBeenCalledWith('owner/new');
  });

  it('RepoSelector onChange does NOT reset branch when the new repo equals the current one', () => {
    const onUpdateField = vi.fn();
    const tree = renderSection({ nodeRepo: 'owner/repo', onUpdateField });
    onUpdateField.mockClear();
    mocks.fetchGitHubBranchesSpy.mockClear();
    const repoSelectors = findByPredicate(tree, (el) => el.type === mocks.MockRepoSelector);
    const onChange = (repoSelectors[0].props as { onChange: (r: string) => void }).onChange;
    onChange('owner/repo');
    expect(onUpdateField).toHaveBeenCalledWith('repository', 'owner/repo');
    // No branch reset, no extra fetch (the conditional `if (repo && repo !== nodeRepo)` short-circuits).
    expect(onUpdateField).not.toHaveBeenCalledWith('branch', 'main');
    expect(mocks.fetchGitHubBranchesSpy).not.toHaveBeenCalled();
  });

  it('RepoSelector onChange to empty string does NOT trigger branch reset / fetch', () => {
    const onUpdateField = vi.fn();
    const tree = renderSection({ nodeRepo: 'owner/repo', onUpdateField });
    onUpdateField.mockClear();
    mocks.fetchGitHubBranchesSpy.mockClear();
    const repoSelectors = findByPredicate(tree, (el) => el.type === mocks.MockRepoSelector);
    const onChange = (repoSelectors[0].props as { onChange: (r: string) => void }).onChange;
    onChange('');
    expect(onUpdateField).toHaveBeenCalledWith('repository', '');
    expect(onUpdateField).not.toHaveBeenCalledWith('branch', 'main');
    expect(mocks.fetchGitHubBranchesSpy).not.toHaveBeenCalled();
  });

  // ── Branch dropdown ───────────────────────────────────────────────────────

  it('does NOT render the branch Section when nodeRepo is empty', () => {
    const tree = renderSection({ nodeRepo: '' });
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    const branchSection = sections.find(
      (s) => (s.props as { title: string }).title === 't:properties.source.branch',
    );
    expect(branchSection).toBeUndefined();
  });

  it('renders the branch select with current value + populated options when branches are loaded', () => {
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'main', protected: true },
      { name: 'develop' },
      { name: 'feature' },
    ];
    const tree = renderSection({ nodeBranch: 'develop' });
    const selects = findByType(tree, 'select');
    const branchSelect = selects.find(
      (s) => (s.props as { 'data-prop-key'?: string })['data-prop-key'] === 'branch',
    );
    expect(branchSelect).toBeDefined();
    expect((branchSelect!.props as { value: string }).value).toBe('develop');
    const options = findByType(branchSelect!, 'option');
    const optionValues = options.map((o) => (o.props as { value: string }).value);
    expect(optionValues).toEqual(['main', 'develop', 'feature']);
  });

  it('branch select renders fallback options (current + main + master) when branches cache is empty', () => {
    const tree = renderSection({ nodeBranch: 'feature-x' });
    const selects = findByType(tree, 'select');
    const branchSelect = selects.find(
      (s) => (s.props as { 'data-prop-key'?: string })['data-prop-key'] === 'branch',
    );
    const options = findByType(branchSelect!, 'option');
    const optionValues = options.map((o) => (o.props as { value: string }).value);
    expect(optionValues).toEqual(['feature-x', 'main', 'master']);
  });

  it('branch fallback omits "main" when nodeBranch === "main"', () => {
    const tree = renderSection({ nodeBranch: 'main' });
    const selects = findByType(tree, 'select');
    const branchSelect = selects.find(
      (s) => (s.props as { 'data-prop-key'?: string })['data-prop-key'] === 'branch',
    );
    const options = findByType(branchSelect!, 'option');
    const optionValues = options.map((o) => (o.props as { value: string }).value);
    // Two options: nodeBranch ('main') + master.
    expect(optionValues).toEqual(['main', 'master']);
  });

  it('branch fallback omits "master" when nodeBranch === "master"', () => {
    const tree = renderSection({ nodeBranch: 'master' });
    const selects = findByType(tree, 'select');
    const branchSelect = selects.find(
      (s) => (s.props as { 'data-prop-key'?: string })['data-prop-key'] === 'branch',
    );
    const options = findByType(branchSelect!, 'option');
    const optionValues = options.map((o) => (o.props as { value: string }).value);
    expect(optionValues).toEqual(['master', 'main']);
  });

  it('branch select onChange dispatches onUpdateField("branch", value)', () => {
    const onUpdateField = vi.fn();
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'main' },
      { name: 'develop' },
    ];
    const tree = renderSection({ onUpdateField });
    const selects = findByType(tree, 'select');
    const branchSelect = selects.find(
      (s) => (s.props as { 'data-prop-key'?: string })['data-prop-key'] === 'branch',
    );
    (branchSelect!.props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'develop' },
    });
    expect(onUpdateField).toHaveBeenCalledWith('branch', 'develop');
  });

  it('protected branches show a protected suffix in the option text', () => {
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'main', protected: true },
      { name: 'feature' },
    ];
    const tree = renderSection();
    const selects = findByType(tree, 'select');
    const branchSelect = selects.find(
      (s) => (s.props as { 'data-prop-key'?: string })['data-prop-key'] === 'branch',
    );
    const text = collectText(branchSelect!);
    expect(text).toContain('t:properties.source.branchProtected');
  });

  // ── Build / output directory ─────────────────────────────────────────────

  it('does NOT render build TextFields when nodeRepo is empty', () => {
    const tree = renderSection({ nodeRepo: '' });
    const tfs = findByPredicate(tree, (el) => el.type === mocks.MockTextField);
    expect(tfs).toHaveLength(0);
  });

  it('renders TextFields for build command + output directory with current values', () => {
    const tree = renderSection({ buildCommand: 'npm run build', outputDirectory: 'dist' });
    const tfs = findByPredicate(tree, (el) => el.type === mocks.MockTextField);
    expect(tfs).toHaveLength(2);
    const buildTF = tfs.find(
      (t) => (t.props as { propKey?: string }).propKey === 'buildCommand',
    );
    const outputTF = tfs.find(
      (t) => (t.props as { propKey?: string }).propKey === 'outputDirectory',
    );
    expect(buildTF).toBeDefined();
    expect(outputTF).toBeDefined();
    expect((buildTF!.props as { value: string }).value).toBe('npm run build');
    expect((outputTF!.props as { value: string }).value).toBe('dist');
  });

  it('build/output TextField onChange dispatches onUpdateField with the right field name', () => {
    const onUpdateField = vi.fn();
    const tree = renderSection({ onUpdateField });
    const tfs = findByPredicate(tree, (el) => el.type === mocks.MockTextField);
    const buildTF = tfs.find(
      (t) => (t.props as { propKey?: string }).propKey === 'buildCommand',
    )!;
    (buildTF.props as { onChange: (v: string) => void }).onChange('yarn build');
    expect(onUpdateField).toHaveBeenCalledWith('buildCommand', 'yarn build');
    const outputTF = tfs.find(
      (t) => (t.props as { propKey?: string }).propKey === 'outputDirectory',
    )!;
    (outputTF.props as { onChange: (v: string) => void }).onChange('build/');
    expect(onUpdateField).toHaveBeenCalledWith('outputDirectory', 'build/');
  });

  // ── Triggers section ──────────────────────────────────────────────────────

  it('renders a Triggers section with envName in the title when nodeRepo + connectedServices', () => {
    const tree = renderSection({ activeEnvName: 'staging' });
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    const triggerSection = sections.find(
      (s) => (s.props as { title: string }).title === 'Triggers · staging',
    );
    expect(triggerSection).toBeDefined();
  });

  it('shows "settingUp" placeholder when no rules for env AND autoCreated is true', () => {
    // Pre-set autoCreated → true so the render-time read shows the
    // settingUp branch. The auto-create effect fires the setter
    // (asserted elsewhere), but mock useState returns the ref value at
    // render time, so we set the ref directly here.
    mocks.autoCreatedRef.current = true;
    mocks.state.pipeline.rules['card-1:svc-1'] = []; // rules-loaded, no env-matching rule
    const tree = renderSection();
    const text = collectText(tree);
    expect(text).toContain('t:pipeline.settingUp');
  });

  it('shows "noTriggersForEnv" placeholder when no rules and autoCreated is false', () => {
    // No rules entry → anyRulesLoaded=false → no auto-create runs → autoCreated stays false.
    const tree = renderSection();
    const text = collectText(tree);
    expect(text).toContain('t:pipeline.noTriggersForEnv');
  });

  it('renders one trigger row per connected service', () => {
    const card = makeCard({
      nodes: [
        { id: 'src-1', type: 'resource', data: { iceType: 'Source.Repository' } },
        { id: 'svc-A', type: 'resource', data: { iceType: 'Compute.Service', label: 'A' } },
        { id: 'svc-B', type: 'resource', data: { iceType: 'Compute.Service', label: 'B' } },
      ],
      edges: [
        { source: 'src-1', target: 'svc-A' },
        { source: 'src-1', target: 'svc-B' },
      ],
    });
    mocks.state.pipeline.rules['card-1:svc-A'] = [makeRule({ id: 'r-A', node_id: 'svc-A' })];
    mocks.state.pipeline.rules['card-1:svc-B'] = [makeRule({ id: 'r-B', node_id: 'svc-B' })];
    const tree = renderSection({ activeCard: card });
    const triggerRows = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes(
          'flex items-center gap-1.5 text-ice-xs rounded border',
        ),
    );
    expect(triggerRows).toHaveLength(2);
  });

  it('clicking the toggle on a service WITH a rule dispatches updatePipelineRule with enabled flipped', () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [
      makeRule({ id: 'r-T', node_id: 'svc-1', enabled: true, environment: 'production' }),
    ];
    const tree = renderSection();
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

  it('clicking the toggle on a service WITHOUT a rule calls handleAddRule → createPipelineRule', () => {
    // svc-1 has rules entry (loaded) but no env-matching rule for 'production'.
    mocks.state.pipeline.rules['card-1:svc-1'] = [
      makeRule({ environment: 'staging' }), // doesn't match active env
    ];
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'main' },
      { name: 'develop' },
    ];
    // Ensure auto-create doesn't fire by pre-marking autoCreated.
    mocks.autoCreatedRef.current = true;
    const tree = renderSection();
    const toggles = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('w-6 h-3.5 rounded-full'),
    );
    expect(toggles).toHaveLength(1);
    mocks.createPipelineRuleSpy.mockClear();
    (toggles[0].props as { onClick: () => void }).onClick();
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledTimes(1);
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith({
      cardId: 'card-1',
      nodeId: 'svc-1',
      repository: 'owner/repo',
      branchPattern: 'main',
      environment: 'production',
      buildCommand: undefined,
      outputDir: undefined,
    });
  });

  it('handleAddRule picks the first branch when no rules exist for the service+env', () => {
    // svc-1 has a rule in a *different* env, so toggle in active env calls
    // handleAddRule (not updatePipelineRule). The branch-skip filter narrows
    // by node_id+environment === activeEnvName — preview-env has no rules,
    // so usedBranches is empty and `find` returns the first branch.
    mocks.state.pipeline.rules['card-1:svc-1'] = [
      makeRule({ branch_pattern: 'main', environment: 'production', node_id: 'svc-1' }),
    ];
    mocks.state.integrations.github.branches['owner/repo'] = [
      { name: 'main' },
      { name: 'develop' },
    ];
    mocks.autoCreatedRef.current = true;
    const tree = renderSection({ activeEnvName: 'preview' });
    const toggles = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('w-6 h-3.5 rounded-full'),
    );
    mocks.createPipelineRuleSpy.mockClear();
    (toggles[0].props as { onClick: () => void }).onClick();
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ branchPattern: 'main', environment: 'preview' }),
    );
  });

  it('handleAddRule falls back to "main" when no branches loaded', () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = []; // loaded, empty
    mocks.autoCreatedRef.current = true;
    // Switch to a unique env to avoid env-rule match.
    const tree = renderSection({ activeEnvName: 'preview' });
    const toggles = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('w-6 h-3.5 rounded-full'),
    );
    (toggles[0].props as { onClick: () => void }).onClick();
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ branchPattern: 'main' }),
    );
  });

  // ── Manual deploy button (dynamic import) ─────────────────────────────────

  it('renders the Deploy button only when the rule is disabled', () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [
      makeRule({ id: 'r-D', enabled: false, environment: 'production' }),
    ];
    const tree = renderSection();
    const deployBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-emerald-600'),
    );
    expect(deployBtns).toHaveLength(1);
    expect(collectText(deployBtns[0])).toContain('t:common.buttons.deploy');
  });

  it('does NOT render the Deploy button when the rule is enabled', () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [
      makeRule({ enabled: true, environment: 'production' }),
    ];
    const tree = renderSection();
    const deployBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-emerald-600'),
    );
    expect(deployBtns).toHaveLength(0);
  });

  it('Deploy click resolves the dynamic import → dispatches triggerManualDeploy', async () => {
    mocks.state.pipeline.rules['card-1:svc-1'] = [
      makeRule({ id: 'r-DEPLOY', enabled: false, environment: 'production' }),
    ];
    const tree = renderSection();
    const deployBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-emerald-600'),
    );
    expect(deployBtns).toHaveLength(1);
    (deployBtns[0].props as { onClick: () => void }).onClick();
    // The handler chains a dynamic import + a then-chain; await microtask flush.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    // BEHAVIOR-RISK FLAG #3 verification: if the dynamic-import path were
    // wrong (three vs four `..` segments), vi would resolve outside the
    // mock registry and triggerManualDeploy would not be called.
    expect(mocks.triggerManualDeploySpy).toHaveBeenCalledTimes(1);
    expect(mocks.triggerManualDeploySpy).toHaveBeenCalledWith({ ruleId: 'r-DEPLOY' });
  });

  it('dynamic import of pipeline-slice resolves to the mocked module (FOUR `..` segments)', async () => {
    // Direct invocation of the dynamic-import expression in the component's
    // namespace — proves the relative path string literal resolves through
    // vi's mock registry. If this path were one segment short ("../../../"),
    // vi would resolve outside the project and the test would fail.
    const mod = await import('../../../../../store/slices/pipeline-slice');
    expect(mod.fetchRulesForNode).toBe(mocks.fetchRulesForNodeSpy);
    expect(mod.triggerManualDeploy).toBe(mocks.triggerManualDeploySpy);
  });

  // ── Empty / no-services hint ──────────────────────────────────────────────

  it('shows the no-service-connected hint when nodeRepo is set but no services connected', () => {
    const card = makeCard({
      nodes: [{ id: 'src-1', type: 'resource', data: { iceType: 'Source.Repository' } }],
      edges: [],
    });
    const tree = renderSection({ activeCard: card });
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    const triggerSection = sections.find(
      (s) => (s.props as { title: string }).title === 't:pipeline.triggers',
    );
    expect(triggerSection).toBeDefined();
    expect(collectText(triggerSection!)).toContain('t:properties.noServiceHint');
  });

  // ── Live build block ──────────────────────────────────────────────────────

  it('renders the live build Section when at least one service is in building/deploying/queued', () => {
    mocks.state.pipeline.nodeStatus['svc-1'] = {
      status: 'building',
      stage: 'compile',
      startedAt: new Date(Date.now() - 3000).toISOString(), // ~3s ago
    };
    const tree = renderSection();
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    const liveBuild = sections.find(
      (s) => (s.props as { title: string }).title === 't:pipeline.liveBuild',
    );
    expect(liveBuild).toBeDefined();
    expect(collectText(liveBuild!)).toContain('compile');
  });

  it('does NOT render the live build Section when no service is active', () => {
    const tree = renderSection();
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    const liveBuild = sections.find(
      (s) => (s.props as { title: string }).title === 't:pipeline.liveBuild',
    );
    expect(liveBuild).toBeUndefined();
  });

  it('live build shows the timeoutSoon warning when elapsed > 240s', () => {
    mocks.state.pipeline.nodeStatus['svc-1'] = {
      status: 'building',
      stage: 'compile',
      startedAt: new Date(Date.now() - 250 * 1000).toISOString(), // > 240s
    };
    const tree = renderSection();
    const text = collectText(tree);
    expect(text).toContain('t:pipeline.timeoutSoon');
  });

  it('live build with deploying status uses the deploy stage value', () => {
    mocks.state.pipeline.nodeStatus['svc-1'] = {
      status: 'deploying',
      stage: '[deploy] uploading artifacts',
      startedAt: new Date(Date.now() - 10000).toISOString(),
    };
    const tree = renderSection();
    const text = collectText(tree);
    expect(text).toContain('[deploy] uploading artifacts');
  });

  it('live build hides empty time string when startedAt is missing', () => {
    mocks.state.pipeline.nodeStatus['svc-1'] = {
      status: 'queued',
      // no startedAt — elapsed === 0 → timeStr is ''
    };
    const tree = renderSection();
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    const liveBuild = sections.find(
      (s) => (s.props as { title: string }).title === 't:pipeline.liveBuild',
    );
    expect(liveBuild).toBeDefined();
    // Status word should still appear.
    expect(collectText(liveBuild!)).toContain('queued');
  });

  // ── RepoDeployList wiring ────────────────────────────────────────────────

  it('renders RepoDeployList only when allEvents > 0', () => {
    const treeNoEvents = renderSection();
    expect(findByPredicate(treeNoEvents, (el) => el.type === mocks.MockRepoDeployList)).toHaveLength(0);
    mocks.state.pipeline.history['card-1:svc-1'] = [makeEvent()];
    const treeWithEvents = renderSection();
    expect(findByPredicate(treeWithEvents, (el) => el.type === mocks.MockRepoDeployList)).toHaveLength(1);
  });

  it('RepoDeployList receives events sorted desc by started_at', () => {
    mocks.state.pipeline.history['card-1:svc-1'] = [
      makeEvent({ id: 'old', started_at: '2025-01-01T00:00:00Z' }),
      makeEvent({ id: 'new', started_at: '2025-06-01T00:00:00Z' }),
    ];
    const tree = renderSection();
    const lists = findByPredicate(tree, (el) => el.type === mocks.MockRepoDeployList);
    expect(lists).toHaveLength(1);
    const events = (lists[0].props as { events: Array<{ id: string }> }).events;
    expect(events[0].id).toBe('new');
    expect(events[1].id).toBe('old');
  });

  it('RepoDeployList receives connectedServices + cardId', () => {
    mocks.state.pipeline.history['card-1:svc-1'] = [makeEvent()];
    const tree = renderSection();
    const lists = findByPredicate(tree, (el) => el.type === mocks.MockRepoDeployList);
    const props = lists[0].props as {
      connectedServices: Array<{ id: string }>;
      cardId: string;
    };
    expect(props.cardId).toBe('card-1');
    expect(props.connectedServices.map((s) => s.id)).toEqual(['svc-1']);
  });

  it('RepoDeployList receives events aggregated across multiple connected services', () => {
    const card = makeCard({
      nodes: [
        { id: 'src-1', type: 'resource', data: { iceType: 'Source.Repository' } },
        { id: 'svc-A', type: 'resource', data: { iceType: 'Compute.Service', label: 'A' } },
        { id: 'svc-B', type: 'resource', data: { iceType: 'Compute.Service', label: 'B' } },
      ],
      edges: [
        { source: 'src-1', target: 'svc-A' },
        { source: 'src-1', target: 'svc-B' },
      ],
    });
    mocks.state.pipeline.history['card-1:svc-A'] = [makeEvent({ id: 'a1' })];
    mocks.state.pipeline.history['card-1:svc-B'] = [makeEvent({ id: 'b1' })];
    const tree = renderSection({ activeCard: card });
    const lists = findByPredicate(tree, (el) => el.type === mocks.MockRepoDeployList);
    const events = (lists[0].props as { events: Array<{ id: string }> }).events;
    expect(events.map((e) => e.id).sort()).toEqual(['a1', 'b1']);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('handles null activeCard (cardId becomes empty, no service fetches)', () => {
    renderSection({ activeCard: null });
    expect(mocks.fetchRulesForNodeSpy).not.toHaveBeenCalled();
    expect(mocks.fetchEventsForNodeSpy).not.toHaveBeenCalled();
  });

  it('cardId falls back to empty string when activeCard.id is undefined', () => {
    const card = makeCard({ id: undefined });
    mocks.state.pipeline.rules[':svc-1'] = []; // empty cardId in the key
    renderSection({ activeCard: card });
    // Auto-create runs with empty cardId.
    expect(mocks.createPipelineRuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: '' }),
    );
  });

  it('handles activeCard with no edges array', () => {
    const card = makeCard({ edges: undefined });
    renderSection({ activeCard: card });
    // No edges → no connected services.
    expect(mocks.fetchRulesForNodeSpy).not.toHaveBeenCalled();
  });

  it('handles activeCard with no nodes array', () => {
    const card = makeCard({ nodes: undefined });
    renderSection({ activeCard: card });
    // edge target node-find returns undefined → service skipped.
    expect(mocks.fetchRulesForNodeSpy).not.toHaveBeenCalled();
  });
});
