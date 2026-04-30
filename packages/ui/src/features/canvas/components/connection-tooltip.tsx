/**
 * rf-canv-16 — `ConnectionTooltip` subcomponent.
 *
 * Floating tooltip rendered when a connection is hovered. Shows endpoint
 * labels (origin → destination), a relationship pill, an optional bundle-
 * count chip, and up to six metadata rows (protocol / port / latency /
 * throughput / bandwidth / security). The tooltip is positioned absolutely
 * at `info.mouseX + 14, info.mouseY + 14` so it follows the cursor with a
 * small offset.
 *
 * Per blueprint risk #9, the SEVEN i18n keys consumed here —
 *   - `canvas.tooltip.connections`
 *   - `canvas.tooltip.protocol`
 *   - `canvas.tooltip.port`
 *   - `canvas.tooltip.latency`
 *   - `canvas.tooltip.throughput`
 *   - `canvas.tooltip.bandwidth`
 *   - `canvas.tooltip.security`
 * are preserved verbatim. Do NOT alter their order, spelling, or string
 * literals; E2E may snapshot-test the rendered text. The relationship-pill
 * `replace(/_/g, ' ')` transform, the bundle-chip `> 1` gate, and the
 * truthy-only metadata-row gates are all preserved verbatim from the
 * original inline JSX in `svg-canvas.tsx`.
 *
 * The `connTooltip` state and `handleConnectionHover` callback stay in the
 * orchestrator — see `svg-canvas.tsx`. This component is purely
 * presentational; it accepts the live `info` value (or `null`) and renders
 * nothing when the value is null.
 */

import React from 'react';

import { t } from '../../../i18n';
import { EDGE_COLORS, type ConnectionTooltipInfo } from './svg-connection-path';

export interface ConnectionTooltipProps {
  /** The currently-hovered connection's tooltip data, or `null` when no
   * connection is hovered. When null the component returns nothing. */
  info: ConnectionTooltipInfo | null;
}

export const ConnectionTooltip: React.FC<ConnectionTooltipProps> = ({ info }) => {
  if (!info) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: info.mouseX + 14,
        top: info.mouseY + 14,
        pointerEvents: 'none',
        zIndex: 9999,
        background: 'var(--ice-bg-base)',
        border: '1px solid var(--ice-border-strong)',
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 180,
        maxWidth: 320,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        fontFamily: "'JetBrains Mono Variable', monospace",
        fontSize: 11,
        color: 'var(--ice-text-primary)',
        lineHeight: 1.5,
      }}
    >
      {/* Origin → Destination */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: 'var(--ice-text-primary)' }}>{info.fromLabel}</span>
        <span style={{ color: 'var(--ice-border-strong)' }}>→</span>
        <span style={{ fontWeight: 600, color: 'var(--ice-text-primary)' }}>{info.toLabel}</span>
      </div>

      {/* Relationship badge */}
      <div style={{ marginBottom: 6 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '1px 8px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            background: (EDGE_COLORS[info.relationship] || EDGE_COLORS.default) + '1a',
            color: EDGE_COLORS[info.relationship] || EDGE_COLORS.default,
            border: `1px solid ${EDGE_COLORS[info.relationship] || EDGE_COLORS.default}33`,
          }}
        >
          {info.relationship.replace(/_/g, ' ')}
        </span>
        {info.bundleCount > 1 && (
          <span
            style={{
              display: 'inline-block',
              marginLeft: 6,
              padding: '1px 8px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              background: '#3b82f61a',
              color: '#60a5fa',
              border: '1px solid #3b82f633',
            }}
          >
            {info.bundleCount} {t('canvas.tooltip.connections')}
          </span>
        )}
      </div>

      {/* Metadata rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {info.protocol && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ice-text-secondary)' }}>{t('canvas.tooltip.protocol')}</span>
            <span
              style={{
                fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                color: 'var(--ice-text-tertiary)',
              }}
            >
              {info.protocol.toUpperCase()}
            </span>
          </div>
        )}
        {info.port && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ice-text-secondary)' }}>{t('canvas.tooltip.port')}</span>
            <span
              style={{
                fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                color: 'var(--ice-text-tertiary)',
              }}
            >
              {info.port}
            </span>
          </div>
        )}
        {info.latency && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ice-text-secondary)' }}>{t('canvas.tooltip.latency')}</span>
            <span
              style={{
                fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                color: 'var(--ice-text-tertiary)',
              }}
            >
              {info.latency}
            </span>
          </div>
        )}
        {info.throughput && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ice-text-secondary)' }}>{t('canvas.tooltip.throughput')}</span>
            <span
              style={{
                fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                color: 'var(--ice-text-tertiary)',
              }}
            >
              {info.throughput}
            </span>
          </div>
        )}
        {info.bandwidth && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ice-text-secondary)' }}>{t('canvas.tooltip.bandwidth')}</span>
            <span
              style={{
                fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                color: 'var(--ice-text-tertiary)',
              }}
            >
              {info.bandwidth}
            </span>
          </div>
        )}
        {info.securityRule && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#f59e0b' }}>{t('canvas.tooltip.security')}</span>
            <span
              style={{
                fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                color: '#f59e0b',
              }}
            >
              {info.securityRule}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
