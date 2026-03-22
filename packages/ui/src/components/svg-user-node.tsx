/**
 * SVG User Node — Public Traffic Indicator
 *
 * Renders a cyan user-silhouette icon above publicly-exposed entry points.
 * Draggable via internal pointer events.
 * Connection lines are rendered externally by SvgCanvas using SvgConnectionPath.
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';

/** Virtual node dimensions used for connection routing */
export const USER_NODE_WIDTH = 44;
export const USER_NODE_HEIGHT = 44;
export const USER_NODE_ID = '__user_traffic__';

interface SvgUserNodeProps {
  /** Auto-computed position (center, used as default before drag) */
  position: { x: number; y: number };
  /** Current canvas scale — needed to convert screen-px to canvas-px */
  scale?: number;
  /** Reports the current top-left position whenever it changes (for connection routing) */
  onPositionChange?: (pos: { x: number; y: number }) => void;
}

// User silhouette SVG path (head + shoulders, 24x24 viewBox)
const USER_PATH =
  'M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z';

const ICON_SIZE = 32;
const LABEL_Y_OFFSET = 28;
const CYAN = '#22d3ee';
const CYAN_DIM = 'rgba(34, 211, 238, 0.25)';

export const SvgUserNode: React.FC<SvgUserNodeProps> = memo(({ position, scale = 1, onPositionChange }) => {
  const [offset, setOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startDx: number;
    startDy: number;
  } | null>(null);

  const cx = position.x + offset.dx;
  const cy = position.y + offset.dy;

  // Report top-left corner position for connection routing
  useEffect(() => {
    onPositionChange?.({
      x: cx - USER_NODE_WIDTH / 2,
      y: cy - USER_NODE_HEIGHT / 2,
    });
  }, [cx, cy, onPositionChange]);

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      const target = e.currentTarget as SVGElement;
      target.setPointerCapture(e.pointerId);

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startDx: offset.dx,
        startDy: offset.dy,
      };
    },
    [offset],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      e.stopPropagation();

      const deltaX = (e.clientX - dragRef.current.startX) / scale;
      const deltaY = (e.clientY - dragRef.current.startY) / scale;

      setOffset({
        dx: dragRef.current.startDx + deltaX,
        dy: dragRef.current.startDy + deltaY,
      });
    },
    [scale],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
  }, []);

  return (
    <g className="user-traffic-indicator">
      {/* Invisible larger hit-area for easy grabbing */}
      <circle
        cx={cx}
        cy={cy}
        r={ICON_SIZE / 2 + 10}
        fill="transparent"
        style={{ cursor: 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* Glow circle behind icon */}
      <circle cx={cx} cy={cy} r={ICON_SIZE / 2 + 6} fill={CYAN_DIM} stroke="none" style={{ pointerEvents: 'none' }} />

      {/* Icon circle */}
      <circle
        cx={cx}
        cy={cy}
        r={ICON_SIZE / 2}
        fill="var(--ice-bg-base)"
        stroke={CYAN}
        strokeWidth={1.5}
        style={{ pointerEvents: 'none' }}
      />

      {/* User silhouette */}
      <g transform={`translate(${cx - 10}, ${cy - 10}) scale(0.833)`} style={{ pointerEvents: 'none' }}>
        <path d={USER_PATH} fill={CYAN} />
      </g>

      {/* Label */}
      <text
        x={cx}
        y={cy + LABEL_Y_OFFSET}
        textAnchor="middle"
        fill={CYAN}
        fontSize={10}
        fontWeight={600}
        fontFamily="'JetBrains Mono Variable', monospace"
        style={{ pointerEvents: 'none' }}
      >
        Public Traffic
      </text>
    </g>
  );
});

SvgUserNode.displayName = 'SvgUserNode';
