/**
 * rf-aichat-7 — EmptyState (pre-conversation hint card).
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 pattern).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { EmptyState, type EmptyStateProps } from '../empty-state';
import type { Card } from '../../../../store/slices/cards-slice';

// Mock suggestPatterns so tests don't depend on the real implementation.
vi.mock('../../utils/suggest-patterns', () => ({
  suggestPatterns: (nodes: unknown[]) =>
    nodes.length === 0
      ? [
          { label: 'Web app', intent: 'Build a web app' },
          { label: 'API', intent: 'Build an API' },
        ]
      : [{ label: 'Add cache', intent: 'Add a cache layer' }],
}));

// ─── Tree-walker helpers ──────────────────────────────────────────────────

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
  let s = '';
  for (const el of walk(tree)) {
    const c = (el.props as { children?: React.ReactNode } | undefined)?.children;
    if (typeof c === 'string') s += c;
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
      }
    }
  }
  return s;
}

const t = (k: string) => `[t:${k}]`;

const EMPTY_CARD: Card = {
  id: 'card-empty',
  name: 'Empty',
  nodes: [],
  edges: [],
  viewport: { panX: 0, panY: 0, scale: 1 },
  createdAt: 0,
};

const POPULATED_CARD: Card = {
  ...EMPTY_CARD,
  id: 'card-populated',
  nodes: [
    { id: 'n1', type: 'resource', position: { x: 0, y: 0 }, width: 1, height: 1, data: {} },
  ],
};

function render(props: Partial<EmptyStateProps> & { activeCard: EmptyStateProps['activeCard'] }) {
  const fullProps: EmptyStateProps = {
    activeCard: props.activeCard,
    t: props.t ?? t,
    onSuggestionClick: props.onSuggestionClick ?? vi.fn(),
  };
  return EmptyState(fullProps) as React.ReactElement;
}

// ─── Prompt selection by canvas state ─────────────────────────────────────

describe('EmptyState — prompt selection', () => {
  it('empty canvas → emptyCanvasPrompt key', () => {
    const tree = render({ activeCard: EMPTY_CARD });
    const text = collectText(tree);
    expect(text).toContain('[t:ai.chat.emptyCanvasPrompt]');
    expect(text).not.toContain('[t:ai.chat.existingCanvasPrompt]');
  });

  it('populated canvas → existingCanvasPrompt key', () => {
    const tree = render({ activeCard: POPULATED_CARD });
    const text = collectText(tree);
    expect(text).toContain('[t:ai.chat.existingCanvasPrompt]');
    expect(text).not.toContain('[t:ai.chat.emptyCanvasPrompt]');
  });

  it('null activeCard → treated as empty (emptyCanvasPrompt)', () => {
    const tree = render({ activeCard: null });
    const text = collectText(tree);
    expect(text).toContain('[t:ai.chat.emptyCanvasPrompt]');
  });
});

// ─── Suggestion buttons ───────────────────────────────────────────────────

describe('EmptyState — suggestion buttons', () => {
  it('renders one button per suggested pattern', () => {
    const tree = render({ activeCard: EMPTY_CARD });
    const buttons = findByPredicate(
      tree,
      (el) => el.type === 'button',
    );
    expect(buttons).toHaveLength(2);
    const text = collectText(tree);
    expect(text).toContain('Web app');
    expect(text).toContain('API');
  });

  it('clicking a suggestion fires onSuggestionClick with the intent (NOT label)', () => {
    const onSuggestionClick = vi.fn();
    const tree = render({ activeCard: EMPTY_CARD, onSuggestionClick });
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    const onClick = (buttons[0].props as { onClick: () => void }).onClick;
    onClick();
    expect(onSuggestionClick).toHaveBeenCalledWith('Build a web app');
  });

  it('populated canvas → only the contextual pattern is shown', () => {
    const tree = render({ activeCard: POPULATED_CARD });
    const text = collectText(tree);
    expect(text).toContain('Add cache');
    // The empty-canvas options must NOT show.
    expect(text).not.toContain('Web app');
  });
});
