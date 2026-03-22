/**
 * Onboarding Step 3 — Connect Cloud Provider
 *
 * Provider selection (GCP/AWS/Azure) + region + credential form.
 * Provider/region selection moved here from the old Welcome step.
 */

import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Check, Loader2, ExternalLink, ShieldCheck } from 'lucide-react';
import { cn } from '../../../shared/utils/cn';
import { setDefaultProvider, setDefaultRegion, setCloudConnected } from '../../../store/slices/onboarding-slice';
import { getApi } from '../../../shared/api/api-adapter';
import { useGCPOAuth } from '../../../shared/hooks/use-gcp-oauth';
import gcpIcon from 'devicon/icons/googlecloud/googlecloud-original.svg';
import awsIcon from 'devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg';
import azureIcon from 'devicon/icons/azure/azure-original.svg';
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
  const provider = useSelector((s: RootState) => s.onboarding.defaultProvider);
  const region = useSelector((s: RootState) => s.onboarding.defaultRegion);
  const cloudConnected = useSelector((s: RootState) => s.onboarding.cloudConnected);

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gcpMethod, setGcpMethod] = useState<'oauth' | 'service_account'>('oauth');

  const regions = provider ? PROVIDER_REGIONS[provider] || [] : [];
  const fields = provider ? CREDENTIAL_FIELDS[provider] || [] : [];
  const providerMeta = PROVIDERS.find((p) => p.id === provider);

  // GCP OAuth via Google Identity Services
  const gcpOAuth = useGCPOAuth(() => {
    dispatch(setCloudConnected(true));
    setFormValues({});
  });

  // Sync OAuth errors
  useEffect(() => {
    if (gcpOAuth.error) setError(gcpOAuth.error);
  }, [gcpOAuth.error]);

  const handleGCPOAuth = () => {
    setError(null);
    gcpOAuth.connect();
  };

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
        setError(result.error || 'Connection failed');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-ice-text-1">Connect your cloud</h2>
        <p className="text-sm text-ice-text-2 mt-1">ICE deploys to your cloud account — we never store your data</p>
      </div>

      {/* Provider selection */}
      <div>
        <label className="block text-sm font-medium text-ice-text-2 mb-2">Default cloud provider</label>
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
          <label className="block text-sm font-medium text-ice-text-2 mb-1.5">Default region</label>
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
            Auto-selected based on your location. You can change this per project.
          </p>
        </div>
      )}

      {/* Credentials — only if provider selected */}
      {provider && !cloudConnected && (
        <div className="space-y-3 pt-1 border-t border-ice-border">
          <p className="text-xs font-medium text-ice-text-2 pt-2">Credentials (optional — connect now or later)</p>

          {error && (
            <div className="p-3 rounded-lg bg-ice-red/10 border border-ice-red/20 text-sm text-ice-red">{error}</div>
          )}

          {/* GCP: OAuth primary option */}
          {provider === 'gcp' && (
            <>
              <button
                onClick={handleGCPOAuth}
                disabled={gcpOAuth.connecting}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
                  'bg-white dark:bg-ice-raised border border-ice-border',
                  'hover:bg-ice-hover transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {gcpOAuth.connecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
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
                Sign in with Google
              </button>

              <div className="flex items-center gap-3 text-xs text-ice-text-3">
                <div className="flex-1 border-t border-ice-border" />
                <button
                  type="button"
                  onClick={() => setGcpMethod(gcpMethod === 'oauth' ? 'service_account' : 'oauth')}
                  className="hover:text-ice-text-2 transition-colors"
                >
                  {gcpMethod === 'oauth' ? 'or use a service account key' : 'or sign in with Google'}
                </button>
                <div className="flex-1 border-t border-ice-border" />
              </div>
            </>
          )}

          {/* Service account / other provider fields */}
          {(provider !== 'gcp' || gcpMethod === 'service_account') && fields.length > 0 && (
            <>
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
                Test & Connect
              </button>
            </>
          )}
        </div>
      )}

      {/* Connected state */}
      {cloudConnected && providerMeta && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <img src={providerMeta.icon} alt={providerMeta.name} className="w-8 h-8" />
          <div className="flex-1">
            <div className="font-medium text-sm text-ice-text-1">{providerMeta.name}</div>
            <div className="text-xs text-ice-text-2">Connected</div>
          </div>
          <Check className="w-5 h-5 text-emerald-500" />
        </div>
      )}

      <div className="flex items-start gap-2 p-3 rounded-lg bg-ice-raised border border-ice-border">
        <ShieldCheck className="w-4 h-4 text-ice-accent shrink-0 mt-0.5" />
        <p className="text-xs text-ice-text-2">
          Credentials are encrypted at rest and used only to manage your infrastructure.
        </p>
      </div>
    </div>
  );
};
