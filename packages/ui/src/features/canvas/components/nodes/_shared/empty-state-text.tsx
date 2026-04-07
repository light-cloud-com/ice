import React, { memo } from 'react';

interface EmptyStateTextProps {
  text?: string;
}

export const EmptyStateText: React.FC<EmptyStateTextProps> = memo(({ text = 'Drop resources here' }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      color: 'var(--ice-border-strong)',
      fontSize: 11,
      fontFamily: "'JetBrains Mono Variable', monospace",
      pointerEvents: 'none',
    }}
  >
    {text}
  </div>
));

EmptyStateText.displayName = 'EmptyStateText';
