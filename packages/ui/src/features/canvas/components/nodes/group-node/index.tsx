/**
 * SVG Group Node Component
 *
 * Renders both Groups (organizational containers) and Blocks (infra units).
 * Orchestrates LOD views and delegates to sub-components.
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { BlockNode } from './block-node';
import { GroupLod1 } from './group-lod1';
import { GroupLod2 } from './group-lod2';
import { GroupLod3 } from './group-lod3';
import { hexToTint, hexToBorder } from './helpers';
import { getIcon, type Provider } from '../../../../../assets/icons';
import { BLOCK_ACCENT_COLORS, GROUP_TINT_COLORS, GROUP_BORDER_COLORS } from '../../../../../config/color-palette';
import type { SvgGroupNodeProps } from './types';

const MIN_WIDTH = 276;
const FOLDED_HEIGHT = 36;

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

    const nodeWidth = Math.max(width || MIN_WIDTH, MIN_WIDTH);
    const nodeHeight = folded ? FOLDED_HEIGHT : Math.max(height || 120, 80);

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

    const gc = (data.groupColor as string) || '';
    const go = (data.groupOpacity as number) ?? undefined;

    // ─── LOD 1 ──
    if (lod <= 1) {
      return (
        <GroupLod1
          nodeId={node.id}
          x={x}
          y={y}
          nodeWidth={nodeWidth}
          nodeHeight={nodeHeight}
          label={label || ''}
          displayLabel={displayLabel}
          groupColor={gc}
          groupOpacity={go}
          isDragOver={isDragOver}
          isChildExiting={isChildExiting}
          invZoom={invZoom}
        />
      );
    }

    // ─── LOD 2 ──
    if (lod <= 2) {
      return (
        <GroupLod2
          nodeId={node.id}
          x={x}
          y={y}
          nodeWidth={nodeWidth}
          nodeHeight={nodeHeight}
          label={label || ''}
          groupColor={gc}
          groupOpacity={go}
          isSelected={isSelected}
          isDragOver={isDragOver}
          isChildExiting={isChildExiting}
          invZoom={invZoom}
        />
      );
    }

    // ─── BLOCK ──
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

    // ─── GROUP (LOD 3) ──
    const userColor = data?.groupColor as string | undefined;
    const userOpacity = (data?.groupOpacity as number) ?? undefined;
    const groupBorderColor = userColor
      ? hexToBorder(userColor)
      : GROUP_BORDER_COLORS[typeSuffix] || 'var(--ice-border-strong)';
    const groupTint = userColor
      ? hexToTint(userColor, userOpacity ?? 0.1)
      : GROUP_TINT_COLORS[typeSuffix] || 'rgba(15, 23, 42, 0.15)';
    const labelColor = userColor || 'var(--ice-text-tertiary)';

    return (
      <GroupLod3
        nodeId={node.id}
        x={x}
        y={y}
        nodeWidth={nodeWidth}
        nodeHeight={nodeHeight}
        displayLabel={displayLabel}
        folded={folded}
        childCount={childCount}
        userColor={userColor}
        groupBorderColor={groupBorderColor}
        groupTint={groupTint}
        labelColor={labelColor}
        isSelected={isSelected}
        isHovered={isHovered}
        isDragOver={isDragOver}
        isChildExiting={isChildExiting}
        connectionDragState={connectionDragState}
        isDragging={isDragging}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onToggleFold={handleToggleFold}
      />
    );
  },
);

SvgGroupNode.displayName = 'SvgGroupNode';

// ─── Re-exports ────────────────────────────────────────────────────────────

export type { SvgGroupNodeProps, BlockNodeProps } from './types';
