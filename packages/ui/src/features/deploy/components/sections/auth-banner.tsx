/**
 * AuthBanner
 *
 * Static banner shown while the deploy is in the `'authenticating'` state —
 * a brief window where the deploy service has launched the provider's auth
 * flow (e.g., gcloud's browser-based login) and is waiting for the user to
 * complete it. The orchestrator gates the mount on
 * `deploy.status === 'authenticating'`; this component carries no per-render
 * data and takes no props.
 *
 * Extracted in rf-pdpl-8 from `deploy-panel.tsx` lines 567–575 — the gating
 * conditional stays at the orchestrator's call site so the component's job
 * stays the banner, not the gate.
 */
import { Loader2, ExternalLink } from 'lucide-react';
import React from 'react';
import { useTranslation } from '../../../../i18n';

export const AuthBanner: React.FC<{
  /** DF9 — re-launch the provider sign-in flow when the pop-up was blocked,
   *  dismissed, or never appeared (the state otherwise sits in 'authenticating'
   *  with no recovery path other than re-clicking Plan/Deploy). */
  onReopen?: () => void;
}> = ({ onReopen }) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-4 text-sm">
      <div className="flex items-center gap-2.5 text-orange-700 dark:text-orange-300">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="font-medium">{t('deploy.auth.connecting')}</span>
      </div>
      <p className="mt-2 text-orange-600 dark:text-orange-400 text-xs">{t('deploy.auth.browserPrompt')}</p>
      {onReopen && (
        <div className="mt-2.5 flex items-center gap-2 text-xs">
          <span className="text-orange-600/80 dark:text-orange-400/80">{t('deploy.auth.noWindow')}</span>
          <button
            type="button"
            onClick={onReopen}
            className="inline-flex items-center gap-1 rounded border border-orange-300 dark:border-orange-700 px-2 py-0.5 font-medium text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            {t('deploy.auth.reopen')}
          </button>
        </div>
      )}
    </div>
  );
};
