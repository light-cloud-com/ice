/**
 * Floating tooltip rendered near the cursor when a connection-drawing
 * drop is rejected (invalid pair, special-rule conflict, or hard
 * validation error). Sibling of `ConnectionPreviewOverlay` — lives in
 * the canvas SVG so coordinates are in canvas-space.
 *
 * The tooltip is rendered inside a foreignObject so we get HTML text
 * wrapping and styling; the wrapper is `pointer-events: none` so the
 * tooltip never blocks subsequent mouse events.
 */

import React from 'react';

export interface ConnectionRejection {
  x: number;
  y: number;
  message: string;
}

interface ConnectionRejectionOverlayProps {
  rejection: ConnectionRejection;
}

const TOOLTIP_WIDTH = 240;
const TOOLTIP_OFFSET_Y = 14;

export const ConnectionRejectionOverlay: React.FC<ConnectionRejectionOverlayProps> = ({ rejection }) => (
  <g className="connection-rejection" style={{ pointerEvents: 'none' }}>
    <foreignObject
      x={rejection.x - TOOLTIP_WIDTH / 2}
      y={rejection.y + TOOLTIP_OFFSET_Y}
      width={TOOLTIP_WIDTH}
      height={64}
    >
      <div
        data-testid="connection-rejection-tooltip"
        style={{
          background: 'rgba(220, 38, 38, 0.95)',
          color: '#fff',
          fontSize: 12,
          lineHeight: 1.35,
          padding: '6px 10px',
          borderRadius: 6,
          boxShadow: '0 4px 14px -4px rgba(0,0,0,0.35)',
          textAlign: 'center',
          maxWidth: '100%',
          boxSizing: 'border-box',
          fontWeight: 500,
        }}
      >
        {rejection.message}
      </div>
    </foreignObject>
  </g>
);

ConnectionRejectionOverlay.displayName = 'ConnectionRejectionOverlay';
