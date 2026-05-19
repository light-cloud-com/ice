/**
 * EmptyState — pre-conversation hint card.
 *
 * Lifted from the IIFE inside `ai-chat-panel.tsx` that rendered when
 * `messages.length === 0 && !isProcessing`. Shows the Sparkles icon, a
 * locale-aware prompt that adapts based on whether the active canvas is
 * empty, and a row of pre-baked pattern suggestion buttons.
 *
 * The pattern list comes from `suggestPatterns(nodes, edges)` which the
 * orchestrator was passing the active card's nodes/edges into. Keeping
 * that call site here means the orchestrator doesn't have to know about
 * the suggestion shape at all.
 */

import { Sparkles } from 'lucide-react';
import React from 'react';
import { suggestPatterns } from '../utils/suggest-patterns';
import type { Card } from '../../../store/slices/cards-slice';

export interface EmptyStateProps {
  activeCard: Card | null | undefined;
  t: (key: string) => string;
  onSuggestionClick: (intent: string) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ activeCard, t, onSuggestionClick }) => {
  const canvasNodes = activeCard?.nodes || [];
  const canvasEdges = activeCard?.edges || [];
  const patterns = suggestPatterns(canvasNodes as any, canvasEdges as any);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-4">
      <div className="w-10 h-10 rounded-xl bg-ice-accent/10 flex items-center justify-center">
        <Sparkles aria-hidden="true" className="w-5 h-5 text-ice-accent" />
      </div>
      <p className="text-ice-xs text-ice-text-3 leading-relaxed max-w-[220px]">
        {canvasNodes.length === 0 ? t('ai.chat.emptyCanvasPrompt') : t('ai.chat.existingCanvasPrompt')}
      </p>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {patterns.map((p) => (
          <button
            key={p.label}
            onClick={() => onSuggestionClick(p.intent)}
            className="px-2.5 py-1 text-ice-xs text-ice-text-2 rounded-lg border border-ice-border hover:border-ice-accent/40 hover:text-ice-text-1 hover:bg-ice-accent/5 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};
