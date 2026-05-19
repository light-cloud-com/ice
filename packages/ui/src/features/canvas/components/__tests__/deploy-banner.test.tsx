/**
 * rf-canv-17 — `CanvasDeployBanner` subcomponent.
 *
 * The component owns its own deploy-slice selectors (`status`,
 * `currentDeployCardId`, `nodesById`) plus three derivations:
 *  1. `deriveRollup(nodesById)` — terminal/total counts.
 *  2. `bannerActiveNode` — most-recently-updated `applying` node by `last_at`.
 *  3. `bannerPct` — capped at 99% unless `terminal === total` (then 100%).
 *
 * We use the direct-FC tree-walker pattern with two layers of mocking:
 *
 *  - `react-redux.useSelector` is stubbed to invoke the selector against a
 *    controllable per-test `mockState` shape (`{ deploy: { status, currentDeployCardId, nodesById } }`).
 *    This avoids spinning up a real store while still exercising the
 *    component's exact selector wiring. Cite the rf-props-19/21 hooks-mock
 *    pattern (`use-state-mock-with-mutable-ref-unlocks-direct-fc-toggle-state-tests`,
 *    `use-memo-must-be-mocked-too-when-the-extracted-component-uses-it`).
 *  - `react.useMemo` is stubbed to invoke the factory eagerly each render
 *    (memoization is irrelevant for synchronous test assertions). The
 *    rollup + active-node memos depend on `nodesById`, which we control
 *    per-test via `mockState`.
 *
 * Behavior pins this brief calls out:
 *  - `showDeployBanner` gate (cardId truthy, deployingCardId === cardId,
 *    status ∈ {planning, deploying, destroying}).
 *  - The terminal-of-total count line ONLY when status !== planning AND
 *    total > 0.
 *  - The progress bar ONLY when status ∈ {deploying, destroying}.
 *  - `bannerPct` clamped to 99 when terminal < total but rounding would hit 100.
 *  - `bannerPct` exactly 100 when terminal === total.
 *  - Most-recently-updated applying node wins (ISO `last_at` lex sort).
 *  - The `<style>` keyframes block renders when the banner renders.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { NodeDeployState } from '../../../../store/slices/deploy-slice';

// ─── Mocks ───────────────────────────────────────────────────────────────────
// Hoisted so the vi.mock factories close over a stable identity. Cite
// `vi-hoisted-required-for-shared-mock-identities-across-many-vi-mock-calls`.
const mocks = vi.hoisted(() => ({
  // Per-test overrides; the helper `setState` tweaks these.
  state: {
    deploy: {
      status: 'idle' as
        | 'idle'
        | 'authenticating'
        | 'planning'
        | 'planned'
        | 'deploying'
        | 'destroying'
        | 'success'
        | 'error'
        | 'cancelled',
      currentDeployCardId: null as string | null,
      nodesById: {} as Record<string, unknown>,
    },
  },
}));

// `useSelector` invokes the selector against `mocks.state` so each
// `useSelector((s: RootState) => s.deploy.status)` call resolves the
// component's own projection. The shallowEqual second arg is a no-op for
// the test — we don't compare references, we just route to mocks.state.
vi.mock('react-redux', () => ({
  useSelector: vi.fn((selector: (s: unknown) => unknown) => selector(mocks.state)),
  shallowEqual: (a: unknown, b: unknown) => a === b,
}));

// useMemo runs the factory eagerly — memoization is moot for assertions.
// Cite `use-memo-must-be-mocked-too-when-the-extracted-component-uses-it`.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useMemo: vi.fn((factory: () => unknown, _deps: unknown[]) => factory()),
  };
});

// Import AFTER vi.mock so the mocked modules are bound.
import { CanvasDeployBanner } from '../deploy-banner';

// ─── Tree-walker ────────────────────────────────────────────────────────────
// Same shape as rf-canv-10/11/12/13/14/15/16 tests.

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

/** Collect every literal text leaf rendered by the tree. */
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
  return parts.join('');
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const makeNode = (overrides: Partial<NodeDeployState> = {}): NodeDeployState => ({
  node_id: 'n-1',
  status: 'queued',
  resource_name: 'service',
  resource_type: 'compute',
  action: 'create',
  last_at: '2026-04-29T00:00:00Z',
  last_seq: 1,
  ...overrides,
});

