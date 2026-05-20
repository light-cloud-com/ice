import React, { memo } from 'react';
import { GroupLabelRow } from './group-label-row';
import { CORNER_RADIUS } from '../../../../../config/canvas-constants';
import { t } from '../../../../../i18n';
import { ChildExitingIndicator } from '../_shared/child-exiting-indicator';
import { DragOverGlow } from '../_shared/drag-over-glow';
import { EmptyStateText } from '../_shared/empty-state-text';
import { FoldButton } from '../_shared/fold-button';
import { ResizeHandle } from '../_shared/resize-handle';
import { SelectionRing } from '../_shared/selection-ring';

interface GroupLod3Props {
  nodeId: string;
  x: number;
  y: number;
  nodeWidth: number;
  nodeHeight: number;
  displayLabel: string;
  folded: boolean;
  childCount: number;
  userColor?: string;
  groupBorderColor: string;
  groupTint: string;
  labelColor: string;
  isSelected: boolean;
  isHovered: boolean;
  isDragOver: boolean;
  isChildExiting: boolean;
  connectionDragState: 'valid-target' | 'invalid-target' | 'source' | null;
  isDragging: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleFold: (e: React.MouseEvent) => void;
}

export const GroupLod3: React.FC<GroupLod3Props> = memo(
  ({
    nodeId,
    x,
    y,
    nodeWidth,
    nodeHeight,
    displayLabel,
    folded,
    childCount,
    userColor,
    groupBorderColor,
    groupTint,
    isSelected,
    isHovered,
    isDragOver,
    isChildExiting,
    connectionDragState,
    isDragging,
    onMouseEnter,
    onMouseLeave,
    onToggleFold,
  }) => {
    const getBorderColor = () => {
      if (isChildExiting) return '#f97316';
      if (isDragOver) return '#22c55e';
      if (isSelected || isHovered) return 'var(--ice-text-secondary)';
      return groupBorderColor;
    };

    return (
      <g
        className="svg-group-node"
        data-node-id={nodeId}
        style={{ cursor: 'move', opacity: connectionDragState === 'invalid-target' ? 0.3 : isDragging ? 0.85 : 1 }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {isSelected && (
          <SelectionRing
            x={x}
            y={y}
            width={nodeWidth}
            height={nodeHeight}
            stroke="var(--ice-text-secondary)"
            padding={2}
          />
        )}
        {isDragOver && (
          <DragOverGlow x={x} y={y} width={nodeWidth} height={nodeHeight} stroke="#22c55e" strokeDasharray="8 4" />
        )}
        {isChildExiting && <ChildExitingIndicator x={x} y={y} width={nodeWidth} height={nodeHeight} />}

        {/* Dashed border body */}
        <rect
          x={x}
          y={y}
          width={nodeWidth}
          height={nodeHeight}
          rx={CORNER_RADIUS}
          fill={groupTint}
          stroke={getBorderColor()}
          strokeWidth={isSelected ? 1.5 : 1}
          strokeDasharray={isDragOver ? undefined : '4 4'}
          strokeOpacity={0.6}
        />

        {/* Label row above box + fold chevron */}
        <foreignObject x={x} y={y} width={nodeWidth} height={22}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
            <div style={{ flex: 1 }}>
              <GroupLabelRow label={displayLabel} color={userColor} childCount={childCount} />
            </div>
            <FoldButton folded={folded} onClick={onToggleFold} opacity={isHovered ? 0.8 : 0.4} />
          </div>
        </foreignObject>

        {/* Empty state */}
        {!folded && childCount === 0 && (
          <foreignObject x={x} y={y + 24} width={nodeWidth} height={nodeHeight - 24}>
            <EmptyStateText text={t('canvas.nodes.dropHere')} />
          </foreignObject>
        )}

        {/* Resize handle */}
        {!folded && (
          <foreignObject x={x + nodeWidth - 16} y={y + nodeHeight - 16} width={16} height={16}>
            <ResizeHandle isHovered={isHovered} />
          </foreignObject>
        )}
      </g>
    );
  },
);

GroupLod3.displayName = 'GroupLod3';
