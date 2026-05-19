/**
 * SvgSecretStoreNode — Read-only canvas renderer for `Security.Secret`.
 *
 * Shows only the configured KEY names. Values are never rendered on the
 * canvas — not even masked dots — so sensitive data can't leak to
 * onlookers. Editing moves to the properties panel.
 */

import { CARD_FOOTER_HEIGHT, SS_HEADER_HEIGHT, SS_PADDING, SS_ROW_HEIGHT } from '@ice/constants';
import { Lock } from 'lucide-react';
import React from 'react';
import { CardShell, EmptyHint, KvLine } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { SS_HEADER_HEIGHT, SS_ROW_HEIGHT, SS_PADDING };

export function computeSecretStoreHeight(data: Record<string, unknown>): number {
  const rows = (data?.secrets as unknown[] | undefined) || [];
  const rowCount = Math.max(rows.length, 1);
  return SS_HEADER_HEIGHT + SS_PADDING + rowCount * SS_ROW_HEIGHT + SS_PADDING + CARD_FOOTER_HEIGHT;
}

function parseSecretKey(raw: unknown): string {
  if (typeof raw === 'object' && raw !== null) {
    return String((raw as Record<string, unknown>).key ?? '');
  }
  if (typeof raw === 'string') return raw;
  return '';
}

export const SvgSecretStoreNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const keys = ((node.data?.secrets as unknown[] | undefined) || []).map(parseSecretKey).filter(Boolean);

  const autoRotate = !!node.data?.auto_rotate;
  const liveConfig =
    keys.length === 0
      ? 'No secrets yet'
      : `${keys.length} ${keys.length === 1 ? 'secret' : 'secrets'}${autoRotate ? ' · auto-rotate' : ''}`;

  return (
    <CardShell
      node={node}
      isSelected={isSelected}
      isDragOver={isDragOver}
      onNodeHover={onNodeHover}
      connectionDragState={connectionDragState}
      lod={lod}
      pipelineStatus={pipelineStatus}
      icon={Lock}
      title={node.label || 'Secret Store'}
      liveConfig={liveConfig}
      headerHeight={SS_HEADER_HEIGHT}
    >
      {keys.length === 0 ? (
        <EmptyHint message="edit in properties →" />
      ) : (
        keys.map((k, i) => <KvLine key={i} name={k} bullet />)
      )}
    </CardShell>
  );
};

SvgSecretStoreNode.displayName = 'SvgSecretStoreNode';
