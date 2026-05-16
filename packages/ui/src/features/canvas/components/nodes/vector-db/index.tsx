/**
 * SvgVectorDbNode — Read-only canvas renderer for `AI.VectorDB`.
 *
 * Body is a procedural dot cloud — visually evocative of a t-SNE plot,
 * the canonical illustration of vector embeddings. Dimensions and
 * distance metric land in the live-config footer (1536-d · cosine).
 *
 * The dots are positioned by a deterministic pseudo-random seed based
 * on a constant so the cloud looks consistent across renders — we don't
 * want flicker when the user nudges unrelated fields.
 */

import {
  CARD_FOOTER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_PADDING,
} from '@ice/constants';
import { Target } from 'lucide-react';
import React from 'react';
import { CardShell } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { COMPUTE_HEADER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_PADDING };

export function computeVectorDbHeight(): number {
  return COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
}

const VECTOR_ACCENT = '#a855f7';

const METRIC_LABELS: Record<string, string> = {
  cosine: 'cosine',
  euclidean: 'euclidean',
  l2: 'L2',
  dot: 'dot product',
  ip: 'inner product',
};

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const dimensions = data?.dimensions != null ? `${data.dimensions}-d` : '';
  const metricRaw = ((data?.metric as string) || '').toLowerCase();
  const metric = metricRaw ? METRIC_LABELS[metricRaw] || metricRaw : '';
  const parts = [dimensions, metric].filter(Boolean);
  return parts.join(' · ') || 'unconfigured';
}

// Deterministic seed → 24 (x, y) dots in [4, 96]². The seed is a
// constant so the cloud doesn't shimmer as unrelated props change. A
// simple LCG is plenty for visual placement.
const DOTS = (() => {
  let s = 0x1f3b;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 8) & 0xffffff;
  };
  return Array.from({ length: 28 }).map(() => ({
    x: 4 + (next() % 92),
    y: 4 + (next() % 60),
    r: 1 + ((next() % 3) * 0.5),
    a: 0.4 + (next() % 60) / 100,
  }));
})();

const DotCloud: React.FC<{ color: string }> = ({ color }) => (
  <svg
    viewBox="0 0 100 64"
    preserveAspectRatio="none"
    width="100%"
    height="100%"
    style={{ display: 'block', flex: 1 }}
    aria-hidden="true"
  >
    {/* Faint axes — encodes "vector space" without taking visual weight */}
    <line x1={0} y1={32} x2={100} y2={32} stroke={`${color}20`} strokeWidth={0.4} strokeDasharray="1 2" />
    <line x1={50} y1={0} x2={50} y2={64} stroke={`${color}20`} strokeWidth={0.4} strokeDasharray="1 2" />
    {DOTS.map((d, i) => (
      <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={color} opacity={d.a} />
    ))}
  </svg>
);

export const SvgVectorDbNode: React.FC<SvgCompactNodeProps> = ({
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
      icon={Target}
      accentColor={VECTOR_ACCENT}
      title={node.label || 'Vector DB'}
      liveConfig={liveConfig}
      headerHeight={COMPUTE_HEADER_HEIGHT}
    >
      <div style={{ height: COMPUTE_BODY_HEIGHT, display: 'flex' }} data-testid={`vector-body-${node.id}`}>
        <DotCloud color={VECTOR_ACCENT} />
      </div>
    </CardShell>
  );
};

SvgVectorDbNode.displayName = 'SvgVectorDbNode';
