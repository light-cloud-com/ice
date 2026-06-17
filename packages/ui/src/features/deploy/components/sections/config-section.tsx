/**
 * ConfigSection
 *
 * 3-column form for selecting the deploy provider, project/account, and
 * region — preceded by a connection-status pill that surfaces whether the
 * provider is currently connected (and via which auth type, OAuth vs.
 * Service Account). The orchestrator owns the dispatch callbacks; this
 * component owns its OWN copy of `isConnected` / `getProjects` /
 * `getCredentials` so the connection-status reflects refreshes triggered
 * by changing the provider dropdown without re-running the orchestrator's
 * one-shot auto-population on mount.
 *
 * Extracted in rf-pdpl-18 from `deploy-panel.tsx` lines 829–954.
 *
 * Public-API contract:
 * - `environment` IS now consumed — rendered as a read-only chip (DF1/EI1) so
 *   the user can see which environment a deploy targets. It is display-only
 *   here; the environment is chosen via the env tab bar and synced into the
 *   deploy slice on panel open (see `useDeployEffects`).
 * - The remaining underscore-prefixed params (`_projectId`, `_onProviderChange`,
 *   `_onEnvironmentChange`) are passed through but NOT consumed; renaming them
 *   would break the call site or future parents that expect to wire them.
 * - The `'Not set'` literal fallback in the provider read-only chip is a
 *   visible UI string that test fixtures and E2E specs match on.
 * - The `id="ice-deploy-input-project"` on the text-input fallback is an
 *   E2E selector — do NOT rename.
 *
 * RISK #5 from the rf-pdpl blueprint: parallel network paths.
 * `provider.isConnected` runs in BOTH the orchestrator (one-shot
 * auto-fill of the project dropdown when the dominant provider is
 * detected on mount) AND here (refresh on provider-change inside the
 * panel). Both calls are intentional and remain side-by-side.
 */
import { CheckCircle, AlertCircle } from 'lucide-react';
import React from 'react';
import { useTranslation } from '../../../../i18n';
import { getApi } from '../../../../shared/api/api-adapter';
import { IceSelect } from '../../../../shared/components/ui/ice-select';
import { PROVIDER_REGIONS, PROVIDER_LABELS, PROVIDER_PROJECT_LABELS } from '../../utils/provider-regions';

export const ConfigSection: React.FC<{
  provider: string;
  gcpProject: string;
  region: string;
  environment: string;
  disabled: boolean;
  projectId?: string;
  onProviderChange: (v: string) => void;
  onProjectChange: (v: string) => void;
  onRegionChange: (v: string) => void;
  onEnvironmentChange: (v: string) => void;
}> = ({
  provider,
  gcpProject,
  region,
  environment,
  disabled,
  projectId: _projectId,
  onProviderChange: _onProviderChange,
  onProjectChange,
  onRegionChange,
  onEnvironmentChange: _onEnvironmentChange,
}) => {
  const { t } = useTranslation();
  const regions = PROVIDER_REGIONS[provider] || PROVIDER_REGIONS.gcp!;
  const projectMeta = PROVIDER_PROJECT_LABELS[provider] || PROVIDER_PROJECT_LABELS.gcp!;
  const envLabel =
    environment === 'production'
      ? t('deploy.config.envProduction')
      : environment === 'staging'
        ? t('deploy.config.envStaging')
        : t('deploy.config.envDevelopment');
  const [providerConnected, setProviderConnected] = React.useState(false);
  const [connectedProjects, setConnectedProjects] = React.useState<Array<{ id: string; name: string }>>([]);
  const [authType, setAuthType] = React.useState<string | null>(null);

  // Check provider connection status
  React.useEffect(() => {
    (async () => {
      try {
        const isConn = await getApi().provider.isConnected(provider);
        setProviderConnected(isConn);
        if (isConn) {
          const projects = await getApi().provider.getProjects(provider);
          setConnectedProjects(projects || []);
          // Get auth type
          const creds = await getApi().provider.getCredentials(provider);
          setAuthType(creds?.auth_type || null);
        } else {
          setConnectedProjects([]);
          setAuthType(null);
        }
      } catch {
        setProviderConnected(false);
        setConnectedProjects([]);
      }
    })();
  }, [provider]);

  return (
    <div className="space-y-3">
      {/* Connection status */}
      {providerConnected && (
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle className="w-3 h-3 text-emerald-500" />
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            {t('deploy.status.connected', { provider: PROVIDER_LABELS[provider] || provider })}
            {authType === 'oauth' ? ' via Google OAuth' : authType === 'service_account' ? ' via Service Account' : ''}
          </span>
        </div>
      )}
      {!providerConnected && (
        <div className="flex items-center gap-2 text-xs">
          <AlertCircle className="w-3 h-3 text-amber-500" />
          <span className="text-amber-600 dark:text-amber-400">
            {t('deploy.status.notConnected', { provider: PROVIDER_LABELS[provider] || provider })}
          </span>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        {/* Provider — read-only, set in project settings */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('deploy.config.providerLabel')}</label>
          <div className="px-2 py-1.5 text-ice-sm text-ice-text-1 bg-ice-hover/50 rounded border border-ice-border/30">
            {PROVIDER_LABELS[provider] || provider || 'Not set'}
          </div>
        </div>

        {/* Environment — read-only, chosen via the env tab bar (DF1/EI1) */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('deploy.config.environmentLabel')}</label>
          <div
            data-testid="ice-deploy-environment"
            className="px-2 py-1.5 text-ice-sm text-ice-text-1 bg-ice-hover/50 rounded border border-ice-border/30"
          >
            {envLabel}
          </div>
        </div>

        {/* Project / Account — dropdown if connected projects available, text input otherwise */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{projectMeta.label}</label>
          {connectedProjects.length > 0 ? (
            <IceSelect
              value={gcpProject}
              onChange={onProjectChange}
              disabled={disabled}
              size="md"
              fullWidth
              placeholder={t('deploy.config.selectProject')}
              options={connectedProjects.map((p) => ({ value: p.id, label: p.name || p.id }))}
            />
          ) : (
            <input
              type="text"
              value={gcpProject}
              onChange={(e) => onProjectChange(e.target.value)}
              disabled={disabled}
              placeholder={projectMeta.placeholder}
              id="ice-deploy-input-project"
              className="w-full bg-transparent border-b border-ice-border/50 px-1 py-1 text-ice-sm text-ice-text-1 outline-none focus:border-ice-accent transition-colors"
            />
          )}
        </div>

        {/* Region */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('deploy.config.regionLabel')}</label>
          <IceSelect
            value={region}
            onChange={onRegionChange}
            disabled={disabled}
            size="md"
            fullWidth
            allowEmpty={false}
            options={regions}
          />
        </div>
      </div>
    </div>
  );
};
