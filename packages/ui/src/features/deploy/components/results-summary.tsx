/**
 * Results Summary
 *
 * Post-deploy outcome panel rendered by `DeployPanel` once a deploy run has
 * produced any per-resource results (from the live wire stream OR hydrated
 * from history). Sits in the same slot the in-flight progress bar uses while
 * a deploy is actively running — see the orchestrator's `deploy.results.length
 * > 0 && deploy.status !== 'deploying' && deploy.status !== 'destroying'`
 * gate.
 *
 * Lifted verbatim from `deploy-panel.tsx` (rf-pdpl-15, L1283–1516). All
 * behavior — the success/failure header, per-type counts, "Copy summary" /
 * "Copy errors" clipboard buttons, per-row primary-output / default-URL
 * pills, and the API-not-enabled "Enable API" CTA — is carried over without
 * change. The two IIFE blocks per row (primary-output and error-rendering)
 * are necessary closures over `po` and `enableUrl` and stay inline.
 *
 * Token reminder: `text-ice-xs` is a project-specific Tailwind utility set
 * in the ICE Tailwind config; do not switch to a stock `text-xs` size when
 * editing the per-row pills. The verbatim string `Click to open · Shift+click
 * to copy: ` carries a U+00B7 middle dot, and the literal `[copy]` (with the
 * brackets) is also a verbatim UI string.
 */

import { CheckCircle, AlertCircle, ArrowRight, ExternalLink } from 'lucide-react';
import React from 'react';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import { isApiNotEnabledError, extractApiEnableUrl } from '../../../shared/utils/gcp-errors';
import { primaryOutput } from '../output-extractors';
import { openExternalUrl } from '../utils/open-external-url';
import { buildResultsSummaryText, summaryCounts } from '../utils/results-summary-text';

