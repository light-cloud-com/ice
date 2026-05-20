/**
 * Provider Connect Modal — Individual modal for connecting a cloud provider
 *
 * Shows connection status, credential form, and connected state.
 */

import { PROVIDER_READINESS, type Provider } from '@ice/constants';
import { AlertTriangle, Check, Loader2, LogOut, ExternalLink } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../../i18n';
import { getApi } from '../../../shared/api/api-adapter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../../shared/components/ui/dialog';
import { useGCPOAuth } from '../../../shared/hooks/use-gcp-oauth';
import { cn } from '../../../shared/utils/cn';

interface ProviderField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'textarea';
  placeholder?: string;
  required: boolean;
  helpLink?: { url: string; text: string };
}

interface ProviderConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerId: string;
  providerName: string;
  providerIcon: string; // SVG URL
  description: string;
  fields: ProviderField[];
}

export const ProviderConnectModal: React.FC<ProviderConnectModalProps> = ({
  isOpen,
  onClose,
  providerId,
  providerName,
  providerIcon,
  description,
  fields,
}) => {
  const { t } = useTranslation();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState<string | null>(null);

  // GCP OAuth via Google Identity Services
  const gcpOAuth = useGCPOAuth(() => {
    setConnected(true);
    setSuccess(t('providerConnect.success.connectedViaGoogle', { providerName }));
    // Reload project info
    (async () => {
      const creds = await getApi().provider.getCredentials(providerId);
      setProjectId(creds?.project_id || null);
    })();
  });

  useEffect(() => {
    if (gcpOAuth.error) setError(gcpOAuth.error);
  }, [gcpOAuth.error]);

  // Check connection status on open
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    (async () => {
      try {
        const isConn = await getApi().provider.isConnected(providerId);
        setConnected(isConn);
        if (isConn) {
          const creds = await getApi().provider.getCredentials(providerId);
          setProjectId(creds?.project_id || null);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, providerId]);

  const handleConnect = async () => {
    // Validate required fields
    for (const field of fields) {
      if (field.required && !formValues[field.name]?.trim()) {
        setError(`${field.label} is required`);
        return;
      }
    }

    setConnecting(true);
    setError(null);

    try {
      const result = await getApi().provider.connect(providerId, formValues);
      if (result.success) {
        setConnected(true);
        setProjectId(result.project_id || formValues.project_id || null);
        setSuccess(t('providerConnect.success.connected', { providerName }));
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

  const handleDisconnect = async () => {
    try {
      await getApi().provider.disconnect(providerId);
      setConnected(false);
      setProjectId(null);
      setFormValues({});
      setSuccess(null);
    } catch (err: any) {
      setError(err?.message || 'Disconnect failed');
    }
  };

  const readiness = PROVIDER_READINESS[providerId as Provider];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img src={providerIcon} alt={providerName} className="w-5 h-5" />
            {providerName}
            {readiness && readiness !== 'stable' && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">
                {readiness === 'experimental' ? 'Experimental' : 'Preview'}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {readiness && readiness !== 'stable' && (
          <div
            role="note"
            className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              {readiness === 'experimental'
                ? `${providerName} support is experimental — major primitives work but parity with GCP is in progress.`
                : `${providerName} blocks render on the canvas but the deployer is a stub.`}
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-ice-text-3" />
          </div>
        ) : connected ? (
          /* Connected state */
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-ice-green-muted border border-ice-green/20">
              <img src={providerIcon} alt={providerName} className="w-8 h-8" />
              <div className="flex-1">
                <div className="font-medium text-sm text-ice-text-1">{providerName}</div>
                <div className="text-xs text-ice-text-3">
                  {projectId
                    ? t('providerConnect.status.project', { projectId })
                    : t('providerConnect.status.connected')}
                </div>
              </div>
              <Check className="w-5 h-5 text-ice-green" />
            </div>
            {success && <div className="text-sm text-ice-green">{success}</div>}
            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md border border-ice-border hover:bg-ice-hover transition-colors text-ice-text-2"
            >
              <LogOut className="w-4 h-4" />
              {t('providerConnect.disconnectButton')}
            </button>
          </div>
        ) : (
          /* Connect form */
          <div className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-ice-red-muted border border-ice-red/20 text-sm text-ice-red">
                {error}
              </div>
            )}

            {/* GCP: Service account key fields first, then OAuth option */}
            {fields.map((field) => (
              <div key={field.name}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-ice-text-1">
                    {field.label}
                    {field.required && <span className="text-ice-red ml-1">*</span>}
                  </label>
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
                    rows={6}
                    className="w-full px-3 py-2 text-sm rounded-md border border-ice-border bg-ice-base text-ice-text-1 placeholder:text-ice-text-3 focus:outline-none focus:border-ice-accent focus:ring-2 focus:ring-ice-accent-muted font-mono text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && e.metaKey && handleConnect()}
                  />
                ) : (
                  <input
                    type={field.type}
                    value={formValues[field.name] || ''}
                    onChange={(e) => setFormValues({ ...formValues, [field.name]: e.target.value })}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 text-sm rounded-md border border-ice-border bg-ice-base text-ice-text-1 placeholder:text-ice-text-3 focus:outline-none focus:border-ice-accent focus:ring-2 focus:ring-ice-accent-muted"
                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                  />
                )}
              </div>
            ))}

            <button onClick={handleConnect} disabled={connecting} className="ice-btn ice-btn-primary w-full">
              {connecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <img src={providerIcon} alt="" className="w-4 h-4" />
              )}
              {t('providerConnect.connectButton', { providerName })}
            </button>

            {/* GCP: Setup guide + quick connect + org policy info */}
            {providerId === 'gcp' && (
              <>
                {/* Step-by-step guide */}
                <details className="group">
                  <summary className="flex items-center gap-2 text-xs font-medium text-ice-accent cursor-pointer hover:underline">
                    <ExternalLink className="w-3 h-3" />
                    {t('providerConnect.gcp.guide.title')}
                  </summary>
                  <div className="mt-2 p-3 rounded-lg bg-ice-surface border border-ice-border text-xs text-ice-text-2 space-y-2">
                    <p className="font-medium text-ice-text-1">{t('providerConnect.gcp.guide.step1Title')}</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>{t('providerConnect.gcp.guide.step1_1')}</li>
                      <li>{t('providerConnect.gcp.guide.step1_2')}</li>
                      <li>
                        {t('providerConnect.gcp.guide.step1_3')}
                        <ul className="list-disc pl-4 mt-1 space-y-0.5">
                          <li>{t('providerConnect.gcp.guide.step1_3_role1')}</li>
                          <li>{t('providerConnect.gcp.guide.step1_3_role2')}</li>
                        </ul>
                      </li>
                      <li>{t('providerConnect.gcp.guide.step1_4')}</li>
                    </ol>

                    <p className="font-medium text-ice-text-1 pt-1">{t('providerConnect.gcp.guide.step2Title')}</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>{t('providerConnect.gcp.guide.step2_1')}</li>
                      <li>{t('providerConnect.gcp.guide.step2_2')}</li>
                      <li>{t('providerConnect.gcp.guide.step2_3')}</li>
                      <li>{t('providerConnect.gcp.guide.step2_4')}</li>
                    </ol>

                    <div className="pt-2 border-t border-ice-border space-y-1.5">
                      <p className="font-medium text-ice-text-1">{t('providerConnect.gcp.troubleshooting.title')}</p>
                      <p>
                        <strong>{t('providerConnect.gcp.troubleshooting.cantCreateKeys')}</strong>{' '}
                        <code className="px-1 py-0.5 rounded bg-ice-hover text-ice-2xs">
                          iam.disableServiceAccountKeyCreation
                        </code>
                        {' → '}
                        <a
                          href="https://console.cloud.google.com/iam-admin/orgpolicies/iam-disableServiceAccountKeyCreation"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ice-accent hover:underline"
                        >
                          Organisation Policies
                        </a>
                      </p>
                      <p>
                        <strong>{t('providerConnect.gcp.troubleshooting.oauthNotWorking')}</strong>{' '}
                        <a
                          href="https://admin.google.com/ac/security/reauth"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ice-accent hover:underline"
                        >
                          Workspace Admin &rarr; Security &rarr; Google Cloud session control
                        </a>
                      </p>
                    </div>
                  </div>
                </details>

                {/* Quick connect divider */}
                <div className="flex items-center gap-3 text-xs text-ice-text-3">
                  <div className="flex-1 border-t border-ice-border" />
                  <span>{t('providerConnect.gcp.quickConnect.divider')}</span>
                  <div className="flex-1 border-t border-ice-border" />
                </div>

                <button
                  onClick={() => {
                    setError(null);
                    gcpOAuth.connect();
                  }}
                  disabled={gcpOAuth.connecting}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm',
                    'bg-ice-raised border border-ice-border text-ice-text-1',
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
                  {t('providerConnect.gcp.quickConnect.button')}
                </button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
