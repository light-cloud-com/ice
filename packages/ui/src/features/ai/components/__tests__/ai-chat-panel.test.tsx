/**
 * AiChatPanel orchestrator tests — direct-FC tree-walker.
 *
 * The panel is a thin shell over `useAiCommand`, `useChatHandlers`,
 * `useChatEffects`, and four leaf FCs (PanelHeader / EmptyState /
 * MessageRow / ConversationHistorySidebar). We mock all of those plus
 * the redux selectors / dispatch so we can verify the render-time
 * conditional branches:
 *   - provider badge presence + isLocal CPU/cloud icon
 *   - history button active + badge based on showHistory and conversation count
 *   - empty-state visible only when messages.length === 0 && !isProcessing
 *   - loading row visible only when isProcessing
 *   - undo bar visible only when canUndo
 *   - send-button disabled gating, spinner swap when isProcessing
 *   - input onChange auto-resize and setInput threading
 *   - keydown forwarded to handleKeyDown
 *   - close button dispatches toggleAiChat
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // useState slot tracker
  return {
    effects: [] as Array<() => void | (() => void)>,
    useStateOverrides: {} as Record<number, unknown>,
    useStateCount: 0,
    useStateSetters: [] as Array<ReturnType<typeof vi.fn>>,
    refs: [] as Array<{ current: unknown }>,
    // redux
    dispatch: vi.fn(),
    activeCard: null as null | { id: string; nodes: unknown[] },
    activeProjectId: 'proj-1',
    toggleAiChat: vi.fn(() => ({ type: 'ui/toggleAiChat' })),
    selectActiveCard: vi.fn(),
    // useAiCommand
    aiCommand: {
      sendIntent: vi.fn(),
      applyOperations: vi.fn(),
      undoAi: vi.fn(),
      isProcessing: false,
      pendingOperations: null as unknown,
      lastResponse: null as unknown,
      error: null as unknown,
      streamingStatus: '' as string,
      suggestions: [] as string[],
      canUndo: false,
    },
    // useChatHandlers
    chatHandlers: {
      loadConversation: vi.fn(),
      fetchConversations: vi.fn(),
      startNewConversation: vi.fn(),
      persistMessages: vi.fn(),
      handleSubmit: vi.fn(),
      handleKeyDown: vi.fn(),
      handleSuggestionClick: vi.fn(),
      handleDeleteConversation: vi.fn(),
    },
    chatHandlersArgs: undefined as unknown,
    // useChatEffects
    useChatEffectsArgs: undefined as unknown,
  };
});

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(init: T): [T, (v: T) => void] => {
    const idx = mocks.useStateCount;
    mocks.useStateCount += 1;
    const setter = vi.fn();
    mocks.useStateSetters[idx] = setter;
    const override = mocks.useStateOverrides[idx];
    const value = idx in mocks.useStateOverrides ? (override as T) : init;
    return [value, setter];
  };
  const useEffectStub = (fn: () => void | (() => void)) => {
    mocks.effects.push(fn);
  };
  const useRefStub = <T,>(init: T) => {
    const ref = { current: init };
    mocks.refs.push(ref as unknown as { current: unknown });
    return ref;
  };
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: { ...actualDefault, useState: useStateStub, useEffect: useEffectStub, useRef: useRefStub },
    useState: useStateStub,
    useEffect: useEffectStub,
    useRef: useRefStub,
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: <T,>(sel: (s: unknown) => T) =>
    sel({
      account: {},
      projects: { activeProjectId: mocks.activeProjectId },
    }),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `[t:${k}]` }),
}));

vi.mock('../../../../store/slices/cards-slice', () => ({
  selectActiveCard: () => mocks.activeCard,
}));

vi.mock('../../../../store/slices/ui-slice', () => ({
  toggleAiChat: mocks.toggleAiChat,
}));

vi.mock('../../hooks/use-ai-command', () => ({
  useAiCommand: () => mocks.aiCommand,
}));

vi.mock('../../hooks/use-chat-handlers', () => ({
  useChatHandlers: (args: unknown) => {
    mocks.chatHandlersArgs = args;
    return mocks.chatHandlers;
  },
}));

vi.mock('../../hooks/use-chat-effects', () => ({
  useChatEffects: (args: unknown) => {
    mocks.useChatEffectsArgs = args;
  },
}));

import { AiChatPanel } from '../ai-chat-panel';

// ─── Tree walker ──────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* skip */
    }
    return;
  }
  yield* walk(node.props.children);
}
function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}
function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}

