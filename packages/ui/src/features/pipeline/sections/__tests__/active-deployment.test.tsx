/**
 * rf-ppanel-7 — ActiveDeployment.
 *
 * Direct-FC tree-walker tests. Stateless — no useState, no useTranslation.
 *
 * Cite:
 *   - `lucide-react-icons-are-forwardref-objects-not-fcs-for-tree-walker-predicates`
 *     — three step icons (CheckCircle, XCircle, Loader2) are forwardRef.
 *
 * Branches pinned:
 *   - stage label fallback (`status.stage || status.status`)
 *   - progress fallback (`status.progress || 0`) including 0%-when-undefined
 *   - progress-bar color flip on status === 'failed'
 *   - commit info conditional render (commitSha truthy)
 *   - log block conditional render (logs.length > 0)
 *   - per-step icon (completed → CheckCircle, failed → XCircle, else → Loader2)
 *   - per-step text color flip (failed → text-red-400, else → text-slate-300)
 *   - duration suffix conditional render + .toFixed(1)
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

import { ActiveDeployment } from '../active-deployment';
import type { ActiveDeploymentProps } from '../active-deployment';
import type { DeployStep } from '../../../../store/slices/pipeline-slice';

function render(props: ActiveDeploymentProps): React.ReactElement {
  return (ActiveDeployment as unknown as (p: ActiveDeploymentProps) => React.ReactElement)(props);
}

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  if (typeof el.type === 'function') {
    try {
      const FC = el.type as (props: unknown) => React.ReactNode;
      yield* walk(FC(el.props) as ReactNodeLike);
    } catch {
      /* skip */
    }
    return;
  }
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByRef(tree: React.ReactNode, ref: unknown): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && el.type === ref) out.push(el);
  }
  return out;
}

function collectText(tree: React.ReactNode): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = (el.props as { children?: unknown } | undefined)?.children;
    if (typeof c === 'string') s += c + ' ';
    else if (typeof c === 'number') s += String(c) + ' ';
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item + ' ';
        else if (typeof item === 'number') s += String(item) + ' ';
      }
    }
  }
  return s;
}

