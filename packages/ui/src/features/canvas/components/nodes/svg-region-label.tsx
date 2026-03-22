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
import type { CanvasNode } from '../svg-canvas';

interface SvgRegionLabelProps {
  node: CanvasNode;
}

const REGION_STYLES: Record<string, { fill: string; labelColor: string }> = {
  'Network.VPC': { fill: 'rgba(99, 102, 241, 0.04)', labelColor: '#6366f1' },
  'Network.Subnet': { fill: 'rgba(139, 92, 246, 0.03)', labelColor: '#8b5cf6' },
  default: { fill: 'rgba(100, 116, 139, 0.03)', labelColor: '#64748b' },
};

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
