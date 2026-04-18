/**
 * Inline Table View — pure helper functions
 *
 * Status derivation, endpoint URL builders, type-aware settings chips,
 * family color lookup, relative-time formatter. No React, no Redux —
 * everything here is data-in/data-out so the table component can stay
 * focused on layout and interaction.
 */

import { getConceptFamily, type VisualFamily } from '@ice/blocks';
import { BLOCK_ACCENT_COLORS } from '../../config/color-palette';
import type { CardNode } from '../../store/slices/cards-slice';
import type { DeployedResource, NodeDriftInfo } from '../../store/slices/deploy-slice';
import type { NodePipelineStatus } from '../../store/slices/pipeline-slice';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Status pill values. `live`/`failed`/`building`/`deploying`/`queued`/`idle`
 * mirror the canvas pipeline statuses (state.pipeline.nodeStatus) one-to-one,
 * so a block reads the same in both views. `drifted` overlays on `live` when
 * deploy-time drift detection sees a divergence.
 */
export type RowStatus = 'idle' | 'queued' | 'building' | 'deploying' | 'live' | 'failed' | 'drifted';

export type EndpointKind = 'live' | 'domain' | 'repo' | 'image' | 'console';

export interface Endpoint {
  kind: EndpointKind;
  url: string;
  label: string;
}

export interface SettingChip {
  key: string;
  value: string;
}

// ─── Family color ───────────────────────────────────────────────────────────

const FAMILY_COLORS: Record<VisualFamily, string> = {
  frontend: '#3b82f6',
  compute: '#8b5cf6',
  data: '#10b981',
  messaging: '#6366f1',
  edge: '#f59e0b',
  ai: '#ec4899',
  'canvas-only': '#64748b',
};

const DEFAULT_COLOR = '#64748b';

const CATEGORY_FAMILY_FALLBACK: Record<string, VisualFamily> = {
  Compute: 'compute',
  Frontend: 'frontend',
  Database: 'data',
  Data: 'data',
  Storage: 'data',
  Cache: 'data',
  Analytics: 'data',
  Messaging: 'messaging',
  Queue: 'messaging',
  Networking: 'edge',
  Network: 'edge',
  CDN: 'edge',
  Gateway: 'edge',
  AI: 'ai',
  ML: 'ai',
};

export function getFamilyColor(iceType: string | undefined): string {
  if (!iceType) return DEFAULT_COLOR;

  const family = getConceptFamily(iceType);
  if (family) return FAMILY_COLORS[family];

  // Fall back via the block accent map (suffix), e.g. Compute.StaticSite → StaticSite
  const suffix = iceType.split('.').pop() || '';
  if (BLOCK_ACCENT_COLORS[suffix]) return BLOCK_ACCENT_COLORS[suffix];

  // Fall back via category prefix → family
  const prefix = iceType.split('.')[0] || '';
  const fallbackFamily = CATEGORY_FAMILY_FALLBACK[prefix];
  if (fallbackFamily) return FAMILY_COLORS[fallbackFamily];

  return DEFAULT_COLOR;
}

// ─── Status derivation ──────────────────────────────────────────────────────

export interface StatusContext {
  /** state.pipeline.nodeStatus — same source the canvas reads. */
  nodePipelineStatus: Record<string, NodePipelineStatus>;
  /** Drift overlays on live: divergence between desired and actual. */
  driftByNode: Record<string, NodeDriftInfo>;
  /** Last-known deploy snapshot — only used to surface failures the pipeline didn't capture. */
  deployedResources: DeployedResource[];
}

export function deriveStatus(node: CardNode, ctx: StatusContext): RowStatus {
  const id = node.id;
  const drift = ctx.driftByNode[id];
  const isDrifted =
    !!drift && (drift.status === 'drifted' || drift.status === 'missing' || drift.status === 'extra');

  // Primary source: `node.data.deploy_status` — what the canvas reads to draw
  // the LIVE/DEPLOY/ERR badge (compact-lod3.tsx). Same source ⇒ same answer.
  const deployStatus = ((node.data?.deploy_status as string) || '').toLowerCase();
  if (deployStatus === 'active') return isDrifted ? 'drifted' : 'live';
  if (deployStatus === 'deploying') return 'deploying';
  if (deployStatus === 'error') return 'failed';

  // Secondary: pipeline.nodeStatus — used by the canvas pipeline badges
  // (CI/CD-driven status, not the per-block deploy overlay).
  const pipeline = ctx.nodePipelineStatus[id];
  if (pipeline) {
    switch (pipeline.status) {
      case 'success':
        return isDrifted ? 'drifted' : 'live';
      case 'failed':
        return 'failed';
      case 'building':
        return 'building';
      case 'deploying':
        return 'deploying';
      case 'queued':
        return 'queued';
      case 'idle':
        break;
    }
  }

  // Tertiary: the last deploy snapshot — only useful if neither of the above
  // is set (e.g., page reloaded before pipeline state hydrated).
  const deployed = ctx.deployedResources.find((r) => r.node_id === id);
  if (deployed) {
    const s = (deployed.status || '').toLowerCase();
    if (s === 'failed' || s === 'error') return 'failed';
    if (s === 'success' || s === 'created' || s === 'updated' || s === 'deployed') {
      return isDrifted ? 'drifted' : 'live';
    }
  }

  return 'idle';
}

