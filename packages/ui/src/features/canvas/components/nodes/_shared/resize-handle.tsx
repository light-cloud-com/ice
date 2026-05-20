import React, { memo } from 'react';

interface ResizeHandleProps {
  isHovered?: boolean;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = memo(({ isHovered = false }) => (
  <div
    className="resize-handle"
    style={{
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 16,
      height: 16,
      cursor: 'se-resize',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
      padding: 3,
    }}
  >
    <svg width={10} height={10} viewBox="0 0 10 10">
      <line
        x1={10}
        y1={4}
        x2={4}
        y2={10}
        stroke={isHovered ? 'var(--ice-border-strong)' : 'var(--ice-border)'}
        strokeWidth={1}
      />
      <line
        x1={10}
        y1={8}
        x2={8}
        y2={10}
        stroke={isHovered ? 'var(--ice-border-strong)' : 'var(--ice-border)'}
        strokeWidth={1}
      />
    </svg>
  </div>
));

ResizeHandle.displayName = 'ResizeHandle';
