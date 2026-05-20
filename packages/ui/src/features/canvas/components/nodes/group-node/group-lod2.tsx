import React, { memo } from 'react';
import { GroupLabelRow } from './group-label-row';
import { hexToTint } from './helpers';
import { CORNER_RADIUS } from '../../../../../config/canvas-constants';
import { ChildExitingIndicator } from '../_shared/child-exiting-indicator';
import { DragOverGlow } from '../_shared/drag-over-glow';

interface GroupLod2Props {
  nodeId: string;
  x: number;
  y: number;
  nodeWidth: number;
  nodeHeight: number;
  label: string;
  groupColor: string;
  groupOpacity?: number;
  isSelected: boolean;
  isDragOver: boolean;
  isChildExiting: boolean;
  invZoom: number;
}

export const GroupLod2: React.FC<GroupLod2Props> = memo(
  ({
    nodeId,
    x,
    y,
    nodeWidth,
    nodeHeight,
    label,
    groupColor,
    groupOpacity,
    isSelected,
    isDragOver,
    isChildExiting,
    invZoom,
  }) => {
    const displayLabel = (label || '').length > 20 ? (label || '').slice(0, 20) + '\u2026' : label || '';
    const borderColor = isDragOver
      ? '#22c55e'
      : isChildExiting
        ? '#f97316'
        : isSelected
          ? groupColor || 'var(--ice-border-strong)'
          : groupColor || 'var(--ice-border)';

    return (
      <g className="svg-group-node lod-2" data-node-id={nodeId} style={{ cursor: 'move' }}>
        {isDragOver && (
          <DragOverGlow x={x} y={y} width={nodeWidth} height={nodeHeight} stroke="#22c55e" strokeDasharray="8 4" />
        )}
        {isChildExiting && <ChildExitingIndicator x={x} y={y} width={nodeWidth} height={nodeHeight} />}

        <rect
          x={x}
          y={y}
          width={nodeWidth}
          height={nodeHeight}
          rx={CORNER_RADIUS}
          fill={groupColor ? hexToTint(groupColor, groupOpacity ?? 0.09) : 'rgba(15, 23, 42, 0.10)'}
          stroke={borderColor}
          strokeWidth={(isDragOver || isChildExiting ? 2 : isSelected ? 1.5 : 1) * invZoom}
          strokeDasharray={isDragOver ? undefined : `${6 * invZoom} ${3 * invZoom}`}
        />

        {/* Label above box */}
        <foreignObject x={x} y={y - 20} width={nodeWidth} height={20}>
          <GroupLabelRow label={displayLabel} color={groupColor || undefined} />
        </foreignObject>
      </g>
    );
  },
);

GroupLod2.displayName = 'GroupLod2';