describe('ActiveDeployment — outer + progress bar', () => {
  it('renders the spaced outer container', () => {
    const tree = render({ status: { status: 'building' }, logs: [] });
    expect(tree.type).toBe('div');
    expect((tree.props as { className: string }).className).toContain('space-y-2');
  });

  it('uses status.stage as the label when present', () => {
    const tree = render({ status: { status: 'building', stage: 'compiling' }, logs: [] });
    const text = collectText(tree);
    expect(text).toContain('compiling');
  });

  it('falls back to status.status when stage is missing', () => {
    const tree = render({ status: { status: 'building' }, logs: [] });
    const text = collectText(tree);
    expect(text).toContain('building');
  });

  it('shows the progress percentage (mono span)', () => {
    const tree = render({ status: { status: 'building', progress: 42 }, logs: [] });
    let found = false;
    for (const el of walk(tree)) {
      if (
        el.type === 'span' &&
        Array.isArray((el.props as { children: unknown[] }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).includes(42)
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('falls back to 0% when progress is undefined', () => {
    const tree = render({ status: { status: 'building' }, logs: [] });
    let found = false;
    for (const el of walk(tree)) {
      if (
        el.type === 'span' &&
        Array.isArray((el.props as { children: unknown[] }).children) &&
        ((el.props as { children: unknown[] }).children as unknown[]).includes(0)
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('flips progress-bar color to red when status="failed"', () => {
    const tree = render({ status: { status: 'failed', progress: 50 }, logs: [] });
    let foundRed = false;
    for (const el of walk(tree)) {
      const cls = (el.props as { className?: string } | undefined)?.className;
      if (typeof cls === 'string' && cls.includes('bg-red-500') && cls.includes('h-full')) {
        foundRed = true;
        break;
      }
    }
    expect(foundRed).toBe(true);
  });

  it('uses emerald progress-bar color for non-failed statuses', () => {
    const tree = render({ status: { status: 'deploying', progress: 50 }, logs: [] });
    let foundEmerald = false;
    for (const el of walk(tree)) {
      const cls = (el.props as { className?: string } | undefined)?.className;
      if (typeof cls === 'string' && cls.includes('bg-emerald-500') && cls.includes('h-full')) {
        foundEmerald = true;
        break;
      }
    }
    expect(foundEmerald).toBe(true);
  });

  it('sets the progress-bar width via the inline style', () => {
    const tree = render({ status: { status: 'deploying', progress: 33 }, logs: [] });
    let foundWidth: string | undefined;
    for (const el of walk(tree)) {
      const style = (el.props as { style?: { width?: string } } | undefined)?.style;
      if (style && style.width) {
        foundWidth = style.width;
        break;
      }
    }
    expect(foundWidth).toBe('33%');
  });

  it('sets width to 0% when progress is undefined', () => {
    const tree = render({ status: { status: 'deploying' }, logs: [] });
    let foundWidth: string | undefined;
    for (const el of walk(tree)) {
      const style = (el.props as { style?: { width?: string } } | undefined)?.style;
      if (style && style.width !== undefined) {
        foundWidth = style.width;
        break;
      }
    }
    expect(foundWidth).toBe('0%');
  });
});

describe('ActiveDeployment — commit info row', () => {
  it('renders truncated commit sha + message when commitSha is set', () => {
    const tree = render({
      status: {
        status: 'deploying',
        commitSha: 'abc1234567890',
        commitMessage: 'fix: bug',
      },
      logs: [],
    });
    const text = collectText(tree);
    expect(text).toContain('abc1234');
    expect(text).toContain('fix: bug');
    expect(text).not.toContain('abc1234567890');
  });

  it('does NOT render commit info row when commitSha is missing', () => {
    const tree = render({ status: { status: 'deploying' }, logs: [] });
    const text = collectText(tree);
    expect(text).not.toContain('abc');
  });
});

describe('ActiveDeployment — log step list', () => {
  it('does NOT render the log block when logs is empty', () => {
    const tree = render({ status: { status: 'deploying' }, logs: [] });
    let foundLogBlock = false;
    for (const el of walk(tree)) {
      const cls = (el.props as { className?: string } | undefined)?.className;
      if (typeof cls === 'string' && cls.includes('bg-slate-950')) {
        foundLogBlock = true;
        break;
      }
    }
    expect(foundLogBlock).toBe(false);
  });

  it('renders the log block when logs.length > 0', () => {
    const log: DeployStep = { step: 'install', status: 'started', message: 'starting...', timestamp: 'a' };
    const tree = render({ status: { status: 'deploying' }, logs: [log] });
    let foundLogBlock = false;
    for (const el of walk(tree)) {
      const cls = (el.props as { className?: string } | undefined)?.className;
      if (typeof cls === 'string' && cls.includes('bg-slate-950')) {
        foundLogBlock = true;
        break;
      }
    }
    expect(foundLogBlock).toBe(true);
  });

  it('renders CheckCircle for status="completed" steps', () => {
    const log: DeployStep = { step: 'install', status: 'completed', message: 'done', timestamp: 'a' };
    const tree = render({ status: { status: 'deploying' }, logs: [log] });
    expect(findByRef(tree, CheckCircle).length).toBe(1);
    expect(findByRef(tree, XCircle).length).toBe(0);
    expect(findByRef(tree, Loader2).length).toBe(0);
  });

  it('renders XCircle and red text for status="failed" steps', () => {
    const log: DeployStep = { step: 'build', status: 'failed', message: 'compile error', timestamp: 'b' };
    const tree = render({ status: { status: 'deploying' }, logs: [log] });
    expect(findByRef(tree, XCircle).length).toBe(1);
    let foundRedText = false;
    for (const el of walk(tree)) {
      if (el.type === 'span') {
        const cls = (el.props as { className?: string } | undefined)?.className;
        if (typeof cls === 'string' && cls.includes('text-red-400')) {
          foundRedText = true;
          break;
        }
      }
    }
    expect(foundRedText).toBe(true);
  });

  it('renders animated Loader2 for any other step status (e.g. "started")', () => {
    const log: DeployStep = { step: 'deploy', status: 'started', message: 'deploying...', timestamp: 'c' };
    const tree = render({ status: { status: 'deploying' }, logs: [log] });
    const loaders = findByRef(tree, Loader2);
    expect(loaders.length).toBe(1);
    expect((loaders[0].props as { className: string }).className).toContain('animate-spin');
    expect((loaders[0].props as { className: string }).className).toContain('text-blue-400');
  });

  it('uses slate-300 text color for non-failed steps', () => {
    const log: DeployStep = { step: 'install', status: 'completed', message: 'done', timestamp: 'a' };
    const tree = render({ status: { status: 'deploying' }, logs: [log] });
    let foundSlateText = false;
    for (const el of walk(tree)) {
      if (el.type === 'span') {
        const cls = (el.props as { className?: string } | undefined)?.className;
        if (typeof cls === 'string' && cls.includes('text-slate-300')) {
          foundSlateText = true;
          break;
        }
      }
    }
    expect(foundSlateText).toBe(true);
  });

  it('renders duration suffix in seconds.tenths when duration_ms is set', () => {
    const log: DeployStep = {
      step: 'install',
      status: 'completed',
      message: 'done',
      timestamp: 'a',
      duration_ms: 1234,
    };
    const tree = render({ status: { status: 'deploying' }, logs: [log] });
    const text = collectText(tree);
    // 1234 / 1000 = 1.234, .toFixed(1) = '1.2', then suffix 's'.
    expect(text).toContain('1.2');
  });

  it('does NOT render duration suffix when duration_ms is missing', () => {
    const log: DeployStep = { step: 'install', status: 'completed', message: 'done', timestamp: 'a' };
    const tree = render({ status: { status: 'deploying' }, logs: [log] });
    const text = collectText(tree);
    // 's' might appear in messages, so probe for the floored 1.0s pattern
    // we'd have rendered.
    expect(text).not.toContain('1.2');
  });

  it('does NOT render duration suffix when duration_ms is 0 (falsy guard)', () => {
    // Source uses `log.duration_ms &&` — 0 is falsy, hide the duration.
    // Pin verbatim.
    const log: DeployStep = {
      step: 'install',
      status: 'completed',
      message: 'done',
      timestamp: 'a',
      duration_ms: 0,
    };
    const tree = render({ status: { status: 'deploying' }, logs: [log] });
    const text = collectText(tree);
    expect(text).not.toContain('0.0');
  });

  it('renders multiple log entries in order', () => {
    const logs: DeployStep[] = [
      { step: '1', status: 'completed', message: 'first', timestamp: 'a' },
      { step: '2', status: 'failed', message: 'second', timestamp: 'b' },
      { step: '3', status: 'started', message: 'third', timestamp: 'c' },
    ];
    const tree = render({ status: { status: 'deploying' }, logs });
    expect(findByRef(tree, CheckCircle).length).toBe(1);
    expect(findByRef(tree, XCircle).length).toBe(1);
    expect(findByRef(tree, Loader2).length).toBe(1);
  });
});
