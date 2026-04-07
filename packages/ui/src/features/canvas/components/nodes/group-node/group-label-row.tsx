import React, { memo } from 'react';

const FONT = "'JetBrains Mono Variable', monospace";
const FONT_MONO = "ui-monospace, 'SFMono-Regular', monospace";

interface GroupLabelRowProps {
  label: string;
  color?: string;
  childCount?: number;
}

export const GroupLabelRow: React.FC<GroupLabelRowProps> = memo(({ label, color, childCount }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    {color && (
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, opacity: 0.7, flexShrink: 0 }} />
    )}
    <span
      style={{
        color: color || 'var(--ice-text-secondary)',
        fontSize: 11,
        fontWeight: 600,
        fontFamily: FONT,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        pointerEvents: 'none',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
    {childCount != null && childCount > 0 && (
      <span style={{ color: 'var(--ice-text-tertiary)', fontSize: 10, fontWeight: 500, fontFamily: FONT_MONO, flexShrink: 0 }}>
        {childCount}
      </span>
    )}
  </div>
));

GroupLabelRow.displayName = 'GroupLabelRow';
