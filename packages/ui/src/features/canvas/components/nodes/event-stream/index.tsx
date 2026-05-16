/**
 * SvgEventStreamNode — Read-only canvas renderer for `Messaging.EventStream`.
 *
 * Body is a "broadcast" diagram: a central source pulsing radial rings
 * outward, with three downstream arrows fanning toward where consumers
 * would sit. This visual is the inverse of a queue (one→one) — it says
 * "one event reaches many at once". Live retention + throughput settings
 * land in the live-config footer.
 */

import {
  CARD_FOOTER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_PADDING,
} from '@ice/constants';
import { Radio } from 'lucide-react';
import React from 'react';
import { CardShell } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { COMPUTE_HEADER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_PADDING };

export function computeEventStreamHeight(): number {
  return COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
}

const STREAM_ACCENT = '#ec4899';

const RETENTION_LABELS: Record<string, string> = {
  '24h': '24 hours',
  '1d': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  '365d': '365 days',
};

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const sizeRaw = (data?.size as string) || '';
  const retentionRaw = ((data?.retention as string) || '').trim();
  const retention =
    retentionRaw || (data?.retentionHours != null ? `${data.retentionHours}h` : '');
  const retentionLabel = retention ? RETENTION_LABELS[retention.toLowerCase()] || retention : '';
  const partitions = data?.partitionCount != null ? `${data.partitionCount} partitions` : '';
  const parts = [
    sizeRaw,
    retentionLabel ? `${retentionLabel} retention` : '',
    partitions,
  ].filter(Boolean);
  return parts.join(' · ') || 'unconfigured';
}

const FanOut: React.FC<{ color: string }> = ({ color }) => {
  const size = 56;
  const cx = size / 2;
  const cy = size / 2 - 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }} aria-hidden="true">
      {/* Concentric rings — broadcast metaphor */}
      {[10, 16, 22].map((r, i) => (
        <circle
          key={r}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={0.8}
          opacity={0.5 - i * 0.12}
          strokeDasharray={i === 0 ? undefined : '2 2'}
        />
      ))}
      {/* Central source */}
      <circle cx={cx} cy={cy} r={3.5} fill={color} />
      {/* Fan-out arrows (3 consumers diverging downward) */}
      {[-30, 0, 30].map((deg) => {
        const rad = ((90 + deg) * Math.PI) / 180;
        const ex = cx + 26 * Math.cos(rad);
        const ey = cy + 26 * Math.sin(rad);
        return (
          <g key={deg}>
            <line
              x1={cx + 8 * Math.cos(rad)}
              y1={cy + 8 * Math.sin(rad)}
              x2={ex}
              y2={ey}
              stroke={color}
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.85}
            />
            <circle cx={ex} cy={ey} r={1.6} fill={color} />
          </g>
        );
      })}
    </svg>
  );
};

export const SvgEventStreamNode: React.FC<SvgCompactNodeProps> = ({
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
      icon={Radio}
      accentColor={STREAM_ACCENT}
      title={node.label || 'Event Stream'}
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
        data-testid={`stream-body-${node.id}`}
      >
        <FanOut color={STREAM_ACCENT} />
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
            broadcasts to
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: STREAM_ACCENT,
              fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
            }}
            data-testid={`stream-fanout-${node.id}`}
          >
            many consumers
          </span>
          <span
            style={{
              fontSize: 10,
              color: 'var(--ice-text-tertiary)',
              opacity: 0.6,
            }}
          >
            one event · many readers
          </span>
        </div>
      </div>
    </CardShell>
  );
};

SvgEventStreamNode.displayName = 'SvgEventStreamNode';
