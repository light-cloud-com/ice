/**
 * rf-props-17 — repo-deploy-list section.
 *
 * `RepoDeployList` uses `useState` (expand toggle) and `useDispatch`. We use
 * the direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays` and
 * `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`):
 * invoke the component as a function with React's hooks mocked so the body
 * runs synchronously without a React renderer context, then walk the
 * returned tree to find rows / handlers / mocked Section.
 *
 * Mocks:
 *  - `react-redux.useDispatch` → controlled spy so `dispatch(fetchEventsForNode(...))`
 *    in the retry handler is observable.
 *  - React `useState` → controlled state per test (expanded vs. collapsed)
 *    plus a capture for `setExpandedId` so we can assert click handlers
 *    invoke it with the right argument.
 *  - `'../../fields'` → `Section` becomes a passthrough vi.fn the walker
 *    matches by reference (cite
 *    `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`).
 *  - `formatAge` → returns `'AGE:<input>'` so age stamps are deterministically
 *    assertable.
 *  - `fetchEventsForNode` → vi.fn that returns a tagged action object so the
 *    dispatch call can be verified.
 *  - i18n `t` → echoes `t:<key>` for stable text assertions.
 *
 * The dynamic `getApi()` import inside the retry click handler is intercepted
 * by mocking the `'../../../../shared/api/api-adapter'` module — when the
 * handler awaits `import(...)`, vi resolves to the mocked module, exposing
 * `pipeline.retryDeploy` as a spy.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted stubs — `vi.mock` factories run before module-level statements, so
// the mock identities have to live in a `vi.hoisted` block to share their JS
// reference with the test bodies.
const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
  dispatchSpy: vi.fn(),
  setStateSpy: vi.fn(),
  // Default expanded-state: collapsed (null). Overridden per test by reassigning
  // `currentExpandedId` and re-importing the component-under-test isn't viable;
  // instead we mutate this ref before each `RepoDeployList(...)` call.
  expandedIdRef: { current: null as string | null },
  retryDeploySpy: vi.fn(),
  formatAgeSpy: vi.fn((s: string) => `AGE:${s}`),
  fetchEventsForNodeSpy: vi.fn((arg: { cardId: string; nodeId: string }) => ({
    type: 'pipeline/fetchEventsForNode/fulfilled',
    payload: arg,
  })),
}));

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatchSpy,
}));

// Mock React.useState so the FC body runs without a renderer context. The
// `useState<string | null>(null)` call returns `[expandedIdRef.current, setStateSpy]`
// — tests can flip `expandedIdRef.current = 'ev-2'` to render the
// expanded variant.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn(() => [mocks.expandedIdRef.current, mocks.setStateSpy]),
  };
});

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
}));

vi.mock('../../../utils/format-age', () => ({
  formatAge: mocks.formatAgeSpy,
}));

vi.mock('../../../../../store/slices/pipeline-slice', () => ({
  fetchEventsForNode: mocks.fetchEventsForNodeSpy,
}));

// The retry click handler does a dynamic `import('../../../../shared/api/api-adapter')`.
// Mock the module so the awaited import resolves to a stub `getApi` that returns
// our `retryDeploySpy` — the handler can then drive the .then chain.
vi.mock('../../../../../shared/api/api-adapter', () => ({
  getApi: () => ({
    pipeline: {
      retryDeploy: mocks.retryDeploySpy,
    },
  }),
}));

vi.mock('../../../../../i18n', () => ({
  t: vi.fn((key: string) => `t:${key}`),
}));

import { RepoDeployList } from '../repo-deploy-list';
import type { DeploymentEvent } from '../../../../../store/slices/pipeline-slice';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12/13/14/15/16) ──────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
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

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
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

const makeEvent = (overrides: Partial<DeploymentEvent> = {}): DeploymentEvent => ({
  id: 'ev-1',
  rule_id: 'r-1',
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

const renderList = (
  events: DeploymentEvent[],
  connectedServices: Array<{ id: string; label: string }> = [],
  cardId = 'card-1',
): React.ReactElement => {
  mocks.MockSection.mockClear();
  mocks.dispatchSpy.mockClear();
  mocks.setStateSpy.mockClear();
  mocks.retryDeploySpy.mockClear();
  mocks.formatAgeSpy.mockClear();
  mocks.fetchEventsForNodeSpy.mockClear();
  return RepoDeployList({ events, connectedServices, cardId }) as React.ReactElement;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RepoDeployList', () => {
  beforeEach(() => {
    mocks.expandedIdRef.current = null;
  });

  it('renders a single Section wrapper titled t:pipeline.serviceDeploys', () => {
    const tree = renderList([]);
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    expect(sections).toHaveLength(1);
    expect((sections[0].props as { title: string }).title).toBe('t:pipeline.serviceDeploys');
  });

  it('renders no event rows when events is empty', () => {
    const tree = renderList([]);
    // No outer rounded border divs → no per-event rows.
    const rows = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded border border-ice-border'),
    );
    expect(rows).toHaveLength(0);
  });

  it('renders one row per event up to the first 8', () => {
    const tenEvents = Array.from({ length: 10 }, (_, i) => makeEvent({ id: `ev-${i}`, commit_sha: `sha${i}` }));
    const tree = renderList(tenEvents);
    const rows = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded border border-ice-border'),
    );
    expect(rows).toHaveLength(8);
  });

  it('row shows commit_sha (sliced to 7), commit_message, branch when no rule.environment, and formatAge output', () => {
    const tree = renderList([
      makeEvent({
        id: 'ev-1',
        commit_sha: 'abcdef1234567890',
        commit_message: 'fix tests',
        branch: 'main',
        started_at: '2025-01-01T00:00:00Z',
      }),
    ]);
    const text = collectText(tree);
    expect(text).toContain('abcdef1');
    expect(text).not.toContain('abcdef12');
    expect(text).toContain('fix tests');
    expect(text).toContain('main');
    expect(mocks.formatAgeSpy).toHaveBeenCalledWith('2025-01-01T00:00:00Z');
    expect(text).toContain('AGE:2025-01-01T00:00:00Z');
  });

  it('prefers ev.rule?.environment over ev.branch in the env stamp slot', () => {
    const tree = renderList([
      makeEvent({
        commit_message: 'envtest',
        branch: 'feature/x',
        rule: { branch_pattern: 'main', environment: 'prod' },
      }),
    ]);
    const text = collectText(tree);
    expect(text).toContain('prod');
    // The branch should not appear when an environment override is set.
    expect(text).not.toContain('feature/x');
  });

  it('status="success" renders the emerald dot', () => {
    const tree = renderList([makeEvent({ status: 'success' })]);
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-emerald-500'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('status="failed" renders the red dot', () => {
    const tree = renderList([makeEvent({ status: 'failed' })]);
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-red-500'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('status="building" renders the blue animate-pulse dot', () => {
    const tree = renderList([makeEvent({ status: 'building' })]);
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-blue-500') &&
        (el.props as { className: string }).className.includes('animate-pulse'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('status="deploying" also renders the blue animate-pulse dot', () => {
    const tree = renderList([makeEvent({ status: 'deploying' })]);
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-blue-500') &&
        (el.props as { className: string }).className.includes('animate-pulse'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('any other status renders the muted text-3 fallback dot', () => {
    const tree = renderList([makeEvent({ status: 'queued' as DeploymentEvent['status'] })]);
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-ice-text-3') &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('clicking the row header invokes setExpandedId with that event id (collapsed → expanded)', () => {
    mocks.expandedIdRef.current = null;
    const tree = renderList([makeEvent({ id: 'ev-A' }), makeEvent({ id: 'ev-B' })]);
    const headers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer hover:bg-ice-hover'),
    );
    expect(headers.length).toBe(2);
    const headerA = headers[0];
    (headerA.props as { onClick: () => void }).onClick();
    expect(mocks.setStateSpy).toHaveBeenCalledTimes(1);
    expect(mocks.setStateSpy).toHaveBeenCalledWith('ev-A');
  });

  it('clicking an already-expanded row collapses to null', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const tree = renderList([makeEvent({ id: 'ev-A' })]);
    const headers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer hover:bg-ice-hover'),
    );
    (headers[0].props as { onClick: () => void }).onClick();
    expect(mocks.setStateSpy).toHaveBeenCalledTimes(1);
    expect(mocks.setStateSpy).toHaveBeenCalledWith(null);
  });

  it('the chevron carries rotate-180 when expanded, no rotate when collapsed', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const treeExpanded = renderList([makeEvent({ id: 'ev-A' })]);
    const expandedChevrons = findByPredicate(
      treeExpanded,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('transition-transform') &&
        (el.props as { className: string }).className.includes('rotate-180'),
    );
    expect(expandedChevrons.length).toBe(1);

    mocks.expandedIdRef.current = null;
    const treeCollapsed = renderList([makeEvent({ id: 'ev-A' })]);
    const collapsedChevrons = findByPredicate(
      treeCollapsed,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('transition-transform') &&
        !(el.props as { className: string }).className.includes('rotate-180'),
    );
    expect(collapsedChevrons.length).toBe(1);
  });

  it('expanded panel renders the deployment_logs entries with completed/failed/in-progress glyph', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const tree = renderList([
      makeEvent({
        id: 'ev-A',
        deployment_logs: [
          {
            step: 'build',
            status: 'completed',
            message: 'build done',
            timestamp: '2025-01-01T00:00:00Z',
            duration_ms: 1500,
          },
          {
            step: 'deploy',
            status: 'failed',
            message: 'deploy err',
            timestamp: '2025-01-01T00:00:00Z',
            duration_ms: 2300,
          },
          { step: 'test', status: 'started', message: 'tests', timestamp: '2025-01-01T00:00:00Z' },
        ],
      }),
    ]);
    const text = collectText(tree);
    expect(text).toContain('build done');
    expect(text).toContain('deploy err');
    expect(text).toContain('tests');
    // 1500 ms → '1.5' + 's' as adjacent children → 'collectText' joins with
    // a space (cite `collect-text-helper-joins-adjacent-jsx-children-with-a-separator`).
    expect(text).toContain('1.5 s');
    expect(text).toContain('2.3 s');
  });

  it('expanded panel renders the noLogsRecorded fallback when deployment_logs is empty', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const tree = renderList([makeEvent({ id: 'ev-A', deployment_logs: [] })]);
    const text = collectText(tree);
    expect(text).toContain('t:properties.noLogsRecorded');
  });

  it('expanded panel falls back to [] when deployment_logs is undefined (null-coalesce branch)', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const ev = makeEvent({ id: 'ev-A' });
    // Drop the deployment_logs key entirely — exercises the `|| []` fallback
    // even though the type interface marks the field as required.
    delete (ev as { deployment_logs?: unknown }).deployment_logs;
    const tree = renderList([ev]);
    expect(collectText(tree)).toContain('t:properties.noLogsRecorded');
  });

  it('expanded panel surfaces ev.error when present', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const tree = renderList([makeEvent({ id: 'ev-A', error: 'permission denied' })]);
    expect(collectText(tree)).toContain('permission denied');
  });

  it('expanded panel formats duration_seconds < 60 as Ns', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const tree = renderList([makeEvent({ id: 'ev-A', duration_seconds: 42 })]);
    expect(collectText(tree)).toContain('42s');
  });

  it('expanded panel formats duration_seconds >= 60 as Nm Ms', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const tree = renderList([makeEvent({ id: 'ev-A', duration_seconds: 125 })]);
    expect(collectText(tree)).toContain('2m 5s');
  });

  it('renders Retry button only on failed events when expanded', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const treeFailed = renderList([makeEvent({ id: 'ev-A', status: 'failed' })]);
    const retryButtonsFailed = findByType(treeFailed, 'button');
    expect(retryButtonsFailed).toHaveLength(1);
    expect(collectText(treeFailed)).toContain('t:common.buttons.retry');

    mocks.expandedIdRef.current = 'ev-A';
    const treeSuccess = renderList([makeEvent({ id: 'ev-A', status: 'success' })]);
    const retryButtonsSuccess = findByType(treeSuccess, 'button');
    expect(retryButtonsSuccess).toHaveLength(0);
  });

  it('Retry click calls e.stopPropagation, then retryDeploy(ev.id), then dispatches fetchEventsForNode for each connected service', async () => {
    mocks.expandedIdRef.current = 'ev-failed';
    mocks.retryDeploySpy.mockResolvedValueOnce(undefined);
    const tree = renderList(
      [makeEvent({ id: 'ev-failed', status: 'failed' })],
      [
        { id: 'svc-a', label: 'A' },
        { id: 'svc-b', label: 'B' },
      ],
      'card-XYZ',
    );
    const buttons = findByType(tree, 'button');
    expect(buttons).toHaveLength(1);
    const stopPropagation = vi.fn();
    const onClick = (
      buttons[0].props as {
        onClick: (e: { stopPropagation: () => void }) => void;
      }
    ).onClick;
    onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    // Wait for the dynamic import + retry promise + then chain to settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.retryDeploySpy).toHaveBeenCalledWith('ev-failed');
    expect(mocks.fetchEventsForNodeSpy).toHaveBeenCalledTimes(2);
    expect(mocks.fetchEventsForNodeSpy).toHaveBeenNthCalledWith(1, {
      cardId: 'card-XYZ',
      nodeId: 'svc-a',
    });
    expect(mocks.fetchEventsForNodeSpy).toHaveBeenNthCalledWith(2, {
      cardId: 'card-XYZ',
      nodeId: 'svc-b',
    });
    expect(mocks.dispatchSpy).toHaveBeenCalledTimes(2);
  });

  it('hides the expanded panel for events whose id != expandedId', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const tree = renderList([makeEvent({ id: 'ev-A', error: 'errA' }), makeEvent({ id: 'ev-B', error: 'errB' })]);
    const text = collectText(tree);
    // Only A's expanded panel is rendered → A's error appears, B's does not.
    expect(text).toContain('errA');
    expect(text).not.toContain('errB');
  });

  it('omits duration row when duration_seconds is null', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const tree = renderList([makeEvent({ id: 'ev-A', duration_seconds: null })]);
    // No duration text in expanded panel → none of the s/m suffixes appear.
    const expandedDurationDivs = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-slate-500') &&
        (el.props as { className: string }).className.includes('pt-0.5'),
    );
    expect(expandedDurationDivs).toHaveLength(0);
  });

  it('does not call dispatch on initial render (mount-side effect free)', () => {
    renderList([makeEvent()]);
    expect(mocks.dispatchSpy).not.toHaveBeenCalled();
  });

  it('omits duration_ms suffix on log entries when duration_ms is null', () => {
    mocks.expandedIdRef.current = 'ev-A';
    const tree = renderList([
      makeEvent({
        id: 'ev-A',
        deployment_logs: [
          { step: 'test', status: 'started', message: 'no-duration', timestamp: '2025-01-01T00:00:00Z' },
        ],
      }),
    ]);
    const text = collectText(tree);
    expect(text).toContain('no-duration');
    // No '.0s' string from a duration formatter.
    expect(text).not.toMatch(/\d+\.\ds/);
  });
});
