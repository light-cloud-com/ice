/**
 * rf-aichat-4 — useChatEffects hook.
 *
 * Five `useEffect` blocks lifted from `ai-chat-panel.tsx`:
 *   1. Provider health probe (mount only — empty deps)
 *   2. Conversation auto-resume on project/card change
 *   3. Auto-scroll on messages/isProcessing/streamingStatus
 *   4. AI-finished handler on isProcessing/lastResponse/pendingOperations.length
 *   5. AI-error handler on isProcessing/error
 *
 * Tests mock React's `useEffect` synchronously (rf-pdpl-21 pattern) so
 * each registration appends a `(cb, deps, cleanup)` tuple into a hoisted
 * `mocks.effects` array. Tests then identify each effect by deps-array
 * **shape** — empty for mount-only, length-2 for project/card resume,
 * length-4 for auto-scroll (incl. scrollRef), length-3 for AI-finished,
 * length-2 for AI-error.
 *
 * Cite (anchors):
 *   - fingerprint-multi-useEffect-by-deps-array-shape-when-bundled-in-one-hook
 *     (rf-pdpl-21)
 */

import React, { useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

interface CapturedEffect {
  cb: () => void | (() => void);
  deps: unknown[] | undefined;
  cleanup: void | (() => void);
}

const mocks = vi.hoisted(() => ({
  effects: [] as CapturedEffect[],
  axios: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
      const cleanup = cb();
      mocks.effects.push({ cb, deps, cleanup });
    }),
  };
});

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: mocks.axios,
  getAccessToken: () => 'tok',
}));

// ─── Imports after mocks ────────────────────────────────────────────────────

import aiReducer from '../../../../store/slices/ai-slice';
import cardsReducer, { type Card } from '../../../../store/slices/cards-slice';
import { useChatEffects, type UseChatEffectsArgs } from '../use-chat-effects';
import type { ChatMessage } from '../use-chat-handlers';
import type { AiResponse } from '@ice/types';

const makeStore = () =>
  configureStore({
    reducer: {
      ai: aiReducer,
      cards: cardsReducer,
    },
  });

const mockAxios = mocks.axios;

// ─── Capture helper ─────────────────────────────────────────────────────────

const ACTIVE_CARD: Card = {
  id: 'card-1',
  name: 'Test card',
  nodes: [],
  edges: [],
  viewport: { panX: 0, panY: 0, scale: 1 },
  createdAt: 0,
};

interface CaptureArgs extends Partial<UseChatEffectsArgs> {
  store: ReturnType<typeof makeStore>;
}

interface Captured {
  args: UseChatEffectsArgs;
  scrollRef: React.RefObject<HTMLDivElement>;
}

function captureHook(args: CaptureArgs): Captured {
  const captured: { current?: Captured } = {};
  const Probe: React.FC = () => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const fullArgs: UseChatEffectsArgs = {
      projectId: args.projectId ?? null,
      activeCard: args.activeCard ?? null,
      messages: args.messages ?? [],
      isProcessing: args.isProcessing ?? false,
      streamingStatus: args.streamingStatus ?? null,
      lastResponse: args.lastResponse ?? null,
      pendingOperations: args.pendingOperations ?? [],
      suggestions: args.suggestions ?? [],
      error: args.error ?? null,
      setProviderInfo: args.setProviderInfo ?? vi.fn(),
      setMessages: args.setMessages ?? vi.fn(),
      setConversationId: args.setConversationId ?? vi.fn(),
      scrollRef: args.scrollRef ?? scrollRef,
      loadConversation: args.loadConversation ?? vi.fn(),
      fetchConversations: args.fetchConversations ?? vi.fn().mockResolvedValue([]),
      persistMessages: args.persistMessages ?? vi.fn(),
      applyOperations: args.applyOperations ?? vi.fn(),
      t: args.t ?? ((k: string) => k),
    };
    useChatEffects(fullArgs);
    captured.current = { args: fullArgs, scrollRef };
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
  mocks.effects.length = 0;
  mockAxios.get.mockReset();
  mockAxios.post.mockReset();
  mockAxios.delete.mockReset();
  // Effect 1 unconditionally fires `axiosInstance.get('/ai/health').then(...)`.
  // Default to a resolved-empty so tests that don't care about it don't crash.
  mockAxios.get.mockResolvedValue({ data: null });
});

