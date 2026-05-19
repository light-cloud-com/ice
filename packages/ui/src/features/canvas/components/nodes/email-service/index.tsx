/**
 * SvgEmailServiceNode — Read-only canvas renderer for `Messaging.Email`.
 *
 * Shows the configured sender config (from_address, from_name) as static
 * labeled lines. Editing moves to the properties panel.
 */

import { CARD_FOOTER_HEIGHT, ES_FIELD_HEIGHT, ES_HEADER_HEIGHT, ES_PADDING } from '@ice/constants';
import { Mail } from 'lucide-react';
import React from 'react';
import { t } from '../../../../../i18n';
import { CardShell, LabelLine } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { ES_HEADER_HEIGHT, ES_FIELD_HEIGHT, ES_PADDING };

export function computeEmailServiceHeight(): number {
  return ES_HEADER_HEIGHT + ES_PADDING + ES_FIELD_HEIGHT * 2 + 6 + ES_PADDING + CARD_FOOTER_HEIGHT;
}

export const SvgEmailServiceNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const fromAddress = (node.data?.from_address as string) || '';
  const fromName = (node.data?.from_name as string) || '';

  const liveConfig = fromAddress || t('canvas.blocks.email.transactional');

  return (
    <CardShell
      node={node}
      isSelected={isSelected}
      isDragOver={isDragOver}
      onNodeHover={onNodeHover}
      connectionDragState={connectionDragState}
      lod={lod}
      pipelineStatus={pipelineStatus}
      icon={Mail}
      title={node.label || t('canvas.blocks.titles.emailService')}
      liveConfig={liveConfig}
      headerHeight={ES_HEADER_HEIGHT}
    >
      <LabelLine label={t('canvas.blocks.email.from')} value={fromAddress} placeholder="noreply@example.com" />
      <LabelLine label={t('canvas.blocks.email.sender')} value={fromName} placeholder="My App" mono={false} />
    </CardShell>
  );
};

SvgEmailServiceNode.displayName = 'SvgEmailServiceNode';