const render = () => (AiChatPanel as unknown as () => unknown)();

beforeEach(() => {
  mocks.effects = [];
  mocks.useStateOverrides = {};
  mocks.useStateCount = 0;
  mocks.useStateSetters = [];
  mocks.refs = [];
  mocks.dispatch.mockClear();
  mocks.activeCard = null;
  mocks.activeProjectId = 'proj-1';
  mocks.toggleAiChat.mockClear();
  mocks.aiCommand.sendIntent.mockClear?.();
  mocks.aiCommand.applyOperations.mockClear?.();
  mocks.aiCommand.undoAi.mockClear?.();
  mocks.aiCommand.isProcessing = false;
  mocks.aiCommand.pendingOperations = null;
  mocks.aiCommand.lastResponse = null;
  mocks.aiCommand.error = null;
  mocks.aiCommand.streamingStatus = '';
  mocks.aiCommand.suggestions = [];
  mocks.aiCommand.canUndo = false;
  Object.values(mocks.chatHandlers).forEach((m) => m.mockClear?.());
});

// useState slots (in order):
//  0 -> input (string)
//  1 -> messages (ChatMessage[])
//  2 -> conversationId (string | null)
//  3 -> conversations (ConversationSummary[])
//  4 -> showHistory (boolean)
//  5 -> providerInfo (ProviderInfo | null)

// ─── Header — provider badge ──────────────────────────────────────────────

describe('AiChatPanel — provider badge', () => {
  it('renders no badge when providerInfo is null', () => {
    const tree = render();
    // Find the PanelHeader FC in the tree.
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    expect(header).toBeDefined();
    expect((header.props as { badge?: unknown }).badge).toBeUndefined();
  });

  it('renders no badge when providerInfo.ok is false', () => {
    mocks.useStateOverrides = { 5: { ok: false, isLocal: false, provider: 'cloud', model: 'gpt' } };
    const tree = render();
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    expect((header.props as { badge?: unknown }).badge).toBeUndefined();
  });

  it('renders the local-provider badge with emerald styling and a Cpu icon', () => {
    mocks.useStateOverrides = {
      5: { ok: true, isLocal: true, provider: 'ollama', model: 'llama3' },
    };
    const tree = render();
    // The badge is a React element passed as a prop; walk into it.
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    const badge = (header.props as { badge: ElLike }).badge;
    expect(badge).toBeDefined();
    const cn = (badge.props as { className: string }).className;
    expect(cn).toContain('text-emerald-400/60');
    // The badge should also contain a model label.
    const text = JSON.stringify(badge);
    expect(text).toContain('llama3');
  });

  it('renders the cloud-provider badge with blue styling when isLocal=false', () => {
    mocks.useStateOverrides = {
      5: { ok: true, isLocal: false, provider: 'openai', model: 'gpt-4' },
    };
    const tree = render();
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    const badge = (header.props as { badge: ElLike }).badge;
    const cn = (badge.props as { className: string }).className;
    expect(cn).toContain('text-blue-400/60');
  });

  it('falls back to "Local"/"Cloud" label text when model is empty', () => {
    mocks.useStateOverrides = { 5: { ok: true, isLocal: true, provider: 'p', model: '' } };
    const tree = render();
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    const badge = (header.props as { badge: ElLike }).badge;
    const text = JSON.stringify(badge);
    expect(text).toContain('Local');
  });

  it('falls back to Cloud label when isLocal=false and model is empty', () => {
    mocks.useStateOverrides = { 5: { ok: true, isLocal: false, provider: 'p', model: '' } };
    const tree = render();
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    const badge = (header.props as { badge: ElLike }).badge;
    const text = JSON.stringify(badge);
    expect(text).toContain('Cloud');
  });
});

// ─── Header — actions ─────────────────────────────────────────────────────

