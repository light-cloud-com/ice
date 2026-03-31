/**
 * AI Chat Panel
 *
 * Always-visible chat interface for natural language canvas operations.
 * Conversations persisted in the backend, scoped per org → project → user.
 * Supports conversation list, new chat, and resume.
 */

import {
  Sparkles,
  Loader2,
  Check,
  Undo2,
  ArrowRight,
  Send,
  X,
  ChevronUp,
  Plus,
  MessageSquare,
  Trash2,
  Cpu,
  Cloud,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from '../../../i18n';
import axiosInstance from '../../../shared/api/axios-instance';
import { cn } from '../../../shared/utils/cn';
import { clearAiState } from '../../../store/slices/ai-slice';
import { selectActiveCard } from '../../../store/slices/cards-slice';
import { toggleAiChat } from '../../../store/slices/ui-slice';
import { useAiCommand } from '../hooks/use-ai-command';
import { suggestPatterns } from '../utils/suggest-patterns';
import type { AppDispatch, RootState } from '../../../store';
import type { AiCanvasOp } from '@ice/types';

// =============================================================================
// Types
// =============================================================================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  operations?: AiCanvasOp[];
  operationCount?: number;
  suggestions?: string[];
  applied?: boolean;
  timestamp: number;
}

interface ConversationSummary {
  id: string;
  title: string | null;
  card_id: string | null;
  created_at: string;
  updated_at: string;
  _count: { messages: number };
}

// =============================================================================
// Operation helpers
// =============================================================================

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function opSummary(op: AiCanvasOp): string {
  switch (op.op) {
    case 'addBlueprint':
      return `Add ${op.label || op.blockType}`;
    case 'addNode':
      return `Add ${(op.node.data?.label as string) || op.node.type}`;
    case 'addEdge':
      return `Connect ${op.edge.source} → ${op.edge.target}`;
    case 'updateNodeData':
      return `Update ${op.nodeId}`;
    case 'deleteNode':
      return `Remove ${op.nodeId}`;
    case 'deleteEdge':
      return `Remove connection`;
    case 'autoOrganize':
      return 'Reorganize layout';
    default:
      return `${op.op}`;
  }
}

function opBadgeColor(op: AiCanvasOp): string {
  if (op.op.startsWith('delete')) return 'bg-red-500/20 text-red-400';
  if (op.op.startsWith('add')) return 'bg-emerald-500/20 text-emerald-400';
  return 'bg-blue-500/20 text-blue-400';
}

// =============================================================================
// Component
// =============================================================================

