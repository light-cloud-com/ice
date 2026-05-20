/**
 * Tests for `PipelineRow` — the compact-node pipeline-status row that
 * renders an inline lightning glyph + status label and (when in-flight)
 * a horizontal progress bar, or (when complete) a short commit hash.
 *
 * Branch focus:
 *   - status mapping (success / failed / building / deploying / queued
 *     / unknown → idle fallback)
 *   - icon color: success → green, failed → red, else → amber
 *   - active vs complete: show progress bar OR commit hash
 *   - reducedMotion: gates the pulse animation on the progress bar
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { PipelineRow } from '../pipeline-row';
import type { NodePipelineStatus } from '../types';

// ─── tree walker ──────────────────────────────────────────────────────

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

const renderPR = (
  status: NodePipelineStatus,
  reducedMotion = false,
  onClick: (e: React.MouseEvent) => void = () => {},
): React.ReactElement => {
  const Inner = (
    PipelineRow as unknown as {
      type: (p: React.ComponentProps<typeof PipelineRow>) => React.ReactElement;
    }
  ).type;
  return Inner({ status, reducedMotion, onClick });
};

describe('PipelineRow — React.memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    const t = (PipelineRow as unknown as { $$typeof: symbol }).$$typeof;
    expect(typeof t).toBe('symbol');
    expect(String(t)).toBe('Symbol(react.memo)');
  });

  it('carries displayName "PipelineRow"', () => {
    expect((PipelineRow as unknown as { displayName: string }).displayName).toBe('PipelineRow');
  });
});

describe('PipelineRow — status label dispatch', () => {
  it('renders "Live" when success', () => {
    const tree = renderPR({ status: 'success' });
    expect(collectText(tree)).toContain('Live');
  });

  it('renders "Failed" when failed', () => {
    expect(collectText(renderPR({ status: 'failed' }))).toContain('Failed');
  });

  it('renders "Building" when building', () => {
    expect(collectText(renderPR({ status: 'building' }))).toContain('Building');
  });

  it('renders "Deploying" when deploying', () => {
    expect(collectText(renderPR({ status: 'deploying' }))).toContain('Deploying');
  });

  it('renders "Queued" when queued', () => {
    expect(collectText(renderPR({ status: 'queued' }))).toContain('Queued');
  });

  it('renders "" (idle empty) for idle / unknown status', () => {
    // Idle: empty label string. Cast to bypass TS literal-union for testing fallback.
    const tree = renderPR({ status: 'unknown' as NodePipelineStatus['status'] });
    // The label span is still rendered, but with empty content. So `Live/Building/etc.` should not appear.
    const text = collectText(tree);
    expect(text).not.toContain('Live');
    expect(text).not.toContain('Failed');
    expect(text).not.toContain('Building');
  });
});

describe('PipelineRow — icon color', () => {
  /** Find the leading lightning span (fontSize: 10). */
  const findIcon = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const c = (el.props as { children?: unknown }).children;
      return c === '⚡';
    })[0];

  it('icon is green when success', () => {
    const icon = findIcon(renderPR({ status: 'success' }))!;
    expect((icon.props as { style: { color: string } }).style.color).toBe('#22c55e');
  });

  it('icon is red when failed', () => {
    const icon = findIcon(renderPR({ status: 'failed' }))!;
    expect((icon.props as { style: { color: string } }).style.color).toBe('#ef4444');
  });

  it('icon is amber for in-flight statuses', () => {
    for (const s of ['building', 'deploying', 'queued', 'idle'] as const) {
      const icon = findIcon(renderPR({ status: s as NodePipelineStatus['status'] }))!;
      expect((icon.props as { style: { color: string } }).style.color).toBe('#f59e0b');
    }
  });
});

describe('PipelineRow — progress bar (active states)', () => {
  /** Find the inner progress-bar fill (position:absolute, left:0, top:0). */
  const findProgressFill = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { position?: string; left?: number } }).style;
      return style?.position === 'absolute' && style?.left === 0;
    })[0];

  /** Find the outer progress-bar container (height: 4). */
  const findBar = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const style = (el.props as { style?: { height?: number; borderRadius?: number } }).style;
      return style?.height === 4 && style?.borderRadius === 2;
    })[0];

  it('renders bar for building / deploying / queued', () => {
    for (const s of ['building', 'deploying', 'queued'] as const) {
      expect(findBar(renderPR({ status: s }))).toBeDefined();
    }
  });

  it('omits bar for success / failed', () => {
    for (const s of ['success', 'failed'] as const) {
      expect(findBar(renderPR({ status: s }))).toBeUndefined();
    }
  });

  it('progress fill width uses status.progress when set, falls back to 2%', () => {
    const t1 = renderPR({ status: 'building', progress: 75 });
    expect((findProgressFill(t1)!.props as { style: { width: string } }).style.width).toBe('75%');
    const t2 = renderPR({ status: 'building' });
    expect((findProgressFill(t2)!.props as { style: { width: string } }).style.width).toBe('2%');
  });

  it('progress fill clamps to a minimum of 2% when progress=0', () => {
    const fill = findProgressFill(renderPR({ status: 'building', progress: 0 }))!;
    expect((fill.props as { style: { width: string } }).style.width).toBe('2%');
  });

  it('animation pulse runs when reducedMotion=false', () => {
    const fill = findProgressFill(renderPR({ status: 'building' }, false))!;
    expect((fill.props as { style: { animation?: string } }).style.animation).toContain('pulse-opacity');
  });

  it('animation off when reducedMotion=true', () => {
    const fill = findProgressFill(renderPR({ status: 'building' }, true))!;
    expect((fill.props as { style: { animation?: string } }).style.animation).toBeUndefined();
  });
});

describe('PipelineRow — commit hash (complete states)', () => {
  /** Find the trailing commit-hash span (marginLeft: auto). */
  const findHash = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { marginLeft?: string } }).style;
      return style?.marginLeft === 'auto';
    })[0];

  it('renders commit hash when status=success + commitSha set', () => {
    const tree = renderPR({ status: 'success', commitSha: 'abcdef0123456' });
    const hash = findHash(tree)!;
    expect((hash.props as { children: string }).children).toBe('abcdef0');
  });

  it('renders commit hash when status=failed + commitSha set', () => {
    const tree = renderPR({ status: 'failed', commitSha: '0123456789' });
    expect((findHash(tree)!.props as { children: string }).children).toBe('0123456');
  });

  it('omits commit hash when status complete but commitSha empty', () => {
    expect(findHash(renderPR({ status: 'success' }))).toBeUndefined();
  });

  it('omits commit hash for active states even when commitSha set', () => {
    expect(findHash(renderPR({ status: 'building', commitSha: 'abc' }))).toBeUndefined();
  });
});

describe('PipelineRow — interactions', () => {
  it('forwards onClick from outer div', () => {
    const click = vi.fn();
    const tree = renderPR({ status: 'success' }, false, click);
    const onClick = (tree.props as { onClick: () => void }).onClick;
    onClick();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('outer div onMouseDown stops propagation (avoid drag-start)', () => {
    const tree = renderPR({ status: 'success' });
    const stops: string[] = [];
    const onMouseDown = (tree.props as { onMouseDown: (e: React.MouseEvent) => void }).onMouseDown;
    onMouseDown({ stopPropagation: () => stops.push('s') } as React.MouseEvent);
    expect(stops).toEqual(['s']);
  });
});
