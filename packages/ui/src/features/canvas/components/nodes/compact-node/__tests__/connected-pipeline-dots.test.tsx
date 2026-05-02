/**
 * Tests for `ConnectedPipelineDots` — a compact row of small status dots
 * representing the pipeline status of every Source.Repository connected
 * downstream of this block.
 *
 * Branches:
 *   - dot color dispatch: success/failed/building/deploying/queued + default
 *   - "N live" trailing label: rendered iff at least one success status
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ConnectedPipelineDots } from '../connected-pipeline-dots';
import type { NodePipelineStatus } from '../types';

type ReactNodeLike = React.ReactNode;
function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
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
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
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
    visit(((n as React.ReactElement).props as { children?: React.ReactNode } | undefined)?.children ?? null);
  };
  visit(tree);
  return parts.join('');
}

const renderCPD = (statuses: NodePipelineStatus[]): React.ReactElement => {
  const Inner = (ConnectedPipelineDots as unknown as {
    type: (p: { statuses: NodePipelineStatus[] }) => React.ReactElement;
  }).type;
  return Inner({ statuses });
};

describe('ConnectedPipelineDots — React.memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    expect(typeof (ConnectedPipelineDots as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
  });

  it('carries displayName "ConnectedPipelineDots"', () => {
    expect((ConnectedPipelineDots as unknown as { displayName: string }).displayName).toBe('ConnectedPipelineDots');
  });
});

describe('ConnectedPipelineDots — dot color dispatch', () => {
  /** All dot spans (width: 6, height: 6). */
  const dotsOf = (tree: React.ReactElement): React.ReactElement[] =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { width?: number; height?: number } }).style;
      return style?.width === 6 && style?.height === 6;
    });

  it('green (#22c55e) for success', () => {
    const tree = renderCPD([{ status: 'success' }]);
    const dot = dotsOf(tree)[0];
    expect((dot.props as { style: { background: string } }).style.background).toBe('#22c55e');
  });

  it('red (#ef4444) for failed', () => {
    const tree = renderCPD([{ status: 'failed' }]);
    const dot = dotsOf(tree)[0];
    expect((dot.props as { style: { background: string } }).style.background).toBe('#ef4444');
  });

  it('blue (#3b82f6) for building / deploying', () => {
    for (const s of ['building', 'deploying'] as const) {
      const dot = dotsOf(renderCPD([{ status: s }]))[0];
      expect((dot.props as { style: { background: string } }).style.background).toBe('#3b82f6');
    }
  });

  it('amber (#f59e0b) for queued', () => {
    const dot = dotsOf(renderCPD([{ status: 'queued' }]))[0];
    expect((dot.props as { style: { background: string } }).style.background).toBe('#f59e0b');
  });

  it('grey (#64748b) for idle / unknown statuses (default)', () => {
    const dot = dotsOf(renderCPD([{ status: 'idle' }]))[0];
    expect((dot.props as { style: { background: string } }).style.background).toBe('#64748b');
    const unknownDot = dotsOf(renderCPD([{ status: 'something-else' as NodePipelineStatus['status'] }]))[0];
    expect((unknownDot.props as { style: { background: string } }).style.background).toBe('#64748b');
  });

  it('renders a dot for every status entry', () => {
    const tree = renderCPD([{ status: 'success' }, { status: 'failed' }, { status: 'building' }]);
    expect(dotsOf(tree)).toHaveLength(3);
  });
});

describe('ConnectedPipelineDots — live count', () => {
  it('renders "N live" when at least one success', () => {
    const tree = renderCPD([{ status: 'success' }, { status: 'success' }, { status: 'failed' }]);
    expect(collectText(tree)).toContain('2 live');
  });

  it('omits the "N live" label when no successes', () => {
    const tree = renderCPD([{ status: 'failed' }, { status: 'building' }]);
    expect(collectText(tree)).not.toContain('live');
  });

  it('renders "1 live" when exactly one success', () => {
    const tree = renderCPD([{ status: 'success' }]);
    expect(collectText(tree)).toContain('1 live');
  });
});
