/**
 * SVG Compact Node — Clean Linear/Figma-style Infrastructure Card
 *
 * Dual-icon card layout:
 * ╭────────────────────────────────────╮
 * │ [⛁]  Order Database           AWS │  category icon + label + provider
 * │ [🐘]  Amazon RDS · PostgreSQL 16  │  brand icon + service + runtime
 * │                                    │
 * │  pg.internal:5432                  │  context metadata (varies by type)
 * │  db.t3.medium · 50 GB             │  context metadata
 * │  ● Active                  ~$45/mo │  status + cost
 * ╰────────────────────────────────────╯
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { getIcon, DEFAULT_ICON, type Provider } from '../../../../assets/icons';
import { useReducedMotion } from '../../../../shared/hooks/use-reduced-motion';
import { getBrandIcon, type BrandIcon } from '../../../../assets/icons/brand-registry';
import { renderCategoryIcon } from '../../../../assets/icons/category-icons';
import { getServiceName } from '../../../../assets/icons/service-names';
import {
  CORNER_RADIUS,
  HEADER_HEIGHT,
  CARD_WIDTH,
  CARD_PX,
  CARD_PY,
  ICON_SIZE,
  ICON_GAP,
  BRAND_ICON_SIZE,
  STATUS_COLORS,
  CATEGORY_STYLE,
} from '../../../../config/canvas-constants';
import { useTranslation } from '../../../../i18n';
import { RepoSelector } from '../../../integrations/components/repo-selector';
import type { CanvasNode } from '../svg-canvas';

export interface NodePipelineStatus {
  status: 'idle' | 'queued' | 'building' | 'deploying' | 'success' | 'failed';
  stage?: string;
  commitSha?: string;
  commitMessage?: string;
  progress?: number;
}

interface SvgCompactNodeProps {
  node: CanvasNode;
  isSelected: boolean;
  childNodes?: CanvasNode[];
  onToggleFold?: (nodeId: string) => void;
  isDragOver?: boolean;
  onNodeHover?: (nodeId: string | null) => void;
  /** When true, render as a block summary card (Level 1 view) */
  isBlockSummary?: boolean;
  /** Inline rename state */
  isRenaming?: boolean;
  onDoubleClickLabel?: () => void;
  onRenameCommit?: (newLabel: string) => void;
  onRenameCancel?: () => void;
  /** Update node data fields (for +/- controls) */
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  /** Pipeline live status for this node */
  pipelineStatus?: NodePipelineStatus;
  /** Callback when the pipeline badge is clicked */
  onPipelineClick?: (nodeId: string) => void;
  /** For Source.Repository blocks: aggregated pipeline statuses of connected services */
  connectedPipelineStatuses?: NodePipelineStatus[];
  /** Level of detail: 3=full, 2=compact, 1=iconic */
  lod?: number;
  /** Current zoom level — used to size LOD cards inversely to zoom */
  zoom?: number;
  /** Connection drag state: indicates if this node is a valid/invalid target during connection drawing */
  connectionDragState?: 'valid-target' | 'invalid-target' | 'source' | null;
}

// ─── Derived Tokens ─────────────────────────────────────────────────────────

const TEXT_X = CARD_PX + ICON_SIZE + ICON_GAP;
const META_LINE_H = 16;
const STATUS_LINE_H = 16;
const PAD_BOTTOM = 10;

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncate(t: string, n: number) {
  return !t ? '' : t.length <= n ? t : t.slice(0, n) + '\u2026';
}

function shortRepo(r: string) {
  if (!r) return '';
  const m = r.match(/(?:github|gitlab)\.com\/(.+?)(?:\.git)?$/);
  return m ? m[1] : r.includes('/') && !r.includes('://') ? r : r;
}

function shortDomain(d: string) {
  if (!d) return '';
  try {
    if (d.includes('://')) return new URL(d).hostname;
  } catch {
    /* */
  }
  return d;
}

// ─── Context-Aware Metadata ────────────────────────────────────────────────

interface ContextResult {
  lines: string[];
  repoLineIndex: number;
}

/**
 * Returns the most relevant metadata lines for a given block type.
 * Different block categories show different information.
 */
/** Placeholder styling prefix — rendered with lower opacity in the SVG */
const PH = '\u00A0'; // non-breaking space prefix to detect placeholders
function ph(text: string): string { return PH + text; }
function isPlaceholder(text: string): boolean { return text.startsWith(PH); }

/** Count items in a list field */
function listCount(val: unknown): number {
  return Array.isArray(val) ? val.length : 0;
}

/**
 * Returns the most relevant context lines per block type.
 * Reads from ACTUAL schema field names (purpose, size, order_matters, etc.)
 * so that property panel edits immediately reflect on the card.
 */
