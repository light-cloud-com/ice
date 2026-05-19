import React, { memo } from 'react';

type Side = 'top' | 'right' | 'bottom' | 'left';

interface ConnectionPortsProps {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isValidTarget?: boolean;
  /**
   * Overall port opacity. CardShell sets this to make ports always
   * visible (faintly) at idle, brighten on hover/selection, and fade
   * out when this block is an invalid drop target during a drag.
   * Defaults to 1 so callers that don't set it (tests, legacy paths)
   * still see fully-opaque ports.
   */
  opacity?: number;
  /** Which sides to render ports on (default: all four) */
  sides?: Side[];
}

function portPosition(side: string, x: number, y: number, w: number, h: number) {
  switch (side) {
    case 'top':
      return { cx: x + w / 2, cy: y };
    case 'right':
      return { cx: x + w, cy: y + h / 2 };
    case 'bottom':
      return { cx: x + w / 2, cy: y + h };
    case 'left':
    default:
      return { cx: x, cy: y + h / 2 };
  }
}

export const ConnectionPorts: React.FC<ConnectionPortsProps> = memo(
  ({
    nodeId,
    x,
    y,
    width,
    height,
    color,
    isValidTarget = false,
    opacity = 1,
    sides = ['top', 'right', 'bottom', 'left'],
  }) => (
    <g className="connection-ports" style={{ opacity, transition: 'opacity 120ms ease' }}>
      {sides.map((side) => {
        const pos = portPosition(side, x, y, width, height);
        return (
          <circle
            key={side}
            className="connection-port"
            data-node-id={nodeId}
            data-side={side}
            cx={pos.cx}
            cy={pos.cy}
            r={isValidTarget ? 6 : 5}
            fill={isValidTarget ? '#22c55e' : color}
            stroke="var(--ice-bg-base)"
            strokeWidth={2}
            style={{ cursor: 'crosshair' }}
          />
        );
      })}
    </g>
  ),
);

ConnectionPorts.displayName = 'ConnectionPorts';
