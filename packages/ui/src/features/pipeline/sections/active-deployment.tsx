/**
 * rf-ppanel-7 — ActiveDeployment.
 *
 * Live deploy progress display: stage label, percentage, animated progress
 * bar, optional commit info row, and a scrollable log step list.
 *
 * The progress bar's color flips between red (status === 'failed') and
 * emerald (everything else). Each log step renders one of three icons:
 * CheckCircle (completed), XCircle (failed), Loader2 (anything else,
 * spinning).
 */

import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import React from 'react';
import { cn } from '../../../shared/utils/cn';
import type { DeployStep } from '../../../store/slices/pipeline-slice';

export interface ActiveDeploymentProps {
  status: { status: string; stage?: string; progress?: number; commitSha?: string; commitMessage?: string };
  logs: DeployStep[];
}

export const ActiveDeployment: React.FC<ActiveDeploymentProps> = ({ status, logs }) => (
  <div className="space-y-2">
    {/* Progress bar */}
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ice-text-2">{status.stage || status.status}</span>
        <span className="font-mono text-ice-text-3">{status.progress || 0}%</span>
      </div>
      <div className="h-1.5 bg-ice-border rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            status.status === 'failed' ? 'bg-red-500' : 'bg-emerald-500',
          )}
          style={{ width: `${status.progress || 0}%` }}
        />
      </div>
    </div>

    {/* Commit info */}
    {status.commitSha && (
      <div className="text-xs text-ice-text-3 font-mono truncate">
        {status.commitSha.slice(0, 7)} {status.commitMessage}
      </div>
    )}

    {/* Log steps */}
    {logs.length > 0 && (
      <div className="rounded-md border border-ice-border bg-slate-950 p-2 space-y-0.5 max-h-40 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i} className="flex items-center gap-1.5 text-ice-xs font-mono">
            {log.status === 'completed' ? (
              <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
            ) : log.status === 'failed' ? (
              <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
            ) : (
              <Loader2 className="w-3 h-3 text-blue-400 animate-spin flex-shrink-0" />
            )}
            <span className={cn(log.status === 'failed' ? 'text-red-400' : 'text-slate-300')}>{log.message}</span>
            {log.duration_ms && <span className="ml-auto text-slate-500">{(log.duration_ms / 1000).toFixed(1)}s</span>}
          </div>
        ))}
      </div>
    )}
  </div>
);
