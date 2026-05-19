/**
 * AI Chat Panel — Orchestrator
 *
 * Always-visible chat interface for natural language canvas operations.
 * Conversations persisted in the backend, scoped per org → project → user.
 * Supports conversation list, new chat, and resume.
 *
 * Sub-component splits (rf-aichat series):
 *   - `../utils/format-date-time.ts`           — formatDateTime (rf-aichat-1)
 *   - `../utils/op-display.ts`                 — opSummary + opBadgeColor (rf-aichat-2)
 *   - `../hooks/use-chat-handlers.ts`          — 8 callbacks (rf-aichat-3)
 *   - `../hooks/use-chat-effects.ts`           — 5 effects (rf-aichat-4)
 *   - `./message-row.tsx`                      — single chat bubble (rf-aichat-5)
 *   - `./conversation-history-sidebar.tsx`     — history dropdown (rf-aichat-6)
 *   - `./empty-state.tsx`                      — pre-conversation hint (rf-aichat-7)
 */

import { Sparkles, Loader2, Undo2, Send, Plus, MessageSquare, Cpu, Cloud, KeyRound } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ConversationHistorySidebar } from './conversation-history-sidebar';
import { EmptyState } from './empty-state';
import { MessageRow } from './message-row';
import { AnthropicConnectModal } from '../../../features/integrations/components/anthropic-connect-modal';
import { useTranslation } from '../../../i18n';
import { PanelHeader, PanelHeaderAction } from '../../../shared/components/ui/panel-header';
import { cn } from '../../../shared/utils/cn';
import { selectActiveCard } from '../../../store/slices/cards-slice';
import { toggleAiChat } from '../../../store/slices/ui-slice';
import { useAiCommand } from '../hooks/use-ai-command';
import { useChatEffects, type ProviderInfo } from '../hooks/use-chat-effects';
import { useChatHandlers, type ChatMessage, type ConversationSummary } from '../hooks/use-chat-handlers';
import type { AppDispatch, RootState } from '../../../store';

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
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null);
  const [showAnthropicModal, setShowAnthropicModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // `providerInfo === null` is the still-loading state (the health probe
  // is in-flight). `providerInfo.ok === false` is the real "no key
  // configured" state we want to surface to the user. We don't gate the
  // chat on `null` to avoid a flash of the disconnected CTA before the
  // first health probe resolves.
  const aiDisconnected = providerInfo !== null && !providerInfo.ok;

  // ── Handlers (extracted to useChatHandlers — rf-aichat-3) ─────────────────

  const persistLockRef = useRef(false);
  const {
    loadConversation,
    fetchConversations,
    startNewConversation,
    persistMessages,
    handleSubmit,
    handleKeyDown,
    handleSuggestionClick,
    handleDeleteConversation,
  } = useChatHandlers({
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
  });

  // ── Effects (extracted to useChatEffects — rf-aichat-4) ───────────────────

  useChatEffects({
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
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div id="ice-ai-panel" className="h-full flex flex-col bg-inherit border-ice-border border-[0] xl:border-l">
      {/* Header */}
      <PanelHeader
        icon={<Sparkles aria-hidden="true" className="w-3.5 h-3.5 text-ice-accent" />}
        title={t('ai.chat.title')}
        badge={
          providerInfo?.ok ? (
            <span
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-ice-2xs font-medium leading-none min-w-0 truncate',
                providerInfo.isLocal ? 'text-emerald-400/60' : 'text-blue-400/60',
              )}
              title={`Provider: ${providerInfo.provider} | Model: ${providerInfo.model || 'unknown'}`}
            >
              {providerInfo.isLocal ? (
                <Cpu aria-hidden="true" className="w-2.5 h-2.5 shrink-0" />
              ) : (
                <Cloud aria-hidden="true" className="w-2.5 h-2.5 shrink-0" />
              )}
              {providerInfo.model || (providerInfo.isLocal ? 'Local' : 'Cloud')}
            </span>
          ) : aiDisconnected ? (
            <button
              type="button"
              onClick={() => setShowAnthropicModal(true)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-ice-2xs font-medium leading-none text-amber-500 hover:bg-amber-500/10 transition-colors"
              title={t('ai.chat.disconnectedBadgeTooltip')}
            >
              <KeyRound aria-hidden="true" className="w-2.5 h-2.5 shrink-0" />
              {t('ai.chat.disconnectedBadge')}
            </button>
          ) : undefined
        }
        actions={
          <>
            <PanelHeaderAction
              icon={<Plus aria-hidden="true" className="w-3.5 h-3.5" />}
              label={t('ai.chat.newChat')}
              onClick={startNewConversation}
            />
            <PanelHeaderAction
              icon={<MessageSquare aria-hidden="true" className="w-3.5 h-3.5" />}
              label={t('ai.chat.historyTitle')}
              onClick={() => setShowHistory(!showHistory)}
              active={showHistory}
              badge={conversations.length > 0}
            />
          </>
        }
        onClose={() => dispatch(toggleAiChat())}
        closeLabel={t('ai.chat.closeTitle')}
      />

      {/* Conversation history dropdown */}
      <ConversationHistorySidebar
        show={showHistory}
        conversations={conversations}
        conversationId={conversationId}
        t={t}
        onLoadConversation={loadConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {aiDisconnected && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <KeyRound aria-hidden="true" className="w-5 h-5 text-amber-500" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-ice-text-1">{t('ai.chat.disconnectedTitle')}</p>
              <p className="text-ice-xs text-ice-text-3 max-w-[220px]">{t('ai.chat.disconnectedDesc')}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAnthropicModal(true)}
              className="ice-btn ice-btn-primary text-xs"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              {t('ai.chat.connectClaude')}
            </button>
          </div>
        )}

        {!aiDisconnected && messages.length === 0 && !isProcessing && (
          <EmptyState activeCard={activeCard} t={t} onSuggestionClick={handleSuggestionClick} />
        )}

        {messages.map((msg) => (
          <MessageRow key={msg.id} msg={msg} t={t} onSuggestionClick={handleSuggestionClick} />
        ))}

        {isProcessing && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-ice-raised">
            <Loader2 aria-hidden="true" className="w-3.5 h-3.5 text-ice-accent animate-spin" />
            <span className="text-ice-xs text-ice-text-2">{streamingStatus || t('ai.chat.thinking')}</span>
          </div>
        )}
      </div>

      {/* Undo bar */}
      {canUndo && (
        <div className="px-3 py-1.5 border-t border-ice-border/50 flex items-center shrink-0">
          <button
            id="ice-ai-btn-undo"
            onClick={undoAi}
            className="flex items-center gap-1.5 text-ice-2xs text-ice-text-3/50 hover:text-ice-text-1 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            <Undo2 aria-hidden="true" className="w-3 h-3" />
            {t('ai.chat.undoLastAi')}
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-3 shrink-0">
        <div className="relative rounded-2xl bg-white/[0.07] focus-within:bg-white/[0.09] transition-colors">
          <textarea
            id="ice-ai-input-message"
            ref={inputRef}
            name="ai-message"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder={aiDisconnected ? t('ai.chat.disconnectedPlaceholder') : t('ai.chat.inputPlaceholder')}
            rows={1}
            className="w-full bg-transparent text-ice-sm text-ice-text-1 placeholder:text-ice-text-3/40 outline-none resize-none pl-4 pr-12 py-3 min-h-[44px]"
            disabled={isProcessing || aiDisconnected}
          />
          <button
            id="ice-ai-btn-send"
            aria-label={t('ai.chat.sendMessage')}
            onClick={handleSubmit}
            disabled={!input.trim() || isProcessing || aiDisconnected}
            className={cn(
              'absolute right-2 bottom-2 p-2 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-ice-accent',
              input.trim() && !isProcessing
                ? 'bg-ice-accent text-white shadow-lg shadow-ice-accent/25 hover:scale-105 active:scale-95'
                : 'text-ice-text-3/20',
            )}
          >
            {isProcessing ? (
              <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-center text-ice-2xs text-ice-text-3/30 mt-1.5">{t('ai.chat.inputHint')}</p>
      </div>
      <AnthropicConnectModal isOpen={showAnthropicModal} onClose={() => setShowAnthropicModal(false)} />
    </div>
  );
};
