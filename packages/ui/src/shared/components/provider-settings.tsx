/**
 * Provider Settings — modal orchestrator.
 *
 * Configures cloud-provider connections and lets users import
 * infrastructure directly from their cloud accounts. The modal renders
 * via `createPortal` to `document.body` and the orchestrator owns the
 * cross-section state — error/success status, `connecting` /
 * `importing` flags, the `expandedProvider` accordion lock, and the
 * per-provider runtime states map.
 *
 * Section / leaf splits (rf-pset series):
 *   - `./provider-settings/types.ts` — ProviderId, ConfigField,
 *     ProviderConfig, ProviderProject, ProviderRuntimeState,
 *     ProviderStatesMap, ProviderSettingsProps (rf-pset-1)
 *   - `./provider-settings/data/provider-configs.ts` —
 *     PROVIDER_CONFIGS (rf-pset-2)
 *   - `./provider-settings/utils/open-external-link.ts` —
 *     openExternalLink (rf-pset-3)
 *   - `./provider-settings/hooks/use-provider-handlers.ts` —
 *     useProviderHandlers (5 async handlers + GCP OAuth wiring +
 *     gcpOAuth.error-sync useEffect) (rf-pset-4)
 *   - `./provider-settings/sections/provider-card.tsx` —
 *     ProviderCard (rf-pset-5)
 *   - `./provider-settings/sections/add-project-form.tsx` —
 *     AddProjectForm (rf-pset-6)
 */

import { Cloud, X, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { useTranslation } from '../../i18n';
import { getApi } from '../api/api-adapter';

import { PROVIDER_CONFIGS } from './provider-settings/data/provider-configs';
import { useProviderHandlers } from './provider-settings/hooks/use-provider-handlers';
import { ProviderCard } from './provider-settings/sections/provider-card';
import type { ProviderSettingsProps, ProviderStatesMap, ProviderRuntimeState } from './provider-settings/types';

export type {
  ProviderId,
  ConfigField,
  ProviderConfig,
  ProviderProject,
  ProviderRuntimeState,
  ProviderStatesMap,
  ProviderSettingsProps,
} from './provider-settings/types';

export const ProviderSettings: React.FC<ProviderSettingsProps> = ({ isOpen, onClose, onImportComplete }) => {
  const { t } = useTranslation();
  // State for each provider
  const [providerStates, setProviderStates] = useState<ProviderStatesMap>({});

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddProject, setShowAddProject] = useState<string | null>(null); // For adding more projects

  // Load saved connection states on mount
  useEffect(() => {
    const loadProviderStates = async () => {
      const states: ProviderStatesMap = {};

      for (const provider of PROVIDER_CONFIGS) {
        const isConnected = await getApi().provider.isConnected(provider.id);
        const projects = isConnected ? await getApi().provider.getProjects(provider.id) : [];
        const savedCreds = isConnected ? await getApi().provider.getCredentials(provider.id) : null;

        states[provider.id] = {
          connected: isConnected,
          projects: projects || [],
          formValues: (savedCreds || {}) as ProviderRuntimeState['formValues'],
        };
      }

      setProviderStates(states);
    };

    if (isOpen) {
      loadProviderStates();
    }
  }, [isOpen]);

  const {
    handleGCPOAuth,
    handleConnect,
    handleDisconnect,
    handleRemoveProject,
    handleImport,
    gcpOAuth,
  } = useProviderHandlers({
    t,
    providerStates,
    setProviderStates,
    setError,
    setSuccess,
    setConnecting,
    setImporting,
    onClose,
    onImportComplete,
  });

  // Toggle provider expansion
  const toggleProvider = (providerId: string) => {
    setExpandedProvider(expandedProvider === providerId ? null : providerId);
    setError(null);
    setSuccess(null);
  };

  // Update form field value
  const updateFormValue = (providerId: string, fieldName: string, value: string) => {
    setProviderStates((prev) => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        formValues: {
          ...prev[providerId]?.formValues,
          [fieldName]: value,
        },
      },
    }));
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="w-[600px] max-h-[80vh] bg-background rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">{t('providerSettings.title')}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status messages */}
        {error && (
          <div className="mx-4 mt-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mx-4 mt-4 p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* Content */}
        <div className="p-4 overflow-auto max-h-[60vh]">
          <p className="text-sm text-muted-foreground mb-4">{t('providerSettings.description')}</p>

          <div className="space-y-3">
            {PROVIDER_CONFIGS.map((provider) => {
              const state = providerStates[provider.id] || {
                connected: false,
                projects: [],
                formValues: {},
              };

              return (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  state={state}
                  expanded={expandedProvider === provider.id}
                  connecting={connecting}
                  importing={importing}
                  showAddProject={showAddProject}
                  gcpConnecting={gcpOAuth.connecting}
                  t={t}
                  onToggle={toggleProvider}
                  onUpdateFormValue={updateFormValue}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onGCPOAuth={handleGCPOAuth}
                  onImport={handleImport}
                  onRemoveProject={handleRemoveProject}
                  onShowAddProjectChange={setShowAddProject}
                  setProviderStates={setProviderStates}
                  setError={setError}
                  setSuccess={setSuccess}
                  setConnecting={setConnecting}
                />
              );
            })}
          </div>

          {/* Info box */}
          <div className="mt-4 p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="text-xs space-y-2">
                <div>
                  <strong>{t('providerSettings.info.credentialsSafe')}</strong> —{' '}
                  {t('providerSettings.info.credentialsSafeDesc')}
                </div>
                <div className="pt-1 border-t border-blue-200 dark:border-blue-800">
                  {t('providerSettings.info.gcpTip')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border bg-muted/20">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md hover:bg-muted">
            {t('providerSettings.footer.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
