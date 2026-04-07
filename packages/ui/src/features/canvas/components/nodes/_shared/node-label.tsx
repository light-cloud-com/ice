import React, { memo } from 'react';

const FONT = "'JetBrains Mono Variable', monospace";

interface NodeLabelProps {
  label: string;
  maxChars?: number;
  fontSize?: number;
  interactive?: boolean;
  onDoubleClick?: () => void;
}

export const NodeLabel: React.FC<NodeLabelProps> = memo(
  ({ label, maxChars = 18, fontSize = 12, interactive = false, onDoubleClick }) => {
    const truncated = label.length > maxChars ? label.slice(0, maxChars) + '\u2026' : label;

    return (
      <span
        style={{
          color: 'var(--ice-text-primary)',
          fontSize,
          fontWeight: 600,
          fontFamily: FONT,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: interactive ? 'text' : 'inherit',
          pointerEvents: interactive ? 'auto' : 'none',
          minWidth: 0,
        }}
        onDoubleClick={
          onDoubleClick
            ? (e) => {
                e.stopPropagation();
                onDoubleClick();
              }
            : undefined
        }
      >
        {truncated}
      </span>
    );
  },
);

NodeLabel.displayName = 'NodeLabel';
