/**
 * Onboarding — Connect Cloud Provider (Community Edition)
 *
 * Provider selection (GCP/AWS/Azure) + region + credential form.
 * No OAuth — service account key / access keys only.
 */

import awsIcon from 'devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg';
import azureIcon from 'devicon/icons/azure/azure-original.svg';
import gcpIcon from 'devicon/icons/googlecloud/googlecloud-original.svg';
import { Check, Loader2, ExternalLink, ShieldCheck } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from '../../../i18n';
import { getApi } from '../../../shared/api/api-adapter';
import { cn } from '../../../shared/utils/cn';
import { setDefaultProvider, setDefaultRegion, setCloudConnected } from '../../../store/slices/onboarding-slice';
import type { RootState, AppDispatch } from '../../../store';

// ── Provider / region data ──────────────────────────────────────────────────

const PROVIDERS = [
  { id: 'gcp', name: 'Google Cloud', icon: gcpIcon },
  { id: 'aws', name: 'Amazon Web Services', icon: awsIcon },
  { id: 'azure', name: 'Microsoft Azure', icon: azureIcon },
] as const;

const PROVIDER_REGIONS: Record<string, Array<{ value: string; label: string }>> = {
  gcp: [
    { value: 'us-central1', label: 'US Central (Iowa)' },
    { value: 'us-east1', label: 'US East (S. Carolina)' },
    { value: 'us-west1', label: 'US West (Oregon)' },
    { value: 'europe-west1', label: 'Europe West (Belgium)' },
    { value: 'europe-west3', label: 'Europe West (Frankfurt)' },
    { value: 'asia-east1', label: 'Asia East (Taiwan)' },
    { value: 'asia-northeast1', label: 'Asia NE (Tokyo)' },
    { value: 'australia-southeast1', label: 'Australia (Sydney)' },
  ],
  aws: [
    { value: 'us-east-1', label: 'US East (N. Virginia)' },
    { value: 'us-west-2', label: 'US West (Oregon)' },
    { value: 'eu-west-1', label: 'Europe (Ireland)' },
    { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
    { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
    { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
    { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  ],
  azure: [
    { value: 'eastus', label: 'East US' },
    { value: 'westus2', label: 'West US 2' },
    { value: 'westeurope', label: 'West Europe' },
    { value: 'northeurope', label: 'North Europe' },
    { value: 'southeastasia', label: 'Southeast Asia' },
    { value: 'eastasia', label: 'East Asia' },
    { value: 'australiaeast', label: 'Australia East' },
  ],
};

function suggestRegion(provider: string): string {
  const offset = new Date().getTimezoneOffset();
  const defaults: Record<string, string[]> = {
    gcp: ['us-west1', 'us-central1', 'europe-west1', 'europe-west3', 'asia-east1'],
    aws: ['us-west-2', 'us-east-1', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'],
    azure: ['westus2', 'eastus', 'westeurope', 'northeurope', 'southeastasia'],
  };
  const r = defaults[provider];
  if (!r) return '';
  if (offset >= 360) return r[0];
  if (offset >= 180) return r[1];
  if (offset >= -60) return r[2];
  if (offset >= -180) return r[3];
  return r[4];
}

// ── Credential field configs ────────────────────────────────────────────────

interface ProviderFieldConfig {
  name: string;
  label: string;
  type: 'text' | 'password' | 'textarea';
  placeholder?: string;
  helpLink?: { url: string; text: string };
}

const CREDENTIAL_FIELDS: Record<string, ProviderFieldConfig[]> = {
  gcp: [
    {
      name: 'service_account_key',
      label: 'Service Account Key (JSON)',
      type: 'textarea',
      placeholder: '{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}',
      helpLink: {
        url: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
        text: 'Create service account',
      },
    },
  ],
  aws: [
    { name: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...' },
    { name: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: '********' },
  ],
  azure: [
    { name: 'subscriptionId', label: 'Subscription ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-...' },
    { name: 'tenantId', label: 'Tenant ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-...' },
    { name: 'clientId', label: 'Client ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-...' },
    { name: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: '********' },
  ],
};

// ── Component ───────────────────────────────────────────────────────────────

export const ConnectCloudStep: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { t } = useTranslation();
  const provider = useSelector((s: RootState) => s.onboarding.defaultProvider);
  const region = useSelector((s: RootState) => s.onboarding.defaultRegion);
  const cloudConnected = useSelector((s: RootState) => s.onboarding.cloudConnected);

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regions = provider ? PROVIDER_REGIONS[provider] || [] : [];
  const fields = provider ? CREDENTIAL_FIELDS[provider] || [] : [];
  const providerMeta = PROVIDERS.find((p) => p.id === provider);

  // Auto-suggest region when provider changes
  useEffect(() => {
    if (provider && !region) {
      dispatch(setDefaultRegion(suggestRegion(provider)));
    }
  }, [provider, region, dispatch]);

  // Check existing connection on mount
  useEffect(() => {
    if (!provider) return;
    (async () => {
      try {
        const isConn = await getApi().provider.isConnected(provider);
        if (isConn) dispatch(setCloudConnected(true));
      } catch {
        /* ignore */
      }
    })();
  }, [provider, dispatch]);

  const handleConnect = async () => {
    if (!provider) return;
    setConnecting(true);
    setError(null);
    try {
      const result = await getApi().provider.connect(provider, formValues);
      if (result.success) {
        dispatch(setCloudConnected(true));
        setFormValues({});
      } else {
        setError(result.error || t('onboarding.cloud.connectionFailed'));
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || t('onboarding.cloud.connectionFailed'));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-ice-text-1">{t('onboarding.cloud.title')}</h2>
        <p className="text-sm text-ice-text-2 mt-1">{t('onboarding.cloud.subtitle')}</p>
      </div>

      {/* Provider selection */}
      <div>
        <label className="block text-sm font-medium text-ice-text-2 mb-2">{t('onboarding.cloud.providerLabel')}</label>
        <div className="grid grid-cols-3 gap-3">
          {PROVIDERS.map((p) => {
            const isSelected = provider === p.id;
            return (
              <button
                key={p.id}
                id={`ice-onboarding-cloud-btn-${p.id}`}
                type="button"
                onClick={() => {
                  dispatch(setDefaultProvider(p.id));
                  dispatch(setDefaultRegion(suggestRegion(p.id)));
                  setFormValues({});
                  setError(null);
                }}
                className={cn(
                  'relative flex flex-col items-center gap-2 p-3 rounded-lg border transition-all',
                  isSelected
                    ? 'border-ice-accent bg-ice-accent/5 ring-1 ring-ice-accent/30'
                    : 'border-ice-border bg-ice-surface hover:border-ice-text-3 hover:bg-ice-hover',
                )}
              >
                <img src={p.icon} alt={p.name} className="w-7 h-7" />
                <span className="text-xs font-medium text-ice-text-1">{p.name}</span>
                {isSelected && (
                  <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-ice-accent flex items-center justify-center">
                    <Check className="w-2 h-2 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Region selection */}
      {provider && regions.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-ice-text-2 mb-1.5">{t('onboarding.cloud.regionLabel')}</label>
          <select
            value={region || ''}
            onChange={(e) => dispatch(setDefaultRegion(e.target.value))}
            className="ice-input w-full"
          >
            {regions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-ice-text-3 mt-1">
            {t('onboarding.cloud.regionAutoHint')}
          </p>
        </div>
      )}

      {/* Credentials */}
      {provider && !cloudConnected && fields.length > 0 && (
        <div className="space-y-3 pt-1 border-t border-ice-border">
          <p className="text-xs font-medium text-ice-text-2 pt-2">{t('onboarding.cloud.credentialsHint')}</p>

          {error && (
            <div className="p-3 rounded-lg bg-ice-red/10 border border-ice-red/20 text-sm text-ice-red">{error}</div>
          )}

          {fields.map((field) => (
            <div key={field.name}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-ice-text-2">{field.label}</label>
                {field.helpLink && (
                  <a
                    href={field.helpLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-ice-accent hover:underline"
                  >
                    {field.helpLink.text}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {field.type === 'textarea' ? (
                <textarea
                  value={formValues[field.name] || ''}
                  onChange={(e) => setFormValues({ ...formValues, [field.name]: e.target.value })}
                  placeholder={field.placeholder}
                  rows={4}
                  className="ice-input w-full font-mono text-xs"
                />
              ) : (
                <input
                  type={field.type}
                  value={formValues[field.name] || ''}
                  onChange={(e) => setFormValues({ ...formValues, [field.name]: e.target.value })}
                  placeholder={field.placeholder}
                  className="ice-input w-full"
                />
              )}
            </div>
          ))}

          <button onClick={handleConnect} disabled={connecting} className="ice-btn ice-btn-primary w-full">
            {connecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : providerMeta ? (
              <img src={providerMeta.icon} alt="" className="w-4 h-4" />
            ) : null}
            {t('onboarding.cloud.testAndConnect')}
          </button>
        </div>
      )}

      {/* Connected state */}
      {cloudConnected && providerMeta && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <img src={providerMeta.icon} alt={providerMeta.name} className="w-8 h-8" />
          <div className="flex-1">
            <div className="font-medium text-sm text-ice-text-1">{providerMeta.name}</div>
            <div className="text-xs text-ice-text-2">{t('onboarding.cloud.connected')}</div>
          </div>
          <Check className="w-5 h-5 text-emerald-500" />
        </div>
      )}

      <div className="flex items-start gap-2 p-3 rounded-lg bg-ice-raised border border-ice-border">
        <ShieldCheck className="w-4 h-4 text-ice-accent shrink-0 mt-0.5" />
        <p className="text-xs text-ice-text-2">
          {t('onboarding.cloud.securityNote')}
        </p>
      </div>
    </div>
  );
};
