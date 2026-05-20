import React, { memo } from 'react';

interface ValidationBadgeProps {
  severity: 'error' | 'warning';
  count?: number;
  small?: boolean;
  style?: React.CSSProperties;
}

const SEVERITY_COLORS = {
  error: '#ef4444',
  warning: '#f59e0b',
};

export const ValidationBadge: React.FC<ValidationBadgeProps> = memo(({ severity, count = 1, small = false, style }) => {
  const size = small ? 8 : 12;

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: SEVERITY_COLORS[severity],
        border: '1.5px solid var(--ice-bg-surface)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      {!small && count > 1 && (
        <span
          style={{
            color: '#fff',
            fontSize: 7,
            fontWeight: 700,
            fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </span>
  );
});

ValidationBadge.displayName = 'ValidationBadge';
