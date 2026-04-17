/**
 * Pill — a rounded chip display element for read-only canvas content.
 *
 * Used for queue names, key names, route labels. Small mono, medium
 * weight, generous padding. Subtle outlined variant feels like a tag
 * on an editorial page rather than a button, which is appropriate for
 * a purely display element.
 */

import React from 'react';

interface PillProps {
  children: React.ReactNode;
  /** Optional accent color — tints border + text subtly. */
  accent?: string;
  /** Mono font for identifier-like labels (default true). */
  mono?: boolean;
  /** Truncate at N chars with ellipsis. */
  maxChars?: number;
}

export const Pill: React.FC<PillProps> = ({ children, accent, mono = true, maxChars }) => {
  const text =
    typeof children === 'string' && maxChars && children.length > maxChars
      ? children.slice(0, maxChars - 1) + '\u2026'
      : children;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 9px',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.01em',
        fontFamily: mono
          ? 'var(--font-mono, "JetBrains Mono Variable", ui-monospace, "SFMono-Regular", monospace)'
          : undefined,
        color: accent ? accent : 'var(--ice-text-primary)',
        background: accent ? `${accent}12` : 'var(--ice-bg-raised)',
        border: `1px solid ${accent ? `${accent}3b` : 'var(--ice-border)'}`,
        borderRadius: 999,
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {text}
    </span>
  );
};

Pill.displayName = 'Pill';
