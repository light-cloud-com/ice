/**
 * Provider Settings — `ProviderCard` section.
 *
 * Extracted verbatim from `../../provider-settings.tsx` as part of the
 * rf-pset series (mirrors the rf-pdpl section pattern). One card per
 * provider in `PROVIDER_CONFIGS`. The card renders:
 *
 *   - The collapsed header (icon chip + name + description + status pill).
 *   - Once expanded:
 *     - Connected state: project list, "add project" button (GCP only),
 *       and per-project import + remove actions.
 *     - Disconnected state: GCP OAuth button (GCP only) and the
 *       credential form (driven by `provider.configFields`).
 *
 * The inline GCP add-project form is rendered via the AddProjectForm
 * leaf in rf-pset-6. Until that unit lands, the form JSX stays inline
 * here.
 */

import { Check, RefreshCw, Download, ChevronDown, ChevronRight, Plus, Trash2, ExternalLink } from 'lucide-react';
import React from 'react';
import { AddProjectForm } from './add-project-form';
import { cn } from '../../../utils/cn';
import { openExternalLink } from '../utils/open-external-link';
import type { TranslatorFn } from '../hooks/use-provider-handlers';
import type { ProviderConfig, ProviderRuntimeState, ProviderStatesMap } from '../types';

export interface ProviderCardProps {
  provider: ProviderConfig;
  state: ProviderRuntimeState;
  expanded: boolean;
  connecting: string | null;
  importing: string | null;
  showAddProject: string | null;
  gcpConnecting: boolean;
  t: TranslatorFn;
  onToggle: (providerId: string) => void;
  onUpdateFormValue: (providerId: string, fieldName: string, value: string) => void;
  onConnect: (providerId: string) => void;
  onDisconnect: (providerId: string) => void;
  onGCPOAuth: () => void;
  onImport: (providerId: string, projectId: string) => void;
  onRemoveProject: (providerId: string, projectId: string) => void;
  onShowAddProjectChange: (providerId: string | null) => void;
  setProviderStates: React.Dispatch<React.SetStateAction<ProviderStatesMap>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccess: React.Dispatch<React.SetStateAction<string | null>>;
  setConnecting: React.Dispatch<React.SetStateAction<string | null>>;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  state,
  expanded,
  connecting,
  importing,
  showAddProject,
  gcpConnecting,
  t,
  onToggle,
  onUpdateFormValue,
  onConnect,
  onDisconnect,
  onGCPOAuth,
  onImport,
  onRemoveProject,
  onShowAddProjectChange,
  setProviderStates,
  setError,
  setSuccess,
  setConnecting,
}) => {
  return (
    <div className={cn('border rounded-lg overflow-hidden', state.connected ? 'border-green-500/50' : 'border-border')}>
      {/* Provider header */}
      <button
        onClick={() => onToggle(provider.id)}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}

        <div className={cn('w-8 h-8 rounded-md flex items-center justify-center', provider.bgColor)}>
          <span className={cn('text-sm font-bold', provider.color)}>{provider.id.toUpperCase().slice(0, 2)}</span>
        </div>

        <div className="flex-1 text-left">
          <div className="font-medium text-sm">{provider.name}</div>
          <div className="text-xs text-muted-foreground">{provider.description}</div>
        </div>

        {state.connected ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="w-3 h-3" />
            {t('providerSettings.status.connected')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('providerSettings.status.notConnected')}</span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="p-4 pt-0 border-t border-border bg-muted/20">
          {state.connected ? (
            /* Connected state - show projects and import button */
            <div className="space-y-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {t('providerSettings.projects.label', { count: state.projects.length })}
                </span>
                <div className="flex items-center gap-2">
                  {provider.id === 'gcp' && (
                    <button
                      onClick={() => onShowAddProjectChange(showAddProject === provider.id ? null : provider.id)}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                    >
                      <Plus className="w-3 h-3" />
                      {t('providerSettings.projects.addProject')}
                    </button>
                  )}
                  <button onClick={() => onDisconnect(provider.id)} className="text-xs text-red-500 hover:text-red-600">
                    {t('providerSettings.projects.disconnectAll')}
                  </button>
                </div>
              </div>

              {/* Add project form for GCP */}
              {showAddProject === provider.id && provider.id === 'gcp' && (
                <AddProjectForm
                  provider={provider}
                  state={state}
                  connecting={connecting}
                  t={t}
                  onUpdateFormValue={onUpdateFormValue}
                  onShowAddProjectChange={onShowAddProjectChange}
                  setProviderStates={setProviderStates}
                  setError={setError}
                  setSuccess={setSuccess}
                  setConnecting={setConnecting}
                />
              )}

              {state.projects.length > 0 ? (
                <div className="space-y-2">
                  {state.projects.map((project, index) => (
                    <div
                      key={`${project.id}-${index}`}
                      className="flex items-center justify-between p-2 bg-background rounded border border-border"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium">{project.name}</div>
                        {project.region && <div className="text-xs text-muted-foreground">{project.region}</div>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onImport(provider.id, project.id)}
                          disabled={importing === `${provider.id}-${project.id}`}
                          className={cn(
                            'flex items-center gap-1 px-3 py-1.5 text-xs rounded',
                            'bg-primary text-primary-foreground hover:bg-primary/90',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                          )}
                        >
                          {importing === `${provider.id}-${project.id}` ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              {t('providerSettings.import.importing')}
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3" />
                              {t('providerSettings.import.button')}
                            </>
                          )}
                        </button>
                        {provider.id === 'gcp' && state.projects.length > 1 && (
                          <button
                            onClick={() => onRemoveProject(provider.id, project.id)}
                            className="p-1.5 text-muted-foreground hover:text-red-500 rounded hover:bg-muted"
                            title={t('providerSettings.import.removeTooltip')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  {t('providerSettings.projects.noProjects')}
                </div>
              )}
            </div>
          ) : (
            /* Not connected - show config form */
            <div className="space-y-3 mt-3">
              {/* GCP-specific: OAuth or Service Account toggle */}
              {provider.id === 'gcp' && (
                <>
                  {/* OAuth button — primary option */}
                  <button
                    onClick={onGCPOAuth}
                    disabled={gcpConnecting}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md',
                      'bg-white dark:bg-zinc-800 border border-border',
                      'hover:bg-muted/50 transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {gcpConnecting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                    )}
                    {t('providerSettings.connect.signInGoogle')}
                  </button>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex-1 border-t border-border" />
                    <span>{t('providerSettings.connect.orServiceAccount')}</span>
                    <div className="flex-1 border-t border-border" />
                  </div>
                </>
              )}

              {/* Standard credential fields */}
              {provider.configFields.map((field) => (
                <div key={field.name}>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {field.helpLink && (
                      <button
                        type="button"
                        onClick={() => openExternalLink(field.helpLink!.url)}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {field.helpLink.text}
                      </button>
                    )}
                  </div>
                  {field.type === 'select' ? (
                    <select
                      value={state.formValues[field.name] || ''}
                      onChange={(e) => onUpdateFormValue(provider.id, field.name, e.target.value)}
                      className="w-full mt-1 p-2 text-sm border border-input rounded-md bg-background"
                    >
                      <option value="">{t('providerSettings.connect.select')}</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      value={state.formValues[field.name] || ''}
                      onChange={(e) => onUpdateFormValue(provider.id, field.name, e.target.value)}
                      placeholder={field.placeholder}
                      rows={4}
                      className="w-full mt-1 p-2 text-sm border border-input rounded-md bg-background font-mono text-xs"
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={state.formValues[field.name] || ''}
                      onChange={(e) => onUpdateFormValue(provider.id, field.name, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full mt-1 p-2 text-sm border border-input rounded-md bg-background"
                    />
                  )}
                </div>
              ))}

              <button
                onClick={() => onConnect(provider.id)}
                disabled={connecting === provider.id}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {connecting === provider.id ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {t('providerSettings.connect.connecting')}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {provider.id === 'gcp'
                      ? t('providerSettings.connect.buttonGcp')
                      : t('providerSettings.connect.button')}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
