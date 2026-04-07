import React, { memo } from 'react';
import { CategoryIcon } from './category-icon';
import { NodeLabel } from './node-label';

interface NodeHeaderProps {
  category: string;
  categoryColor: string;
  label: string;
  maxChars?: number;
  onDoubleClickLabel?: () => void;
  /** Content rendered after the label (provider pill, runtime label, fold button, etc.) */
  trailing?: React.ReactNode;
  style?: React.CSSProperties;
}

export const NodeHeader: React.FC<NodeHeaderProps> = memo(
  ({ category, categoryColor, label, maxChars, onDoubleClickLabel, trailing, style }) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        ...style,
      }}
    >
      <CategoryIcon category={category} color={categoryColor} />
      <NodeLabel label={label} maxChars={maxChars} interactive={!!onDoubleClickLabel} onDoubleClick={onDoubleClickLabel} />
      {trailing}
    </div>
  ),
);

NodeHeader.displayName = 'NodeHeader';
