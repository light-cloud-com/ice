/**
 * SvgMysqlNode — Read-only canvas renderer for `Database.MySQL`.
 *
 * Body shows engine + version big, storage callout, and hardening
 * badges — same identity-body pattern as postgres (the renderer
 * imports `DbIdentityBody` from the postgres module to keep the two
 * blocks visually consistent). Differentiated from postgres by the
 * cyan accent (dolphin nod) and the wordmark text.
 */

import { CARD_FOOTER_HEIGHT, DB_BODY_HEIGHT, DB_HEADER_HEIGHT, DB_PADDING } from '@ice/constants';
import { Database } from 'lucide-react';
import React from 'react';
import { CardShell } from '../_shared';
import { formatStorage, renderDbIdentityBody } from '../postgres';
import type { SvgCompactNodeProps } from '../compact-node/types';
import { t } from '../../../../../i18n';

export { DB_HEADER_HEIGHT, DB_BODY_HEIGHT, DB_PADDING };

export function computeMysqlHeight(): number {
  return DB_HEADER_HEIGHT + DB_PADDING + DB_BODY_HEIGHT + DB_PADDING + CARD_FOOTER_HEIGHT;
}

const MYSQL_ACCENT = '#06b6d4';

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const version = (data?.version as string) || '';
  const storage = formatStorage(data?.storage ?? data?.storageGb);
  const production = !!data?.production || !!data?.backups;
  const backups =
    data?.backup_retention != null
      ? t('canvas.blocks.database.backupsDays', { n: Number(data.backup_retention) })
      : '';
  const parts = [
    version ? `${t('canvas.blocks.titles.mysql')} ${version}` : t('canvas.blocks.titles.mysql'),
    storage,
    production ? t('canvas.blocks.common.ha') : '',
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
  const data = node.data || {};
  const version = (data.version as string) || '';
  const storage = formatStorage(data.storage ?? data.storageGb);
  const production = !!data.production || !!data.backups;
  const backups =
    data.backup_retention != null
      ? t('canvas.blocks.database.backupsDays', { n: Number(data.backup_retention) })
      : '';
  const badges: Array<{ label: string; color: string }> = [];
  if (production) badges.push({ label: t('canvas.blocks.common.ha'), color: '#22c55e' });
  if (backups) badges.push({ label: backups, color: '#06b6d4' });
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
      title={node.label || t('canvas.blocks.titles.mysql')}
      liveConfig={liveConfig}
      headerHeight={DB_HEADER_HEIGHT}
    >
      {renderDbIdentityBody({
        engineLabel: version
          ? `${t('canvas.blocks.titles.mysql')} ${version}`
          : t('canvas.blocks.titles.mysql'),
        storage,
        badges,
        testId: `mysql-body-${node.id}`,
      })}
    </CardShell>
  );
};

SvgMysqlNode.displayName = 'SvgMysqlNode';
