/**
 * Provider Settings Component
 *
 * Allows users to configure cloud provider connections
 * and import infrastructure directly from their cloud accounts.
 */

import { getCloudProvider } from '@ice/core/resources';
import {
  Cloud,
  Check,
  X,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Plus,
  Trash2,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getApi } from '../api/api-adapter';
import { useGCPOAuth } from '../hooks/use-gcp-oauth';
import { useTranslation } from '../../i18n';
import { cn } from '../utils/cn';

// Provider configuration type
interface ProviderConfig {
  id: 'aws' | 'gcp' | 'azure';
  name: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  configFields: ConfigField[];
}

interface ProviderProject {
  id: string;
  name: string;
  region?: string;
}

interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'select';
  placeholder?: string;
  required: boolean;
  options?: string[];
  helpLink?: { url: string; text: string };
}

// Helper to open external links
const openExternalLink = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

// Provider configs — name/description from core registry, configFields are UI-specific
const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: 'aws',
    name: getCloudProvider('aws')?.name ?? 'Amazon Web Services',
    description: 'Connect to AWS using access keys or IAM role',
    icon: getCloudProvider('aws')?.icon ?? 'aws',
    color: 'text-orange-500',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    configFields: [
      {
        name: 'accessKeyId',
        label: 'Access Key ID',
        type: 'text',
        placeholder: 'AKIA...',
        required: true,
      },
      {
        name: 'secretAccessKey',
        label: 'Secret Access Key',
        type: 'password',
        placeholder: '********',
        required: true,
      },
      {
        name: 'region',
        label: 'Default Region',
        type: 'select',
        required: true,
        options: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
      },
    ],
  },
  {
    id: 'gcp',
    name: getCloudProvider('gcp')?.name ?? 'Google Cloud Platform',
    description: 'Connect via Google OAuth or service account key',
    icon: getCloudProvider('gcp')?.icon ?? 'gcp',
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    configFields: [
      {
        name: 'service_account_key',
        label: 'Service Account Key (JSON)',
        type: 'textarea',
        placeholder: '{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}',
        required: false, // Not required when using OAuth
        helpLink: {
          url: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
          text: 'Create service account',
        },
      },
    ],
  },
  {
    id: 'azure',
    name: getCloudProvider('azure')?.name ?? 'Microsoft Azure',
    description: 'Connect to Azure using service principal',
    icon: getCloudProvider('azure')?.icon ?? 'azure',
    color: 'text-sky-500',
    bgColor: 'bg-sky-100 dark:bg-sky-900/30',
    configFields: [
      {
        name: 'subscriptionId',
        label: 'Subscription ID',
        type: 'text',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        required: true,
      },
      {
        name: 'tenantId',
        label: 'Tenant ID',
        type: 'text',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        required: true,
      },
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        required: true,
      },
      {
        name: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        placeholder: '********',
        required: true,
      },
    ],
  },
];

interface ProviderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: (graph: any) => void;
}

