/**
 * Tests for `LiveIndicator` — the small dot+label live-stream pill in
 * the log-node header. The component dispatches a tone (color + label
 * + pulse-animation gate) per `LogStreamStatus`.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { LiveIndicator } from '../live-indicator';
import type { LogStreamStatus } from '../../../../../../store/slices/logs-slice';

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
function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}

const renderLI = (status: LogStreamStatus): React.ReactElement => {
  const Inner = (
    LiveIndicator as unknown as {
      type: (p: { status: LogStreamStatus }) => React.ReactElement;
    }
  ).type;
  return Inner({ status });
};

/** Find the dot span — width 6 + height 6. */
const findDot = (tree: React.ReactElement): React.ReactElement | undefined =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'span') return false;
    const style = (el.props as { style?: { width?: number; height?: number } }).style;
    return style?.width === 6 && style?.height === 6;
  })[0];

/** Find the label span — fontSize: 8. */
const findLabel = (tree: React.ReactElement): React.ReactElement | undefined =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'span') return false;
    const style = (el.props as { style?: { fontSize?: number } }).style;
    return style?.fontSize === 8;
  })[0];

describe('LiveIndicator', () => {
  it('is wrapped in React.memo with displayName', () => {
    expect(typeof (LiveIndicator as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((LiveIndicator as unknown as { displayName: string }).displayName).toBe('LiveIndicator');
  });

  it('streaming → green dot + LIVE label + pulse animation', () => {
    const tree = renderLI('streaming');
    const dot = findDot(tree)!;
    const label = findLabel(tree)!;
    expect((dot.props as { style: { background: string } }).style.background).toBe('#22c55e');
    expect((dot.props as { style: { animation?: string } }).style.animation).toContain('pulse-opacity');
    expect((label.props as { children: string }).children).toBe('LIVE');
  });

  it('connecting → amber dot + CONNECTING label + no pulse', () => {
    const tree = renderLI('connecting');
    const dot = findDot(tree)!;
    expect((dot.props as { style: { background: string } }).style.background).toBe('#f59e0b');
    expect((dot.props as { style: { animation?: string } }).style.animation).toBeUndefined();
    expect((findLabel(tree)!.props as { children: string }).children).toBe('CONNECTING');
  });

  it('error → red dot + ERROR label', () => {
    const tree = renderLI('error');
    const dot = findDot(tree)!;
    expect((dot.props as { style: { background: string } }).style.background).toBe('#ef4444');
    expect((findLabel(tree)!.props as { children: string }).children).toBe('ERROR');
  });

  it('permission-denied → red dot + ERROR label', () => {
    const tree = renderLI('permission-denied');
    const dot = findDot(tree)!;
    expect((dot.props as { style: { background: string } }).style.background).toBe('#ef4444');
    expect((findLabel(tree)!.props as { children: string }).children).toBe('ERROR');
  });

  it('grey + IDLE for pre-deploy / no-source / ambiguous / unsupported / idle', () => {
    for (const s of ['pre-deploy', 'no-source', 'ambiguous', 'unsupported', 'idle'] as LogStreamStatus[]) {
      const tree = renderLI(s);
      const dot = findDot(tree)!;
      expect((dot.props as { style: { background: string } }).style.background).toBe('#94a3b8');
      expect((findLabel(tree)!.props as { children: string }).children).toBe('IDLE');
    }
  });

  it('default (unknown status) → grey + IDLE', () => {
    const tree = renderLI('unknown' as LogStreamStatus);
    const dot = findDot(tree)!;
    expect((dot.props as { style: { background: string } }).style.background).toBe('#94a3b8');
    expect((findLabel(tree)!.props as { children: string }).children).toBe('IDLE');
  });

  it('label color matches dot color', () => {
    const tree = renderLI('streaming');
    const label = findLabel(tree)!;
    expect((label.props as { style: { color: string } }).style.color).toBe('#22c55e');
  });
});