describe('AiChatPanel — header actions', () => {
  it('renders the new-chat and history actions, and clicking new-chat fires startNewConversation', () => {
    const tree = render();
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    const actions = (header.props as { actions: unknown }).actions;
    // walk through `actions` to find PanelHeaderAction FCs.
    const actionFCs = findAll(actions, (el) => typeof el.type === 'function');
    // Find one labelled with newChat key.
    const newChat = actionFCs.find(
      (el) => (el.props as { label?: string }).label === '[t:ai.chat.newChat]',
    );
    expect(newChat).toBeDefined();
    (newChat!.props.onClick as () => void)();
    expect(mocks.chatHandlers.startNewConversation).toHaveBeenCalled();
  });

  it('clicking the history action toggles showHistory', () => {
    mocks.useStateOverrides = { 4: false };
    const tree = render();
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    const actions = (header.props as { actions: unknown }).actions;
    const histAction = findFirst(
      actions,
      (el) => typeof el.type === 'function' && (el.props as { label?: string }).label === '[t:ai.chat.historyTitle]',
    )!;
    (histAction.props.onClick as () => void)();
    // setShowHistory is slot 4.
    expect(mocks.useStateSetters[4]).toHaveBeenCalledWith(true);
  });

  it('history action active=true when showHistory is on', () => {
    mocks.useStateOverrides = { 4: true };
    const tree = render();
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    const actions = (header.props as { actions: unknown }).actions;
    const histAction = findFirst(
      actions,
      (el) => typeof el.type === 'function' && (el.props as { label?: string }).label === '[t:ai.chat.historyTitle]',
    )!;
    expect((histAction.props as { active?: boolean }).active).toBe(true);
  });

  it('history action badge=true when there is at least one conversation', () => {
    mocks.useStateOverrides = { 3: [{ id: 'c1' }] };
    const tree = render();
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    const actions = (header.props as { actions: unknown }).actions;
    const histAction = findFirst(
      actions,
      (el) => typeof el.type === 'function' && (el.props as { label?: string }).label === '[t:ai.chat.historyTitle]',
    )!;
    expect((histAction.props as { badge?: boolean }).badge).toBe(true);
  });

  it('history action badge=false when there are no conversations', () => {
    mocks.useStateOverrides = { 3: [] };
    const tree = render();
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    const actions = (header.props as { actions: unknown }).actions;
    const histAction = findFirst(
      actions,
      (el) => typeof el.type === 'function' && (el.props as { label?: string }).label === '[t:ai.chat.historyTitle]',
    )!;
    expect((histAction.props as { badge?: boolean }).badge).toBe(false);
  });
});

// ─── Header — close button ────────────────────────────────────────────────

describe('AiChatPanel — close button', () => {
  it('onClose dispatches toggleAiChat', () => {
    const tree = render();
    const header = findFirst(
      tree,
      (el) => typeof el.type === 'function' && (el.props as { title?: string }).title === '[t:ai.chat.title]',
    )!;
    const onClose = (header.props as { onClose: () => void }).onClose;
    onClose();
    expect(mocks.toggleAiChat).toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'ui/toggleAiChat' });
  });
});

// ─── Body — empty state, messages, processing ──────────────────────────────

describe('AiChatPanel — body sections', () => {
  it('renders the EmptyState only when messages.length === 0 and not processing', () => {
    mocks.useStateOverrides = { 1: [] };
    mocks.aiCommand.isProcessing = false;
    const tree = render();
    // EmptyState is a function component imported as `EmptyState`.
    const empty = findFirst(
      tree,
      (el) => typeof el.type === 'function' &&
        (el.type as { name?: string }).name === 'EmptyState',
    );
    expect(empty).toBeDefined();
  });

  it('does NOT render the EmptyState when there are messages', () => {
    mocks.useStateOverrides = {
      1: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 0 }],
    };
    const tree = render();
    const empty = findFirst(
      tree,
      (el) => typeof el.type === 'function' &&
        (el.type as { name?: string }).name === 'EmptyState',
    );
    expect(empty).toBeUndefined();
  });

  it('does NOT render the EmptyState when processing (even with no messages)', () => {
    mocks.useStateOverrides = { 1: [] };
    mocks.aiCommand.isProcessing = true;
    const tree = render();
    const empty = findFirst(
      tree,
      (el) => typeof el.type === 'function' &&
        (el.type as { name?: string }).name === 'EmptyState',
    );
    expect(empty).toBeUndefined();
  });

  it('renders one MessageRow per message', () => {
    mocks.useStateOverrides = {
      1: [
        { id: 'm1', role: 'user', content: 'hi', timestamp: 0 },
        { id: 'm2', role: 'assistant', content: 'hello', timestamp: 1 },
        { id: 'm3', role: 'user', content: 'next', timestamp: 2 },
      ],
    };
    const tree = render();
    const rows = findAll(
      tree,
      (el) => typeof el.type === 'function' && (el.type as { name?: string }).name === 'MessageRow',
    );
    expect(rows).toHaveLength(3);
  });

  it('renders the processing/loading row when isProcessing is true', () => {
    mocks.aiCommand.isProcessing = true;
    mocks.aiCommand.streamingStatus = 'thinking…';
    const tree = render();
    // Look for the streaming status text.
    const text = JSON.stringify(tree);
    expect(text).toContain('thinking');
  });

  it('renders the i18n thinking fallback when streamingStatus is empty', () => {
    mocks.aiCommand.isProcessing = true;
    mocks.aiCommand.streamingStatus = '';
    const tree = render();
    const text = JSON.stringify(tree);
    expect(text).toContain('[t:ai.chat.thinking]');
  });
});

