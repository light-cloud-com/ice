/**
 * SvgPrivateNetworkNode — Canvas renderer for `Network.PrivateNetwork`
 *
 * A container block that nests other blocks inside its body. The header
 * matches the rest of the canvas — provider stamp top-right, info
 * trigger, and a `{serviceName} · {region}` meta line — so the block
 * doesn't read as a one-off chrome. A status footer at the bottom shows
 * the ingress label (Open / Restricted / Sealed) plus a deploy-status
 * dot, freeing the meta line from doubling as a state badge.
 *
 * The shield icon tint and accent colour still encode the three ingress
 * states (Open=red, Restricted=amber, Sealed=slate) — that's the
 * load-bearing identity cue the validated block ships with.
 *
 * Behaviour preserved verbatim — body remains a drop zone, children
 * still render on top via the standard dispatcher loop.
 */

import {
  CARD_FOOTER_HEIGHT,
  PN_HEADER_HEIGHT,
  PRIVATE_NETWORK_MIN_HEIGHT as PN_MIN_HEIGHT,
  PRIVATE_NETWORK_MIN_WIDTH as PN_MIN_WIDTH,
} from '@ice/constants';
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { ProviderPill } from '../_shared/provider-pill';
import { StatusDot } from '../_shared/status-dot';
import { CARD_PX, CATEGORY_STYLE, CORNER_RADIUS, STATUS_COLORS } from '../../../../../config/canvas-constants';
import { ConceptInfoTrigger } from '../../../../concept-info';
import { getServiceName } from '../../../../../assets/icons/service-names';
import type { SvgCompactNodeProps } from '../compact-node';
import { t } from '../../../../../i18n';

export { PN_HEADER_HEIGHT, PN_MIN_WIDTH, PN_MIN_HEIGHT };

type Ingress = 'all' | 'allowlist' | 'none';

export function computePrivateNetworkWidth(currentWidth = 0): number {
  return Math.max(currentWidth, PN_MIN_WIDTH);
}

export function computePrivateNetworkHeight(currentHeight = 0): number {
  return Math.max(currentHeight, PN_MIN_HEIGHT);
}

function coerceIngress(value: unknown): Ingress {
  if (value === 'none' || value === 'allowlist') return value;
  return 'all';
}

function ingressLabel(ingress: Ingress): string {
  if (ingress === 'none') return t('canvas.blocks.privateNetwork.sealed');
  if (ingress === 'allowlist') return t('canvas.blocks.privateNetwork.restricted');
  return t('canvas.blocks.privateNetwork.open');
}

