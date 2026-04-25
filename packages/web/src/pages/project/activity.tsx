/**
 * Project Activity Page — unified activity feed / audit log
 *
 * Merges three event sources into a single timeline:
 * 1. AI audit log entries (AI-assisted canvas changes)
 * 2. Infrastructure deployments (IaC plan/apply/destroy)
 * 3. Service (CI/CD) pipeline events
 */

import { useTranslation } from '@ui/i18n';
import axiosInstance from '@ui/shared/api/axios-instance';
import { cn } from '@ui/shared/utils/cn';
import { selectActiveCard } from '@ui/store/slices/cards-slice';
import { fetchEventsForNode, type DeploymentEvent } from '@ui/store/slices/pipeline-slice';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Rocket,
  Server,
  GitBranch,
  Sparkles,
  Activity,
  ChevronDown,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '@ui/store';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  timestamp: string;
  intent: string;
}

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

type ActivityType = 'all' | 'ai' | 'infra' | 'service';

interface ActivityItem {
  id: string;
  type: 'ai' | 'infra' | 'service';
  timestamp: Date;
  title: string;
  description: string;
  status: 'success' | 'failed' | 'pending' | 'in_progress';
  metadata?: Record<string, string>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now'; // formatRelativeTime is a utility, not UI chrome
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function infraStatusToActivity(status: string): ActivityItem['status'] {
  switch (status) {
    case 'success':
      return 'success';
    case 'failed':
      return 'failed';
    case 'deploying':
    case 'planning':
      return 'in_progress';
    default:
      return 'pending';
  }
}

function serviceStatusToActivity(status: string): ActivityItem['status'] {
  switch (status) {
    case 'success':
      return 'success';
    case 'failed':
      return 'failed';
    case 'building':
    case 'deploying':
      return 'in_progress';
    default:
      return 'pending';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ProjectActivity: React.FC<{ projectId: string }> = ({ projectId: _projectId }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const activeCard = useSelector(selectActiveCard);

  const [filter, setFilter] = useState<ActivityType>('all');
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [infraDeploys, setInfraDeploys] = useState<InfraDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch AI audit entries
  useEffect(() => {
    axiosInstance
      .get('/ai/audit/list')
      .then((res) => setAuditEntries(res.data?.entries || []))
      .catch(() => setAuditEntries([]));
  }, []);

  // Fetch infrastructure deployments
  useEffect(() => {
    const cardId = activeCard?.id;
    if (!cardId) return;

    axiosInstance
      .get(`/canvas/deploy/history/${cardId}`)
      .then((res) => setInfraDeploys(Array.isArray(res.data) ? res.data : []))
      .catch(() => setInfraDeploys([]));
  }, [activeCard?.id]);

  // Fetch service deployment events
  const serviceNodes = useMemo(() => {
    if (!activeCard) return [];
    return (activeCard.nodes || [])
      .filter((n: any) => {
        const iceType = (n.data?.iceType as string) || '';
        return (
          n.type === 'resource' &&
          !iceType.startsWith('Source.') &&
          !iceType.startsWith('Config.') &&
          !iceType.startsWith('Networking.')
        );
      })
      .map((n: any) => ({
        id: n.id,
        label: (n.data?.label as string) || n.id.slice(0, 8),
      }));
  }, [activeCard]);

  useEffect(() => {
    if (!activeCard || serviceNodes.length === 0) return;
    const promises = serviceNodes.map((svc) => dispatch(fetchEventsForNode({ cardId: activeCard.id, nodeId: svc.id })));
    Promise.all(promises);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable refs for activeCard/serviceNodes
  }, [activeCard?.id, dispatch]);

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
    return result;
  });

  // Merge all sources into unified activity items
  const activityItems = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    for (const entry of auditEntries) {
      items.push({
        id: `ai-${entry.id}`,
        type: 'ai',
        timestamp: new Date(entry.timestamp),
        title: t('project.activity.aiCanvasChange'),
        description: entry.intent,
        status: 'success',
      });
    }

    for (const d of infraDeploys) {
      items.push({
        id: `infra-${d.id}`,
        type: 'infra',
        timestamp: new Date(d.created_at),
        title: t('project.activity.infrastructure', { status: d.status }),
        description: `${d.provider.toUpperCase()} · ${d.region} · ${d.environment}`,
        status: infraStatusToActivity(d.status),
        metadata: {
          ...(d.error ? { error: d.error } : {}),
          ...(d.duration_ms ? { duration: `${(d.duration_ms / 1000).toFixed(1)}s` } : {}),
        },
      });
    }

    for (const ev of serviceEvents) {
      items.push({
        id: `svc-${ev.id}`,
        type: 'service',
        timestamp: new Date(ev.started_at),
        title: t('project.activity.serviceDeploy', { name: ev._serviceName }),
        description: ev.commit_message || ev.branch || '',
        status: serviceStatusToActivity(ev.status),
        metadata: {
          ...(ev.commit_sha ? { commit: ev.commit_sha.slice(0, 7) } : {}),
          ...(ev.commit_author ? { author: ev.commit_author } : {}),
          ...(ev.branch ? { branch: ev.branch } : {}),
          ...(ev.error ? { error: ev.error } : {}),
        },
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items;
  }, [auditEntries, infraDeploys, serviceEvents, t]);

  // Apply filter
  const filteredItems = filter === 'all' ? activityItems : activityItems.filter((i) => i.type === filter);

  // Mark loading done after all fetches
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, [auditEntries, infraDeploys, serviceEvents]);

  const counts = useMemo(
    () => ({
      all: activityItems.length,
      ai: activityItems.filter((i) => i.type === 'ai').length,
      infra: activityItems.filter((i) => i.type === 'infra').length,
      service: activityItems.filter((i) => i.type === 'service').length,
    }),
    [activityItems],
  );

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-ice-text-2" />
          <h1 className="text-xl font-semibold text-ice-text-1">{t('project.activity.title')}</h1>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-ice-border">
        <FilterTab
          active={filter === 'all'}
          label={t('project.activity.filterAll')}
          count={counts.all}
          onClick={() => setFilter('all')}
        />
        <FilterTab
          active={filter === 'ai'}
          icon={Sparkles}
          label={t('project.activity.filterAi')}
          count={counts.ai}
          onClick={() => setFilter('ai')}
        />
        <FilterTab
          active={filter === 'infra'}
          icon={Server}
          label={t('project.activity.filterInfra')}
          count={counts.infra}
          onClick={() => setFilter('infra')}
        />
        <FilterTab
          active={filter === 'service'}
          icon={GitBranch}
          label={t('project.activity.filterService')}
          count={counts.service}
          onClick={() => setFilter('service')}
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-5 h-5 animate-spin text-ice-text-3" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-8 h-8 text-ice-text-3 mx-auto mb-3" />
          <p className="text-ice-text-3 text-sm">{t('project.activity.emptyTitle')}</p>
          <p className="text-ice-text-3 text-xs mt-1">{t('project.activity.emptyDescription')}</p>
        </div>
      ) : (
        <ActivityTimeline
          items={filteredItems}
          expandedId={expandedId}
          onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
        />
      )}
    </div>
  );
};

