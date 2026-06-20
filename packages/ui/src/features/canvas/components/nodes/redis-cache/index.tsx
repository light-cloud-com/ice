/**
 * SvgRedisCacheNode — Read-only canvas renderer for `Database.Redis`.
 *
 * Body is a memory-bar visual + a thin pulse line — the cue for "fast,
 * in-memory, volatile" that distinguishes Redis from disk-backed
 * databases. Memory size, eviction policy, and persistence land in the
 * live-config footer.
 */

import { CARD_FOOTER_HEIGHT, DB_BODY_HEIGHT, DB_HEADER_HEIGHT, DB_PADDING } from '@ice/constants';
import { Zap } from 'lucide-react';
import React from 'react';
import { t } from '../../../../../i18n';
import { CardShell } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { DB_HEADER_HEIGHT, DB_BODY_HEIGHT, DB_PADDING };

export function computeRedisCacheHeight(): number {
  return DB_HEADER_HEIGHT + DB_PADDING + DB_BODY_HEIGHT + DB_PADDING + CARD_FOOTER_HEIGHT;
}

// CNV6 — Redis's brand red, deliberately NOT the system error red (#ef4444,
// used by the validation/deploy-error treatments) so an idle Redis block doesn't
// read as "errored". Brand colour keeps it recognisable without the collision.
const REDIS_ACCENT = '#d82c20';

function formatMemory(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1024) {
    const gb = n / 1024;
    return t('canvas.blocks.redis.memoryGb', { n: Number.isInteger(gb) ? gb : Number(gb.toFixed(1)) });
  }
  return t('canvas.blocks.redis.memoryMb', { n });
}

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const version = (data?.version as string) || '';
  const memory = formatMemory(data?.memoryMb ?? data?.memory);
  const eviction = (data?.eviction as string) || '';
  const persistence = data?.persistence;
  const parts = [
    version ? `${t('canvas.blocks.titles.redis')} ${version}` : t('canvas.blocks.titles.redis'),
    memory,
    eviction,
    persistence === true ? t('canvas.blocks.redis.persistent') : '',
  ].filter(Boolean) as string[];
  return parts.join(' · ');
}

const MemoryPulse: React.FC<{ color: string }> = ({ color }) => (
  <svg
    viewBox="0 0 100 40"
    preserveAspectRatio="none"
    width="100%"
    height="100%"
    style={{ display: 'block', flex: 1 }}
    aria-hidden="true"
  >
    {/* Memory blocks — uniform "in-memory" bars */}
    {Array.from({ length: 10 }).map((_, i) => (
      <rect
        key={i}
        x={i * 10}
        y={4}
        width={8}
        height={14}
        rx={1.5}
        fill={`${color}20`}
        stroke={`${color}55`}
        strokeWidth={0.5}
      />
    ))}
    {/* Pulse line — the "live, sub-ms reads" cue */}
    <path
      d="M 0 30 L 12 30 L 16 22 L 20 38 L 26 30 L 50 30 L 54 24 L 58 36 L 64 30 L 100 30"
      fill="none"
      stroke={color}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.9}
    />
  </svg>
);

export const SvgRedisCacheNode: React.FC<SvgCompactNodeProps> = ({
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
      icon={Zap}
      accentColor={REDIS_ACCENT}
      title={node.label || t('canvas.blocks.titles.redis')}
      liveConfig={liveConfig}
      headerHeight={DB_HEADER_HEIGHT}
    >
      <div style={{ height: DB_BODY_HEIGHT, display: 'flex' }} data-testid={`redis-body-${node.id}`}>
        <MemoryPulse color={REDIS_ACCENT} />
      </div>
    </CardShell>
  );
};

SvgRedisCacheNode.displayName = 'SvgRedisCacheNode';
