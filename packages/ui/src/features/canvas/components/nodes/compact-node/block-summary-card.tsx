import React, { memo } from 'react';
import { CORNER_RADIUS, CARD_PX, CATEGORY_STYLE } from '../../../../../config/canvas-constants';
import { CostLabel } from '../_shared/cost-label';
import { FONT_MONO } from '../_shared/fonts';
import { NodeHeader } from '../_shared/node-header';
import { ProviderPill } from '../_shared/provider-pill';
import { SelectionRing } from '../_shared/selection-ring';
import type { CanvasNode } from '../../svg-canvas';

export const BLOCK_SUMMARY_H = 80;
export const BLOCK_SUMMARY_W = 260;

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
    const bBorder = isSelected || isHovered ? bcat.glow : 'var(--ice-border)';
    const truncated = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '\u2026' : s);

    return (
      <g
        className="svg-block-summary"
        data-node-id={node.id}
        style={{ cursor: 'move' }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {isSelected && <SelectionRing x={x} y={y} width={SW} height={SH} stroke={bcat.glow} />}

        <foreignObject x={x} y={y} width={SW} height={SH}>
          <div
            style={{
              width: SW,
              height: SH,
              background: 'var(--ice-bg-surface)',
              border: `${isSelected ? 1.5 : 1}px solid ${bBorder}`,
              borderRadius: CORNER_RADIUS,
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Left accent stripe */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 4,
                height: '100%',
                borderRadius: '2px 0 0 2px',
                background: bcat.glow,
                opacity: 0.8,
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
              style={{ padding: `12px ${CARD_PX}px 0 18px` }}
            />

            {/* Resource count + cost */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `4px ${CARD_PX}px 0 18px`,
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
