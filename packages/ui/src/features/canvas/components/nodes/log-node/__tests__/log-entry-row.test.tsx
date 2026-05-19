/**
 * Tests for `LogEntryRow` — a single row of the terminal-style log
 * stream. Renders timestamp + level pill + message; opacity dims for
 * non-last rows; row clicks fire the onClick(log, e) callback.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { LogEntryRow } from '../log-entry-row';
import type { LogEntry } from '../types';

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

const mkLog = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  id: 'log-1',
  timestamp: '12:34:56',
  level: 'info',
  service: 'logs',
  message: 'something happened',
  ...overrides,
});

const renderRow = (props: Partial<React.ComponentProps<typeof LogEntryRow>> = {}): React.ReactElement => {
  const Inner = (
    LogEntryRow as unknown as {
      type: (p: React.ComponentProps<typeof LogEntryRow>) => React.ReactElement;
    }
  ).type;
  const defaults: React.ComponentProps<typeof LogEntryRow> = {
    log: mkLog(),
    isLast: false,
    isCopied: false,
    onClick: () => {},
  };
  return Inner({ ...defaults, ...props });
};

describe('LogEntryRow', () => {
  it('is wrapped in React.memo with displayName', () => {
    expect(typeof (LogEntryRow as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((LogEntryRow as unknown as { displayName: string }).displayName).toBe('LogEntryRow');
  });

  it('renders timestamp text', () => {
    const tree = renderRow({ log: mkLog({ timestamp: '01:02:03' }) });
    const ts = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === '01:02:03',
    );
    expect(ts).toHaveLength(1);
  });

  it('renders level pill with [LEVEL] format', () => {
    const tree = renderRow({ log: mkLog({ level: 'info' }) });
    const lvl = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        Array.isArray((el.props as { children?: unknown[] }).children) &&
        (el.props as { children: React.ReactNode[] }).children[1] === 'INFO',
    );
    expect(lvl.length).toBeGreaterThan(0);
  });

  it('background: green tint when isCopied', () => {
    const tree = renderRow({ isCopied: true });
    expect((tree.props as { style: { background: string } }).style.background).toBe('rgba(34, 197, 94, 0.15)');
  });

  it('background: level bg when level is error/warn (not copied)', () => {
    const errTree = renderRow({ log: mkLog({ level: 'error' }) });
    const warnTree = renderRow({ log: mkLog({ level: 'warn' }) });
    expect((errTree.props as { style: { background: string } }).style.background).toMatch(/^#3d1a1a/);
    expect((warnTree.props as { style: { background: string } }).style.background).toMatch(/^#3d2f1a/);
  });

  it('background: transparent for info/debug (not copied)', () => {
    const infoTree = renderRow({ log: mkLog({ level: 'info' }) });
    const debugTree = renderRow({ log: mkLog({ level: 'debug' }) });
    expect((infoTree.props as { style: { background: string } }).style.background).toBe('transparent');
    expect((debugTree.props as { style: { background: string } }).style.background).toBe('transparent');
  });

  it('message color: light red for error', () => {
    const tree = renderRow({ log: mkLog({ level: 'error' }) });
    const msgSpan = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { fontSize?: number; flex?: number } }).style;
      return style?.fontSize === 10 && style?.flex === 1;
    })[0];
    expect((msgSpan.props as { style: { color: string } }).style.color).toBe('#fca5a5');
  });

  it('message color: amber for warn', () => {
    const tree = renderRow({ log: mkLog({ level: 'warn' }) });
    const msgSpan = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { fontSize?: number; flex?: number } }).style;
      return style?.fontSize === 10 && style?.flex === 1;
    })[0];
    expect((msgSpan.props as { style: { color: string } }).style.color).toBe('#fcd34d');
  });

  it('message color: terminal var for info/debug', () => {
    const tree = renderRow({ log: mkLog({ level: 'info' }) });
    const msgSpan = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { fontSize?: number; flex?: number } }).style;
      return style?.fontSize === 10 && style?.flex === 1;
    })[0];
    expect((msgSpan.props as { style: { color: string } }).style.color).toBe('var(--ice-text-primary)');
  });

  it('message opacity: 1 when isLast, 0.85 otherwise', () => {
    const last = renderRow({ isLast: true });
    const notLast = renderRow({ isLast: false });
    const findMsg = (t: React.ReactElement) =>
      findByPredicate(t, (el) => {
        if (el.type !== 'span') return false;
        const style = (el.props as { style?: { fontSize?: number; flex?: number } }).style;
        return style?.fontSize === 10 && style?.flex === 1;
      })[0];
    expect((findMsg(last).props as { style: { opacity: number } }).style.opacity).toBe(1);
    expect((findMsg(notLast).props as { style: { opacity: number } }).style.opacity).toBe(0.85);
  });

  it('onClick fires with (log, e)', () => {
    const click = vi.fn();
    const log = mkLog();
    const tree = renderRow({ log, onClick: click });
    const event = {} as React.MouseEvent;
    (tree.props as { onClick: (e: React.MouseEvent) => void }).onClick(event);
    expect(click).toHaveBeenCalledWith(log, event);
  });
});
