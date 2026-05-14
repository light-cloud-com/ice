import { BLOCK_SUMMARY_H, BLOCK_SUMMARY_W } from '@ice/constants';
import React, { memo } from 'react';
import { CORNER_RADIUS, CARD_PX, CATEGORY_STYLE } from '../../../../../config/canvas-constants';
import { CostLabel } from '../_shared/cost-label';
import { FONT_MONO } from '../_shared/fonts';
import { NodeHeader } from '../_shared/node-header';
import { ProviderPill } from '../_shared/provider-pill';
import type { CanvasNode } from '../../svg-canvas';

export { BLOCK_SUMMARY_H, BLOCK_SUMMARY_W };

interface BlockSummaryCardProps {
  node: CanvasNode;
  isSelected: boolean;
  isHovered: boolean;
  childNodes: CanvasNode[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDoubleClickLabel?: () => void;
}

export const BlockSummaryCard: React.FC<BlockSummaryCardProps> = memo(
  ({ node, isSelected, isHovered, childNodes, onMouseEnter, onMouseLeave, onDoubleClickLabel }) => {
    const { x, y, width, data, label } = node;
    const iceType = (data.iceType as string) || '';
    const category = iceType.split('.')[0] || 'default';
    const provider = (data.provider as string) || '';
    const blockCost = (data.estimatedCost as string) || '';
    const resourceCount = childNodes.length;

    const SW = Math.max(width || BLOCK_SUMMARY_W, BLOCK_SUMMARY_W);
    const SH = BLOCK_SUMMARY_H;
    const bcat = CATEGORY_STYLE[category] || CATEGORY_STYLE.Block || CATEGORY_STYLE.default;
    const bBorder = isSelected || isHovered ? bcat.glow : bcat.glow + '55';

    return (
      <g
        className="svg-block-summary"
        data-node-id={node.id}
        style={{ cursor: 'move' }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <foreignObject x={x} y={y} width={SW} height={SH}>
          <div
            style={{
              width: SW,
              height: SH,
              background: 'var(--ice-bg-raised)',
              border: `1px solid ${bBorder}`,
              borderRadius: CORNER_RADIUS,
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: isSelected
                ? `0 0 0 1.5px ${bcat.glow}, 0 4px 14px -4px ${bcat.glow}33`
                : isHovered
                  ? '0 2px 8px -2px rgba(0,0,0,0.15)'
                  : '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            {/* Top accent line */}
            <div
              style={{
                height: 2,
                flexShrink: 0,
                background: bcat.glow,
                opacity: isSelected || isHovered ? 0.9 : 0.55,
              }}
            />

            {/* Header: icon + name + provider */}
            <NodeHeader
              category={category}
              categoryColor={bcat.glow}
              label={label || ''}
              maxChars={22}
              onDoubleClickLabel={onDoubleClickLabel}
              trailing={provider ? <ProviderPill provider={provider} /> : undefined}
              style={{ padding: `10px ${CARD_PX}px 0` }}
            />

            {/* Resource count + cost */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `4px ${CARD_PX}px 0`,
                flex: 1,
              }}
            >
              <span style={{ color: 'var(--ice-text-secondary)', fontSize: 10, fontFamily: FONT_MONO }}>
                {resourceCount > 0 ? `${resourceCount} resource${resourceCount !== 1 ? 's' : ''}` : 'empty'}
              </span>
              {blockCost && <CostLabel cost={blockCost} />}
            </div>
          </div>
        </foreignObject>
      </g>
    );
  },
);

BlockSummaryCard.displayName = 'BlockSummaryCard';
