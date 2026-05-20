import React, { memo } from 'react';
import { renderCategoryIcon } from '../../../../../assets/icons/category-icons';
import { ICON_SIZE } from '../../../../../config/canvas-constants';

interface CategoryIconProps {
  category: string;
  color: string;
  size?: number;
}

export const CategoryIcon: React.FC<CategoryIconProps> = memo(({ category, color, size = ICON_SIZE }) => (
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
    {renderCategoryIcon(category, 0, 0, size, color)}
  </svg>
));

CategoryIcon.displayName = 'CategoryIcon';
