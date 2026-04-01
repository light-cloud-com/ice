/**
 * Project Environments Page
 *
 * Lists all environments for a project with status, actions, and management.
 */

import {
  Lock,
  Plus,
  GitPullRequest,
  Loader2,
  ArrowUpRight,
  Trash2,
  Rocket,
  ExternalLink,
} from 'lucide-react';
import React, { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { IceSelect } from '@ui/shared/components/ui/ice-select';
import { getApi } from '@ui/shared/api/api-adapter';
import { cn } from '@ui/shared/utils/cn';
import { openDeployPanel } from '@ui/store/slices/deploy-slice';
import {
  fetchEnvironments,
  createEnvironment,
  deleteEnvironment,
  setActiveEnvironment,
  compareEnvironments,
  type Environment,
} from '@ui/store/slices/environments-slice';
import { setActiveCard, importToActiveCard, createCard } from '@ui/store/slices/cards-slice';
import type { RootState, AppDispatch } from '@ui/store';

interface ProjectEnvironmentsProps {
  projectId: string;
}

export const ProjectEnvironments: React.FC<ProjectEnvironmentsProps> = ({ projectId }) => {
  const dispatch = useDispatch<AppDispatch>();
  const environments = useSelector((s: RootState) => s.environments.byProject[projectId] || []);
  const activeEnvId = useSelector((s: RootState) => s.environments.activeEnvId[projectId]);
  const loading = useSelector((s: RootState) => s.environments.loading);
  const prodEnv = environments.find((e) => e.type === 'production');
  const [deployStatus, setDeployStatus] = useState<Record<string, { status: string; url?: string; date?: string }>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('staging');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (projectId) dispatch(fetchEnvironments(projectId));
  }, [projectId, dispatch]);

  // Fetch deploy statuses
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
      const statuses: Record<string, { status: string; url?: string; date?: string }> = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.deploy) {
          statuses[r.value.envId] = {
            status: r.value.deploy.status,
            url: r.value.deploy.deployed_url,
            date: r.value.deploy.created_at,
          };
        }
      }
      setDeployStatus(statuses);
    };
    fetchStatuses();
    return () => { cancelled = true; };
  }, [environments]);

  const handleSwitchEnv = useCallback(
    async (env: Environment) => {
      dispatch(setActiveEnvironment({ projectId, envId: env.id }));
      try {
        const { store } = await import('@ui/store');
        const state = store.getState();
        const existing = state.cards.cards.find((c: any) => c.id === env.card_id);
        if (existing && existing.nodes.length > 0) {
          dispatch(setActiveCard(env.card_id));
          return;
        }
        const api = getApi();
        const cardData = await api.graph.load(env.card_id);
        if (!cardData) return;
        if (!existing) dispatch(createCard({ name: cardData.name || env.name, id: cardData.id, projectId }));
        dispatch(setActiveCard(cardData.id));
        if (cardData.nodes?.length > 0 || cardData.edges?.length > 0) {
          dispatch(importToActiveCard({ nodes: cardData.nodes || [], edges: cardData.edges || [], skipAutoOrganize: true }));
        }
      } catch (err) {
        console.error('Failed to load environment card:', err);
      }
    },
    [projectId, dispatch],
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await dispatch(createEnvironment({ projectId, name: newName.trim(), type: newType })).unwrap();
      setNewName('');
      setShowCreate(false);
    } catch { /* handled by slice */ }
    setCreating(false);
  };

  const statusDot = (envId: string) => {
    const s = deployStatus[envId]?.status;
    if (s === 'success') return 'bg-emerald-500';
    if (s === 'deploying') return 'bg-blue-500 animate-pulse';
    if (s === 'failed') return 'bg-red-500';
    if (s === 'planning' || s === 'queued') return 'bg-amber-500 animate-pulse';
    return 'bg-ice-text-3/30';
  };

  const statusLabel = (envId: string) => {
    const s = deployStatus[envId]?.status;
    if (!s) return 'Not deployed';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  if (loading && environments.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-ice-text-3" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ice-text-1">Environments</h1>
          <p className="text-ice-sm text-ice-text-3 mt-0.5">Manage deployment environments for this project.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-ice-sm font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Environment
        </button>
      </div>

      {/* Create inline form */}
      {showCreate && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-ice-border bg-ice-surface">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Environment name"
            autoFocus
            className="flex-1 px-2.5 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <IceSelect
            value={newType}
            onChange={setNewType}
            size="md"
            allowEmpty={false}
            options={[
              { value: 'staging', label: 'Staging' },
              { value: 'development', label: 'Development' },
              { value: 'pr', label: 'PR Preview' },
            ]}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="px-3 py-1.5 text-ice-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
          <button onClick={() => setShowCreate(false)} className="text-ice-sm text-ice-text-3 hover:text-ice-text-2">
            Cancel
          </button>
        </div>
      )}

      {/* Environment list */}
      <div className="space-y-2">
        {environments.map((env) => {
          const isActive = env.id === activeEnvId;
          const ds = deployStatus[env.id];
          const canPromote = !env.is_protected && prodEnv;

          return (
            <div
              key={env.id}
              className={cn(
                'flex items-center gap-4 px-4 py-3 rounded-lg border transition-colors cursor-pointer',
                isActive ? 'border-blue-500/30 bg-blue-500/5' : 'border-ice-border bg-ice-surface hover:bg-ice-hover',
              )}
              onClick={() => handleSwitchEnv(env)}
            >
              {/* Status dot */}
              <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', statusDot(env.id))} />

              {/* Name and type */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-ice-sm font-medium text-ice-text-1">{env.name}</span>
                  {env.is_protected && <Lock className="w-3 h-3 text-ice-text-3" />}
                  {env.type === 'pr' && env.pr_number && (
                    <span className="flex items-center gap-0.5 text-ice-2xs text-purple-400">
                      <GitPullRequest className="w-3 h-3" />#{env.pr_number}
                    </span>
                  )}
                  <span className="text-ice-2xs px-1.5 py-0.5 rounded bg-ice-hover text-ice-text-3 uppercase tracking-wider">
                    {env.type}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-ice-xs text-ice-text-3">
                  <span>{statusLabel(env.id)}</span>
                  {ds?.url && (
                    <a
                      href={ds.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-0.5 text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      {ds.url.replace(/^https?:\/\//, '').slice(0, 40)}
                    </a>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {canPromote && (
                  <button
                    onClick={() => dispatch(compareEnvironments({ sourceEnvId: env.id, targetEnvId: prodEnv!.id }))}
                    className="p-1.5 rounded text-amber-500 hover:bg-amber-500/10 transition-colors"
                    title="Promote to production"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => {
                    handleSwitchEnv(env);
                    dispatch(openDeployPanel());
                  }}
                  className="p-1.5 rounded text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                  title="Deploy"
                >
                  <Rocket className="w-3.5 h-3.5" />
                </button>
                {!env.is_protected && (
                  <button
                    onClick={() => dispatch(deleteEnvironment({ envId: env.id, projectId }))}
                    className="p-1.5 rounded text-ice-text-3 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {environments.length === 0 && (
          <div className="text-center py-12 text-ice-text-3">
            <p className="text-ice-sm">No environments yet.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-ice-sm text-blue-400 hover:text-blue-300"
            >
              Create your first environment
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
