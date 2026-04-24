/**
 * Project Settings Page — tabbed layout
 *
 * Tabs: General · Environments · Collaborators · Danger Zone
 */

import { useTranslation } from '@ui/i18n';
import axiosInstance from '@ui/shared/api/axios-instance';
import { cn } from '@ui/shared/utils/cn';
import awsIcon from 'devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg';
import azureIcon from 'devicon/icons/azure/azure-original.svg';
import gcpIcon from 'devicon/icons/googlecloud/googlecloud-original.svg';
import { Save, Loader2, Trash2, AlertTriangle, Settings, Globe, AlertOctagon } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ProjectEnvironments } from './environments';
import type { RootState } from '@ui/store';

const PROVIDERS = [
  {
    id: 'gcp',
    name: 'Google Cloud',
    icon: gcpIcon,
    regions: [
      'us-central1', 'us-east1', 'us-west1', 'europe-west1',
      'europe-west2', 'asia-east1', 'asia-southeast1', 'australia-southeast1',
    ],
  },
  {
    id: 'aws',
    name: 'AWS',
    icon: awsIcon,
    regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1', 'sa-east-1'],
  },
  {
    id: 'azure',
    name: 'Azure',
    icon: azureIcon,
    regions: ['eastus', 'westus2', 'westeurope', 'northeurope', 'southeastasia', 'australiaeast', 'brazilsouth'],
  },
];

type SettingsTab = 'general' | 'environments' | 'collaborators' | 'danger';

interface ProjectSettingsProps {
  projectId: string;
}

// ─── Tab Button ─────────────────────────────────────────────────────────────

const TabButton: React.FC<{
  active: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  className?: string;
}> = ({ active, icon: Icon, label, onClick, className }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
      active ? 'border-blue-500 text-ice-text-1' : 'border-transparent text-ice-text-3 hover:text-ice-text-2',
      className,
    )}
  >
    <Icon className="w-3.5 h-3.5" />
    {label}
  </button>
);

// ─── Main Component ─────────────────────────────────────────────────────────