// ─── Filter Tab ──────────────────────────────────────────────────────────────

const FilterTab: React.FC<{
  active: boolean;
  icon?: React.ElementType;
  label: string;
  count: number;
  onClick: () => void;
}> = ({ active, icon: Icon, label, count, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
      active ? 'border-emerald-500 text-ice-text-1' : 'border-transparent text-ice-text-3 hover:text-ice-text-2',
    )}
  >
    {Icon && <Icon className="w-3.5 h-3.5" />}
    {label}
    {count > 0 && (
      <span
        className={cn(
          'text-xs px-1.5 py-0.5 rounded-full',
          active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-ice-hover text-ice-text-3',
        )}
      >
        {count}
      </span>
    )}
  </button>
);

// ─── Activity Timeline ──────────────────────────────────────────────────────

const ActivityTimeline: React.FC<{
  items: ActivityItem[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}> = ({ items, expandedId, onToggle }) => (
  <div className="relative">
    {/* Timeline line */}
    <div className="absolute left-[19px] top-0 bottom-0 w-px bg-ice-border" />

    <div className="space-y-1">
      {items.map((item) => (
        <ActivityTimelineItem
          key={item.id}
          item={item}
          isExpanded={expandedId === item.id}
          onToggle={() => onToggle(item.id)}
        />
      ))}
    </div>
  </div>
);

// ─── Timeline Item ───────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  ai: { icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  infra: { icon: Server, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  service: { icon: GitBranch, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
} as const;

const STATUS_ICON: Record<ActivityItem['status'], React.ReactNode> = {
  success: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  in_progress: <Rocket className="w-3.5 h-3.5 text-blue-500 animate-pulse" />,
  pending: <Clock className="w-3.5 h-3.5 text-amber-500" />,
};

const ActivityTimelineItem: React.FC<{
  item: ActivityItem;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ item, isExpanded, onToggle }) => {
  const config = TYPE_CONFIG[item.type];
  const Icon = config.icon;
  const hasMetadata = item.metadata && Object.keys(item.metadata).length > 0;

  return (
    <div
      className="relative flex gap-3 pl-2 py-2 rounded-lg hover:bg-ice-hover/50 transition-colors cursor-pointer group"
      onClick={hasMetadata ? onToggle : undefined}
    >
      {/* Icon */}
      <div
        className={cn(
          'relative z-10 flex items-center justify-center w-[24px] h-[24px] rounded-full shrink-0',
          config.bg,
        )}
      >
        <Icon className={cn('w-3.5 h-3.5', config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ice-text-1 font-medium">{item.title}</span>
          {STATUS_ICON[item.status]}
        </div>
        <p className="text-xs text-ice-text-3 mt-0.5 truncate">{item.description}</p>

        {/* Expanded metadata */}
        {isExpanded && item.metadata && (
          <div className="mt-2 space-y-1 text-xs">
            {Object.entries(item.metadata).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-ice-text-3 capitalize">{key}:</span>
                <span className={key === 'error' ? 'text-red-400' : 'text-ice-text-2'}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-xs text-ice-text-3 shrink-0 pt-0.5">{formatRelativeTime(item.timestamp)}</span>

      {/* Expand indicator */}
      {hasMetadata && (
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-ice-text-3 shrink-0 mt-0.5 transition-transform opacity-0 group-hover:opacity-100',
            isExpanded && 'rotate-180',
          )}
        />
      )}
    </div>
  );
};
