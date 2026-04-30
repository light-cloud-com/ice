/**
 * rf-pdpl-7 — PlanPreview (co-locates ChangeRow).
 *
 * Second Layer 1 leaf-component extraction in rf-pdpl. Direct-FC tree-walker
 * (cite `tree-walker-must-invoke-file-private-fcs-when-extracted-component-keeps-an-inner-helper`):
 * `PlanPreview` composes the file-private `ChangeRow` FC, so the walker must
 * invoke any non-mocked function `el.type` it encounters and yield from the
 * resulting subtree. `lucide-react` icons are mocked to text-stub `<span>`
 * components — invoking them is fine, they render a leaf `<span>`.
 *
 * `useTranslation` is mocked so `t(key, opts)` returns
 *   `${key}:total=${opts.total}` when `opts?.total` is set, else `key`.
 * Label assertions become exact string matches.
 *
 * The `(s: any)` cast in the source's `skipped.map` is verbatim from the
 * pre-extraction body. The runtime entries carry `name`, `label`, and/or
 * `nodeId` — short-circuit `s.name || s.label || s.nodeId`. Tests pin all
 * three branches.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Mock lucide-react icons to text-stub spans. Hoisted so the mock identity
// stays stable across the test file (cite
// `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`). The
// stubs ARE invoked during the FC walk — they render a recognizable `<span>`
// so `expect(text).toContain('Plus')` style assertions can hit them too.
const mocks = vi.hoisted(() => ({
  Eye: vi.fn((_props: { className?: string }) =>
    React.createElement('span', { 'data-icon': 'Eye' }, 'Eye'),
  ),
  Plus: vi.fn((_props: { className?: string }) =>
    React.createElement('span', { 'data-icon': 'Plus' }, 'Plus'),
  ),
  RefreshCw: vi.fn((_props: { className?: string }) =>
    React.createElement('span', { 'data-icon': 'RefreshCw' }, 'RefreshCw'),
  ),
  Trash2: vi.fn((_props: { className?: string }) =>
    React.createElement('span', { 'data-icon': 'Trash2' }, 'Trash2'),
  ),
}));

vi.mock('lucide-react', () => ({
  Eye: mocks.Eye,
  Plus: mocks.Plus,
  RefreshCw: mocks.RefreshCw,
  Trash2: mocks.Trash2,
}));

// `useTranslation` mock: t(key, opts) shape per unit brief.
vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { total?: number }) =>
      opts?.total != null ? `${key}:total=${opts.total}` : key,
  }),
}));

import { PlanPreview } from '../plan-preview';
import type { DeployPlan } from '../../../../store/slices/deploy-slice';

// ─── Tree-walker (rf-props-16 / rf-pdpl-7 variant) ──────────────────────────
//
// `PlanPreview` renders flat JSX BUT also instantiates the file-private
// `ChangeRow` FC for each create/update/delete. The walker must invoke
// `ChangeRow` (and any other non-mocked FC, e.g. the `lucide-react` icon
// stubs above) and yield from the rendered subtree.

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
    // Invoke the FC (mocked icon or file-private ChangeRow) and walk the
    // rendered subtree.
    const FC = el.type as (props: unknown) => React.ReactNode;
    const rendered = FC(el.props);
    yield* walk(rendered as ReactNodeLike);
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
      const FC = el.type as (props: unknown) => React.ReactNode;
      visit(FC(el.props) as ReactNodeLike);
      return;
    }
    const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
    if (children != null) visit(children);
  }
  visit(tree);
  return parts.join('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const renderPlan = (plan: Partial<DeployPlan> | Record<string, unknown>): React.ReactElement => {
  return (PlanPreview as unknown as (props: { plan: DeployPlan }) => React.ReactElement)({
    plan: plan as DeployPlan,
  });
};

const findElementsByKey = (
  tree: React.ReactNode,
  prefix: string,
): React.ReactElement[] =>
  findByPredicate(tree, (el) => typeof el.key === 'string' && el.key.startsWith(prefix));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PlanPreview — empty state', () => {
  it('returns the "noChanges" empty-state div for an empty plan ({})', () => {
    const tree = renderPlan({});
    expect(tree.type).toBe('div');
    const text = collectText(tree);
    expect(text).toContain('deploy.plan.noChanges');
    // Empty state must not include the Eye header or any change rows.
    expect(text).not.toContain('Eye');
    expect(text).not.toContain('deploy.plan.changes');
  });

  it('empty-state class shape includes the centered muted styles', () => {
    const tree = renderPlan({});
    const className = (tree.props as { className: string }).className;
    expect(className).toContain('rounded-md');
    expect(className).toContain('border-border');
    expect(className).toContain('bg-muted/20');
    expect(className).toContain('text-muted-foreground');
    expect(className).toContain('text-center');
  });

  it('returns empty-state when all four arrays are explicitly empty', () => {
    const tree = renderPlan({ creates: [], updates: [], deletes: [], skipped: [] });
    const text = collectText(tree);
    expect(text).toContain('deploy.plan.noChanges');
  });

  it('treats non-array fields (null, undefined, string) as empty arrays via Array.isArray', () => {
    const tree = renderPlan({
      creates: null,
      updates: undefined,
      deletes: 'not-an-array',
      skipped: 42,
    } as unknown as DeployPlan);
    const text = collectText(tree);
    expect(text).toContain('deploy.plan.noChanges');
  });
});

describe('PlanPreview — table rendering', () => {
  it('skipped-only plan renders the table (NOT the empty state) even when total=0', () => {
    const tree = renderPlan({ skipped: [{ name: 'foo', reason: 'unsupported' }] });
    const text = collectText(tree);
    expect(text).not.toContain('deploy.plan.noChanges');
    expect(text).toContain('deploy.plan.changes:total=0');
    expect(text).toContain('deploy.plan.skip');
    expect(text).toContain('foo');
    expect(text).toContain('unsupported');
  });

  it('creates-only plan renders header `deploy.plan.changes:total=1` with one create row', () => {
    const tree = renderPlan({
      creates: [{ name: 'svc-a', type: 'gcp.run.service', action: 'create' }],
    });
    const text = collectText(tree);
    expect(text).toContain('deploy.plan.changes:total=1');
    expect(text).toContain('svc-a');
    expect(text).toContain('gcp.run.service');
    expect(text).toContain('Plus'); // ChangeRow create icon
  });

  it('updates-only plan renders one update row with RefreshCw icon', () => {
    const tree = renderPlan({
      updates: [{ name: 'svc-b', type: 'gcp.run.service', action: 'update' }],
    });
    const text = collectText(tree);
    expect(text).toContain('deploy.plan.changes:total=1');
    expect(text).toContain('svc-b');
    expect(text).toContain('RefreshCw');
  });

  it('deletes-only plan renders one delete row with Trash2 icon', () => {
    const tree = renderPlan({
      deletes: [{ name: 'svc-c', type: 'gcp.run.service', action: 'delete' }],
    });
    const text = collectText(tree);
    expect(text).toContain('deploy.plan.changes:total=1');
    expect(text).toContain('svc-c');
    expect(text).toContain('Trash2');
  });

  it('plan with one of each (create/update/delete/skip) renders 4 rows, total=3 (skipped excluded)', () => {
    const tree = renderPlan({
      creates: [{ name: 'c1', type: 'res.create', action: 'create' }],
      updates: [{ name: 'u1', type: 'res.update', action: 'update' }],
      deletes: [{ name: 'd1', type: 'res.delete', action: 'delete' }],
      skipped: [{ name: 's1', reason: 'reason-s' }],
    });
    const text = collectText(tree);
    // total counts only c+u+d (skipped excluded).
    expect(text).toContain('deploy.plan.changes:total=3');
    expect(text).toContain('c1');
    expect(text).toContain('u1');
    expect(text).toContain('d1');
    expect(text).toContain('s1');
    expect(text).toContain('reason-s');
  });

  it('header row uses Eye icon + the changes label with total opt', () => {
    const tree = renderPlan({
      creates: [{ name: 'c1', type: 'res.create', action: 'create' }],
    });
    const text = collectText(tree);
    expect(text).toContain('Eye');
    expect(text).toContain('deploy.plan.changes:total=1');
  });
});

describe('PlanPreview — stable keys', () => {
  it('each row uses the documented `c-${i}` / `u-${i}` / `d-${i}` / `s-${i}` key shape', () => {
    const tree = renderPlan({
      creates: [
        { name: 'c1', type: 't', action: 'create' },
        { name: 'c2', type: 't', action: 'create' },
      ],
      updates: [{ name: 'u1', type: 't', action: 'update' }],
      deletes: [{ name: 'd1', type: 't', action: 'delete' }],
      skipped: [{ name: 's1', reason: 'r' }],
    });
    expect(findElementsByKey(tree, 'c-')).toHaveLength(2);
    expect(findElementsByKey(tree, 'u-')).toHaveLength(1);
    expect(findElementsByKey(tree, 'd-')).toHaveLength(1);
    expect(findElementsByKey(tree, 's-')).toHaveLength(1);
    // Indices are 0-based.
    expect(findByPredicate(tree, (el) => el.key === 'c-0')).toHaveLength(1);
    expect(findByPredicate(tree, (el) => el.key === 'c-1')).toHaveLength(1);
    expect(findByPredicate(tree, (el) => el.key === 'u-0')).toHaveLength(1);
    expect(findByPredicate(tree, (el) => el.key === 'd-0')).toHaveLength(1);
    expect(findByPredicate(tree, (el) => el.key === 's-0')).toHaveLength(1);
  });
});

describe('PlanPreview — skipped row label fallthrough (`s.name || s.label || s.nodeId`)', () => {
  it('uses s.name when only `name` is set', () => {
    const tree = renderPlan({
      skipped: [{ name: 'name-x', reason: 'r' } as { name: string; reason: string }],
    });
    expect(collectText(tree)).toContain('name-x');
  });

  it('falls through to s.label when `name` is missing but `label` is set', () => {
    const tree = renderPlan({
      skipped: [{ label: 'label-y', reason: 'r' } as unknown as { name: string; reason: string }],
    });
    expect(collectText(tree)).toContain('label-y');
  });

  it('falls through to s.nodeId when both `name` and `label` are missing', () => {
    const tree = renderPlan({
      skipped: [{ nodeId: 'node-z', reason: 'r' } as unknown as { name: string; reason: string }],
    });
    expect(collectText(tree)).toContain('node-z');
  });

  it('three skipped rows pin all three branches in one render', () => {
    const tree = renderPlan({
      skipped: [
        { name: 'NAME-only', reason: 'r1' } as { name: string; reason: string },
        { label: 'LABEL-only', reason: 'r2' } as unknown as { name: string; reason: string },
        { nodeId: 'NODEID-only', reason: 'r3' } as unknown as { name: string; reason: string },
      ],
    });
    const text = collectText(tree);
    expect(text).toContain('NAME-only');
    expect(text).toContain('LABEL-only');
    expect(text).toContain('NODEID-only');
    expect(text).toContain('r1');
    expect(text).toContain('r2');
    expect(text).toContain('r3');
  });
});

describe('PlanPreview — warnings block', () => {
  it('renders the warnings block when `plan.warnings` is a non-empty array', () => {
    const tree = renderPlan({
      creates: [{ name: 'c1', type: 't', action: 'create' }],
      warnings: ['warn-a', 'warn-b'],
    });
    const text = collectText(tree);
    expect(text).toContain('warn-a');
    expect(text).toContain('warn-b');
    // The warnings block has a yellow-tinted bg.
    const warningBlocks = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-yellow-50'),
    );
    expect(warningBlocks).toHaveLength(1);
  });

  it('omits the warnings block when `plan.warnings` is undefined', () => {
    const tree = renderPlan({
      creates: [{ name: 'c1', type: 't', action: 'create' }],
    });
    const blocks = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-yellow-50'),
    );
    expect(blocks).toHaveLength(0);
  });

  it('omits the warnings block when `plan.warnings` is an empty array', () => {
    const tree = renderPlan({
      creates: [{ name: 'c1', type: 't', action: 'create' }],
      warnings: [],
    });
    const blocks = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-yellow-50'),
    );
    expect(blocks).toHaveLength(0);
  });

  it('omits the warnings block when `plan.warnings` is not an array (non-array values short-circuit Array.isArray)', () => {
    const tree = renderPlan({
      creates: [{ name: 'c1', type: 't', action: 'create' }],
      warnings: 'oops' as unknown as string[],
    });
    const blocks = findByPredicate(
      tree,
      (el) =>
        el.type === 'div' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('bg-yellow-50'),
    );
    expect(blocks).toHaveLength(0);
  });
});

describe('ChangeRow (file-private, exercised via PlanPreview)', () => {
  it("'create' row renders Plus icon + emerald action color class", () => {
    const tree = renderPlan({
      creates: [{ name: 'svc', type: 'res', action: 'create' }],
    });
    expect(collectText(tree)).toContain('Plus');
    // Find the action <span> (one with `w-16 text-xs font-medium ...`).
    const actionSpans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('w-16') && cn.includes('font-medium');
    });
    expect(actionSpans).toHaveLength(1);
    const spanCn = (actionSpans[0].props as { className: string }).className;
    expect(spanCn).toContain('text-emerald-600');
    expect(spanCn).toContain('dark:text-emerald-400');
  });

  it("'update' row renders RefreshCw icon + blue action color class", () => {
    const tree = renderPlan({
      updates: [{ name: 'svc', type: 'res', action: 'update' }],
    });
    expect(collectText(tree)).toContain('RefreshCw');
    const actionSpans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('w-16') && cn.includes('font-medium');
    });
    const spanCn = (actionSpans[0].props as { className: string }).className;
    expect(spanCn).toContain('text-blue-600');
    expect(spanCn).toContain('dark:text-blue-400');
  });

  it("'delete' row renders Trash2 icon + red action color class", () => {
    const tree = renderPlan({
      deletes: [{ name: 'svc', type: 'res', action: 'delete' }],
    });
    expect(collectText(tree)).toContain('Trash2');
    const actionSpans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('w-16') && cn.includes('font-medium');
    });
    const spanCn = (actionSpans[0].props as { className: string }).className;
    expect(spanCn).toContain('text-red-600');
    expect(spanCn).toContain('dark:text-red-400');
  });

  it("the action <span> renders the action string verbatim ('create' / 'update' / 'delete')", () => {
    const tree = renderPlan({
      creates: [{ name: 'c1', type: 't', action: 'create' }],
      updates: [{ name: 'u1', type: 't', action: 'update' }],
      deletes: [{ name: 'd1', type: 't', action: 'delete' }],
    });
    const text = collectText(tree);
    expect(text).toContain('create');
    expect(text).toContain('update');
    expect(text).toContain('delete');
  });

  it('row layout exposes the resource name and type in the tree', () => {
    const tree = renderPlan({
      creates: [{ name: 'my-bucket', type: 'gcp.storage.bucket', action: 'create' }],
    });
    const text = collectText(tree);
    expect(text).toContain('my-bucket');
    expect(text).toContain('gcp.storage.bucket');
  });
});
