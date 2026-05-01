/**
 * rf-aichat-5 — MessageRow.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 pattern). The
 * component is a plain FC — no React.memo wrapper — so it can be invoked
 * directly without the `.type` unwrap.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { MessageRow, type MessageRowProps } from '../message-row';
import type { ChatMessage } from '../../hooks/use-chat-handlers';

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

function render(props: Partial<MessageRowProps> & { msg: ChatMessage }): React.ReactElement {
  const fullProps: MessageRowProps = {
    msg: props.msg,
    t: props.t ?? t,
    onSuggestionClick: props.onSuggestionClick ?? vi.fn(),
  };
  return MessageRow(fullProps) as React.ReactElement;
}

// ─── User vs assistant alignment ─────────────────────────────────────────

describe('MessageRow — alignment', () => {
  it('user role → outer div has justify-end class', () => {
    const tree = render({
      msg: { id: '1', role: 'user', content: 'hi', timestamp: 0 },
    });
    expect((tree.props as { className?: string }).className).toContain('justify-end');
    expect((tree.props as { className?: string }).className).not.toContain('justify-start');
  });

  it('assistant role → outer div has justify-start class', () => {
    const tree = render({
      msg: { id: '1', role: 'assistant', content: 'hi', timestamp: 0 },
    });
    expect((tree.props as { className?: string }).className).toContain('justify-start');
  });

  it('user role → bubble has bg-ice-accent class (sent style)', () => {
    const tree = render({
      msg: { id: '1', role: 'user', content: 'hi', timestamp: 0 },
    });
    // Find the inner bubble div (max-w-[85%])
    const bubble = findByPredicate(
      tree,
      (el) => typeof el.type === 'string' && (el.props as { className?: string }).className?.includes('max-w-[85%]') === true,
    );
    expect(bubble.length).toBe(1);
    expect((bubble[0].props as { className: string }).className).toContain('bg-ice-accent');
  });

  it('assistant role → bubble has white/[0.07] background (received style)', () => {
    const tree = render({
      msg: { id: '1', role: 'assistant', content: 'hi', timestamp: 0 },
    });
    const bubble = findByPredicate(
      tree,
      (el) => typeof el.type === 'string' && (el.props as { className?: string }).className?.includes('max-w-[85%]') === true,
    );
    expect((bubble[0].props as { className: string }).className).toContain('bg-white/[0.07]');
  });
});

// ─── Plain text vs AI_NOT_CONFIGURED card ─────────────────────────────────

describe('MessageRow — content rendering', () => {
  it('plain content → renders <p> with the message text', () => {
    const tree = render({
      msg: { id: '1', role: 'assistant', content: 'hello world', timestamp: 0 },
    });
    const text = collectText(tree);
    expect(text).toContain('hello world');
  });

  it('AI_NOT_CONFIGURED prefix → renders the setup hint card with 4 numbered options', () => {
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'AI_NOT_CONFIGURED:',
        timestamp: 0,
      },
    });
    const text = collectText(tree);
    expect(text).toContain('AI Not Available');
    expect(text).toContain('No AI provider is running');
    expect(text).toContain('1.');
    expect(text).toContain('2.');
    expect(text).toContain('3.');
    expect(text).toContain('4.');
    expect(text).toContain('ANTHROPIC_API_KEY');
    expect(text).toContain('ICE_AI_URL');
    expect(text).toContain('Restart the server');
  });
});

// ─── Applied operations preview ───────────────────────────────────────────

describe('MessageRow — applied operations preview', () => {
  it('not applied → no operations preview rendered', () => {
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        applied: false,
        operations: [{ op: 'autoOrganize' }],
      },
    });
    const text = collectText(tree);
    expect(text).not.toContain('Reorganize layout');
  });

  it('applied + operations.length === 0 → no preview', () => {
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        applied: true,
        operations: [],
      },
    });
    const text = collectText(tree);
    // Note: applied confirmation still renders, but operation rows do not.
    expect(text).not.toContain('Reorganize layout');
  });

  it('applied + operations → renders summary rows for each op (up to 5)', () => {
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        applied: true,
        operations: [
          { op: 'addBlueprint', iceType: 'Database.PostgreSQL', label: 'My DB' },
          { op: 'addEdge', edge: { id: 'e', source: 'a', target: 'b' } },
          { op: 'deleteNode', nodeId: 'n9' },
        ],
      },
    });
    const text = collectText(tree);
    expect(text).toContain('Add My DB');
    expect(text).toContain('Connect a → b');
    expect(text).toContain('Remove n9');
  });

  it('badge prefix: + for add, × for delete, ~ for everything else', () => {
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        applied: true,
        operations: [
          { op: 'addBlueprint', iceType: 't' },
          { op: 'deleteNode', nodeId: 'n' },
          { op: 'autoOrganize' },
        ],
      },
    });
    const text = collectText(tree);
    expect(text).toContain('+');
    expect(text).toContain('×');
    expect(text).toContain('~');
  });

  it('caps preview at 5 ops and shows "+N more" overflow line', () => {
    const ops = Array.from({ length: 8 }, () => ({ op: 'autoOrganize' as const }));
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        applied: true,
        operations: ops,
      },
    });
    const text = collectText(tree);
    expect(text).toContain('3'); // 8 - 5 = 3
    expect(text).toContain('[t:ai.chat.more]');
  });

  it('exactly 5 ops → no overflow line', () => {
    const ops = Array.from({ length: 5 }, () => ({ op: 'autoOrganize' as const }));
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        applied: true,
        operations: ops,
      },
    });
    const text = collectText(tree);
    expect(text).not.toContain('[t:ai.chat.more]');
  });
});

// ─── Applied confirmation ────────────────────────────────────────────────

describe('MessageRow — applied confirmation', () => {
  it('applied → renders the t("ai.chat.appliedChanges") + count + t("ai.chat.changes")', () => {
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        applied: true,
        operationCount: 7,
      },
    });
    const text = collectText(tree);
    expect(text).toContain('[t:ai.chat.appliedChanges]');
    expect(text).toContain('7');
    expect(text).toContain('[t:ai.chat.changes]');
  });

  it('count fallback: operationCount → operations.length → 0', () => {
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        applied: true,
        operations: [{ op: 'autoOrganize' }, { op: 'autoOrganize' }],
      },
    });
    const text = collectText(tree);
    expect(text).toContain('2');
  });

  it('count falls all the way to 0 when neither operationCount nor operations is set', () => {
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        applied: true,
      },
    });
    const text = collectText(tree);
    expect(text).toContain('0');
  });

  it('not applied → no confirmation row', () => {
    const tree = render({
      msg: { id: '1', role: 'assistant', content: 'X', timestamp: 0, applied: false },
    });
    const text = collectText(tree);
    expect(text).not.toContain('[t:ai.chat.appliedChanges]');
  });
});

// ─── Suggestions ──────────────────────────────────────────────────────────

describe('MessageRow — suggestions', () => {
  it('renders one button per suggestion with the verbatim label', () => {
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        suggestions: ['Try A', 'Try B'],
      },
    });
    const text = collectText(tree);
    expect(text).toContain('Try A');
    expect(text).toContain('Try B');
  });

  it('clicking a suggestion calls onSuggestionClick with the label', () => {
    const onSuggestionClick = vi.fn();
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        suggestions: ['Add cache layer'],
      },
      onSuggestionClick,
    });
    const buttons = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('rounded-md') === true,
    );
    expect(buttons.length).toBe(1);
    const onClick = (buttons[0].props as { onClick: () => void }).onClick;
    onClick();
    expect(onSuggestionClick).toHaveBeenCalledWith('Add cache layer');
  });

  it('empty suggestions array → no button row rendered', () => {
    const tree = render({
      msg: {
        id: '1',
        role: 'assistant',
        content: 'X',
        timestamp: 0,
        suggestions: [],
      },
    });
    const buttons = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('rounded-md') === true,
    );
    expect(buttons).toHaveLength(0);
  });

  it('undefined suggestions → no button row rendered', () => {
    const tree = render({
      msg: { id: '1', role: 'assistant', content: 'X', timestamp: 0 },
    });
    const buttons = findByPredicate(
      tree,
      (el) => el.type === 'button' && (el.props as { className?: string }).className?.includes('rounded-md') === true,
    );
    expect(buttons).toHaveLength(0);
  });
});
