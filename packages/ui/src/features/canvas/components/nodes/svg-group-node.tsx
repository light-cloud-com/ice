/**
 * SVG Group Node Component
 *
 * Renders both Groups (organizational containers) and Blocks (infra units).
 *
 * GROUPS — simple dashed border + top-left label:
 *   - Transparent, minimal, no folder-tab chrome
 *   - Subtle dashed border, color indicator
 *
 * BLOCKS — accent stripe + label + child count:
 *   ┃  Scalable Backend           3
 *   ┃───────────────────────────────
 *   ┃                      ~$45/mo
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { getIcon, type Provider } from '../../../../assets/icons';
import { CORNER_RADIUS } from '../../../../config/canvas-constants';
import { BLOCK_ACCENT_COLORS, GROUP_TINT_COLORS, GROUP_BORDER_COLORS } from '../../../../config/color-palette';
import type { CanvasNode } from '../svg-canvas';

interface SvgGroupNodeProps {
  node: CanvasNode;
  isSelected: boolean;
  childNodes?: CanvasNode[];
  onToggleFold?: (nodeId: string) => void;
  isDragOver?: boolean;
  isDragging?: boolean;
  isChildExiting?: boolean;
  isBlock?: boolean;
  isRenaming?: boolean;
  onDoubleClickLabel?: () => void;
  onRenameCommit?: (newLabel: string) => void;
  onRenameCancel?: () => void;
  /** Level of detail: 3=full, 2=compact, 1=iconic */
  lod?: number;
  /** Current zoom level — used for inverse-zoom scaling at low LOD */
  zoom?: number;
  /** Connection drag state: containers are always invalid targets */
  connectionDragState?: 'valid-target' | 'invalid-target' | 'source' | null;
}

// ─── Shared constants ──────────────────────────────────────────────────────────

const MIN_WIDTH = 276;
const FOLDED_HEIGHT = 36;
const ACCENT_BAR_WIDTH = 4;

