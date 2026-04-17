import React, { memo } from 'react';

interface ProviderPillProps {
  provider: string;
}

export const ProviderPill: React.FC<ProviderPillProps> = memo(({ provider }) => (
  <span
    style={{
      background: 'var(--ice-bg-hover)',
      borderRadius: 4,
      padding: '2px 5px',
      fontSize: 9,
      fontWeight: 600,
      fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
      color: 'var(--ice-text-tertiary)',
      flexShrink: 0,
      lineHeight: 1,
      pointerEvents: 'none',
      letterSpacing: '0.02em',
    }}
  >
    {provider.toUpperCase()}
  </span>
));

ProviderPill.displayName = 'ProviderPill';
