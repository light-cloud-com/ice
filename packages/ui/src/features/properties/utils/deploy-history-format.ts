/**
 * Deploy-history row formatting.
 *
 * Each row in the DeployHistory section needs the same derivations off a
 * deployment record: a localized timestamp, a human duration, status flags
 * (success / failed / partial / pending), an action label+color, and a
 * comma-joined summary line of created/updated/deleted/failed counts. The
 * inline derivation block lived in `properties-panel.tsx` and is hoisted
 * here verbatim so it can be unit-tested without rendering React.
 *
 * Action label/color tables and the unknown-action-type fallback (which
 * matches the `plan` color exactly — `'text-slate-400 bg-slate-950/30'`) are
 * preserved as-is from the original component.
 */

export const ACTION_LABELS: Record<string, string> = {
  plan: 'Plan',
  apply: 'Deploy',
  destroy: 'Destroy',
  rollback: 'Rollback',
};

export const ACTION_COLORS: Record<string, string> = {
  plan: 'text-slate-400 bg-slate-950/30',
  apply: 'text-blue-400 bg-blue-950/30',
  destroy: 'text-orange-400 bg-orange-950/30',
  rollback: 'text-purple-400 bg-purple-950/30',
};

export interface DeployHistoryFormatted {
  time: string;
  duration: string;
  isSuccess: boolean;
  isFailed: boolean;
  isPartial: boolean;
  isPending: boolean;
  actionType: string;
  actionLabel: string;
  actionColor: string;
  summaryText: string;
}

export function formatDeployRow(d: {
  created_at: string | Date;
  duration_ms?: number;
  status?: string;
  action_type?: string;
  summary?: Record<string, number> | null;
}): DeployHistoryFormatted {
  const date = new Date(d.created_at);
  const time = date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const duration = d.duration_ms ? `${(d.duration_ms / 1000).toFixed(1)}s` : '';
  const isSuccess = d.status === 'success';
  const isFailed = d.status === 'failed' || d.status === 'cancelled';
  const isPartial = d.status === 'partial';
  const isPending = d.status === 'deploying' || d.status === 'planning' || d.status === 'planned';
  const actionType = (d.action_type as string) || 'apply';
  const actionLabel = ACTION_LABELS[actionType] || actionType;
  const actionColor = ACTION_COLORS[actionType] || 'text-slate-400 bg-slate-950/30';
  const summary = (d.summary as Record<string, number> | null) || null;
  const summaryText = summary
    ? [
        summary.created > 0 ? `${summary.created} created` : null,
        summary.updated > 0 ? `${summary.updated} updated` : null,
        summary.deleted > 0 ? `${summary.deleted} deleted` : null,
        summary.failed > 0 ? `${summary.failed} failed` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return {
    time,
    duration,
    isSuccess,
    isFailed,
    isPartial,
    isPending,
    actionType,
    actionLabel,
    actionColor,
    summaryText,
  };
}
