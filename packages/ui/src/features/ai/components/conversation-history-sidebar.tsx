/**
 * ConversationHistorySidebar — collapsible list of saved conversations.
 *
 * Lifted from `ai-chat-panel.tsx` (the `{showHistory && <div ...>...}`
 * block). Renders an empty state when the project has no conversations,
 * otherwise a clickable row per conversation with title, message count,
 * relative timestamp, and a hover-revealed delete button.
 *
 * The active conversation is highlighted via `conversationId === conv.id`.
 * Keyboard support (Enter to select) is preserved verbatim.
 *
 * Component renders nothing wrapping when `showHistory` is false — the
 * orchestrator controls whether the sidebar mounts via that prop, but the
 * panel border + scroll container live inside this component so the
 * orchestrator doesn't have to know about layout details.
 */

import { Trash2 } from 'lucide-react';
import React from 'react';
import { cn } from '../../../shared/utils/cn';
import { formatDateTime } from '../utils/format-date-time';
import type { ConversationSummary } from '../hooks/use-chat-handlers';

export interface ConversationHistorySidebarProps {
  show: boolean;
  conversations: ConversationSummary[];
  conversationId: string | null;
  t: (key: string) => string;
  onLoadConversation: (id: string) => void;
  onDeleteConversation: (id: string, e: React.MouseEvent) => void;
}

export const ConversationHistorySidebar: React.FC<ConversationHistorySidebarProps> = ({
  show,
  conversations,
  conversationId,
  t,
  onLoadConversation,
  onDeleteConversation,
}) => {
  if (!show) return null;

  return (
    <div className="border-b border-ice-border max-h-48 overflow-y-auto">
      {conversations.length === 0 ? (
        <p className="px-3 py-4 text-ice-xs text-ice-text-3/50 text-center">{t('ai.chat.noConversations')}</p>
      ) : (
        conversations.map((conv) => (
          <div
            key={conv.id}
            role="button"
            tabIndex={0}
            onClick={() => onLoadConversation(conv.id)}
            onKeyDown={(e) => e.key === 'Enter' && onLoadConversation(conv.id)}
            className={cn(
              'group flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors cursor-pointer',
              conversationId === conv.id ? 'text-ice-text-1' : 'text-ice-text-3 hover:text-ice-text-2',
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-ice-xs truncate">{conv.title || t('ai.chat.untitledConversation')}</p>
              <p className="text-ice-2xs text-ice-text-3/40">
                {conv._count.messages} {t('ai.chat.msgs')} · {formatDateTime(conv.updated_at)}
              </p>
            </div>
            <button
              onClick={(e) => onDeleteConversation(conv.id, e)}
              aria-label={t('ai.chat.deleteTitle')}
              className="p-0.5 rounded text-ice-text-3/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              <Trash2 aria-hidden="true" className="w-3 h-3" />
            </button>
          </div>
        ))
      )}
    </div>
  );
};
