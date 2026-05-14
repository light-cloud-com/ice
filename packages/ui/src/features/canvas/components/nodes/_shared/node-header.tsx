import { PN_HEADER_HEIGHT } from '@ice/constants';
import React, { memo } from 'react';
import { CategoryIcon } from './category-icon';
import { NodeLabel } from './node-label';
import { CARD_PX } from '../../../../../config/canvas-constants';

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
      role="group"
      aria-label={`${category} block: ${label}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: `8px ${CARD_PX}px`,
        borderBottom: '1px solid var(--ice-border)',
        background: `linear-gradient(180deg, ${categoryColor}15 0%, transparent 100%)`,
        flexShrink: 0,
        height: PN_HEADER_HEIGHT,
        boxSizing: 'border-box',
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
