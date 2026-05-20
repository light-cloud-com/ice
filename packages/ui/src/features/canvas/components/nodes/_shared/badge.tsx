/**
 * Badge — A tiny uppercase chip for status/mode indicators on canvas blocks.
 *
 * Used for things like "FIFO" / "STD" on queue rows, "MANAGED" / "SELF-HOSTED"
 * on AI blocks, "PUBLIC" / "PRIVATE" on storage, etc. Read-only display.
 */

import React from 'react';

type BadgeTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
}

const TONE_STYLES: Record<BadgeTone, { bg: string; border: string; color: string }> = {
  neutral: {
    bg: 'transparent',
    border: 'var(--ice-border)',
    color: 'var(--ice-text-3)',
  },
  accent: {
    bg: 'rgba(139, 92, 246, 0.15)',
    border: 'rgba(139, 92, 246, 0.4)',
    color: '#c4b5fd',
  },
  warning: {
    bg: 'rgba(217, 119, 6, 0.15)',
    border: 'rgba(217, 119, 6, 0.4)',
    color: '#fbbf24',
  },
  danger: {
    bg: 'rgba(220, 38, 38, 0.15)',
    border: 'rgba(220, 38, 38, 0.4)',
    color: '#fca5a5',
  },
  success: {
    bg: 'rgba(34, 197, 94, 0.15)',
    border: 'rgba(34, 197, 94, 0.4)',
    color: '#86efac',
  },
};

export const Badge: React.FC<BadgeProps> = ({ children, tone = 'neutral' }) => {
  const t = TONE_STYLES[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 17,
        padding: '0 6px',
        fontSize: 9,
        fontWeight: 700,
        fontFamily: 'var(--font-mono, "JetBrains Mono Variable", ui-monospace, monospace)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: t.color,
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 3,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
};

Badge.displayName = 'Badge';
