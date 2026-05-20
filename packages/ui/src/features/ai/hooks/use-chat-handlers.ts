/**
 * useChatHandlers — orchestrator-level callbacks for the AI chat panel.
 *
 * Bundles eight `useCallback`s lifted from `ai-chat-panel.tsx`:
 *
 *   1. `loadConversation(id)`  — fetches a saved conversation, hydrates
 *      messages from the API row shape, and closes the history sidebar.
 *   2. `fetchConversations()`  — refreshes the conversation list for the
 *      current project; returns the array (so callers can chain).
 *   3. `startNewConversation()` — clears messages, drops the conversation
 *      id, hides history, and dispatches `clearAiState()`.
 *   4. `persistMessages(msgs)`  — appends messages to the backend, lazily
 *      creating a conversation row if needed. The `_persistLock` guard is
 *      load-bearing: when assistant + user messages arrive concurrently
 *      with no convId yet, we must NOT create two conversations. The
 *      `conversationIdRef.current` mirror is read inside the closure, NOT
 *      `conversationId` directly, so a freshly-created id is visible to
 *      the same-tick second call.
 *   5. `handleSubmit()`        — pushes the user's typed message, clears
 *      input + AI state, sends the intent, persists.
 *   6. `handleKeyDown(e)`      — Enter (without shift) submits.
 *   7. `handleSuggestionClick(s)` — submits a pre-baked suggestion.
 *   8. `handleDeleteConversation(id, e)` — deletes a conversation; if the
 *      deleted one is currently active, falls back to a fresh chat.
 *
 * RISK (rf-aichat blueprint): the persist-lock + conversationIdRef pair
 * is the single most-fragile invariant in the chat panel. Both must
 * remain owned by the hook (passed in by ref) so re-renders don't reset
 * them. The hook receives `_persistLockRef` from the caller — DO NOT
 * recreate it inside the hook; the caller's ref must persist across the
 * orchestrator's re-renders for the lock to actually defend against
 * double-creation.
 */

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import axiosInstance from '../../../shared/api/axios-instance';
import { clearAiState } from '../../../store/slices/ai-slice';
import type { AppDispatch } from '../../../store';
import type { Card } from '../../../store/slices/cards-slice';
import type { AiCanvasOp } from '@ice/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  operations?: AiCanvasOp[];
  operationCount?: number;
  suggestions?: string[];
  applied?: boolean;
  timestamp: number;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  card_id: string | null;
  created_at: string;
  updated_at: string;
  _count: { messages: number };
}

export interface UseChatHandlersArgs {
  projectId: string | null;
  activeCard: Card | null | undefined;
  conversationId: string | null;
  conversationIdRef: React.MutableRefObject<string | null>;
  persistLockRef: React.MutableRefObject<boolean>;
  input: string;
  isProcessing: boolean;
  sendIntent: (intent: string) => Promise<void> | void;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UseChatHandlersReturn {
  loadConversation: (id: string) => Promise<void>;
  fetchConversations: () => Promise<ConversationSummary[] | undefined>;
  startNewConversation: () => void;
  persistMessages: (msgs: ChatMessage[]) => Promise<void>;
  handleSubmit: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSuggestionClick: (suggestion: string) => void;
  handleDeleteConversation: (id: string, e: React.MouseEvent) => Promise<void>;
}

export function useChatHandlers(args: UseChatHandlersArgs): UseChatHandlersReturn {
  const {
    projectId,
    activeCard,
    conversationId,
    conversationIdRef,
    persistLockRef,
    input,
    isProcessing,
    sendIntent,
    setInput,
    setMessages,
    setConversationId,
    setConversations,
    setShowHistory,
  } = args;
  const dispatch = useDispatch<AppDispatch>();

  // ── Load a conversation ─────────────────────────────────────────────────
  const loadConversation = useCallback(
    async (id: string) => {
      try {
        const res = await axiosInstance.get(`/ai/conversations/${id}`);
        const conv = res.data;
        setConversationId(conv.id);
        setMessages(
          conv.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            operations: m.operations || undefined,
            operationCount: m.operation_count || 0,
            suggestions: m.suggestions || undefined,
            applied: m.role === 'assistant' && m.operation_count > 0,
            timestamp: new Date(m.created_at).getTime(),
          })),
        );
        setShowHistory(false);
      } catch {
        /* ignore */
      }
    },
    [setConversationId, setMessages, setShowHistory],
  );

  // ── Fetch conversation list ─────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await axiosInstance.get(`/ai/conversations?projectId=${projectId}`);
      const convs: ConversationSummary[] = res.data;
      setConversations(convs);
      return convs;
    } catch {
      return [];
    }
  }, [projectId, setConversations]);

  // ── Start new conversation ──────────────────────────────────────────────
  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
    dispatch(clearAiState());
  }, [dispatch, setConversationId, setMessages, setShowHistory]);

  // ── Persist messages (with lazy conversation create + lock) ─────────────
  const persistMessages = useCallback(
    async (msgs: ChatMessage[]) => {
      if (!projectId || msgs.length === 0) return;

      try {
        let convId = conversationIdRef.current;

        // Create conversation if needed (with lock to prevent duplicates)
        if (!convId) {
          if (persistLockRef.current) return;
          persistLockRef.current = true;
          try {
            const res = await axiosInstance.post('/ai/conversations', {
              projectId,
              cardId: activeCard?.id || null,
            });
            convId = res.data.id;
            conversationIdRef.current = convId;
            setConversationId(convId);
          } finally {
            persistLockRef.current = false;
          }
        }

        // Append new messages
        await axiosInstance.post(`/ai/conversations/${convId}/messages`, {
          messages: msgs.map((m) => ({
            role: m.role,
            content: m.content,
            operations: m.operations || null,
            operationCount: m.operationCount || 0,
            suggestions: m.suggestions || null,
          })),
        });

        // Refresh conversation list (title may have been auto-set)
        fetchConversations();
      } catch (err) {
        console.warn('Failed to persist AI messages:', err);
      }
    },
    [projectId, activeCard?.id, fetchConversations, conversationIdRef, persistLockRef, setConversationId],
  );

  // ── Submit handler ──────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    dispatch(clearAiState());
    sendIntent(trimmed);

    // Persist user message
    persistMessages([userMsg]);
  }, [input, isProcessing, sendIntent, dispatch, persistMessages, setInput, setMessages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: suggestion,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      dispatch(clearAiState());
      sendIntent(suggestion);
      persistMessages([userMsg]);
    },
    [sendIntent, dispatch, persistMessages, setMessages],
  );

  const handleDeleteConversation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await axiosInstance.delete(`/ai/conversations/${id}`);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (conversationId === id) startNewConversation();
      } catch {
        /* ignore */
      }
    },
    [conversationId, startNewConversation, setConversations],
  );

  return {
    loadConversation,
    fetchConversations,
    startNewConversation,
    persistMessages,
    handleSubmit,
    handleKeyDown,
    handleSuggestionClick,
    handleDeleteConversation,
  };
}
