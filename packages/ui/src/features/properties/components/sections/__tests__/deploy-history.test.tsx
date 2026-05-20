/**
 * rf-props-19 — deploy-history section tests.
 *
 * `DeployHistory` has THREE `useState` calls (`history`, `expanded`, `showAll`)
 * and a `useEffect` that fetches via `getApi().deploy.getDeployments(cardId)`.
 * We use the direct-FC tree-walker pattern (cite
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`,
 * `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`,
 * `use-state-mock-with-mutable-ref-unlocks-direct-fc-toggle-state-tests`,
 * `dynamic-import-of-api-adapter-needs-a-direct-vi-mock-on-the-target-module`):
 * invoke the component as a function with React's hooks mocked so the body
 * runs synchronously without a renderer context, then walk the returned tree.
 *
 * `useState` is mocked to deal-out `[ref.current, setSpy]` from a queued list
 * of refs (one per call) — `historyRef`, `expandedRef`, `showAllRef` — so the
 * three useState slots stay distinct. Setters are independent spies so per-row
 * toggles and the show-all click each have a verifiable callback target.
 *
 * `useEffect` is mocked to invoke its callback synchronously on render, so the
 * mount-side fetch fires inside `DeployHistory(props)`. Because the fetch is
 * `await getApi().deploy.getDeployments(cardId)` we resolve with controlled
 * values per test and assert on the post-resolve `setHistory(...)` argument
 * via `historySetterSpy`.
 *
 * Mocks:
 *  - `react.useState` / `react.useEffect` → controlled.
 *  - `'../../fields'.Section` → vi.fn the walker matches by reference.
 *  - `'../../../../../shared/api/api-adapter'.getApi` → returns a
 *    `deploy.getDeployments` spy with per-test resolution.
 *  - `'../../../utils/deploy-history-format'.formatDeployRow` → returns a
 *    deterministic record so dot-color / label / summary slots are predictable.
 *  - `'../../../../../i18n'.t` → echoes `t:<key>`.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted stubs — vi.mock factories run before module-level statements, so
// shared identities have to live in vi.hoisted (same convention as rf-props-17).
const mocks = vi.hoisted(() => ({
  MockSection: vi.fn(),
  // Three useState slots, in declaration order: history / expanded / showAll.
  historyRef: { current: [] as Array<Record<string, unknown>> },
  expandedRef: { current: new Set<string>() },
  showAllRef: { current: false },
  historySetterSpy: vi.fn(),
  expandedSetterSpy: vi.fn(),
  showAllSetterSpy: vi.fn(),
  // useEffect deps captured — one or many tests can introspect what cardId was
  // listed in the dep array.
  effectCallbacks: [] as Array<() => void | Promise<void>>,
  effectDeps: [] as unknown[][],
  getDeploymentsSpy: vi.fn(),
  formatDeployRowSpy: vi.fn(),
}));

// Mock React's useState / useEffect so the FC body runs synchronously and the
// three useState calls are dealt back in order from the ref queue.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  // useState call counter — reset per-render via `resetUseStateQueue()`.
  let callIdx = 0;
  // Expose a reset hook on the actual React export so `renderList` can flip it.
  // Stash on the mocks object so beforeEach can flip and the closure can read.
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    callIdx = 0;
  };
  const dispatch = [
    () => [mocks.historyRef.current, mocks.historySetterSpy] as const,
    () => [mocks.expandedRef.current, mocks.expandedSetterSpy] as const,
    () => [mocks.showAllRef.current, mocks.showAllSetterSpy] as const,
  ];
  return {
    ...actual,
    useState: vi.fn(() => {
      const slot = dispatch[callIdx] ?? dispatch[dispatch.length - 1];
      callIdx += 1;
      return slot();
    }),
    useEffect: vi.fn((cb: () => void | Promise<void>, deps?: unknown[]) => {
      mocks.effectCallbacks.push(cb);
      mocks.effectDeps.push(deps ?? []);
      // Fire synchronously so the mount-side fetch dispatches its setHistory call.
      void cb();
    }),
  };
});

vi.mock('../../fields', () => ({
  Section: mocks.MockSection,
}));

vi.mock('../../../../../shared/api/api-adapter', () => ({
  getApi: () => ({
    deploy: {
      getDeployments: mocks.getDeploymentsSpy,
    },
  }),
}));

vi.mock('../../../utils/deploy-history-format', () => ({
  formatDeployRow: mocks.formatDeployRowSpy,
}));

vi.mock('../../../../../i18n', () => ({
  t: vi.fn((key: string) => `t:${key}`),
}));

import { DeployHistory } from '../deploy-history';

// ─── Tree-walker (same shape as rf-props-6/9/10/11/12/13/14/15/16/17/18) ─────

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

const baseFormatted = {
  time: 'Jan 1, 12:00 AM',
  duration: '2.5s',
  isSuccess: true,
  isFailed: false,
  isPartial: false,
  isPending: false,
  actionType: 'apply',
  actionLabel: 'Deploy',
  actionColor: 'text-blue-400 bg-blue-950/30',
  summaryText: '',
};

const makeDeploy = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'd-1',
  created_at: '2025-01-01T00:00:00Z',
  status: 'success',
  action_type: 'apply',
  duration_ms: 2500,
  provider: 'gcp',
  region: 'us-central1',
  ...overrides,
});

const renderHistory = (cardId = 'card-1'): React.ReactElement | null => {
  // Reset useState queue for this render.
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  mocks.MockSection.mockClear();
  mocks.historySetterSpy.mockClear();
  mocks.expandedSetterSpy.mockClear();
  mocks.showAllSetterSpy.mockClear();
  mocks.formatDeployRowSpy.mockClear();
  mocks.effectCallbacks.length = 0;
  mocks.effectDeps.length = 0;
  return DeployHistory({ cardId }) as React.ReactElement | null;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DeployHistory', () => {
  beforeEach(() => {
    mocks.historyRef.current = [];
    mocks.expandedRef.current = new Set();
    mocks.showAllRef.current = false;
    mocks.getDeploymentsSpy.mockReset();
    mocks.formatDeployRowSpy.mockReset();
    mocks.formatDeployRowSpy.mockImplementation(() => ({ ...baseFormatted }));
  });

  it('returns null (renders nothing) when history is empty', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    const tree = renderHistory();
    expect(tree).toBeNull();
  });

  it('mount fires getApi().deploy.getDeployments once with the cardId', async () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    renderHistory('card-XYZ');
    expect(mocks.getDeploymentsSpy).toHaveBeenCalledTimes(1);
    expect(mocks.getDeploymentsSpy).toHaveBeenCalledWith('card-XYZ');
  });

  it('the mount effect lists [cardId] as its dependency array', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    renderHistory('card-DEPS');
    expect(mocks.effectDeps).toHaveLength(1);
    expect(mocks.effectDeps[0]).toEqual(['card-DEPS']);
  });

  it('successful fetch resolving to [] still keeps history empty (early-return holds)', async () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    const tree = renderHistory();
    // Wait for the awaited setter dispatch to settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(tree).toBeNull();
    expect(mocks.historySetterSpy).toHaveBeenCalledTimes(1);
    expect(mocks.historySetterSpy).toHaveBeenCalledWith([]);
  });

  it('non-array fetch response defensively coerces to [] via Array.isArray fallback', async () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce({ not: 'an-array' });
    renderHistory();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.historySetterSpy).toHaveBeenCalledWith([]);
  });

  it('null fetch response also coerces to [] (defensive Array.isArray)', async () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce(null);
    renderHistory();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.historySetterSpy).toHaveBeenCalledWith([]);
  });

  it('rejected fetch is silently swallowed (no setHistory call, no throw)', async () => {
    mocks.getDeploymentsSpy.mockRejectedValueOnce(new Error('network'));
    expect(() => renderHistory()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.historySetterSpy).not.toHaveBeenCalled();
  });

  it('with 5 history rows + expanded set empty → all 5 rendered, none expanded', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = Array.from({ length: 5 }, (_, i) => makeDeploy({ id: `d-${i}` }));
    mocks.expandedRef.current = new Set();
    const tree = renderHistory();
    // 5 row containers (key=d-i) — find by the .text-ice-xs className on the outer div
    const rowContainers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className === 'text-ice-xs',
    );
    expect(rowContainers).toHaveLength(5);
    // No expanded panel divs should be present (the pl-4 pb-2 expanded-block class).
    const expandedPanels = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('pl-4 pb-2'),
    );
    expect(expandedPanels).toHaveLength(0);
  });

  it('clicking a row header toggles expansion (calls setExpanded with a Set updater)', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-A' }), makeDeploy({ id: 'd-B' })];
    mocks.expandedRef.current = new Set();
    const tree = renderHistory();
    const headers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('cursor-pointer hover:bg-ice-bg-2/50'),
    );
    expect(headers).toHaveLength(2);
    // Click the first row header.
    (headers[0].props as { onClick: () => void }).onClick();
    expect(mocks.expandedSetterSpy).toHaveBeenCalledTimes(1);
    // The setter is called with a function (Set updater). Run it on the current
    // expanded set and verify d-A was added.
    const updater = mocks.expandedSetterSpy.mock.calls[0][0] as (prev: Set<string>) => Set<string>;
    const result = updater(new Set());
    expect(result.has('d-A')).toBe(true);
    // Clicking it again on a set that already contains d-A should remove it
    // (the toggle branch: `if (next.has(id)) next.delete(id)`).
    const removed = updater(new Set(['d-A']));
    expect(removed.has('d-A')).toBe(false);
  });

  it('expanded row renders the expanded panel with summary, error, and resources', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [
      makeDeploy({
        id: 'd-EXP',
        error: 'permission denied',
        results: {
          resources: [
            { type: 'gcp_service', name: 'svc1', success: true },
            { type: 'gcp_db', name: 'db1', success: false },
          ],
        },
      }),
    ];
    mocks.expandedRef.current = new Set(['d-EXP']);
    mocks.formatDeployRowSpy.mockImplementationOnce(() => ({
      ...baseFormatted,
      summaryText: '2 created · 1 failed',
    }));
    const tree = renderHistory();
    const text = collectText(tree);
    expect(text).toContain('permission denied');
    expect(text).toContain('2 created · 1 failed');
    expect(text).toContain('svc1');
    expect(text).toContain('db1');
    // Footer line: provider · region · id-prefix (8 chars).
    expect(text).toContain('gcp');
    expect(text).toContain('us-central1');
    // d-EXP.slice(0,8) → 'd-EXP'
    expect(text).toContain('d-EXP');
  });

  it('with 20 history rows + showAll false → only first 15 rendered + Show all button', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = Array.from({ length: 20 }, (_, i) => makeDeploy({ id: `d-${i}` }));
    mocks.expandedRef.current = new Set();
    mocks.showAllRef.current = false;
    const tree = renderHistory();
    const rowContainers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className === 'text-ice-xs',
    );
    expect(rowContainers).toHaveLength(15);
    const buttons = findByType(tree, 'button');
    expect(buttons).toHaveLength(1);
    // collectText joins adjacent JSX children with a space — text 'Show all '
    // + expression {history.length} + text ' deploys' renders as
    // 'Show all  20  deploys' (cite
    // `collect-text-helper-joins-adjacent-jsx-children-with-a-separator`).
    const buttonText = collectText(buttons[0]);
    expect(buttonText).toContain('Show all');
    expect(buttonText).toContain('20');
    expect(buttonText).toContain('deploys');
  });

  it('clicking Show all flips showAll true (calls setShowAll(true))', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = Array.from({ length: 20 }, (_, i) => makeDeploy({ id: `d-${i}` }));
    mocks.showAllRef.current = false;
    const tree = renderHistory();
    const buttons = findByType(tree, 'button');
    expect(buttons).toHaveLength(1);
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(mocks.showAllSetterSpy).toHaveBeenCalledTimes(1);
    expect(mocks.showAllSetterSpy).toHaveBeenCalledWith(true);
  });

  it('with showAll=true and 20 rows → all 20 rendered, no Show all button', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = Array.from({ length: 20 }, (_, i) => makeDeploy({ id: `d-${i}` }));
    mocks.showAllRef.current = true;
    const tree = renderHistory();
    const rowContainers = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className === 'text-ice-xs',
    );
    expect(rowContainers).toHaveLength(20);
    expect(findByType(tree, 'button')).toHaveLength(0);
  });

  it('Show all button is hidden when history.length <= 15 (no overflow)', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = Array.from({ length: 15 }, (_, i) => makeDeploy({ id: `d-${i}` }));
    const tree = renderHistory();
    expect(findByType(tree, 'button')).toHaveLength(0);
  });

  it('each row reads formatDeployRow(d) — invoked once per visible row', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    const items = [makeDeploy({ id: 'd-A' }), makeDeploy({ id: 'd-B' }), makeDeploy({ id: 'd-C' })];
    mocks.historyRef.current = items;
    renderHistory();
    expect(mocks.formatDeployRowSpy).toHaveBeenCalledTimes(3);
    expect(mocks.formatDeployRowSpy).toHaveBeenNthCalledWith(1, items[0]);
    expect(mocks.formatDeployRowSpy).toHaveBeenNthCalledWith(2, items[1]);
    expect(mocks.formatDeployRowSpy).toHaveBeenNthCalledWith(3, items[2]);
  });

  it('isSuccess=true picks the emerald dot', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-S' })];
    mocks.formatDeployRowSpy.mockImplementationOnce(() => ({
      ...baseFormatted,
      isSuccess: true,
      isFailed: false,
      isPartial: false,
      isPending: false,
    }));
    const tree = renderHistory();
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-emerald-500') &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('isFailed=true (and isSuccess=false) picks the red dot', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-F' })];
    mocks.formatDeployRowSpy.mockImplementationOnce(() => ({
      ...baseFormatted,
      isSuccess: false,
      isFailed: true,
      isPartial: false,
      isPending: false,
    }));
    const tree = renderHistory();
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-red-500') &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('isPartial=true picks the amber dot', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-P' })];
    mocks.formatDeployRowSpy.mockImplementationOnce(() => ({
      ...baseFormatted,
      isSuccess: false,
      isFailed: false,
      isPartial: true,
      isPending: false,
    }));
    const tree = renderHistory();
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-amber-500') &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('isPending=true picks the blue animate-pulse dot', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-Q' })];
    mocks.formatDeployRowSpy.mockImplementationOnce(() => ({
      ...baseFormatted,
      isSuccess: false,
      isFailed: false,
      isPartial: false,
      isPending: true,
    }));
    const tree = renderHistory();
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-blue-500') &&
        (el.props as { className: string }).className.includes('animate-pulse'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('all four flags false → muted slate-500 fallback dot', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-X' })];
    mocks.formatDeployRowSpy.mockImplementationOnce(() => ({
      ...baseFormatted,
      isSuccess: false,
      isFailed: false,
      isPartial: false,
      isPending: false,
    }));
    const tree = renderHistory();
    const dots = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-slate-500') &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('row carries the action label + action color from formatDeployRow', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-Z' })];
    mocks.formatDeployRowSpy.mockImplementationOnce(() => ({
      ...baseFormatted,
      actionLabel: 'Destroy',
      actionColor: 'text-orange-400 bg-orange-950/30',
    }));
    const tree = renderHistory();
    const text = collectText(tree);
    expect(text).toContain('Destroy');
    const labelSpan = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-orange-400 bg-orange-950/30'),
    );
    expect(labelSpan.length).toBeGreaterThan(0);
  });

  it('row shows time + duration + (optional) environment from formatDeployRow / d.environment', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-W', environment: 'prod' })];
    mocks.formatDeployRowSpy.mockImplementationOnce(() => ({
      ...baseFormatted,
      time: 'Apr 1, 02:34 PM',
      duration: '5.5s',
    }));
    const tree = renderHistory();
    const text = collectText(tree);
    expect(text).toContain('Apr 1, 02:34 PM');
    expect(text).toContain('5.5s');
    expect(text).toContain('prod');
  });

  it('environment slot is omitted when d.environment is absent', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-NoEnv' })]; // no environment key
    const tree = renderHistory();
    // The environment span has class 'text-ice-2xs text-ice-text-3' AND would be a `<span>`
    // — but the duration also uses 'text-ice-text-3 font-mono', so disambiguate by
    // matching className === 'text-ice-2xs text-ice-text-3'.
    const envSpans = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className === 'text-ice-2xs text-ice-text-3',
    );
    expect(envSpans).toHaveLength(0);
  });

  it('summaryText shown collapsed (between header and missing expanded panel) when row collapsed', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-Sum' })];
    mocks.expandedRef.current = new Set(); // collapsed
    mocks.formatDeployRowSpy.mockImplementationOnce(() => ({
      ...baseFormatted,
      summaryText: '3 created · 1 deleted',
    }));
    const tree = renderHistory();
    const text = collectText(tree);
    expect(text).toContain('3 created · 1 deleted');
    // The collapsed-summary div has className 'pl-4 pb-1 text-ice-2xs text-ice-text-3'.
    const collapsedSummary = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('pl-4 pb-1'),
    );
    expect(collapsedSummary).toHaveLength(1);
  });

  it('expanded row hides the collapsed-summary div even when summaryText is present', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-E2' })];
    mocks.expandedRef.current = new Set(['d-E2']);
    mocks.formatDeployRowSpy.mockImplementationOnce(() => ({
      ...baseFormatted,
      summaryText: 'sum-text',
    }));
    const tree = renderHistory();
    const collapsedSummary = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('pl-4 pb-1'),
    );
    expect(collapsedSummary).toHaveLength(0);
    // Expanded panel still surfaces the summaryText (different class branch).
    const expandedPanels = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('pl-4 pb-2'),
    );
    expect(expandedPanels).toHaveLength(1);
    expect(collectText(expandedPanels[0])).toContain('sum-text');
  });

  it('expanded row omits the resources block when results.resources is missing or empty', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-NoRes' })]; // no results key
    mocks.expandedRef.current = new Set(['d-NoRes']);
    const tree = renderHistory();
    // The resource-row entries are font-mono divs with a w-1 dot; absence asserts
    // they don't appear.
    const resourceDots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('w-1 h-1 rounded-full shrink-0'),
    );
    expect(resourceDots).toHaveLength(0);
  });

  it('expanded row resource dot is emerald when resource success=true, red when false', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [
      makeDeploy({
        id: 'd-Res',
        results: {
          resources: [
            { type: 't1', name: 'n1', success: true },
            { type: 't2', name: 'n2', success: false },
          ],
        },
      }),
    ];
    mocks.expandedRef.current = new Set(['d-Res']);
    const tree = renderHistory();
    const greenDots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('w-1 h-1') &&
        (el.props as { className: string }).className.includes('bg-emerald-500'),
    );
    const redDots = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('w-1 h-1') &&
        (el.props as { className: string }).className.includes('bg-red-500'),
    );
    expect(greenDots).toHaveLength(1);
    expect(redDots).toHaveLength(1);
  });

  it('uses the Section wrapper with i18n title properties.deploy.history', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: 'd-Sec' })];
    const tree = renderHistory();
    const sections = findByPredicate(tree, (el) => el.type === mocks.MockSection);
    expect(sections).toHaveLength(1);
    expect((sections[0].props as { title: string }).title).toBe('t:properties.deploy.history');
  });

  it('row key falls back to index when d.id is falsy (no crash, still renders)', () => {
    mocks.getDeploymentsSpy.mockResolvedValueOnce([]);
    mocks.historyRef.current = [makeDeploy({ id: '', provider: 'gcp', region: 'us' })];
    // Set expanded-true with empty-string match so the footer-line `d.id.slice(0,8)`
    // is exercised; '' has slice → ''.
    mocks.expandedRef.current = new Set(['']);
    const tree = renderHistory();
    expect(tree).not.toBeNull();
    // The footer text is 'gcp · us · ' — last bit empty but no exception.
    expect(collectText(tree)).toContain('gcp');
  });
});