function getContextLines(data: Record<string, unknown>, iceType: string): ContextResult {
  const lines: string[] = [];
  let repoLineIndex = -1;

  // ── Schema field readers (prefer _display companion fields for enriched options) ──
  const purpose = (data.purpose_display as string) || (data.purpose as string) || '';
  const size = (data.size_display as string) || (data.size as string) || '';
  const domain = (data.custom_domain as string) || (data.domain as string) || '';
  const framework = (data.framework_display as string) || (data.framework as string) || '';
  const frequency = (data.frequency_display as string) || (data.frequency as string) || '';
  const production = data.production;
  const orderMatters = data.order_matters;
  const keepData = (data.retention_display as string) || (data.keep_data as string) || (data.retention as string) || '';
  const engine = (data.engine_display as string) || (data.engine as string) || '';
  const lookupField = (data.lookup_field as string) || '';
  const isPublic = data.public;
  const repository = (data.repository as string) || (data.github as string) || (data.repo as string) || '';
  const branch = (data.branch as string) || '';

  // Resource ID tells us what schema this block uses
  const resourceId = (data.resourceId as string) || '';

  switch (resourceId) {
    // ── Frontend ──
    case 'frontend-app':
      lines.push(domain ? truncate(shortDomain(domain), 32) : ph('app.example.com'));
      if (framework) lines.push(framework);
      break;

    case 'ssr-site':
      lines.push(domain ? truncate(shortDomain(domain), 32) : ph('www.example.com'));
      if (framework) lines.push(framework);
      break;

    // ── Compute ──
    case 'backend-api':
    case 'container-service':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'worker':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'serverless-function':
    case 'function-compute':
    case 'oci-functions':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'do-app-platform':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'scheduled-task':
      lines.push(frequency || ph('Every day at midnight'));
      break;

    // ── Database ──
    case 'postgres-db':
    case 'mysql-db':
      if (size) lines.push(size);
      lines.push(production ? 'Production-ready' : ph('Dev mode'));
      break;

    case 'mongodb':
      if (size) lines.push(size);
      lines.push(production ? 'Production-ready' : ph('Dev mode'));
      break;

    case 'redis-cache':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'dynamodb':
      if (size) lines.push(size);
      if (lookupField) lines.push(`key: ${lookupField}`);
      break;

    case 'firestore':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'cosmosdb':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'vector-db':
      if (purpose) lines.push(purpose);
      if (engine) lines.push(engine);
      break;

    case 'data-warehouse':
      if (purpose) lines.push(purpose);
      if (engine) lines.push(engine);
      break;

    case 'search-engine':
      if (purpose) lines.push(purpose);
      if (engine) lines.push(engine);
      break;

    // ── Messaging ──
    case 'message-queue':
      if (purpose) lines.push(purpose);
      lines.push(orderMatters ? 'FIFO (ordered)' : 'Standard');
      break;

    case 'event-bus': {
      if (purpose) lines.push(purpose);
      const subCount = listCount(data.subscribers);
      lines.push(subCount > 0 ? `${subCount} subscribers` : ph('No subscribers'));
      break;
    }

    case 'rabbitmq': {
      if (purpose) lines.push(purpose);
      const qCount = listCount(data.queues);
      if (qCount > 0) lines.push(`${qCount} queues`);
      break;
    }

    case 'cloud-pubsub': {
      if (purpose) lines.push(purpose);
      const listeners = listCount(data.subscribers);
      if (listeners > 0) lines.push(`${listeners} listeners`);
      break;
    }

    case 'service-bus': {
      if (purpose) lines.push(purpose);
      const qs = listCount(data.queues);
      const ts = listCount(data.topics);
      const parts = [];
      if (qs > 0) parts.push(`${qs} queues`);
      if (ts > 0) parts.push(`${ts} topics`);
      if (parts.length) lines.push(parts.join(' \u00B7 '));
      break;
    }

    case 'event-stream':
      if (purpose) lines.push(purpose);
      if (keepData) lines.push(`retain: ${keepData}`);
      break;

    // ── Storage ──
    case 'object-storage':
    case 'oss':
    case 'oci-object-storage':
    case 'do-spaces':
      if (purpose) lines.push(purpose);
      lines.push(isPublic ? 'Public access' : 'Private');
      break;

    case 'file-storage':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    // ── Network ──
    case 'api-gateway': {
      if (purpose) lines.push(purpose);
      const routeCount = listCount(data.routes);
      if (routeCount > 0) lines.push(`${routeCount} routes`);
      break;
    }

    case 'dns-zone': {
      lines.push(domain || ph('example.com'));
      const subCount = listCount(data.subdomains);
      if (subCount > 0) lines.push(`${subCount} subdomains`);
      break;
    }

    case 'public-traffic':
      if (domain) lines.push(truncate(shortDomain(domain), 32));
      break;

    case 'load-balancer':
      if (purpose) lines.push(purpose);
      break;

    case 'cdn':
      if (purpose) lines.push(purpose);
      if (domain) lines.push(truncate(shortDomain(domain), 32));
      break;

    // ── Security ──
    case 'secret-store': {
      if (purpose) lines.push(purpose);
      const secretCount = listCount(data.secrets);
      lines.push(secretCount > 0 ? `${secretCount} secrets` : ph('No secrets yet'));
      break;
    }

    case 'ssl-certificate':
      if (domain) lines.push(domain);
      break;

    case 'service-account':
      if (purpose) lines.push(purpose);
      break;

    // ── AI ──
    case 'llm-gateway':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'ml-model':
      if (purpose) lines.push(purpose);
      if (framework) lines.push(framework);
      break;

    // ── Source ──
    default:
      // Fall back to iceType-based matching for blocks without resourceId
      if (iceType === 'Source.Repository') {
        repoLineIndex = lines.length;
        lines.push(repository ? truncate(shortRepo(repository), 30) : ph('owner/repo'));
        lines.push(branch ? `\u2192 ${branch}` : ph('\u2192 main'));
      } else if (iceType === 'Config.Environment') {
        const varCount = listCount(data.variables);
        lines.push(varCount > 0 ? `${varCount} variables` : ph('No variables'));
      }
      // Other unknown types — show purpose/size if available
      else if (purpose) {
        lines.push(purpose);
        if (size) lines.push(size);
      }
      break;
  }

  return { lines, repoLineIndex };
}

// ─── Exported height calculator (for SvgCanvas / auto-layout sync) ──────────

/** Extra height when user has renamed the block (type subtitle shown) */
const RENAMED_SUBTITLE_H = 14;
/** Height of the scaling row (+/- min/max instances) */
const SCALING_ROW_H = 22;
/** Height of the pipeline status row (⚡ badge + progress) */
const PIPELINE_ROW_H = 18;

export function computeCompactNodeHeight(
  data: Record<string, unknown>,
  _isBlock: boolean,
  hasPipeline = false,
): number {
  const cost = data.estimatedCost || '';
  const status = data.status || '';
  const iceType = (data.iceType as string) || '';

  const hasScaling = data.minInstances != null || data.maxInstances != null;

  // Context-aware metadata lines (replaces old flat metaCount)
  const { lines: contextLines } = getContextLines(data, iceType);
  const hasStatusLine = !!(status || cost);
  const metaGap = contextLines.length > 0 || hasScaling || hasPipeline ? 6 : 0;

  const h =
    CARD_PY +
    HEADER_HEIGHT +         // 36px: dual-icon header (category line + service line)
    metaGap +
    contextLines.length * META_LINE_H +
    (hasScaling ? SCALING_ROW_H : 0) +
    (hasPipeline ? PIPELINE_ROW_H : 0) +
    (hasStatusLine ? STATUS_LINE_H : 0) +
    PAD_BOTTOM;
  return Math.max(h, 56);
}

export function computeCompactNodeWidth(_isBlock: boolean): number {
  return CARD_WIDTH;
}

/** Fixed height for block summary cards at Level 1 */
export const BLOCK_SUMMARY_H = 80;
/** Fixed width for block summary cards at Level 1 */
export const BLOCK_SUMMARY_W = 260;

// ─── Component ──────────────────────────────────────────────────────────────

