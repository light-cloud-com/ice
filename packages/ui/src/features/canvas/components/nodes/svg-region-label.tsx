/**
 * SVG Region Label Component
 *
 * Subtle, non-interactive background region for VPC/Subnet at L2/L3.
 * Replaces heavy container boxes with a faint tinted area and a small label.
 *
 * - VPC: very faint indigo tint
 * - Subnet: very faint violet tint
 * - No borders, no interaction (pointerEvents: 'none')
 * - Rendered BEHIND all other nodes in z-order
 */

import React, { memo } from 'react';
import { REGION_STYLES } from '../../../../config/color-palette';
import type { CanvasNode } from '../svg-canvas';

interface SvgRegionLabelProps {
  node: CanvasNode;
}

export const SvgRegionLabel: React.FC<SvgRegionLabelProps> = memo(({ node }) => {
  const { x, y, width, height, label } = node;
  const iceType = (node.data?.iceType as string) || '';
  const style = REGION_STYLES[iceType] || REGION_STYLES.default;

  const regionWidth = Math.max(width || 400, 300);
  const regionHeight = Math.max(height || 300, 200);

  return (
    <g className="svg-region-label" style={{ pointerEvents: 'none' }}>
      {/* Faint tinted background */}
      <rect x={x} y={y} width={regionWidth} height={regionHeight} rx={12} fill={style.fill} />

      {/* Small label in top-left */}
      <text
        x={x + 10}
        y={y + 16}
        fill={style.labelColor}
        fontSize="10"
        fontWeight="500"
        fontFamily="ui-monospace, 'SFMono-Regular', monospace"
        opacity={0.5}
      >
        {label || iceType.split('.').pop()}
      </text>
    </g>
  );
});

SvgRegionLabel.displayName = 'SvgRegionLabel';

export default SvgRegionLabel;
