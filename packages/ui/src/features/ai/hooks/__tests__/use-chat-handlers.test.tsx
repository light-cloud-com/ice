/**
 * rf-aichat-3 — useChatHandlers hook.
 *
 * Eight callback-returning useCallbacks lifted from `ai-chat-panel.tsx`.
 * Tests follow the rf-pdpl-20 capture-ref-after-render pattern: render the
 * hook through a Provider-wrapped Probe, capture the returned object via
 * a ref, then invoke the callbacks directly in async test code so we can
 * drive every branch — including the load-bearing `_persistLock` /
 * `conversationIdRef` interplay (RISK from the rf-aichat blueprint).
 *
 * The redux dispatch typing trick from rf-pdpl-20 applies: `Dispatch<
 * UnknownAction>` types `mock.calls[i][0]` as `UnknownAction`, which has
 * no `.payload` index, so we route through `unknown` → structural shape
 * via the `asAction<P>()` helper. The same applies to `mock.calls[i][0]`
 * spy reads anywhere in this file.
 *
 * Cite (anchors):
 *   - redux-toolkit-unknown-action-payload-needs-double-cast-via-unknown
 *     (rf-pdpl-20)
 */

import React, { useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Microtask flush — equivalent to setImmediate but works in Node + browser.
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── axiosInstance mock ─────────────────────────────────────────────────────
// Use `vi.hoisted` so the mock object is initialised before vi.mock's factory
// runs (it's hoisted to the top of the file, ahead of any const).

const mocks = vi.hoisted(() => ({
  axios: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: mocks.axios,
  getAccessToken: () => 'tok',
}));

const mockAxios = mocks.axios;

// ─── Imports after mocks ────────────────────────────────────────────────────

import aiReducer from '../../../../store/slices/ai-slice';
import cardsReducer, { type Card } from '../../../../store/slices/cards-slice';
import {
  useChatHandlers,
  type ChatMessage,
  type ConversationSummary,
  type UseChatHandlersReturn,
} from '../use-chat-handlers';

// ─── Store + capture helpers ────────────────────────────────────────────────

const makeStore = () =>
  configureStore({
    reducer: {
      ai: aiReducer,
      cards: cardsReducer,
    },
  });

type TestStore = ReturnType<typeof makeStore>;

const ACTIVE_CARD: Card = {
  id: 'card-1',
  name: 'Test card',
  nodes: [],
  edges: [],
  viewport: { panX: 0, panY: 0, scale: 1 },
  createdAt: 0,
};

interface CaptureArgs {
  projectId?: string | null;
  activeCard?: Card | null;
  conversationId?: string | null;
  conversationIdRefInitial?: string | null;
  persistLockRefInitial?: boolean;
  input?: string;
  isProcessing?: boolean;
  sendIntent?: ReturnType<typeof vi.fn>;
  store: TestStore;
}

interface Captured {
  handlers: UseChatHandlersReturn;
  conversationIdRef: React.MutableRefObject<string | null>;
  persistLockRef: React.MutableRefObject<boolean>;
  setMessagesSpy: ReturnType<typeof vi.fn>;
  setConversationIdSpy: ReturnType<typeof vi.fn>;
  setConversationsSpy: ReturnType<typeof vi.fn>;
  setShowHistorySpy: ReturnType<typeof vi.fn>;
  setInputSpy: ReturnType<typeof vi.fn>;
}

function captureHook(args: CaptureArgs): Captured {
  const captured: { current?: Captured } = {};
  const sendIntent = args.sendIntent ?? vi.fn();

  const Probe: React.FC = () => {
    const conversationIdRef = useRef<string | null>(args.conversationIdRefInitial ?? null);
    const persistLockRef = useRef<boolean>(args.persistLockRefInitial ?? false);
    const setMessagesSpy = vi.fn();
    const setConversationIdSpy = vi.fn();
    const setConversationsSpy = vi.fn();
    const setShowHistorySpy = vi.fn();
    const setInputSpy = vi.fn();

    const handlers = useChatHandlers({
      // Distinguish "not passed" (default to proj-1) from "explicitly null".
      projectId: 'projectId' in args ? args.projectId! : 'proj-1',
      activeCard: args.activeCard ?? null,
      conversationId: args.conversationId ?? null,
      conversationIdRef,
      persistLockRef,
      input: args.input ?? '',
      isProcessing: args.isProcessing ?? false,
      sendIntent: sendIntent as unknown as (intent: string) => void | Promise<void>,
      setInput: setInputSpy,
      setMessages: setMessagesSpy,
      setConversationId: setConversationIdSpy,
      setConversations: setConversationsSpy,
      setShowHistory: setShowHistorySpy,
    });

    captured.current = {
      handlers,
      conversationIdRef,
      persistLockRef,
      setMessagesSpy,
      setConversationIdSpy,
      setConversationsSpy,
      setShowHistorySpy,
      setInputSpy,
    };
    return null;
  };

  renderToString(
    <Provider store={args.store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('hook did not render');
  return captured.current;
}

beforeEach(() => {
  mockAxios.get.mockReset();
  mockAxios.post.mockReset();
  mockAxios.delete.mockReset();
});

// ────────────────────────────────────────────────────────────────────────────
// loadConversation
// ────────────────────────────────────────────────────────────────────────────

describe('loadConversation', () => {
  it('GETs /ai/conversations/:id and hydrates messages from API row shape', async () => {
    const store = makeStore();
    mockAxios.get.mockResolvedValueOnce({
      data: {
        id: 'conv-X',
        messages: [
          {
            id: 'm-1',
            role: 'user',
            content: 'hello',
            operations: null,
            operation_count: 0,
            suggestions: null,
            created_at: '2026-04-30T14:00:00Z',
          },
          {
            id: 'm-2',
            role: 'assistant',
            content: 'world',
            operations: [{ op: 'autoOrganize' }],
            operation_count: 3,
            suggestions: ['s1'],
            created_at: '2026-04-30T14:00:01Z',
          },
        ],
      },
    });
    const cap = captureHook({ store });

    await cap.handlers.loadConversation('conv-X');

    expect(mockAxios.get).toHaveBeenCalledWith('/ai/conversations/conv-X');
    expect(cap.setConversationIdSpy).toHaveBeenCalledWith('conv-X');
    expect(cap.setMessagesSpy).toHaveBeenCalledTimes(1);
    const msgs = cap.setMessagesSpy.mock.calls[0][0] as ChatMessage[];
    expect(msgs).toHaveLength(2);
    // user row
    expect(msgs[0].id).toBe('m-1');
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].operations).toBeUndefined();
    expect(msgs[0].operationCount).toBe(0);
    expect(msgs[0].suggestions).toBeUndefined();
    expect(msgs[0].applied).toBe(false); // user → never applied
    expect(typeof msgs[0].timestamp).toBe('number');
    // assistant with ops → applied:true
    expect(msgs[1].id).toBe('m-2');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].applied).toBe(true);
    expect(msgs[1].operationCount).toBe(3);
    expect(msgs[1].suggestions).toEqual(['s1']);
    expect(msgs[1].operations).toEqual([{ op: 'autoOrganize' }]);
    expect(cap.setShowHistorySpy).toHaveBeenCalledWith(false);
  });

  it('assistant message with operation_count = 0 is NOT marked applied', async () => {
    const store = makeStore();
    mockAxios.get.mockResolvedValueOnce({
      data: {
        id: 'conv-Y',
        messages: [
          {
            id: 'm-1',
            role: 'assistant',
            content: 'no-ops',
            operation_count: 0,
            created_at: '2026-04-30T14:00:00Z',
          },
        ],
      },
    });
    const cap = captureHook({ store });

    await cap.handlers.loadConversation('conv-Y');

    const msgs = cap.setMessagesSpy.mock.calls[0][0] as ChatMessage[];
    expect(msgs[0].applied).toBe(false);
  });

  it('silently swallows fetch errors (no throw, no state mutation)', async () => {
    const store = makeStore();
    mockAxios.get.mockRejectedValueOnce(new Error('404'));
    const cap = captureHook({ store });

    await expect(cap.handlers.loadConversation('missing')).resolves.toBeUndefined();
    expect(cap.setConversationIdSpy).not.toHaveBeenCalled();
    expect(cap.setMessagesSpy).not.toHaveBeenCalled();
    expect(cap.setShowHistorySpy).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// fetchConversations
// ────────────────────────────────────────────────────────────────────────────

describe('fetchConversations', () => {
  it('returns undefined and skips fetch when projectId is null', async () => {
    const store = makeStore();
    const cap = captureHook({ projectId: null, store });

    const out = await cap.handlers.fetchConversations();

    expect(out).toBeUndefined();
    expect(mockAxios.get).not.toHaveBeenCalled();
    expect(cap.setConversationsSpy).not.toHaveBeenCalled();
  });

  it('GETs the project-scoped list, sets state, and returns the array', async () => {
    const store = makeStore();
    const list: ConversationSummary[] = [
      {
        id: 'c1',
        title: 'First',
        card_id: 'card-1',
        created_at: '2026-04-30T14:00:00Z',
        updated_at: '2026-04-30T14:00:00Z',
        _count: { messages: 4 },
      },
    ];
    mockAxios.get.mockResolvedValueOnce({ data: list });
    const cap = captureHook({ projectId: 'proj-1', store });

    const out = await cap.handlers.fetchConversations();

    expect(mockAxios.get).toHaveBeenCalledWith('/ai/conversations?projectId=proj-1');
    expect(cap.setConversationsSpy).toHaveBeenCalledWith(list);
    expect(out).toEqual(list);
  });

  it('returns [] on fetch error (no throw, no state mutation)', async () => {
    const store = makeStore();
    mockAxios.get.mockRejectedValueOnce(new Error('500'));
    const cap = captureHook({ projectId: 'proj-1', store });

    const out = await cap.handlers.fetchConversations();

    expect(out).toEqual([]);
    expect(cap.setConversationsSpy).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// startNewConversation
// ────────────────────────────────────────────────────────────────────────────

describe('startNewConversation', () => {
  it('clears messages, conversation id, history; dispatches clearAiState', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const cap = captureHook({ store });
    dispatchSpy.mockClear();

    cap.handlers.startNewConversation();

    expect(cap.setConversationIdSpy).toHaveBeenCalledWith(null);
    expect(cap.setMessagesSpy).toHaveBeenCalledWith([]);
    expect(cap.setShowHistorySpy).toHaveBeenCalledWith(false);
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('ai/clearAiState');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// persistMessages — the most fragile path (RISK)
// ────────────────────────────────────────────────────────────────────────────

describe('persistMessages', () => {
  const baseMsg: ChatMessage = {
    id: 'msg-1',
    role: 'user',
    content: 'hello',
    timestamp: 1,
  };

  it('no-ops when projectId is null', async () => {
    const store = makeStore();
    const cap = captureHook({ projectId: null, store });

    await cap.handlers.persistMessages([baseMsg]);

    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('no-ops when msgs is empty', async () => {
    const store = makeStore();
    const cap = captureHook({ store });

    await cap.handlers.persistMessages([]);

    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('with existing convId in the ref → posts directly to /messages, no conversation create', async () => {
    const store = makeStore();
    mockAxios.post.mockResolvedValueOnce({ data: {} }); // /messages
    mockAxios.get.mockResolvedValueOnce({ data: [] }); // refresh fetchConversations
    const cap = captureHook({ conversationIdRefInitial: 'existing-conv', store });

    await cap.handlers.persistMessages([baseMsg]);

    // Only one POST — to the messages endpoint.
    expect(mockAxios.post).toHaveBeenCalledTimes(1);
    expect(mockAxios.post).toHaveBeenCalledWith('/ai/conversations/existing-conv/messages', {
      messages: [
        {
          role: 'user',
          content: 'hello',
          operations: null,
          operationCount: 0,
          suggestions: null,
        },
      ],
    });
    // conversationIdRef must remain unchanged.
    expect(cap.conversationIdRef.current).toBe('existing-conv');
    expect(cap.setConversationIdSpy).not.toHaveBeenCalled();
    // After /messages succeeds, fetchConversations should refresh the list.
    expect(mockAxios.get).toHaveBeenCalledWith('/ai/conversations?projectId=proj-1');
  });

  it('without convId → creates conversation, mirrors id into ref, then posts messages', async () => {
    const store = makeStore();
    mockAxios.post
      .mockResolvedValueOnce({ data: { id: 'fresh-conv' } }) // POST /ai/conversations
      .mockResolvedValueOnce({ data: {} }); // POST /ai/conversations/fresh-conv/messages
    mockAxios.get.mockResolvedValueOnce({ data: [] }); // refresh
    const cap = captureHook({ activeCard: ACTIVE_CARD, store });

    await cap.handlers.persistMessages([baseMsg]);

    // First POST creates the conversation row with project + card linkage.
    expect(mockAxios.post.mock.calls[0]).toEqual([
      '/ai/conversations',
      { projectId: 'proj-1', cardId: 'card-1' },
    ]);
    // Ref + state both updated to the freshly-minted id.
    expect(cap.conversationIdRef.current).toBe('fresh-conv');
    expect(cap.setConversationIdSpy).toHaveBeenCalledWith('fresh-conv');
    // Second POST appends messages to the fresh id.
    expect(mockAxios.post.mock.calls[1][0]).toBe('/ai/conversations/fresh-conv/messages');
    // Lock released after the create finishes.
    expect(cap.persistLockRef.current).toBe(false);
  });

  it('without convId + no active card → posts cardId: null', async () => {
    const store = makeStore();
    mockAxios.post
      .mockResolvedValueOnce({ data: { id: 'fresh-conv' } })
      .mockResolvedValueOnce({ data: {} });
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const cap = captureHook({ activeCard: null, store });

    await cap.handlers.persistMessages([baseMsg]);

    expect(mockAxios.post.mock.calls[0]).toEqual([
      '/ai/conversations',
      { projectId: 'proj-1', cardId: null },
    ]);
  });

  it('persistLock guard: when lock is true on entry and convId is null → bails out', async () => {
    const store = makeStore();
    const cap = captureHook({ persistLockRefInitial: true, store });

    await cap.handlers.persistMessages([baseMsg]);

    expect(mockAxios.post).not.toHaveBeenCalled();
    // Lock left as-is (caller's invariant).
    expect(cap.persistLockRef.current).toBe(true);
  });

  it('persistLock release: lock is released even when create POST throws', async () => {
    const store = makeStore();
    mockAxios.post.mockRejectedValueOnce(new Error('create-failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cap = captureHook({ store });

    await cap.handlers.persistMessages([baseMsg]);

    // The finally block flips the lock back to false even though the create
    // throws — the rejection bubbles up to the outer try/catch, which warns.
    expect(cap.persistLockRef.current).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('messages are mapped: undefined operations → null, undefined count → 0', async () => {
    const store = makeStore();
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const cap = captureHook({ conversationIdRefInitial: 'cv', store });

    await cap.handlers.persistMessages([
      {
        id: 'm',
        role: 'assistant',
        content: 'x',
        timestamp: 0,
        operations: [{ op: 'autoOrganize' }],
        operationCount: 5,
        suggestions: ['a'],
      },
      {
        id: 'm2',
        role: 'user',
        content: 'y',
        timestamp: 0,
      },
    ]);

    const body = mockAxios.post.mock.calls[0][1] as { messages: unknown[] };
    expect(body.messages).toEqual([
      {
        role: 'assistant',
        content: 'x',
        operations: [{ op: 'autoOrganize' }],
        operationCount: 5,
        suggestions: ['a'],
      },
      {
        role: 'user',
        content: 'y',
        operations: null,
        operationCount: 0,
        suggestions: null,
      },
    ]);
  });

  it('warns on top-level error (e.g. /messages POST throws)', async () => {
    const store = makeStore();
    mockAxios.post.mockRejectedValueOnce(new Error('network'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cap = captureHook({ conversationIdRefInitial: 'cv', store });

    await cap.handlers.persistMessages([baseMsg]);

    expect(warnSpy).toHaveBeenCalled();
    const calls = warnSpy.mock.calls;
    const found = calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Failed to persist AI messages'),
    );
    expect(found).toBeDefined();
    warnSpy.mockRestore();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleSubmit
// ────────────────────────────────────────────────────────────────────────────

describe('handleSubmit', () => {
  it('no-ops on empty input', () => {
    const store = makeStore();
    const sendIntent = vi.fn();
    const cap = captureHook({ input: '   ', sendIntent, store });

    cap.handlers.handleSubmit();

    expect(sendIntent).not.toHaveBeenCalled();
    expect(cap.setMessagesSpy).not.toHaveBeenCalled();
  });

  it('no-ops while isProcessing', () => {
    const store = makeStore();
    const sendIntent = vi.fn();
    const cap = captureHook({ input: 'do thing', isProcessing: true, sendIntent, store });

    cap.handlers.handleSubmit();

    expect(sendIntent).not.toHaveBeenCalled();
    expect(cap.setMessagesSpy).not.toHaveBeenCalled();
  });

  it('appends user message, clears input, dispatches clearAiState, sends intent, persists', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const sendIntent = vi.fn();
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const cap = captureHook({
      input: '  please deploy  ',
      sendIntent,
      conversationIdRefInitial: 'cv',
      store,
    });
    dispatchSpy.mockClear();

    cap.handlers.handleSubmit();

    // User message appended via the functional updater
    expect(cap.setMessagesSpy).toHaveBeenCalledTimes(1);
    const updater = cap.setMessagesSpy.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    const out = updater([]);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('user');
    // .trim() applied
    expect(out[0].content).toBe('please deploy');
    expect(typeof out[0].id).toBe('string');
    expect(typeof out[0].timestamp).toBe('number');
    // Input cleared
    expect(cap.setInputSpy).toHaveBeenCalledWith('');
    // clearAiState dispatched
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('ai/clearAiState');
    // Intent sent with trimmed text
    expect(sendIntent).toHaveBeenCalledWith('please deploy');
    // Persist invoked (we can wait for the underlying axios post)
    await flushMicrotasks();
    expect(mockAxios.post).toHaveBeenCalledWith(
      '/ai/conversations/cv/messages',
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'please deploy' }),
        ]),
      }),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleKeyDown
// ────────────────────────────────────────────────────────────────────────────

describe('handleKeyDown', () => {
  it('Enter without shift → preventDefault + handleSubmit', () => {
    const store = makeStore();
    const sendIntent = vi.fn();
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const cap = captureHook({
      input: 'msg',
      sendIntent,
      conversationIdRefInitial: 'cv',
      store,
    });

    const preventDefault = vi.fn();
    const e = { key: 'Enter', shiftKey: false, preventDefault } as unknown as React.KeyboardEvent;
    cap.handlers.handleKeyDown(e);

    expect(preventDefault).toHaveBeenCalled();
    expect(sendIntent).toHaveBeenCalledWith('msg');
  });

  it('Enter with shift → no submit (multiline)', () => {
    const store = makeStore();
    const sendIntent = vi.fn();
    const cap = captureHook({ input: 'msg', sendIntent, store });

    const preventDefault = vi.fn();
    const e = { key: 'Enter', shiftKey: true, preventDefault } as unknown as React.KeyboardEvent;
    cap.handlers.handleKeyDown(e);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(sendIntent).not.toHaveBeenCalled();
  });

  it('non-Enter keys → no submit, no preventDefault', () => {
    const store = makeStore();
    const sendIntent = vi.fn();
    const cap = captureHook({ input: 'msg', sendIntent, store });

    const preventDefault = vi.fn();
    const e = { key: 'a', shiftKey: false, preventDefault } as unknown as React.KeyboardEvent;
    cap.handlers.handleKeyDown(e);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(sendIntent).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleSuggestionClick
// ────────────────────────────────────────────────────────────────────────────

describe('handleSuggestionClick', () => {
  it('appends user message with the suggestion verbatim, clears AI state, sends intent', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const sendIntent = vi.fn();
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const cap = captureHook({
      sendIntent,
      conversationIdRefInitial: 'cv',
      store,
    });
    dispatchSpy.mockClear();

    cap.handlers.handleSuggestionClick('Deploy this canvas');

    const updater = cap.setMessagesSpy.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    const out = updater([]);
    expect(out[0].role).toBe('user');
    expect(out[0].content).toBe('Deploy this canvas');
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('ai/clearAiState');
    expect(sendIntent).toHaveBeenCalledWith('Deploy this canvas');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleDeleteConversation
// ────────────────────────────────────────────────────────────────────────────

describe('handleDeleteConversation', () => {
  it('stops propagation, deletes via API, removes from list', async () => {
    const store = makeStore();
    mockAxios.delete.mockResolvedValueOnce({ data: {} });
    const cap = captureHook({ conversationId: 'other-conv', store });

    const stopPropagation = vi.fn();
    const ev = { stopPropagation } as unknown as React.MouseEvent;
    await cap.handlers.handleDeleteConversation('victim-conv', ev);

    expect(stopPropagation).toHaveBeenCalled();
    expect(mockAxios.delete).toHaveBeenCalledWith('/ai/conversations/victim-conv');
    // setConversations called with a filter updater
    expect(cap.setConversationsSpy).toHaveBeenCalledTimes(1);
    const updater = cap.setConversationsSpy.mock.calls[0][0] as (
      prev: ConversationSummary[],
    ) => ConversationSummary[];
    const out = updater([
      {
        id: 'victim-conv',
        title: null,
        card_id: null,
        created_at: '',
        updated_at: '',
        _count: { messages: 0 },
      },
      {
        id: 'kept',
        title: null,
        card_id: null,
        created_at: '',
        updated_at: '',
        _count: { messages: 0 },
      },
    ]);
    expect(out.map((c) => c.id)).toEqual(['kept']);
  });

  it('when deleting the active conversation → falls back to startNewConversation', async () => {
    const store = makeStore();
    mockAxios.delete.mockResolvedValueOnce({ data: {} });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const cap = captureHook({ conversationId: 'active', store });
    dispatchSpy.mockClear();

    const ev = { stopPropagation: () => undefined } as unknown as React.MouseEvent;
    await cap.handlers.handleDeleteConversation('active', ev);

    // startNewConversation side-effects: setConversationId(null), setMessages([]),
    // setShowHistory(false), dispatch(clearAiState)
    expect(cap.setConversationIdSpy).toHaveBeenCalledWith(null);
    expect(cap.setMessagesSpy).toHaveBeenCalledWith([]);
    expect(cap.setShowHistorySpy).toHaveBeenCalledWith(false);
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('ai/clearAiState');
  });

  it('silently swallows DELETE errors (no throw, no state change)', async () => {
    const store = makeStore();
    mockAxios.delete.mockRejectedValueOnce(new Error('500'));
    const cap = captureHook({ store });

    const ev = { stopPropagation: () => undefined } as unknown as React.MouseEvent;
    await expect(cap.handlers.handleDeleteConversation('x', ev)).resolves.toBeUndefined();
    // Filter updater still NOT called when delete fails (early throw inside try).
    expect(cap.setConversationsSpy).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Return shape
// ────────────────────────────────────────────────────────────────────────────

describe('useChatHandlers — return shape', () => {
  it('exposes all eight handlers', () => {
    const store = makeStore();
    const cap = captureHook({ store });
    expect(typeof cap.handlers.loadConversation).toBe('function');
    expect(typeof cap.handlers.fetchConversations).toBe('function');
    expect(typeof cap.handlers.startNewConversation).toBe('function');
    expect(typeof cap.handlers.persistMessages).toBe('function');
    expect(typeof cap.handlers.handleSubmit).toBe('function');
    expect(typeof cap.handlers.handleKeyDown).toBe('function');
    expect(typeof cap.handlers.handleSuggestionClick).toBe('function');
    expect(typeof cap.handlers.handleDeleteConversation).toBe('function');
  });
});