export const STATUS_COLORS: Record<RowStatus, { dot: string; bg: string; text: string; border: string }> = {
  live: { dot: '#22c55e', bg: 'rgba(34,197,94,0.10)', text: '#86efac', border: 'rgba(34,197,94,0.30)' },
  building: { dot: '#3b82f6', bg: 'rgba(59,130,246,0.10)', text: '#93c5fd', border: 'rgba(59,130,246,0.30)' },
  deploying: { dot: '#3b82f6', bg: 'rgba(59,130,246,0.10)', text: '#93c5fd', border: 'rgba(59,130,246,0.30)' },
  queued: { dot: '#f59e0b', bg: 'rgba(245,158,11,0.10)', text: '#fcd34d', border: 'rgba(245,158,11,0.30)' },
  drifted: { dot: '#f59e0b', bg: 'rgba(245,158,11,0.10)', text: '#fcd34d', border: 'rgba(245,158,11,0.30)' },
  failed: { dot: '#ef4444', bg: 'rgba(239,68,68,0.10)', text: '#fca5a5', border: 'rgba(239,68,68,0.30)' },
  idle: { dot: '#64748b', bg: 'rgba(100,116,139,0.10)', text: '#94a3b8', border: 'rgba(100,116,139,0.25)' },
};

// ─── Endpoints ──────────────────────────────────────────────────────────────

const PROVIDER_CONSOLE_BASE: Record<string, string> = {
  aws: 'https://console.aws.amazon.com/',
  gcp: 'https://console.cloud.google.com/',
  azure: 'https://portal.azure.com/',
  alibaba: 'https://home.console.aliyun.com/',
  digitalocean: 'https://cloud.digitalocean.com/',
  oci: 'https://cloud.oracle.com/',
  cloudflare: 'https://dash.cloudflare.com/',
};

function buildConsoleUrl(provider: string, iceType: string, region?: string, providerId?: string): string | null {
  const base = PROVIDER_CONSOLE_BASE[provider.toLowerCase()];
  if (!base) return null;

  // Best-effort deep links for the most common combinations.
  if (provider === 'gcp') {
    if (iceType.startsWith('Compute.Container') || iceType === 'Compute.ScalableBackend') {
      const r = region || 'us-central1';
      return `https://console.cloud.google.com/run?region=${r}`;
    }
    if (iceType.startsWith('Database.')) return 'https://console.cloud.google.com/sql/instances';
    if (iceType.startsWith('Storage.')) return 'https://console.cloud.google.com/storage/browser';
    if (iceType === 'Compute.StaticSite') return 'https://console.firebase.google.com/project/_/hosting';
  }
  if (provider === 'aws') {
    const r = region || 'us-east-1';
    if (iceType.startsWith('Compute.Container')) return `https://${r}.console.aws.amazon.com/ecs/home?region=${r}`;
    if (iceType.startsWith('Database.')) return `https://${r}.console.aws.amazon.com/rds/home?region=${r}`;
    if (iceType.startsWith('Storage.')) return `https://s3.console.aws.amazon.com/s3/buckets`;
    if (iceType === 'Compute.StaticSite') return `https://s3.console.aws.amazon.com/s3/buckets`;
  }
  if (provider === 'azure') {
    return `https://portal.azure.com/#home`;
  }

  return base;
}

function buildRepoUrl(repository: string, branch?: string): string {
  const repo = repository.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  if (branch) return `https://github.com/${repo}/tree/${branch}`;
  return `https://github.com/${repo}`;
}

