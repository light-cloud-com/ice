import React, { memo } from 'react';

interface FoldButtonProps {
  folded: boolean;
  onClick: (e: React.MouseEvent) => void;
  opacity?: number;
}

export const FoldButton: React.FC<FoldButtonProps> = memo(({ folded, onClick, opacity = 0.4 }) => (
  <button
    type="button"
    onClick={onClick}
    onMouseDown={(e) => e.stopPropagation()}
    style={{
      width: 18,
      height: 18,
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      opacity,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      flexShrink: 0,
    }}
  >
    <svg width={12} height={12} viewBox="0 0 12 12">
      {folded ? (
        <path
          d="M4 2 l4 4 -4 4"
          fill="none"
          stroke="var(--ice-text-tertiary)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M2 4 l4 4 4 -4"
          fill="none"
          stroke="var(--ice-text-tertiary)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  </button>
));

FoldButton.displayName = 'FoldButton';
