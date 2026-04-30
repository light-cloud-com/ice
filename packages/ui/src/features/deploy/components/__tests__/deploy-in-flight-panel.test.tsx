/**
 * rf-pdpl-14 — DeployInFlightPanel.
 *
 * First Layer 2 composing component. Like DeployNodeRow (rf-pdpl-13) it is
 * wrapped in `React.memo`, so the runtime export is the memo *object*
 * `{ $$typeof: Symbol(react.memo), type: <Inner FC>, compare }` — not a
 * callable function. The direct-FC tree-walker pattern requires reaching
 * for `(DeployInFlightPanel as { type: Fn }).type(props)` to invoke the
 * inner render. (Cite `react-memo-wrapper-must-be-unwrapped-via-dot-type-for-direct-fc-tree-walker`.)
 *
 * Mocks:
 *   - `useTranslation` → `t = (key) => key` so we can assert on the i18n key.
 *   - `useMemo` (passthrough) — the source uses `useMemo(() => deriveRollup(...), [...])`
 *     and `useMemo(() => orderNodesForPanel(...), [...])`. Under the
 *     direct-FC tree-walker pattern, hooks are called outside React's render
 *     loop, so we override `useMemo` to invoke the fn synchronously.
 *     Both `react.useMemo` and `react.default.useMemo` need patching since
 *     the source imports it as `import React, { useMemo } from 'react'` —
 *     `useMemo` is a named binding, but `React.useMemo` is also reachable
 *     through the default import (cite
 *     `react-namespace-hook-access-requires-patching-default-export-too`).
 *   - `deriveRollup` and `orderNodesForPanel` → simple stubs from the slice
 *     module so the tests drive rollup totals/terminals/applying/succeeded/
 *     failed and the ordered list independently of the real implementations.
 *   - `DeployNodeRow` → identity stub component so the assertion surface
 *     stays on this component (the row's own rendering is covered by
 *     rf-pdpl-13's test file).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Hoisted mocks — keep identities stable across the file (cite
// `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`).
const mocks = vi.hoisted(() => {
  const deriveRollup = vi.fn();
  const orderNodesForPanel = vi.fn();
  const t = vi.fn((key: string) => key);
  // Stub component for DeployNodeRow — receives `node` prop and returns a
  // tagged element so the test can identify it in the rendered tree.
  const DeployNodeRowStub = vi.fn((props: { node: unknown }) =>
    // Use a function component identity that the walker can find by reference.
    React.createElement('li', { 'data-stub-row': true, 'data-node': props.node }),
  );
  return { deriveRollup, orderNodesForPanel, t, DeployNodeRowStub };
});

// Override useMemo so the lambda runs synchronously outside React's render loop.
// Patch BOTH the named export AND the default-export property — the source
// uses `import React, { useMemo } from 'react'`.
vi.mock('react', async (orig) => {
  const r = (await orig()) as typeof import('react');
  const passthrough = (fn: () => unknown) => fn();
  return {
    ...r,
    useMemo: passthrough,
    default: { ...(r as unknown as { default: object }).default, useMemo: passthrough },
  };
});

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

vi.mock('../../../../store/slices/deploy-slice', () => ({
  deriveRollup: mocks.deriveRollup,
  orderNodesForPanel: mocks.orderNodesForPanel,
}));

vi.mock('../deploy-node-row', () => ({
  DeployNodeRow: mocks.DeployNodeRowStub,
}));

import { DeployInFlightPanel } from '../deploy-in-flight-panel';
import type { DeployRollup, DeployStatus, NodeDeployState } from '../../../../store/slices/deploy-slice';

// ─── Tree-walker (rf-pdpl-7..13 style) ──────────────────────────────────────

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
  if (typeof el.type === 'function') {
    try {
      const FC = el.type as (props: unknown) => React.ReactNode;
      const rendered = FC(el.props);
      yield* walk(rendered as ReactNodeLike);
    } catch {
      // Opaque FC — skip its subtree.
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
  const parts: string[] = [];
  function visit(n: ReactNodeLike): void {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string') {
      parts.push(n);
      return;
    }
    if (typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    const el = n as React.ReactElement;
    if (typeof el.type === 'function') {
      try {
        const FC = el.type as (props: unknown) => React.ReactNode;
        visit(FC(el.props) as ReactNodeLike);
      } catch {
        // Opaque FC.
      }
      return;
    }
    const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
    if (children != null) visit(children);
  }
  visit(tree);
  return parts.join('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// `React.memo(Inner)` returns `{ $$typeof: Symbol(react.memo), type: Inner, compare }`.
// To invoke the inner render under the tree-walker, reach for `.type`.
const renderPanel = (
  nodesById: Record<string, NodeDeployState>,
  status: DeployStatus,
): React.ReactElement => {
  const Inner = (DeployInFlightPanel as unknown as {
    type: (props: {
      nodesById: Record<string, NodeDeployState>;
      status: DeployStatus;
    }) => React.ReactElement;
  }).type;
  return Inner({ nodesById, status });
};

const baseRollup = (overrides: Partial<DeployRollup> = {}): DeployRollup => ({
  queued: 0,
  applying: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  cancelled: 0,
  total: 0,
  terminal: 0,
  ...overrides,
});

const baseNode = (overrides: Partial<NodeDeployState> = {}): NodeDeployState => ({
  node_id: 'canvas-1',
  status: 'applying',
  resource_name: 'my-bucket',
  resource_type: 'storage.googleapis.com/Bucket',
  action: 'create',
  last_at: '2026-04-30T00:00:00.000Z',
  last_seq: 1,
  ...overrides,
});

const setRollup = (rollup: DeployRollup): void => {
  mocks.deriveRollup.mockReset();
  mocks.deriveRollup.mockReturnValue(rollup);
};

const setOrdered = (ordered: NodeDeployState[]): void => {
  mocks.orderNodesForPanel.mockReset();
  mocks.orderNodesForPanel.mockReturnValue(ordered);
};

// Shared helper: find the outer container div with the E2E id.
const findOuter = (tree: React.ReactNode): React.ReactElement => {
  const outers = findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const id = (el.props as { id?: string }).id;
    return id === 'ice-deploy-progress';
  });
  expect(outers).toHaveLength(1);
  return outers[0];
};

// Shared helper: find the inner progress-bar fill div (the one with width style).
const findProgressFill = (tree: React.ReactNode): React.ReactElement => {
  const divs = findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const style = (el.props as { style?: { width?: string } }).style;
    return style != null && typeof style.width === 'string';
  });
  expect(divs).toHaveLength(1);
  return divs[0];
};

// Shared helper: find the <ul> list (only present when non-empty).
const findList = (tree: React.ReactNode): React.ReactElement | null => {
  const uls = findByPredicate(tree, (el) => el.type === 'ul');
  return uls.length > 0 ? uls[0] : null;
};

// Shared helper: find the right-side count span (font-mono tabular-nums).
const findCountSpan = (tree: React.ReactNode): React.ReactElement => {
  const spans = findByPredicate(tree, (el) => {
    if (el.type !== 'span') return false;
    const className = (el.props as { className?: string }).className;
    return typeof className === 'string' && className.includes('font-mono') && className.includes('tabular-nums');
  });
  expect(spans).toHaveLength(1);
  return spans[0];
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DeployInFlightPanel — outer container', () => {
  it('pins the E2E id "ice-deploy-progress" on the outer div', () => {
    setRollup(baseRollup());
    setOrdered([]);
    const tree = renderPanel({}, 'deploying');
    const outer = findOuter(tree);
    expect((outer.props as { id: string }).id).toBe('ice-deploy-progress');
  });

  it('outer div carries space-y-3 spacing class', () => {
    setRollup(baseRollup());
    setOrdered([]);
    const tree = renderPanel({}, 'deploying');
    const outer = findOuter(tree);
    expect((outer.props as { className: string }).className).toContain('space-y-3');
  });
});

describe('DeployInFlightPanel — empty rollup sentinel', () => {
  it('renders the deploying i18n key when status="deploying" and rollup is empty', () => {
    setRollup(baseRollup({ total: 0 }));
    setOrdered([]);
    const tree = renderPanel({}, 'deploying');
    expect(collectText(tree)).toContain('deploy.progress.deploying');
    expect(mocks.t).toHaveBeenCalledWith('deploy.progress.deploying');
  });

  it('renders the literal "Preparing destroy…" when status="destroying" and rollup is empty', () => {
    setRollup(baseRollup({ total: 0 }));
    setOrdered([]);
    const tree = renderPanel({}, 'destroying');
    expect(collectText(tree)).toContain('Preparing destroy…');
    // Must NOT route through the i18n function — pinned as a hardcoded literal.
    expect(mocks.t).not.toHaveBeenCalledWith('Preparing destroy…');
  });

  it('does NOT render the <ul> list when rollup is empty', () => {
    setRollup(baseRollup({ total: 0 }));
    setOrdered([]);
    const tree = renderPanel({}, 'deploying');
    expect(findList(tree)).toBeNull();
  });

  it('right-side count span is empty string when rollup is empty', () => {
    setRollup(baseRollup({ total: 0 }));
    setOrdered([]);
    const tree = renderPanel({}, 'deploying');
    const count = findCountSpan(tree);
    expect(collectText(count)).toBe('');
  });

  it('progress bar width is "0%" when rollup is empty', () => {
    setRollup(baseRollup({ total: 0 }));
    setOrdered([]);
    const tree = renderPanel({}, 'deploying');
    const fill = findProgressFill(tree);
    expect((fill.props as { style: { width: string } }).style.width).toBe('0%');
  });
});

describe('DeployInFlightPanel — non-empty rollup header counts', () => {
  it('renders applying/succeeded counts when failed === 0 (no failed segment)', () => {
    setRollup(baseRollup({ applying: 3, succeeded: 5, failed: 0, total: 10, terminal: 5 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const text = collectText(tree);
    expect(text).toContain('3');
    expect(text).toContain('in flight');
    expect(text).toContain('5');
    expect(text).toContain('done');
    // "failed" word must NOT be present when failed === 0.
    expect(text).not.toContain('failed');
  });

  it('renders applying/succeeded/failed counts when failed > 0', () => {
    setRollup(baseRollup({ applying: 3, succeeded: 5, failed: 2, total: 12, terminal: 7 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const text = collectText(tree);
    expect(text).toContain('3');
    expect(text).toContain('in flight');
    expect(text).toContain('5');
    expect(text).toContain('done');
    expect(text).toContain('2');
    expect(text).toContain('failed');
  });

  it('renders the U+00B7 middle-dot " · " separators between counts', () => {
    setRollup(baseRollup({ applying: 3, succeeded: 5, failed: 2, total: 12, terminal: 7 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const text = collectText(tree);
    // Two middle-dot separators when failed > 0 (between in-flight/done and done/failed).
    expect((text.match(/ · /g) ?? [])).toHaveLength(2);
  });

  it('renders a single middle-dot " · " when failed === 0 (only in-flight/done separator)', () => {
    setRollup(baseRollup({ applying: 3, succeeded: 5, failed: 0, total: 8, terminal: 5 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const text = collectText(tree);
    expect((text.match(/ · /g) ?? [])).toHaveLength(1);
  });

  it('counts use blue/emerald/red color classes', () => {
    setRollup(baseRollup({ applying: 3, succeeded: 5, failed: 2, total: 12, terminal: 7 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const blueSpans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const className = (el.props as { className?: string }).className;
      return typeof className === 'string' && className.includes('text-blue-600');
    });
    expect(blueSpans).toHaveLength(1);
    expect(collectText(blueSpans[0])).toBe('3');

    const emeraldSpans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const className = (el.props as { className?: string }).className;
      return typeof className === 'string' && className.includes('text-emerald-600');
    });
    expect(emeraldSpans).toHaveLength(1);
    expect(collectText(emeraldSpans[0])).toBe('5');

    const redSpans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const className = (el.props as { className?: string }).className;
      return typeof className === 'string' && className.includes('text-red-600');
    });
    expect(redSpans).toHaveLength(1);
    expect(collectText(redSpans[0])).toBe('2');
  });

  it('right-side count span shows "{terminal} of {total}" when non-empty', () => {
    setRollup(baseRollup({ applying: 3, succeeded: 5, failed: 0, total: 10, terminal: 5 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const count = findCountSpan(tree);
    expect(collectText(count)).toBe('5 of 10');
  });
});

describe('DeployInFlightPanel — progress bar percentage', () => {
  it('100% when terminal === total (all-terminal)', () => {
    setRollup(baseRollup({ applying: 0, succeeded: 10, failed: 0, total: 10, terminal: 10 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const fill = findProgressFill(tree);
    expect((fill.props as { style: { width: string } }).style.width).toBe('100%');
  });

  it('Math.round-rounded percentage for partial progress: 3 of 4 → 75%', () => {
    setRollup(baseRollup({ applying: 1, succeeded: 3, failed: 0, total: 4, terminal: 3 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const fill = findProgressFill(tree);
    expect((fill.props as { style: { width: string } }).style.width).toBe('75%');
  });

  it('Math.round-rounded percentage for partial progress: 9 of 10 → 90%', () => {
    setRollup(baseRollup({ applying: 1, succeeded: 9, failed: 0, total: 10, terminal: 9 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const fill = findProgressFill(tree);
    expect((fill.props as { style: { width: string } }).style.width).toBe('90%');
  });

  it('caps at 99% even when raw percent rounds to 99 (terminal=99, total=100)', () => {
    setRollup(baseRollup({ applying: 1, succeeded: 99, failed: 0, total: 100, terminal: 99 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const fill = findProgressFill(tree);
    expect((fill.props as { style: { width: string } }).style.width).toBe('99%');
  });

  it('caps at 99% when raw percent rounds higher (terminal=999, total=1000 → 99.9 → cap)', () => {
    // Math.round(99.9) = 100, but terminal !== total so the cap branch runs.
    setRollup(baseRollup({ applying: 1, succeeded: 999, failed: 0, total: 1000, terminal: 999 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const fill = findProgressFill(tree);
    expect((fill.props as { style: { width: string } }).style.width).toBe('99%');
  });

  it('100% allowed only when terminal === total (terminal=100/total=100 → 100%)', () => {
    setRollup(baseRollup({ applying: 0, succeeded: 100, failed: 0, total: 100, terminal: 100 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const fill = findProgressFill(tree);
    expect((fill.props as { style: { width: string } }).style.width).toBe('100%');
  });

  it('0% when total=0 (empty branch — no division-by-zero)', () => {
    setRollup(baseRollup({ total: 0, terminal: 0 }));
    setOrdered([]);
    const tree = renderPanel({}, 'deploying');
    const fill = findProgressFill(tree);
    expect((fill.props as { style: { width: string } }).style.width).toBe('0%');
  });
});

describe('DeployInFlightPanel — progress bar color', () => {
  it('uses bg-emerald-500 when failed === 0', () => {
    setRollup(baseRollup({ succeeded: 1, failed: 0, total: 1, terminal: 1 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const fill = findProgressFill(tree);
    const className = (fill.props as { className: string }).className;
    expect(className).toContain('bg-emerald-500');
    expect(className).not.toContain('bg-amber-500');
  });

  it('uses bg-amber-500 when failed > 0', () => {
    setRollup(baseRollup({ succeeded: 0, failed: 1, total: 1, terminal: 1 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const fill = findProgressFill(tree);
    const className = (fill.props as { className: string }).className;
    expect(className).toContain('bg-amber-500');
    expect(className).not.toContain('bg-emerald-500');
  });

  it('progress fill carries the rounded + transition-all classes', () => {
    setRollup(baseRollup({ succeeded: 1, failed: 0, total: 1, terminal: 1 }));
    setOrdered([]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const fill = findProgressFill(tree);
    const className = (fill.props as { className: string }).className;
    expect(className).toContain('rounded-full');
    expect(className).toContain('transition-all');
  });
});

describe('DeployInFlightPanel — node list rendering', () => {
  it('renders the <ul> when rollup is non-empty', () => {
    setRollup(baseRollup({ total: 1, terminal: 1, succeeded: 1 }));
    const node = baseNode({ node_id: 'canvas-99' });
    setOrdered([node]);
    const tree = renderPanel({ 'canvas-99': node }, 'deploying');
    const ul = findList(tree);
    expect(ul).not.toBeNull();
  });

  it('<ul> wrapper carries the divide-y/border/scrollable classes', () => {
    setRollup(baseRollup({ total: 1, terminal: 1, succeeded: 1 }));
    setOrdered([baseNode()]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const ul = findList(tree);
    expect(ul).not.toBeNull();
    const className = (ul!.props as { className: string }).className;
    expect(className).toContain('divide-y');
    expect(className).toContain('border');
    expect(className).toContain('max-h-72');
    expect(className).toContain('overflow-y-auto');
  });

  it('renders one DeployNodeRow per ordered node', () => {
    const a = baseNode({ node_id: 'a' });
    const b = baseNode({ node_id: 'b' });
    const c = baseNode({ node_id: 'c' });
    setRollup(baseRollup({ total: 3, terminal: 3, succeeded: 3 }));
    setOrdered([a, b, c]);
    const tree = renderPanel({ a, b, c }, 'deploying');
    // Walker invokes FCs as it descends; DeployNodeRowStub gets called once per row.
    const rowEls = findByPredicate(tree, (el) => el.type === mocks.DeployNodeRowStub);
    expect(rowEls).toHaveLength(3);
    expect((rowEls[0].props as { node: NodeDeployState }).node).toBe(a);
    expect((rowEls[1].props as { node: NodeDeployState }).node).toBe(b);
    expect((rowEls[2].props as { node: NodeDeployState }).node).toBe(c);
  });

  it('uses node.node_id as the key on each DeployNodeRow', () => {
    const a = baseNode({ node_id: 'first' });
    const b = baseNode({ node_id: 'second' });
    setRollup(baseRollup({ total: 2, terminal: 2, succeeded: 2 }));
    setOrdered([a, b]);
    const tree = renderPanel({ first: a, second: b }, 'deploying');
    // Each rendered DeployNodeRow element exposes its key on the React element.
    const rowEls = findByPredicate(tree, (el) => el.type === mocks.DeployNodeRowStub);
    expect(rowEls).toHaveLength(2);
    expect((rowEls[0] as { key: unknown }).key).toBe('first');
    expect((rowEls[1] as { key: unknown }).key).toBe('second');
  });

  it('passes nodesById to deriveRollup and orderNodesForPanel', () => {
    const a = baseNode({ node_id: 'a' });
    setRollup(baseRollup({ total: 1, terminal: 1, succeeded: 1 }));
    setOrdered([a]);
    const nodesById = { a };
    renderPanel(nodesById, 'deploying');
    expect(mocks.deriveRollup).toHaveBeenCalledWith(nodesById);
    expect(mocks.orderNodesForPanel).toHaveBeenCalledWith(nodesById);
  });
});

describe('DeployInFlightPanel — Loader2 spinner', () => {
  it('always renders the Loader2 spinner regardless of empty/non-empty', () => {
    setRollup(baseRollup());
    setOrdered([]);
    const tree = renderPanel({}, 'deploying');
    // Loader2 from lucide-react is a forwardRef object (not a plain function), so
    // we match on the className containing `animate-spin` rather than on el.type.
    const spinners = findByPredicate(tree, (el) => {
      const className = (el.props as { className?: string }).className;
      return typeof className === 'string' && className.includes('animate-spin');
    });
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Loader2 spinner even when rollup is non-empty', () => {
    setRollup(baseRollup({ total: 5, terminal: 2, applying: 3 }));
    setOrdered([baseNode()]);
    const tree = renderPanel({ a: baseNode() }, 'deploying');
    const spinners = findByPredicate(tree, (el) => {
      const className = (el.props as { className?: string }).className;
      return typeof className === 'string' && className.includes('animate-spin');
    });
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });
});

describe('DeployInFlightPanel — React.memo boundary', () => {
  it('is wrapped in React.memo (carries the memo $$typeof marker)', () => {
    const memoTypeof = (DeployInFlightPanel as unknown as { $$typeof: symbol }).$$typeof;
    expect(typeof memoTypeof).toBe('symbol');
    expect(String(memoTypeof)).toBe('Symbol(react.memo)');
  });

  it('exposes the inner FC under the .type property of the memo wrapper', () => {
    const inner = (DeployInFlightPanel as unknown as { type: unknown }).type;
    expect(typeof inner).toBe('function');
  });

  it('preserves the displayName "DeployInFlightPanel" on the memo wrapper', () => {
    expect((DeployInFlightPanel as unknown as { displayName: string }).displayName).toBe(
      'DeployInFlightPanel',
    );
  });
});
