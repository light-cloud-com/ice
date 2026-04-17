/**
 * Log Terminal canvas node.
 *
 * Delegates to the existing SvgLogNode renderer (the live log-stream
 * viewer) — it's already bespoke and fully functional. This wrapper
 * only exists so Log Terminal participates in the per-block registry.
 * Edit the underlying log-node/ files to change the viewer.
 */
import React from 'react';
import { SvgLogNode } from '../log-node';
import type { SvgCompactNodeProps } from '../compact-node/types';

export const SvgLogTerminalNode: React.FC<SvgCompactNodeProps> = ({ node, isSelected, onToggleFold }) => (
  <SvgLogNode node={node} isSelected={isSelected} onToggleFold={onToggleFold} />
);
SvgLogTerminalNode.displayName = 'SvgLogTerminalNode';
