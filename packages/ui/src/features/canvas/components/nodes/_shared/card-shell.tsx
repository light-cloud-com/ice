/**
 * CardShell — The SVG+foreignObject card wrapper that every bespoke
 * canvas node can drop content into. Mirrors the chrome used by
 * `SvgCustomDomainNode` and `SvgPrivateNetworkNode` so they look like
 * siblings.
 *
 * Renders:
 *   - SVG `<g>` root
 *   - `foreignObject` sized to the node
 *   - Card background with border, rounded corners, selection glow
 *   - Hover/drag-over/selection border treatment
 *   - Header row: icon + label + subtitle + optional trailing slot
 *   - Body slot for your bespoke content
 *
 * Per-block nodes import this and pass content via children. No per-block
 * chrome duplication.
 */

import type { LucideIcon } from 'lucide-react';
import React, { useCallback, useState, type ReactNode } from 'react';
import { CATEGORY_STYLE } from '../../../../../config/canvas-constants';
import { CORNER_RADIUS } from '../../../../../config/canvas-constants';
import { ConceptInfoTrigger } from '../../../../concept-info';
import type { SvgCompactNodeProps } from '../compact-node/types';

interface CardShellProps {
  node: SvgCompactNodeProps['node'];
  isSelected: boolean;
  isDragOver?: boolean;
  onNodeHover?: (nodeId: string | null) => void;
  connectionDragState?: 'source' | 'valid-target' | 'invalid-target' | null;
  /** Icon component from lucide-react (or similar). */
  icon: LucideIcon;
  /** Override accent color. Default: derived from iceType category. */
  accentColor?: string;
  /** Title in the header (defaults to node.label). */
  title?: string;
  /** Subtitle line below the title. */
  subtitle?: string;
  /** Trailing slot in the header (buttons, badges, etc.). */
  headerTrailing?: ReactNode;
  /** Header height (default 48). */
  headerHeight?: number;
  /** Card body content. */
  children: ReactNode;
}

export const CardShell: React.FC<CardShellProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  icon: Icon,
  accentColor,
  title,
  subtitle,
  headerTrailing,
  headerHeight = 48,
  children,
}) => {
  const { x, y, data, label } = node;
  const W = node.width;
  const H = node.height;
  const [isHovered, setIsHovered] = useState(false);

  // Category-based glow, just like SvgCompactNode and SvgCustomDomainNode.
  const iceType = (data?.iceType as string) || '';
  const category = iceType.split('.')[0] || 'default';
  const cat = CATEGORY_STYLE[category] || CATEGORY_STYLE.default;
  const ACCENT = accentColor || cat.glow;

  const isValidTarget = connectionDragState === 'valid-target';
  const isInvalidTarget = connectionDragState === 'invalid-target';
  const isSource = connectionDragState === 'source';

  const border = isDragOver
    ? '#22d3ee'
    : isValidTarget
      ? '#22c55e'
      : isInvalidTarget
        ? '#ef4444'
        : isSelected
          ? 'var(--ice-accent)'
          : isHovered
            ? ACCENT
            : 'var(--ice-border)';

  const onEnter = useCallback(() => {
    setIsHovered(true);
    onNodeHover?.(node.id);
  }, [node.id, onNodeHover]);
  const onLeave = useCallback(() => {
    setIsHovered(false);
    onNodeHover?.(null);
  }, [onNodeHover]);

  return (
    <g>
      <foreignObject x={x} y={y} width={W} height={H}>
        <div
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          style={{
            width: W,
            height: H,
            background: 'var(--ice-bg-raised)',
            border: `1px solid ${isSelected || isHovered ? ACCENT : ACCENT + '55'}`,
            borderRadius: CORNER_RADIUS,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: isSelected
              ? `0 0 0 1.5px ${ACCENT}, 0 4px 14px -4px ${ACCENT}33`
              : isHovered
                ? '0 2px 8px -2px rgba(0,0,0,0.15)'
                : '0 1px 3px rgba(0,0,0,0.06)',
            opacity: isSource ? 0.85 : 1,
            transition: 'box-shadow 150ms ease, border-color 150ms ease',
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px 8px',
              borderBottom: '1px solid var(--ice-border-subtle, var(--ice-border))',
              flexShrink: 0,
              minHeight: headerHeight,
              boxSizing: 'border-box',
            }}
          >
            <Icon size={16} style={{ color: ACCENT, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: 'var(--ice-text-primary)',
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title ?? label ?? ''}
              </div>
              {subtitle && (
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11,
                    fontWeight: 400,
                    color: 'var(--ice-text-tertiary)',
                    lineHeight: 1.3,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {subtitle}
                </div>
              )}
            </div>
            <ConceptInfoTrigger
              iceType={iceType}
              displayName={title ?? label ?? ''}
              opacity={isHovered ? 0.85 : 0.4}
            />
            {headerTrailing}
          </div>

          {/* ── Body slot ── */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '10px 14px 12px',
              gap: 8,
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            {children}
          </div>
        </div>
      </foreignObject>
    </g>
  );
};

CardShell.displayName = 'CardShell';
