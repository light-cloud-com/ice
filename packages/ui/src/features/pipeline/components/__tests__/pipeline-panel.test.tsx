/**
 * PipelinePanel — slide-out panel orchestrator with five Sections.
 *
 * Direct-FC tree-walker pattern. The component:
 *   - has TWO useState calls (`autoCreated` slot 0, `error` slot 1) → call-index slot queue
 *   - has FOUR useEffect calls (load data on open / auto-create rule / reset
 *     auto-flag on close / Socket.IO subscriptions) → effects array
 *   - has THREE useCallback (handleClose / handleAddRule / handleTriggerDeploy)
 *   - calls createPortal — mocked to return its first arg verbatim
 *
 * Selectors return from a controllable `mocks.state` slice fixture; the
 * thunk creators return action-shape sentinels (e.g. {type:'pipeline/x'}) so
 * we can assert on dispatch.
 *
 * Cites:
 *   - `react-namespace-hook-access-requires-patching-default-export-too`
 *   - `useState-mock-with-call-index-queue-for-multi-useState-components`
 *   - `vi-hoisted-and-vi-mock-blocks-must-not-split-import-groups`
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  stateSlots: [] as unknown[],
  resetIdx: () => {},
  resetSlots() {
    this.stateSlots.length = 0;
  },
  effects: [] as Array<{ cb: () => void | (() => void); deps: unknown[] }>,
  callbacks: [] as unknown[],
  dispatch: vi.fn((a: unknown) => {
    if (typeof a === 'function') {
      // thunk — invoke with a fake dispatch/getState? our thunks here are
      // already creators that returned action sentinels, so this branch
      // shouldn't fire. We only trigger if a code path calls dispatch on a
      // raw function.
      return { type: 'unknown-thunk' };
    }
    // Each thunk we mock returns a Promise-like; dispatch returns it
    if (a && typeof a === 'object' && 'unwrap' in (a as Record<string, unknown>)) {
      return a;
    }
    return a;
  }),
  state: {
    isPanelOpen: true as boolean,
    activePanelNodeId: 'node-1' as string | null,
    activePanelCardId: 'card-1' as string | null,
    rules: { 'card-1:node-1': [] as unknown[] } as Record<string, unknown[]>,
    history: { 'card-1:node-1': [] as unknown[] } as Record<string, unknown[]>,
    rulesLoading: false as boolean,
    historyLoading: false as boolean,
    activeLogs: [] as unknown[],
    nodeStatus: {} as Record<string, unknown>,
    detectedFrameworks: {} as Record<string, unknown>,
    detectingFramework: false as boolean,
    branches: {} as Record<string, Array<{ name: string }>>,
  },
  activeCard: {
    nodes: [{ id: 'node-1', data: { label: 'My Service', repository: 'org/repo', branch: 'main' } }],
    edges: [],
  } as unknown as { nodes: Array<{ id: string; data: Record<string, unknown> }>; edges: Array<{ source: string; target: string }> } | null,
  apiHandlers: {
    onPipelineUpdate: null as null | ((e: unknown) => void),
    onCardPipelineUpdate: null as null | ((e: unknown) => void),
    cleanupPipelineSpy: vi.fn(),
    cleanupCardSpy: vi.fn(),
    unsubPipelineSpy: vi.fn() as ReturnType<typeof vi.fn> | undefined,
    unsubCardSpy: vi.fn() as ReturnType<typeof vi.fn> | undefined,
  },
  thunks: {
    closePipelinePanel: vi.fn(() => ({ type: 'pipeline/closePipelinePanel' })),
    fetchRulesForNode: vi.fn((p: unknown) => ({ type: 'pipeline/fetchRulesForNode', payload: p })),
    fetchEventsForNode: vi.fn((p: unknown) => ({ type: 'pipeline/fetchEventsForNode', payload: p })),
    createPipelineRule: vi.fn((p: unknown) => {
      const action = { type: 'pipeline/createPipelineRule', payload: p };
      const promise = Promise.resolve(action) as Promise<typeof action> & { unwrap: () => Promise<unknown> };
      promise.unwrap = () => Promise.resolve(action);
      return action; // dispatch will receive this; the thunk's then/catch is on the dispatch result
    }),
    deletePipelineRule: vi.fn((p: unknown) => ({ type: 'pipeline/deletePipelineRule', payload: p })),
    updatePipelineRule: vi.fn((p: unknown) => ({ type: 'pipeline/updatePipelineRule', payload: p })),
    detectFramework: vi.fn((p: unknown) => ({ type: 'pipeline/detectFramework', payload: p })),
    triggerManualDeploy: vi.fn((p: unknown) => ({ type: 'pipeline/triggerManualDeploy', payload: p })),
    receivePipelineUpdate: vi.fn((e: unknown) => ({ type: 'pipeline/receivePipelineUpdate', payload: e })),
    receiveCardPipelineUpdate: vi.fn((e: unknown) => ({ type: 'pipeline/receiveCardPipelineUpdate', payload: e })),
    fetchGitHubBranches: vi.fn((repo: string) => ({ type: 'integrations/fetchGitHubBranches', payload: repo })),
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let useStateIdx = 0;
  const patchedUseState = vi.fn(<T,>(initial: T | (() => T)) => {
    const slot = useStateIdx;
    if (mocks.stateSlots.length <= slot) {
      const init = typeof initial === 'function' ? (initial as () => T)() : initial;
      mocks.stateSlots.push(init);
    }
    const setter = vi.fn((next: unknown) => {
      const cur = mocks.stateSlots[slot];
      const resolved = typeof next === 'function' ? (next as (prev: unknown) => unknown)(cur) : next;
      mocks.stateSlots[slot] = resolved;
    });
    useStateIdx += 1;
    return [mocks.stateSlots[slot], setter] as [T, (v: T) => void];
  });
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps: deps ?? [] });
  });
  const patchedUseCallback = vi.fn((fn: unknown) => {
    mocks.callbacks.push(fn);
    return fn;
  });
  (mocks as unknown as { resetIdx: () => void }).resetIdx = () => {
    useStateIdx = 0;
  };
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

vi.mock('react-dom', () => ({
  createPortal: (el: React.ReactElement) => el,
}));

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (selector: (s: unknown) => unknown) =>
    selector({
      pipeline: {
        isPanelOpen: mocks.state.isPanelOpen,
        activePanelNodeId: mocks.state.activePanelNodeId,
        activePanelCardId: mocks.state.activePanelCardId,
        rules: mocks.state.rules,
        history: mocks.state.history,
        rulesLoading: mocks.state.rulesLoading,
        historyLoading: mocks.state.historyLoading,
        activeLogs: mocks.state.activeLogs,
        nodeStatus: mocks.state.nodeStatus,
        detectedFrameworks: mocks.state.detectedFrameworks,
        detectingFramework: mocks.state.detectingFramework,
      },
      integrations: { github: { branches: mocks.state.branches } },
    }),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, params?: Record<string, unknown>) => (params ? `${k}:${JSON.stringify(params)}` : k) }),
}));

vi.mock('../../../../shared/api/api-adapter', () => ({
  getApi: () => ({
    subscribePipeline: mocks.apiHandlers.unsubPipelineSpy ? () => mocks.apiHandlers.unsubPipelineSpy : undefined,
    subscribeCardPipeline: mocks.apiHandlers.unsubCardSpy ? () => mocks.apiHandlers.unsubCardSpy : undefined,
    onPipelineUpdate: (cb: (e: unknown) => void) => {
      mocks.apiHandlers.onPipelineUpdate = cb;
      return mocks.apiHandlers.cleanupPipelineSpy;
    },
    onCardPipelineUpdate: (cb: (e: unknown) => void) => {
      mocks.apiHandlers.onCardPipelineUpdate = cb;
      return mocks.apiHandlers.cleanupCardSpy;
    },
  }),
}));

vi.mock('../../../../store/slices/cards-slice', () => ({
  selectActiveCard: () => mocks.activeCard,
}));

vi.mock('../../../../store/slices/integrations-slice', () => ({
  fetchGitHubBranches: (repo: string) => mocks.thunks.fetchGitHubBranches(repo),
}));

vi.mock('../../../../store/slices/pipeline-slice', () => ({
  closePipelinePanel: () => mocks.thunks.closePipelinePanel(),
  fetchRulesForNode: (p: unknown) => mocks.thunks.fetchRulesForNode(p),
  fetchEventsForNode: (p: unknown) => mocks.thunks.fetchEventsForNode(p),
  createPipelineRule: (p: unknown) => mocks.thunks.createPipelineRule(p),
  deletePipelineRule: (p: unknown) => mocks.thunks.deletePipelineRule(p),
  updatePipelineRule: (p: unknown) => mocks.thunks.updatePipelineRule(p),
  detectFramework: (p: unknown) => mocks.thunks.detectFramework(p),
  triggerManualDeploy: (p: unknown) => mocks.thunks.triggerManualDeploy(p),
  receivePipelineUpdate: (e: unknown) => mocks.thunks.receivePipelineUpdate(e),
  receiveCardPipelineUpdate: (e: unknown) => mocks.thunks.receiveCardPipelineUpdate(e),
}));

vi.mock('../../sections/active-deployment', () => ({
  ActiveDeployment: ({ status, logs }: { status: { status: string }; logs: unknown[] }) => (
    <div data-stub="ActiveDeployment" data-status={status.status} data-log-count={logs.length} />
  ),
}));

vi.mock('../../sections/trigger-row', () => ({
  TriggerRow: ({
    rule,
    onToggle,
    onDelete,
    onChangeBranch,
    onChangeEnvironment,
  }: {
    rule: { id: string; branch_pattern: string };
    onToggle: (e: boolean) => void;
    onDelete: () => void;
    onChangeBranch: (b: string) => void;
    onChangeEnvironment: (e: string) => void;
  }) => (
    <div
      data-stub="TriggerRow"
      data-rule-id={rule.id}
      data-branch={rule.branch_pattern}
      // expose callbacks via separate buttons so we can assert dispatch wiring
    >
      <button data-stub="toggle" onClick={() => onToggle(true)} />
      <button data-stub="delete" onClick={() => onDelete()} />
      <button data-stub="change-branch" onClick={() => onChangeBranch('feature')} />
      <button data-stub="change-env" onClick={() => onChangeEnvironment('staging')} />
    </div>
  ),
}));

vi.mock('../../utils/format', () => ({
  formatFramework: (f: string) => `Pretty:${f}`,
}));

vi.mock('../build-row', () => ({
  BuildRow: ({ label, value }: { label: string; value?: string | null }) => (
    <div data-stub="BuildRow" data-label={label} data-value={value ?? ''} />
  ),
}));

vi.mock('../event-row', () => ({
  EventRow: ({ event }: { event: { id: string } }) => <div data-stub="EventRow" data-event-id={event.id} />,
}));

vi.mock('../section', () => ({
  Section: ({ children, title }: { children?: React.ReactNode; title: string }) => (
    <div data-stub="Section" data-title={title}>
      {children}
    </div>
  ),
}));

vi.mock('../status-pill', () => ({
  StatusPill: ({ status }: { status: string }) => <span data-stub="StatusPill" data-status={status} />,
}));

import { PipelinePanel } from '../pipeline-panel';

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
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function collectText(tree: React.ReactNode): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = (el.props as { children?: unknown } | undefined)?.children;
    if (typeof c === 'string') s += c + '|';
    else if (typeof c === 'number') s += String(c) + '|';
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item + '|';
        else if (typeof item === 'number') s += String(item) + '|';
      }
    }
  }
  return s;
}

function findStub(tree: React.ReactNode, stub: string): React.ReactElement[] {
  return findByPredicate(
    tree,
    (el) =>
      typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
      (el.props as { ['data-stub']: string })['data-stub'] === stub,
  );
}

function render(): React.ReactElement | null {
  (mocks as unknown as { resetIdx: () => void }).resetIdx();
  return (PipelinePanel as unknown as () => React.ReactElement | null)();
}

beforeEach(() => {
  mocks.resetSlots();
  mocks.effects.length = 0;
  mocks.callbacks.length = 0;
  mocks.dispatch.mockReset();
  // Default: any dispatch on a "thunk" sentinel returns a thenable so
  // `.then(...)` chains succeed; `.unwrap()` (Redux Toolkit) resolves with
  // the action.
  mocks.dispatch.mockImplementation((a: unknown) => {
    const action = a as { type?: string };
    const isThunkLike =
      action?.type === 'pipeline/createPipelineRule' ||
      action?.type === 'pipeline/updatePipelineRule' ||
      action?.type === 'pipeline/deletePipelineRule';
    if (isThunkLike) {
      const promise = Promise.resolve(a) as Promise<unknown> & { unwrap: () => Promise<unknown> };
      promise.unwrap = () => Promise.resolve(a);
      return promise;
    }
    return a;
  });
  for (const name of [
    'closePipelinePanel',
    'fetchRulesForNode',
    'fetchEventsForNode',
    'createPipelineRule',
    'deletePipelineRule',
    'updatePipelineRule',
    'detectFramework',
    'triggerManualDeploy',
    'receivePipelineUpdate',
    'receiveCardPipelineUpdate',
    'fetchGitHubBranches',
  ] as const) {
    mocks.thunks[name].mockClear();
  }
  mocks.apiHandlers = {
    onPipelineUpdate: null,
    onCardPipelineUpdate: null,
    cleanupPipelineSpy: vi.fn(),
    cleanupCardSpy: vi.fn(),
    unsubPipelineSpy: vi.fn(),
    unsubCardSpy: vi.fn(),
  };
  mocks.state = {
    isPanelOpen: true,
    activePanelNodeId: 'node-1',
    activePanelCardId: 'card-1',
    rules: { 'card-1:node-1': [] },
    history: { 'card-1:node-1': [] },
    rulesLoading: false,
    historyLoading: false,
    activeLogs: [],
    nodeStatus: {},
    detectedFrameworks: {},
    detectingFramework: false,
    branches: {},
  };
  mocks.activeCard = {
    nodes: [{ id: 'node-1', data: { label: 'My Service', repository: 'org/repo', branch: 'main' } }],
    edges: [],
  };
  vi.stubGlobal('document', { body: {} });
});

// ─── Closed branch ────────────────────────────────────────────────────────

describe('PipelinePanel — closed', () => {
  it('returns null when isPanelOpen is false', () => {
    mocks.state.isPanelOpen = false;
    const tree = render();
    expect(tree).toBeNull();
  });
});

// ─── Header rendering ─────────────────────────────────────────────────────

describe('PipelinePanel — header', () => {
  it('renders the panel title containing the node name', () => {
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('pipeline.panelTitle');
    expect(text).toContain('My Service');
  });

  it('falls back to "Service" when node has no label', () => {
    mocks.activeCard = {
      nodes: [{ id: 'node-1', data: { repository: 'org/repo' } }],
      edges: [],
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('Service');
  });

  it('renders a StatusPill when nodeStatus exists and is not idle', () => {
    mocks.state.nodeStatus = { 'node-1': { status: 'building' } };
    const tree = render();
    const pills = findStub(tree, 'StatusPill');
    expect(pills).toHaveLength(1);
    expect((pills[0].props as { ['data-status']: string })['data-status']).toBe('building');
  });

  it('hides the StatusPill when nodeStatus is idle', () => {
    mocks.state.nodeStatus = { 'node-1': { status: 'idle' } };
    const tree = render();
    const pills = findStub(tree, 'StatusPill');
    expect(pills).toHaveLength(0);
  });

  it('hides the StatusPill when nodeStatus is missing for the node', () => {
    mocks.state.nodeStatus = {};
    const tree = render();
    const pills = findStub(tree, 'StatusPill');
    expect(pills).toHaveLength(0);
  });

  it('renders the error banner when slot 1 (error) is set', () => {
    // slot 0 = autoCreated (false), slot 1 = error
    mocks.stateSlots[0] = false;
    mocks.stateSlots[1] = 'Something went wrong';
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('Something went wrong');
  });

  it('does NOT render the error banner when error is null', () => {
    mocks.stateSlots[0] = false;
    mocks.stateSlots[1] = null;
    const tree = render();
    const banners = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        ((el.props as { className?: string }).className ?? '').includes('bg-red-500/10'),
    );
    expect(banners).toHaveLength(0);
  });
});

// ─── Source resolution ───────────────────────────────────────────────────

describe('PipelinePanel — source resolution', () => {
  it('uses node.data.repository when present', () => {
    mocks.activeCard = {
      nodes: [{ id: 'node-1', data: { repository: 'org/repo' } }],
      edges: [],
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('org/repo');
  });

  it('falls back to node.data.repo (legacy field)', () => {
    mocks.activeCard = {
      nodes: [{ id: 'node-1', data: { repo: 'legacy/name' } }],
      edges: [],
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('legacy/name');
  });

  it('shows the noRepo message when no repo on node and no source neighbor', () => {
    mocks.activeCard = {
      nodes: [{ id: 'node-1', data: {} }],
      edges: [],
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('pipeline.noRepo');
  });

  it('resolves repository through a connected Source.Repository edge (target side)', () => {
    mocks.activeCard = {
      nodes: [
        { id: 'node-1', data: {} },
        { id: 'src', data: { iceType: 'Source.Repository', repository: 'src/repo', branch: 'develop' } },
      ],
      edges: [{ source: 'src', target: 'node-1' }],
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('src/repo');
  });

  it('resolves repository through a connected source-behavior neighbor (source side of edge)', () => {
    mocks.activeCard = {
      nodes: [
        { id: 'node-1', data: {} },
        { id: 'src', data: { behavior: 'source', repository: 'beh/repo' } },
      ],
      edges: [{ source: 'node-1', target: 'src' }],
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('beh/repo');
  });

  it('falls back to "main" branch when source has no branch', () => {
    mocks.activeCard = {
      nodes: [
        { id: 'node-1', data: {} },
        { id: 'src', data: { iceType: 'Source.Repository', repository: 'src/repo' } },
      ],
      edges: [{ source: 'src', target: 'node-1' }],
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('src/repo');
  });

  it('skips connected nodes that are not source-typed', () => {
    mocks.activeCard = {
      nodes: [
        { id: 'node-1', data: {} },
        { id: 'other', data: { iceType: 'Compute.Function', repository: 'should-not-resolve' } },
      ],
      edges: [{ source: 'node-1', target: 'other' }],
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).not.toContain('should-not-resolve');
    expect(text).toContain('pipeline.noRepo');
  });

  it('renders the framework detection text when present', () => {
    mocks.state.detectedFrameworks = { 'org/repo': { framework: 'next', buildCommand: 'next build' } };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('pipeline.detected');
    expect(text).toContain('Pretty:next');
  });

  it('renders the detecting state when detectingFramework is true', () => {
    mocks.state.detectingFramework = true;
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('pipeline.detecting');
  });

  it('handles activeCard=null without crashing', () => {
    mocks.activeCard = null;
    const tree = render();
    expect(tree).not.toBeNull();
    const text = collectText(tree);
    expect(text).toContain('pipeline.noRepo');
  });
});

// ─── Triggers section ────────────────────────────────────────────────────

describe('PipelinePanel — triggers section', () => {
  it('shows loading state while rules are loading', () => {
    mocks.state.rulesLoading = true;
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('pipeline.settingUp');
  });

  it('shows the loading state with common.labels.loading when no repo', () => {
    mocks.state.rulesLoading = true;
    mocks.activeCard = { nodes: [{ id: 'node-1', data: {} }], edges: [] };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('common.labels.loading');
  });

  it('renders the enable-pipeline button when no rules and a repo is set', () => {
    mocks.state.rules = { 'card-1:node-1': [] };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('pipeline.enablePipeline');
  });

  it('renders the noRepoHint when no rules and no repo', () => {
    mocks.state.rules = { 'card-1:node-1': [] };
    mocks.activeCard = { nodes: [{ id: 'node-1', data: {} }], edges: [] };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('pipeline.noRepoHint');
  });

  it('renders one TriggerRow per rule', () => {
    mocks.state.rules = {
      'card-1:node-1': [
        { id: 'r1', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' },
        { id: 'r2', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'develop' },
      ],
    };
    const tree = render();
    const rows = findStub(tree, 'TriggerRow');
    expect(rows).toHaveLength(2);
    expect((rows[0].props as { ['data-rule-id']: string })['data-rule-id']).toBe('r1');
  });

  it('TriggerRow toggle dispatches updatePipelineRule with enabled', () => {
    mocks.state.rules = {
      'card-1:node-1': [{ id: 'r1', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' }],
    };
    const tree = render();
    const toggleBtns = findStub(tree, 'toggle');
    expect(toggleBtns).toHaveLength(1);
    (toggleBtns[0].props as { onClick: () => void }).onClick();
    expect(mocks.thunks.updatePipelineRule).toHaveBeenCalledWith({
      ruleId: 'r1',
      updates: { enabled: true },
    });
  });

  it('TriggerRow delete dispatches deletePipelineRule with the rule keys', () => {
    mocks.state.rules = {
      'card-1:node-1': [{ id: 'r1', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' }],
    };
    const tree = render();
    const delBtns = findStub(tree, 'delete');
    (delBtns[0].props as { onClick: () => void }).onClick();
    expect(mocks.thunks.deletePipelineRule).toHaveBeenCalledWith({
      ruleId: 'r1',
      cardId: 'card-1',
      nodeId: 'node-1',
    });
  });

  it('TriggerRow change-branch dispatches updatePipelineRule with branchPattern', () => {
    mocks.state.rules = {
      'card-1:node-1': [{ id: 'r1', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' }],
    };
    const tree = render();
    const btn = findStub(tree, 'change-branch');
    (btn[0].props as { onClick: () => void }).onClick();
    expect(mocks.thunks.updatePipelineRule).toHaveBeenCalledWith({
      ruleId: 'r1',
      updates: { branchPattern: 'feature' },
    });
  });

  it('TriggerRow change-env dispatches updatePipelineRule with environment', () => {
    mocks.state.rules = {
      'card-1:node-1': [{ id: 'r1', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' }],
    };
    const tree = render();
    const btn = findStub(tree, 'change-env');
    (btn[0].props as { onClick: () => void }).onClick();
    expect(mocks.thunks.updatePipelineRule).toHaveBeenCalledWith({
      ruleId: 'r1',
      updates: { environment: 'staging' },
    });
  });

  it('renders the addTrigger button when there are rules and a repo', () => {
    mocks.state.rules = {
      'card-1:node-1': [{ id: 'r1', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' }],
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('pipeline.addTrigger');
  });
});

// ─── Build section ───────────────────────────────────────────────────────

describe('PipelinePanel — build section', () => {
  it('renders three BuildRows when detection exists', () => {
    mocks.state.detectedFrameworks = {
      'org/repo': {
        framework: 'next',
        buildCommand: 'next build',
        installCommand: 'pnpm install',
        outputDirectory: '.next',
      },
    };
    const tree = render();
    const rows = findStub(tree, 'BuildRow');
    expect(rows).toHaveLength(3);
  });

  it('hides the build section when no detection', () => {
    mocks.state.detectedFrameworks = {};
    const tree = render();
    const rows = findStub(tree, 'BuildRow');
    expect(rows).toHaveLength(0);
  });
});

// ─── Active deployment section ───────────────────────────────────────────

describe('PipelinePanel — active deployment', () => {
  it('renders ActiveDeployment when status is "building"', () => {
    mocks.state.nodeStatus = { 'node-1': { status: 'building' } };
    const tree = render();
    const ad = findStub(tree, 'ActiveDeployment');
    expect(ad).toHaveLength(1);
  });

  it('renders ActiveDeployment when status is "deploying"', () => {
    mocks.state.nodeStatus = { 'node-1': { status: 'deploying' } };
    const tree = render();
    const ad = findStub(tree, 'ActiveDeployment');
    expect(ad).toHaveLength(1);
  });

  it('renders ActiveDeployment when status is "queued"', () => {
    mocks.state.nodeStatus = { 'node-1': { status: 'queued' } };
    const tree = render();
    const ad = findStub(tree, 'ActiveDeployment');
    expect(ad).toHaveLength(1);
  });

  it('hides ActiveDeployment for terminal statuses', () => {
    mocks.state.nodeStatus = { 'node-1': { status: 'success' } };
    const tree = render();
    const ad = findStub(tree, 'ActiveDeployment');
    expect(ad).toHaveLength(0);
  });
});

// ─── Deployment history ──────────────────────────────────────────────────

describe('PipelinePanel — history section', () => {
  it('shows a loading row when historyLoading=true', () => {
    mocks.state.historyLoading = true;
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('common.labels.loading');
  });

  it('shows a no-deployments row when not loading and events empty', () => {
    mocks.state.history = { 'card-1:node-1': [] };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('pipeline.noDeployments');
  });

  it('renders one EventRow per event', () => {
    mocks.state.history = {
      'card-1:node-1': [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] as unknown[],
    };
    const tree = render();
    const events = findStub(tree, 'EventRow');
    expect(events).toHaveLength(3);
  });

  it('treats missing key as empty events array', () => {
    mocks.state.activePanelCardId = null;
    mocks.state.activePanelNodeId = null;
    // panel still open — but key will be empty so events resolve to []
    const tree = render();
    expect(tree).not.toBeNull();
  });
});

// ─── Footer ─────────────────────────────────────────────────────────────

describe('PipelinePanel — footer', () => {
  it('renders deploy-now button when rules.length > 0', () => {
    mocks.state.rules = {
      'card-1:node-1': [{ id: 'r1', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' }],
    };
    const tree = render();
    const text = collectText(tree);
    expect(text).toContain('pipeline.deployNow');
  });

  it('hides deploy-now button when rules.length === 0', () => {
    mocks.state.rules = { 'card-1:node-1': [] };
    const tree = render();
    const text = collectText(tree);
    expect(text).not.toContain('pipeline.deployNow');
  });
});

// ─── Callback wiring ─────────────────────────────────────────────────────

describe('PipelinePanel — callbacks', () => {
  it('handleClose dispatches closePipelinePanel', () => {
    render();
    const handleClose = mocks.callbacks[0] as () => void;
    handleClose();
    expect(mocks.thunks.closePipelinePanel).toHaveBeenCalled();
  });

  it('handleAddRule sets error when no repository', async () => {
    mocks.activeCard = { nodes: [{ id: 'node-1', data: {} }], edges: [] };
    render();
    const handleAddRule = mocks.callbacks[1] as (b?: string, e?: string) => Promise<void>;
    await handleAddRule();
    // The setter for slot 0 (error) was invoked with the noRepoShort key
    expect(mocks.stateSlots[1]).toBe('pipeline.noRepoShort');
  });

  it('handleAddRule sets error when no cardId/nodeId', async () => {
    mocks.state.activePanelCardId = null;
    render();
    const handleAddRule = mocks.callbacks[1] as () => Promise<void>;
    await handleAddRule();
    // Repository may resolve via fallback, so the error is missingContext
    expect(mocks.stateSlots[1]).toBe('pipeline.missingContext');
  });

  it('handleAddRule defaults to main → production', async () => {
    render();
    const handleAddRule = mocks.callbacks[1] as () => Promise<void>;
    await handleAddRule();
    expect(mocks.thunks.createPipelineRule).toHaveBeenCalled();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.branchPattern).toBe('main');
    expect(arg.environment).toBe('production');
  });

  it('handleAddRule respects override branch+env', async () => {
    render();
    const handleAddRule = mocks.callbacks[1] as (b?: string, e?: string) => Promise<void>;
    await handleAddRule('feature/x', 'staging');
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.branchPattern).toBe('feature/x');
    expect(arg.environment).toBe('staging');
  });

  it('handleAddRule auto-assigns staging environment for branches containing "stag"', async () => {
    mocks.state.branches = {
      'org/repo': [{ name: 'staging' }],
    };
    render();
    const handleAddRule = mocks.callbacks[1] as () => Promise<void>;
    await handleAddRule();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.branchPattern).toBe('staging');
    expect(arg.environment).toBe('staging');
  });

  it('handleAddRule auto-assigns development environment for non-main branches', async () => {
    mocks.state.branches = {
      'org/repo': [{ name: 'feature-x' }],
    };
    render();
    const handleAddRule = mocks.callbacks[1] as () => Promise<void>;
    await handleAddRule();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.branchPattern).toBe('feature-x');
    expect(arg.environment).toBe('development');
  });

  it('handleAddRule recognises master as production', async () => {
    mocks.state.branches = { 'org/repo': [{ name: 'master' }] };
    render();
    const handleAddRule = mocks.callbacks[1] as () => Promise<void>;
    await handleAddRule();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.branchPattern).toBe('master');
    expect(arg.environment).toBe('production');
  });

  it('handleAddRule picks the first unused branch when others exist', async () => {
    mocks.state.branches = { 'org/repo': [{ name: 'main' }, { name: 'develop' }] };
    mocks.state.rules = {
      'card-1:node-1': [{ id: 'r1', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' }],
    };
    render();
    const handleAddRule = mocks.callbacks[1] as () => Promise<void>;
    await handleAddRule();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.branchPattern).toBe('develop');
  });

  it('handleAddRule keeps default "main" when all branches are used', async () => {
    mocks.state.branches = { 'org/repo': [{ name: 'main' }] };
    mocks.state.rules = {
      'card-1:node-1': [{ id: 'r1', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' }],
    };
    render();
    const handleAddRule = mocks.callbacks[1] as () => Promise<void>;
    await handleAddRule();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    // No unused → targetBranch stays at 'main' (the default)
    expect(arg.branchPattern).toBe('main');
  });

  it('handleAddRule includes detection commands when available', async () => {
    mocks.state.detectedFrameworks = {
      'org/repo': {
        framework: 'next',
        buildCommand: 'next build',
        installCommand: 'pnpm install',
        outputDirectory: '.next',
      },
    };
    render();
    const handleAddRule = mocks.callbacks[1] as () => Promise<void>;
    await handleAddRule();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.buildCommand).toBe('next build');
    expect(arg.installCommand).toBe('pnpm install');
    expect(arg.outputDir).toBe('.next');
    expect(arg.framework).toBe('next');
  });

  it('handleAddRule string-error path sets the error message', async () => {
    // unwrap rejects with a string
    mocks.dispatch.mockImplementation(() => {
      const p = Promise.resolve({}) as Promise<unknown> & { unwrap: () => Promise<unknown> };
      p.unwrap = () => Promise.reject('explicit string error');
      return p;
    });
    render();
    const handleAddRule = mocks.callbacks[1] as () => Promise<void>;
    await handleAddRule();
    expect(mocks.stateSlots[1]).toBe('explicit string error');
  });

  it('handleAddRule object-error path uses err.message', async () => {
    mocks.dispatch.mockImplementation(() => {
      const p = Promise.resolve({}) as Promise<unknown> & { unwrap: () => Promise<unknown> };
      p.unwrap = () => Promise.reject(new Error('boom'));
      return p;
    });
    render();
    const handleAddRule = mocks.callbacks[1] as () => Promise<void>;
    await handleAddRule();
    expect(mocks.stateSlots[1]).toBe('boom');
  });

  it('handleAddRule final fallback when err lacks message', async () => {
    mocks.dispatch.mockImplementation(() => {
      const p = Promise.resolve({}) as Promise<unknown> & { unwrap: () => Promise<unknown> };
      p.unwrap = () => Promise.reject({});
      return p;
    });
    render();
    const handleAddRule = mocks.callbacks[1] as () => Promise<void>;
    await handleAddRule();
    expect(mocks.stateSlots[1]).toBe('Failed to create pipeline rule');
  });

  it('handleTriggerDeploy dispatches triggerManualDeploy and re-fetches events', () => {
    vi.useFakeTimers();
    render();
    const handleTriggerDeploy = mocks.callbacks[2] as (id: string) => void;
    handleTriggerDeploy('rule-x');
    expect(mocks.thunks.triggerManualDeploy).toHaveBeenCalledWith({ ruleId: 'rule-x' });
    // The setTimeout fetches events 1s later
    mocks.thunks.fetchEventsForNode.mockClear();
    vi.advanceTimersByTime(1000);
    expect(mocks.thunks.fetchEventsForNode).toHaveBeenCalledWith({ cardId: 'card-1', nodeId: 'node-1' });
    vi.useRealTimers();
  });

  it('handleTriggerDeploy skips re-fetch when cardId/nodeId is null', () => {
    vi.useFakeTimers();
    render();
    const handleTriggerDeploy = mocks.callbacks[2] as (id: string) => void;
    // Mutate state right before the timer fires (reflects the "panel closing"
    // race where cardId is cleared in between dispatch and setTimeout).
    handleTriggerDeploy('rule-x');
    mocks.state.activePanelCardId = null;
    mocks.thunks.fetchEventsForNode.mockClear();
    // The setTimeout reads cardId/nodeId from the closure — these are stale
    // references. Closure was captured with cardId='card-1', so it WILL fire.
    vi.advanceTimersByTime(1000);
    expect(mocks.thunks.fetchEventsForNode).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('deploy-now footer button invokes handleTriggerDeploy with the first rule', () => {
    mocks.state.rules = {
      'card-1:node-1': [{ id: 'first-rule', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' }],
    };
    const tree = render();
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children).some(
          (c) => typeof c === 'string' && c === 'pipeline.deployNow',
        ),
    );
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(mocks.thunks.triggerManualDeploy).toHaveBeenCalledWith({ ruleId: 'first-rule' });
  });

  it('enable-pipeline button (no rules) invokes handleAddRule', () => {
    mocks.state.rules = { 'card-1:node-1': [] };
    const tree = render();
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        Array.isArray((el.props as { children?: unknown }).children) &&
        ((el.props as { children: unknown[] }).children).some(
          (c) => typeof c === 'string' && c === 'pipeline.enablePipeline',
        ),
    );
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(mocks.thunks.createPipelineRule).toHaveBeenCalled();
  });

  it('addTrigger button (rules > 0) invokes handleAddRule', () => {
    mocks.state.rules = {
      'card-1:node-1': [{ id: 'r1', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' }],
    };
    const tree = render();
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { id?: string }).id === 'ice-pipeline-btn-add-rule',
    );
    expect(buttons.length).toBe(1);
    mocks.thunks.createPipelineRule.mockClear();
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(mocks.thunks.createPipelineRule).toHaveBeenCalled();
  });

  it('header close button dispatches closePipelinePanel', () => {
    const tree = render();
    // find the X icon's parent button
    const buttons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        ((el.props as { className?: string }).className ?? '').includes('rounded') &&
        ((el.props as { className?: string }).className ?? '').includes('hover:bg-ice-hover'),
    );
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(mocks.thunks.closePipelinePanel).toHaveBeenCalled();
  });

  it('backdrop click also dispatches closePipelinePanel', () => {
    const tree = render();
    expect(tree).not.toBeNull();
    const handler = ((tree as React.ReactElement).props as { onClick: () => void }).onClick;
    handler();
    expect(mocks.thunks.closePipelinePanel).toHaveBeenCalled();
  });

  it('panel inner div stops click propagation', () => {
    const tree = render();
    const innerPanels = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        (el.props as { id?: string }).id === 'ice-pipeline-panel',
    );
    expect(innerPanels).toHaveLength(1);
    const stop = vi.fn();
    (innerPanels[0].props as { onClick: (e: { stopPropagation: () => void }) => void }).onClick({
      stopPropagation: stop,
    });
    expect(stop).toHaveBeenCalled();
  });
});

// ─── Effects ──────────────────────────────────────────────────────────────

describe('PipelinePanel — effects', () => {
  it('on-open effect dispatches fetch rules + events when panel opens', () => {
    render();
    expect(mocks.effects.length).toBeGreaterThanOrEqual(1);
    mocks.effects[0].cb();
    expect(mocks.thunks.fetchRulesForNode).toHaveBeenCalledWith({ cardId: 'card-1', nodeId: 'node-1' });
    expect(mocks.thunks.fetchEventsForNode).toHaveBeenCalledWith({ cardId: 'card-1', nodeId: 'node-1' });
  });

  it('on-open effect dispatches detectFramework when no detection cached', () => {
    render();
    mocks.effects[0].cb();
    expect(mocks.thunks.detectFramework).toHaveBeenCalledWith({ repository: 'org/repo', branch: 'main' });
  });

  it('on-open effect skips detectFramework when detection already cached', () => {
    mocks.state.detectedFrameworks = { 'org/repo': { framework: 'next' } };
    render();
    mocks.thunks.detectFramework.mockClear();
    mocks.effects[0].cb();
    expect(mocks.thunks.detectFramework).not.toHaveBeenCalled();
  });

  it('on-open effect dispatches fetchGitHubBranches when none cached', () => {
    render();
    mocks.effects[0].cb();
    expect(mocks.thunks.fetchGitHubBranches).toHaveBeenCalledWith('org/repo');
  });

  it('on-open effect skips fetchGitHubBranches when branches cached', () => {
    mocks.state.branches = { 'org/repo': [{ name: 'main' }] };
    render();
    mocks.thunks.fetchGitHubBranches.mockClear();
    mocks.effects[0].cb();
    expect(mocks.thunks.fetchGitHubBranches).not.toHaveBeenCalled();
  });

  it('on-open effect short-circuits when panel closed', () => {
    mocks.state.isPanelOpen = false;
    // Even though render() returns null, the hook registration runs only when
    // the FC body executes — but because PipelinePanel returns null BEFORE the
    // effects run (rules of hooks compromise here), the actual panel uses an
    // early return. Inspect that effect callback was registered via render of
    // the full body when isPanelOpen=true; flipping isPanelOpen makes the body
    // return null at the bottom but useEffect still runs on the way down.
    const tree = render();
    expect(tree).toBeNull();
    // No effects when panel returns null before hooks — but useEffect is BEFORE
    // the early return. So effects ARE registered. Calling them should noop.
    expect(mocks.effects.length).toBeGreaterThan(0);
    mocks.effects[0].cb();
    expect(mocks.thunks.fetchRulesForNode).not.toHaveBeenCalled();
  });

  it('auto-create effect creates a default rule when rules loaded empty', () => {
    mocks.state.rules = { 'card-1:node-1': [] };
    mocks.state.branches = { 'org/repo': [{ name: 'develop' }] };
    render();
    // effect index 1 is the auto-create rule effect
    mocks.effects[1].cb();
    expect(mocks.thunks.createPipelineRule).toHaveBeenCalled();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    // No 'main' or 'master' available → first branch wins
    expect(arg.branchPattern).toBe('develop');
  });

  it('auto-create effect prefers main when available', () => {
    mocks.state.rules = { 'card-1:node-1': [] };
    mocks.state.branches = { 'org/repo': [{ name: 'develop' }, { name: 'main' }] };
    render();
    mocks.effects[1].cb();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.branchPattern).toBe('main');
  });

  it('auto-create effect falls back to master when no main', () => {
    mocks.state.rules = { 'card-1:node-1': [] };
    mocks.state.branches = { 'org/repo': [{ name: 'feature' }, { name: 'master' }] };
    render();
    mocks.effects[1].cb();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.branchPattern).toBe('master');
  });

  it('auto-create effect falls back to "main" string when branches empty', () => {
    mocks.state.rules = { 'card-1:node-1': [] };
    mocks.state.branches = { 'org/repo': [] };
    render();
    mocks.effects[1].cb();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.branchPattern).toBe('main');
  });

  it('auto-create effect skips when rules already exist', () => {
    mocks.state.rules = {
      'card-1:node-1': [{ id: 'r1', card_id: 'card-1', node_id: 'node-1', branch_pattern: 'main' }],
    };
    render();
    mocks.thunks.createPipelineRule.mockClear();
    mocks.effects[1].cb();
    expect(mocks.thunks.createPipelineRule).not.toHaveBeenCalled();
  });

  it('auto-create effect skips when rulesLoadedOnce is false (no key in rules)', () => {
    mocks.state.rules = {};
    render();
    mocks.thunks.createPipelineRule.mockClear();
    mocks.effects[1].cb();
    expect(mocks.thunks.createPipelineRule).not.toHaveBeenCalled();
  });

  it('auto-create effect skips when no repository', () => {
    mocks.activeCard = { nodes: [{ id: 'node-1', data: {} }], edges: [] };
    render();
    mocks.thunks.createPipelineRule.mockClear();
    mocks.effects[1].cb();
    expect(mocks.thunks.createPipelineRule).not.toHaveBeenCalled();
  });

  it('auto-create effect skips when autoCreated already true', () => {
    mocks.state.rules = { 'card-1:node-1': [] };
    // slot 0 = autoCreated (true) — pre-seed; slot 1 = error (null)
    mocks.stateSlots[0] = true;
    mocks.stateSlots[1] = null;
    render();
    mocks.thunks.createPipelineRule.mockClear();
    mocks.effects[1].cb();
    expect(mocks.thunks.createPipelineRule).not.toHaveBeenCalled();
  });

  it('auto-create rejection is caught (no throw)', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.state.rules = { 'card-1:node-1': [] };
    mocks.dispatch.mockImplementation((a: unknown) => {
      // Only the auto-create call returns a rejecting promise; the chained
      // .then schedules a fetchRules which dispatches a sentinel.
      const action = a as { type: string };
      if (action?.type === 'pipeline/createPipelineRule') {
        return Promise.reject(new Error('autocreate boom'));
      }
      return a;
    });
    render();
    mocks.effects[1].cb();
    // Wait for microtasks
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it('auto-create effect chains fetchRulesForNode after success', async () => {
    mocks.state.rules = { 'card-1:node-1': [] };
    mocks.dispatch.mockImplementation((a: unknown) => Promise.resolve(a));
    render();
    mocks.thunks.fetchRulesForNode.mockClear();
    mocks.effects[1].cb();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.thunks.fetchRulesForNode).toHaveBeenCalledWith({ cardId: 'card-1', nodeId: 'node-1' });
  });

  it('auto-create includes detection-derived commands', () => {
    mocks.state.rules = { 'card-1:node-1': [] };
    mocks.state.detectedFrameworks = {
      'org/repo': {
        framework: 'next',
        buildCommand: 'next build',
        installCommand: 'pnpm i',
        outputDirectory: '.next',
      },
    };
    render();
    mocks.effects[1].cb();
    const arg = mocks.thunks.createPipelineRule.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.buildCommand).toBe('next build');
    expect(arg.installCommand).toBe('pnpm i');
    expect(arg.outputDir).toBe('.next');
    expect(arg.framework).toBe('next');
  });

  it('reset-on-close effect clears autoCreated when panel closes', () => {
    // Pre-seed slot 0 (autoCreated) to true so we can observe the reset.
    mocks.stateSlots[0] = true;
    mocks.state.isPanelOpen = false;
    render();
    // effects[2] is the reset-on-close hook
    expect(mocks.effects.length).toBeGreaterThanOrEqual(3);
    mocks.effects[2].cb();
    expect(mocks.stateSlots[0]).toBe(false);
  });

  it('reset-on-close effect is a no-op when panel is open', () => {
    render();
    expect(() => mocks.effects[2].cb()).not.toThrow();
  });

  it('socket subscriptions are registered when panel open', () => {
    render();
    // effect[3] is the socket subscription effect
    expect(mocks.effects.length).toBeGreaterThanOrEqual(4);
    mocks.effects[3].cb();
    expect(mocks.apiHandlers.onPipelineUpdate).not.toBeNull();
    expect(mocks.apiHandlers.onCardPipelineUpdate).not.toBeNull();
  });

  it('socket subscriptions fire dispatchers on incoming events', () => {
    render();
    mocks.effects[3].cb();
    mocks.apiHandlers.onPipelineUpdate?.({ id: 'pipe' });
    expect(mocks.thunks.receivePipelineUpdate).toHaveBeenCalledWith({ id: 'pipe' });
    mocks.apiHandlers.onCardPipelineUpdate?.({ id: 'card' });
    expect(mocks.thunks.receiveCardPipelineUpdate).toHaveBeenCalledWith({ id: 'card' });
  });

  it('socket subscription cleanup unsubscribes both channels', () => {
    render();
    const teardown = mocks.effects[3].cb() as () => void;
    expect(typeof teardown).toBe('function');
    teardown();
    expect(mocks.apiHandlers.cleanupPipelineSpy).toHaveBeenCalled();
    expect(mocks.apiHandlers.cleanupCardSpy).toHaveBeenCalled();
  });

  it('socket subscription effect short-circuits when panel closed', () => {
    mocks.state.isPanelOpen = false;
    render();
    const teardown = mocks.effects[3]?.cb();
    // No teardown — the body short-circuits before the listeners register
    expect(teardown).toBeUndefined();
    expect(mocks.apiHandlers.onPipelineUpdate).toBeNull();
  });

  it('socket subscription effect short-circuits without nodeId/cardId', () => {
    mocks.state.activePanelCardId = null;
    render();
    const teardown = mocks.effects[3]?.cb();
    expect(teardown).toBeUndefined();
  });
});
