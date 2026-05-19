/**
 * SvgSsrSiteNode — Read-only canvas renderer for `Compute.SSRSite`.
 *
 * Body is a small browser frame (chrome bar with the three traffic-light
 * dots and a faux address bar) with the framework wordmark in the
 * content area — instantly readable as "user-facing web app". The
 * visual deliberately leans into "browser" rather than "container" so
 * users can tell it apart from `scalable-backend` (same iceType family,
 * different vibe).
 */

import { CARD_FOOTER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_HEADER_HEIGHT, COMPUTE_PADDING } from '@ice/constants';
import { LayoutTemplate } from 'lucide-react';
import React from 'react';
import { t } from '../../../../../i18n';
import { CardShell } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';

export { COMPUTE_HEADER_HEIGHT, COMPUTE_BODY_HEIGHT, COMPUTE_PADDING };

export function computeSsrSiteHeight(): number {
  return COMPUTE_HEADER_HEIGHT + COMPUTE_PADDING + COMPUTE_BODY_HEIGHT + COMPUTE_PADDING + CARD_FOOTER_HEIGHT;
}

const SSR_ACCENT = '#a855f7';

const FRAMEWORK_DISPLAY: Record<string, string> = {
  nextjs: 'Next.js',
  next: 'Next.js',
  nuxt: 'Nuxt',
  sveltekit: 'SvelteKit',
  remix: 'Remix',
  astro: 'Astro',
  qwik: 'Qwik',
};

function buildLiveConfig(data: Record<string, unknown> | undefined): string {
  const min = data?.minInstances != null ? Number(data.minInstances) : null;
  const max = data?.maxInstances != null ? Number(data.maxInstances) : null;
  const customDomain = (data?.custom_domain as string) || '';
  const range = min != null && max != null ? `${min}–${max} instances` : '';
  const parts = [range, customDomain].filter(Boolean);
  return parts.join(' · ') || t('canvas.blocks.common.unconfigured');
}

const BrowserFrame: React.FC<{ framework: string; color: string }> = ({ framework, color }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      border: `1px solid ${color}55`,
      borderRadius: 4,
      background: 'var(--ice-bg-base)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}
  >
    {/* Chrome bar with the three traffic-light dots and a faux address bar */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px',
        borderBottom: `1px solid ${color}33`,
        background: `${color}10`,
        flexShrink: 0,
      }}
    >
      {['#ef4444', '#f59e0b', '#22c55e'].map((c) => (
        <span key={c} style={{ width: 6, height: 6, borderRadius: '50%', background: c, opacity: 0.6 }} />
      ))}
      <div style={{ flex: 1, height: 8, marginLeft: 4, borderRadius: 2, background: `${color}22` }} />
    </div>
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
        fontWeight: 600,
        color,
        letterSpacing: '-0.01em',
      }}
    >
      {framework}
    </div>
  </div>
);

export const SvgSsrSiteNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const rawFramework = (node.data?.framework as string) || 'nextjs';
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
      icon={LayoutTemplate}
      accentColor={SSR_ACCENT}
      title={node.label || t('canvas.blocks.titles.ssrSite')}
      liveConfig={liveConfig}
      headerHeight={COMPUTE_HEADER_HEIGHT}
      brandOverride={rawFramework}
    >
      <div style={{ height: COMPUTE_BODY_HEIGHT, display: 'flex' }} data-testid={`ssr-body-${node.id}`}>
        <BrowserFrame framework={framework} color={SSR_ACCENT} />
      </div>
    </CardShell>
  );
};

SvgSsrSiteNode.displayName = 'SvgSsrSiteNode';
