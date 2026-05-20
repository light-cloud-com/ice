/**
 * MessageRow — single chat message bubble.
 *
 * Lifted from `ai-chat-panel.tsx` (the `messages.map((msg) => ...)` block).
 * Renders user / assistant message bubbles with optional applied-operations
 * preview, applied-changes confirmation, and suggestion buttons.
 *
 * The "AI_NOT_CONFIGURED:" content prefix triggers the in-place provider
 * setup hint card; everything else renders as plain `<p>` text.
 *
 * Behavior verbatim from the orchestrator:
 *   - applied-operations preview: shows up to 5, then "+N more"
 *   - applied confirmation: shows operationCount OR operations.length OR 0
 *   - suggestions: clicking calls onSuggestionClick(suggestion)
 */

import { ArrowRight, Check } from 'lucide-react';
import React from 'react';
import { cn } from '../../../shared/utils/cn';
import { opBadgeColor, opSummary } from '../utils/op-display';
import type { ChatMessage } from '../hooks/use-chat-handlers';

export interface MessageRowProps {
  msg: ChatMessage;
  t: (key: string) => string;
  onSuggestionClick: (suggestion: string) => void;
}

export const MessageRow: React.FC<MessageRowProps> = ({ msg, t, onSuggestionClick }) => {
  return (
    <div className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] px-3.5 py-2.5',
          msg.role === 'user'
            ? 'rounded-2xl rounded-br-md bg-ice-accent text-white'
            : 'rounded-2xl rounded-bl-md bg-white/[0.07] text-ice-text-1',
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
                  Set <span className="font-mono text-amber-400">ICE_AI_URL</span> to a local model server (Ollama, LM
                  Studio, etc.)
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-ice-text-3 shrink-0">3.</span>
                <span className="text-ice-text-2">
                  Set <span className="font-mono text-amber-400">ICE_AI_URL</span> to any OpenAI-compatible endpoint
                  (Ollama, LM Studio, etc.)
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
                <span className={cn('px-1 py-0.5 rounded text-ice-2xs font-mono', opBadgeColor(op))}>
                  {op.op.startsWith('add') ? '+' : op.op.startsWith('delete') ? '×' : '~'}
                </span>
                <span className="text-ice-xs text-ice-text-2 truncate">{opSummary(op)}</span>
              </div>
            ))}
            {msg.operations.length > 5 && (
              <p className="text-ice-xs text-ice-text-3">
                +{msg.operations.length - 5} {t('ai.chat.more')}
              </p>
            )}
          </div>
        )}

        {msg.applied && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <Check aria-hidden="true" className="w-3 h-3 text-emerald-400/60" />
            <span className="text-ice-2xs text-emerald-400/60">
              {t('ai.chat.appliedChanges')} {msg.operationCount || msg.operations?.length || 0} {t('ai.chat.changes')}
            </span>
          </div>
        )}

        {msg.suggestions && msg.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {msg.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(s)}
                className="flex items-center gap-1 px-2 py-1 text-ice-xs text-ice-text-2 rounded-md border border-ice-border hover:border-ice-accent/40 hover:text-ice-text-1 hover:bg-ice-accent/5 transition-colors"
              >
                <ArrowRight aria-hidden="true" className="w-2.5 h-2.5 text-ice-accent" />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
