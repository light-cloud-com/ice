import React, { memo } from 'react';
import { CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS, BRAND_ICON_SIZE } from '../../../../../config/canvas-constants';
import { ConnectionDragGlow } from '../_shared/connection-drag-glow';
import { ConnectionPorts } from '../_shared/connection-ports';
import { FONT_MONO } from '../_shared/fonts';
import { NodeHeader } from '../_shared/node-header';
import { StatusDot } from '../_shared/status-dot';
import type { NodePipelineStatus } from './types';
import type { BrandIcon } from '../../../../../assets/icons/brand-registry';

interface CompactLod2Props {
  nodeId: string;
  x: number;
  y: number;
  label: string;
  category: string;
  categoryGlow: string;
  brandIcon: BrandIcon | null;
  providerUrl: string;
  serviceLineText: string;
  statusLabel: string;
  statusColor: string;
  border: string;
  isSelected: boolean;
  isHovered: boolean;
  effectivePipelineStatus: NodePipelineStatus | null;
  connectionDragState: 'valid-target' | 'invalid-target' | 'source' | null;
  reducedMotion: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const CompactLod2: React.FC<CompactLod2Props> = memo(
  ({
    nodeId,
    x,
    y,
    label,
    category,
    categoryGlow,
    brandIcon,
    providerUrl,
    serviceLineText,
    statusLabel,
    statusColor,
    border,
    isSelected,
    isHovered,
    effectivePipelineStatus,
    connectionDragState,
    reducedMotion,
    onMouseEnter,
    onMouseLeave,
  }) => {
    const W = CARD_WIDTH;
    const H = CARD_HEIGHT;
    const isValidTarget = connectionDragState === 'valid-target';
    const truncated = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '\u2026' : s);

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
        data-node-id={nodeId}
        style={{ cursor: isValidTarget ? 'crosshair' : 'move' }}
        opacity={connectionDragState === 'invalid-target' ? 0.3 : 1}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {isValidTarget && <ConnectionDragGlow x={x} y={y} width={W} height={H} reducedMotion={reducedMotion} />}

        <foreignObject x={x} y={y} width={W} height={H}>
          <div
            style={{
              width: W,
              height: H,
              background: 'var(--ice-bg-raised)',
              border: `1px solid ${isValidTarget ? '#22c55e' : border}`,
              borderRadius: CORNER_RADIUS,
              display: 'flex',
              flexDirection: 'column',
              padding: '10px 12px',
              boxSizing: 'border-box',
              overflow: 'hidden',
              boxShadow: isSelected
                ? `0 0 0 1.5px ${categoryGlow}, 0 4px 14px -4px ${categoryGlow}33`
                : isHovered
                  ? '0 2px 8px -2px rgba(0,0,0,0.15)'
                  : '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            {/* Header: category icon + label */}
            <NodeHeader category={category} categoryColor={categoryGlow} label={label} maxChars={20} />

            {/* Service line: brand icon + service name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              {(brandIcon || providerUrl) && (
                <img
                  src={brandIcon?.url || providerUrl}
                  alt=""
                  width={BRAND_ICON_SIZE}
                  height={BRAND_ICON_SIZE}
                  style={{ objectFit: 'contain', flexShrink: 0 }}
                  draggable={false}
                />
              )}
              {serviceLineText && (
                <span
                  style={{
                    color: 'var(--ice-text-secondary)',
                    fontSize: 10,
                    fontFamily: FONT_MONO,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {truncated(serviceLineText, 24)}
                </span>
              )}
            </div>

            <div style={{ flex: 1 }} />

            {/* Status dot + label */}
            {statusLabel && <StatusDot color={pipeColor || statusColor} label={statusLabel} radius={4} />}
          </div>
        </foreignObject>

        {(isHovered || isValidTarget) && (
          <ConnectionPorts
            nodeId={nodeId}
            x={x}
            y={y}
            width={W}
            height={H}
            color={categoryGlow}
            isValidTarget={isValidTarget}
          />
        )}
      </g>
    );
  },
);

CompactLod2.displayName = 'CompactLod2';
