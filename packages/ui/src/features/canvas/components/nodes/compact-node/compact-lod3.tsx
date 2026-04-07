import React, { memo } from 'react';
import { ConnectedPipelineDots } from './connected-pipeline-dots';
import { MetadataLines } from './metadata-lines';
import { PipelineRow } from './pipeline-row';
import { ScalingRow } from './scaling-row';
import { ServiceLine } from './service-line';
import { StatusCostLine } from './status-cost-line';
import { CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS, CARD_PX } from '../../../../../config/canvas-constants';
import { ConnectionDragGlow } from '../_shared/connection-drag-glow';
import { ConnectionPorts } from '../_shared/connection-ports';
import { DragOverGlow } from '../_shared/drag-over-glow';
import { FoldButton } from '../_shared/fold-button';
import { FONT_MONO } from '../_shared/fonts';
import { NodeHeader } from '../_shared/node-header';
import { ProviderPill } from '../_shared/provider-pill';
import { SelectionRing } from '../_shared/selection-ring';
import { ValidationBadge } from '../_shared/validation-badge';
import type { NodePipelineStatus } from './types';
import type { BrandIcon } from '../../../../../assets/icons/brand-registry';
import type { CanvasNode } from '../../svg-canvas';

interface CompactLod3Props {
  node: CanvasNode;
  x: number;
  y: number;
  label: string;
  category: string;
  categoryGlow: string;
  provider: string;
  brandIcon: BrandIcon | null;
  providerUrl: string;
  serviceLineText: string;
  runtimeLabel: string;
  metaLines: string[];
  repoLineIndex: number;
  isSourceRepo: boolean;
  repository: string;
  statusLabel: string;
  statusColor: string;
  estimatedCost: string;
  border: string;
  isSelected: boolean;
  isHovered: boolean;
  isDragOver: boolean;
  folded: boolean;
  hasScaling: boolean;
  minInstances: number | null;
  maxInstances: number | null;
  activeInstances: number | null;
  effectivePipelineStatus: NodePipelineStatus | null;
  connectedPipelineStatuses: NodePipelineStatus[];
  connectionDragState: 'valid-target' | 'invalid-target' | 'source' | null;
  validationSeverity: 'error' | 'warning' | 'info' | null;
  validationCount: number;
  reducedMotion: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleFold: (e: React.MouseEvent) => void;
  onDoubleClickLabel?: () => void;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  onPipelineClick?: (nodeId: string) => void;
}

export const CompactLod3: React.FC<CompactLod3Props> = memo(
  ({
    node, x, y, label, category, categoryGlow, provider, brandIcon, providerUrl,
    serviceLineText, runtimeLabel, metaLines, repoLineIndex, isSourceRepo, repository,
    statusLabel, statusColor, estimatedCost, border, isSelected, isHovered, isDragOver,
    folded, hasScaling, minInstances, maxInstances, activeInstances,
    effectivePipelineStatus, connectedPipelineStatuses, connectionDragState,
    validationSeverity, validationCount, reducedMotion,
    onMouseEnter, onMouseLeave, onToggleFold, onDoubleClickLabel, onUpdateData, onPipelineClick,
  }) => {
    const W = CARD_WIDTH;
    const H = folded ? 38 : CARD_HEIGHT;
    const isValidTarget = connectionDragState === 'valid-target';
    const hasPipeline = effectivePipelineStatus && effectivePipelineStatus.status !== 'idle';
    const hasStatusLine = !!(statusLabel || estimatedCost);

    const headerTrailing = folded ? (
      <>
        {runtimeLabel && (
          <span style={{ color: 'var(--ice-text-secondary)', fontSize: 9, fontFamily: FONT_MONO, flexShrink: 0 }}>
            {runtimeLabel.length > 10 ? runtimeLabel.slice(0, 10) + '\u2026' : runtimeLabel}
          </span>
        )}
        <FoldButton folded onClick={onToggleFold} opacity={isHovered ? 0.8 : 0.4} />
      </>
    ) : (
      provider ? <ProviderPill provider={provider} /> : undefined
    );

    return (
      <g
        className="svg-compact-node"
        data-node-id={node.id}
        style={{ cursor: isValidTarget ? 'crosshair' : 'move' }}
        opacity={connectionDragState === 'invalid-target' ? 0.3 : 1}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {isSelected && <SelectionRing x={x} y={y} width={W} height={H} stroke={categoryGlow} />}
        {isDragOver && <DragOverGlow x={x} y={y} width={W} height={H} />}
        {isValidTarget && <ConnectionDragGlow x={x} y={y} width={W} height={H} reducedMotion={reducedMotion} />}

        <foreignObject x={x} y={y} width={W} height={H}>
          <div
            style={{
              width: W,
              height: H,
              background: 'var(--ice-bg-surface)',
              border: `${isSelected ? 1.5 : 1}px solid ${isValidTarget ? '#22c55e' : border}`,
              borderRadius: CORNER_RADIUS,
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              overflow: 'hidden',
              position: 'relative',
              padding: folded ? '0 12px' : `10px ${CARD_PX}px 0`,
              justifyContent: folded ? 'center' : undefined,
            }}
          >
            <NodeHeader
              category={category}
              categoryColor={categoryGlow}
              label={label}
              onDoubleClickLabel={onDoubleClickLabel}
              trailing={headerTrailing}
            />

            {!folded && (
              <>
                <ServiceLine brandIcon={brandIcon} providerUrl={providerUrl} serviceLineText={serviceLineText} />

                <MetadataLines
                  metaLines={metaLines}
                  repoLineIndex={repoLineIndex}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  isSourceRepo={isSourceRepo}
                  repository={repository}
                  nodeId={node.id}
                  onUpdateData={onUpdateData}
                />

                {hasScaling && (
                  <ScalingRow
                    nodeId={node.id}
                    minInstances={minInstances}
                    maxInstances={maxInstances}
                    activeInstances={activeInstances}
                    onUpdateData={onUpdateData}
                  />
                )}

                {hasPipeline && effectivePipelineStatus && (
                  <PipelineRow
                    status={effectivePipelineStatus}
                    reducedMotion={reducedMotion}
                    onClick={(e) => { e.stopPropagation(); onPipelineClick?.(node.id); }}
                  />
                )}

                {isSourceRepo && connectedPipelineStatuses.length > 0 && !hasPipeline && (
                  <ConnectedPipelineDots statuses={connectedPipelineStatuses} />
                )}

                {hasStatusLine && (
                  <StatusCostLine statusLabel={statusLabel} statusColor={statusColor} estimatedCost={estimatedCost} />
                )}

                <div style={{ position: 'absolute', top: 4, right: 4 }}>
                  <FoldButton folded={false} onClick={onToggleFold} opacity={isHovered ? 0.7 : 0} />
                </div>
              </>
            )}

            {validationSeverity && validationSeverity !== 'info' && (
              <div style={{ position: 'absolute', top: -2, right: -2 }}>
                <ValidationBadge severity={validationSeverity} count={validationCount} small={folded} />
              </div>
            )}
          </div>
        </foreignObject>

        {(isHovered || isValidTarget) && (
          <ConnectionPorts nodeId={node.id} x={x} y={y} width={W} height={H} color={categoryGlow} isValidTarget={isValidTarget} />
        )}
      </g>
    );
  },
);

CompactLod3.displayName = 'CompactLod3';
