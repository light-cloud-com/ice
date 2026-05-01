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
import { cn } from '../../../shared/utils/cn';
import { setActiveCard, importToActiveCard, createCard } from '../../../store/slices/cards-slice';
import { openDeployPanel } from '../../../store/slices/deploy-slice';
import {
  fetchEnvironments,
  deleteEnvironment,
  setActiveEnvironment,
  compareEnvironments,
  type Environment,
} from '../../../store/slices/environments-slice';
import type { RootState, AppDispatch } from '../../../store';
import { getDeployStatusDotColor } from '../utils/deploy-status-color';
import { CreateEnvironmentModal } from './create-environment-modal';
import { RenameEnvironmentModal } from './rename-environment-modal';

interface EnvironmentTabBarProps {
  projectId: string;
  basePath?: string;
}

export const EnvironmentTabBar: React.FC<EnvironmentTabBarProps> = ({ projectId, basePath: _basePath }) => {
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
              const dotColor = getDeployStatusDotColor(deployStatus);

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
        <RenameEnvironmentModal env={renameTarget} projectId={projectId} onClose={() => setRenameTarget(null)} />
      )}
    </>
  );
};

