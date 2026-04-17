/**
 * EmptyHint — a dashed placeholder shown inside an empty block body.
 *
 * Points the user to the properties panel. Not clickable — discovery
 * happens through normal node selection. Visually: tracked caps mono
 * centered on a subtle hairline frame, so it reads as "waiting for
 * content" rather than "error".
 */

import React from 'react';

interface EmptyHintProps {
  message: string;
}

export const EmptyHint: React.FC<EmptyHintProps> = ({ message }) => (
  <div
    style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 42,
      padding: '14px 12px',
      border: '1px dashed var(--ice-border)',
      borderRadius: 6,
      fontSize: 9,
      fontWeight: 600,
      fontFamily:
        'var(--font-mono, "JetBrains Mono Variable", ui-monospace, "SFMono-Regular", monospace)',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: 'var(--ice-text-tertiary)',
      opacity: 0.7,
      textAlign: 'center',
      pointerEvents: 'none',
      userSelect: 'none',
    }}
  >
    {message}
  </div>
);

EmptyHint.displayName = 'EmptyHint';