export const ResultsSummary: React.FC<{
  results: Array<{
    name: string;
    type: string;
    action: string;
    success: boolean;
    error?: string;
    api_enable_url?: string;
    provider_id?: string;
    outputs?: Record<string, unknown>;
    duration_ms?: number;
  }>;
}> = ({ results }) => {
  const { t } = useTranslation();
  const { succeeded, failed, totalMs, allOk } = summaryCounts(results);

  // Plain-text dump for the "Copy summary" / "Copy errors" buttons.
  // Includes per-resource status, durations, and full error text — much
  // easier to paste into a bug report than scraping individual rows.
  // rf-pdpl-4: extracted to utils/results-summary-text.ts. Closure shim kept
  // so the `copy` call site below stays unchanged.
  const buildSummaryText = (errorsOnly: boolean) => buildResultsSummaryText(results, { errorsOnly });

  const copy = (errorsOnly: boolean) => {
    navigator.clipboard.writeText(buildSummaryText(errorsOnly)).catch(() => undefined);
  };

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="px-4 py-3 bg-muted/40 border-b border-border space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {allOk ? (
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-500" />
          )}
          <span className={allOk ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>
            {allOk ? 'Deploy succeeded' : 'Deploy finished with errors'}
          </span>
          <span className="ml-auto text-xs text-muted-foreground font-normal">{(totalMs / 1000).toFixed(1)}s</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-3 h-3" />
            {t('deploy.progress.succeeded', { count: succeeded })}
          </span>
          {failed > 0 && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <AlertCircle className="w-3 h-3" />
              {t('deploy.progress.failed', { count: failed })}
            </span>
          )}
          <button
            onClick={() => copy(false)}
            className="ml-auto px-2 py-0.5 rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Copy the full per-resource summary as plain text"
          >
            Copy summary
          </button>
          {failed > 0 && (
            <button
              onClick={() => copy(true)}
              className="px-2 py-0.5 rounded border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              title="Copy only the failed resources and their error messages"
            >
              Copy errors
            </button>
          )}
        </div>
      </div>
      <div className="divide-y divide-border max-h-48 overflow-y-auto">
        {results.map((r, i) => (
          <div key={i} className="px-4 py-2 text-sm space-y-1">
            <div className="flex items-center gap-2">
              {r.success ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className="font-medium">{r.name}</span>
              <span
                className={cn(
                  'text-xs font-medium px-1.5 py-0.5 rounded',
                  r.action === 'create'
                    ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20'
                    : r.action === 'update'
                      ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'
                      : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
                )}
              >
                {r.action}
              </span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-mono">{r.type}</span>
              {r.duration_ms && (
                <span className="ml-auto text-xs text-muted-foreground">{(r.duration_ms / 1000).toFixed(1)}s</span>
              )}
            </div>
            {r.provider_id && (
              <div className="flex items-center gap-1.5 pl-6">
                <span
                  className="text-ice-xs text-muted-foreground font-mono truncate max-w-[400px]"
                  title={r.provider_id}
                >
                  {r.provider_id}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(r.provider_id!)}
                  className="text-ice-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  title={t('deploy.copy.copyProviderId')}
                >
                  {t('deploy.copy.copy')}
                </button>
              </div>
            )}
            {(() => {
              // Phase 2: primary output pill + GCP console deep-link.
              // When a custom domain is the primary URL, also surface the
              // default URL underneath so the user can hit the always-live
              // internal endpoint (bucket HTTPS, run.app URL, LB IP).
              const po = primaryOutput(r.type, r.outputs, r.provider_id);
              if (!po) return null;
              const defaultUrl = (r.outputs?.default_url as string) || '';
              const showDefault = defaultUrl && defaultUrl !== po.value && defaultUrl !== po.url;

              // Click on URL text:
              //   - If it's an http(s) URL, open in a new tab (what users
              //     actually want — they click a URL to VISIT the site).
              //   - Shift+click or anything that's not an http URL copies
              //     to clipboard.
              const handleUrlClick = (text: string) => (e: React.MouseEvent) => {
                const isHttp = /^https?:\/\//.test(text);
                if (isHttp && !e.shiftKey) {
                  openExternalUrl(text);
                } else {
                  navigator.clipboard.writeText(text);
                }
              };
              const isHttp = (text: string) => /^https?:\/\//.test(text);

              return (
                <>
                  <div className="flex items-center gap-1.5 pl-6">
                    <span className="text-ice-xs font-medium text-muted-foreground">{po.label}:</span>
                    <span
                      className={cn(
                        'text-ice-xs font-mono truncate max-w-[400px] cursor-pointer hover:text-foreground',
                        isHttp(po.value) && 'text-blue-500 dark:text-blue-400 underline',
                      )}
                      title={
                        isHttp(po.value)
                          ? `Click to open · Shift+click to copy: ${po.value}`
                          : `Click to copy: ${po.value}`
                      }
                      onClick={handleUrlClick(po.value)}
                    >
                      {po.value}
                    </span>
                    {po.url && (
                      <button
                        onClick={() => openExternalUrl(po.url!)}
                        className="text-ice-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {showDefault && (
                    <div className="flex items-center gap-1.5 pl-6">
                      <span className="text-ice-xs font-medium text-muted-foreground">Default:</span>
                      <span
                        className={cn(
                          'text-ice-xs font-mono truncate max-w-[400px] cursor-pointer hover:text-foreground',
                          isHttp(defaultUrl) && 'text-blue-500 dark:text-blue-400 underline',
                        )}
                        title={
                          isHttp(defaultUrl)
                            ? `Click to open · Shift+click to copy: ${defaultUrl}`
                            : `Click to copy: ${defaultUrl}`
                        }
                        onClick={handleUrlClick(defaultUrl)}
                      >
                        {defaultUrl}
                      </span>
                      <button
                        onClick={() => openExternalUrl(defaultUrl)}
                        className="text-ice-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
            {r.error &&
              (() => {
                const enableUrl =
                  r.api_enable_url || (isApiNotEnabledError(r.error) ? extractApiEnableUrl(r.error) : null);
                if (enableUrl) {
                  return (
                    <div className="pl-6 flex items-center gap-2">
                      <button
                        onClick={() => openExternalUrl(enableUrl)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {t('deploy.buttons.enableApi')}
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="pl-6 text-xs text-red-500 break-words" title={r.error}>
                    <span>{r.error}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(r.error!)}
                      className="ml-2 text-muted-foreground hover:text-foreground"
                      title="Copy error"
                    >
                      [copy]
                    </button>
                  </div>
                );
              })()}
          </div>
        ))}
      </div>
    </div>
  );
};
