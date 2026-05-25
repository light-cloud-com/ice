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

        {/* Solid frame border — Blender-style. Drag-over still falls
            back to dashed so the drop affordance is unambiguous. */}
        <rect
          x={x}
          y={y}
          width={nodeWidth}
          height={nodeHeight}
          rx={CORNER_RADIUS}
          fill={groupTint}
          stroke={getBorderColor()}
          strokeWidth={isSelected ? 1.5 : 1}
          strokeDasharray={isDragOver ? '8 4' : undefined}
          strokeOpacity={0.85}
        />

        {/* Label tab — anchored top-left, flush against the border, with
            child-count badge. The fold chevron sits at the tab's right edge. */}
        <foreignObject x={x + 8} y={y - 18} width={nodeWidth - 16} height={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <GroupLabelRow label={displayLabel} color={userColor} childCount={childCount} />
            <span style={{ flex: 1 }} />
            <FoldButton folded={folded} onClick={onToggleFold} opacity={isHovered ? 0.95 : 0.6} />
          </div>
        </foreignObject>

        {/* Empty state — label is now a tab outside the body, so the
            empty hint centers within the full frame. */}
        {!folded && childCount === 0 && (
          <foreignObject x={x} y={y} width={nodeWidth} height={nodeHeight}>
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
