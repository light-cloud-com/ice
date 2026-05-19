/**
 * SvgScalableBackendNode — Read-only canvas renderer for `Compute.Container`.
 *
 * The body is a horizontal `ScaleGauge` (min ↔ max instances) — the one
 * piece of information that distinguishes a "backend that auto-scales"
 * from any other compute block. The caption under the gauge surfaces
 * the scaling metric and threshold the user picked in the properties
 * panel (CPU 70%, memory 80%, etc.).
 */

import {
  CARD_FOOTER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_PADDING,
} from '@ice/constants';
import { Server } from 'lucide-react';
import React from 'react';
import { CardShell, ScaleGauge } from '../_shared';
import { t } from '../../../../../i18n';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { COMPUTE_HEADER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_PADDING };

export function computeScalableBackendHeight(): number {
  return COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
}

const BACKEND_ACCENT = '#22c55e';

function buildCaption(data: Record<string, unknown> | undefined): string {
  const metric = (data?.scalingMetric as string) || '';
  const threshold = data?.scalingThreshold;
  if (!metric) return '';
  if (threshold == null || threshold === '') return metric;
  return `${metric} ${threshold}%`;
}

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const min = data?.minInstances != null ? Number(data.minInstances) : null;
  const max = data?.maxInstances != null ? Number(data.maxInstances) : null;
  const runtime = (data?.runtime as string) || '';
  const size = (data?.size as string) || '';
  const range = min != null && max != null ? `${min}–${max} ${t('canvas.blocks.scalableBackend.instancesRange')}` : '';
  const parts = [range, size, runtime].filter(Boolean);
  return parts.join(' · ') || t('canvas.blocks.common.unconfigured');
}

export const SvgScalableBackendNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const min = node.data?.minInstances != null ? Number(node.data.minInstances) : 1;
  const max = node.data?.maxInstances != null ? Number(node.data.maxInstances) : 10;
  const caption = buildCaption(node.data);
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
      icon={Server}
      accentColor={BACKEND_ACCENT}
      title={node.label || t('canvas.blocks.titles.scalableBackend')}
      liveConfig={liveConfig}
      headerHeight={COMPUTE_HEADER_HEIGHT}
    >
      <div
        style={{ height: COMPUTE_BODY_HEIGHT, display: 'flex', alignItems: 'center' }}
        data-testid={`backend-body-${node.id}`}
      >
        <ScaleGauge min={min} max={max} color={BACKEND_ACCENT} caption={caption} />
      </div>
    </CardShell>
  );
};

SvgScalableBackendNode.displayName = 'SvgScalableBackendNode';
