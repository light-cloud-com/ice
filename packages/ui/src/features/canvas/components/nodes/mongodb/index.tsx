/**
 * SvgMongodbNode — Read-only canvas renderer for `Database.MongoDB`.
 *
 * Body shows engine + version big, storage callout, and hardening
 * badges — same identity-body pattern as postgres/mysql. The block's
 * mongodb identity comes from the brand-icon leaf in the header, not
 * from decorative body artwork.
 */

import { CARD_FOOTER_HEIGHT, DB_BODY_HEIGHT, DB_HEADER_HEIGHT, DB_PADDING } from '@ice/constants';
import { Database } from 'lucide-react';
import React from 'react';
import { CardShell } from '../_shared';
import { formatStorage, renderDbIdentityBody } from '../postgres';
import type { SvgCompactNodeProps } from '../compact-node/types';
import { t } from '../../../../../i18n';

export { DB_HEADER_HEIGHT, DB_BODY_HEIGHT, DB_PADDING };

export function computeMongodbHeight(): number {
  return DB_HEADER_HEIGHT + DB_PADDING + DB_BODY_HEIGHT + DB_PADDING + CARD_FOOTER_HEIGHT;
}

const MONGO_ACCENT = '#10b981';

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const version = (data?.version as string) || '';
  const storage = formatStorage(data?.storage ?? data?.storageGb);
  const production = !!data?.production;
  const shards = data?.shards != null ? t('canvas.blocks.database.shardMany', { n: Number(data.shards) }) : '';
  const parts = [
    version ? `${t('canvas.blocks.titles.mongodb')} ${version}` : t('canvas.blocks.titles.mongodb'),
    storage,
    production ? t('canvas.blocks.common.ha') : '',
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
  const data = node.data || {};
  const version = (data.version as string) || '';
  const storage = formatStorage(data.storage ?? data.storageGb);
  const production = !!data.production;
  const shardCount = data.shards != null ? Number(data.shards) : null;
  const badges: Array<{ label: string; color: string }> = [];
  if (production) badges.push({ label: t('canvas.blocks.common.ha'), color: '#22c55e' });
  if (shardCount && shardCount > 0)
    badges.push({
      label:
        shardCount === 1
          ? t('canvas.blocks.database.shardOne')
          : t('canvas.blocks.database.shardMany', { n: shardCount }),
      color: '#10b981',
    });
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
      title={node.label || t('canvas.blocks.titles.mongodb')}
      liveConfig={liveConfig}
      headerHeight={DB_HEADER_HEIGHT}
    >
      {renderDbIdentityBody({
        engineLabel: version
          ? `${t('canvas.blocks.titles.mongodb')} ${version}`
          : t('canvas.blocks.titles.mongodb'),
        storage,
        badges,
        testId: `mongo-body-${node.id}`,
      })}
    </CardShell>
  );
};

SvgMongodbNode.displayName = 'SvgMongodbNode';
