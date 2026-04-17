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
  /** Hide the inline category icon (e.g., when a sidebar already shows it). */
  hideIcon?: boolean;
  /** Override category icon size. */
  iconSize?: number;
  /** Override the NodeLabel font size. */
  labelFontSize?: number;
  style?: React.CSSProperties;
}

export const NodeHeader: React.FC<NodeHeaderProps> = memo(
  ({
    category,
    categoryColor,
    label,
    maxChars,
    onDoubleClickLabel,
    trailing,
    hideIcon = false,
    iconSize,
    labelFontSize,
    style,
  }) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        ...style,
      }}
    >
      {!hideIcon && <CategoryIcon category={category} color={categoryColor} size={iconSize} />}
      <NodeLabel
        label={label}
        maxChars={maxChars}
        fontSize={labelFontSize}
        interactive={!!onDoubleClickLabel}
        onDoubleClick={onDoubleClickLabel}
      />
      {trailing}
    </div>
  ),
);

NodeHeader.displayName = 'NodeHeader';
