/**
 * Environment Tab Bar — Second row below AppBar
 *
 * Shows environment tabs for the current project.
 * Production tab has a lock icon. PR tabs have a # badge.
 * Clicking switches the active canvas card.
 */

import { Lock, Plus, GitPullRequest, Loader2, ArrowUpRight, Trash2, Rocket, Pencil } from 'lucide-react';
import React, { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from '../../../i18n';
import { getApi } from '../../../shared/api/api-adapter';
import { IceSelect } from '../../../shared/components/ui/ice-select';
import { cn } from '../../../shared/utils/cn';
import { setActiveCard, importToActiveCard, createCard } from '../../../store/slices/cards-slice';
import { openDeployPanel } from '../../../store/slices/deploy-slice';
import {
  fetchEnvironments,
  createEnvironment,
  deleteEnvironment,
  renameEnvironment,
  setActiveEnvironment,
  compareEnvironments,
  type Environment,
} from '../../../store/slices/environments-slice';
import type { RootState, AppDispatch } from '../../../store';

interface EnvironmentTabBarProps {
  projectId: string;
  basePath?: string;
}

export const EnvironmentTabBar: React.FC<EnvironmentTabBarProps> = ({ projectId, basePath }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const environments = useSelector((s: RootState) => s.environments.byProject[projectId] || []);
  const activeEnvId = useSelector((s: RootState) => s.environments.activeEnvId[projectId]);
  const loading = useSelector((s: RootState) => s.environments.loading);
  const activeEnv = environments.find((e) => e.id === activeEnvId);
  const prodEnv = environments.find((e) => e.type === 'production');
  const canPromote = activeEnv && !activeEnv.is_protected && prodEnv;
  const [showCreate, setShowCreate] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Environment | null>(null);
  const [contextMenu, setContextMenu] = useState<{ envId: string; x: number; y: number } | null>(null);
  const [envDeployStatus, setEnvDeployStatus] = useState<Record<string, { status: string; url?: string }>>({});

  // Fetch environments on mount
  useEffect(() => {
    if (projectId) {
      dispatch(fetchEnvironments(projectId));
    }
  }, [projectId, dispatch]);

  // Fetch deploy statuses in parallel with abort-on-unmount guard
  useEffect(() => {
    if (environments.length === 0) return;
    let cancelled = false;
    const fetchStatuses = async () => {
      const api = getApi();
      const results = await Promise.allSettled(
        environments.map(async (env) => {
          const res = await api.deploy.getDeployments(env.card_id);
          const deploys = Array.isArray(res) ? res : res?.deployments || [];
          return { envId: env.id, deploy: deploys[0] };
        }),
      );
      if (cancelled) return;
      const statuses: Record<string, { status: string; url?: string }> = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.deploy) {
          statuses[r.value.envId] = { status: r.value.deploy.status, url: r.value.deploy.deployed_url };
        }
      }
      setEnvDeployStatus(statuses);
    };
    fetchStatuses();
    return () => {
      cancelled = true;
    };
  }, [environments]);

  // Switch environment → load its card
  const handleSwitchEnv = useCallback(
    async (env: Environment) => {
      dispatch(setActiveEnvironment({ projectId, envId: env.id }));

      try {
        // Check if card already loaded in Redux
        const { store } = await import('../../../store');
        const state = store.getState();
        const existing = state.cards.cards.find((c: any) => c.id === env.card_id);

        if (existing && existing.nodes.length > 0) {
          // Card already in Redux — just switch to it
          dispatch(setActiveCard(env.card_id));
          return;
        }

        // Load from backend
        const api = getApi();
        const cardData = await api.graph.load(env.card_id);
        if (!cardData) return;

        // Create card in Redux if not exists
        if (!existing) {
          dispatch(createCard({ name: cardData.name || env.name, id: cardData.id, projectId }));
        }
        // Set active FIRST, then import content into it
        dispatch(setActiveCard(cardData.id));
        if (cardData.nodes?.length > 0 || cardData.edges?.length > 0) {
          dispatch(
            importToActiveCard({
              nodes: cardData.nodes || [],
              edges: cardData.edges || [],
              skipAutoOrganize: true,
            }),
          );
        }
      } catch (err) {
        console.error('Failed to load environment card:', err);
      }
    },
    [projectId, dispatch],
  );

  // Auto-switch to production on first load
  useEffect(() => {
    if (environments.length > 0 && !activeEnvId) {
      const prod = environments.find((e) => e.type === 'production');
      if (prod) handleSwitchEnv(prod);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use .length to avoid re-firing on array reference changes
  }, [environments.length, activeEnvId, handleSwitchEnv]);

  const handleContextMenu = useCallback((e: React.MouseEvent, envId: string) => {
    e.preventDefault();
    setContextMenu({ envId, x: e.clientX, y: e.clientY });
  }, []);

  const handleDelete = useCallback(
    (envId: string) => {
      setContextMenu(null);
      dispatch(deleteEnvironment({ envId, projectId }));
    },
    [projectId, dispatch],
  );

  const handlePromote = useCallback(
    (envId: string) => {
      setContextMenu(null);
      const prod = environments.find((e) => e.type === 'production');
      if (prod) {
        dispatch(compareEnvironments({ sourceEnvId: envId, targetEnvId: prod.id }));
      }
    },
    [environments, dispatch],
  );

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  if (environments.length === 0 && !loading) return null;

  return (
    <>
      <div
        id="ice-env-bar"
        className="min-h-[36px] py-1 flex items-center gap-0.5 px-3 border-b border-ice-border bg-ice-toolbar shrink-0"
      >
        {loading && environments.length === 0 ? (
          <div className="flex items-center gap-1.5 text-ice-xs text-ice-text-3">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('environments.tabBar.loading')}
          </div>
        ) : (
          <>
            {/* Environment tabs */}
            {environments.map((env) => {
              const isActive = env.id === activeEnvId;
              const deployStatus = envDeployStatus[env.id];
              const dotColor =
                deployStatus?.status === 'success'
                  ? 'bg-emerald-500'
                  : deployStatus?.status === 'deploying'
                    ? 'bg-blue-500 animate-pulse'
                    : deployStatus?.status === 'failed'
                      ? 'bg-red-500'
                      : deployStatus?.status === 'planning' || deployStatus?.status === 'queued'
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-ice-text-3/30';

              return (
                <button
                  key={env.id}
                  onClick={() => handleSwitchEnv(env)}
                  onContextMenu={(e) => handleContextMenu(e, env.id)}
                  title={deployStatus?.url || env.name}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 text-ice-xs font-medium rounded transition-colors',
                    isActive
                      ? 'bg-ice-active text-ice-text-1'
                      : 'text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover',
                  )}
                >
                  {/* Status dot — reflects real deploy status */}
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />

                  {/* Name */}
                  {env.name}

                  {/* Deployed URL — shown as a small link icon when available */}
                  {deployStatus?.url && isActive && (
                    <a
                      href={deployStatus.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-ice-2xs text-blue-400 hover:text-blue-300 truncate max-w-[100px]"
                      title={deployStatus.url}
                    >
                      {deployStatus.url.replace(/^https?:\/\//, '').slice(0, 20)}
                    </a>
                  )}

                  {/* Lock icon for production */}
                  {env.is_protected && <Lock className="w-2.5 h-2.5 text-ice-text-3" />}

                  {/* PR badge */}
                  {env.type === 'pr' && env.pr_number && (
                    <span className="flex items-center gap-0.5 text-ice-2xs text-purple-400">
                      <GitPullRequest className="w-2.5 h-2.5" />#{env.pr_number}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Add environment button */}
            <button
              id="ice-env-btn-create"
              onClick={() => setShowCreate(true)}
              className="p-1 rounded text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover transition-colors ml-1"
              title={t('environments.tabBar.addEnvironment')}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Right side: promote + deploy actions */}
            <div className="flex items-center gap-0.5">
              {/* Promote button — only for non-production envs */}
              {canPromote && (
                <button
                  onClick={() =>
                    dispatch(compareEnvironments({ sourceEnvId: activeEnv!.id, targetEnvId: prodEnv!.id }))
                  }
                  className="flex items-center gap-1 px-2 py-1 text-ice-xs font-medium rounded text-amber-500 hover:bg-amber-500/10 transition-colors"
                  title={t('environments.tabBar.promoteToProduction')}
                >
                  <ArrowUpRight className="w-3 h-3" />
                  {t('environments.tabBar.promoteToProduction')}
                </button>
              )}

              {/* Deploy Infrastructure button */}
              <button
                onClick={() => dispatch(openDeployPanel())}
                className="flex items-center gap-1 px-2.5 py-1 text-ice-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                title={t('environments.tabBar.deployInfra')}
              >
                <Rocket className="w-3 h-3" />
                {t('environments.tabBar.deployInfra')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Context menu */}
      {contextMenu &&
        (() => {
          const env = environments.find((e) => e.id === contextMenu.envId);
          if (!env) return null;
          const showPromote = !env.is_protected && prodEnv;
          const showRename = !env.is_protected;
          const showDelete = !env.is_protected;

          return (
            <div
              className="fixed z-[9999] bg-ice-surface border border-ice-border rounded-md shadow-lg py-1 min-w-[170px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Deploy — available for all environments */}
              <button
                onClick={() => {
                  setContextMenu(null);
                  handleSwitchEnv(env);
                  dispatch(openDeployPanel());
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-ice-xs text-ice-text-2 hover:bg-ice-hover transition-colors"
              >
                <Rocket className="w-3.5 h-3.5" />
                {t('environments.tabBar.contextDeploy')}
              </button>
              {showPromote && (
                <button
                  onClick={() => handlePromote(contextMenu.envId)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-ice-xs text-ice-text-2 hover:bg-ice-hover transition-colors"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  {t('environments.tabBar.contextPromote')}
                </button>
              )}
              {showRename && (
                <button
                  onClick={() => {
                    setContextMenu(null);
                    setRenameTarget(env);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-ice-xs text-ice-text-2 hover:bg-ice-hover transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {t('environments.tabBar.contextRename')}
                </button>
              )}
              {showDelete && (
                <>
                  <div className="h-px bg-ice-border my-1" />
                  <button
                    onClick={() => handleDelete(contextMenu.envId)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-ice-xs text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('environments.tabBar.contextDelete')}
                  </button>
                </>
              )}
            </div>
          );
        })()}

      {/* Create environment modal */}
      {showCreate && <CreateEnvironmentModal projectId={projectId} onClose={() => setShowCreate(false)} />}

      {/* Rename environment modal */}
      {renameTarget && (
        <RenameEnvironmentModal
          env={renameTarget}
          projectId={projectId}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </>
  );
};

// ─── Rename Environment Modal ───────────────────────────────────────────────

const RenameEnvironmentModal: React.FC<{
  env: Environment;
  projectId: string;
  onClose: () => void;
}> = ({ env, projectId, onClose }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const [name, setName] = useState(env.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('environments.renameModal.errorNameRequired'));
      return;
    }
    if (trimmed === env.name) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await dispatch(renameEnvironment({ envId: env.id, projectId, name: trimmed })).unwrap();
      onClose();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || t('environments.renameModal.errorFallback'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[380px] bg-ice-surface border border-ice-border rounded-lg shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-ice-text-1">{t('environments.renameModal.title')}</h3>

        {error && (
          <div className="rounded bg-red-500/10 border border-red-500/20 px-3 py-2 text-ice-xs text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="text-ice-xs font-medium text-ice-text-2 block mb-1">
            {t('environments.renameModal.nameLabel')}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full px-2.5 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-ice-sm text-ice-text-3 hover:text-ice-text-2 transition-colors"
          >
            {t('environments.renameModal.cancelButton')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || name.trim() === env.name}
            className="px-3 py-1.5 text-ice-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {saving ? t('environments.renameModal.savingButton') : t('environments.renameModal.saveButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Create Environment Modal ───────────────────────────────────────────────

const CreateEnvironmentModal: React.FC<{
  projectId: string;
  onClose: () => void;
}> = ({ projectId, onClose }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('staging');
  const [region, setRegion] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError(t('environments.createModal.errorNameRequired'));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await dispatch(createEnvironment({ projectId, name: name.trim(), type, region: region || undefined })).unwrap();
      onClose();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || t('environments.createModal.errorFallback'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[380px] bg-ice-surface border border-ice-border rounded-lg shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-ice-text-1">{t('environments.createModal.title')}</h3>
        <p className="text-ice-xs text-ice-text-3">{t('environments.createModal.description')}</p>

        {error && (
          <div className="rounded bg-red-500/10 border border-red-500/20 px-3 py-2 text-ice-xs text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-ice-xs font-medium text-ice-text-2 block mb-1">
              {t('environments.createModal.nameLabel')}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('environments.createModal.namePlaceholder')}
              autoFocus
              className="w-full px-2.5 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div>
            <label className="text-ice-xs font-medium text-ice-text-2 block mb-1">
              {t('environments.createModal.typeLabel')}
            </label>
            <IceSelect
              value={type}
              onChange={setType}
              size="md"
              fullWidth
              allowEmpty={false}
              options={[
                { value: 'staging', label: t('environments.createModal.typeStaging') },
                { value: 'development', label: t('environments.createModal.typeDevelopment') },
                { value: 'pr', label: t('environments.createModal.typePrPreview') },
              ]}
            />
          </div>

          <div>
            <label className="text-ice-xs font-medium text-ice-text-2 block mb-1">
              {t('environments.createModal.regionLabel')}
            </label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder={t('environments.createModal.regionPlaceholder')}
              className="w-full px-2.5 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-ice-sm text-ice-text-3 hover:text-ice-text-2 transition-colors"
          >
            {t('environments.createModal.cancelButton')}
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="px-3 py-1.5 text-ice-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {creating ? t('environments.createModal.creatingButton') : t('environments.createModal.createButton')}
          </button>
        </div>
      </div>
    </div>
  );
};
