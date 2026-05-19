/**
 * SvgMysqlNode — Read-only canvas renderer for `Database.MySQL`.
 *
 * Same `TableStripes` body as postgres — both are row/column stores
 * and the visual reinforces that family. Differentiated by the cyan
 * accent (dolphin nod) so users can tell them apart at a glance on
 * a canvas full of databases.
 */

import { CARD_FOOTER_HEIGHT, DB_BODY_HEIGHT, DB_HEADER_HEIGHT, DB_PADDING } from '@ice/constants';
import { Database } from 'lucide-react';
import React from 'react';
import { CardShell, TableStripes } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { DB_HEADER_HEIGHT, DB_BODY_HEIGHT, DB_PADDING };

export function computeMysqlHeight(): number {
  return DB_HEADER_HEIGHT + DB_PADDING + DB_BODY_HEIGHT + DB_PADDING + CARD_FOOTER_HEIGHT;
}

const MYSQL_ACCENT = '#06b6d4';

function formatStorage(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw === 'custom') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1000) {
    const tb = n / 1000;
    return Number.isInteger(tb) ? `${tb} TB` : `${tb.toFixed(1)} TB`;
  }
  return `${n} GB`;
}

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const version = (data?.version as string) || '';
  const storage = formatStorage(data?.storage ?? data?.storageGb);
  const production = !!data?.production || !!data?.backups;
  const backups = data?.backup_retention != null ? `${data.backup_retention}d backups` : '';
  const parts = [
    version ? `MySQL ${version}` : 'MySQL',
    storage,
    production ? 'HA' : '',
    backups,
  ].filter(Boolean) as string[];
  return parts.join(' · ');
}

export const SvgMysqlNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const liveConfig = buildLiveConfig(node.data);

  return (
    <CardShell
      node={node}
      isSelected={isSelected}
      isDragOver={isDragOver}
      onNodeHover={onNodeHover}
      connectionDragState={connectionDragState}
      lod={lod}
      pipelineStatus={pipelineStatus}
      icon={Database}
      accentColor={MYSQL_ACCENT}
      title={node.label || 'MySQL'}
      liveConfig={liveConfig}
      headerHeight={DB_HEADER_HEIGHT}
    >
      <div style={{ height: DB_BODY_HEIGHT, display: 'flex' }} data-testid={`mysql-body-${node.id}`}>
        <TableStripes color={MYSQL_ACCENT} />
      </div>
    </CardShell>
  );
};

SvgMysqlNode.displayName = 'SvgMysqlNode';
