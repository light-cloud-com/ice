/**
 * SvgMongodbNode — Read-only canvas renderer for `Database.MongoDB`.
 *
 * Body is the `DocumentPills` SVG — rounded blobs laid out in a flow
 * grid, the visual counterpart to postgres/mysql's `TableStripes`.
 * The pill shape encodes "schemaless documents" the way the stripes
 * encode "rows and columns".
 */

import { CARD_FOOTER_HEIGHT, DB_BODY_HEIGHT, DB_HEADER_HEIGHT, DB_PADDING } from '@ice/constants';
import { Database } from 'lucide-react';
import React from 'react';
import { CardShell, DocumentPills } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { DB_HEADER_HEIGHT, DB_BODY_HEIGHT, DB_PADDING };

export function computeMongodbHeight(): number {
  return DB_HEADER_HEIGHT + DB_PADDING + DB_BODY_HEIGHT + DB_PADDING + CARD_FOOTER_HEIGHT;
}

const MONGO_ACCENT = '#10b981';

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
  const shards = data?.shards != null ? `${data.shards} shards` : '';
  const parts = [
    version ? `MongoDB ${version}` : 'MongoDB',
    storage,
    production ? 'HA' : '',
    shards,
  ].filter(Boolean) as string[];
  return parts.join(' · ');
}

export const SvgMongodbNode: React.FC<SvgCompactNodeProps> = ({
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
      accentColor={MONGO_ACCENT}
      title={node.label || 'MongoDB'}
      liveConfig={liveConfig}
      headerHeight={DB_HEADER_HEIGHT}
    >
      <div style={{ height: DB_BODY_HEIGHT, display: 'flex' }} data-testid={`mongo-body-${node.id}`}>
        <DocumentPills color={MONGO_ACCENT} />
      </div>
    </CardShell>
  );
};

SvgMongodbNode.displayName = 'SvgMongodbNode';
