import React, { memo } from 'react';
import { CORNER_RADIUS } from '../../../../../config/canvas-constants';
import { ChildExitingIndicator } from '../_shared/child-exiting-indicator';
import { CostLabel } from '../_shared/cost-label';
import { DragOverGlow } from '../_shared/drag-over-glow';
import { EmptyStateText } from '../_shared/empty-state-text';
import { FoldButton } from '../_shared/fold-button';
import { ResizeHandle } from '../_shared/resize-handle';
import { SelectionRing } from '../_shared/selection-ring';
import type { BlockNodeProps } from './types';

const FONT = "'JetBrains Mono Variable', monospace";
const FONT_MONO = "ui-monospace, 'SFMono-Regular', monospace";
const ACCENT_BAR_WIDTH = 4;

export const BlockNode: React.FC<BlockNodeProps> = memo(
  ({
    node,
    x,
    y,
    nodeWidth,
    nodeHeight,
    displayLabel,
    folded,
    childCount,
    accentColor,
    blockIcon,
    isSelected,
    isHovered,
    isDragOver,
    isDragging,
    isChildExiting,
    onMouseEnter,
    onMouseLeave,
    onToggleFold,
  }) => {
    const estimatedCost = (node.data?.estimatedCost as string) || '';

    const getBorderColor = () => {
      if (isChildExiting) return '#f97316';
      if (isDragOver) return '#22c55e';
      if (isSelected || isHovered) return 'var(--ice-border-strong)';
      return accentColor + '40';
    };

    return (
      <g
        className="svg-block-node"
        data-node-id={node.id}
        style={{ cursor: 'move', opacity: isDragging ? 0.85 : 1 }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {isSelected && (
          <SelectionRing x={x} y={y} width={nodeWidth} height={nodeHeight} stroke={accentColor} padding={2} />
        )}
        {isDragOver && (
          <DragOverGlow x={x} y={y} width={nodeWidth} height={nodeHeight} stroke="#22c55e" strokeDasharray="8 4" />
        )}
        {isChildExiting && <ChildExitingIndicator x={x} y={y} width={nodeWidth} height={nodeHeight} />}

        <foreignObject x={x} y={y} width={nodeWidth} height={nodeHeight}>
          <div
            style={{
              width: nodeWidth,
              height: nodeHeight,
              background: 'rgba(15, 23, 42, 0.55)',
              border: `${isSelected ? 1.5 : 1}px solid ${getBorderColor()}`,
              borderRadius: CORNER_RADIUS,
              boxSizing: 'border-box',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }}
          >
            {/* Accent bar */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: ACCENT_BAR_WIDTH,
                height: '100%',
                background: accentColor,
                borderRadius: `${CORNER_RADIUS}px 0 0 ${CORNER_RADIUS}px`,
              }}
            />

            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: `10px 12px 10px ${ACCENT_BAR_WIDTH + 8}px`,
                borderBottom: folded ? 'none' : '0.5px solid var(--ice-border-strong)',
              }}
            >
              {blockIcon && (
                <img
                  src={blockIcon.icon}
                  alt=""
                  width={16}
                  height={16}
                  style={{ objectFit: 'contain', flexShrink: 0, opacity: 0.9 }}
                  draggable={false}
                />
              )}
              <span
                style={{
                  color: 'var(--ice-text-primary)',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: FONT,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {displayLabel}
              </span>
              {childCount > 0 && (
                <span
                  style={{
                    color: accentColor,
                    fontSize: 10,
                    fontWeight: 500,
                    fontFamily: FONT_MONO,
                    opacity: 0.7,
                    flexShrink: 0,
                  }}
                >
                  {childCount}
                </span>
              )}
              <FoldButton folded={folded} onClick={onToggleFold} opacity={isHovered ? 0.8 : 0.4} />
            </div>

            {/* Body */}
            {!folded && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {childCount === 0 && <EmptyStateText />}

                {/* Cost */}
                {estimatedCost && (
                  <div style={{ position: 'absolute', bottom: 8, right: 12 }}>
                    <CostLabel cost={estimatedCost} />
                  </div>
                )}

                {/* Resize handle */}
                <ResizeHandle isHovered={isHovered} />
              </div>
            )}
          </div>
        </foreignObject>
      </g>
    );
  },
);

BlockNode.displayName = 'BlockNode';
