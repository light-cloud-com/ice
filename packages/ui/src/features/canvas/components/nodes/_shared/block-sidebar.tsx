/**
 * BlockSidebar — the 56-px vertical strip on the left edge of every
 * concept block. Three stacked slots speak the block's identity:
 *
 *   1. Type icon      — a quiet signature glyph sitting in a rounded tile
 *   2. Resource name  — schema-driven short name of the cloud resource
 *                       ("RDS", "Cloud SQL", "S3"), mono + tracked caps
 *   3. Provider logo  — the cloud brand mark for the target provider
 *
 * Theme-aware (uses CSS variables), schema-driven (no per-block hardcoding),
 * and visually restrained — the sidebar is a stamp, not a header.
 */

import { SIDEBAR_WIDTH } from '@ice/constants';
import React, { type ReactNode } from 'react';
import { getBrandIcon } from '../../../../../assets/icons/brand-registry';
import { getServiceName } from '../../../../../assets/icons/service-names';

export { SIDEBAR_WIDTH };

interface BlockSidebarProps {
  /** Pre-rendered type icon node (Lucide icon or CategoryIcon). */
  icon: ReactNode;
  /** iceType used to look up the resource display name from schema. */
  iceType: string;
  /** Current target provider. When empty, provider slot hides. */
  provider?: string;
  /** Family accent color — tints the icon tile and the bottom wash. */
  accent: string;
}

/**
 * Shorten a provider-scoped service name for the narrow sidebar slot.
 * Strips a leading provider word if present; otherwise returns unchanged.
 */
function shortResourceName(full: string): string {
  const PREFIXES = [
    'Amazon',
    'AWS',
    'Google',
    'GCP',
    'Azure',
    'Microsoft',
    'Alibaba',
    'OCI',
    'Oracle',
    'DO',
    'DigitalOcean',
  ];
  for (const p of PREFIXES) {
    if (full.startsWith(p + ' ')) return full.slice(p.length + 1);
  }
  return full;
}

// ─── Component ─────────────────────────────────────────────────────────────

export const BlockSidebar: React.FC<BlockSidebarProps> = ({ icon, iceType, provider, accent }) => {
  const serviceName = provider ? getServiceName(iceType, provider) : null;
  const shortName = serviceName ? shortResourceName(serviceName) : null;
  const providerBrand = provider ? getBrandIcon(provider) : null;

  return (
    <div
      style={{
        width: SIDEBAR_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        // Theme-aware surface that differentiates from the main column
        // in both themes. Radial accent wash behind the type tile echoes
        // the family color without committing color to any text.
        background: `
          radial-gradient(circle at 50% 14%, ${accent}1c 0%, transparent 60%),
          var(--ice-bg-surface)
        `,
        borderRight: `1px solid var(--ice-border-subtle, var(--ice-border))`,
        flexShrink: 0,
      }}
    >
      {/* ── Slot 1 — type icon in a raised accent tile ── */}
      <div
        style={{
          padding: '14px 0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accent,
            // Two-tone accent wash: stronger at top, lighter at bottom.
            // Makes the tile feel like a luxury brand mark, not a flat square.
            background: `linear-gradient(180deg, ${accent}22 0%, ${accent}10 100%)`,
            border: `1px solid ${accent}3b`,
            boxShadow: '0 1px 0 0 rgba(255, 255, 255, 0.06) inset, 0 1px 2px rgba(0, 0, 0, 0.18)',
          }}
        >
          {icon}
        </div>
      </div>

      {/* ── Slot 2 — resource short name (wraps to 2 lines if needed) ── */}
      {shortName && (
        <>
          <div style={{ height: 1, background: 'var(--ice-border-subtle, var(--ice-border))' }} />
          <div
            style={{
              padding: '10px 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 36,
            }}
            title={serviceName ?? undefined}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                fontFamily: 'var(--font-mono, "JetBrains Mono Variable", ui-monospace, "SFMono-Regular", monospace)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ice-text-secondary)',
                textAlign: 'center',
                lineHeight: 1.2,
                wordBreak: 'break-word',
                hyphens: 'auto',
              }}
            >
              {shortName}
            </span>
          </div>
        </>
      )}

      {/* ── Slot 3 — provider brand mark ── */}
      {providerBrand && (
        <>
          <div style={{ height: 1, background: 'var(--ice-border-subtle, var(--ice-border))' }} />
          <div
            style={{
              padding: '11px 10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 38,
            }}
            title={providerBrand.label}
          >
            <img
              src={providerBrand.url}
              alt={providerBrand.label}
              style={{
                maxWidth: '100%',
                maxHeight: 20,
                objectFit: 'contain',
                opacity: 0.92,
              }}
              draggable={false}
            />
          </div>
        </>
      )}

      {/* Flex fill — lets the sidebar breathe to full card height. A
          very faint accent wash at the bottom echoes the radial at top. */}
      <div
        style={{
          flex: 1,
          borderTop: shortName || providerBrand ? '1px solid var(--ice-border-subtle, var(--ice-border))' : undefined,
          background: `linear-gradient(180deg, transparent 0%, ${accent}0f 100%)`,
        }}
      />
    </div>
  );
};

BlockSidebar.displayName = 'BlockSidebar';
