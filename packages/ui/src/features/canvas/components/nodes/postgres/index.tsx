/**
 * SvgPostgresNode — Read-only canvas renderer for `Database.PostgreSQL`.
 *
 * Body is the relational `TableStripes` SVG (stacked horizontal bands
 * with internal column ticks), the visual cue that this block is a
 * row/column store rather than a document store. The mongodb renderer
 * uses `DocumentPills` for the same purpose; mysql shares the
 * `TableStripes` visual but ships its own brand colour.
 */

import { CARD_FOOTER_HEIGHT, DB_BODY_HEIGHT, DB_HEADER_HEIGHT, DB_PADDING } from '@ice/constants';
import { Database } from 'lucide-react';
import React from 'react';
import { CardShell, TableStripes } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { DB_HEADER_HEIGHT, DB_BODY_HEIGHT, DB_PADDING };

export function computePostgresHeight(): number {
  return DB_HEADER_HEIGHT + DB_PADDING + DB_BODY_HEIGHT + DB_PADDING + CARD_FOOTER_HEIGHT;
}

const POSTGRES_ACCENT = '#3b82f6';

/**
 * Pull GB out of the `storage` property, which the panel writes as either
 * a string preset ('20', '500', '1000') or as a number when the "custom"
 * sentinel is picked. Returns `null` when neither shape resolves.
 */
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
  const production = !!data?.production;
  const backups = data?.backup_retention != null ? `${data.backup_retention}d backups` : '';
  const parts = [
    version ? `PostgreSQL ${version}` : 'PostgreSQL',
    storage,
    production ? 'HA' : '',
    backups,
  ].filter(Boolean) as string[];
  return parts.join(' · ');
}

export const SvgPostgresNode: React.FC<SvgCompactNodeProps> = ({
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
      accentColor={POSTGRES_ACCENT}
      title={node.label || 'Postgres'}
      liveConfig={liveConfig}
      headerHeight={DB_HEADER_HEIGHT}
    >
      <div style={{ height: DB_BODY_HEIGHT, display: 'flex' }} data-testid={`pg-body-${node.id}`}>
        <TableStripes color={POSTGRES_ACCENT} />
      </div>
    </CardShell>
  );
};

SvgPostgresNode.displayName = 'SvgPostgresNode';
