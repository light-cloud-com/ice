/**
 * SvgPostgresNode — Read-only canvas renderer for `Database.PostgreSQL`.
 *
 * Body shows the two facts a user wants at a glance: engine + version
 * (big) and disk storage (smaller, alongside). Hardening flags surface
 * as compact badges underneath when set (HA from `production`, backup
 * retention from `backup_retention`). When the block is deployed,
 * `CardShell` automatically renders the connection URL below.
 *
 * Previous iterations rendered decorative "table stripes" in the body;
 * removed because they suggested but didn't represent anything real
 * (the canvas can't introspect the DB to list actual tables).
 */

import { CARD_FOOTER_HEIGHT, DB_BODY_HEIGHT, DB_HEADER_HEIGHT, DB_PADDING } from '@ice/constants';
import { Database } from 'lucide-react';
import React from 'react';
import { CardShell } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';
import { t } from '../../../../../i18n';

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
export function formatStorage(raw: unknown): string | null {
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
  const backups =
    data?.backup_retention != null
      ? t('canvas.blocks.database.backupsDays', { n: Number(data.backup_retention) })
      : '';
  const parts = [
    version ? `${t('canvas.blocks.titles.postgres')} ${version}` : t('canvas.blocks.titles.postgres'),
    storage,
    production ? t('canvas.blocks.common.ha') : '',
    backups,
  ].filter(Boolean) as string[];
  return parts.join(' · ');
}

/**
 * Render the identity body (engine + version + storage + badges)
 * inline so the shallow tree-walker in tests can descend through it.
 * Sub-components would hide the testids/text from the walker.
 */
export function renderDbIdentityBody(args: {
  engineLabel: string;
  storage: string | null;
  badges: Array<{ label: string; color: string }>;
  testId?: string;
}): React.ReactElement {
  const { engineLabel, storage, badges, testId } = args;
  return (
    <div
      style={{
        height: DB_BODY_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 4,
      }}
      data-testid={testId}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ice-text-1)',
            fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {engineLabel}
        </span>
        {storage && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--ice-text-tertiary)',
              fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
              flexShrink: 0,
            }}
          >
            {storage}
          </span>
        )}
      </div>
      {badges.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {badges.map((b) => (
            <span
              key={b.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 6px',
                borderRadius: 8,
                fontSize: 9,
                fontWeight: 600,
                fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                letterSpacing: '0.04em',
                background: `${b.color}18`,
                color: b.color,
                border: `1px solid ${b.color}55`,
              }}
            >
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export const SvgPostgresNode: React.FC<SvgCompactNodeProps> = ({
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
  const backups =
    data.backup_retention != null
      ? t('canvas.blocks.database.backupsDays', { n: Number(data.backup_retention) })
      : '';
  const badges: Array<{ label: string; color: string }> = [];
  if (production) badges.push({ label: t('canvas.blocks.common.ha'), color: '#22c55e' });
  if (backups) badges.push({ label: backups, color: '#3b82f6' });
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
      title={node.label || t('canvas.blocks.titles.postgresShort')}
      liveConfig={liveConfig}
      headerHeight={DB_HEADER_HEIGHT}
    >
      {renderDbIdentityBody({
        engineLabel: version
          ? `${t('canvas.blocks.titles.postgres')} ${version}`
          : t('canvas.blocks.titles.postgres'),
        storage,
        badges,
        testId: `pg-body-${node.id}`,
      })}
    </CardShell>
  );
};

SvgPostgresNode.displayName = 'SvgPostgresNode';
