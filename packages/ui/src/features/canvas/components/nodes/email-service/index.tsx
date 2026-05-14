/**
 * SvgEmailServiceNode — Read-only canvas renderer for `Messaging.Email`.
 *
 * Shows the configured sender config (from_address, from_name) as static
 * labeled lines. Editing moves to the properties panel.
 */

import { ES_FIELD_HEIGHT, ES_HEADER_HEIGHT, ES_PADDING } from '@ice/constants';
import { Mail } from 'lucide-react';
import React from 'react';
import { CardShell, LabelLine } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { ES_HEADER_HEIGHT, ES_FIELD_HEIGHT, ES_PADDING };

export function computeEmailServiceHeight(): number {
  return ES_HEADER_HEIGHT + ES_PADDING + ES_FIELD_HEIGHT * 2 + 6 + ES_PADDING;
}

export const SvgEmailServiceNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
}) => {
  const fromAddress = (node.data?.from_address as string) || '';
  const fromName = (node.data?.from_name as string) || '';

  const subtitle = fromAddress || 'Transactional';

  return (
    <CardShell
      node={node}
      isSelected={isSelected}
      isDragOver={isDragOver}
      onNodeHover={onNodeHover}
      connectionDragState={connectionDragState}
      icon={Mail}
      title={node.label || 'Email Service'}
      subtitle={subtitle}
      headerHeight={ES_HEADER_HEIGHT}
    >
      <LabelLine label="FROM" value={fromAddress} placeholder="noreply@example.com" />
      <LabelLine label="SENDER" value={fromName} placeholder="My App" mono={false} />
    </CardShell>
  );
};

SvgEmailServiceNode.displayName = 'SvgEmailServiceNode';
