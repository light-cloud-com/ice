import React, { memo } from 'react';
import { t } from '../../../../../i18n';
import { CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS } from '../../../../../config/canvas-constants';
import { ConnectionDragGlow } from '../_shared/connection-drag-glow';
import { ConnectionPorts } from '../_shared/connection-ports';
import { SelectionRing } from '../_shared/selection-ring';
import type { NodePipelineStatus } from './types';

interface CompactLod1Props {
  nodeId: string;
  x: number;
  y: number;
  label: string;
  brandIconUrl: string | undefined;
  providerUrl: string;
  isSelected: boolean;
  isHovered: boolean;
  statusColor: string;
  categoryGlow: string;
  border: string;
  effectivePipelineStatus: NodePipelineStatus | null;
  connectionDragState: 'valid-target' | 'invalid-target' | 'source' | null;
  reducedMotion: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const CompactLod1: React.FC<CompactLod1Props> = memo(
  ({
    nodeId,
    x,
    y,
    label,
    brandIconUrl,
    providerUrl,
    isSelected,
    isHovered,
    statusColor,
    categoryGlow,
    border,
    effectivePipelineStatus,
    connectionDragState,
    reducedMotion,
    onMouseEnter,
    onMouseLeave,
  }) => {
    const W = CARD_WIDTH;
    const H = CARD_HEIGHT;
    const isValidTarget = connectionDragState === 'valid-target';

    const pipeColor = effectivePipelineStatus
      ? effectivePipelineStatus.status === 'success'
        ? '#22c55e'
        : effectivePipelineStatus.status === 'failed'
          ? '#ef4444'
          : '#3b82f6'
      : null;

    const dotColor = pipeColor || statusColor;
    const dotAnimate =
      !!pipeColor &&
      !reducedMotion &&
      effectivePipelineStatus?.status !== 'success' &&
      effectivePipelineStatus?.status !== 'failed';

    return (
      <g
        className="svg-compact-node lod-1"
        data-node-id={nodeId}
        style={{ cursor: isValidTarget ? 'crosshair' : 'move' }}
        opacity={connectionDragState === 'invalid-target' ? 0.3 : 1}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {isSelected && <SelectionRing x={x} y={y} width={W} height={H} stroke={categoryGlow} />}
        {isValidTarget && <ConnectionDragGlow x={x} y={y} width={W} height={H} reducedMotion={reducedMotion} />}

        <foreignObject x={x} y={y} width={W} height={H}>
          <div
            style={{
              width: W,
              height: H,
              background: 'var(--ice-bg-surface)',
              border: `${isSelected ? 2 : 1}px solid ${isValidTarget ? '#22c55e' : border}`,
              borderRadius: CORNER_RADIUS,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            {/* Large centered icon */}
            <img
              src={brandIconUrl || providerUrl}
              alt={label || t('canvas.nodes.resource')}
              width={56}
              height={56}
              style={{ objectFit: 'contain' }}
              draggable={false}
            />

            {/* Label */}
            <span
              style={{
                color: 'var(--ice-text-primary)',
                fontSize: 16,
                fontWeight: 600,
                fontFamily: "'JetBrains Mono Variable', monospace",
                textAlign: 'center',
                maxWidth: W - 24,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {label || ''}
            </span>

            {/* Status dot */}
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: dotColor,
                opacity: 0.9,
                flexShrink: 0,
                animation: dotAnimate ? 'pulse-opacity 1.2s ease-in-out infinite' : undefined,
              }}
            />
          </div>
        </foreignObject>

        {/* Connection ports (SVG) */}
        {(isHovered || isValidTarget) && (
          <ConnectionPorts
            nodeId={nodeId}
            x={x}
            y={y}
            width={W}
            height={H}
            color={categoryGlow}
            isValidTarget={isValidTarget}
            sides={['left', 'right']}
          />
        )}
      </g>
    );
  },
);

CompactLod1.displayName = 'CompactLod1';
