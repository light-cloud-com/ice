/**
 * Error banner that detects API-not-enabled errors and shows
 * actionable "Enable API" buttons with a retry option.
 */

import { AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import React from 'react';
import { useTranslation } from '../../../../i18n';
import { cn } from '../../../../shared/utils/cn';
import { extractApiName } from '../../../../shared/utils/gcp-errors';
import { classifyDeployError, collectApiEnableUrls, extractProjectIdFromError } from '../../utils/error-classification';
import { openExternalUrl } from '../../utils/open-external-url';
import { QuotaErrorBanner } from './quota-error-banner';

export const ApiErrorBanner: React.FC<{
  error: string;
  results: Array<{ error?: string; api_enable_url?: string }>;
  onRetryDeploy: () => void;
}> = ({ error, results, onRetryDeploy }) => {
  const { t } = useTranslation();
  // Collect all unique enable URLs from results and error message, then
  // classify the error into one of five priority-cascade kinds. Both the
  // collection loop and the cascade live in `utils/error-classification`
  // (rf-pdpl-5); the regex, the OR-joined `includes()` checks, and the
  // priority order are preserved verbatim.
  const enableUrls = collectApiEnableUrls(error, results);
  const hasApiErrors = enableUrls.size > 0;
  const kind = classifyDeployError(error, results);

  if (kind === 'quota') {
    return <QuotaErrorBanner error={error} results={results} onRetryDeploy={onRetryDeploy} />;
  }

  if (kind === 'billing') {
    // Extract project ID from error or URL
    const projectId = extractProjectIdFromError(error);
    return (
      <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
        <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{t('deploy.errors.billingTitle')}</p>
            <p className="mt-1 text-amber-700 dark:text-amber-300 text-xs">{t('deploy.errors.billingDescription')}</p>
          </div>
        </div>
        <button
          onClick={() => openExternalUrl(`https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`)}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors font-medium',
            'bg-amber-600 text-white hover:bg-amber-700',
          )}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {t('deploy.errors.billingButton')}
        </button>
        <button
          onClick={onRetryDeploy}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors font-medium',
            'bg-emerald-600 text-white hover:bg-emerald-700',
          )}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t('deploy.buttons.retryDeploy')}
        </button>
      </div>
    );
  }

  if (kind === 'rapt') {
    return (
      <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
        <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{t('deploy.errors.raptTitle')}</p>
            <p className="mt-1 text-amber-700 dark:text-amber-300 text-xs">{t('deploy.errors.raptDescription')}</p>
          </div>
        </div>
        <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1 pl-6">
          <p className="font-medium">{t('deploy.errors.raptFixTitle')}</p>
          <p>
            1. <strong>{t('deploy.errors.raptOption1')}</strong> —{' '}
            <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-ice-2xs">
              iam.disableServiceAccountKeyCreation
            </code>{' '}
            →{' '}
            <a
              href="https://console.cloud.google.com/iam-admin/orgpolicies/iam-disableServiceAccountKeyCreation"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Organisation Policies
            </a>
          </p>
          <p>
            2. <strong>{t('deploy.errors.raptOption2')}</strong> —{' '}
            <a
              href="https://admin.google.com/ac/security/reauth"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Google Workspace Admin &rarr; Security &rarr; Google Cloud session control
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (!hasApiErrors) {
    // Standard error display
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }

  // API-not-enabled error with actionable buttons
  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
      <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">{t('deploy.errors.apiNotEnabledTitle')}</p>
          <p className="mt-1 text-amber-700 dark:text-amber-300 text-xs">{t('deploy.errors.apiNotEnabledHint')}</p>
          <p className="mt-1 text-amber-600 dark:text-amber-400 text-xs">
            {t('deploy.errors.autoEnableHint')} Add it in{' '}
            <a
              href="https://console.cloud.google.com/iam-admin/iam"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              IAM &amp; Admin
            </a>
            .
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {[...enableUrls].map((url, i) => {
          // Extract API name from URL for display
          const apiName = extractApiName(url) ?? 'API';

          return (
            <button
              key={i}
              onClick={() => openExternalUrl(url)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
                'bg-white dark:bg-amber-900/30 border border-amber-300 dark:border-amber-600',
                'hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-100',
              )}
            >
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="font-medium">{t('deploy.errors.enableApi', { api: apiName })}</span>
              <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">
                {t('deploy.errors.opensConsole')}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onRetryDeploy}
        className={cn(
          'w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors font-medium',
          'bg-emerald-600 text-white hover:bg-emerald-700',
        )}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        {t('deploy.buttons.retryDeploy')}
      </button>
    </div>
  );
};
