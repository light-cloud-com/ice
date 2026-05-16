/**
 * SvgStaticSiteNode — Read-only canvas renderer for `Compute.StaticSite`.
 *
 * Body is a globe with radial "CDN edge" dots — the metaphor for
 * pre-built files fanning out to edge caches. The framework wordmark
 * sits to the right. Visually distinct from `ssr-site` (which gets a
 * browser frame) because static sites *aren't* a running server: the
 * dots-around-globe shape says "content lives at the edge".
 */

import {
  CARD_FOOTER_HEIGHT,
  COMPUTE_BODY_HEIGHT,
  COMPUTE_HEADER_HEIGHT,
  COMPUTE_PADDING,
} from '@ice/constants';
import { Globe } from 'lucide-react';
import React from 'react';
import { CardShell } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { COMPUTE_HEADER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_PADDING };

export function computeStaticSiteHeight(): number {
  return COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
}

const STATIC_ACCENT = '#06b6d4';

const FRAMEWORK_DISPLAY: Record<string, string> = {
  react: 'React',
  vue: 'Vue',
  angular: 'Angular',
  svelte: 'Svelte',
  astro: 'Astro',
  vite: 'Vite',
  hugo: 'Hugo',
  jekyll: 'Jekyll',
};

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const size = (data?.size as string) || '';
  const customDomain = (data?.custom_domain as string) || (data?.domain as string) || '';
  const fastWw = data?.fast_worldwide;
  const parts = [size, customDomain, fastWw === false ? 'no CDN' : 'global CDN'].filter(Boolean);
  return parts.join(' · ') || 'unconfigured';
}

const GlobeWithEdges: React.FC<{ color: string }> = ({ color }) => {
  const size = 56;
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - 8) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }} aria-hidden="true">
      {/* Globe */}
      <circle cx={cx} cy={cy} r={10} fill={`${color}22`} stroke={color} strokeWidth={1} />
      {/* Latitude + meridian */}
      <ellipse cx={cx} cy={cy} rx={10} ry={4} fill="none" stroke={`${color}55`} strokeWidth={0.6} />
      <ellipse cx={cx} cy={cy} rx={4} ry={10} fill="none" stroke={`${color}55`} strokeWidth={0.6} />
      {/* CDN edges */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const ex = cx + radius * Math.cos(rad);
        const ey = cy + radius * Math.sin(rad);
        return (
          <g key={deg}>
            <line
              x1={cx + 11 * Math.cos(rad)}
              y1={cy + 11 * Math.sin(rad)}
              x2={ex}
              y2={ey}
              stroke={`${color}33`}
              strokeWidth={0.5}
              strokeDasharray="1.5 1.5"
            />
            <circle cx={ex} cy={ey} r={2} fill={color} opacity={0.85} />
          </g>
        );
      })}
    </svg>
  );
};

export const SvgStaticSiteNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const rawFramework = (node.data?.framework as string) || 'react';
  const framework = FRAMEWORK_DISPLAY[rawFramework.toLowerCase()] || rawFramework;
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
      icon={Globe}
      accentColor={STATIC_ACCENT}
      title={node.label || 'Static Site'}
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
        data-testid={`static-body-${node.id}`}
      >
        <GlobeWithEdges color={STATIC_ACCENT} />
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
            framework
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: STATIC_ACCENT,
              fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
            }}
            data-testid={`static-framework-${node.id}`}
          >
            {framework}
          </span>
          <span
            style={{
              fontSize: 10,
              color: 'var(--ice-text-tertiary)',
              opacity: 0.6,
            }}
          >
            served from edge
          </span>
        </div>
      </div>
    </CardShell>
  );
};

SvgStaticSiteNode.displayName = 'SvgStaticSiteNode';
