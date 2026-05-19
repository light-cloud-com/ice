/**
 * SvgApiGatewayNode — Read-only canvas renderer for `Network.Gateway`.
 *
 * Body shows the configured route paths as stacked rows — each path
 * lives in mono with an arrow on the right indicating "routes through".
 * The protocol (HTTP API / REST / WebSocket / API Management / Cloud
 * API Gateway) lands as a prominent pill above the routes so the
 * gateway type is readable at a glance. Route count and auth state
 * surface in the live-config footer.
 *
 * Routes come from `node.data.routes: string[]`, written by the
 * properties-panel ListField. Empty state replaces the rows with a
 * "no routes yet" hint so the block reads as "needs setup".
 */

import {
  AG_HEADER_HEIGHT,
  AG_PADDING,
  AG_ROW_GAP,
  AG_ROW_HEIGHT,
  CARD_FOOTER_HEIGHT,
} from '@ice/constants';
import { Router } from 'lucide-react';
import React from 'react';
import { CardShell } from '../_shared';
import type { SvgCompactNodeProps } from '../compact-node/types';
import { t } from '../../../../../i18n';

export { AG_HEADER_HEIGHT, AG_ROW_HEIGHT, AG_ROW_GAP, AG_PADDING };

const VISIBLE_ROUTES = 3;

export function computeApiGatewayHeight(data: Record<string, unknown>): number {
  const routes = (data?.routes as unknown[] | undefined) || [];
  const rows = Math.min(Math.max(routes.length, 1), VISIBLE_ROUTES);
  // Protocol pill row + routes block.
  const protocolRow = 22;
  return (
    AG_HEADER_HEIGHT +
    AG_PADDING +
    protocolRow +
    AG_ROW_GAP +
    rows * (AG_ROW_HEIGHT + AG_ROW_GAP) -
    AG_ROW_GAP +
    AG_PADDING +
    CARD_FOOTER_HEIGHT
  );
}

const GATEWAY_ACCENT = '#0ea5e9';

function getProtocolLabel(k: string): string | undefined {
  switch (k) {
    case 'http':
      return t('canvas.blocks.gateway.protoHttpApi');
    case 'rest':
      return t('canvas.blocks.gateway.protoRest');
    case 'websocket':
      return t('canvas.blocks.gateway.protoWebsocket');
    case 'gcp-api-gw':
      return t('canvas.blocks.gateway.protoCloudApi');
    case 'azure-consumption':
      return t('canvas.blocks.gateway.protoAzureConsumption');
    case 'azure-standard':
      return t('canvas.blocks.gateway.protoAzureStandard');
    default:
      return undefined;
  }
}

function buildLiveConfig(data: Record<string, unknown> | undefined, routeCount: number): string {
  const auth = data?.login_required;
  const parts = [
    routeCount > 0
      ? routeCount === 1
        ? t('canvas.blocks.gateway.routeOne')
        : t('canvas.blocks.gateway.routeMany', { n: routeCount })
      : t('canvas.blocks.gateway.noRoutes'),
    auth ? t('canvas.blocks.gateway.authRequired') : t('canvas.blocks.gateway.publicAccess'),
  ].filter(Boolean);
  return parts.join(' · ');
}

function parseRoute(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const path = (raw as { path?: string }).path;
    if (typeof path === 'string') return path.trim();
  }
  return '';
}

export const SvgApiGatewayNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  lod,
  pipelineStatus,
}) => {
  const protocolRaw = ((node.data?.protocol as string) || '').toLowerCase();
  const protocolLabel = protocolRaw ? getProtocolLabel(protocolRaw) || protocolRaw : 'no protocol';
  const routes = ((node.data?.routes as unknown[] | undefined) || []).map(parseRoute).filter(Boolean);
  const visibleRoutes = routes.slice(0, VISIBLE_ROUTES);
  const hiddenCount = Math.max(routes.length - VISIBLE_ROUTES, 0);
  const liveConfig = buildLiveConfig(node.data, routes.length);

  return (
    <CardShell
      node={node}
      isSelected={isSelected}
      isDragOver={isDragOver}
      onNodeHover={onNodeHover}
      connectionDragState={connectionDragState}
      lod={lod}
      pipelineStatus={pipelineStatus}
      icon={Router}
      accentColor={GATEWAY_ACCENT}
      title={node.label || t('canvas.blocks.titles.apiGateway')}
      liveConfig={liveConfig}
      headerHeight={AG_HEADER_HEIGHT}
    >
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}
        data-testid={`gateway-body-${node.id}`}
      >
        {/* Protocol pill — gateway type as the visual anchor */}
        <div
          style={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            alignItems: 'center',
            gap: 6,
            padding: '3px 8px',
            borderRadius: 10,
            background: `${GATEWAY_ACCENT}18`,
            border: `1px solid ${GATEWAY_ACCENT}55`,
            fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
            fontSize: 10,
            fontWeight: 600,
            color: GATEWAY_ACCENT,
            letterSpacing: '0.02em',
            flexShrink: 0,
          }}
          data-testid={`gateway-protocol-${node.id}`}
        >
          {protocolLabel}
        </div>

        {/* Routes */}
        {visibleRoutes.length === 0 ? (
          <span
            style={{
              fontSize: 11,
              fontStyle: 'italic',
              color: 'var(--ice-text-tertiary)',
              opacity: 0.7,
              padding: '2px 0',
            }}
            data-testid={`gateway-empty-${node.id}`}
          >
            {t('canvas.blocks.gateway.noRoutesYet')}
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: AG_ROW_GAP }}>
            {visibleRoutes.map((path, i) => (
              <div
                key={`${path}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  height: AG_ROW_HEIGHT,
                  padding: '0 8px',
                  background: 'var(--ice-bg-base)',
                  border: `1px solid var(--ice-border)`,
                  borderRadius: 4,
                }}
                data-testid={`gateway-route-${node.id}-${i}`}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 11,
                    fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                    color: 'var(--ice-text-1)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={path}
                >
                  {path}
                </span>
                <span style={{ color: GATEWAY_ACCENT, fontSize: 10, flexShrink: 0 }}>→</span>
              </div>
            ))}
            {hiddenCount > 0 && (
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--ice-text-tertiary)',
                  opacity: 0.7,
                  fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                  paddingLeft: 4,
                }}
                data-testid={`gateway-more-${node.id}`}
              >
                {t('canvas.blocks.common.moreCount', { n: hiddenCount })}
              </span>
            )}
          </div>
        )}
      </div>
    </CardShell>
  );
};

SvgApiGatewayNode.displayName = 'SvgApiGatewayNode';