export const SvgPrivateNetworkNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  connectionDragState = null,
}) => {
  const { x, y, data, label } = node;
  const W = node.width;
  const H = node.height;
  const [isHovered, setIsHovered] = useState(false);

  const ingress = coerceIngress(data?.ingress);
  const iceType = (data?.iceType as string) || 'Network.PrivateNetwork';
  const provider = (data?.provider as string) || '';
  const region = (data?.region as string) || '';
  const deployStatus = (data?.deploy_status as string) || '';
  const serviceName = getServiceName(iceType, provider || 'aws');
  const metaLine = serviceName
    ? `${serviceName} · ${region || 'auto'}`
    : region
      ? region
      : '';
  const statusColor = STATUS_COLORS[deployStatus] || STATUS_COLORS.idle;
  const statusLabel = deployStatus ? deployStatus.charAt(0).toUpperCase() + deployStatus.slice(1) : '';

  // Reuse the Network category glow so Private Network feels like part
  // of the same family as Custom Domain / Public Endpoint. The shield
  // icon tint differentiates the three ingress states.
  const cat = CATEGORY_STYLE.Network || CATEGORY_STYLE.default;
  const categoryGlow = cat.glow;

  const isValidTarget = connectionDragState === 'valid-target';
  const isInvalidTarget = connectionDragState === 'invalid-target';
  const isSource = connectionDragState === 'source';

  const ACCENT =
    ingress === 'none'
      ? '#475569' // slate-600 — sealed, cool, calm
      : ingress === 'allowlist'
        ? '#d97706' // amber-600 — restricted
        : '#dc2626'; // red-600 — open/exposed

  const border = isDragOver
    ? '#22d3ee'
    : isValidTarget
      ? '#22c55e'
      : isInvalidTarget
        ? '#ef4444'
        : isSelected || isHovered
          ? categoryGlow
          : categoryGlow + '55';

  const onEnter = useCallback(() => {
    setIsHovered(true);
    onNodeHover?.(node.id);
  }, [node.id, onNodeHover]);
  const onLeave = useCallback(() => {
    setIsHovered(false);
    onNodeHover?.(null);
  }, [onNodeHover]);

  const ShieldIcon = ingress === 'none' ? ShieldCheck : ingress === 'allowlist' ? ShieldAlert : Shield;
  const liveConfig = ingressLabel(ingress);

  return (
    <g>
      <foreignObject x={x} y={y} width={W} height={H}>
        <div
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          style={{
            width: W,
            height: H,
            background: 'var(--ice-bg-surface)',
            border: `1px solid ${border}`,
            borderRadius: CORNER_RADIUS,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: isSelected
              ? `0 0 0 1.5px ${categoryGlow}, 0 4px 14px -4px ${categoryGlow}33`
              : isHovered
                ? '0 2px 8px -2px rgba(0,0,0,0.15)'
                : '0 1px 3px rgba(0,0,0,0.06)',
            opacity: isSource ? 0.85 : 1,
            transition: 'box-shadow 150ms ease, border-color 150ms ease',
          }}
        >
          {/* ── Header: shield + title + meta · region + info + provider ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: `8px ${CARD_PX}px`,
              borderBottom: '1px solid var(--ice-border)',
              background: `linear-gradient(180deg, ${ACCENT}15 0%, transparent 100%)`,
              flexShrink: 0,
              height: PN_HEADER_HEIGHT,
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: `${ACCENT}25`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: ACCENT,
                flexShrink: 0,
              }}
            >
              <ShieldIcon size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ice-text-1)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                data-testid={`pn-title-${node.id}`}
              >
                {label || t('canvas.blocks.titles.privateNetwork')}
              </div>
              {metaLine && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--ice-text-3)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: 2,
                  }}
                  data-testid={`pn-subtitle-${node.id}`}
                >
                  {metaLine}
                </div>
              )}
            </div>
            <ConceptInfoTrigger iceType={iceType} displayName={label || ''} opacity={isHovered ? 0.85 : 0.4} />
            <ProviderPill provider={provider} />
          </div>

          {/* ── Drop zone body — transparent so children nest visually
                on top via the standard dispatcher loop. The hint text
                fades in on hover/drag. ── */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              background: 'transparent',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              padding: 14,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                color: 'var(--ice-text-3)',
                opacity: isHovered || isDragOver ? 0.7 : 0.35,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
                transition: 'opacity 150ms ease',
              }}
            >
              {t('canvas.blocks.privateNetwork.dropHere')}
            </div>
          </div>

          {/* ── Status footer: ingress label + StatusDot ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: `6px ${CARD_PX}px`,
              borderTop: '1px solid var(--ice-border-subtle, var(--ice-border))',
              flexShrink: 0,
              minHeight: CARD_FOOTER_HEIGHT,
              boxSizing: 'border-box',
            }}
            data-testid={`pn-footer-${node.id}`}
          >
            <span
              style={{
                fontSize: 10,
                fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                color: ACCENT,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                flex: 1,
                opacity: 0.9,
              }}
              data-testid={`pn-ingress-${node.id}`}
            >
              {liveConfig}
            </span>
            {deployStatus && <StatusDot color={statusColor} label={statusLabel.toLowerCase()} />}
          </div>
        </div>
      </foreignObject>
    </g>
  );
};

SvgPrivateNetworkNode.displayName = 'SvgPrivateNetworkNode';
