/**
 * SVG Compact Node — Clean Linear/Figma-style Infrastructure Card
 *
 * Flat card layout:
 * ╭──────────────────────────────╮
 * │  [icon]  Database        AWS │   name + provider pill
 * │          PostgreSQL 15       │   runtime
 * │                              │
 * │  db.internal:5432            │   endpoint (monospace)
 * │  db.t3.medium · 50 GB       │   hardware (monospace)
 * │  ● Active           ~$45/mo │   status + cost
 * ╰──────────────────────────────╯
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { getIcon, DEFAULT_ICON, type Provider } from '../../../../assets/icons';
import { getBrandIcon, type BrandIcon } from '../../../../assets/icons/brand-registry';
import { REPO_SELECTOR } from '../../../../i18n/messages';
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
}

// ─── Design Tokens ──────────────────────────────────────────────────────────

const CARD_PX = 12;
const CARD_PY = 10;
const CARD_RADIUS = 8;
const ICON_SIZE = 20;
const ICON_GAP = 8;
const TEXT_X = CARD_PX + ICON_SIZE + ICON_GAP;
const HEADER_H = 36;
const META_LINE_H = 16;
const STATUS_LINE_H = 16;
const PAD_BOTTOM = 10;
const CARD_WIDTH = 220;

// ─── Colors ─────────────────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { border: string; glow: string }> = {
  Application: { border: '#1e3a5f', glow: '#3b82f6' },
  Database: { border: '#2d1f5e', glow: '#8b5cf6' },
  Storage: { border: '#1a4035', glow: '#10b981' },
  Network: { border: '#3b1e48', glow: '#ec4899' },
  Security: { border: '#3d2f1a', glow: '#f59e0b' },
  Messaging: { border: '#252660', glow: '#6366f1' },
  Monitoring: { border: '#2a3040', glow: '#64748b' },
  Block: { border: '#253548', glow: '#3b82f6' },
  default: { border: 'var(--ice-border)', glow: 'var(--ice-border-strong)' },
};

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  running: '#22c55e',
  healthy: '#22c55e',
  deployed: '#22c55e',
  pending: '#f59e0b',
  warning: '#f59e0b',
  creating: '#f59e0b',
  updating: '#3b82f6',
  deploying: '#3b82f6',
  error: '#ef4444',
  failed: '#ef4444',
  deleting: '#ef4444',
  stopped: '#64748b',
  inactive: '#64748b',
};

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
  const repo = data.repository || data.github || data.repo || '';
  const domain = data.domain || data.subdomain || data.url || '';
  const image = data.image || '';
  const size = data.size || '';
  const storage = data.storage || '';
  const cost = data.estimatedCost || '';
  const status = data.status || '';

  const blockTypeName = (data.blockTypeName as string) || '';
  const label = (data.label as string) || '';
  const isRenamed = blockTypeName && label && label !== blockTypeName;
  const hasScaling = data.minInstances != null || data.maxInstances != null;

  const metaCount = (repo ? 1 : 0) + (domain ? 1 : 0) + (image ? 1 : 0);
  const hasHardware = !!(size || storage);
  const hasStatusLine = !!(status || cost);
  const metaGap = metaCount > 0 || hasHardware || hasScaling || hasPipeline ? 6 : 0;

  const h =
    CARD_PY +
    HEADER_H +
    metaGap +
    (isRenamed ? RENAMED_SUBTITLE_H : 0) +
    metaCount * META_LINE_H +
    (hasHardware ? META_LINE_H : 0) +
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
}) => {
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

  // The original type name (set during blueprint expansion)
  const blockTypeName = (data.blockTypeName as string) || '';
  // Show type subtitle when user has renamed the block
  const isRenamed = blockTypeName && label && label !== blockTypeName;
  const domain = (data.domain as string) || (data.subdomain as string) || (data.url as string) || '';
  const image = (data.image as string) || '';
  const version = (data.version as string) || '';
  const port = data.port ? String(data.port) : '';
  const estimatedCost = (data.estimatedCost as string) || '';
  const size = (data.size as string) || '';
  const storage = (data.storage as string) || '';
  const status = (data.status as string) || '';

  const runtimeLabel = runtime || version || '';

  // ── Scaling ──
  const minInstances = data.minInstances != null ? Number(data.minInstances) : null;
  const maxInstances = data.maxInstances != null ? Number(data.maxInstances) : null;
  const activeInstances = data.activeInstances != null ? Number(data.activeInstances) : null;
  const hasScaling = minInstances != null || maxInstances != null;

  // ── Hardware line ──
  const hardwareParts: string[] = [];
  if (size) hardwareParts.push(size);
  if (storage) hardwareParts.push(storage);
  const hardwareLine = hardwareParts.length > 0 ? hardwareParts.join(' \u00B7 ') : '';

  // ── Icons ──
  const brandIcon: BrandIcon | null = getBrandIcon(runtime) || getBrandIcon(iceType) || getBrandIcon(label);
  const providerIcon = getIcon(iceType, (provider?.toLowerCase() || 'aws') as Provider);
  const providerUrl = providerIcon?.icon || DEFAULT_ICON;

  // ── Metadata lines (plain monospace text) ──
  const metaLines: string[] = [];
  let repoLineIndex = -1;
  if (domain) {
    const d = port ? `${shortDomain(domain)}:${port}` : shortDomain(domain);
    metaLines.push(truncate(d, 30));
  }
  if (repository) {
    repoLineIndex = metaLines.length;
    metaLines.push(truncate(shortRepo(repository), 28));
  }
  // Show branch on Source.Repository blocks
  const branchName = (data.branch as string) || '';
  if (isSourceRepo && branchName && repository) {
    metaLines.push(`\u2192 ${branchName}`);
  }
  if (image) metaLines.push(truncate(image, 28));

  // ── Status ──
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.active;
  const statusLabel = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
  const hasStatusLine = !!(statusLabel || estimatedCost);

  // ── Pipeline status ──
  // For Source.Repository blocks: derive aggregate status from connected services
  const aggregatePipelineStatus: NodePipelineStatus | null = (() => {
    if (isSourceRepo && connectedPipelineStatuses.length > 0) {
      // Priority: active states > failed > success > idle
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
  const metaGap = metaLines.length > 0 || hardwareLine || hasScaling || hasPipeline ? 6 : 0;
  const renamedOffset = isRenamed ? RENAMED_SUBTITLE_H : 0;
  const contentH =
    CARD_PY +
    HEADER_H +
    renamedOffset +
    metaGap +
    metaLines.length * META_LINE_H +
    (hardwareLine ? META_LINE_H : 0) +
    (hasScaling ? SCALING_ROW_H : 0) +
    (hasPipeline ? PIPELINE_ROW_H : 0) +
    (hasStatusLine ? STATUS_LINE_H : 0) +
    PAD_BOTTOM;
  const W = Math.max(width || CARD_WIDTH, CARD_WIDTH);
  const H = folded ? 38 : Math.max(height || 0, contentH, 56);

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
  // LOD TEST — bright red square when lod < 3
  // ══════════════════════════════════════════════════════════════════════════
  if (lod < 3) {
    return (
      <g data-node-id={node.id} style={{ cursor: 'move' }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        <rect
          x={x}
          y={y}
          width={100}
          height={100}
          rx={8}
          fill={lod === 1 ? 'red' : 'orange'}
          stroke="black"
          strokeWidth={2}
        />
        <text
          x={x + 50}
          y={y + 50}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={16}
          fontWeight="bold"
        >
          L{lod}
        </text>
      </g>
    );
  }

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
            rx={CARD_RADIUS + 3}
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
          rx={CARD_RADIUS}
          fill="var(--ice-bg-surface)"
          stroke={bBorder}
          strokeWidth={isSelected ? 1.5 : 1}
        />

        {/* Left accent stripe */}
        <rect x={x} y={y} width={4} height={SH} rx={2} fill={bcat.glow} opacity={0.8} />

        {/* Icon */}
        <image
          x={x + 14}
          y={y + 14}
          width={ICON_SIZE}
          height={ICON_SIZE}
          href={brandIcon?.url || providerUrl}
          preserveAspectRatio="xMidYMid meet"
        />

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
        style={{ cursor: 'move' }}
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
        <rect
          x={cx - S / 2}
          y={cy - S / 2}
          width={S}
          height={S}
          rx={10 * invScale}
          fill="var(--ice-bg-surface)"
          stroke={border}
          strokeWidth={borderW}
        />
        <image
          x={cx - iconSize / 2}
          y={cy - iconSize / 2 - 4 * invScale}
          width={iconSize}
          height={iconSize}
          href={brandIcon?.url || providerUrl}
          preserveAspectRatio="xMidYMid meet"
        />
        <circle cx={cx} cy={cy + S / 2 - 10 * invScale} r={dotR} fill={pipeColor || statusColor} opacity={0.9}>
          {pipeColor &&
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
        style={{ cursor: 'move' }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {isSelected && (
          <rect
            x={cx - CW / 2 - 3 * invScale}
            y={cy - CH / 2 - 3 * invScale}
            width={CW + 6 * invScale}
            height={CH + 6 * invScale}
            rx={(CARD_RADIUS + 2) * invScale}
            fill="none"
            stroke={cat.glow}
            strokeWidth={2 * invScale}
            opacity={0.6}
          />
        )}
        <rect
          x={cx - CW / 2}
          y={cy - CH / 2}
          width={CW}
          height={CH}
          rx={CARD_RADIUS * invScale}
          fill="var(--ice-bg-surface)"
          stroke={border}
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
        {/* Connection ports on hover */}
        {isHovered && (
          <g className="connection-ports">
            <circle
              className="connection-port"
              data-node-id={node.id}
              data-side="left"
              cx={cx - CW / 2}
              cy={cy}
              r={5 * invScale}
              fill={cat.glow}
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
              r={5 * invScale}
              fill={cat.glow}
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
      style={{ cursor: 'move' }}
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
          rx={CARD_RADIUS + 3}
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
          rx={CARD_RADIUS + 3}
          fill="none"
          stroke="#22d3ee"
          strokeWidth={2}
          strokeDasharray="6 3"
          opacity={0.8}
        />
      )}

      {/* Card background */}
      <rect
        x={x}
        y={y}
        width={W}
        height={H}
        rx={CARD_RADIUS}
        fill="var(--ice-bg-surface)"
        stroke={border}
        strokeWidth={isSelected ? 1.5 : 1}
      />

      {/* ─── Folded state ─── */}
      {folded ? (
        <g>
          <image
            x={x + CARD_PX}
            y={y + 9}
            width={ICON_SIZE}
            height={ICON_SIZE}
            href={brandIcon?.url || providerUrl}
            preserveAspectRatio="xMidYMid meet"
          />
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
          {/* ═══════ HEADER ═══════ */}

          {/* Icon */}
          <image
            x={x + CARD_PX}
            y={y + CARD_PY}
            width={ICON_SIZE}
            height={ICON_SIZE}
            href={brandIcon?.url || providerUrl}
            preserveAspectRatio="xMidYMid meet"
          />

          {/* Service name — editable on double-click */}
          {isRenaming ? (
            <foreignObject
              x={x + TEXT_X}
              y={y + CARD_PY - 2}
              width={Math.min(W - TEXT_X - CARD_PX - 40, 160)}
              height={22}
            >
              <input
                ref={renameInputRef}
                defaultValue={label || ''}
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

          {/* Type name subtitle — shown when user has renamed */}
          {isRenamed && !isRenaming && (
            <text
              x={x + TEXT_X}
              y={y + CARD_PY + 20}
              dominantBaseline="middle"
              fill="var(--ice-text-secondary)"
              fontSize="9"
              fontFamily="ui-monospace, 'SFMono-Regular', monospace"
              opacity={0.7}
              style={{ pointerEvents: 'none' }}
            >
              {blockTypeName}
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

          {/* Runtime · port — second line (shifts down when renamed) */}
          {(runtimeLabel || port) && (
            <text
              x={x + TEXT_X}
              y={y + CARD_PY + 24 + renamedOffset}
              dominantBaseline="middle"
              fill="var(--ice-text-secondary)"
              fontSize="10"
              fontFamily="ui-monospace, 'SFMono-Regular', monospace"
              style={{ pointerEvents: 'none' }}
            >
              {[runtimeLabel, port ? `:${port}` : ''].filter(Boolean).join(' \u00B7 ')}
            </text>
          )}

          {/* ═══════ METADATA LINES ═══════ */}
          {(() => {
            const metaY = y + CARD_PY + HEADER_H + renamedOffset + metaGap;
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

                  return (
                    <text
                      key={i}
                      x={x + CARD_PX}
                      y={lineY}
                      dominantBaseline="middle"
                      fill="var(--ice-text-secondary)"
                      fontSize="10"
                      fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                      opacity={isHovered ? 0.9 : 0.6}
                      style={{ pointerEvents: 'none' }}
                    >
                      {line}
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
                    {REPO_SELECTOR.LINK_REPO}
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

                {/* Hardware line (size · storage) */}
                {hardwareLine && (
                  <text
                    x={x + CARD_PX}
                    y={cursorY}
                    dominantBaseline="middle"
                    fill="var(--ice-text-secondary)"
                    fontSize="10"
                    fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                    opacity={isHovered ? 0.9 : 0.6}
                    style={{ pointerEvents: 'none' }}
                  >
                    {truncate(hardwareLine, 30)}
                  </text>
                )}
                {(() => {
                  if (hardwareLine) cursorY += META_LINE_H;
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
                    <animate attributeName="opacity" values="1;0.6;1" dur="1.5s" repeatCount="indefinite" />
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
                    {isActive && (
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

      {/* ═══════ CONNECTION PORTS (visible on hover) ═══════ */}
      {isHovered && (
        <g className="connection-ports">
          {/* Top */}
          <circle
            className="connection-port"
            data-node-id={node.id}
            data-side="top"
            cx={x + W / 2}
            cy={y}
            r={5}
            fill={cat.glow}
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
            r={5}
            fill={cat.glow}
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
            r={5}
            fill={cat.glow}
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
            r={5}
            fill={cat.glow}
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

export default SvgCompactNode;