/** Convert hex color to tint (very low alpha) and border (medium alpha) */
function hexToTint(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.09)`;
}
function hexToBorder(hex: string): string {
  return hex + '50';
}

export const SvgGroupNode: React.FC<SvgGroupNodeProps> = memo(
  ({
    node,
    isSelected,
    childNodes = [],
    onToggleFold,
    isDragOver = false,
    isDragging = false,
    isChildExiting = false,
    isBlock = false,
    isRenaming = false,
    onDoubleClickLabel,
    onRenameCommit,
    onRenameCancel,
    lod = 3,
    zoom = 1,
    connectionDragState = null,
  }) => {
    const { x, y, width, height, label, data } = node;
    const [isHovered, setIsHovered] = useState(false);
    const invZoom = 1 / Math.max(zoom, 0.1);
    const renameInputRef = useRef<HTMLInputElement>(null);

    const folded = (node.data?.folded as boolean) || false;
    const childCount = childNodes.length;
    const iceType = (data?.iceType as string) || '';
    const typeSuffix = iceType.split('.')[1] || '';
    const accentColor = isBlock ? BLOCK_ACCENT_COLORS[typeSuffix] || '#3b82f6' : '';
    const provider = (data?.provider as string) || 'aws';
    const blockIcon = isBlock ? getIcon(iceType, provider as Provider) : null;

    // Dimensions
    const nodeWidth = Math.max(width || MIN_WIDTH, MIN_WIDTH);
    const nodeHeight = folded ? FOLDED_HEIGHT : Math.max(height || 120, 80);

    // Display label
    const maxChars = Math.max(Math.floor((nodeWidth - 80) / 7), 8);
    const displayLabel =
      (label || (isBlock ? 'Block' : 'Group')).length > maxChars
        ? (label || (isBlock ? 'Block' : 'Group')).substring(0, maxChars) + '\u2026'
        : label || (isBlock ? 'Block' : 'Group');

    const handleToggleFold = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleFold?.(node.id);
      },
      [node.id, onToggleFold],
    );

    useEffect(() => {
      if (isRenaming && renameInputRef.current) {
        renameInputRef.current.focus();
        renameInputRef.current.select();
      }
    }, [isRenaming]);

    // ─── LOD 1: Iconic group — just colored region ─────────────────────
    const gc = (data.groupColor as string) || '';
    if (lod <= 1) {
      const lodBorderColor = isDragOver ? '#22c55e' : isChildExiting ? '#f97316' : gc || 'var(--ice-border)';
      return (
        <g className="svg-group-node lod-1" data-node-id={node.id} style={{ cursor: 'move' }}>
          {isDragOver && (
            <rect
              x={x - 3}
              y={y - 3}
              width={nodeWidth + 6}
              height={nodeHeight + 6}
              rx={CORNER_RADIUS + 3}
              fill="none"
              stroke="#22c55e"
              strokeWidth={2}
              strokeDasharray="8 4"
              opacity={0.8}
            />
          )}
          {isChildExiting && (
            <rect
              x={x - 3}
              y={y - 3}
              width={nodeWidth + 6}
              height={nodeHeight + 6}
              rx={CORNER_RADIUS + 3}
              fill="none"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={0.9}
            />
          )}
          <rect
            x={x}
            y={y}
            width={nodeWidth}
            height={nodeHeight}
            rx={CORNER_RADIUS}
            fill={gc ? `${gc}20` : 'rgba(15, 23, 42, 0.15)'}
            stroke={lodBorderColor}
            strokeWidth={(isDragOver || isChildExiting ? 2 : 1.5) * invZoom}
            strokeDasharray={isDragOver ? undefined : `${6 * invZoom} ${3 * invZoom}`}
            opacity={isDragOver || isChildExiting ? 1 : 0.7}
          />
        </g>
      );
    }

    // ─── LOD 2: Compact group — border + label only ──────────────────
    if (lod <= 2) {
      const lbl = (label || '').length > 20 ? (label || '').slice(0, 20) + '\u2026' : label || '';
      const lodBorderColor = isDragOver
        ? '#22c55e'
        : isChildExiting
          ? '#f97316'
          : isSelected
            ? gc || 'var(--ice-border-strong)'
            : gc || 'var(--ice-border)';
      return (
        <g className="svg-group-node lod-2" data-node-id={node.id} style={{ cursor: 'move' }}>
          {isDragOver && (
            <rect
              x={x - 3}
              y={y - 3}
              width={nodeWidth + 6}
              height={nodeHeight + 6}
              rx={CORNER_RADIUS + 3}
              fill="none"
              stroke="#22c55e"
              strokeWidth={2}
              strokeDasharray="8 4"
              opacity={0.8}
            />
          )}
          {isChildExiting && (
            <rect
              x={x - 3}
              y={y - 3}
              width={nodeWidth + 6}
              height={nodeHeight + 6}
              rx={CORNER_RADIUS + 3}
              fill="none"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={0.9}
            />
          )}
          <rect
            x={x}
            y={y}
            width={nodeWidth}
            height={nodeHeight}
            rx={CORNER_RADIUS}
            fill={gc ? `${gc}18` : 'rgba(15, 23, 42, 0.10)'}
            stroke={lodBorderColor}
            strokeWidth={(isDragOver || isChildExiting ? 2 : isSelected ? 1.5 : 1) * invZoom}
            strokeDasharray={isDragOver ? undefined : `${6 * invZoom} ${3 * invZoom}`}
          />
          <text
            x={x + 10 * invZoom}
            y={y + 14 * invZoom}
            dominantBaseline="middle"
            fill={gc || 'var(--ice-text-secondary)'}
            fontSize={10 * invZoom}
            fontWeight="600"
            fontFamily="'JetBrains Mono Variable', monospace"
            opacity={0.7}
            style={{ pointerEvents: 'none' }}
          >
            {lbl}
          </text>
        </g>
      );
    }

    // ─── BLOCK rendering ────────────────────────────────────────────────
    if (isBlock) {
      return (
        <BlockNode
          node={node}
          x={x}
          y={y}
          nodeWidth={nodeWidth}
          nodeHeight={nodeHeight}
          displayLabel={displayLabel}
          folded={folded}
          childCount={childCount}
          accentColor={accentColor}
          blockIcon={blockIcon}
          isSelected={isSelected}
          isHovered={isHovered}
          isDragOver={isDragOver}
          isDragging={isDragging}
          isChildExiting={isChildExiting}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onToggleFold={handleToggleFold}
        />
      );
    }

    // ─── GROUP rendering — simple dashed border + top-left label ──────────
    const userColor = data?.groupColor as string | undefined;
    const groupBorderColor = userColor
      ? hexToBorder(userColor)
      : GROUP_BORDER_COLORS[typeSuffix] || 'var(--ice-border-strong)';
    const groupTint = userColor ? hexToTint(userColor) : GROUP_TINT_COLORS[typeSuffix] || 'rgba(15, 23, 42, 0.15)';
    const labelColor = userColor || 'var(--ice-text-tertiary)';

    const getBorderColor = () => {
      if (isChildExiting) return '#f97316';
      if (isDragOver) return '#22c55e';
      if (isSelected || isHovered) return 'var(--ice-text-secondary)';
      return groupBorderColor;
    };

    return (
      <g
        className="svg-group-node"
        data-node-id={node.id}
        style={{ cursor: 'move', opacity: connectionDragState === 'invalid-target' ? 0.3 : isDragging ? 0.85 : 1 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Selection ring */}
        {isSelected && (
          <rect
            x={x - 2}
            y={y - 2}
            width={nodeWidth + 4}
            height={nodeHeight + 4}
            rx={CORNER_RADIUS + 2}
            fill="none"
            stroke="var(--ice-text-secondary)"
            strokeWidth={2}
            opacity={0.6}
          />
        )}

        {/* Drag-over glow */}
        {isDragOver && (
          <rect
            x={x - 3}
            y={y - 3}
            width={nodeWidth + 6}
            height={nodeHeight + 6}
            rx={CORNER_RADIUS + 3}
            fill="none"
            stroke="#22c55e"
            strokeWidth={2}
            strokeDasharray="8 4"
            opacity={0.8}
          />
        )}

        {/* Child exiting indicator */}
        {isChildExiting && (
          <rect
            x={x - 3}
            y={y - 3}
            width={nodeWidth + 6}
            height={nodeHeight + 6}
            rx={CORNER_RADIUS + 3}
            fill="none"
            stroke="#f97316"
            strokeWidth={2}
            strokeDasharray="6 4"
            opacity={0.9}
          />
        )}

        {/* Main body — subtle dashed border */}
        <rect
          x={x}
          y={y}
          width={nodeWidth}
          height={nodeHeight}
          rx={CORNER_RADIUS}
          fill={groupTint}
          stroke={getBorderColor()}
          strokeWidth={isSelected ? 1.5 : 1}
          strokeDasharray={isDragOver ? undefined : '4 4'}
          strokeOpacity={0.6}
        />

        {/* Color indicator — small dot */}
        {userColor && <circle cx={x + 14} cy={y + (folded ? 18 : 16)} r={4} fill={userColor} opacity={0.7} />}

        {/* Label */}
        {isRenaming ? (
          <foreignObject
            x={x + (userColor ? 24 : 12)}
            y={y + (folded ? 6 : 4)}
            width={Math.min(nodeWidth - 90, 200)}
            height={24}
          >
            <input
              ref={renameInputRef}
              defaultValue={label || 'New Group'}
              aria-label="Rename group"
              autoComplete="off"
              name="group-label"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onRenameCommit?.((e.target as HTMLInputElement).value);
                } else if (e.key === 'Escape') {
                  onRenameCancel?.();
                }
                e.stopPropagation();
              }}
              onBlur={(e) => onRenameCommit?.(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                height: '22px',
                background: 'rgba(15, 23, 42, 0.9)',
                border: `1px solid ${labelColor}`,
                borderRadius: 4,
                color: 'var(--ice-text-primary)',
                fontSize: 11,
                fontWeight: 500,
                fontFamily: "'JetBrains Mono Variable', monospace",
                padding: '0 6px',
                outline: 'none',
                boxShadow: `0 0 0 2px ${labelColor}40`,
              }}
            />
          </foreignObject>
        ) : (
          <text
            x={x + (userColor ? 24 : 12)}
            y={y + (folded ? 19 : 16)}
            dominantBaseline="middle"
            fill="var(--ice-text-primary)"
            fontSize="11"
            fontWeight="500"
            fontFamily="'JetBrains Mono Variable', monospace"
            letterSpacing="0.3"
            style={{ cursor: 'text', pointerEvents: 'auto' }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClickLabel?.();
            }}
          >
            {displayLabel}
          </text>
        )}

        {/* Child count — just a number */}
        {childCount > 0 && (
          <text
            x={x + nodeWidth - 16}
            y={y + (folded ? 19 : 16)}
            textAnchor="end"
            dominantBaseline="middle"
            fill="var(--ice-text-secondary)"
            fontSize="10"
            fontWeight="500"
            fontFamily="ui-monospace, 'SFMono-Regular', monospace"
          >
            {childCount}
          </text>
        )}

        {/* Fold chevron */}
        <g style={{ cursor: 'pointer' }} onClick={handleToggleFold} opacity={isHovered ? 0.8 : 0.4}>
          <rect x={x + nodeWidth - 40} y={y + (folded ? 8 : 4)} width={18} height={20} fill="transparent" />
          {folded ? (
            <path
              d={`M ${x + nodeWidth - 35} ${y + 14} l 5 4 -5 4`}
              fill="none"
              stroke="var(--ice-text-tertiary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d={`M ${x + nodeWidth - 36} ${y + 12} l 4 4 4 -4`}
              fill="none"
              stroke="var(--ice-text-tertiary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>

        {/* Empty state */}
        {!folded && childCount === 0 && (
          <text
            x={x + nodeWidth / 2}
            y={y + 24 + (nodeHeight - 24) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--ice-border-strong)"
            fontSize="11"
            fontFamily="'JetBrains Mono Variable', monospace"
            style={{ pointerEvents: 'none' }}
          >
            Drop resources or blocks here
          </text>
        )}

        {/* Resize handle */}
        {!folded && (
          <g className="resize-handle" style={{ cursor: 'se-resize' }}>
            <rect x={x + nodeWidth - 16} y={y + nodeHeight - 16} width={16} height={16} fill="transparent" />
            <line
              x1={x + nodeWidth - 4}
              y1={y + nodeHeight - 10}
              x2={x + nodeWidth - 10}
              y2={y + nodeHeight - 4}
              stroke={isHovered ? 'var(--ice-border-strong)' : 'var(--ice-border)'}
              strokeWidth={1}
            />
            <line
              x1={x + nodeWidth - 4}
              y1={y + nodeHeight - 6}
              x2={x + nodeWidth - 6}
              y2={y + nodeHeight - 4}
              stroke={isHovered ? 'var(--ice-border-strong)' : 'var(--ice-border)'}
              strokeWidth={1}
            />
          </g>
        )}
      </g>
    );
  },
);

SvgGroupNode.displayName = 'SvgGroupNode';

// ═══════════════════════════════════════════════════════════════════════════════
// Block sub-component — accent stripe + label + child count, no header band
// ═══════════════════════════════════════════════════════════════════════════════

interface BlockNodeProps {
  node: CanvasNode;
  x: number;
  y: number;
  nodeWidth: number;
  nodeHeight: number;
  displayLabel: string;
  folded: boolean;
  childCount: number;
  accentColor: string;
  blockIcon: { icon: string; label: string; color: string } | null;
  isSelected: boolean;
  isHovered: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  isChildExiting: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleFold: (e: React.MouseEvent) => void;
}

const BlockNode: React.FC<BlockNodeProps> = memo(
  ({
    node,
    x,
    y,
    nodeWidth,
    nodeHeight,
    displayLabel,
    folded,
    childCount,
    accentColor,
    blockIcon,
    isSelected,
    isHovered,
    isDragOver,
    isDragging,
    isChildExiting,
    onMouseEnter,
    onMouseLeave,
    onToggleFold,
  }) => {
    const estimatedCost = (node.data?.estimatedCost as string) || '';

    const getBorderColor = () => {
      if (isChildExiting) return '#f97316';
      if (isDragOver) return '#22c55e';
      if (isSelected || isHovered) return 'var(--ice-border-strong)';
      return accentColor + '40';
    };

    return (
      <g
        className="svg-block-node"
        data-node-id={node.id}
        style={{ cursor: 'move', opacity: isDragging ? 0.85 : 1 }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Selection ring */}
        {isSelected && (
          <rect
            x={x - 2}
            y={y - 2}
            width={nodeWidth + 4}
            height={nodeHeight + 4}
            rx={CORNER_RADIUS + 2}
            fill="none"
            stroke={accentColor}
            strokeWidth={2}
            opacity={0.6}
          />
        )}

        {/* Drag-over glow */}
        {isDragOver && (
          <rect
            x={x - 3}
            y={y - 3}
            width={nodeWidth + 6}
            height={nodeHeight + 6}
            rx={CORNER_RADIUS + 3}
            fill="none"
            stroke="#22c55e"
            strokeWidth={2}
            strokeDasharray="8 4"
            opacity={0.8}
          />
        )}

        {/* Child exiting indicator */}
        {isChildExiting && (
          <rect
            x={x - 3}
            y={y - 3}
            width={nodeWidth + 6}
            height={nodeHeight + 6}
            rx={CORNER_RADIUS + 3}
            fill="none"
            stroke="#f97316"
            strokeWidth={2}
            strokeDasharray="6 4"
            opacity={0.9}
          />
        )}

        {/* Clip path */}
        <defs>
          <clipPath id={`group-clip-${node.id}`}>
            <rect x={x} y={y} width={nodeWidth} height={nodeHeight} rx={CORNER_RADIUS} />
          </clipPath>
        </defs>

        {/* Main background */}
        <rect
          x={x}
          y={y}
          width={nodeWidth}
          height={nodeHeight}
          rx={CORNER_RADIUS}
          fill="rgba(15, 23, 42, 0.55)"
          stroke={getBorderColor()}
          strokeWidth={isSelected ? 1.5 : 1}
        />

        {/* Accent bar — 4px left stripe */}
        <rect
          x={x}
          y={y}
          width={ACCENT_BAR_WIDTH}
          height={nodeHeight}
          rx={CORNER_RADIUS}
          fill={accentColor}
          clipPath={`url(#group-clip-${node.id})`}
        />

        {/* Block icon */}
        {blockIcon && (
          <image
            x={x + ACCENT_BAR_WIDTH + 8}
            y={y + 10}
            width={16}
            height={16}
            href={blockIcon.icon}
            preserveAspectRatio="xMidYMid meet"
            opacity={0.9}
          />
        )}

        {/* Label */}
        <text
          x={x + ACCENT_BAR_WIDTH + (blockIcon ? 30 : 12)}
          y={y + 19}
          dominantBaseline="middle"
          fill="var(--ice-text-primary)"
          fontSize="13"
          fontWeight="600"
          fontFamily="'JetBrains Mono Variable', monospace"
          style={{ pointerEvents: 'none' }}
        >
          {displayLabel}
        </text>

        {/* Child count — just a number, right-aligned in header */}
        {childCount > 0 && (
          <text
            x={x + nodeWidth - 12}
            y={y + 19}
            textAnchor="end"
            dominantBaseline="middle"
            fill={accentColor}
            fontSize="10"
            fontWeight="500"
            fontFamily="ui-monospace, 'SFMono-Regular', monospace"
            opacity={0.7}
          >
            {childCount}
          </text>
        )}

        {/* Cost — bottom-right */}
        {estimatedCost && !folded && (
          <text
            x={x + nodeWidth - 12}
            y={y + nodeHeight - 12}
            textAnchor="end"
            dominantBaseline="middle"
            fill="var(--ice-text-secondary)"
            fontSize="9"
            fontFamily="ui-monospace, 'SFMono-Regular', monospace"
            style={{ pointerEvents: 'none' }}
          >
            {estimatedCost}
          </text>
        )}

        {/* Header separator */}
        {!folded && (
          <line
            x1={x + ACCENT_BAR_WIDTH}
            y1={y + 36}
            x2={x + nodeWidth}
            y2={y + 36}
            stroke="var(--ice-border-strong)"
            strokeWidth={0.5}
            opacity={0.4}
          />
        )}

        {/* Fold chevron */}
        <g style={{ cursor: 'pointer' }} onClick={onToggleFold} opacity={isHovered ? 0.8 : 0.4}>
          <rect x={x + nodeWidth - (childCount > 0 ? 36 : 24)} y={y + 8} width={18} height={20} fill="transparent" />
          {folded ? (
            <path
              d={`M ${x + nodeWidth - (childCount > 0 ? 31 : 19)} ${y + 14} l 5 4 -5 4`}
              fill="none"
              stroke="var(--ice-text-tertiary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d={`M ${x + nodeWidth - (childCount > 0 ? 32 : 20)} ${y + 16} l 4 4 4 -4`}
              fill="none"
              stroke="var(--ice-text-tertiary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>

        {/* Empty state */}
        {!folded && childCount === 0 && (
          <text
            x={x + nodeWidth / 2}
            y={y + 36 + (nodeHeight - 36) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--ice-border-strong)"
            fontSize="11"
            fontFamily="'JetBrains Mono Variable', monospace"
            style={{ pointerEvents: 'none' }}
          >
            Drop resources here
          </text>
        )}

        {/* Resize handle */}
        {!folded && (
          <g className="resize-handle" style={{ cursor: 'se-resize' }}>
            <rect x={x + nodeWidth - 16} y={y + nodeHeight - 16} width={16} height={16} fill="transparent" />
            <line
              x1={x + nodeWidth - 4}
              y1={y + nodeHeight - 10}
              x2={x + nodeWidth - 10}
              y2={y + nodeHeight - 4}
              stroke={isHovered ? 'var(--ice-border-strong)' : 'var(--ice-border)'}
              strokeWidth={1}
            />
            <line
              x1={x + nodeWidth - 4}
              y1={y + nodeHeight - 6}
              x2={x + nodeWidth - 6}
              y2={y + nodeHeight - 4}
              stroke={isHovered ? 'var(--ice-border-strong)' : 'var(--ice-border)'}
              strokeWidth={1}
            />
          </g>
        )}
      </g>
    );
  },
);

BlockNode.displayName = 'BlockNode';

