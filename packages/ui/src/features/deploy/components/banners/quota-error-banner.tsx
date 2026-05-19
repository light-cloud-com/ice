/**
 * Specialized error banner for quota exhaustion — the common case where
 * repeated template deploys accumulate orphaned GCP resources and hit the
 * default backend-bucket limit (3 per project). Offers a one-click cleanup
 * action that calls the `/cleanup-orphans` endpoint and reports what was
 * deleted.
 */

import { AlertCircle, CheckCircle, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import React from 'react';
import { getApi } from '../../../../shared/api/api-adapter';
import { cn } from '../../../../shared/utils/cn';
import { openExternalUrl } from '../../utils/open-external-url';

export const QuotaErrorBanner: React.FC<{
  error: string;
  results: Array<{ error?: string }>;
  onRetryDeploy: () => void;
}> = ({ error, results, onRetryDeploy }) => {
  const [state, setState] = React.useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [report, setReport] = React.useState<{
    deleted?: Array<{ type: string; name: string }>;
    errors?: Array<{ type: string; name: string; error: string }>;
  }>({});
  const [errorMsg, setErrorMsg] = React.useState<string>('');

  const fullError = [error, ...results.map((r) => r.error).filter(Boolean)].join(' ');
  const projectMatch = fullError.match(/project[=/]([a-z0-9-]+)/i);
  const projectId = projectMatch?.[1] || '';

  const runCleanup = async () => {
    setState('running');
    setErrorMsg('');
    try {
      const res = await getApi().deploy.cleanupOrphans({ gcpProject: projectId || undefined });
      if (res.success) {
        setReport(res.report || {});
        setState('done');
      } else {
        setErrorMsg(res.error || 'Cleanup failed');
        setState('failed');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
      setState('failed');
    }
  };

  const deletedCount = report.deleted?.length || 0;

  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
      <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">GCP quota exceeded</p>
          <p className="mt-1 text-amber-700 dark:text-amber-300 text-xs">
            Your project has reached a GCP quota limit (most commonly the default 3-backend-bucket ceiling). ICE can
            scan for orphaned resources from previous deploys and delete them, or you can request a quota increase in
            the GCP console.
          </p>
        </div>
      </div>
      {state === 'idle' && (
        <>
          <button
            onClick={runCleanup}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors font-medium',
              'bg-amber-600 text-white hover:bg-amber-700',
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clean up orphaned ICE resources
          </button>
          {projectId && (
            <button
              onClick={() =>
                openExternalUrl(
                  `https://console.cloud.google.com/iam-admin/quotas?project=${projectId}&filter=metric:BACKEND-BUCKETS-per-project`,
                )
              }
              className={cn(
                'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors',
                'bg-muted hover:bg-muted/80 border border-border',
              )}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Request quota increase in GCP
            </button>
          )}
        </>
      )}
      {state === 'running' && (
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
          <Loader2 className="w-4 h-4 animate-spin" />
          Scanning and deleting orphaned resources…
        </div>
      )}
      {state === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle className="w-4 h-4" />
            Cleanup complete — deleted {deletedCount} resource{deletedCount === 1 ? '' : 's'}
          </div>
          {deletedCount > 0 && (
            <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto font-mono space-y-0.5">
              {(report.deleted || []).map((d, i) => (
                <div key={i}>
                  <span className="text-emerald-500">✓</span> {d.type}/{d.name}
                </div>
              ))}
            </div>
          )}
          {(report.errors || []).length > 0 && (
            <div className="text-xs text-red-500 space-y-0.5">
              {(report.errors || []).map((e, i) => (
                <div key={i}>
                  ✗ {e.type}/{e.name}: {e.error}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={onRetryDeploy}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors font-medium',
              'bg-emerald-600 text-white hover:bg-emerald-700',
            )}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry deploy
          </button>
        </div>
      )}
      {state === 'failed' && (
        <div className="space-y-2">
          <div className="text-xs text-red-500">Cleanup failed: {errorMsg}</div>
          <button
            onClick={runCleanup}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors',
              'bg-muted hover:bg-muted/80 border border-border',
            )}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry cleanup
          </button>
        </div>
      )}
    </div>
  );
};