export const AiChatPanel: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const {
    sendIntent,
    applyOperations,
    undoAi,
    isProcessing,
    pendingOperations,
    lastResponse,
    error,
    streamingStatus,
    suggestions,
    canUndo,
  } = useAiCommand();

  const activeCard = useSelector(selectActiveCard);
  const projectId = useSelector((s: RootState) => s.projects.activeProjectId);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [providerInfo, setProviderInfo] = useState<{ ok: boolean; provider: string; model?: string; isLocal?: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Fetch AI provider status ──────────────────────────────────────────────

  useEffect(() => {
    axiosInstance
      .get('/ai/health')
      .then((res) => setProviderInfo(res.data))
      .catch(() => setProviderInfo(null));
  }, []);

  // ── Load a conversation ───────────────────────────────────────────────────

  const loadConversation = useCallback(async (id: string) => {
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
  }, []);

  // ── Fetch conversations and auto-resume on project/card change ───────────

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
  }, [projectId]);

  // When project or card changes, fetch conversations and resume the most recent one
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
    return () => { cancelled = true; };
  }, [projectId, activeCard?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start new conversation ────────────────────────────────────────────────

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
    dispatch(clearAiState());
  }, [dispatch]);

  // ── Persist messages to backend ───────────────────────────────────────────

  const _persistLock = useRef(false);
  const persistMessages = useCallback(
    async (msgs: ChatMessage[]) => {
      if (!projectId || msgs.length === 0) return;

      try {
        let convId = conversationIdRef.current;

        // Create conversation if needed (with lock to prevent duplicates)
        if (!convId) {
          if (_persistLock.current) return;
          _persistLock.current = true;
          try {
            const res = await axiosInstance.post('/ai/conversations', {
              projectId,
              cardId: activeCard?.id || null,
            });
            convId = res.data.id;
            conversationIdRef.current = convId;
            setConversationId(convId);
          } finally {
            _persistLock.current = false;
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
    [projectId, activeCard?.id, fetchConversations],
  );

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing, streamingStatus]);

  // ── When AI finishes, add assistant message and apply operations ───────────

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
  }, [isProcessing, lastResponse, pendingOperations.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── When AI returns with error only ───────────────────────────────────────

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
  }, [isProcessing, error]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit ────────────────────────────────────────────────────────────────

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
  }, [input, isProcessing, sendIntent, dispatch, persistMessages]);

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
    [sendIntent, dispatch, persistMessages],
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
    [conversationId, startNewConversation],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div id="ice-ai-panel" className="h-full flex flex-col bg-ice-surface border-ice-border border-[0] xl:border-l">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-ice-border shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-ice-accent" />
        <span className="text-ice-sm font-semibold text-ice-text-1">{t('ai.chat.title')}</span>
        {providerInfo?.ok && (
          <span
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none',
              providerInfo.isLocal
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-blue-500/15 text-blue-400',
            )}
            title={`Provider: ${providerInfo.provider} | Model: ${providerInfo.model || 'unknown'}`}
          >
            {providerInfo.isLocal ? <Cpu className="w-2.5 h-2.5" /> : <Cloud className="w-2.5 h-2.5" />}
            {providerInfo.isLocal ? 'Local' : 'Cloud'}
          </span>
        )}
        <span className="flex-1" />
        <button
          onClick={startNewConversation}
          className="p-1 rounded text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
          title={t('ai.chat.newChat')}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={cn(
            'relative p-1 rounded transition-colors',
            showHistory
              ? 'text-ice-accent bg-ice-accent/10'
              : 'text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover',
          )}
          title={t('ai.chat.historyTitle')}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {conversations.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-ice-accent text-[8px] font-bold text-white leading-none px-0.5">
              {conversations.length}
            </span>
          )}
        </button>
        <button
          onClick={() => dispatch(toggleAiChat())}
          className="p-1 rounded text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
          title={t('ai.chat.closeTitle')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Conversation history dropdown */}
      {showHistory && (
        <div className="border-b border-ice-border max-h-48 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-3 py-4 text-ice-xs text-ice-text-3 text-center">{t('ai.chat.noConversations')}</p>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-ice-hover transition-colors',
                  conversationId === conv.id && 'bg-ice-hover',
                )}
              >
                <MessageSquare className="w-3 h-3 text-ice-text-3 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-ice-xs text-ice-text-1 truncate">{conv.title || t('ai.chat.untitledConversation')}</p>
                  <p className="text-[10px] text-ice-text-3">
                    {conv._count.messages} {t('ai.chat.msgs')} · {formatDateTime(conv.updated_at)}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  className="p-0.5 rounded text-ice-text-3 hover:text-ice-red opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity"
                  title={t('ai.chat.deleteTitle')}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 &&
          !isProcessing &&
          (() => {
            const canvasNodes = activeCard?.nodes || [];
            const canvasEdges = activeCard?.edges || [];
            const patterns = suggestPatterns(canvasNodes as any, canvasEdges as any);
            return (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
                <Sparkles className="w-8 h-8 text-ice-text-3 opacity-40" />
                <p className="text-ice-sm text-ice-text-3 leading-relaxed">
                  {canvasNodes.length === 0
                    ? t('ai.chat.emptyCanvasPrompt')
                    : t('ai.chat.existingCanvasPrompt')}
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {patterns.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => handleSuggestionClick(p.intent)}
                      className="px-2.5 py-1 text-ice-xs bg-ice-raised border border-ice-border rounded-full text-ice-text-2 hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[90%] rounded-lg px-3 py-2',
                msg.role === 'user' ? 'bg-ice-accent/20 text-ice-text-1' : 'bg-ice-raised text-ice-text-1',
              )}
            >
              {msg.content.startsWith('AI_NOT_CONFIGURED:') ? (
                <div className="space-y-2">
                  <p className="text-ice-sm font-semibold text-amber-400">AI Not Available</p>
                  <p className="text-ice-xs text-ice-text-2 leading-relaxed">
                    No AI provider is running. Choose one of these options:
                  </p>
                  <div className="rounded border border-ice-border bg-ice-base px-2.5 py-2 space-y-1.5 text-ice-xs">
                    <div className="flex items-start gap-1.5">
                      <span className="text-ice-text-3 shrink-0">1.</span>
                      <span className="text-ice-text-2">
                        Set <span className="font-mono text-amber-400">ANTHROPIC_API_KEY=sk-ant-...</span> in{' '}
                        <span className="font-mono">.env</span> for Claude (recommended)
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-ice-text-3 shrink-0">2.</span>
                      <span className="text-ice-text-2">
                        Set <span className="font-mono text-amber-400">ICE_AI_URL</span> to a local model server (Ollama, LM Studio, etc.)
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-ice-text-3 shrink-0">3.</span>
                      <span className="text-ice-text-2">
                        Set <span className="font-mono text-amber-400">ICE_AI_URL</span> to any OpenAI-compatible endpoint (Ollama, LM Studio, etc.)
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-ice-text-3 shrink-0">4.</span>
                      <span className="text-ice-text-2">Restart the server</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-ice-sm leading-relaxed">{msg.content}</p>
              )}

              {msg.applied && msg.operations && msg.operations.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {msg.operations.slice(0, 5).map((op, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className={cn('px-1 py-0.5 rounded text-[9px] font-mono', opBadgeColor(op))}>
                        {op.op.startsWith('add') ? '+' : op.op.startsWith('delete') ? '×' : '~'}
                      </span>
                      <span className="text-ice-xs text-ice-text-2 truncate">{opSummary(op)}</span>
                    </div>
                  ))}
                  {msg.operations.length > 5 && (
                    <p className="text-ice-xs text-ice-text-3">+{msg.operations.length - 5} {t('ai.chat.more')}</p>
                  )}
                </div>
              )}

              {msg.applied && (
                <div className="flex items-center gap-1.5 mt-2">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-ice-xs text-emerald-400">
                    {t('ai.chat.appliedChanges')} {msg.operationCount || msg.operations?.length || 0} {t('ai.chat.changes')}
                  </span>
                </div>
              )}

              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msg.suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(s)}
                      className="flex items-center gap-1 px-2 py-0.5 text-ice-xs bg-ice-surface border border-ice-border rounded-full text-ice-text-2 hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
                    >
                      <ArrowRight className="w-2.5 h-2.5" />
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-ice-raised rounded-lg px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-ice-accent animate-spin" />
              <span className="text-ice-sm text-ice-text-3">{streamingStatus || t('ai.chat.thinking')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Undo bar */}
      {canUndo && (
        <div className="px-3 py-1.5 border-t border-ice-border flex items-center gap-2 shrink-0">
          <button
            id="ice-ai-btn-undo"
            onClick={undoAi}
            className="flex items-center gap-1.5 text-ice-xs text-ice-text-3 hover:text-ice-text-1 transition-colors"
          >
            <Undo2 className="w-3 h-3" />
            {t('ai.chat.undoLastAi')}
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-ice-border shrink-0">
        <div className="flex items-end gap-2 bg-ice-raised border border-ice-border rounded-lg px-3 py-2 focus-within:border-ice-accent transition-colors">
          <textarea
            id="ice-ai-input-message"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('ai.chat.inputPlaceholder')}
            rows={1}
            className="flex-1 bg-transparent text-ice-sm text-ice-text-1 placeholder:text-ice-text-3 outline-none resize-none max-h-20"
            disabled={isProcessing}
          />
          <button
            id="ice-ai-btn-send"
            onClick={handleSubmit}
            disabled={!input.trim() || isProcessing}
            className={cn(
              'p-1 rounded transition-colors shrink-0',
              input.trim() && !isProcessing ? 'text-ice-accent hover:bg-ice-accent/20' : 'text-ice-text-3 opacity-40',
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Collapsed bar — shown when the AI chat is collapsed
// =============================================================================

export const AiChatCollapsedBar: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  return (
    <button
      onClick={() => dispatch(toggleAiChat())}
      className="flex items-center gap-2 px-3 py-1.5 w-full bg-ice-surface border-t border-ice-border hover:bg-ice-hover transition-colors shrink-0"
    >
      <Sparkles className="w-3.5 h-3.5 text-ice-accent" />
      <span className="text-ice-sm font-medium text-ice-text-2 flex-1 text-left">{t('ai.chat.collapsedTitle')}</span>
      <ChevronUp className="w-3.5 h-3.5 text-ice-text-3 lg:hidden" />
      <ArrowRight className="w-3.5 h-3.5 text-ice-text-3 hidden lg:block" />
    </button>
  );
};
