/**
 * useChatEffects — orchestrator-level side-effects for the AI chat panel.
 *
 * Bundles the FIVE `useEffect` blocks lifted from `ai-chat-panel.tsx`:
 *
 *   1. **Provider health probe** — fires on mount only, GETs `/ai/health`,
 *      stores the response (`{ ok, provider, model?, isLocal? }`) into a
 *      state slot. Empty deps `[]`.
 *   2. **Conversation auto-resume** — on `[projectId, activeCard?.id]` change:
 *      dispatches `clearAiState`, fetches the project's conversations, picks
 *      the one matching the active card (or the most recent overall when no
 *      card), hydrates messages via `loadConversation`. Has a `cancelled`
 *      flag in the cleanup return.
 *   3. **Auto-scroll** — fires on `[messages, isProcessing, streamingStatus]`,
 *      sets `scrollRef.current.scrollTop = scrollHeight`. Skipped when ref
 *      is null.
 *   4. **AI-finished handler** — fires on `[isProcessing, lastResponse,
 *      pendingOperations.length]`. When `!isProcessing && lastResponse`:
 *      cleans the explanation (handles raw-JSON leak from local models),
 *      appends the assistant message, applies operations, persists. Note:
 *      the inline `if (lastMsg?.role === 'assistant') return;` short-circuit
 *      reads the LIVE `messages` array — not via deps — to defend against
 *      double-firing when only `lastResponse` reference flips.
 *   5. **AI-error handler** — fires on `[isProcessing, error]`. When
 *      `!isProcessing && error`: appends the error message and persists.
 *
 * RISK: effects 4 and 5 both call `persistMessages` synchronously during
 * the same render-tick if both conditions fire. The `_persistLock` defended
 * by the handlers hook is the single load-bearing invariant — it keeps
 * concurrent persist attempts from creating duplicate conversations. DO NOT
 * collapse effects 4 and 5 into one — they ARE separate observation gates.
 *
 * RISK: effect 2 reads `activeCard?.id` (NOT `activeCard`) in deps to avoid
 * re-firing on object reference changes; the `// eslint-disable-line
 * react-hooks/exhaustive-deps` is intentional and matches the source.
 *
 * Cite (anchors):
 *   - fingerprint-multi-useEffect-by-deps-array-shape-when-bundled-in-one-hook
 *     (rf-pdpl-21)
 *   - early-return-after-hooks-still-registers-effects-and-state-slots
 *     (rf-tgal-6)
 */

import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import axiosInstance from '../../../shared/api/axios-instance';
import { clearAiState } from '../../../store/slices/ai-slice';
import type { ChatMessage, ConversationSummary } from './use-chat-handlers';
import type { AppDispatch } from '../../../store';
import type { Card } from '../../../store/slices/cards-slice';
import type { AiCanvasOp, AiResponse } from '@ice/types';

export interface ProviderInfo {
  ok: boolean;
  provider: string;
  model?: string;
  isLocal?: boolean;
}

export interface ApplyOperationsResult {
  executedOps: number;
}

export interface UseChatEffectsArgs {
  // Selectors / state
  projectId: string | null;
  activeCard: Card | null | undefined;
  messages: ChatMessage[];
  isProcessing: boolean;
  streamingStatus: string | null;
  lastResponse: AiResponse | null;
  pendingOperations: AiCanvasOp[];
  suggestions: string[];
  error: string | null;

  // Setters
  setProviderInfo: React.Dispatch<React.SetStateAction<ProviderInfo | null>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setConversationId: React.Dispatch<React.SetStateAction<string | null>>;

  // Refs
  scrollRef: React.RefObject<HTMLDivElement>;

  // Helpers (from useChatHandlers + useAiCommand)
  loadConversation: (id: string) => Promise<void>;
  fetchConversations: () => Promise<ConversationSummary[] | undefined>;
  persistMessages: (msgs: ChatMessage[]) => Promise<void>;
  applyOperations: () => ApplyOperationsResult | void;
  t: (key: string) => string;
}

export function useChatEffects(args: UseChatEffectsArgs): void {
  const {
    projectId,
    activeCard,
    messages,
    isProcessing,
    streamingStatus,
    lastResponse,
    pendingOperations,
    suggestions,
    error,
    setProviderInfo,
    setMessages,
    setConversationId,
    scrollRef,
    loadConversation,
    fetchConversations,
    persistMessages,
    applyOperations,
    t,
  } = args;
  const dispatch = useDispatch<AppDispatch>();

  // Closures over `messages`, `pendingOperations`, etc. capture from the
  // hook's render. Each render re-runs the hook with fresh values, so the
  // effects' next-tick re-registration captures the latest array refs even
  // though those names aren't in the deps array. This matches the source's
  // closure-capture behavior verbatim (the FC was inlined; here it's via a
  // hook called from the FC body — same render lifecycle).

  // Effect 1 — Provider health probe (mount only)
  useEffect(() => {
    axiosInstance
      .get('/ai/health')
      .then((res) => setProviderInfo(res.data))
      .catch(() => setProviderInfo(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  // Effect 2 — Conversation auto-resume on project/card change
  useEffect(() => {
    let cancelled = false;

    const resumeConversation = async () => {
      dispatch(clearAiState());
      const convs = await fetchConversations();
      if (cancelled || !convs || convs.length === 0) {
        // No conversations — start fresh
        setConversationId(null);
        setMessages([]);
        return;
      }

      // Find the most recent conversation for this card (or project if no card)
      const cardId = activeCard?.id;
      const match = cardId
        ? convs.find((c) => c.card_id === cardId) // Match by card first
        : convs[0]; // Fall back to most recent

      if (match) {
        await loadConversation(match.id);
      } else {
        // No conversation for this card — start fresh
        setConversationId(null);
        setMessages([]);
      }
    };

    resumeConversation();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeCard?.id]);

  // Effect 3 — Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing, streamingStatus, scrollRef]);

  // Effect 4 — AI-finished handler. Closure-captures `messages`,
  // `pendingOperations`, `suggestions` from the hook's render — same
  // behavior as the source orchestrator's inline effect.
  useEffect(() => {
    if (!isProcessing && lastResponse) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant') return;

      const hasOps = pendingOperations.length > 0;

      // Clean explanation — local models sometimes leak raw JSON into the explanation field
      let explanation = lastResponse.explanation || '';
      if (explanation.startsWith('{') || explanation.startsWith('[')) {
        try {
          const parsed = JSON.parse(explanation);
          explanation = parsed.explanation || parsed.message || '';
        } catch {
          const match = explanation.match(/"explanation"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (match) explanation = match[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
        }
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: explanation || (hasOps ? t('ai.chat.doneMessage') : t('ai.chat.noChangesMessage')),
        operations: hasOps ? [...pendingOperations] : undefined,
        suggestions: suggestions.length > 0 ? [...suggestions] : undefined,
        applied: !hasOps,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (hasOps) {
        const result = applyOperations();
        if (result) {
          assistantMsg.applied = true;
          assistantMsg.operationCount = result.executedOps;
          setMessages((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, applied: true, operationCount: result.executedOps } : m,
            ),
          );
        }
      }

      // Persist assistant message to backend
      persistMessages([assistantMsg]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing, lastResponse, pendingOperations.length]);

  // Effect 5 — AI-error handler
  useEffect(() => {
    if (!isProcessing && error) {
      const errMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: error,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
      persistMessages([errMsg]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing, error]);
}
