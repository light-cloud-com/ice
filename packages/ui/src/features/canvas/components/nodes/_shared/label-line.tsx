/**
 * LabelLine — an uppercase micro-label above a value on canvas blocks.
 *
 * Used by Email Service (FROM / SENDER / REPLY-TO). The editorial rhythm
 * of a small tracked caps label stacked over a larger body value gives
 * the block a magazine-folio feel rather than a form-field feel — which
 * is what "read-only display" should look like.
 */

import React from 'react';

interface LabelLineProps {
  label: string;
  value: string;
  placeholder?: string;
  /** Use mono for the value (default: true — values are usually identifiers). */
  mono?: boolean;
}

const MONO_FONT = 'var(--font-mono, "JetBrains Mono Variable", ui-monospace, "SFMono-Regular", monospace)';

export const LabelLine: React.FC<LabelLineProps> = ({ label, value, placeholder, mono = true }) => {
  const hasValue = !!value;
  const display = hasValue ? value : placeholder || '—';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 32 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          fontFamily: MONO_FONT,
          color: 'var(--ice-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          fontFamily: mono ? MONO_FONT : undefined,
          fontWeight: hasValue ? 500 : 400,
          color: hasValue ? 'var(--ice-text-primary)' : 'var(--ice-text-tertiary)',
          letterSpacing: hasValue ? '0.005em' : undefined,
          fontStyle: hasValue ? 'normal' : 'italic',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.3,
          opacity: hasValue ? 1 : 0.6,
        }}
      >
        {display}
      </div>
    </div>
  );
};

LabelLine.displayName = 'LabelLine';