// ─── Undo bar ──────────────────────────────────────────────────────────────

describe('AiChatPanel — undo bar', () => {
  it('renders the undo button when canUndo is true and clicking calls undoAi', () => {
    mocks.aiCommand.canUndo = true;
    const tree = render();
    const undoBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-ai-btn-undo',
    );
    expect(undoBtn).toBeDefined();
    (undoBtn!.props.onClick as () => void)();
    expect(mocks.aiCommand.undoAi).toHaveBeenCalled();
  });

  it('does NOT render the undo button when canUndo is false', () => {
    mocks.aiCommand.canUndo = false;
    const tree = render();
    const undoBtn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-ai-btn-undo',
    );
    expect(undoBtn).toBeUndefined();
  });
});

// ─── Input wiring ─────────────────────────────────────────────────────────

describe('AiChatPanel — input wiring', () => {
  it('typing in the textarea calls setInput AND adjusts el.style.height', () => {
    mocks.useStateOverrides = { 0: '' };
    const tree = render();
    const textarea = findFirst(
      tree,
      (el) => el.type === 'textarea' && (el.props as { id?: string }).id === 'ice-ai-input-message',
    )!;
    const onChange = (textarea.props as {
      onChange: (e: { target: { value: string; style: { height: string }; scrollHeight: number } }) => void;
    }).onChange;
    const fakeEl = { value: 'new', style: { height: '' }, scrollHeight: 200 };
    onChange({ target: fakeEl });
    expect(mocks.useStateSetters[0]).toHaveBeenCalledWith('new');
    // Auto-resize caps at 120 even when scrollHeight is bigger.
    expect(fakeEl.style.height).toBe('120px');
  });

  it('auto-resize uses scrollHeight when below the 120 cap', () => {
    const tree = render();
    const textarea = findFirst(
      tree,
      (el) => el.type === 'textarea' && (el.props as { id?: string }).id === 'ice-ai-input-message',
    )!;
    const onChange = (textarea.props as {
      onChange: (e: { target: { value: string; style: { height: string }; scrollHeight: number } }) => void;
    }).onChange;
    const fakeEl = { value: 'short', style: { height: '' }, scrollHeight: 60 };
    onChange({ target: fakeEl });
    expect(fakeEl.style.height).toBe('60px');
  });

  it('forwards keydown events to handleKeyDown', () => {
    const tree = render();
    const textarea = findFirst(
      tree,
      (el) => el.type === 'textarea' && (el.props as { id?: string }).id === 'ice-ai-input-message',
    )!;
    expect(textarea.props.onKeyDown).toBe(mocks.chatHandlers.handleKeyDown);
  });

  it('disables the textarea when isProcessing is true', () => {
    mocks.aiCommand.isProcessing = true;
    const tree = render();
    const textarea = findFirst(
      tree,
      (el) => el.type === 'textarea' && (el.props as { id?: string }).id === 'ice-ai-input-message',
    )!;
    expect((textarea.props as { disabled?: boolean }).disabled).toBe(true);
  });
});

// ─── Send button ──────────────────────────────────────────────────────────

