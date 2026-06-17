/**
 * PlanPreview
 *
 * Renders a plan summary table for `creates`, `updates`, `deletes`, and
 * `skipped` resources, plus an optional warnings panel. When all four lists
 * are empty, renders a centered "no changes" empty state.
 *
 * `ChangeRow` is a file-private helper used only by `PlanPreview` — kept
 * non-exported so the public surface stays a single named export. The
 * `(s: any)` cast in the skipped branch is verbatim from the pre-extraction
 * source: the Redux `DeployPlan` type pins skipped to `{ name; reason }` but
 * runtime entries also carry `label` and `nodeId`, and the union resolves
 * via short-circuit (`s.name || s.label || s.nodeId`). Tightening the cast
 * is a behavior change.
 */

import { Eye, Plus, RefreshCw, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import type { DeployPlan } from '../../../store/slices/deploy-slice';

export const PlanPreview: React.FC<{ plan: DeployPlan; destination?: string }> = ({ plan, destination }) => {
  const { t } = useTranslation();
  const creates = Array.isArray(plan.creates) ? plan.creates : [];
  const updates = Array.isArray(plan.updates) ? plan.updates : [];
  const deletes = Array.isArray(plan.deletes) ? plan.deletes : [];
  const skipped = Array.isArray(plan.skipped) ? plan.skipped : [];
  const total = creates.length + updates.length + deletes.length;

  if (total === 0 && skipped.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground text-center">
        {destination && (
          <div className="text-xs mb-1 text-muted-foreground" data-testid="ice-plan-destination">
            {t('deploy.plan.destination', { target: destination })}
          </div>
        )}
        {t('deploy.plan.noChanges')}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="px-4 py-2 bg-muted/40 border-b border-border text-sm font-medium flex items-center gap-2">
        <Eye className="w-3.5 h-3.5" />
        {t('deploy.plan.changes', { total })}
      </div>
      {/* DF2 — make the plan self-describing: what destination it targets. */}
      {destination && (
        <div
          data-testid="ice-plan-destination"
          className="px-4 py-1.5 bg-muted/20 border-b border-border text-xs text-muted-foreground"
        >
          {t('deploy.plan.destination', { target: destination })}
        </div>
      )}
      <div className="divide-y divide-border max-h-64 overflow-y-auto">
        {creates.map((r, i) => (
          <ChangeRow key={`c-${i}`} name={r.name} type={r.type} action="create" />
        ))}
        {updates.map((r, i) => (
          <ChangeRow key={`u-${i}`} name={r.name} type={r.type} action="update" />
        ))}
        {deletes.map((r, i) => (
          <ChangeRow key={`d-${i}`} name={r.name} type={r.type} action="delete" />
        ))}
        {skipped.map((s: any, i) => (
          <div key={`s-${i}`} className="px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <span className="w-16 text-gray-500">{t('deploy.plan.skip')}</span>
            <span>{s.name || s.label || s.nodeId}</span>
            <span className="ml-auto text-gray-500">{s.reason}</span>
          </div>
        ))}
      </div>
      {Array.isArray(plan.warnings) && plan.warnings.length > 0 && (
        <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/10 border-t border-border">
          {plan.warnings.map((w, i) => (
            <div key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ChangeRow: React.FC<{
  name: string;
  type: string;
  action: 'create' | 'update' | 'delete';
}> = ({ name, type, action }) => {
  const icons = {
    create: <Plus className="w-3 h-3 text-emerald-500" />,
    update: <RefreshCw className="w-3 h-3 text-blue-500" />,
    delete: <Trash2 className="w-3 h-3 text-red-500" />,
  };
  const labels = {
    create: 'text-emerald-600 dark:text-emerald-400',
    update: 'text-blue-600 dark:text-blue-400',
    delete: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="px-4 py-2 text-sm flex items-center gap-2.5">
      {icons[action]}
      <span className={cn('w-16 text-xs font-medium', labels[action])}>{action}</span>
      <span className="font-medium">{name}</span>
      <span className="ml-auto text-xs text-muted-foreground font-mono">{type}</span>
    </div>
  );
};