function buildImageUrl(image: string): string | null {
  // Best-effort: link well-known registries to their browse UI. Otherwise null
  // so the caller can fall back to copy-only.
  if (image.startsWith('gcr.io/') || image.startsWith('us.gcr.io/') || image.includes('-docker.pkg.dev/')) {
    const project = image.split('/')[1];
    if (project) return `https://console.cloud.google.com/artifacts?project=${project}`;
  }
  if (image.includes('.dkr.ecr.')) {
    const region = image.match(/\.dkr\.ecr\.([^.]+)\.amazonaws\.com/)?.[1] || 'us-east-1';
    return `https://${region}.console.aws.amazon.com/ecr/repositories`;
  }
  if (image.startsWith('docker.io/') || /^[a-z0-9_-]+\/[a-z0-9_-]+(:|$)/i.test(image)) {
    const path = image.replace(/^docker\.io\//, '').split(':')[0];
    return `https://hub.docker.com/r/${path}`;
  }
  return null;
}

export function buildEndpoints(node: CardNode, deployed?: DeployedResource): Endpoint[] {
  const out: Endpoint[] = [];
  const data = node.data || {};
  const provider = (data.provider as string) || '';
  const iceType = (data.iceType as string) || (node.type as string) || '';
  const deployOutputs = (data.deploy_outputs as Record<string, unknown> | undefined) || {};

  // Prefer the same outputs the canvas surfaces (custom_domain_url / default_url).
  const customDomainUrl = (deployOutputs.custom_domain_url as string) || '';
  const defaultUrl = (deployOutputs.default_url as string) || '';
  const liveUrl =
    (data.url as string) ||
    customDomainUrl ||
    defaultUrl ||
    (deployOutputs.url as string) ||
    (deployOutputs.endpoint as string) ||
    (deployed?.outputs?.url as string) ||
    (deployed?.outputs?.endpoint as string);
  if (liveUrl) out.push({ kind: 'live', url: String(liveUrl), label: String(liveUrl) });

  // Surface the secondary URL too (firebase site URL alongside the custom domain).
  if (customDomainUrl && defaultUrl && customDomainUrl !== defaultUrl && defaultUrl !== liveUrl) {
    out.push({ kind: 'live', url: defaultUrl, label: defaultUrl });
  }

  const domain = data.domain as string;
  if (domain && (!liveUrl || !String(liveUrl).includes(domain))) {
    out.push({ kind: 'domain', url: `https://${domain}`, label: domain });
  }

  const repository = data.repository as string;
  if (repository) {
    const branch = (data.branch as string) || undefined;
    out.push({
      kind: 'repo',
      url: buildRepoUrl(repository, branch),
      label: branch ? `${repository} @ ${branch}` : repository,
    });
  }

  const image = (data.deployed_image as string) || (data.image as string);
  if (image) {
    const url = buildImageUrl(image);
    if (url) out.push({ kind: 'image', url, label: image });
  }

  const providerId = (data.provider_id as string) || deployed?.provider_id;
  if (provider && (providerId || deployed)) {
    const consoleUrl = buildConsoleUrl(provider, iceType, data.region as string, providerId);
    if (consoleUrl) out.push({ kind: 'console', url: consoleUrl, label: `${provider.toUpperCase()} console` });
  }

  return out;
}

// ─── Type-aware settings chips ──────────────────────────────────────────────

function toStr(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v);
}

export function getSettingsChips(node: CardNode): SettingChip[] {
  const data = node.data || {};
  const iceType = (data.iceType as string) || '';
  const chips: SettingChip[] = [];

  const push = (key: string, value: unknown) => {
    const v = toStr(value);
    if (v) chips.push({ key, value: v });
  };

  // Type-specific salient fields first
  if (iceType === 'Compute.StaticSite') {
    push('framework', data.framework);
    push('build', data.buildCommand);
    push('output', data.outputDir);
    push('domain', data.domain);
  } else if (iceType.startsWith('Compute.Container') || iceType === 'Compute.ScalableBackend') {
    if (data.minInstances != null && data.maxInstances != null) {
      push('instances', `${data.minInstances}–${data.maxInstances}`);
    } else if (data.min_instances != null && data.max_instances != null) {
      push('instances', `${data.min_instances}–${data.max_instances}`);
    }
    push('image', data.deployed_image || data.image);
    push('port', data.port);
    push('runtime', data.runtime);
  } else if (iceType.startsWith('Database.')) {
    push('engine', data.engine || data.version);
    push('size', data.instanceClass || data.tier);
    push('storage', data.storage);
    if (data.multiAz || data.highAvailability) push('HA', 'multi-az');
  } else if (iceType.startsWith('Storage.')) {
    push('class', data.storageClass);
    push('lifecycle', data.lifecycleDays ? `${data.lifecycleDays}d` : null);
    push('versioning', data.versioning ? 'on' : null);
  } else if (iceType === 'Source.GitHubRepo') {
    if (data.repository) {
      const branch = (data.branch as string) || 'main';
      push('source', `${data.repository} @ ${branch}`);
    }
  } else if (iceType === 'Networking.CustomDomain' || iceType === 'Edge.CustomDomain') {
    push('domain', data.domain);
    push('cert', data.certStatus);
  }

  // Generic fields (only if not already covered)
  push('region', data.region);
  if (data.behavior && data.behavior !== 'singleton') push('behavior', data.behavior);

  return chips;
}

// ─── Relative time ──────────────────────────────────────────────────────────

export function formatRelativeTime(ts: string | number | undefined | null): string {
  if (!ts) return '—';
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

// ─── Provider display ───────────────────────────────────────────────────────

export const PROVIDER_LABELS: Record<string, string> = {
  aws: 'AWS',
  gcp: 'GCP',
  azure: 'Azure',
  alibaba: 'Alibaba',
  digitalocean: 'DO',
  oci: 'Oracle',
  cloudflare: 'Cloudflare',
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider.toLowerCase()] || provider.toUpperCase();
}
