import React, { memo } from 'react';

interface CopyButtonProps {
  onClick: (e: React.MouseEvent) => void;
  /** OL7 — show a transient "COPIED" confirmation after a successful copy. */
  copied?: boolean;
}

export const CopyButton: React.FC<CopyButtonProps> = memo(({ onClick, copied = false }) => (
  <button
    type="button"
    onClick={onClick}
    onMouseDown={(e) => e.stopPropagation()}
    style={{
      width: 42,
      height: 18,
      borderRadius: 4,
      border: 'none',
      background: copied ? 'rgba(34, 197, 94, 0.18)' : 'var(--ice-border-strong)',
      color: copied ? '#22c55e' : 'var(--ice-text-tertiary)',
      fontSize: 9,
      fontWeight: 600,
      fontFamily: 'ui-monospace, monospace',
      cursor: 'pointer',
      opacity: 0.8,
      padding: 0,
      lineHeight: 1,
    }}
  >
    {copied ? 'COPIED' : 'COPY'}
  </button>
));

CopyButton.displayName = 'CopyButton';
