import React, { memo } from 'react';
import { CORNER_RADIUS } from '../../../../../config/canvas-constants';
import { DragOverGlow } from '../_shared/drag-over-glow';
import { ChildExitingIndicator } from '../_shared/child-exiting-indicator';
import { GroupLabelRow } from './group-label-row';
import { hexToTint } from './helpers';

interface GroupLod1Props {
  nodeId: string;
  x: number;
  y: number;
  nodeWidth: number;
  nodeHeight: number;
  label: string;
  displayLabel: string;
  groupColor: string;
  groupOpacity?: number;
  isDragOver: boolean;
  isChildExiting: boolean;
  invZoom: number;
}

export const GroupLod1: React.FC<GroupLod1Props> = memo(
  ({ nodeId, x, y, nodeWidth, nodeHeight, label, displayLabel, groupColor, groupOpacity, isDragOver, isChildExiting, invZoom }) => {
    const borderColor = isDragOver ? '#22c55e' : isChildExiting ? '#f97316' : groupColor || 'var(--ice-border)';

    return (
      <g className="svg-group-node lod-1" data-node-id={nodeId} style={{ cursor: 'move' }}>
        {isDragOver && <DragOverGlow x={x} y={y} width={nodeWidth} height={nodeHeight} stroke="#22c55e" strokeDasharray="8 4" />}
        {isChildExiting && <ChildExitingIndicator x={x} y={y} width={nodeWidth} height={nodeHeight} />}

        <rect
          x={x} y={y} width={nodeWidth} height={nodeHeight} rx={CORNER_RADIUS}
          fill={groupColor ? hexToTint(groupColor, groupOpacity ?? 0.12) : 'rgba(15, 23, 42, 0.15)'}
          stroke={borderColor}
          strokeWidth={(isDragOver || isChildExiting ? 2 : 1.5) * invZoom}
          strokeDasharray={isDragOver ? undefined : `${6 * invZoom} ${3 * invZoom}`}
          opacity={isDragOver || isChildExiting ? 1 : 0.7}
        />

        {/* Label above box */}
        {label && (
          <foreignObject x={x} y={y - 20} width={nodeWidth} height={20}>
            <GroupLabelRow label={displayLabel} color={groupColor || undefined} />
          </foreignObject>
        )}
      </g>
    );
  },
);

GroupLod1.displayName = 'GroupLod1';
