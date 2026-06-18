/**
 * Environment Tab Bar — Second row below AppBar
 *
 * Shows environment tabs for the current project.
 * Production tab has a lock icon. PR tabs have a # badge.
 * Clicking switches the active canvas card.
 */

import { Plus, Loader2, ArrowUpRight, Rocket } from 'lucide-react';
import React, { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { CreateEnvironmentModal } from './create-environment-modal';
import { EnvironmentContextMenu } from './environment-context-menu';
import { EnvironmentTabItem } from './environment-tab-item';
import { RenameEnvironmentModal } from './rename-environment-modal';
import { useTranslation } from '../../../i18n';
import { getApi } from '../../../shared/api/api-adapter';
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
  const fetchError = useSelector((s: RootState) => s.environments.fetchError);
  const activeEnv = environments.find((e) => e.id === activeEnvId);
  const prodEnv = environments.find((e) => e.type === 'production');
  const canPromote = activeEnv && !activeEnv.is_protected && prodEnv;
  const [showCreate, setShowCreate] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Environment | null>(null);
  const [contextMenu, setContextMenu] = useState<{ envId: string; x: number; y: number } | null>(null);
  const [envDeployStatus, setEnvDeployStatus] = useState<Record<string, { status: string; url?: string }>>({});
  // EI5 — the env id whose delete is "armed" (awaiting a confirming second
  // click). Declared LAST so it doesn't shift the indices of the useState calls
  // above (the tab-bar unit test addresses state setters positionally).
  const [confirmDeleteEnvId, setConfirmDeleteEnvId] = useState<string | null>(null);

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
      // EI9 — catch INSIDE the map so a failed fetch keeps its env id (a bare
      // allSettled reject drops it), letting us mark that env's status as a
      // distinct "fetch-error" instead of an ambiguous grey "never deployed" dot.
      const results = await Promise.all(
        environments.map(async (env) => {
          try {
            const res = await api.deploy.getDeployments(env.card_id);
            const deploys = Array.isArray(res) ? res : res?.deployments || [];
            return { envId: env.id, deploy: deploys[0], fetchError: false };
          } catch {
            return { envId: env.id, deploy: undefined, fetchError: true };
          }
        }),
      );
      if (cancelled) return;
      const statuses: Record<string, { status: string; url?: string }> = {};
      for (const r of results) {
        if (r.deploy) {
          statuses[r.envId] = { status: r.deploy.status, url: r.deploy.deployed_url };
        } else if (r.fetchError) {
          statuses[r.envId] = { status: 'fetch-error' };
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
    setConfirmDeleteEnvId(null); // a freshly-opened menu starts unarmed
    setContextMenu({ envId, x: e.clientX, y: e.clientY });
  }, []);

  // EI5 — two-step delete: first click arms (no close), second click deletes.
  // The env staying visible on a rejected delete is itself the failure signal;
  // a dedicated error toast can follow once the app has a notification surface.
  const handleDelete = useCallback(
    (envId: string) => {
      if (confirmDeleteEnvId === envId) {
        setContextMenu(null);
        setConfirmDeleteEnvId(null);
        dispatch(deleteEnvironment({ envId, projectId }));
      } else {
        setConfirmDeleteEnvId(envId);
      }
    },
    [confirmDeleteEnvId, projectId, dispatch],
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

  // Close context menu on click outside (also disarms a pending delete confirm)
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => {
      setContextMenu(null);
      setConfirmDeleteEnvId(null);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // EI6 — only fully hide the bar when there are genuinely no environments AND
  // no load failure. A transient fetch error keeps the bar present with a retry
  // (so the Deploy button and tabs don't silently vanish on a flaky network).
  if (environments.length === 0 && !loading && !fetchError) return null;

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
        ) : fetchError && environments.length === 0 ? (
          <div className="flex items-center gap-2 text-ice-xs text-red-400">
            <span>{t('environments.tabBar.loadError')}</span>
            <button
              onClick={() => dispatch(fetchEnvironments(projectId))}
              className="px-2 py-0.5 rounded border border-ice-border text-ice-text-2 hover:bg-ice-hover transition-colors"
            >
              {t('environments.tabBar.retry')}
            </button>
          </div>
        ) : (
          <>
            {/* Environment tabs */}
            {environments.map((env) => (
              <EnvironmentTabItem
                key={env.id}
                env={env}
                isActive={env.id === activeEnvId}
                deployStatus={envDeployStatus[env.id]}
                onSwitch={handleSwitchEnv}
                onContextMenu={handleContextMenu}
              />
            ))}

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
      {contextMenu && (
        <EnvironmentContextMenu
          envId={contextMenu.envId}
          x={contextMenu.x}
          y={contextMenu.y}
          environments={environments}
          prodEnv={prodEnv}
          confirmingDelete={confirmDeleteEnvId === contextMenu.envId}
          onDeploy={(env) => {
            setContextMenu(null);
            handleSwitchEnv(env);
            dispatch(openDeployPanel());
          }}
          onPromote={handlePromote}
          onRename={(env) => setRenameTarget(env)}
          onDelete={handleDelete}
          onClose={() => {
            setContextMenu(null);
            setConfirmDeleteEnvId(null);
          }}
        />
      )}

      {/* Create environment modal */}
      {showCreate && <CreateEnvironmentModal projectId={projectId} onClose={() => setShowCreate(false)} />}

      {/* Rename environment modal */}
      {renameTarget && (
        <RenameEnvironmentModal env={renameTarget} projectId={projectId} onClose={() => setRenameTarget(null)} />
      )}
    </>
  );
};
