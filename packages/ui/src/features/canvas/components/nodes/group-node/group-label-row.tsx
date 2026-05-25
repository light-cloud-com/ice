import React, { memo } from 'react';

const FONT = "'JetBrains Mono Variable', monospace";
const FONT_MONO = "ui-monospace, 'SFMono-Regular', monospace";

interface GroupLabelRowProps {
  label: string;
  color?: string;
  childCount?: number;
}

/**
 * Blender-style frame tab — rounded top corners only, flush against the
 * group's body border. The colored swatch on the left mirrors the
 * group's user color so multi-group canvases stay readable at a glance.
 */
export const GroupLabelRow: React.FC<GroupLabelRowProps> = memo(({ label, color, childCount }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '2px 8px',
      background: color ? `${color}1A` : 'var(--ice-bg-raised)',
      borderRadius: '4px 4px 0 0',
      border: color ? `1px solid ${color}55` : '1px solid var(--ice-border)',
      borderBottom: 'none',
      maxWidth: '100%',
    }}
  >
    {color && (
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, opacity: 0.85, flexShrink: 0 }} />
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
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
    {childCount != null && childCount > 0 && (
      <span
        style={{
          color: 'var(--ice-text-tertiary)',
          fontSize: 10,
          fontWeight: 500,
          fontFamily: FONT_MONO,
          padding: '0 4px',
          borderRadius: 3,
          background: 'var(--ice-bg-hover)',
          flexShrink: 0,
        }}
      >
        {childCount}
      </span>
    )}
  </div>
));

GroupLabelRow.displayName = 'GroupLabelRow';
