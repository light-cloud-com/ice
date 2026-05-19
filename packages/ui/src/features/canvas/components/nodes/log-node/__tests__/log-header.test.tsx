/**
 * Tests for `LogHeader` — the top-bar of the log-node card. Composes
 * a terminal glyph + title + LiveIndicator + (hover-only) CopyButton +
 * FoldButton.
 *
 * Branches:
 *   - title falls back to "Logs" when label empty.
 *   - LiveIndicator + CopyButton hidden when folded.
 *   - CopyButton hidden when not hovered.
 *   - FoldButton always rendered; opacity 0.8 when hovered, 0.5 otherwise.
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
    LiveIndicator: named('MockLiveIndicator'),
    CopyButton: named('MockCopyButton'),
    FoldButton: named('MockFoldButton'),
  };
});

vi.mock('../live-indicator', () => ({ LiveIndicator: mocks.LiveIndicator }));
vi.mock('../copy-button', () => ({ CopyButton: mocks.CopyButton }));
vi.mock('../../_shared/fold-button', () => ({ FoldButton: mocks.FoldButton }));

import { LogHeader } from '../log-header';
import type { LogStreamStatus } from '../../../../../../store/slices/logs-slice';

const MockLiveIndicator = mocks.LiveIndicator;
const MockCopyButton = mocks.CopyButton;
const MockFoldButton = mocks.FoldButton;

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
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

const renderLH = (
  props: Partial<React.ComponentProps<typeof LogHeader>> = {},
): React.ReactElement => {
  const Inner = (LogHeader as unknown as {
    type: (p: React.ComponentProps<typeof LogHeader>) => React.ReactElement;
  }).type;
  const defaults: React.ComponentProps<typeof LogHeader> = {
    label: 'Stream',
    folded: false,
    isHovered: false,
    status: 'streaming' as LogStreamStatus,
    onToggleFold: () => {},
    onCopyAll: () => {},
  };
  return Inner({ ...defaults, ...props });
};

describe('LogHeader', () => {
  it('is wrapped in React.memo with displayName', () => {
    expect(typeof (LogHeader as unknown as { $$typeof: symbol }).$$typeof).toBe('symbol');
    expect((LogHeader as unknown as { displayName: string }).displayName).toBe('LogHeader');
  });

  it('renders the title from label', () => {
    const tree = renderLH({ label: 'My Stream' });
    const title = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'My Stream');
    expect(title).toHaveLength(1);
  });

  it('falls back to "Logs" when label empty', () => {
    const tree = renderLH({ label: '' });
    const title = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'Logs');
    expect(title).toHaveLength(1);
  });

  it('renders LiveIndicator when not folded', () => {
    expect(findByType(renderLH({ folded: false }), MockLiveIndicator)).toHaveLength(1);
  });

  it('omits LiveIndicator when folded', () => {
    expect(findByType(renderLH({ folded: true }), MockLiveIndicator)).toHaveLength(0);
  });

  it('forwards status to LiveIndicator', () => {
    const tree = renderLH({ status: 'connecting' });
    const li = findByType(tree, MockLiveIndicator)[0];
    expect((li.props as { status: string }).status).toBe('connecting');
  });

  it('renders CopyButton only when not folded + isHovered', () => {
    expect(findByType(renderLH({ folded: false, isHovered: true }), MockCopyButton)).toHaveLength(1);
    expect(findByType(renderLH({ folded: false, isHovered: false }), MockCopyButton)).toHaveLength(0);
    expect(findByType(renderLH({ folded: true, isHovered: true }), MockCopyButton)).toHaveLength(0);
  });

  it('forwards onCopyAll to CopyButton', () => {
    const cp = vi.fn();
    const tree = renderLH({ folded: false, isHovered: true, onCopyAll: cp });
    const btn = findByType(tree, MockCopyButton)[0];
    expect((btn.props as { onClick: () => void }).onClick).toBe(cp);
  });

  it('always renders FoldButton', () => {
    expect(findByType(renderLH({ folded: false }), MockFoldButton)).toHaveLength(1);
    expect(findByType(renderLH({ folded: true }), MockFoldButton)).toHaveLength(1);
  });

  it('FoldButton folded={folded} pass-through', () => {
    const f = renderLH({ folded: true });
    const u = renderLH({ folded: false });
    expect((findByType(f, MockFoldButton)[0].props as { folded: boolean }).folded).toBe(true);
    expect((findByType(u, MockFoldButton)[0].props as { folded: boolean }).folded).toBe(false);
  });

  it('FoldButton opacity 0.8 when hovered, 0.5 otherwise', () => {
    const hov = renderLH({ isHovered: true });
    const idle = renderLH({ isHovered: false });
    expect((findByType(hov, MockFoldButton)[0].props as { opacity: number }).opacity).toBe(0.8);
    expect((findByType(idle, MockFoldButton)[0].props as { opacity: number }).opacity).toBe(0.5);
  });

  it('FoldButton onClick = onToggleFold', () => {
    const fold = vi.fn();
    const tree = renderLH({ onToggleFold: fold });
    const btn = findByType(tree, MockFoldButton)[0];
    expect((btn.props as { onClick: () => void }).onClick).toBe(fold);
  });
});
