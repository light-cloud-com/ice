/**
 * KvLine — a read-only `KEY = value` line for canvas blocks.
 *
 * Used by Env Config (shows values) and Secret Store (key-only).
 * Typographic split: key in brighter foreground, `=` in a quiet neutral,
 * value in a softer mid-tone with a left-to-right rhythm and ellipsis
 * clipping for long values. Optional leading dot for key-only lists.
 */

import React from 'react';

interface KvLineProps {
  name: string;
  value?: string;
  /** Leading bullet (useful when values are hidden, so the row still has rhythm). */
  bullet?: boolean;
  /** Mask the value with dots if present. */
  maskValue?: boolean;
}

const MONO_FONT =
  'var(--font-mono, "JetBrains Mono Variable", ui-monospace, "SFMono-Regular", monospace)';

export const KvLine: React.FC<KvLineProps> = ({ name, value, bullet = false, maskValue = false }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: MONO_FONT,
      fontSize: 11,
      lineHeight: 1.4,
      minHeight: 20,
    }}
  >
    {bullet && (
      <span
        style={{
          color: 'var(--ice-text-tertiary)',
          fontSize: 8,
          flexShrink: 0,
          marginTop: 1,
          opacity: 0.7,
        }}
      >
        ●
      </span>
    )}
    <span
      style={{
        color: 'var(--ice-text-primary)',
        fontWeight: 500,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {name}
    </span>
    {value !== undefined && (
      <>
        <span
          style={{
            color: 'var(--ice-text-tertiary)',
            flexShrink: 0,
            fontWeight: 400,
            opacity: 0.6,
          }}
        >
          =
        </span>
        <span
          style={{
            color: 'var(--ice-text-secondary)',
            fontWeight: 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
            minWidth: 0,
          }}
        >
          {maskValue ? '•'.repeat(Math.min(10, Math.max(4, value.length))) : value}
        </span>
      </>
    )}
  </div>
);

KvLine.displayName = 'KvLine';
