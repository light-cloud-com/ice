/**
 * Project Deployments Page — deployment history for the active environment
 *
 * Two sections:
 * 1. Infrastructure Deployments — IaC plan/apply/destroy operations
 * 2. Service Deployments — CI/CD pipeline builds and deploys
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Rocket,
  GitBranch,
  Server,
  ChevronDown,
} from 'lucide-react';
import type { RootState, AppDispatch } from '../../store';
import { selectActiveCard } from '../../store/slices/cards-slice';
import {
  fetchRulesForNode,
  fetchEventsForNode,
  type DeploymentEvent,
  type DeployStep,
} from '../../store/slices/pipeline-slice';
import axiosInstance from '../../shared/api/axios-instance';
import { cn } from '../../shared/utils/cn';

// ─── Types ───────────────────────────────────────────────────────────────────

interface InfraDeployment {
  id: string;
  status: string;
  provider: string;
  region: string;
  environment: string;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

type DeployTab = 'infra' | 'service';

// ─── Component ───────────────────────────────────────────────────────────────

export const ProjectDeployments: React.FC<{ projectId: string }> = ({ projectId }) => {
  const dispatch = useDispatch<AppDispatch>();
  const activeCard = useSelector(selectActiveCard);
  const activeEnvId = useSelector((s: RootState) => s.environments.activeEnvId[projectId]);
  const environments = useSelector((s: RootState) => s.environments.byProject[projectId] || []);
  const activeEnv = environments.find((e) => e.id === activeEnvId);

  const [tab, setTab] = useState<DeployTab>('infra');
  const [infraDeploys, setInfraDeploys] = useState<InfraDeployment[]>([]);
  const [infraLoading, setInfraLoading] = useState(true);
  const [serviceLoading, setServiceLoading] = useState(true);

  // ── Infrastructure deploys ──
  useEffect(() => {
    const cardId = activeCard?.id;
    if (!cardId) { setInfraLoading(false); return; }

    setInfraLoading(true);
    axiosInstance.get(`/canvas/deploy/history/${cardId}`)
      .then((res) => setInfraDeploys(Array.isArray(res.data) ? res.data : []))
      .catch(() => setInfraDeploys([]))
      .finally(() => setInfraLoading(false));
  }, [activeCard?.id]);

  // ── Service deploys: find all service nodes on the card, fetch their events ──
  const serviceNodes = useMemo(() => {
    if (!activeCard) return [];
    return (activeCard.nodes || []).filter((n: any) => {
      const iceType = (n.data?.iceType as string) || '';
      return n.type === 'resource' &&
        !iceType.startsWith('Source.') &&
        !iceType.startsWith('Config.') &&
        !iceType.startsWith('Networking.');
    }).map((n: any) => ({
      id: n.id,
      label: (n.data?.label as string) || n.id.slice(0, 8),
    }));
  }, [activeCard]);

  useEffect(() => {
    if (!activeCard || serviceNodes.length === 0) {
      setServiceLoading(false);
      return;
    }
    setServiceLoading(true);
    const promises = serviceNodes.map((svc) =>
      dispatch(fetchEventsForNode({ cardId: activeCard.id, nodeId: svc.id }))
    );
    Promise.all(promises).finally(() => setServiceLoading(false));
  }, [activeCard?.id, serviceNodes.length]);

  // Collect all service events from Redux
  const serviceEvents = useSelector((s: RootState) => {
    if (!activeCard) return [];
    const result: Array<DeploymentEvent & { _serviceName: string }> = [];
    for (const svc of serviceNodes) {
      const key = `${activeCard.id}:${svc.id}`;
      const events = s.pipeline.history[key] || [];
      for (const ev of events) {
        result.push({ ...ev, _serviceName: svc.label });
      }
    }
    return result.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  });

  const infraCount = infraDeploys.length;
  const serviceCount = serviceEvents.length;
  const isLoading = tab === 'infra' ? infraLoading : serviceLoading;

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-ice-text-1">Deployments</h1>
        {activeEnv && (
          <span className="text-sm text-ice-text-3">
            Environment: <span className="text-ice-text-2 font-medium">{activeEnv.name}</span>
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4 border-b border-ice-border">
        <TabButton
          active={tab === 'infra'}
          icon={Server}
          label="Infrastructure"
          count={infraCount}
          onClick={() => setTab('infra')}
        />
        <TabButton
          active={tab === 'service'}
          icon={GitBranch}
          label="Service (CI/CD)"
          count={serviceCount}
          onClick={() => setTab('service')}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-5 h-5 animate-spin text-ice-text-3" />
        </div>
      ) : tab === 'infra' ? (
        <InfraDeploymentList deployments={infraDeploys} />
      ) : (
        <ServiceDeploymentList events={serviceEvents} />
      )}
    </div>
  );
};

// ─── Tab Button ──────────────────────────────────────────────────────────────

const TabButton: React.FC<{
  active: boolean;
  icon: React.ElementType;
  label: string;
  count: number;
  onClick: () => void;
}> = ({ active, icon: Icon, label, count, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
      active
        ? 'border-emerald-500 text-ice-text-1'
        : 'border-transparent text-ice-text-3 hover:text-ice-text-2',
    )}
  >
    <Icon className="w-3.5 h-3.5" />
    {label}
    {count > 0 && (
      <span className={cn(
        'text-xs px-1.5 py-0.5 rounded-full',
        active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-ice-hover text-ice-text-3',
      )}>
        {count}
      </span>
    )}
  </button>
);

// ─── Infrastructure Deployment List ──────────────────────────────────────────

const InfraDeploymentList: React.FC<{ deployments: InfraDeployment[] }> = ({ deployments }) => {
  const statusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'deploying': return <Rocket className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'planning': return <Clock className="w-4 h-4 text-amber-500 animate-pulse" />;
      case 'cancelled': return <XCircle className="w-4 h-4 text-ice-text-3" />;
      default: return <Clock className="w-4 h-4 text-amber-500" />;
    }
  };

  if (deployments.length === 0) {
    return (
      <div className="text-center py-16">
        <Server className="w-8 h-8 text-ice-text-3 mx-auto mb-3" />
        <p className="text-ice-text-3 text-sm">No infrastructure deployments yet</p>
        <p className="text-ice-text-3 text-xs mt-1">Use the "Deploy Infra" button to plan and apply changes</p>
      </div>
    );
  }

  return (
    <div className="border border-ice-border rounded-lg overflow-hidden divide-y divide-ice-border">
      {deployments.map((d) => (
        <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-ice-hover transition-colors">
          {statusIcon(d.status)}
          <div className="flex-1 min-w-0">
            <span className="text-sm text-ice-text-1 font-medium capitalize">{d.status}</span>
            <span className="text-xs text-ice-text-3 ml-2">
              {d.provider} · {d.region} · {d.environment}
            </span>
            {d.error && (
              <p className="text-xs text-red-400 mt-0.5 truncate">{d.error}</p>
            )}
          </div>
          <span className="text-xs text-ice-text-3 shrink-0">
            {new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
          {d.duration_ms != null && d.duration_ms > 0 && (
            <span className="text-xs text-ice-text-3 tabular-nums shrink-0">{(d.duration_ms / 1000).toFixed(1)}s</span>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Service (CI/CD) Deployment List ─────────────────────────────────────────

const ServiceDeploymentList: React.FC<{
  events: Array<DeploymentEvent & { _serviceName: string }>;
}> = ({ events }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <GitBranch className="w-8 h-8 text-ice-text-3 mx-auto mb-3" />
        <p className="text-ice-text-3 text-sm">No service deployments yet</p>
        <p className="text-ice-text-3 text-xs mt-1">Connect a GitHub repo to a service and push to trigger a deploy</p>
      </div>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'building': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'deploying': return <Rocket className="w-4 h-4 text-purple-500 animate-pulse" />;
      case 'cancelled': return <XCircle className="w-4 h-4 text-ice-text-3" />;
      default: return <Clock className="w-4 h-4 text-amber-500" />;
    }
  };

  return (
    <div className="border border-ice-border rounded-lg overflow-hidden divide-y divide-ice-border">
      {events.map((ev) => {
        const isExpanded = expandedId === ev.id;
        const logs = (ev.deployment_logs || []) as DeployStep[];

        return (
          <div key={ev.id}>
            <div
              className="flex items-center gap-3 px-4 py-3 hover:bg-ice-hover transition-colors cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : ev.id)}
            >
              {statusIcon(ev.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ice-text-1 font-medium">{ev._serviceName}</span>
                  <span className="text-xs font-mono text-ice-text-2">{ev.commit_sha?.slice(0, 7)}</span>
                  <span className="text-xs text-ice-text-3 truncate">{ev.commit_message}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-ice-text-3">{ev.rule?.environment || ev.branch}</span>
                  <span className="text-xs text-ice-text-3">{ev.branch}</span>
                  {ev.commit_author && (
                    <span className="text-xs text-ice-text-3">by {ev.commit_author}</span>
                  )}
                </div>
                {ev.error && !isExpanded && (
                  <p className="text-xs text-red-400 mt-0.5 truncate">{ev.error}</p>
                )}
              </div>
              <span className="text-xs text-ice-text-3 shrink-0">
                {new Date(ev.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              {ev.duration_seconds != null && ev.duration_seconds > 0 && (
                <span className="text-xs text-ice-text-3 tabular-nums shrink-0">
                  {ev.duration_seconds < 60 ? `${ev.duration_seconds}s` : `${Math.floor(ev.duration_seconds / 60)}m ${ev.duration_seconds % 60}s`}
                </span>
              )}
              <ChevronDown className={cn(
                'w-4 h-4 text-ice-text-3 transition-transform shrink-0',
                isExpanded && 'rotate-180',
              )} />
            </div>

            {/* Expanded log viewer */}
            {isExpanded && (
              <div className="border-t border-ice-border bg-slate-950 px-4 py-3 space-y-1 max-h-48 overflow-y-auto">
                {logs.length > 0 ? logs.map((log, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono">
                    <span className={cn('shrink-0',
                      log.status === 'completed' ? 'text-emerald-500' :
                      log.status === 'failed' ? 'text-red-400' :
                      'text-blue-400',
                    )}>
                      {log.status === 'completed' ? '\u2713' : log.status === 'failed' ? '\u2717' : '\u25CF'}
                    </span>
                    <span className={log.status === 'failed' ? 'text-red-400' : 'text-slate-300'}>
                      {log.message}
                    </span>
                    {log.duration_ms != null && (
                      <span className="ml-auto text-slate-500">{(log.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                )) : (
                  <div className="text-xs font-mono text-slate-500">No log steps recorded</div>
                )}
                {ev.error && (
                  <div className="text-xs font-mono text-red-400 pt-2 border-t border-slate-800">{ev.error}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