const setState = (patch: Partial<typeof mocks.state.deploy>): void => {
  Object.assign(mocks.state.deploy, patch);
};

const render = (cardId: string | undefined): React.ReactElement | null =>
  CanvasDeployBanner({ cardId }) as React.ReactElement | null;

// ═══════════════════════════════════════════════════════════════════════════
// 1. showDeployBanner gate
// ═══════════════════════════════════════════════════════════════════════════

describe('CanvasDeployBanner — render gate', () => {
  beforeEach(() => {
    setState({ status: 'idle', currentDeployCardId: null, nodesById: {} });
  });

  it('renders nothing when status is idle (banner gated off)', () => {
    setState({ status: 'idle', currentDeployCardId: 'card-1' });
    expect(render('card-1')).toBeNull();
  });

  it('renders nothing when cardId is undefined (no active card)', () => {
    setState({ status: 'deploying', currentDeployCardId: 'card-1' });
    expect(render(undefined)).toBeNull();
  });

  it('renders nothing when deployingCardId does not match cardId', () => {
    setState({ status: 'deploying', currentDeployCardId: 'card-OTHER' });
    expect(render('card-1')).toBeNull();
  });

  it('renders nothing when status is success / error / planned / cancelled / authenticating', () => {
    for (const status of [
      'success',
      'error',
      'planned',
      'cancelled',
      'authenticating',
    ] as const) {
      setState({ status, currentDeployCardId: 'card-1' });
      expect(render('card-1')).toBeNull();
    }
  });

  it('renders the banner when (cardId truthy) && (deployingCardId === cardId) && (status ∈ planning/deploying/destroying)', () => {
    for (const status of ['planning', 'deploying', 'destroying'] as const) {
      setState({ status, currentDeployCardId: 'card-1' });
      const tree = render('card-1');
      expect(tree).not.toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Status text dispatch
// ═══════════════════════════════════════════════════════════════════════════

describe('CanvasDeployBanner — status text', () => {
  beforeEach(() => {
    setState({ status: 'idle', currentDeployCardId: 'card-1', nodesById: {} });
  });

  it('renders "Planning deployment…" for status=planning, NO terminal/total count, NO progress bar', () => {
    setState({
      status: 'planning',
      currentDeployCardId: 'card-1',
      // total > 0 to prove the count line still hides for planning
      nodesById: {
        a: makeNode({ status: 'succeeded', node_id: 'a' }),
        b: makeNode({ status: 'queued', node_id: 'b' }),
      },
    });
    const tree = render('card-1');
    const text = collectText(tree);
    expect(text).toContain('Planning deployment…');
    expect(text).not.toContain('of 2');
    // Progress bar is wrapped in a positioned <div>; the only `bottom: 0`
    // div is the bar wrapper. Walk the tree and assert it's absent.
    const positioned = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        (el.props as { style?: { bottom?: number } }).style?.bottom === 0,
    );
    expect(positioned).toHaveLength(0);
  });

  it('renders "Deploying…" with NO count line when total === 0', () => {
    setState({ status: 'deploying', currentDeployCardId: 'card-1', nodesById: {} });
    const tree = render('card-1');
    const text = collectText(tree);
    expect(text).toContain('Deploying…');
    expect(text).not.toContain(' of ');
  });

  it('renders "Deploying…" + "3 of 5" when total>0 and 3 terminal nodes', () => {
    setState({
      status: 'deploying',
      currentDeployCardId: 'card-1',
      nodesById: {
        a: makeNode({ status: 'succeeded', node_id: 'a' }),
        b: makeNode({ status: 'succeeded', node_id: 'b' }),
        c: makeNode({ status: 'failed', node_id: 'c' }),
        d: makeNode({ status: 'applying', node_id: 'd' }),
        e: makeNode({ status: 'queued', node_id: 'e' }),
      },
    });
    const tree = render('card-1');
    const text = collectText(tree);
    expect(text).toContain('Deploying…');
    expect(text).toContain('3 of 5');
  });

  it('renders "Destroying…" + count + progress bar', () => {
    setState({
      status: 'destroying',
      currentDeployCardId: 'card-1',
      nodesById: {
        a: makeNode({ status: 'succeeded', node_id: 'a' }),
        b: makeNode({ status: 'queued', node_id: 'b' }),
      },
    });
    const tree = render('card-1');
    const text = collectText(tree);
    expect(text).toContain('Destroying…');
    expect(text).toContain('1 of 2');
    const positioned = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        (el.props as { style?: { bottom?: number } }).style?.bottom === 0,
    );
    expect(positioned).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Active-node line (resource_name fallback to node_id, with/without step)
// ═══════════════════════════════════════════════════════════════════════════

describe('CanvasDeployBanner — active node line', () => {
  beforeEach(() => {
    setState({ status: 'deploying', currentDeployCardId: 'card-1', nodesById: {} });
  });

  it('renders only resource_name when bannerActiveNode has no step', () => {
    setState({
      nodesById: {
        a: makeNode({
          node_id: 'a',
          status: 'applying',
          resource_name: 'my-svc',
          last_at: '2026-04-29T00:00:00Z',
        }),
      },
    });
    const tree = render('card-1');
    const text = collectText(tree);
    expect(text).toContain('my-svc');
    expect(text).not.toContain(' · ');
  });

  it('renders "resource_name · step.label (i/N)" when bannerActiveNode.step is present', () => {
    setState({
      nodesById: {
        a: makeNode({
          node_id: 'a',
          status: 'applying',
          resource_name: 'my-svc',
          step: { label: 'Provisioning', index: 2, total: 5 },
          last_at: '2026-04-29T00:00:00Z',
        }),
      },
    });
    const tree = render('card-1');
    const text = collectText(tree);
    expect(text).toContain('my-svc · Provisioning (2/5)');
  });

  it('falls back to node_id when resource_name is empty', () => {
    setState({
      nodesById: {
        n: makeNode({
          node_id: 'fallback-id',
          status: 'applying',
          resource_name: '',
          last_at: '2026-04-29T00:00:00Z',
        }),
      },
    });
    const tree = render('card-1');
    const text = collectText(tree);
    expect(text).toContain('fallback-id');
  });

  it('does NOT render the active-node line when no node is applying', () => {
    setState({
      nodesById: {
        a: makeNode({ node_id: 'a', status: 'queued', resource_name: 'idle-1' }),
        b: makeNode({ node_id: 'b', status: 'succeeded', resource_name: 'done-1' }),
      },
    });
    const tree = render('card-1');
    const text = collectText(tree);
    expect(text).not.toContain('idle-1');
    expect(text).not.toContain('done-1');
  });

  it('picks the most-recently-updated applying node (latest last_at wins)', () => {
    setState({
      nodesById: {
        older: makeNode({
          node_id: 'older',
          status: 'applying',
          resource_name: 'older-svc',
          last_at: '2026-04-29T00:00:00Z',
        }),
        newer: makeNode({
          node_id: 'newer',
          status: 'applying',
          resource_name: 'newer-svc',
          last_at: '2026-04-29T00:05:00Z',
        }),
        even_older: makeNode({
          node_id: 'even-older',
          status: 'applying',
          resource_name: 'even-older-svc',
          last_at: '2026-04-28T23:00:00Z',
        }),
      },
    });
    const tree = render('card-1');
    const text = collectText(tree);
    expect(text).toContain('newer-svc');
    expect(text).not.toContain('older-svc');
    expect(text).not.toContain('even-older-svc');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. bannerPct — clamp at 99 unless terminal === total (then 100)
// ═══════════════════════════════════════════════════════════════════════════

describe('CanvasDeployBanner — bannerPct progress bar width', () => {
  beforeEach(() => {
    setState({ status: 'deploying', currentDeployCardId: 'card-1' });
  });

  /** Pull the inner bar's `width: <pct>%` style. */
  const widthOf = (tree: React.ReactNode): string | undefined => {
    // The inner bar is a child of the bar wrapper (`bottom: 0` div).
    const wrapper = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        (el.props as { style?: { bottom?: number } }).style?.bottom === 0,
    )[0];
    if (!wrapper) return undefined;
    const inner = (wrapper.props as { children?: React.ReactNode }).children;
    if (!inner || typeof inner !== 'object') return undefined;
    const innerEl = inner as React.ReactElement;
    return (innerEl.props as { style?: { width?: string } }).style?.width;
  };

  it('renders 0% when total === 0', () => {
    setState({ nodesById: {} });
    const tree = render('card-1');
    expect(widthOf(tree)).toBe('0%');
  });

  it('renders 100% when terminal === total (all done)', () => {
    setState({
      nodesById: {
        a: makeNode({ node_id: 'a', status: 'succeeded' }),
        b: makeNode({ node_id: 'b', status: 'succeeded' }),
      },
    });
    const tree = render('card-1');
    expect(widthOf(tree)).toBe('100%');
  });

  it('clamps at 99% when rounding would otherwise hit 100% but terminal < total (e.g. 199/200)', () => {
    const nodesById: Record<string, NodeDeployState> = {};
    for (let i = 0; i < 199; i++) {
      nodesById[`s${i}`] = makeNode({ node_id: `s${i}`, status: 'succeeded' });
    }
    nodesById.q = makeNode({ node_id: 'q', status: 'queued' });
    setState({ nodesById });
    // 199/200 = 0.995 → Math.round(99.5) = 100, clamp to 99.
    const tree = render('card-1');
    expect(widthOf(tree)).toBe('99%');
  });

  it('renders 60% for 3 terminal of 5 total (mid-deploy)', () => {
    setState({
      nodesById: {
        a: makeNode({ node_id: 'a', status: 'succeeded' }),
        b: makeNode({ node_id: 'b', status: 'succeeded' }),
        c: makeNode({ node_id: 'c', status: 'failed' }),
        d: makeNode({ node_id: 'd', status: 'applying' }),
        e: makeNode({ node_id: 'e', status: 'queued' }),
      },
    });
    const tree = render('card-1');
    expect(widthOf(tree)).toBe('60%');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. <style> keyframes block
// ═══════════════════════════════════════════════════════════════════════════

describe('CanvasDeployBanner — keyframes <style>', () => {
  beforeEach(() => {
    setState({ status: 'deploying', currentDeployCardId: 'card-1', nodesById: {} });
  });

  it('renders the @keyframes iceDeployPulse block when the banner renders', () => {
    const tree = render('card-1');
    const styles = findByType(tree, 'style');
    expect(styles).toHaveLength(1);
    const styleChildren = (styles[0].props as { children?: string }).children ?? '';
    expect(styleChildren).toContain('@keyframes iceDeployPulse');
    expect(styleChildren).toContain('opacity: 1');
    expect(styleChildren).toContain('transform: scale(1)');
    expect(styleChildren).toContain('opacity: 0.5');
    expect(styleChildren).toContain('transform: scale(0.85)');
  });

  it('does not emit the <style> block when the banner is gated off', () => {
    setState({ status: 'idle' });
    const tree = render('card-1');
    expect(tree).toBeNull();
  });
});
