import { Check, X } from 'lucide-react';
import React from 'react';
import type { GhostNode } from '../../../../store/slices/ghost-slice';

interface SvgGhostNodeProps {
  ghost: GhostNode;
  onAccept: (ghost: GhostNode) => void;
  onDismiss: (ghostId: string) => void;
}

const WIDTH = 180;
const HEIGHT = 52;

export const SvgGhostNode: React.FC<SvgGhostNodeProps> = ({ ghost, onAccept, onDismiss }) => {
  const { position, label, iceType, id } = ghost;

  return (
    <g
      transform={`translate(${position.x}, ${position.y})`}
      style={{ opacity: 0.45, cursor: 'pointer' }}
      className="ice-ghost-node"
      data-ghost-id={id}
    >
      <rect
        width={WIDTH}
        height={HEIGHT}
        rx={8}
        ry={8}
        fill="var(--ice-surface, #1f2937)"
        stroke="var(--ice-text-3, #9ca3af)"
        strokeWidth={1.5}
        strokeDasharray="6 3"
      />

      <text
        x={14}
        y={22}
        fill="var(--ice-text-2, #d1d5db)"
        fontSize={12}
        fontWeight={500}
      >
        {label}
      </text>

      <text x={14} y={40} fill="var(--ice-text-3, #9ca3af)" fontSize={10}>
        {iceType}
      </text>

      {/* Accept button */}
      <g
        transform={`translate(${WIDTH - 52}, ${HEIGHT / 2 - 11})`}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation();
          onAccept(ghost);
        }}
      >
        <rect
          width={22}
          height={22}
          rx={4}
          ry={4}
          fill="rgba(16, 185, 129, 0.2)"
          stroke="rgb(16, 185, 129)"
          strokeWidth={1}
        />
        <foreignObject x={3} y={3} width={16} height={16}>
          <Check size={16} color="rgb(16, 185, 129)" />
        </foreignObject>
      </g>

      {/* Dismiss button */}
      <g
        transform={`translate(${WIDTH - 26}, ${HEIGHT / 2 - 11})`}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(id);
        }}
      >
        <rect
          width={22}
          height={22}
          rx={4}
          ry={4}
          fill="rgba(239, 68, 68, 0.15)"
          stroke="rgb(239, 68, 68)"
          strokeWidth={1}
        />
        <foreignObject x={3} y={3} width={16} height={16}>
          <X size={16} color="rgb(239, 68, 68)" />
        </foreignObject>
      </g>
    </g>
  );
};

export const GHOST_NODE_WIDTH = WIDTH;
export const GHOST_NODE_HEIGHT = HEIGHT;
