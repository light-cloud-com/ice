/**
 * rf-aichat-6 — ConversationHistorySidebar.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 pattern).
 * Plain FC — no React.memo unwrap needed.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  ConversationHistorySidebar,
  type ConversationHistorySidebarProps,
} from '../conversation-history-sidebar';
import type { ConversationSummary } from '../../hooks/use-chat-handlers';

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
    else if (typeof c === 'number') s += String(c);
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
        else if (typeof item === 'number') s += String(item);
      }
    }
  }
  return s;
}

const t = (k: string) => `[t:${k}]`;

const mkConv = (overrides: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: 'c-1',
  title: 'My Conversation',
  card_id: null,
  created_at: '2026-04-30T14:00:00Z',
  updated_at: '2026-04-30T14:00:00Z',
  _count: { messages: 4 },
  ...overrides,
});

function render(
  props: Partial<ConversationHistorySidebarProps> & { conversations?: ConversationSummary[] },
): React.ReactNode {
  const fullProps: ConversationHistorySidebarProps = {
    show: props.show ?? true,
    conversations: props.conversations ?? [],
    conversationId: props.conversationId ?? null,
    t: props.t ?? t,
    onLoadConversation: props.onLoadConversation ?? vi.fn(),
    onDeleteConversation: props.onDeleteConversation ?? vi.fn(),
  };
  return ConversationHistorySidebar(fullProps);
}

// ─── Visibility ───────────────────────────────────────────────────────────

describe('ConversationHistorySidebar — visibility', () => {
  it('show=false → returns null', () => {
    const tree = render({ show: false, conversations: [mkConv()] });
    expect(tree).toBeNull();
  });

  it('show=true with empty conversations → renders empty-state copy', () => {
    const tree = render({ show: true, conversations: [] });
    const text = collectText(tree);
    expect(text).toContain('[t:ai.chat.noConversations]');
  });
});

// ─── Conversation rows ────────────────────────────────────────────────────

describe('ConversationHistorySidebar — rows', () => {
  it('renders one row per conversation with title + count + timestamp', () => {
    const tree = render({
      conversations: [mkConv({ id: 'c-A', title: 'First Chat' }), mkConv({ id: 'c-B', title: 'Second' })],
    });
    const rows = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'string' &&
        (el.props as { role?: string }).role === 'button' &&
        (el.props as { tabIndex?: number }).tabIndex === 0,
    );
    expect(rows).toHaveLength(2);

    const text = collectText(tree);
    expect(text).toContain('First Chat');
    expect(text).toContain('Second');
    expect(text).toContain('[t:ai.chat.msgs]');
    // Both rows had _count.messages = 4
    expect(text).toContain('4');
  });

  it('falls back to "untitledConversation" key when title is null', () => {
    const tree = render({
      conversations: [mkConv({ title: null })],
    });
    const text = collectText(tree);
    expect(text).toContain('[t:ai.chat.untitledConversation]');
  });

  it('falls back to "untitledConversation" key when title is empty string', () => {
    const tree = render({
      conversations: [mkConv({ title: '' })],
    });
    const text = collectText(tree);
    expect(text).toContain('[t:ai.chat.untitledConversation]');
  });

  it('active conversation highlight: matching id → text-ice-text-1', () => {
    const tree = render({
      conversations: [mkConv({ id: 'active' }), mkConv({ id: 'inactive' })],
      conversationId: 'active',
    });
    const rows = findByPredicate(
      tree,
      (el) => typeof el.type === 'string' && (el.props as { role?: string }).role === 'button',
    );
    expect((rows[0].props as { className: string }).className).toContain('text-ice-text-1');
    expect((rows[1].props as { className: string }).className).toContain('text-ice-text-3');
  });
});

// ─── Click + keyboard interactions ────────────────────────────────────────

describe('ConversationHistorySidebar — interactions', () => {
  it('onClick fires onLoadConversation with the conv id', () => {
    const onLoadConversation = vi.fn();
    const tree = render({
      conversations: [mkConv({ id: 'pick-me' })],
      onLoadConversation,
    });
    const rows = findByPredicate(
      tree,
      (el) => typeof el.type === 'string' && (el.props as { role?: string }).role === 'button',
    );
    const onClick = (rows[0].props as { onClick: () => void }).onClick;
    onClick();
    expect(onLoadConversation).toHaveBeenCalledWith('pick-me');
  });

  it('Enter key fires onLoadConversation', () => {
    const onLoadConversation = vi.fn();
    const tree = render({
      conversations: [mkConv({ id: 'kbd' })],
      onLoadConversation,
    });
    const rows = findByPredicate(
      tree,
      (el) => typeof el.type === 'string' && (el.props as { role?: string }).role === 'button',
    );
    const onKeyDown = (rows[0].props as { onKeyDown: (e: React.KeyboardEvent) => void }).onKeyDown;

    onKeyDown({ key: 'Enter' } as unknown as React.KeyboardEvent);
    expect(onLoadConversation).toHaveBeenCalledWith('kbd');
  });

  it('non-Enter key does NOT fire onLoadConversation', () => {
    const onLoadConversation = vi.fn();
    const tree = render({
      conversations: [mkConv()],
      onLoadConversation,
    });
    const rows = findByPredicate(
      tree,
      (el) => typeof el.type === 'string' && (el.props as { role?: string }).role === 'button',
    );
    const onKeyDown = (rows[0].props as { onKeyDown: (e: React.KeyboardEvent) => void }).onKeyDown;

    onKeyDown({ key: 'Escape' } as unknown as React.KeyboardEvent);
    onKeyDown({ key: 'a' } as unknown as React.KeyboardEvent);
    expect(onLoadConversation).not.toHaveBeenCalled();
  });

  it('delete button fires onDeleteConversation with id + event', () => {
    const onDeleteConversation = vi.fn();
    const tree = render({
      conversations: [mkConv({ id: 'victim' })],
      onDeleteConversation,
    });
    const deleteButtons = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        (el.props as { 'aria-label'?: string })['aria-label'] === '[t:ai.chat.deleteTitle]',
    );
    expect(deleteButtons).toHaveLength(1);
    const onClick = (deleteButtons[0].props as { onClick: (e: React.MouseEvent) => void }).onClick;
    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    onClick(fakeEvent);
    expect(onDeleteConversation).toHaveBeenCalledWith('victim', fakeEvent);
  });
});