export const SvgCompactNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  childNodes = [],
  onToggleFold,
  isDragOver = false,
  onNodeHover,
  isBlockSummary = false,
  isRenaming = false,
  onDoubleClickLabel,
  onRenameCommit,
  onRenameCancel,
  onUpdateData,
  pipelineStatus,
  onPipelineClick,
  connectedPipelineStatuses = [],
  lod = 3,
  zoom = 1,
  connectionDragState = null,
}) => {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const { x, y, width, height, data, label } = node;
  const [isHovered, setIsHovered] = useState(false);
  const [repoSelectorOpen, setRepoSelectorOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // Close repo selector when node is deselected
  useEffect(() => {
    if (!isSelected) setRepoSelectorOpen(false);
  }, [isSelected]);

  // ── Data extraction ──
  const iceType = (data.iceType as string) || '';
  const category = iceType.split('.')[0] || 'default';
  const provider = (data.provider as string) || '';
  const runtime = (data.runtime as string) || '';
  const folded = (data.folded as boolean) || false;
  const repository = (data.repository as string) || (data.github as string) || (data.repo as string) || '';

  // Auto-open repo selector for Source.Repository nodes with no repo set
  const isSourceRepo = (data.iceType as string) === 'Source.Repository' || data.behavior === 'source';
  useEffect(() => {
    if (isSelected && isSourceRepo && !repository) {
      setRepoSelectorOpen(true);
    }
  }, [isSelected, isSourceRepo, repository]);

  // (blockTypeName subtitle removed — service name line provides this info)
  const version = (data.version as string) || '';
  const estimatedCost = (data.estimatedCost as string) || '';
  const status = (data.status as string) || '';

  // ── Scaling ──
  const minInstances = data.minInstances != null ? Number(data.minInstances) : null;
  const maxInstances = data.maxInstances != null ? Number(data.maxInstances) : null;
  const activeInstances = data.activeInstances != null ? Number(data.activeInstances) : null;
  const hasScaling = minInstances != null || maxInstances != null;

  // ── Icons (dual system) ──
  const brandIcon: BrandIcon | null = getBrandIcon(runtime) || getBrandIcon(iceType) || getBrandIcon(label);
  const providerIcon = getIcon(iceType, (provider?.toLowerCase() || 'aws') as Provider);
  const providerUrl = providerIcon?.icon || DEFAULT_ICON;

  // ── Service name (cloud-native) ──
  const serviceName = getServiceName(iceType, provider || 'aws');
  const runtimeLabel = runtime || version || '';
  // Deduplicate: "Amazon SQS" + "SQS FIFO" → "Amazon SQS · FIFO" (strip common prefix)
  const dedupedRuntime = (() => {
    if (!serviceName || !runtimeLabel) return runtimeLabel;
    // If runtime exactly matches the short service name, skip it
    const shortName = serviceName.split(' ').pop() || '';
    if (runtimeLabel === shortName) return '';
    // Strip common prefix: "SQS FIFO" when service is "Amazon SQS" → "FIFO"
    if (runtimeLabel.startsWith(shortName + ' ')) return runtimeLabel.slice(shortName.length + 1);
    return runtimeLabel;
  })();
  const serviceLineText = [serviceName, dedupedRuntime].filter(Boolean).join(' \u00B7 ');

  // ── Context-aware metadata lines ──
  const { lines: metaLines, repoLineIndex } = getContextLines(data, iceType);

  // ── Status ──
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.active;
  const statusLabel = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
  const hasStatusLine = !!(statusLabel || estimatedCost);

  // ── Pipeline status ──
  const aggregatePipelineStatus: NodePipelineStatus | null = (() => {
    if (isSourceRepo && connectedPipelineStatuses.length > 0) {
      const active = connectedPipelineStatuses.find(
        (p) => p.status === 'building' || p.status === 'deploying' || p.status === 'queued',
      );
      if (active) return active;
      const failed = connectedPipelineStatuses.find((p) => p.status === 'failed');
      if (failed) return failed;
      const success = connectedPipelineStatuses.find((p) => p.status === 'success');
      if (success) return success;
    }
    return null;
  })();
  const effectivePipelineStatus = pipelineStatus || aggregatePipelineStatus;
  const hasPipeline = effectivePipelineStatus && effectivePipelineStatus.status !== 'idle';

  // ── Size calculation ──
  const metaGap = metaLines.length > 0 || hasScaling || hasPipeline ? 6 : 0;
  const contentH =
    CARD_PY +
    HEADER_HEIGHT +
    metaGap +
    metaLines.length * META_LINE_H +
    (hasScaling ? SCALING_ROW_H : 0) +
    (hasPipeline ? PIPELINE_ROW_H : 0) +
    (hasStatusLine ? STATUS_LINE_H : 0) +
    PAD_BOTTOM;
  const W = Math.max(width || CARD_WIDTH, CARD_WIDTH);
  const H = folded ? 38 : Math.max(height || 0, contentH, 64);

  // ── Colors ──
  const cat = CATEGORY_STYLE[category] || CATEGORY_STYLE.default;
  const border = isDragOver ? '#22d3ee' : isSelected || isHovered ? cat.glow : 'var(--ice-border)';

  const displayLabel = truncate(label || '', Math.max(Math.floor((W - TEXT_X - CARD_PX - 40) / 7), 8));

  // ── Callbacks ──
  const handleFold = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFold?.(node.id);
    },
    [node.id, onToggleFold],
  );
  const onEnter = useCallback(() => {
    setIsHovered(true);
    onNodeHover?.(node.id);
  }, [node.id, onNodeHover]);
  const onLeave = useCallback(() => {
    setIsHovered(false);
    onNodeHover?.(null);
  }, [onNodeHover]);

  // ══════════════════════════════════════════════════════════════════════════
  // BLOCK SUMMARY CARD — Level 1 compact view
  // ══════════════════════════════════════════════════════════════════════════
  if (isBlockSummary) {
    const SW = Math.max(width || BLOCK_SUMMARY_W, BLOCK_SUMMARY_W);
    const SH = BLOCK_SUMMARY_H;
    const bcat = CATEGORY_STYLE[category] || CATEGORY_STYLE.Block || CATEGORY_STYLE.default;
    const bBorder = isSelected || isHovered ? bcat.glow : 'var(--ice-border)';
    const resourceCount = childNodes.length;
    const blockCost = (data.estimatedCost as string) || '';

    return (
      <g
        className="svg-block-summary"
        data-node-id={node.id}
        style={{ cursor: 'move' }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {isSelected && (
          <rect
            x={x - 3}
            y={y - 3}
            width={SW + 6}
            height={SH + 6}
            rx={CORNER_RADIUS + 3}
            fill="none"
            stroke={bcat.glow}
            strokeWidth={2}
            opacity={0.6}
          />
        )}

        <rect
          x={x}
          y={y}
          width={SW}
          height={SH}
          rx={CORNER_RADIUS}
          fill="var(--ice-bg-surface)"
          stroke={bBorder}
          strokeWidth={isSelected ? 1.5 : 1}
        />

        {/* Left accent stripe */}
        <rect x={x} y={y} width={4} height={SH} rx={2} fill={bcat.glow} opacity={0.8} />

        {/* Category icon */}
        {renderCategoryIcon(category, x + 14, y + 14, ICON_SIZE, bcat.glow)}

        {/* Block name */}
        <text
          x={x + 42}
          y={y + 22}
          dominantBaseline="middle"
          fill="var(--ice-text-primary)"
          fontSize="12"
          fontWeight="600"
          fontFamily="'JetBrains Mono Variable', monospace"
          style={{ cursor: 'text', pointerEvents: 'auto' }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClickLabel?.();
          }}
        >
          {truncate(label || '', 22)}
        </text>

        {/* Resource count */}
        <text
          x={x + 42}
          y={y + 42}
          dominantBaseline="middle"
          fill="var(--ice-text-secondary)"
          fontSize="10"
          fontFamily="ui-monospace, 'SFMono-Regular', monospace"
          style={{ pointerEvents: 'none' }}
        >
          {resourceCount > 0 ? `${resourceCount} resource${resourceCount !== 1 ? 's' : ''}` : 'empty'}
        </text>

        {/* Provider pill */}
        {provider && (
          <g>
            <rect
              x={x + SW - CARD_PX - (provider.length * 5 + 10)}
              y={y + 14}
              width={provider.length * 5 + 10}
              height={14}
              rx={7}
              fill="var(--ice-bg-raised)"
            />
            <text
              x={x + SW - CARD_PX - (provider.length * 5 + 10) / 2}
              y={y + 21}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--ice-text-secondary)"
              fontSize="9"
              fontWeight="500"
              fontFamily="ui-monospace, 'SFMono-Regular', monospace"
              style={{ pointerEvents: 'none' }}
            >
              {provider.toUpperCase()}
            </text>
          </g>
        )}

        {/* Cost */}
        {blockCost && (
          <text
            x={x + SW - CARD_PX}
            y={y + SH - 12}
            textAnchor="end"
            dominantBaseline="middle"
            fill="var(--ice-text-secondary)"
            fontSize="9"
            fontFamily="ui-monospace, 'SFMono-Regular', monospace"
            style={{ pointerEvents: 'none' }}
          >
            {blockCost}
          </text>
        )}
      </g>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOD 1 — ICONIC: large icon + status dot, rendered at inverse-zoom size
  // so it looks ~60px on screen regardless of zoom level
  // ══════════════════════════════════════════════════════════════════════════
  if (lod <= 1) {
    // Scale factor: render larger in canvas coords to compensate for zoom
    const invScale = 1 / Math.max(zoom, 0.1);
    const screenSize = 60; // desired screen pixels
    const S = screenSize * invScale;
    const iconSize = 28 * invScale;
    const dotR = 5 * invScale;
    const borderW = (isSelected ? 2 : 1) * invScale;
    const cx = x + W / 2; // center on original node position
    const cy = y + H / 2;

    const pipeColor = effectivePipelineStatus
      ? effectivePipelineStatus.status === 'success'
        ? '#22c55e'
        : effectivePipelineStatus.status === 'failed'
          ? '#ef4444'
          : '#3b82f6'
      : null;

    return (
      <g
        className="svg-compact-node lod-1"
        data-node-id={node.id}
        style={{ cursor: connectionDragState === 'valid-target' ? 'crosshair' : 'move' }}
        opacity={connectionDragState === 'invalid-target' ? 0.3 : 1}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {isSelected && (
          <rect
            x={cx - S / 2 - 3 * invScale}
            y={cy - S / 2 - 3 * invScale}
            width={S + 6 * invScale}
            height={S + 6 * invScale}
            rx={12 * invScale}
            fill="none"
            stroke={cat.glow}
            strokeWidth={2 * invScale}
            opacity={0.6}
          />
        )}
        {/* Connection drag: valid target glow */}
        {connectionDragState === 'valid-target' && (
          <rect
            x={cx - S / 2 - 4 * invScale}
            y={cy - S / 2 - 4 * invScale}
            width={S + 8 * invScale}
            height={S + 8 * invScale}
            rx={12 * invScale}
            fill="none"
            stroke="#22c55e"
            strokeWidth={2 * invScale}
            opacity={0.8}
          >
            {!reducedMotion && (
              <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.5s" repeatCount="indefinite" />
            )}
          </rect>
        )}
        <rect
          x={cx - S / 2}
          y={cy - S / 2}
          width={S}
          height={S}
          rx={10 * invScale}
          fill="var(--ice-bg-surface)"
          stroke={connectionDragState === 'valid-target' ? '#22c55e' : border}
          strokeWidth={borderW}
        />
        <image
          x={cx - iconSize / 2}
          y={cy - iconSize / 2 - 4 * invScale}
          width={iconSize}
          height={iconSize}
          href={brandIcon?.url || providerUrl}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={label || iceType || 'Resource'}
        />
        <circle cx={cx} cy={cy + S / 2 - 10 * invScale} r={dotR} fill={pipeColor || statusColor} opacity={0.9}>
          {pipeColor &&
            !reducedMotion &&
            effectivePipelineStatus?.status !== 'success' &&
            effectivePipelineStatus?.status !== 'failed' && (
              <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
            )}
        </circle>
      </g>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOD 2 — COMPACT: icon + label + status, inverse-zoom sized
  // ══════════════════════════════════════════════════════════════════════════
  if (lod <= 2) {
    const invScale = 1 / Math.max(zoom, 0.1);
    const CW = 160 * invScale;
    const CH = 48 * invScale;
    const fontSize = 12 * invScale;
    const iconSz = 20 * invScale;
    const dotR = 4 * invScale;
    const borderW = (isSelected ? 1.5 : 1) * invScale;
    const padX = 10 * invScale;
    const cx = x + W / 2;
    const cy = y + H / 2;

    const pipeColor = effectivePipelineStatus
      ? effectivePipelineStatus.status === 'success'
        ? '#22c55e'
        : effectivePipelineStatus.status === 'failed'
          ? '#ef4444'
          : '#3b82f6'
      : null;

    return (
      <g
        className="svg-compact-node lod-2"
        data-node-id={node.id}
        style={{ cursor: connectionDragState === 'valid-target' ? 'crosshair' : 'move' }}
        opacity={connectionDragState === 'invalid-target' ? 0.3 : 1}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {isSelected && (
          <rect
            x={cx - CW / 2 - 3 * invScale}
            y={cy - CH / 2 - 3 * invScale}
            width={CW + 6 * invScale}
            height={CH + 6 * invScale}
            rx={(CORNER_RADIUS + 2) * invScale}
            fill="none"
            stroke={cat.glow}
            strokeWidth={2 * invScale}
            opacity={0.6}
          />
        )}
        {/* Connection drag: valid target glow */}
        {connectionDragState === 'valid-target' && (
          <rect
            x={cx - CW / 2 - 4 * invScale}
            y={cy - CH / 2 - 4 * invScale}
            width={CW + 8 * invScale}
            height={CH + 8 * invScale}
            rx={(CORNER_RADIUS + 3) * invScale}
            fill="none"
            stroke="#22c55e"
            strokeWidth={2 * invScale}
            opacity={0.8}
          >
            {!reducedMotion && (
              <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.5s" repeatCount="indefinite" />
            )}
          </rect>
        )}
        <rect
          x={cx - CW / 2}
          y={cy - CH / 2}
          width={CW}
          height={CH}
          rx={CORNER_RADIUS * invScale}
          fill="var(--ice-bg-surface)"
          stroke={connectionDragState === 'valid-target' ? '#22c55e' : border}
          strokeWidth={borderW}
        />
        {/* Icon */}
        <image
          x={cx - CW / 2 + padX}
          y={cy - iconSz / 2}
          width={iconSz}
          height={iconSz}
          href={brandIcon?.url || providerUrl}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        />
        {/* Label */}
        <text
          x={cx - CW / 2 + padX + iconSz + 6 * invScale}
          y={cy - 4 * invScale}
          dominantBaseline="middle"
          fill="var(--ice-text-primary)"
          fontSize={fontSize}
          fontWeight="600"
          fontFamily="'JetBrains Mono Variable', monospace"
          style={{ pointerEvents: 'none' }}
        >
          {truncate(label || '', 12)}
        </text>
        {/* Status dot + label */}
        <circle
          cx={cx - CW / 2 + padX + 4 * invScale}
          cy={cy + CH / 2 - 10 * invScale}
          r={dotR}
          fill={pipeColor || statusColor}
          opacity={0.9}
        >
          {pipeColor &&
            !reducedMotion &&
            effectivePipelineStatus?.status !== 'success' &&
            effectivePipelineStatus?.status !== 'failed' && (
              <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
            )}
        </circle>
        {statusLabel && (
          <text
            x={cx - CW / 2 + padX + 12 * invScale}
            y={cy + CH / 2 - 9 * invScale}
            dominantBaseline="middle"
            fill="var(--ice-text-secondary)"
            fontSize={9 * invScale}
            fontFamily="ui-monospace, 'SFMono-Regular', monospace"
            opacity={0.7}
            style={{ pointerEvents: 'none' }}
          >
            {statusLabel}
          </text>
        )}
        {/* Connection ports on hover or when valid target */}
        {(isHovered || connectionDragState === 'valid-target') && (
          <g className="connection-ports">
            <circle
              className="connection-port"
              data-node-id={node.id}
              data-side="left"
              cx={cx - CW / 2}
              cy={cy}
              r={(connectionDragState === 'valid-target' ? 6 : 5) * invScale}
              fill={connectionDragState === 'valid-target' ? '#22c55e' : cat.glow}
              stroke="var(--ice-bg-base)"
              strokeWidth={2 * invScale}
              style={{ cursor: 'crosshair' }}
            />
            <circle
              className="connection-port"
              data-node-id={node.id}
              data-side="right"
              cx={cx + CW / 2}
              cy={cy}
              r={(connectionDragState === 'valid-target' ? 6 : 5) * invScale}
              fill={connectionDragState === 'valid-target' ? '#22c55e' : cat.glow}
              stroke="var(--ice-bg-base)"
              strokeWidth={2 * invScale}
              style={{ cursor: 'crosshair' }}
            />
          </g>
        )}
      </g>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOD 3 — STANDARD RESOURCE CARD — Clean Linear/Figma style (full detail)
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <g
      className="svg-compact-node"
      data-node-id={node.id}
      style={{ cursor: connectionDragState === 'valid-target' ? 'crosshair' : 'move' }}
      opacity={connectionDragState === 'invalid-target' ? 0.3 : 1}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* Selection ring */}
      {isSelected && (
        <rect
          x={x - 3}
          y={y - 3}
          width={W + 6}
          height={H + 6}
          rx={CORNER_RADIUS + 3}
          fill="none"
          stroke={cat.glow}
          strokeWidth={2}
          opacity={0.6}
        />
      )}

      {/* Drop target */}
      {isDragOver && (
        <rect
          x={x - 3}
          y={y - 3}
          width={W + 6}
          height={H + 6}
          rx={CORNER_RADIUS + 3}
          fill="none"
          stroke="#22d3ee"
          strokeWidth={2}
          strokeDasharray="6 3"
          opacity={0.8}
        />
      )}

      {/* Connection drag: valid target glow */}
      {connectionDragState === 'valid-target' && (
        <rect
          x={x - 4}
          y={y - 4}
          width={W + 8}
          height={H + 8}
          rx={CORNER_RADIUS + 4}
          fill="none"
          stroke="#22c55e"
          strokeWidth={2}
          opacity={0.8}
        >
          {!reducedMotion && (
            <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.5s" repeatCount="indefinite" />
          )}
        </rect>
      )}

      {/* Card background */}
      <rect
        x={x}
        y={y}
        width={W}
        height={H}
        rx={CORNER_RADIUS}
        fill="var(--ice-bg-surface)"
        stroke={connectionDragState === 'valid-target' ? '#22c55e' : border}
        strokeWidth={isSelected ? 1.5 : 1}
      />

      {/* ─── Folded state ─── */}
      {folded ? (
        <g>
          {renderCategoryIcon(category, x + CARD_PX, y + 9, ICON_SIZE, cat.glow)}
          <text
            x={x + TEXT_X}
            y={y + 19}
            dominantBaseline="middle"
            fill="var(--ice-text-primary)"
            fontSize="12"
            fontWeight="600"
            fontFamily="'JetBrains Mono Variable', monospace"
            style={{ cursor: 'text', pointerEvents: 'auto' }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClickLabel?.();
            }}
          >
            {displayLabel}
          </text>
          {runtimeLabel && (
            <text
              x={x + W - 36}
              y={y + 19}
              dominantBaseline="middle"
              fill="var(--ice-text-secondary)"
              fontSize="9"
              fontFamily="ui-monospace, 'SFMono-Regular', monospace"
              style={{ pointerEvents: 'none' }}
            >
              {truncate(runtimeLabel, 10)}
            </text>
          )}
          <g style={{ cursor: 'pointer' }} onClick={handleFold} opacity={isHovered ? 0.8 : 0.4}>
            <rect x={x + W - 28} y={y + 8} width={16} height={22} fill="transparent" />
            <path
              d={`M ${x + W - 24} ${y + 15} l 5 4 -5 4`}
              fill="none"
              stroke="var(--ice-text-tertiary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
      ) : (
        <g>
          {/* ═══════ HEADER LINE 1: Category Icon + Label + Provider Pill ═══════ */}

          {/* Category icon (generic, geometric) */}
          {renderCategoryIcon(category, x + CARD_PX, y + CARD_PY, ICON_SIZE, cat.glow)}

          {/* Label — editable on double-click */}
          {isRenaming ? (
            <foreignObject
              x={x + TEXT_X}
              y={y + CARD_PY - 2}
              width={Math.min(W - TEXT_X - CARD_PX - 40, 180)}
              height={22}
            >
              <input
                ref={renameInputRef}
                defaultValue={label || ''}
                aria-label="Rename node"
                autoComplete="off"
                name="node-label"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRenameCommit?.((e.target as HTMLInputElement).value);
                  } else if (e.key === 'Escape') {
                    onRenameCancel?.();
                  }
                  e.stopPropagation();
                }}
                onBlur={(e) => onRenameCommit?.(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  height: '20px',
                  background: 'var(--ice-bg-overlay)',
                  border: '1px solid #3b82f6',
                  borderRadius: 4,
                  color: 'var(--ice-text-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "'JetBrains Mono Variable', monospace",
                  padding: '0 6px',
                  outline: 'none',
                  boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.3)',
                }}
              />
            </foreignObject>
          ) : (
            <text
              x={x + TEXT_X}
              y={y + CARD_PY + 8}
              dominantBaseline="middle"
              fill="var(--ice-text-primary)"
              fontSize="12"
              fontWeight="600"
              fontFamily="'JetBrains Mono Variable', monospace"
              style={{ cursor: 'text', pointerEvents: 'auto' }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClickLabel?.();
              }}
            >
              {displayLabel}
            </text>
          )}

          {/* Provider pill — top-right */}
          {provider && (
            <g>
              <rect
                x={x + W - CARD_PX - (provider.length * 5 + 10)}
                y={y + CARD_PY}
                width={provider.length * 5 + 10}
                height={14}
                rx={7}
                fill="var(--ice-bg-raised)"
              />
              <text
                x={x + W - CARD_PX - (provider.length * 5 + 10) / 2}
                y={y + CARD_PY + 7}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--ice-text-secondary)"
                fontSize="9"
                fontWeight="500"
                fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                style={{ pointerEvents: 'none' }}
              >
                {provider.toUpperCase()}
              </text>
            </g>
          )}

          {/* ═══════ HEADER LINE 2: Brand Icon + Service Name · Runtime ═══════ */}

          {/* Brand/runtime icon (smaller, second line) */}
          {(brandIcon || providerUrl) && (
            <image
              x={x + CARD_PX + 2}
              y={y + CARD_PY + 20}
              width={BRAND_ICON_SIZE}
              height={BRAND_ICON_SIZE}
              href={brandIcon?.url || providerUrl}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            />
          )}

          {/* Cloud-native service name + runtime */}
          {serviceLineText && (
            <text
              x={x + CARD_PX + BRAND_ICON_SIZE + ICON_GAP}
              y={y + CARD_PY + 28}
              dominantBaseline="middle"
              fill="var(--ice-text-secondary)"
              fontSize="10"
              fontFamily="ui-monospace, 'SFMono-Regular', monospace"
              style={{ pointerEvents: 'none' }}
            >
              {truncate(serviceLineText, 28)}
            </text>
          )}

          {/* ═══════ METADATA LINES ═══════ */}
          {(() => {
            const metaY = y + CARD_PY + HEADER_HEIGHT + metaGap;
            let cursorY = metaY;

            return (
              <g>
                {/* Endpoint / repo / image lines */}
                {metaLines.map((line, i) => {
                  const lineY = metaY + i * META_LINE_H;
                  const isRepoLine = i === repoLineIndex;

                  // Repo line is clickable when selected — only on Source.Repository blocks
                  if (isRepoLine && isSelected && isSourceRepo) {
                    return (
                      <g key={i}>
                        <text
                          x={x + CARD_PX}
                          y={lineY}
                          dominantBaseline="middle"
                          fill="var(--ice-text-secondary)"
                          fontSize="10"
                          fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                          opacity={isHovered ? 0.9 : 0.6}
                          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRepoSelectorOpen(!repoSelectorOpen);
                          }}
                        >
                          {line}
                        </text>
                        {/* Edit icon on hover */}
                        {isHovered && (
                          <text
                            x={x + W - CARD_PX - 4}
                            y={lineY}
                            textAnchor="end"
                            dominantBaseline="middle"
                            fill="var(--ice-text-secondary)"
                            fontSize="9"
                            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRepoSelectorOpen(!repoSelectorOpen);
                            }}
                          >
                            ✎
                          </text>
                        )}
                      </g>
                    );
                  }

                  const isPh = isPlaceholder(line);
                  return (
                    <text
                      key={i}
                      x={x + CARD_PX}
                      y={lineY}
                      dominantBaseline="middle"
                      fill={isPh ? 'var(--ice-text-tertiary)' : 'var(--ice-text-secondary)'}
                      fontSize="10"
                      fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                      fontStyle={isPh ? 'italic' : 'normal'}
                      opacity={isPh ? 0.4 : isHovered ? 0.9 : 0.6}
                      style={{ pointerEvents: 'none' }}
                    >
                      {isPh ? line.slice(1) : line}
                    </text>
                  );
                })}

                {/* "Link repo" prompt — only on Source.Repository blocks */}
                {!repository && isSelected && isHovered && isSourceRepo && (
                  <text
                    x={x + CARD_PX}
                    y={metaY + metaLines.length * META_LINE_H + (metaLines.length > 0 ? 0 : 4)}
                    dominantBaseline="middle"
                    fill="#3b82f6"
                    fontSize="9"
                    fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                    opacity={0.7}
                    style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRepoSelectorOpen(true);
                    }}
                  >
                    {t('integrations.repoSelector.linkRepo')}
                  </text>
                )}

                {/* Repo selector overlay — only on Source.Repository blocks */}
                {repoSelectorOpen && isSelected && isSourceRepo && (
                  <foreignObject
                    x={x}
                    y={metaY + (repoLineIndex >= 0 ? repoLineIndex * META_LINE_H : metaLines.length * META_LINE_H) - 4}
                    width={W}
                    height={32}
                  >
                    <div
                      style={{ width: '100%', padding: '0 8px' }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <RepoSelector
                        compact
                        value={repository}
                        onChange={(repo) => {
                          onUpdateData?.(node.id, { repository: repo });
                          setRepoSelectorOpen(false);
                        }}
                      />
                    </div>
                  </foreignObject>
                )}

                {(() => {
                  cursorY = metaY + metaLines.length * META_LINE_H;
                  return null;
                })()}

                {/* ═══════ SCALING ROW ═══════ */}
                {hasScaling && (
                  <g>
                    {/* Active indicator + label */}
                    {activeInstances != null && (
                      <g>
                        <circle cx={x + CARD_PX + 4} cy={cursorY + 7} r={3} fill="#22c55e" opacity={0.9} />
                        <text
                          x={x + CARD_PX + 12}
                          y={cursorY + 8}
                          dominantBaseline="middle"
                          fill="#22c55e"
                          fontSize="10"
                          fontWeight="600"
                          fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                          style={{ pointerEvents: 'none' }}
                        >
                          {activeInstances}
                        </text>
                      </g>
                    )}
                    <text
                      x={activeInstances != null ? x + CARD_PX + 28 : x + CARD_PX}
                      y={cursorY + 8}
                      dominantBaseline="middle"
                      fill="var(--ice-text-secondary)"
                      fontSize="9"
                      fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                      opacity={0.7}
                      style={{ pointerEvents: 'none' }}
                    >
                      {activeInstances != null ? 'active' : 'instances'}
                    </text>

                    {/* Min controls */}
                    <g
                      style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const v = Math.max(0, (minInstances ?? 1) - 1);
                        onUpdateData?.(node.id, { minInstances: v });
                      }}
                    >
                      <rect
                        x={x + 70}
                        y={cursorY - 2}
                        width={18}
                        height={18}
                        rx={3}
                        fill="var(--ice-bg-raised)"
                        stroke="var(--ice-border-strong)"
                        strokeWidth={0.5}
                      />
                      <text
                        x={x + 79}
                        y={cursorY + 7}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="var(--ice-text-tertiary)"
                        fontSize="12"
                        fontWeight="600"
                        style={{ pointerEvents: 'none' }}
                      >
                        −
                      </text>
                    </g>
                    <text
                      x={x + 96}
                      y={cursorY + 8}
                      dominantBaseline="middle"
                      fill="var(--ice-text-primary)"
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                      textAnchor="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      {minInstances ?? 1}
                    </text>
                    <g
                      style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const v = Math.min((minInstances ?? 1) + 1, maxInstances ?? 99);
                        onUpdateData?.(node.id, { minInstances: v });
                      }}
                    >
                      <rect
                        x={x + 103}
                        y={cursorY - 2}
                        width={18}
                        height={18}
                        rx={3}
                        fill="var(--ice-bg-raised)"
                        stroke="var(--ice-border-strong)"
                        strokeWidth={0.5}
                      />
                      <text
                        x={x + 112}
                        y={cursorY + 7}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="var(--ice-text-tertiary)"
                        fontSize="12"
                        fontWeight="600"
                        style={{ pointerEvents: 'none' }}
                      >
                        +
                      </text>
                    </g>

                    {/* Separator */}
                    <text
                      x={x + 130}
                      y={cursorY + 8}
                      dominantBaseline="middle"
                      fill="var(--ice-border-strong)"
                      fontSize="10"
                      fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                      style={{ pointerEvents: 'none' }}
                    >
                      –
                    </text>

                    {/* Max controls */}
                    <g
                      style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const v = Math.max(minInstances ?? 1, (maxInstances ?? 3) - 1);
                        onUpdateData?.(node.id, { maxInstances: v });
                      }}
                    >
                      <rect
                        x={x + 142}
                        y={cursorY - 2}
                        width={18}
                        height={18}
                        rx={3}
                        fill="var(--ice-bg-raised)"
                        stroke="var(--ice-border-strong)"
                        strokeWidth={0.5}
                      />
                      <text
                        x={x + 151}
                        y={cursorY + 7}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="var(--ice-text-tertiary)"
                        fontSize="12"
                        fontWeight="600"
                        style={{ pointerEvents: 'none' }}
                      >
                        −
                      </text>
                    </g>
                    <text
                      x={x + 168}
                      y={cursorY + 8}
                      dominantBaseline="middle"
                      fill="var(--ice-text-primary)"
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                      textAnchor="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      {maxInstances ?? 3}
                    </text>
                    <g
                      style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const v = (maxInstances ?? 3) + 1;
                        onUpdateData?.(node.id, { maxInstances: v });
                      }}
                    >
                      <rect
                        x={x + 175}
                        y={cursorY - 2}
                        width={18}
                        height={18}
                        rx={3}
                        fill="var(--ice-bg-raised)"
                        stroke="var(--ice-border-strong)"
                        strokeWidth={0.5}
                      />
                      <text
                        x={x + 184}
                        y={cursorY + 7}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="var(--ice-text-tertiary)"
                        fontSize="12"
                        fontWeight="600"
                        style={{ pointerEvents: 'none' }}
                      >
                        +
                      </text>
                    </g>
                  </g>
                )}
              </g>
            );
          })()}

          {/* ═══════ PIPELINE STATUS ROW ═══════ */}
          {hasPipeline && effectivePipelineStatus && (
            <g
              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
              onClick={(e) => {
                e.stopPropagation();
                onPipelineClick?.(node.id);
              }}
            >
              {/* ⚡ icon */}
              <text
                x={x + CARD_PX}
                y={y + H - PAD_BOTTOM - (hasStatusLine ? STATUS_LINE_H : 0) - 2}
                dominantBaseline="middle"
                fill={
                  effectivePipelineStatus.status === 'success'
                    ? '#22c55e'
                    : effectivePipelineStatus.status === 'failed'
                      ? '#ef4444'
                      : '#f59e0b'
                }
                fontSize="10"
                style={{ pointerEvents: 'none' }}
              >
                ⚡
              </text>

              {/* Status label */}
              <text
                x={x + CARD_PX + 16}
                y={y + H - PAD_BOTTOM - (hasStatusLine ? STATUS_LINE_H : 0) - 2}
                dominantBaseline="middle"
                fill={
                  effectivePipelineStatus.status === 'success'
                    ? '#22c55e'
                    : effectivePipelineStatus.status === 'failed'
                      ? '#ef4444'
                      : '#3b82f6'
                }
                fontSize="9"
                fontWeight="600"
                fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                style={{ pointerEvents: 'none' }}
              >
                {effectivePipelineStatus.status === 'success'
                  ? 'Live'
                  : effectivePipelineStatus.status === 'failed'
                    ? 'Failed'
                    : effectivePipelineStatus.status === 'building'
                      ? 'Building'
                      : effectivePipelineStatus.status === 'deploying'
                        ? 'Deploying'
                        : 'Queued'}
              </text>

              {/* Progress bar (during active states) */}
              {(effectivePipelineStatus.status === 'building' ||
                effectivePipelineStatus.status === 'deploying' ||
                effectivePipelineStatus.status === 'queued') && (
                <g>
                  <rect
                    x={x + CARD_PX + 60}
                    y={y + H - PAD_BOTTOM - (hasStatusLine ? STATUS_LINE_H : 0) - 5}
                    width={W - CARD_PX * 2 - 60}
                    height={4}
                    rx={2}
                    fill="var(--ice-border)"
                  />
                  <rect
                    x={x + CARD_PX + 60}
                    y={y + H - PAD_BOTTOM - (hasStatusLine ? STATUS_LINE_H : 0) - 5}
                    width={Math.max(2, ((effectivePipelineStatus.progress || 0) / 100) * (W - CARD_PX * 2 - 60))}
                    height={4}
                    rx={2}
                    fill="#3b82f6"
                  >
                    {/* Pulse animation during active deploy */}
                    {!reducedMotion && (
                      <animate attributeName="opacity" values="1;0.6;1" dur="1.5s" repeatCount="indefinite" />
                    )}
                  </rect>
                </g>
              )}

              {/* Commit SHA for completed states */}
              {(effectivePipelineStatus.status === 'success' || effectivePipelineStatus.status === 'failed') &&
                effectivePipelineStatus.commitSha && (
                  <text
                    x={x + W - CARD_PX}
                    y={y + H - PAD_BOTTOM - (hasStatusLine ? STATUS_LINE_H : 0) - 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fill="var(--ice-text-tertiary)"
                    fontSize="8"
                    fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                    style={{ pointerEvents: 'none' }}
                  >
                    {effectivePipelineStatus.commitSha.slice(0, 7)}
                  </text>
                )}
            </g>
          )}

          {/* ═══════ CONNECTED PIPELINE STATUS (for Source.Repository blocks) ═══════ */}
          {isSourceRepo && connectedPipelineStatuses.length > 0 && !hasPipeline && (
            <g style={{ pointerEvents: 'none' }}>
              {connectedPipelineStatuses.map((ps, i) => {
                const dotColor =
                  ps.status === 'success'
                    ? '#22c55e'
                    : ps.status === 'failed'
                      ? '#ef4444'
                      : ps.status === 'building' || ps.status === 'deploying'
                        ? '#3b82f6'
                        : ps.status === 'queued'
                          ? '#f59e0b'
                          : '#64748b';
                const isActive = ps.status === 'building' || ps.status === 'deploying' || ps.status === 'queued';
                return (
                  <circle
                    key={i}
                    cx={x + CARD_PX + 4 + i * 10}
                    cy={y + H - PAD_BOTTOM - (hasStatusLine ? STATUS_LINE_H : 0)}
                    r={3}
                    fill={dotColor}
                    opacity={0.9}
                  >
                    {isActive && !reducedMotion && (
                      <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
                    )}
                  </circle>
                );
              })}
              <text
                x={x + CARD_PX + 4 + connectedPipelineStatuses.length * 10 + 4}
                y={y + H - PAD_BOTTOM - (hasStatusLine ? STATUS_LINE_H : 0)}
                dominantBaseline="middle"
                fill="var(--ice-text-tertiary)"
                fontSize="8"
                fontFamily="ui-monospace, 'SFMono-Regular', monospace"
              >
                {connectedPipelineStatuses.filter((p) => p.status === 'success').length > 0
                  ? `${connectedPipelineStatuses.filter((p) => p.status === 'success').length} live`
                  : ''}
              </text>
            </g>
          )}

          {/* ═══════ STATUS + COST LINE ═══════ */}
          {hasStatusLine && (
            <g>
              {/* Status dot + label — bottom-left */}
              {statusLabel && (
                <g>
                  <circle cx={x + CARD_PX + 4} cy={y + H - PAD_BOTTOM} r={3} fill={statusColor} opacity={0.9} />
                  <text
                    x={x + CARD_PX + 12}
                    y={y + H - PAD_BOTTOM}
                    dominantBaseline="middle"
                    fill="var(--ice-text-secondary)"
                    fontSize="9"
                    fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                    opacity={0.7}
                    style={{ pointerEvents: 'none' }}
                  >
                    {statusLabel}
                  </text>
                </g>
              )}

              {/* Cost — bottom-right */}
              {estimatedCost && (
                <text
                  x={x + W - CARD_PX}
                  y={y + H - PAD_BOTTOM}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--ice-text-secondary)"
                  fontSize="9"
                  fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                  opacity={0.7}
                  style={{ pointerEvents: 'none' }}
                >
                  {estimatedCost}
                </text>
              )}
            </g>
          )}

          {/* ═══════ FOLD TOGGLE ═══════ */}
          <g style={{ cursor: 'pointer' }} onClick={handleFold} opacity={isHovered ? 0.7 : 0}>
            <rect x={x + W - 22} y={y + 4} width={18} height={18} fill="transparent" />
            <path
              d={`M ${x + W - 17} ${y + 10} l 4.5 4 4.5 -4`}
              fill="none"
              stroke="var(--ice-text-tertiary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
      )}

      {/* ═══════ CONNECTION PORTS (visible on hover or when valid target) ═══════ */}
      {(isHovered || connectionDragState === 'valid-target') && (
        <g className="connection-ports">
          {/* Top */}
          <circle
            className="connection-port"
            data-node-id={node.id}
            data-side="top"
            cx={x + W / 2}
            cy={y}
            r={connectionDragState === 'valid-target' ? 6 : 5}
            fill={connectionDragState === 'valid-target' ? '#22c55e' : cat.glow}
            stroke="var(--ice-bg-base)"
            strokeWidth={2}
            style={{ cursor: 'crosshair' }}
          />
          {/* Right */}
          <circle
            className="connection-port"
            data-node-id={node.id}
            data-side="right"
            cx={x + W}
            cy={y + H / 2}
            r={connectionDragState === 'valid-target' ? 6 : 5}
            fill={connectionDragState === 'valid-target' ? '#22c55e' : cat.glow}
            stroke="var(--ice-bg-base)"
            strokeWidth={2}
            style={{ cursor: 'crosshair' }}
          />
          {/* Bottom */}
          <circle
            className="connection-port"
            data-node-id={node.id}
            data-side="bottom"
            cx={x + W / 2}
            cy={y + H}
            r={connectionDragState === 'valid-target' ? 6 : 5}
            fill={connectionDragState === 'valid-target' ? '#22c55e' : cat.glow}
            stroke="var(--ice-bg-base)"
            strokeWidth={2}
            style={{ cursor: 'crosshair' }}
          />
          {/* Left */}
          <circle
            className="connection-port"
            data-node-id={node.id}
            data-side="left"
            cx={x}
            cy={y + H / 2}
            r={connectionDragState === 'valid-target' ? 6 : 5}
            fill={connectionDragState === 'valid-target' ? '#22c55e' : cat.glow}
            stroke="var(--ice-bg-base)"
            strokeWidth={2}
            style={{ cursor: 'crosshair' }}
          />
        </g>
      )}
    </g>
  );
};

SvgCompactNode.displayName = 'SvgCompactNode';

