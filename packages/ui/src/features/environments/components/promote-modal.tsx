/**
 * Promote Modal — Shows diff between source env and production, confirms promotion
 */

import { ArrowUpRight, Plus, Minus, RefreshCw, Loader2, CheckCircle } from 'lucide-react';
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { cn } from '../../../shared/utils/cn';
import {
  promoteEnvironment,
  clearPendingDiff,
  fetchEnvironments,
} from '../../../store/slices/environments-slice';
import type { RootState, AppDispatch } from '../../../store';

export const PromoteModal: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const pendingDiff = useSelector((s: RootState) => s.environments.pendingDiff);
  const pendingPromote = useSelector((s: RootState) => s.environments.pendingPromote);
  const promoting = useSelector((s: RootState) => s.environments.promoting);
  const allEnvs = useSelector((s: RootState) => s.environments.byProject);

  if (!pendingDiff || !pendingPromote) return null;

  // Find env names for display
  let sourceName = 'source';
  let targetName = 'production';
  let projectId = '';
  for (const [pId, envs] of Object.entries(allEnvs)) {
    const source = envs.find((e) => e.id === pendingPromote.sourceEnvId);
    const target = envs.find((e) => e.id === pendingPromote.targetEnvId);
    if (source) {
      sourceName = source.name;
      projectId = pId;
    }
    if (target) targetName = target.name;
  }

  const totalChanges = pendingDiff.added.length + pendingDiff.removed.length + pendingDiff.modified.length;
  const noChanges = totalChanges === 0;

  const handlePromote = async () => {
    await dispatch(
      promoteEnvironment({
        sourceEnvId: pendingPromote.sourceEnvId,
        targetEnvId: pendingPromote.targetEnvId,
      }),
    );
    if (projectId) dispatch(fetchEnvironments(projectId));
  };

  const handleClose = () => dispatch(clearPendingDiff());

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div
        className="w-[480px] max-h-[70vh] bg-ice-surface border border-ice-border rounded-lg shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-ice-border">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-semibold text-ice-text-1">
              Promote <span className="text-amber-500">{sourceName}</span> to{' '}
              <span className="text-emerald-500">{targetName}</span>
            </h2>
          </div>
          <p className="text-ice-xs text-ice-text-3 mt-1">
            {noChanges
              ? 'Both environments are identical. Nothing to promote.'
              : `${totalChanges} change${totalChanges !== 1 ? 's' : ''} will be applied to ${targetName}.`}
          </p>
        </div>

        {/* Diff list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {noChanges ? (
            <div className="flex flex-col items-center justify-center py-8 text-ice-text-3">
              <CheckCircle className="w-8 h-8 mb-2 text-emerald-500" />
              <p className="text-sm">Environments are in sync</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Added nodes */}
              {pendingDiff.added.map((item) => (
                <DiffRow key={item.nodeId} type="added" label={item.label} iceType={item.iceType} />
              ))}

              {/* Modified nodes */}
              {pendingDiff.modified.map((item) => (
                <DiffRow
                  key={item.nodeId}
                  type="modified"
                  label={item.label}
                  iceType={item.iceType}
                  detail={item.changedFields?.join(', ')}
                />
              ))}

              {/* Removed nodes */}
              {pendingDiff.removed.map((item) => (
                <DiffRow key={item.nodeId} type="removed" label={item.label} iceType={item.iceType} />
              ))}

              {/* Unchanged count */}
              {pendingDiff.unchangedCount > 0 && (
                <div className="text-ice-xs text-ice-text-3 pt-2 border-t border-ice-border mt-2">
                  {pendingDiff.unchangedCount} node{pendingDiff.unchangedCount !== 1 ? 's' : ''} unchanged
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ice-border">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-ice-sm text-ice-text-3 hover:text-ice-text-2 transition-colors"
          >
            Cancel
          </button>
          {!noChanges && (
            <button
              onClick={handlePromote}
              disabled={promoting}
              className="flex items-center gap-1.5 px-4 py-1.5 text-ice-sm font-medium rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {promoting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
              Promote to {targetName}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Diff Row ───────────────────────────────────────────────────────────────

const DiffRow: React.FC<{
  type: 'added' | 'removed' | 'modified';
  label: string;
  iceType: string;
  detail?: string;
}> = ({ type, label, iceType, detail }) => {
  const config = {
    added: {
      icon: Plus,
      color: 'text-emerald-500',
      border: 'border-l-emerald-500',
      bg: 'bg-emerald-500/5',
      tag: 'added',
    },
    removed: { icon: Minus, color: 'text-red-500', border: 'border-l-red-500', bg: 'bg-red-500/5', tag: 'removed' },
    modified: {
      icon: RefreshCw,
      color: 'text-amber-500',
      border: 'border-l-amber-500',
      bg: 'bg-amber-500/5',
      tag: 'changed',
    },
  }[type];

  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded border-l-2 text-ice-xs', config.border, config.bg)}>
      <Icon className={cn('w-3 h-3 shrink-0', config.color)} />
      <span className="font-medium text-ice-text-1">{label}</span>
      <span className="text-ice-text-3 font-mono">{iceType}</span>
      {detail && (
        <span className="text-ice-text-3 ml-auto truncate max-w-[120px]" title={detail}>
          {detail}
        </span>
      )}
      <span className={cn('ml-auto text-[10px] font-semibold uppercase', config.color)}>{config.tag}</span>
    </div>
  );
};