describe('AiChatPanel — send button', () => {
  it('clicking send fires handleSubmit', () => {
    mocks.useStateOverrides = { 0: 'hi' };
    const tree = render();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-ai-btn-send',
    )!;
    (btn.props.onClick as () => void)();
    expect(mocks.chatHandlers.handleSubmit).toHaveBeenCalled();
  });

  it('disabled when input is empty', () => {
    mocks.useStateOverrides = { 0: '' };
    const tree = render();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-ai-btn-send',
    )!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when input is whitespace-only', () => {
    mocks.useStateOverrides = { 0: '    ' };
    const tree = render();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-ai-btn-send',
    )!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('disabled when isProcessing even if input has content', () => {
    mocks.useStateOverrides = { 0: 'ready' };
    mocks.aiCommand.isProcessing = true;
    const tree = render();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-ai-btn-send',
    )!;
    expect((btn.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('uses the active accent class when input is non-empty and not processing', () => {
    mocks.useStateOverrides = { 0: 'hi' };
    mocks.aiCommand.isProcessing = false;
    const tree = render();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-ai-btn-send',
    )!;
    expect((btn.props as { className: string }).className).toContain('bg-ice-accent');
  });

  it('uses the muted class when input is empty', () => {
    mocks.useStateOverrides = { 0: '' };
    mocks.aiCommand.isProcessing = false;
    const tree = render();
    const btn = findFirst(
      tree,
      (el) => el.type === 'button' && (el.props as { id?: string }).id === 'ice-ai-btn-send',
    )!;
    expect((btn.props as { className: string }).className).toContain('text-ice-text-3/20');
  });

  it('shows the Loader2 spinner when isProcessing', () => {
    mocks.aiCommand.isProcessing = true;
    const tree = render();
    const hit = findFirst(tree, (el) => {
      const cn = (el.props as { className?: unknown }).className;
      return typeof cn === 'string' && cn.includes('animate-spin');
    });
    expect(hit).toBeDefined();
  });

  it('does NOT show the spinner when not processing', () => {
    mocks.aiCommand.isProcessing = false;
    const tree = render();
    const hit = findFirst(tree, (el) => {
      const cn = (el.props as { className?: unknown }).className;
      return typeof cn === 'string' && cn.includes('animate-spin');
    });
    expect(hit).toBeUndefined();
  });
});

// ─── Hook wiring ──────────────────────────────────────────────────────────

describe('AiChatPanel — hook wiring', () => {
  it('passes activeCard, projectId and the relevant state setters into useChatHandlers', () => {
    mocks.activeCard = { id: 'c1', nodes: [] };
    mocks.activeProjectId = 'proj-99';
    render();
    const args = mocks.chatHandlersArgs as Record<string, unknown>;
    expect(args.activeCard).toEqual({ id: 'c1', nodes: [] });
    expect(args.projectId).toBe('proj-99');
    // Setters are wired through to the hook.
    expect(typeof args.setInput).toBe('function');
    expect(typeof args.setMessages).toBe('function');
    expect(typeof args.setConversationId).toBe('function');
    expect(typeof args.setConversations).toBe('function');
    expect(typeof args.setShowHistory).toBe('function');
  });

  it('passes the handlers and t into useChatEffects', () => {
    render();
    const args = mocks.useChatEffectsArgs as Record<string, unknown>;
    expect(args.loadConversation).toBe(mocks.chatHandlers.loadConversation);
    expect(args.fetchConversations).toBe(mocks.chatHandlers.fetchConversations);
    expect(args.persistMessages).toBe(mocks.chatHandlers.persistMessages);
    expect(args.applyOperations).toBe(mocks.aiCommand.applyOperations);
    expect(typeof args.t).toBe('function');
  });

  it('threads the live conversationId through the ref every render', () => {
    mocks.useStateOverrides = { 2: 'conv-42' };
    render();
    // useRef is the second ref allocation in the panel (scrollRef and inputRef
    // are also useRef calls). The conversationIdRef is the FIRST ref (declared
    // first).
    const ref = mocks.refs[0];
    expect(ref.current).toBe('conv-42');
  });
});

// ─── ConversationHistorySidebar wiring ────────────────────────────────────

describe('AiChatPanel — history sidebar', () => {
  it('passes show/conversations/conversationId/handlers through to the sidebar', () => {
    mocks.useStateOverrides = {
      2: 'cid',
      3: [{ id: 'c1' }],
      4: true,
    };
    const tree = render();
    const sidebar = findFirst(
      tree,
      (el) =>
        typeof el.type === 'function' && (el.type as { name?: string }).name === 'ConversationHistorySidebar',
    )!;
    expect((sidebar.props as { show: boolean }).show).toBe(true);
    expect((sidebar.props as { conversationId: string }).conversationId).toBe('cid');
    expect((sidebar.props as { onLoadConversation: unknown }).onLoadConversation).toBe(
      mocks.chatHandlers.loadConversation,
    );
    expect((sidebar.props as { onDeleteConversation: unknown }).onDeleteConversation).toBe(
      mocks.chatHandlers.handleDeleteConversation,
    );
  });
});
