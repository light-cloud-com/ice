/**
 * SvgServerlessFunctionNode — Read-only canvas renderer for
 * `Compute.ServerlessFunction`.
 *
 * Body is a central lightning bolt wrapped in a dashed halo — the halo
 * is the visual cue for "scales to zero / cold-start". The trigger pill
 * (HTTP / Schedule / Pub/Sub / Storage) sits to the right. Memory and
 * timeout land in the status footer since they're per-invocation knobs
 * rather than identity-defining.
 */

import { CARD_FOOTER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_HEADER_HEIGHT, COMPUTE_PADDING } from '@ice/constants';
import { Zap } from 'lucide-react';
import React from 'react';
import { t } from '../../../../../i18n';
import { CardShell } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { COMPUTE_HEADER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_PADDING };

export function computeServerlessFunctionHeight(): number {
  return COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
}

const FN_ACCENT = '#eab308';

function getTriggerLabel(key: string): string | undefined {
  switch (key) {
    case 'http':
      return t('canvas.blocks.function.triggerHttp');
    case 'schedule':
      return t('canvas.blocks.function.triggerSchedule');
    case 'pubsub':
    case 'pub-sub':
      return t('canvas.blocks.function.triggerPubsub');
    case 'storage':
      return t('canvas.blocks.function.triggerStorage');
    case 'queue':
      return t('canvas.blocks.function.triggerQueue');
    default:
      return undefined;
  }
}

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const memory =
    data?.memory != null && data.memory !== ''
      ? t('canvas.blocks.function.memoryMb', { n: data.memory as string | number })
      : '';
  const timeout =
    data?.timeout != null && data.timeout !== ''
      ? t('canvas.blocks.function.timeoutSeconds', { n: data.timeout as string | number })
      : '';
  const runtime = (data?.runtime as string) || '';
  const parts = [memory, timeout, runtime].filter(Boolean);
  return parts.join(' · ') || t('canvas.blocks.common.unconfigured');
}

const BoltHalo: React.FC<{ color: string }> = ({ color }) => {
  const size = 56;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }} aria-hidden="true">
      {/* Dashed cold-start halo */}
      <circle
        cx={cx}
        cy={cy}
        r={(size - 4) / 2}
        fill="none"
        stroke={`${color}55`}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <circle cx={cx} cy={cy} r={(size - 16) / 2} fill={`${color}15`} stroke={`${color}55`} strokeWidth={0.7} />
      {/* Bolt path centred */}
      <path
        d={`M ${cx - 1} ${cy - 12} L ${cx - 9} ${cy + 2} L ${cx - 2} ${cy + 2} L ${cx + 1} ${cy + 12} L ${cx + 9} ${cy - 2} L ${cx + 2} ${cy - 2} Z`}
        fill={color}
        opacity={0.95}
      />
    </svg>
  );
};

export const SvgServerlessFunctionNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const rawTrigger = (node.data?.trigger as string) || 'http';
  const triggerLabel = getTriggerLabel(rawTrigger.toLowerCase()) || rawTrigger;
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
      accentColor={FN_ACCENT}
      title={node.label || t('canvas.blocks.titles.serverlessFunction')}
      liveConfig={liveConfig}
      headerHeight={COMPUTE_HEADER_HEIGHT}
    >
      <div
        style={{
          height: COMPUTE_BODY_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}
        data-testid={`fn-body-${node.id}`}
      >
        <BoltHalo color={FN_ACCENT} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span
            style={{
              fontSize: 10,
              fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
              color: 'var(--ice-text-tertiary)',
              opacity: 0.7,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {t('canvas.blocks.function.trigger')}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: FN_ACCENT,
              fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
            }}
            data-testid={`fn-trigger-${node.id}`}
          >
            {triggerLabel}
          </span>
          <span
            style={{
              fontSize: 10,
              color: 'var(--ice-text-tertiary)',
              opacity: 0.6,
            }}
          >
            {t('canvas.blocks.function.scalesToZero')}
          </span>
        </div>
      </div>
    </CardShell>
  );
};

SvgServerlessFunctionNode.displayName = 'SvgServerlessFunctionNode';
