/**
 * UserSettingsPage — Community Edition
 *
 * Profile name editing only. No password management (no auth in community).
 */

import { isProviderEnabled } from '@ice/constants';
import awsIcon from 'devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg';
import azureIcon from 'devicon/icons/azure/azure-original.svg';
import gcpIcon from 'devicon/icons/googlecloud/googlecloud-original.svg';
import { Save, Loader2, Sparkles, Check } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { AnthropicConnectModal } from '../../../features/integrations/components/anthropic-connect-modal';
import { GitHubConnectModal, GithubIcon } from '../../../features/integrations/components/github-connect-modal';
import { ProviderConnectModal } from '../../../features/integrations/components/provider-connect-modal';
import { useTranslation } from '../../../i18n';
import axiosInstance from '../../../shared/api/axios-instance';
import { fetchProfile } from '../../../store/slices/account-slice';
import {
  checkAnthropicConnection,
  checkGitHubConnection,
  type IntegrationStatus,
} from '../../../store/slices/integrations-slice';
import type { RootState, AppDispatch } from '../../../store';

export function UserSettingsPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.account.user);
  const integrations = useSelector((s: RootState) => s.integrations.integrations);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [openIntegration, setOpenIntegration] = useState<'github' | 'anthropic' | 'gcp' | 'aws' | 'azure' | null>(null);

  useEffect(() => {
    if (user?.name) {
      const parts = user.name.split(' ');
      setFirstName(parts[0] ?? '');
      setLastName(parts.slice(1).join(' '));
    }
  }, [user?.name]);

  useEffect(() => {
    dispatch(checkGitHubConnection());
    dispatch(checkAnthropicConnection());
  }, [dispatch]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;

    setProfileLoading(true);
    setProfileMessage(null);

    try {
      await axiosInstance.put('/profile/name', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setProfileMessage({ type: 'success', text: t('account.settings.profileSaved') });
      dispatch(fetchProfile());
    } catch {
      setProfileMessage({ type: 'error', text: t('account.settings.profileSaveFailed') });
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <div id="ice-settings-panel" className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-8 text-2xl font-bold text-ice-text-1">{t('account.settings.title')}</h1>

      {/* Profile Section */}
      <section className="rounded-lg border border-ice-border bg-ice-raised">
        <div className="border-b border-ice-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ice-text-1">{t('account.settings.profileTitle')}</h2>
          <p className="mt-1 text-sm text-ice-text-3">{t('account.settings.profileSubtitle')}</p>
        </div>

        <form onSubmit={handleProfileSave} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ice-text-2">
                {t('account.settings.firstNameLabel')}
              </span>
              <input
                id="ice-settings-input-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-1 placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] transition-colors"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ice-text-2">
                {t('account.settings.lastNameLabel')}
              </span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-1 placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] transition-colors"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ice-text-2">{t('account.settings.emailLabel')}</span>
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
              className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-3 cursor-not-allowed"
            />
          </label>

          {profileMessage && (
            <p
              className={`rounded-md border px-3 py-2 text-sm ${
                profileMessage.type === 'success'
                  ? 'border-[#238636]/30 bg-ice-accent/10 text-[#3fb950]'
                  : 'border-red-500/30 bg-red-500/10 text-red-400'
              }`}
            >
              {profileMessage.text}
            </p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={profileLoading || !firstName.trim()}
              className="flex items-center gap-2 rounded-md bg-ice-accent px-4 py-2 text-sm font-medium text-ice-text-1 hover:bg-ice-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('account.settings.saveProfileButton')}
            </button>
          </div>
        </form>
      </section>

      {/* Integrations Section */}
      <section className="mt-6 rounded-lg border border-ice-border bg-ice-raised">
        <div className="border-b border-ice-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ice-text-1">{t('integrations.settings.sectionTitle')}</h2>
          <p className="mt-1 text-sm text-ice-text-3">{t('integrations.settings.sectionDescription')}</p>
        </div>

        <ul className="divide-y divide-ice-border">
          <IntegrationRow
            icon={<Sparkles className="h-5 w-5 text-amber-500" />}
            label={t('integrations.anthropic.settingsLabel')}
            description={t('integrations.anthropic.settingsDescription')}
            connectedLabel={t('integrations.connected')}
            disconnectedLabel={t('integrations.disconnected')}
            status={integrations.anthropic?.status}
            onClick={() => setOpenIntegration('anthropic')}
          />
          <IntegrationRow
            icon={<GithubIcon w={5} h={5} className="text-ice-text-1" />}
            label={t('integrations.settings.github.label')}
            description={t('integrations.settings.github.description')}
            connectedLabel={t('integrations.connected')}
            disconnectedLabel={t('integrations.disconnected')}
            status={integrations.github?.status}
            onClick={() => setOpenIntegration('github')}
          />
          {isProviderEnabled('gcp') && (
            <IntegrationRow
              icon={<img src={gcpIcon} alt="" className="h-5 w-5" />}
              label={t('integrations.settings.gcp.label')}
              description={t('integrations.settings.gcp.description')}
              connectedLabel={t('integrations.connected')}
              disconnectedLabel={t('integrations.disconnected')}
              status={integrations.gcp?.status}
              onClick={() => setOpenIntegration('gcp')}
            />
          )}
          {isProviderEnabled('aws') && (
            <IntegrationRow
              icon={<img src={awsIcon} alt="" className="h-5 w-5" />}
              label={t('integrations.settings.aws.label')}
              description={t('integrations.settings.aws.description')}
              connectedLabel={t('integrations.connected')}
              disconnectedLabel={t('integrations.disconnected')}
              status={integrations.aws?.status}
              onClick={() => setOpenIntegration('aws')}
            />
          )}
          {isProviderEnabled('azure') && (
            <IntegrationRow
              icon={<img src={azureIcon} alt="" className="h-5 w-5" />}
              label={t('integrations.settings.azure.label')}
              description={t('integrations.settings.azure.description')}
              connectedLabel={t('integrations.connected')}
              disconnectedLabel={t('integrations.disconnected')}
              status={integrations.azure?.status}
              onClick={() => setOpenIntegration('azure')}
            />
          )}
        </ul>
      </section>

      <AnthropicConnectModal isOpen={openIntegration === 'anthropic'} onClose={() => setOpenIntegration(null)} />
      <GitHubConnectModal isOpen={openIntegration === 'github'} onClose={() => setOpenIntegration(null)} />
      {isProviderEnabled('gcp') && (
        <ProviderConnectModal
          isOpen={openIntegration === 'gcp'}
          onClose={() => setOpenIntegration(null)}
          providerId="gcp"
          providerName="Google Cloud Platform"
          providerIcon={gcpIcon}
          description="Service account key (JSON) or OAuth"
          fields={[
            {
              name: 'service_account_key',
              label: 'Service Account Key (JSON)',
              type: 'textarea',
              placeholder: '{ "type": "service_account", ... }',
              required: false,
              helpLink: {
                url: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
                text: 'Create service account',
              },
            },
          ]}
        />
      )}
      {isProviderEnabled('aws') && (
        <ProviderConnectModal
          isOpen={openIntegration === 'aws'}
          onClose={() => setOpenIntegration(null)}
          providerId="aws"
          providerName="Amazon Web Services"
          providerIcon={awsIcon}
          description="Access keys"
          fields={[
            { name: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...', required: true },
            {
              name: 'secretAccessKey',
              label: 'Secret Access Key',
              type: 'password',
              placeholder: '********',
              required: true,
            },
          ]}
        />
      )}
      {isProviderEnabled('azure') && (
        <ProviderConnectModal
          isOpen={openIntegration === 'azure'}
          onClose={() => setOpenIntegration(null)}
          providerId="azure"
          providerName="Microsoft Azure"
          providerIcon={azureIcon}
          description="Service principal"
          fields={[
            {
              name: 'subscriptionId',
              label: 'Subscription ID',
              type: 'text',
              placeholder: 'xxxxxxxx-xxxx-...',
              required: true,
            },
            { name: 'tenantId', label: 'Tenant ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-...', required: true },
            { name: 'clientId', label: 'Client ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-...', required: true },
            { name: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: '********', required: true },
          ]}
        />
      )}
    </div>
  );
}

interface IntegrationRowProps {
  icon: ReactNode;
  label: string;
  description: string;
  connectedLabel: string;
  disconnectedLabel: string;
  status: IntegrationStatus | undefined;
  onClick: () => void;
}

function IntegrationRow({
  icon,
  label,
  description,
  connectedLabel,
  disconnectedLabel,
  status,
  onClick,
}: IntegrationRowProps) {
  const isConnected = status === 'connected';
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-ice-hover transition-colors"
      >
        <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-md bg-ice-surface border border-ice-border">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ice-text-1">{label}</div>
          <div className="text-xs text-ice-text-3 truncate">{description}</div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 text-xs">
          {isConnected ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500">{connectedLabel}</span>
            </>
          ) : (
            <span className="text-ice-text-3">{disconnectedLabel}</span>
          )}
        </div>
      </button>
    </li>
  );
}