export const ProjectSettings: React.FC<ProjectSettingsProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const selectedOrg = useSelector((s: RootState) => s.account.selectedOrg);
  const [tab, setTab] = useState<SettingsTab>('general');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState('');
  const [region, setRegion] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.post('/canvas/projects/get', { projectId });
        setName(res.data.name || '');
        setDescription(res.data.description || '');
        setProvider(res.data.provider || '');
        setRegion(res.data.region || '');
      } catch {
        /* ignore */
      }
      setLoading(false);
    };
    load();
  }, [projectId]);

  const selectedProvider = PROVIDERS.find((p) => p.id === provider);
  const regions = selectedProvider?.regions || [];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await axiosInstance.post('/canvas/projects/update', { projectId, name, description, provider, region });
      setMessage({ type: 'success', text: t('project.settings.saveSuccess') });
    } catch {
      setMessage({ type: 'error', text: t('project.settings.saveError') });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-ice-text-3" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <h1 className="text-xl font-semibold text-ice-text-1 mb-6">{t('project.settings.title')}</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-ice-border">
        <TabButton active={tab === 'general'} icon={Settings} label={t('project.settings.tabGeneral')} onClick={() => setTab('general')} />
        <TabButton active={tab === 'environments'} icon={Globe} label={t('project.settings.tabEnvironments')} onClick={() => setTab('environments')} />
        <TabButton active={tab === 'danger'} icon={AlertOctagon} label={t('project.settings.tabDangerZone')} onClick={() => setTab('danger')} className={tab === 'danger' ? 'border-red-500 text-red-400' : undefined} />
      </div>

      {/* ── General Tab ─────────────────────────────────────────────────── */}
      {tab === 'general' && (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="ice-card">
            <div className="ice-card-header">
              <h2 className="text-ice-md font-semibold text-ice-text-1">{t('project.settings.generalHeading')}</h2>
            </div>
            <div className="ice-card-body space-y-4">
              <label className="block">
                <span className="block text-ice-sm font-medium text-ice-text-2 mb-1.5">
                  {t('project.settings.nameLabel')}
                </span>
                <input type="text" name="name" value={name} onChange={(e) => setName(e.target.value)} className="ice-input" />
              </label>
              <label className="block">
                <span className="block text-ice-sm font-medium text-ice-text-2 mb-1.5">
                  {t('project.settings.descriptionLabel')}
                </span>
                <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="ice-input resize-none" />
              </label>
            </div>
          </div>

          {/* Cloud Provider */}
          <div className="ice-card">
            <div className="ice-card-header">
              <h2 className="text-ice-md font-semibold text-ice-text-1">{t('project.settings.providerHeading')}</h2>
              <p className="text-ice-sm text-ice-text-3 mt-1">
                {provider && region ? t('project.settings.providerLockedDesc') : t('project.settings.providerUnlockedDesc')}
              </p>
            </div>
            <div className="ice-card-body space-y-4">
              <div>
                <span className="block text-ice-sm font-medium text-ice-text-2 mb-2">
                  {t('project.settings.providerLabel')}
                </span>
                <div className="flex gap-2">
                  {PROVIDERS.map((p) => {
                    const isSelected = provider === p.id;
                    const isLocked = !!provider && !!region;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { if (!isLocked) { setProvider(p.id); setRegion(''); } }}
                        disabled={isLocked && !isSelected}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-[border-color,background-color]',
                          isSelected ? 'border-ice-accent bg-ice-accent-muted'
                            : isLocked ? 'border-ice-border opacity-30 cursor-not-allowed'
                            : 'border-ice-border hover:border-ice-border-strong hover:bg-ice-hover',
                        )}
                      >
                        <img src={p.icon} alt={p.name} width={20} height={20} className="w-5 h-5" />
                        <span className="text-ice-sm font-medium text-ice-text-1">{p.name}</span>
                        {isSelected && isLocked && <span className="text-ice-xs text-ice-text-3">🔒</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {provider && (
                <label className="block">
                  <span className="block text-ice-sm font-medium text-ice-text-2 mb-1.5">
                    {t('project.settings.regionLabel')}{' '}
                    {provider && region && <span className="text-ice-text-3 font-normal">🔒 {t('project.settings.regionLocked')}</span>}
                  </span>
                  <select
                    name="region" value={region} onChange={(e) => setRegion(e.target.value)}
                    disabled={!!provider && !!region}
                    className={cn('ice-input', provider && region && 'opacity-70 cursor-not-allowed')}
                  >
                    <option value="">{t('project.settings.selectRegion')}</option>
                    {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
              )}
              {!provider && <p className="text-ice-sm text-ice-text-3">{t('project.settings.selectPrompt')}</p>}
            </div>
          </div>

          {message && (
            <p role="alert" aria-live="polite" className={`text-sm ${message.type === 'success' ? 'text-ice-green' : 'text-ice-red'}`}>
              {message.text}
            </p>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="ice-btn ice-btn-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('project.settings.saveButton')}
            </button>
          </div>
        </form>
      )}

      {/* ── Environments Tab ────────────────────────────────────────────── */}
      {tab === 'environments' && <ProjectEnvironments projectId={projectId} />}

      {/* ── Danger Zone Tab ─────────────────────────────────────────────── */}
      {tab === 'danger' && (
        <div className="rounded-lg border border-ice-red/30 bg-ice-red/5">
          <div className="px-5 py-4 border-b border-ice-red/20">
            <h2 className="text-ice-md font-semibold text-ice-red flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Danger Zone
            </h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div>
              <p className="text-ice-sm text-ice-text-1 font-medium">{t('project.settings.deleteTitle')}</p>
              <p className="text-ice-xs text-ice-text-2 mt-1">{t('project.settings.deleteDescription')}</p>
            </div>
            <div>
              <label className="block text-ice-xs text-ice-text-2 mb-1.5">
                {t('project.settings.deleteConfirmLabel', { name })}
              </label>
              <input
                type="text" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)}
                placeholder={name} className="ice-input w-full max-w-xs"
              />
            </div>
            <button
              onClick={async () => {
                if (confirmDelete !== name) return;
                setDeleting(true);
                try {
                  await axiosInstance.post('/canvas/projects/delete', { projectId, organisationId: selectedOrg?.id });
                  navigate('/', { replace: true });
                } catch {
                  setMessage({ type: 'error', text: t('project.settings.deleteError') });
                  setDeleting(false);
                }
              }}
              disabled={confirmDelete !== name || deleting}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-ice-sm font-medium rounded-md transition-colors',
                confirmDelete === name ? 'bg-ice-red text-white hover:bg-ice-red/90' : 'bg-ice-raised text-ice-text-3 cursor-not-allowed',
              )}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {t('project.settings.deleteButton')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