export const ProviderSettings: React.FC<ProviderSettingsProps> = ({ isOpen, onClose, onImportComplete }) => {
  const { t } = useTranslation();
  // State for each provider
  const [providerStates, setProviderStates] = useState<
    Record<
      string,
      {
        connected: boolean;
        projects: ProviderProject[];
        formValues: Record<string, string>;
      }
    >
  >({});

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddProject, setShowAddProject] = useState<string | null>(null); // For adding more projects

  // Load saved connection states on mount
  useEffect(() => {
    const loadProviderStates = async () => {
      const states: Record<string, any> = {};

      for (const provider of PROVIDER_CONFIGS) {
        const isConnected = await getApi().provider.isConnected(provider.id);
        const projects = isConnected ? await getApi().provider.getProjects(provider.id) : [];
        const savedCreds = isConnected ? await getApi().provider.getCredentials(provider.id) : null;

        states[provider.id] = {
          connected: isConnected,
          projects: projects || [],
          formValues: savedCreds || {},
        };
      }

      setProviderStates(states);
    };

    if (isOpen) {
      loadProviderStates();
    }
  }, [isOpen]);

  // GCP OAuth via Google Identity Services
  const reloadGCPState = async () => {
    setSuccess(t('providerSettings.connect.connectedToCloud'));
    const isConn = await getApi().provider.isConnected('gcp');
    const projects = isConn ? await getApi().provider.getProjects('gcp') : [];
    setProviderStates((prev) => ({
      ...prev,
      gcp: { connected: true, projects: projects || [], formValues: {} },
    }));
  };

  const gcpOAuth = useGCPOAuth(reloadGCPState);

  const handleGCPOAuth = () => {
    setError(null);
    setSuccess(null);
    gcpOAuth.connect();
  };

  // Sync GCP OAuth errors
  useEffect(() => {
    if (gcpOAuth.error) setError(gcpOAuth.error);
  }, [gcpOAuth.error]);

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

  // Handle connect
  const handleConnect = async (providerId: string) => {
    setConnecting(providerId);
    setError(null);
    setSuccess(null);

    try {
      const formValues = providerStates[providerId]?.formValues || {};

      // Validate required fields
      const config = PROVIDER_CONFIGS.find((p) => p.id === providerId);
      if (config) {
        for (const field of config.configFields) {
          if (field.required && !formValues[field.name]) {
            throw new Error(`${field.label} is required`);
          }
        }
      }

      const result = await getApi().provider.connect(providerId, formValues);

      if (result.success) {
        setProviderStates((prev) => ({
          ...prev,
          [providerId]: {
            ...prev[providerId],
            connected: true,
            projects: result.projects || [],
          },
        }));
        setSuccess(t('providerSettings.connect.connectedTo', { name: config?.name || providerId }));
      } else {
        throw new Error(result.error || 'Connection failed');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || String(err);
      setError(msg);
    } finally {
      setConnecting(null);
    }
  };

  // Handle disconnect
  const handleDisconnect = async (providerId: string) => {
    try {
      await getApi().provider.disconnect(providerId);
      setProviderStates((prev) => ({
        ...prev,
        [providerId]: {
          connected: false,
          projects: [],
          formValues: {},
        },
      }));
      setSuccess(t('providerSettings.connect.disconnectedSuccess'));
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  };

  // Handle removing a project (for multi-project providers like GCP)
  const handleRemoveProject = async (providerId: string, projectId: string) => {
    try {
      setProviderStates((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          projects: prev[providerId].projects.filter((p) => p.id !== projectId),
        },
      }));
      // Update stored projects
      const remainingProjects = providerStates[providerId]?.projects.filter((p) => p.id !== projectId) || [];
      await getApi().provider.saveCredentials(providerId, {
        ...providerStates[providerId]?.formValues,
        _projects: JSON.stringify(remainingProjects),
      });
      setSuccess(t('providerSettings.projects.removed'));
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  };

  // Handle import from provider
  const handleImport = async (providerId: string, projectId: string) => {
    setImporting(`${providerId}-${projectId}`);
    setError(null);
    setSuccess(null);

    try {
      const result = await getApi().provider.import(providerId, projectId);

      if (result.success) {
        setSuccess(t('providerSettings.import.success', { count: result.graph?.nodes?.length || 0, projectId }));

        // Notify parent component about the import
        if (onImportComplete) {
          onImportComplete(result.graph);
        }

        // Close dialog after short delay
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setImporting(null);
    }
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
          <p className="text-sm text-muted-foreground mb-4">
            {t('providerSettings.description')}
          </p>

          <div className="space-y-3">
            {PROVIDER_CONFIGS.map((provider) => {
              const state = providerStates[provider.id] || {
                connected: false,
                projects: [],
                formValues: {},
              };

              return (
                <div
                  key={provider.id}
                  className={cn(
                    'border rounded-lg overflow-hidden',
                    state.connected ? 'border-green-500/50' : 'border-border',
                  )}
                >
                  {/* Provider header */}
                  <button
                    onClick={() => toggleProvider(provider.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                  >
                    {expandedProvider === provider.id ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}

                    <div className={cn('w-8 h-8 rounded-md flex items-center justify-center', provider.bgColor)}>
                      <span className={cn('text-sm font-bold', provider.color)}>
                        {provider.id.toUpperCase().slice(0, 2)}
                      </span>
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
                  {expandedProvider === provider.id && (
                    <div className="p-4 pt-0 border-t border-border bg-muted/20">
                      {state.connected ? (
                        /* Connected state - show projects and import button */
                        <div className="space-y-3 mt-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{t('providerSettings.projects.label', { count: state.projects.length })}</span>
                            <div className="flex items-center gap-2">
                              {provider.id === 'gcp' && (
                                <button
                                  onClick={() => setShowAddProject(showAddProject === provider.id ? null : provider.id)}
                                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                                >
                                  <Plus className="w-3 h-3" />
                                  {t('providerSettings.projects.addProject')}
                                </button>
                              )}
                              <button
                                onClick={() => handleDisconnect(provider.id)}
                                className="text-xs text-red-500 hover:text-red-600"
                              >
                                {t('providerSettings.projects.disconnectAll')}
                              </button>
                            </div>
                          </div>

                          {/* Add project form for GCP */}
                          {showAddProject === provider.id && provider.id === 'gcp' && (
                            <div className="p-3 bg-muted/50 rounded-md space-y-2 border border-dashed border-border">
                              <div className="text-xs font-medium text-muted-foreground">{t('providerSettings.projects.addAnother')}</div>
                              {provider.configFields.map((field) => (
                                <div key={field.name}>
                                  <label className="text-xs text-muted-foreground">{field.label}</label>
                                  {field.type === 'textarea' ? (
                                    <textarea
                                      value={state.formValues[`new_${field.name}`] || ''}
                                      onChange={(e) =>
                                        updateFormValue(provider.id, `new_${field.name}`, e.target.value)
                                      }
                                      placeholder={field.placeholder}
                                      rows={3}
                                      className="w-full mt-1 p-2 text-xs border border-input rounded-md bg-background font-mono"
                                    />
                                  ) : (
                                    <input
                                      type={field.type}
                                      value={state.formValues[`new_${field.name}`] || ''}
                                      onChange={(e) =>
                                        updateFormValue(provider.id, `new_${field.name}`, e.target.value)
                                      }
                                      placeholder={field.placeholder}
                                      className="w-full mt-1 p-2 text-xs border border-input rounded-md bg-background"
                                    />
                                  )}
                                </div>
                              ))}
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={async () => {
                                    const newCreds = {
                                      projectId: state.formValues.new_projectId || '',
                                      serviceAccountKey: state.formValues.new_serviceAccountKey || '',
                                    };
                                    if (!newCreds.serviceAccountKey) {
                                      setError(t('providerSettings.connect.serviceAccountRequired'));
                                      return;
                                    }
                                    setConnecting(provider.id);
                                    try {
                                      const result = await getApi().provider.connect(provider.id, newCreds);
                                      if (result.success && result.projects) {
                                        // Add new projects to existing list
                                        setProviderStates((prev) => ({
                                          ...prev,
                                          [provider.id]: {
                                            ...prev[provider.id],
                                            projects: [...prev[provider.id].projects, ...result.projects],
                                            formValues: {
                                              ...prev[provider.id].formValues,
                                              new_projectId: '',
                                              new_serviceAccountKey: '',
                                            },
                                          },
                                        }));
                                        setShowAddProject(null);
                                        setSuccess(t('providerSettings.projects.addedSuccess'));
                                      } else {
                                        setError(result.error || t('providerSettings.connect.failedToAdd'));
                                      }
                                    } catch (err) {
                                      setError(String(err));
                                    } finally {
                                      setConnecting(null);
                                    }
                                  }}
                                  disabled={connecting === provider.id}
                                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                  {connecting === provider.id ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Plus className="w-3 h-3" />
                                  )}
                                  {t('providerSettings.projects.addButton')}
                                </button>
                                <button
                                  onClick={() => setShowAddProject(null)}
                                  className="px-3 py-1.5 text-xs rounded hover:bg-muted"
                                >
                                  {t('providerSettings.projects.cancelButton')}
                                </button>
                              </div>
                            </div>
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
                                    {project.region && (
                                      <div className="text-xs text-muted-foreground">{project.region}</div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleImport(provider.id, project.id)}
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
                                        onClick={() => handleRemoveProject(provider.id, project.id)}
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
                            <div className="text-sm text-muted-foreground text-center py-4">{t('providerSettings.projects.noProjects')}</div>
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
                                onClick={handleGCPOAuth}
                                disabled={gcpOAuth.connecting}
                                className={cn(
                                  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md',
                                  'bg-white dark:bg-zinc-800 border border-border',
                                  'hover:bg-muted/50 transition-colors',
                                  'disabled:opacity-50 disabled:cursor-not-allowed',
                                )}
                              >
                                {gcpOAuth.connecting ? (
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
                                  onChange={(e) => updateFormValue(provider.id, field.name, e.target.value)}
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
                                  onChange={(e) => updateFormValue(provider.id, field.name, e.target.value)}
                                  placeholder={field.placeholder}
                                  rows={4}
                                  className="w-full mt-1 p-2 text-sm border border-input rounded-md bg-background font-mono text-xs"
                                />
                              ) : (
                                <input
                                  type={field.type}
                                  value={state.formValues[field.name] || ''}
                                  onChange={(e) => updateFormValue(provider.id, field.name, e.target.value)}
                                  placeholder={field.placeholder}
                                  className="w-full mt-1 p-2 text-sm border border-input rounded-md bg-background"
                                />
                              )}
                            </div>
                          ))}

                          <button
                            onClick={() => handleConnect(provider.id)}
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
                                {provider.id === 'gcp' ? t('providerSettings.connect.buttonGcp') : t('providerSettings.connect.button')}
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Info box */}
          <div className="mt-4 p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="text-xs space-y-2">
                <div>
                  <strong>{t('providerSettings.info.credentialsSafe')}</strong> — {t('providerSettings.info.credentialsSafeDesc')}
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

