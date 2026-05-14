/**
 * SvgPrivateNetworkNode — Canvas renderer for `Network.PrivateNetwork`
 *
 * A container block styled to match `Network.CustomDomain` visually:
 * card-like body via `foreignObject`, gradient header with rounded
 * icon container + title + subtitle, and a continuous border. The body
 * is a drop zone; nested children render on top via the standard
 * svg-canvas dispatcher loop (they're separate <g> elements).
 * Ingress state (set via properties panel) is surfaced through the
 * shield icon glyph + the live subtitle:
 *   - `'all'`       → Shield      — "Open · public reachable"
 *   - `'allowlist'` → ShieldAlert — "Restricted · allowlist"
 *   - `'none'`      → ShieldCheck — "Sealed · internal only"
 *
 * Policy is purely data — the compiler emits ingress/egress firewall
 * rules from `data.ingress` / `data.egress` at deploy time.
 */

import {
  PN_HEADER_HEIGHT,
  PRIVATE_NETWORK_MIN_WIDTH as PN_MIN_WIDTH,
  PRIVATE_NETWORK_MIN_HEIGHT as PN_MIN_HEIGHT,
} from '@ice/constants';
import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { CARD_PX, CATEGORY_STYLE, CORNER_RADIUS } from '../../../../../config/canvas-constants';
import type { SvgCompactNodeProps } from '../compact-node';

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
  if (ingress === 'none') return 'Sealed · internal only';
  if (ingress === 'allowlist') return 'Restricted · allowlist';
  return 'Open · public reachable';
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

  // Reuse the Network category glow so Private Network feels like part
  // of the same family as Custom Domain / Public Endpoint. The shield
  // icon tint is what differentiates the three ingress states — border
  // and header stay consistent for a calm, unified look.
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
          }}
        >
          {/* ── Header: icon + title + live ingress subtitle ── */}
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
                {label || 'Private Network'}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--ice-text-3)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                data-testid={`pn-subtitle-${node.id}`}
              >
                · {ingressLabel(ingress)}
              </div>
            </div>
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
              drop services here
            </div>
          </div>
        </div>
      </foreignObject>
    </g>
  );
};

SvgPrivateNetworkNode.displayName = 'SvgPrivateNetworkNode';
