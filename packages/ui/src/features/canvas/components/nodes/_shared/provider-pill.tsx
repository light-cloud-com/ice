import React, { memo } from 'react';

interface ProviderPillProps {
  provider: string;
}

export const ProviderPill: React.FC<ProviderPillProps> = memo(({ provider }) => (
  <span
    style={{
      background: 'var(--ice-bg-raised)',
      borderRadius: 7,
      padding: '2px 5px',
      fontSize: 9,
      fontWeight: 500,
      fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
      color: 'var(--ice-text-secondary)',
      flexShrink: 0,
      lineHeight: 1,
      pointerEvents: 'none',
    }}
  >
    {provider.toUpperCase()}
  </span>
));

ProviderPill.displayName = 'ProviderPill';
