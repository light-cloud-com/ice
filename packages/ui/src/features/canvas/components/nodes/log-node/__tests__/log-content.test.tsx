/**
 * Tests for `LogContent` — the body of the log-node card. Renders a
 * `<LogEntryRow>` per visible log, plus optional `<ScrollIndicator>`
 * (when content overflows) and a green cursor tail (when auto-scrolled
 * to the latest line).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const named = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    LogEntryRow: named('MockLogEntryRow'),
    ScrollIndicator: named('MockScrollIndicator'),
  };
});

vi.mock('../log-entry-row', () => ({ LogEntryRow: mocks.LogEntryRow }));
vi.mock('../scroll-indicator', () => ({ ScrollIndicator: mocks.ScrollIndicator }));

import { LogContent } from '../log-content';
import type { LogEntry } from '../types';

const MockLogEntryRow = mocks.LogEntryRow;
const MockScrollIndicator = mocks.ScrollIndicator;

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
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

const mkLog = (i: number): LogEntry => ({
  id: `l${i}`,
  timestamp: '00:00:00',
  level: 'info',
  service: 'svc',
  message: `m${i}`,
});

const renderLC = (props: Partial<React.ComponentProps<typeof LogContent>> = {}): React.ReactElement => {
  const Inner = (
    LogContent as unknown as {
      type: (p: React.ComponentProps<typeof LogContent>) => React.ReactElement;
    }
  ).type;
  const defaults: React.ComponentProps<typeof LogContent> = {
    logAreaHeight: 100,
    visibleLogs: [],
    copiedLine: null,
    isAutoScroll: true,
    maxOffset: 0,
    scrollProgress: 1,
    onCopyLine: () => {},
  };
  return Inner({ ...defaults, ...props });
};

describe('LogContent', () => {
  it('is wrapped in React.memo with displayName', () => {
    expect(typeof (LogContent as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((LogContent as unknown as { displayName: string }).displayName).toBe('LogContent');
  });

  it('renders one LogEntryRow per visible log', () => {
    const logs = [mkLog(1), mkLog(2), mkLog(3)];
    const tree = renderLC({ visibleLogs: logs });
    expect(findByType(tree, MockLogEntryRow)).toHaveLength(3);
  });

  it('passes isLast=true to the last row', () => {
    const tree = renderLC({ visibleLogs: [mkLog(1), mkLog(2)] });
    const rows = findByType(tree, MockLogEntryRow);
    expect((rows[0].props as { isLast: boolean }).isLast).toBe(false);
    expect((rows[1].props as { isLast: boolean }).isLast).toBe(true);
  });

  it('passes isCopied=true only to the matching row', () => {
    const tree = renderLC({ visibleLogs: [mkLog(1), mkLog(2)], copiedLine: 'l2' });
    const rows = findByType(tree, MockLogEntryRow);
    expect((rows[0].props as { isCopied: boolean }).isCopied).toBe(false);
    expect((rows[1].props as { isCopied: boolean }).isCopied).toBe(true);
  });

  it('renders ScrollIndicator only when maxOffset > 0', () => {
    expect(findByType(renderLC({ maxOffset: 5 }), MockScrollIndicator)).toHaveLength(1);
    expect(findByType(renderLC({ maxOffset: 0 }), MockScrollIndicator)).toHaveLength(0);
  });

  it('forwards (logAreaHeight - 4) as trackHeight + scrollProgress + isAutoScroll into ScrollIndicator', () => {
    const tree = renderLC({ maxOffset: 5, logAreaHeight: 200, scrollProgress: 0.5, isAutoScroll: false });
    const si = findByType(tree, MockScrollIndicator)[0];
    const props = si.props as { trackHeight: number; scrollProgress: number; isAutoScroll: boolean };
    expect(props.trackHeight).toBe(196);
    expect(props.scrollProgress).toBe(0.5);
    expect(props.isAutoScroll).toBe(false);
  });

  it('renders the green cursor tail when isAutoScroll', () => {
    const tree = renderLC({ isAutoScroll: true });
    const cursor = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { background?: string; height?: number } }).style;
      return style?.background === '#22c55e' && style?.height === 1.5;
    });
    expect(cursor).toHaveLength(1);
  });

  it('hides the green cursor tail when !isAutoScroll', () => {
    const tree = renderLC({ isAutoScroll: false });
    const cursor = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { background?: string; height?: number } }).style;
      return style?.background === '#22c55e' && style?.height === 1.5;
    });
    expect(cursor).toHaveLength(0);
  });

  it('forwards onCopyLine into each row', () => {
    const click = vi.fn();
    const tree = renderLC({ visibleLogs: [mkLog(1)], onCopyLine: click });
    const row = findByType(tree, MockLogEntryRow)[0];
    expect((row.props as { onClick: (...a: unknown[]) => void }).onClick).toBe(click);
  });
});
