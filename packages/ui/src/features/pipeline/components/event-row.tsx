/**
 * rf-ppanel-5 — EventRow.
 *
 * Deployment-history row with collapsible expand-to-show-logs body.
 * Displays the commit sha, message, environment/branch, relative time,
 * and a chevron. Click anywhere on the row to toggle the inline logs.
 *
 * The status icon swaps between Circle (filled per-status), Loader2
 * (animated), and per-step CheckCircle/XCircle/Circle inside the
 * expanded body.
 */

import { ChevronDown, CheckCircle, XCircle, Circle, Loader2 } from 'lucide-react';
import React, { useState } from 'react';

import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import type { DeploymentEvent, DeployStep } from '../../../store/slices/pipeline-slice';
import { formatRelativeTime, formatDuration } from '../utils/format';

export interface EventRowProps {
  event: DeploymentEvent;
}

export const EventRow: React.FC<EventRowProps> = ({ event }) => {
  const { t } = useTranslation();
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="rounded-md border border-ice-border overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-ice-hover transition-colors"
        onClick={() => setShowLogs(!showLogs)}
      >
        {/* Status icon */}
        {event.status === 'success' ? (
          <Circle className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500 flex-shrink-0" />
        ) : event.status === 'failed' ? (
          <Circle className="w-2.5 h-2.5 fill-red-500 text-red-500 flex-shrink-0" />
        ) : event.status === 'cancelled' ? (
          <Circle className="w-2.5 h-2.5 fill-ice-text-3 text-ice-text-3 flex-shrink-0" />
        ) : (
          <Loader2 className="w-2.5 h-2.5 text-blue-500 animate-spin flex-shrink-0" />
        )}

        {/* Commit */}
        <span className="font-mono text-ice-text-2">{event.commit_sha.slice(0, 7)}</span>
        <span className="text-ice-text-2 truncate flex-1">{event.commit_message}</span>

        {/* Metadata */}
        <span className="text-ice-text-3 flex-shrink-0">{event.rule?.environment || event.branch}</span>
        <span className="text-ice-text-3 flex-shrink-0">{formatRelativeTime(event.started_at)}</span>

        <ChevronDown
          className={cn('w-3 h-3 text-ice-text-3 transition-transform flex-shrink-0', showLogs && 'rotate-180')}
        />
      </div>

      {/* Expanded logs */}
      {showLogs && (
        <div className="border-t border-ice-border bg-slate-950 p-2 space-y-0.5 max-h-32 overflow-y-auto">
          {((event.deployment_logs || []) as DeployStep[]).map((log, i) => (
            <div key={i} className="flex items-center gap-1.5 text-ice-xs font-mono">
              {log.status === 'completed' ? (
                <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              ) : log.status === 'failed' ? (
                <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
              ) : (
                <Circle className="w-3 h-3 text-slate-500 flex-shrink-0" />
              )}
              <span className={cn(log.status === 'failed' ? 'text-red-400' : 'text-slate-300')}>{log.message}</span>
            </div>
          ))}
          {event.error && (
            <div className="text-ice-xs font-mono text-red-400 mt-1 pt-1 border-t border-slate-800">{event.error}</div>
          )}
          {event.duration_seconds && (
            <div className="text-ice-xs font-mono text-slate-500 mt-1">
              {t('pipeline.duration')} {formatDuration(event.duration_seconds)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
