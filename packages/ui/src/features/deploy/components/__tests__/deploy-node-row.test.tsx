/**
 * rf-pdpl-13 — DeployNodeRow.
 *
 * Eighth (final) Layer 1 leaf-component extraction in rf-pdpl. The component
 * is wrapped in `React.memo`, so the runtime export is the memo *object*
 * `{ $$typeof: Symbol(react.memo), type: <Inner FC>, compare }` — not a
 * callable function. To invoke the inner render under the direct-FC tree-
 * walker pattern we reach for `(DeployNodeRow as { type: Fn }).type(props)`.
 *
 * Mocks:
 *   - `mapWireStatusToOverlay` → identity passthrough (overlay key === wire status)
 *     so the overlay-key argument given to `getDeployBadge` is exactly the
 *     wire status the test set on `node.status`. The real function maps
 *     `applying → deploying`, `succeeded → active`, etc., but the row only
 *     cares that the badge resolves the SAME way the canvas does — for unit
 *     scope, identity is the simplest stable contract.
 *   - `getDeployBadge` → a small lookup table that returns
 *     `{ color: '#0066cc', label: 'DEPLOY' }` for a known overlay key,
 *     `null` for unknown. Tests that need other label/color values pass
 *     a different status and the mock returns the matching pair.
 *
 * Tree-walker pattern (cite
 * `tree-walker-must-invoke-file-private-fcs-when-extracted-component-keeps-an-inner-helper`):
 * walks the React element tree and invokes any function `el.type` it
 * encounters. DeployNodeRow has no inner FCs, so the walker only descends
 * through intrinsic elements (`<li>`, `<span>`, `<div>`).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Mock the two cross-module helpers. Hoisted so the mock identity stays
// stable across the test file (cite
// `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`).
const mocks = vi.hoisted(() => {
  // Identity passthrough — the overlay key arg given to `getDeployBadge`
  // is whatever the test set as `node.status`. Drives every assertion below.
  const mapWireStatusToOverlay = vi.fn((status: string) => status);
  // Badge lookup table. Tests pin specific (status → color/label) pairs;
  // unknown keys return null so we can exercise the no-badge branch.
  const getDeployBadge = vi.fn((overlayKey: string) => {
    switch (overlayKey) {
      case 'applying':
        return { color: '#0066cc', label: 'DEPLOY' };
      case 'succeeded':
        return { color: '#22c55e', label: 'LIVE' };
      case 'failed':
        return { color: '#ef4444', label: 'ERR' };
      case 'queued':
        return { color: '#f59e0b', label: 'QUEUED' };
      case 'skipped':
        return { color: '#94a3b8', label: 'SKIPPED' };
      case 'cancelled-due-to-dep':
        return { color: '#94a3b8', label: 'CANCEL' };
      default:
        return null;
    }
  });
  return { mapWireStatusToOverlay, getDeployBadge };
});

vi.mock('../../hooks/use-deploy-subscription', () => ({
  mapWireStatusToOverlay: mocks.mapWireStatusToOverlay,
}));

vi.mock('../../../canvas/components/nodes/compact-node/helpers', () => ({
  getDeployBadge: mocks.getDeployBadge,
}));

// `cn` is a thin classnames concatenator — keep the real implementation so
// the assertions on the className string match what the source produces.
// (No mock needed — `../../../shared/utils/cn` is pure and side-effect-free.)

import { DeployNodeRow } from '../deploy-node-row';
import type { NodeDeployState } from '../../../../store/slices/deploy-slice';

// ─── Tree-walker (rf-pdpl-7/-8/-9/-10/-11/-12 style) ────────────────────────

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

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
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
const renderRow = (node: NodeDeployState): React.ReactElement => {
  const Inner = (
    DeployNodeRow as unknown as {
      type: (props: { node: NodeDeployState }) => React.ReactElement;
    }
  ).type;
  return Inner({ node });
};

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

const findLi = (tree: React.ReactNode): React.ReactElement => {
  const lis = findByPredicate(tree, (el) => el.type === 'li');
  expect(lis).toHaveLength(1);
  return lis[0];
};

const findBadgeSpan = (tree: React.ReactNode): React.ReactElement | null => {
  const spans = findByPredicate(tree, (el) => {
    if (el.type !== 'span') return false;
    const className = (el.props as { className?: string }).className;
    return typeof className === 'string' && className.includes('uppercase tracking-wider');
  });
  return spans.length > 0 ? spans[0] : null;
};

const findStepDiv = (tree: React.ReactNode): React.ReactElement | null => {
  const divs = findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const text = collectText(el);
    return text.includes('└');
  });
  return divs.length > 0 ? divs[0] : null;
};

const findErrorDiv = (tree: React.ReactNode): React.ReactElement | null => {
  const divs = findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const className = (el.props as { className?: string }).className;
    return typeof className === 'string' && className.includes('text-red-600');
  });
  return divs.length > 0 ? divs[0] : null;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DeployNodeRow — outer <li> wrapper', () => {
  it('wraps content in a <li> with the E2E test-id', () => {
    const tree = renderRow(baseNode());
    const li = findLi(tree);
    expect((li.props as { 'data-testid': string })['data-testid']).toBe('ice-deploy-node-row');
  });

  it('exposes node_id via data-node-id', () => {
    const tree = renderRow(baseNode({ node_id: 'canvas-42' }));
    const li = findLi(tree);
    expect((li.props as { 'data-node-id': string })['data-node-id']).toBe('canvas-42');
  });

  it('exposes status via data-node-status', () => {
    const tree = renderRow(baseNode({ status: 'failed' }));
    const li = findLi(tree);
    expect((li.props as { 'data-node-status': string })['data-node-status']).toBe('failed');
  });

  it('always carries the base flex-row classes', () => {
    const tree = renderRow(baseNode());
    const li = findLi(tree);
    const className = (li.props as { className: string }).className;
    expect(className).toContain('px-3');
    expect(className).toContain('py-2');
    expect(className).toContain('text-xs');
    expect(className).toContain('flex');
    expect(className).toContain('items-start');
    expect(className).toContain('gap-2');
  });
});

describe('DeployNodeRow — badge presence', () => {
  it('renders the badge span when getDeployBadge returns non-null', () => {
    const tree = renderRow(baseNode({ status: 'applying' }));
    const badge = findBadgeSpan(tree);
    expect(badge).not.toBeNull();
    expect(collectText(badge!)).toBe('DEPLOY');
  });

  it('omits the badge span when getDeployBadge returns null (unknown status)', () => {
    // `mapWireStatusToOverlay` is identity, so an unknown wire status maps to
    // an unknown overlay key, which the badge mock resolves to null.
    const tree = renderRow(baseNode({ status: 'unknown-status' as NodeDeployState['status'] }));
    expect(findBadgeSpan(tree)).toBeNull();
  });

  it('routes node.status through mapWireStatusToOverlay before getDeployBadge', () => {
    mocks.mapWireStatusToOverlay.mockClear();
    mocks.getDeployBadge.mockClear();
    renderRow(baseNode({ status: 'applying' }));
    expect(mocks.mapWireStatusToOverlay).toHaveBeenCalledWith('applying');
    // The arg to getDeployBadge must be the (mocked-as-identity) overlay key,
    // i.e. the same status string.
    expect(mocks.getDeployBadge).toHaveBeenCalledWith('applying');
  });

  it('badge style applies the badge.color hex with the +20 alpha-channel suffix on backgroundColor', () => {
    const tree = renderRow(baseNode({ status: 'applying' }));
    const badge = findBadgeSpan(tree);
    expect(badge).not.toBeNull();
    const style = (badge!.props as { style: { backgroundColor: string; color: string } }).style;
    // The +'20' is a Tailwind-arbitrary alpha-channel concatenation trick — pin it.
    expect(style.backgroundColor).toBe('#0066cc20');
    expect(style.color).toBe('#0066cc');
  });

  it('badge classes include uppercase, font-semibold, rounded, and tracking-wider', () => {
    const tree = renderRow(baseNode({ status: 'applying' }));
    const badge = findBadgeSpan(tree);
    expect(badge).not.toBeNull();
    const className = (badge!.props as { className: string }).className;
    expect(className).toContain('uppercase');
    expect(className).toContain('font-semibold');
    expect(className).toContain('rounded');
    expect(className).toContain('tracking-wider');
  });
});

describe('DeployNodeRow — action-aware destroy label override', () => {
  it('action=delete + status=applying → label "DESTROY" (color preserved from base badge)', () => {
    const tree = renderRow(baseNode({ status: 'applying', action: 'delete' }));
    const badge = findBadgeSpan(tree);
    expect(badge).not.toBeNull();
    expect(collectText(badge!)).toBe('DESTROY');
    // Color must stay the original badge color (#0066cc).
    const style = (badge!.props as { style: { backgroundColor: string; color: string } }).style;
    expect(style.color).toBe('#0066cc');
  });

  it('action=delete + status=succeeded → label "GONE" (color preserved)', () => {
    const tree = renderRow(baseNode({ status: 'succeeded', action: 'delete' }));
    const badge = findBadgeSpan(tree);
    expect(badge).not.toBeNull();
    expect(collectText(badge!)).toBe('GONE');
    const style = (badge!.props as { style: { backgroundColor: string; color: string } }).style;
    expect(style.color).toBe('#22c55e');
  });

  it('action=delete + status=failed → uses base badge label (no override)', () => {
    const tree = renderRow(baseNode({ status: 'failed', action: 'delete' }));
    const badge = findBadgeSpan(tree);
    expect(badge).not.toBeNull();
    expect(collectText(badge!)).toBe('ERR');
  });

  it('action=delete + status=skipped → uses base badge label (no override)', () => {
    const tree = renderRow(baseNode({ status: 'skipped', action: 'delete' }));
    const badge = findBadgeSpan(tree);
    expect(badge).not.toBeNull();
    expect(collectText(badge!)).toBe('SKIPPED');
  });

  it('action=delete + status=queued → uses base badge label (no override)', () => {
    const tree = renderRow(baseNode({ status: 'queued', action: 'delete' }));
    const badge = findBadgeSpan(tree);
    expect(badge).not.toBeNull();
    expect(collectText(badge!)).toBe('QUEUED');
  });

  it('action=create + status=applying → uses base badge label (no override regardless of status)', () => {
    const tree = renderRow(baseNode({ status: 'applying', action: 'create' }));
    const badge = findBadgeSpan(tree);
    expect(badge).not.toBeNull();
    expect(collectText(badge!)).toBe('DEPLOY');
  });

  it('action=create + status=succeeded → uses base badge label (NOT "GONE")', () => {
    const tree = renderRow(baseNode({ status: 'succeeded', action: 'create' }));
    const badge = findBadgeSpan(tree);
    expect(badge).not.toBeNull();
    expect(collectText(badge!)).toBe('LIVE');
  });

  it('action=update + status=applying → uses base badge label (NOT "DESTROY")', () => {
    const tree = renderRow(baseNode({ status: 'applying', action: 'update' }));
    const badge = findBadgeSpan(tree);
    expect(badge).not.toBeNull();
    expect(collectText(badge!)).toBe('DEPLOY');
  });

  it('action=delete + unknown status → no badge (baseBadge null short-circuits the override)', () => {
    const tree = renderRow(baseNode({ status: 'unknown-status' as NodeDeployState['status'], action: 'delete' }));
    expect(findBadgeSpan(tree)).toBeNull();
  });
});

describe('DeployNodeRow — muted opacity', () => {
  it('applies opacity-60 when status is "skipped"', () => {
    const tree = renderRow(baseNode({ status: 'skipped' }));
    const li = findLi(tree);
    const className = (li.props as { className: string }).className;
    expect(className).toContain('opacity-60');
  });

  it('applies opacity-60 when status is "cancelled-due-to-dep"', () => {
    const tree = renderRow(baseNode({ status: 'cancelled-due-to-dep' }));
    const li = findLi(tree);
    const className = (li.props as { className: string }).className;
    expect(className).toContain('opacity-60');
  });

  it('does NOT apply opacity-60 for applying / succeeded / failed / queued statuses', () => {
    const statuses: Array<NodeDeployState['status']> = ['applying', 'succeeded', 'failed', 'queued'];
    for (const status of statuses) {
      const tree = renderRow(baseNode({ status }));
      const li = findLi(tree);
      const className = (li.props as { className: string }).className;
      expect(className).not.toContain('opacity-60');
    }
  });
});

describe('DeployNodeRow — duration display (terminal gate)', () => {
  it('shows duration when status=succeeded and duration_ms is set', () => {
    const tree = renderRow(baseNode({ status: 'succeeded', duration_ms: 1234 }));
    const text = collectText(tree);
    expect(text).toContain('1.2s');
  });

  it('shows duration when status=failed and duration_ms is set', () => {
    const tree = renderRow(baseNode({ status: 'failed', duration_ms: 500 }));
    const text = collectText(tree);
    expect(text).toContain('0.5s');
  });

  it('shows duration when status=skipped and duration_ms is set', () => {
    const tree = renderRow(baseNode({ status: 'skipped', duration_ms: 0 }));
    const text = collectText(tree);
    expect(text).toContain('0.0s');
  });

  it('shows duration when status=cancelled-due-to-dep and duration_ms is set', () => {
    const tree = renderRow(baseNode({ status: 'cancelled-due-to-dep', duration_ms: 7890 }));
    const text = collectText(tree);
    expect(text).toContain('7.9s');
  });

  it('does NOT show duration for non-terminal status=applying even when duration_ms is set', () => {
    const tree = renderRow(baseNode({ status: 'applying', duration_ms: 1000 }));
    const text = collectText(tree);
    expect(text).not.toContain('1.0s');
  });

  it('does NOT show duration for non-terminal status=queued even when duration_ms is set', () => {
    const tree = renderRow(baseNode({ status: 'queued', duration_ms: 100 }));
    const text = collectText(tree);
    expect(text).not.toContain('0.1s');
  });

  it('does NOT show duration when duration_ms is undefined (terminal status)', () => {
    const tree = renderRow(baseNode({ status: 'succeeded', duration_ms: undefined }));
    const text = collectText(tree);
    expect(text).not.toMatch(/\ds\b/);
  });

  it('renders duration formatted as (ms / 1000).toFixed(1)', () => {
    const tree = renderRow(baseNode({ status: 'succeeded', duration_ms: 12345 }));
    expect(collectText(tree)).toContain('12.3s');
  });
});

describe('DeployNodeRow — resource name fallback', () => {
  it('renders the resource_name when set', () => {
    const tree = renderRow(baseNode({ resource_name: 'my-actual-name', node_id: 'fallback-id' }));
    expect(collectText(tree)).toContain('my-actual-name');
    expect(collectText(tree)).not.toContain('fallback-id');
  });

  it('falls back to node_id when resource_name is empty string', () => {
    const tree = renderRow(baseNode({ resource_name: '', node_id: 'canvas-fallback' }));
    expect(collectText(tree)).toContain('canvas-fallback');
  });

  it('falls back to node_id when resource_name is undefined', () => {
    const tree = renderRow(
      baseNode({
        resource_name: undefined as unknown as string,
        node_id: 'canvas-undef',
      }),
    );
    expect(collectText(tree)).toContain('canvas-undef');
  });
});

describe('DeployNodeRow — resource type display', () => {
  it('renders resource_type when set', () => {
    const tree = renderRow(baseNode({ resource_type: 'storage.googleapis.com/Bucket' }));
    expect(collectText(tree)).toContain('storage.googleapis.com/Bucket');
  });

  it('omits the resource_type span when resource_type is empty/falsy', () => {
    const tree = renderRow(baseNode({ resource_type: '' }));
    // The font-mono span only renders when resource_type is truthy.
    const monoSpans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const className = (el.props as { className?: string }).className;
      return typeof className === 'string' && className.includes('font-mono');
    });
    expect(monoSpans).toHaveLength(0);
  });

  it('omits the resource_type span when resource_type is undefined', () => {
    const tree = renderRow(baseNode({ resource_type: undefined as unknown as string }));
    const monoSpans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const className = (el.props as { className?: string }).className;
      return typeof className === 'string' && className.includes('font-mono');
    });
    expect(monoSpans).toHaveLength(0);
  });
});

describe('DeployNodeRow — step indicator', () => {
  it('renders the step indicator when status=applying and step is set', () => {
    const tree = renderRow(baseNode({ status: 'applying', step: { label: 'create-bucket', index: 2, total: 5 } }));
    const step = findStepDiv(tree);
    expect(step).not.toBeNull();
    const text = collectText(step!);
    expect(text).toContain('└');
    expect(text).toContain('create-bucket');
    expect(text).toContain('(2/5)');
  });

  it('does NOT render step indicator when status=applying but step is undefined', () => {
    const tree = renderRow(baseNode({ status: 'applying', step: undefined }));
    expect(findStepDiv(tree)).toBeNull();
  });

  it('does NOT render step indicator when step is set but status != applying', () => {
    const tree = renderRow(baseNode({ status: 'queued', step: { label: 'will-run', index: 1, total: 3 } }));
    expect(findStepDiv(tree)).toBeNull();
  });

  it('does NOT render step indicator when status=succeeded (terminal) even if step is set', () => {
    const tree = renderRow(baseNode({ status: 'succeeded', step: { label: 'done', index: 5, total: 5 } }));
    expect(findStepDiv(tree)).toBeNull();
  });

  it('does NOT render step indicator when status=failed even if step is set', () => {
    const tree = renderRow(baseNode({ status: 'failed', step: { label: 'failing', index: 3, total: 5 } }));
    expect(findStepDiv(tree)).toBeNull();
  });
});

describe('DeployNodeRow — error message', () => {
  it('renders the error message when status=failed and error.message is set', () => {
    const tree = renderRow(
      baseNode({
        status: 'failed',
        error: { code: 'API_ERROR', message: 'something went wrong' },
      }),
    );
    const err = findErrorDiv(tree);
    expect(err).not.toBeNull();
    expect(collectText(err!)).toContain('something went wrong');
  });

  it('does NOT render error block when status=failed but error is undefined', () => {
    const tree = renderRow(baseNode({ status: 'failed', error: undefined }));
    expect(findErrorDiv(tree)).toBeNull();
  });

  it('does NOT render error block when status=failed but error.message is empty', () => {
    const tree = renderRow(baseNode({ status: 'failed', error: { code: 'X', message: '' } }));
    expect(findErrorDiv(tree)).toBeNull();
  });

  it('does NOT render error block when error is set but status != failed', () => {
    const tree = renderRow(
      baseNode({
        status: 'succeeded',
        error: { code: 'STALE', message: 'shouldnt show' },
      }),
    );
    expect(findErrorDiv(tree)).toBeNull();
  });

  it('error div carries the dark-mode color override class', () => {
    const tree = renderRow(
      baseNode({
        status: 'failed',
        error: { code: 'X', message: 'boom' },
      }),
    );
    const err = findErrorDiv(tree);
    expect(err).not.toBeNull();
    const className = (err!.props as { className: string }).className;
    expect(className).toContain('dark:text-red-400');
    expect(className).toContain('break-words');
  });
});

describe('DeployNodeRow — React.memo boundary', () => {
  it('is wrapped in React.memo (carries the memo $$typeof marker)', () => {
    const memoTypeof = (DeployNodeRow as unknown as { $$typeof: symbol }).$$typeof;
    // React's memo type marker is a symbol whose description is "react.memo".
    expect(typeof memoTypeof).toBe('symbol');
    expect(String(memoTypeof)).toBe('Symbol(react.memo)');
  });

  it('exposes the inner FC under the .type property of the memo wrapper', () => {
    const inner = (DeployNodeRow as unknown as { type: unknown }).type;
    expect(typeof inner).toBe('function');
  });

  it('preserves the displayName "DeployNodeRow" on the memo wrapper', () => {
    expect((DeployNodeRow as unknown as { displayName: string }).displayName).toBe('DeployNodeRow');
  });
});

describe('DeployNodeRow — title attribute on resource_name span', () => {
  it('the resource-name span has title=resource_name (pinned for tooltip-on-truncate)', () => {
    const tree = renderRow(baseNode({ resource_name: 'a-very-long-bucket-name' }));
    const spans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const className = (el.props as { className?: string }).className;
      return typeof className === 'string' && className.includes('font-medium truncate');
    });
    expect(spans).toHaveLength(1);
    expect((spans[0].props as { title: string }).title).toBe('a-very-long-bucket-name');
  });
});
