import { AlertCircle, AlertTriangle, Info, CheckSquare, Square } from 'lucide-react';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { cn } from '../../../shared/utils/cn';
import {
  acknowledgeCritical,
  dismissPreDeployWarning,
} from '../../../store/slices/deploy-slice';
import type { PreDeployAnalysis, PreDeployWarning } from '../utils/predeploy-analysis';
import type { RootState, AppDispatch } from '../../../store';

function SeverityIcon({ severity }: { severity: PreDeployWarning['severity'] }) {
  if (severity === 'critical') return <AlertCircle className="w-4 h-4 text-red-500" />;
  if (severity === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <Info className="w-4 h-4 text-blue-400" />;
}

function severityClasses(severity: PreDeployWarning['severity']): string {
  if (severity === 'critical') return 'border-red-500/30 bg-red-500/5';
  if (severity === 'warning') return 'border-amber-500/30 bg-amber-500/5';
  return 'border-blue-500/30 bg-blue-500/5';
}

interface PreDeployWarningsProps {
  analysis: PreDeployAnalysis;
}

export const PreDeployWarnings: React.FC<PreDeployWarningsProps> = ({ analysis }) => {
  const dispatch = useDispatch<AppDispatch>();
  const dismissed = useSelector((s: RootState) => s.deploy.dismissedWarnings);
  const acknowledged = useSelector((s: RootState) => s.deploy.criticalAcknowledged);

  const visible = analysis.warnings.filter((w) => !dismissed.includes(w.id));
  const criticals = visible.filter((w) => w.severity === 'critical');
  const warnings = visible.filter((w) => w.severity === 'warning');
  const infos = visible.filter((w) => w.severity === 'info');

  if (visible.length === 0 && analysis.costEstimates.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-ice-border bg-ice-surface p-3">
      <div className="text-ice-xs font-semibold text-ice-text-1">Pre-deploy check</div>

      {[...criticals, ...warnings, ...infos].map((w) => (
        <div
          key={w.id}
          className={cn('flex items-start gap-2 rounded border p-2.5', severityClasses(w.severity))}
        >
          <SeverityIcon severity={w.severity} />
          <div className="flex-1 min-w-0">
            <div className="text-ice-xs font-medium text-ice-text-1">{w.title}</div>
            <div className="text-ice-2xs text-ice-text-2 mt-0.5">{w.description}</div>
          </div>
          {w.dismissible && (
            <button
              onClick={() => dispatch(dismissPreDeployWarning(w.id))}
              className="text-ice-2xs text-ice-text-3 hover:text-ice-text-2"
            >
              Dismiss
            </button>
          )}
        </div>
      ))}

      {analysis.hasCritical && criticals.length > 0 && (
        <label className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 p-2.5 text-ice-xs text-ice-text-1 cursor-pointer">
          <button
            onClick={() => dispatch(acknowledgeCritical(!acknowledged))}
            className="mt-0.5"
            aria-label="Acknowledge critical warnings"
          >
            {acknowledged ? (
              <CheckSquare className="w-4 h-4 text-red-500" />
            ) : (
              <Square className="w-4 h-4 text-red-500" />
            )}
          </button>
          <span>
            I understand the {criticals.length} critical issue{criticals.length === 1 ? '' : 's'} above and want to deploy anyway.
          </span>
        </label>
      )}

      {analysis.costEstimates.length > 0 && (
        <div className="mt-2 pt-2 border-t border-ice-border">
          <div className="flex items-center justify-between text-ice-xs mb-1.5">
            <span className="font-medium text-ice-text-1">Estimated monthly cost</span>
            <span className="font-mono text-ice-text-1">~${analysis.totalMonthlyCost.toFixed(2)}</span>
          </div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {analysis.costEstimates.map((e) => (
              <div key={e.nodeId} className="flex items-center justify-between text-ice-2xs text-ice-text-3">
                <span className="truncate">{e.resourceName}</span>
                <span className="font-mono shrink-0 pl-2">${e.monthlyEstimate.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="text-ice-2xs text-ice-text-3 mt-1 italic">
            Rough estimates based on GCP list prices. Actual cost varies with usage.
          </div>
        </div>
      )}
    </div>
  );
};
