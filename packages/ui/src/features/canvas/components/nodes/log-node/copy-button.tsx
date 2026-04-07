import React, { memo } from 'react';

interface CopyButtonProps {
  onClick: (e: React.MouseEvent) => void;
}

export const CopyButton: React.FC<CopyButtonProps> = memo(({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    onMouseDown={(e) => e.stopPropagation()}
    style={{
      width: 42,
      height: 18,
      borderRadius: 4,
      border: 'none',
      background: 'var(--ice-border-strong)',
      color: 'var(--ice-text-tertiary)',
      fontSize: 9,
      fontWeight: 600,
      fontFamily: 'ui-monospace, monospace',
      cursor: 'pointer',
      opacity: 0.8,
      padding: 0,
      lineHeight: 1,
    }}
  >
    COPY
  </button>
));

CopyButton.displayName = 'CopyButton';