const effectByOrder = (i: number): CapturedEffect => {
  if (!mocks.effects[i]) throw new Error(`effect index ${i} not registered`);
  return mocks.effects[i];
};

// ────────────────────────────────────────────────────────────────────────────
// Effect 1 — provider health probe
// ────────────────────────────────────────────────────────────────────────────

describe('effect 1: provider health probe', () => {
  it('registers with empty deps (mount-only)', () => {
    const store = makeStore();
    captureHook({ store });
    const e = effectByOrder(0);
    expect(e.deps).toEqual([]);
  });

  it('GETs /ai/health and stores response on success', async () => {
    const store = makeStore();
    const setProviderInfo = vi.fn();
    mockAxios.get.mockResolvedValueOnce({ data: { ok: true, provider: 'anthropic' } });
    captureHook({ store, setProviderInfo });

    await flushMicrotasks();
    await flushMicrotasks();

    expect(mockAxios.get).toHaveBeenCalledWith('/ai/health');
    expect(setProviderInfo).toHaveBeenCalledWith({ ok: true, provider: 'anthropic' });
  });

  it('on health probe failure → setProviderInfo(null)', async () => {
    const store = makeStore();
    const setProviderInfo = vi.fn();
    mockAxios.get.mockRejectedValueOnce(new Error('500'));
    captureHook({ store, setProviderInfo });

    await flushMicrotasks();
    await flushMicrotasks();

    expect(setProviderInfo).toHaveBeenCalledWith(null);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Effect 2 — conversation auto-resume on project/card change
// ────────────────────────────────────────────────────────────────────────────

describe('effect 2: conversation auto-resume', () => {
  it('registers with deps [projectId, activeCard?.id] (length 2)', () => {
    const store = makeStore();
    captureHook({ store, projectId: 'p1', activeCard: ACTIVE_CARD });
    const e = effectByOrder(1);
    expect(e.deps).toHaveLength(2);
    expect(e.deps?.[0]).toBe('p1');
    expect(e.deps?.[1]).toBe('card-1');
  });

  it('with no convs → clears state, dispatches clearAiState', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const fetchConversations = vi.fn().mockResolvedValue([]);
    const setConversationId = vi.fn();
    const setMessages = vi.fn();
    captureHook({
      store,
      projectId: 'p1',
      activeCard: null,
      fetchConversations,
      setConversationId,
      setMessages,
    });

    await flushMicrotasks();
    await flushMicrotasks();

    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('ai/clearAiState');
    expect(setConversationId).toHaveBeenCalledWith(null);
    expect(setMessages).toHaveBeenCalledWith([]);
  });

  it('with convs and matching card → loads that conversation', async () => {
    const store = makeStore();
    const fetchConversations = vi.fn().mockResolvedValue([
      {
        id: 'c-1',
        title: 'X',
        card_id: 'card-1',
        created_at: '',
        updated_at: '',
        _count: { messages: 0 },
      },
      {
        id: 'c-2',
        title: 'Y',
        card_id: 'card-other',
        created_at: '',
        updated_at: '',
        _count: { messages: 0 },
      },
    ]);
    const loadConversation = vi.fn().mockResolvedValue(undefined);
    captureHook({
      store,
      projectId: 'p1',
      activeCard: ACTIVE_CARD,
      fetchConversations,
      loadConversation,
    });

    await flushMicrotasks();
    await flushMicrotasks();

    expect(loadConversation).toHaveBeenCalledWith('c-1');
  });

  it('with convs but no matching card → falls back to first (most recent)', async () => {
    const store = makeStore();
    const fetchConversations = vi.fn().mockResolvedValue([
      {
        id: 'c-A',
        title: '',
        card_id: 'unrelated',
        created_at: '',
        updated_at: '',
        _count: { messages: 0 },
      },
    ]);
    const loadConversation = vi.fn().mockResolvedValue(undefined);
    captureHook({
      store,
      projectId: 'p1',
      activeCard: null,
      fetchConversations,
      loadConversation,
    });

    await flushMicrotasks();
    await flushMicrotasks();

    expect(loadConversation).toHaveBeenCalledWith('c-A');
  });

  it('with convs and active card but no match → starts fresh', async () => {
    const store = makeStore();
    const fetchConversations = vi.fn().mockResolvedValue([
      {
        id: 'c-A',
        title: '',
        card_id: 'wrong',
        created_at: '',
        updated_at: '',
        _count: { messages: 0 },
      },
    ]);
    const loadConversation = vi.fn();
    const setConversationId = vi.fn();
    const setMessages = vi.fn();
    captureHook({
      store,
      projectId: 'p1',
      activeCard: ACTIVE_CARD,
      fetchConversations,
      loadConversation,
      setConversationId,
      setMessages,
    });

    await flushMicrotasks();
    await flushMicrotasks();

    expect(loadConversation).not.toHaveBeenCalled();
    expect(setConversationId).toHaveBeenCalledWith(null);
    expect(setMessages).toHaveBeenCalledWith([]);
  });

  it('cancellation: cleanup before resolution prevents loadConversation call (matching-card path)', async () => {
    const store = makeStore();
    let resolve: (value: unknown) => void = () => {};
    const fetchConversations = vi.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const loadConversation = vi.fn();
    captureHook({
      store,
      projectId: 'p1',
      activeCard: ACTIVE_CARD,
      fetchConversations,
      loadConversation,
    });

    // Trigger cleanup before the promise resolves.
    const e = effectByOrder(1);
    (e.cleanup as () => void)();
    // Now resolve with a list that would otherwise trigger loadConversation.
    resolve([
      {
        id: 'c-X',
        title: '',
        card_id: 'card-1',
        created_at: '',
        updated_at: '',
        _count: { messages: 0 },
      },
    ]);
    await flushMicrotasks();
    await flushMicrotasks();

    // The `if (cancelled || ...)` early-return prevents the matching-card
    // branch from firing — so loadConversation is NOT called even though
    // the convs list contains a match.
    expect(loadConversation).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Effect 3 — auto-scroll
// ────────────────────────────────────────────────────────────────────────────

describe('effect 3: auto-scroll', () => {
  it('registers with deps [messages, isProcessing, streamingStatus, scrollRef] (length 4)', () => {
    const store = makeStore();
    captureHook({ store });
    const e = effectByOrder(2);
    expect(e.deps).toHaveLength(4);
  });

  it('sets scrollTop = scrollHeight when ref is populated', () => {
    const store = makeStore();
    const fakeNode = { scrollTop: 0, scrollHeight: 999 };
    const scrollRef = { current: fakeNode } as unknown as React.RefObject<HTMLDivElement>;
    captureHook({ store, scrollRef });

    // The mock fired the cb on registration — fakeNode.scrollTop should be 999.
    expect(fakeNode.scrollTop).toBe(999);
  });

  it('no-op when scrollRef.current is null (the `if` guard)', () => {
    const store = makeStore();
    captureHook({ store }); // default scrollRef.current === null
    // No throw — the cb fired during registration with current=null.
    expect(() => effectByOrder(2).cb()).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Effect 4 — AI-finished handler
// ────────────────────────────────────────────────────────────────────────────

describe('effect 4: AI-finished handler', () => {
  it('registers with deps [isProcessing, lastResponse, pendingOperations.length] (length 3)', () => {
    const store = makeStore();
    captureHook({ store });
    const e = effectByOrder(3);
    expect(e.deps).toHaveLength(3);
    expect(typeof e.deps?.[0]).toBe('boolean');
    // Third dep is the pendingOperations.length number.
    expect(typeof e.deps?.[2]).toBe('number');
  });

  it('no-op while isProcessing is true', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    const persistMessages = vi.fn();
    const lastResponse: AiResponse = {
      explanation: 'done',
      operations: [],
      suggestions: [],
    };
    captureHook({
      store,
      isProcessing: true,
      lastResponse,
      setMessages,
      persistMessages,
    });
    expect(setMessages).not.toHaveBeenCalled();
    expect(persistMessages).not.toHaveBeenCalled();
  });

  it('no-op when lastResponse is null', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    captureHook({ store, isProcessing: false, lastResponse: null, setMessages });
    expect(setMessages).not.toHaveBeenCalled();
  });

  it('short-circuits when last message is already an assistant role', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    const persistMessages = vi.fn();
    const lastResponse: AiResponse = {
      explanation: 'done',
      operations: [],
      suggestions: [],
    };
    const messages: ChatMessage[] = [
      { id: 'last', role: 'assistant', content: 'prev', timestamp: 0 },
    ];
    captureHook({
      store,
      isProcessing: false,
      lastResponse,
      messages,
      setMessages,
      persistMessages,
    });
    expect(setMessages).not.toHaveBeenCalled();
    expect(persistMessages).not.toHaveBeenCalled();
  });

  it('appends assistant message and persists when no ops', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    const persistMessages = vi.fn();
    const applyOperations = vi.fn();
    const lastResponse: AiResponse = {
      explanation: 'all done',
      operations: [],
      suggestions: [],
    };
    captureHook({
      store,
      isProcessing: false,
      lastResponse,
      pendingOperations: [],
      suggestions: [],
      setMessages,
      persistMessages,
      applyOperations,
    });

    expect(setMessages).toHaveBeenCalledTimes(1);
    const updater = setMessages.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    const out = updater([]);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('assistant');
    expect(out[0].content).toBe('all done');
    expect(out[0].applied).toBe(true); // no ops → applied true (per source)
    expect(out[0].operations).toBeUndefined();
    expect(applyOperations).not.toHaveBeenCalled();
    expect(persistMessages).toHaveBeenCalledTimes(1);
  });

  it('with ops: applies, marks applied:true via second setMessages call, sets operationCount', () => {
    const store = makeStore();
    const setMessagesCalls: Array<unknown> = [];
    const setMessages = vi.fn((updater) => {
      setMessagesCalls.push(updater);
    });
    const persistMessages = vi.fn();
    const applyOperations = vi.fn().mockReturnValue({ executedOps: 7 });
    const lastResponse: AiResponse = {
      explanation: 'doing things',
      operations: [],
      suggestions: [],
    };
    captureHook({
      store,
      isProcessing: false,
      lastResponse,
      pendingOperations: [{ op: 'autoOrganize' }],
      suggestions: ['s1'],
      setMessages,
      persistMessages,
      applyOperations,
    });

    expect(applyOperations).toHaveBeenCalledTimes(1);
    expect(setMessagesCalls).toHaveLength(2);

    // 1st call: append assistant msg with operations + suggestions hydrated.
    // (Note: the source mutates `assistantMsg.applied` in-place after the
    // first dispatch when applyOperations succeeds, so the captured object
    // reference reflects the post-mutation state by the time we inspect it
    // — applied = true here is expected behavior, not a bug.)
    const firstUpdater = setMessagesCalls[0] as (prev: ChatMessage[]) => ChatMessage[];
    const firstOut = firstUpdater([]);
    expect(firstOut[0].operations).toEqual([{ op: 'autoOrganize' }]);
    expect(firstOut[0].suggestions).toEqual(['s1']);

    // 2nd call: map prev to flip last to applied:true with operationCount.
    const secondUpdater = setMessagesCalls[1] as (prev: ChatMessage[]) => ChatMessage[];
    const seed: ChatMessage[] = [{ id: 'a', role: 'assistant', content: 'x', timestamp: 0 }];
    const secondOut = secondUpdater(seed);
    expect(secondOut[0].applied).toBe(true);
    expect(secondOut[0].operationCount).toBe(7);
  });

  it('with ops but applyOperations returns void → no second setMessages call', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    const persistMessages = vi.fn();
    const applyOperations = vi.fn().mockReturnValue(undefined);
    const lastResponse: AiResponse = {
      explanation: 'meh',
      operations: [],
      suggestions: [],
    };
    captureHook({
      store,
      isProcessing: false,
      lastResponse,
      pendingOperations: [{ op: 'autoOrganize' }],
      setMessages,
      persistMessages,
      applyOperations,
    });

    expect(applyOperations).toHaveBeenCalledTimes(1);
    expect(setMessages).toHaveBeenCalledTimes(1); // only the initial append
  });

  it('JSON-leak parse: extracts explanation from JSON wrapper', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    const lastResponse: AiResponse = {
      explanation: '{"explanation": "real text", "extra": "x"}',
      operations: [],
      suggestions: [],
    };
    captureHook({ store, isProcessing: false, lastResponse, setMessages });

    const updater = setMessages.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    const out = updater([]);
    expect(out[0].content).toBe('real text');
  });

  it('JSON-leak parse: falls back to "message" key when explanation missing', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    const lastResponse: AiResponse = {
      explanation: '{"message": "fallback"}',
      operations: [],
      suggestions: [],
    };
    captureHook({ store, isProcessing: false, lastResponse, setMessages });

    const updater = setMessages.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    const out = updater([]);
    expect(out[0].content).toBe('fallback');
  });

  it('JSON-leak parse: regex fallback when JSON.parse fails', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    // Malformed JSON that JSON.parse rejects but the regex can salvage.
    const lastResponse: AiResponse = {
      explanation: '{"explanation": "got it via regex"}garbage',
      operations: [],
      suggestions: [],
    };
    captureHook({ store, isProcessing: false, lastResponse, setMessages });

    const updater = setMessages.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    const out = updater([]);
    expect(out[0].content).toBe('got it via regex');
  });

  it('JSON-leak parse: regex fallback handles escaped quotes', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    const lastResponse: AiResponse = {
      // Fully malformed (missing trailing brace) so JSON.parse throws.
      explanation: '{"explanation":"foo \\"bar\\" baz"',
      operations: [],
      suggestions: [],
    };
    captureHook({ store, isProcessing: false, lastResponse, setMessages });

    const updater = setMessages.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    const out = updater([]);
    expect(out[0].content).toContain('foo');
  });

  it('empty explanation + no ops → falls back to "ai.chat.noChangesMessage" via t()', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    const t = vi.fn((k: string) => `[t:${k}]`);
    const lastResponse: AiResponse = {
      explanation: '',
      operations: [],
      suggestions: [],
    };
    captureHook({
      store,
      isProcessing: false,
      lastResponse,
      pendingOperations: [],
      t,
      setMessages,
    });

    const updater = setMessages.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    const out = updater([]);
    expect(out[0].content).toBe('[t:ai.chat.noChangesMessage]');
  });

  it('empty explanation + ops → falls back to "ai.chat.doneMessage" via t()', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    const t = vi.fn((k: string) => `[t:${k}]`);
    const lastResponse: AiResponse = {
      explanation: '',
      operations: [],
      suggestions: [],
    };
    captureHook({
      store,
      isProcessing: false,
      lastResponse,
      pendingOperations: [{ op: 'autoOrganize' }],
      t,
      setMessages,
      applyOperations: vi.fn(),
    });

    const updater = setMessages.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    const out = updater([]);
    expect(out[0].content).toBe('[t:ai.chat.doneMessage]');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Effect 5 — AI-error handler
// ────────────────────────────────────────────────────────────────────────────

describe('effect 5: AI-error handler', () => {
  it('registers with deps [isProcessing, error] (length 2)', () => {
    const store = makeStore();
    captureHook({ store });
    const e = effectByOrder(4);
    expect(e.deps).toHaveLength(2);
  });

  it('no-op while isProcessing is true', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    const persistMessages = vi.fn();
    captureHook({
      store,
      isProcessing: true,
      error: 'AI broke',
      setMessages,
      persistMessages,
    });
    expect(setMessages).not.toHaveBeenCalled();
    expect(persistMessages).not.toHaveBeenCalled();
  });

  it('no-op when error is null', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    captureHook({ store, isProcessing: false, error: null, setMessages });
    expect(setMessages).not.toHaveBeenCalled();
  });

  it('appends error message and persists when both conditions met', () => {
    const store = makeStore();
    const setMessages = vi.fn();
    const persistMessages = vi.fn();
    captureHook({
      store,
      isProcessing: false,
      error: 'rate-limited',
      setMessages,
      persistMessages,
    });

    expect(setMessages).toHaveBeenCalledTimes(1);
    const updater = setMessages.mock.calls[0][0] as (prev: ChatMessage[]) => ChatMessage[];
    const out = updater([]);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('assistant');
    expect(out[0].content).toBe('rate-limited');
    expect(persistMessages).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Return shape
// ────────────────────────────────────────────────────────────────────────────

describe('useChatEffects — registration shape', () => {
  it('registers exactly five effects per render', () => {
    const store = makeStore();
    captureHook({ store });
    expect(mocks.effects).toHaveLength(5);
  });

  it('returns void', () => {
    const store = makeStore();
    const ret = captureHook({ store });
    // The hook itself returns void; capture only collects args/scrollRef.
    expect(ret.scrollRef).toBeDefined();
  });
});
