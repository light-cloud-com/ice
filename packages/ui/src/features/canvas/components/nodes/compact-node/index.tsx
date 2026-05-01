/**
 * SVG Compact Node — Clean Linear/Figma-style Infrastructure Card
 *
 * Orchestrates LOD views and block summary card.
 * Subcomponents handle individual visual layers.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { BlockSummaryCard } from './block-summary-card';
import { CompactLod1 } from './compact-lod1';
import { CompactLod3 } from './compact-lod3';
import { getContextLines } from './context-lines';
import { getIcon, DEFAULT_ICON, type Provider } from '../../../../../assets/icons';
import { getBrandIcon, type BrandIcon } from '../../../../../assets/icons/brand-registry';
import { getServiceName } from '../../../../../assets/icons/service-names';
import { CARD_WIDTH, CARD_HEIGHT, STATUS_COLORS, CATEGORY_STYLE } from '../../../../../config/canvas-constants';
import { useReducedMotion } from '../../../../../shared/hooks/use-reduced-motion';
import type { SvgCompactNodeProps, NodePipelineStatus } from './types';

// ─── Exported height/width calculators ──────────────────────────────────────

export function computeCompactNodeHeight(
  _data: Record<string, unknown>,
  _isBlock: boolean,
  _hasPipeline = false,
): number {
  return CARD_HEIGHT;
}

export function computeCompactNodeWidth(_isBlock: boolean): number {
  return CARD_WIDTH;
}

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
  onRenameCommit: _onRenameCommit,
  onRenameCancel: _onRenameCancel,
  onUpdateData,
  pipelineStatus,
  onPipelineClick,
  connectedPipelineStatuses = [],
  lod = 3,
  zoom: _zoom = 1,
  connectionDragState = null,
  validationSeverity = null,
  validationCount = 0,
}) => {
  const reducedMotion = useReducedMotion();
  const { x, y, data, label } = node;
  const [isHovered, setIsHovered] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // ── Data extraction ──
  const iceType = (data.iceType as string) || '';
  const category = iceType.split('.')[0] || 'default';
  const provider = (data.provider as string) || '';
  const runtime = (data.runtime as string) || '';
  const folded = (data.folded as boolean) || false;
  const repository = (data.repository as string) || (data.github as string) || (data.repo as string) || '';
  const version = (data.version as string) || '';
  const estimatedCost = (data.estimatedCost as string) || '';
  // `deploy_status` is the single source of truth for the deploy pill.
  // The legacy `data.status` fallback was dropped per the
  // `one-status-source-deploy-status` learning — every node-creation site
  // (waf blocks, expand-blueprint, expand-template, drop handlers,
  // group/undo-redo, drift-check writes) now writes to `deploy_status`
  // when applicable, or stays empty when the block hasn't been deployed.
  const status = (data.deploy_status as string) || '';

  const isSourceRepo = (data.iceType as string) === 'Source.Repository' || data.behavior === 'source';

  // ── Scaling ──
  const minInstances = data.minInstances != null ? Number(data.minInstances) : null;
  const maxInstances = data.maxInstances != null ? Number(data.maxInstances) : null;
  const activeInstances = data.activeInstances != null ? Number(data.activeInstances) : null;
  const hasScaling = minInstances != null || maxInstances != null;

  // ── Icons ──
  const brandIcon: BrandIcon | null = getBrandIcon(runtime) || getBrandIcon(iceType) || getBrandIcon(label);
  const providerIcon = getIcon(iceType, (provider?.toLowerCase() || 'aws') as Provider);
  const providerUrl = providerIcon?.icon || DEFAULT_ICON;

  // ── Service name ──
  const serviceName = getServiceName(iceType, provider || 'aws');
  const runtimeLabel = runtime || version || '';
  const dedupedRuntime = (() => {
    if (!serviceName || !runtimeLabel) return runtimeLabel;
    const shortName = serviceName.split(' ').pop() || '';
    if (runtimeLabel === shortName) return '';
    if (runtimeLabel.startsWith(shortName + ' ')) return runtimeLabel.slice(shortName.length + 1);
    return runtimeLabel;
  })();
  const serviceLineText = [serviceName, dedupedRuntime].filter(Boolean).join(' \u00B7 ');

  // ── Context-aware metadata ──
  const { lines: metaLines, repoLineIndex } = getContextLines(data, iceType);

  // ── Status ──
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.active;
  const statusLabel = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';

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

  // ── Colors ──
  const cat = CATEGORY_STYLE[category] || CATEGORY_STYLE.default;
  const border = isDragOver ? '#22d3ee' : isSelected || isHovered ? cat.glow : cat.glow + '55';

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

  // ── Block Summary Card ──
  if (isBlockSummary) {
    return (
      <BlockSummaryCard
        node={node}
        isSelected={isSelected}
        isHovered={isHovered}
        childNodes={childNodes}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onDoubleClickLabel={onDoubleClickLabel}
      />
    );
  }

  if (lod >= 3) {
    // ── LOD 3 ──
    return (
      <CompactLod3
        node={node}
        x={x}
        y={y}
        label={label || ''}
        category={category}
        categoryGlow={cat.glow}
        provider={provider}
        brandIcon={brandIcon}
        providerUrl={providerUrl}
        serviceLineText={serviceLineText}
        runtimeLabel={runtimeLabel}
        metaLines={metaLines}
        repoLineIndex={repoLineIndex}
        isSourceRepo={isSourceRepo}
        repository={repository}
        statusLabel={statusLabel}
        statusColor={statusColor}
        estimatedCost={estimatedCost}
        border={border}
        isSelected={isSelected}
        isHovered={isHovered}
        isDragOver={isDragOver}
        folded={folded}
        hasScaling={hasScaling}
        minInstances={minInstances}
        maxInstances={maxInstances}
        activeInstances={activeInstances}
        effectivePipelineStatus={effectivePipelineStatus}
        connectedPipelineStatuses={connectedPipelineStatuses}
        connectionDragState={connectionDragState}
        validationSeverity={validationSeverity}
        validationCount={validationCount}
        reducedMotion={reducedMotion}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onToggleFold={handleFold}
        onDoubleClickLabel={onDoubleClickLabel}
        onUpdateData={onUpdateData}
        onPipelineClick={onPipelineClick}
      />
    );
  } else {
    return (
      <CompactLod1
        nodeId={node.id}
        x={x}
        y={y}
        label={label || ''}
        brandIconUrl={brandIcon?.url}
        providerUrl={providerUrl}
        isSelected={isSelected}
        isHovered={isHovered}
        statusColor={statusColor}
        categoryGlow={cat.glow}
        border={border}
        effectivePipelineStatus={effectivePipelineStatus}
        connectionDragState={connectionDragState}
        reducedMotion={reducedMotion}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      />
    );
  }
};

SvgCompactNode.displayName = 'SvgCompactNode';

// ─── Re-exports ────────────────────────────────────────────────────────────

export { BLOCK_SUMMARY_H, BLOCK_SUMMARY_W } from './block-summary-card';
export type { NodePipelineStatus, SvgCompactNodeProps } from './types';
