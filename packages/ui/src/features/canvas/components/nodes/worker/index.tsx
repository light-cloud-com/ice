/**
 * SvgWorkerNode — Read-only canvas renderer for `Compute.Worker`.
 *
 * Body is a stylised "queue feeds cog" diagram: a row of dashed ticks
 * flowing into a cog glyph. The visual encodes the block's purpose —
 * *something keeps arriving, this thing processes it*. A scale gauge
 * below shows the replica range so the family reads as related to
 * scalable-backend.
 */

import {
  CARD_FOOTER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_PADDING,
} from '@ice/constants';
import { Cog } from 'lucide-react';
import React from 'react';
import { CardShell, ScaleGauge } from '../_shared';
import { t } from '../../../../../i18n';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { COMPUTE_HEADER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_PADDING };

export function computeWorkerHeight(): number {
  return COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
}

const WORKER_ACCENT = '#f59e0b';

const QueueFlow: React.FC<{ color: string }> = ({ color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: 8,
          height: 2,
          borderRadius: 1,
          background: color,
          opacity: 0.25 + i * 0.2,
        }}
      />
    ))}
    <svg width={10} height={10} viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
      <path d="M0 5 L8 5 M5 1 L9 5 L5 9" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  </div>
);

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const metric = (data?.scalingMetric as string) || '';
  const runtime = (data?.runtime as string) || '';
  const size = (data?.size as string) || '';
  const parts = [metric ? `${metric} ${t('canvas.blocks.worker.scalingSuffix')}` : '', size, runtime].filter(Boolean);
  return parts.join(' · ') || t('canvas.blocks.common.unconfigured');
}

export const SvgWorkerNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const min = node.data?.minInstances != null ? Number(node.data.minInstances) : 1;
  const max = node.data?.maxInstances != null ? Number(node.data.maxInstances) : 3;
  const replicas = node.data?.replicas != null ? Number(node.data.replicas) : null;
  const caption = replicas != null ? t('canvas.blocks.worker.replicas', { n: replicas }) : t('canvas.blocks.worker.autoScaled');
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
      icon={Cog}
      accentColor={WORKER_ACCENT}
      title={node.label || t('canvas.blocks.titles.worker')}
      liveConfig={liveConfig}
      headerHeight={COMPUTE_HEADER_HEIGHT}
    >
      <div
        style={{
          height: COMPUTE_BODY_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          justifyContent: 'center',
        }}
        data-testid={`worker-body-${node.id}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <QueueFlow color={WORKER_ACCENT} />
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: `1.5px solid ${WORKER_ACCENT}`,
              background: `${WORKER_ACCENT}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: WORKER_ACCENT,
              flexShrink: 0,
            }}
          >
            <Cog size={12} />
          </div>
        </div>
        <ScaleGauge min={min} max={max} color={WORKER_ACCENT} caption={caption} />
      </div>
    </CardShell>
  );
};

SvgWorkerNode.displayName = 'SvgWorkerNode';
