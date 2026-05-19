import React, { memo } from 'react';
import { getProviderBrandIcon } from '../../../../../assets/icons/brand-registry';

interface ProviderPillProps {
  provider: string;
}

/**
 * Provider stamp shown in the top-right of every block header. When a
 * provider is set, renders the brand logo (AWS / GCP / Azure /
 * Cloudflare / Vercel / DigitalOcean / Netlify / Heroku / Railway), so
 * the cloud is recognizable at a glance. Falls back to a small "AUTO"
 * text pill when the block hasn't been bound to a provider yet — that
 * keeps the slot present, so layout doesn't shift when a provider gets
 * assigned later in the properties panel.
 */
export const ProviderPill: React.FC<ProviderPillProps> = memo(({ provider }) => {
  if (!provider) {
    return (
      <span
        style={{
          background: 'var(--ice-bg-hover)',
          borderRadius: 4,
          padding: '2px 5px',
          fontSize: 9,
          fontWeight: 600,
          fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
          color: 'var(--ice-text-tertiary)',
          opacity: 0.55,
          flexShrink: 0,
          lineHeight: 1,
          pointerEvents: 'none',
          letterSpacing: '0.02em',
        }}
      >
        AUTO
      </span>
    );
  }

  const brand = getProviderBrandIcon(provider);
  if (brand?.url) {
    return (
      <img
        src={brand.url}
        alt={brand.label}
        title={brand.label}
        width={16}
        height={16}
        draggable={false}
        style={{
          objectFit: 'contain',
          flexShrink: 0,
          pointerEvents: 'none',
          // The vendor logos render best at full opacity — they're
          // already designed to be small + brand-correct.
          opacity: 0.95,
        }}
      />
    );
  }

  // Final fallback: the original text pill for any provider value we
  // don't have a logo for (e.g. a custom org-specific identifier).
  return (
    <span
      style={{
        background: 'var(--ice-bg-hover)',
        borderRadius: 4,
        padding: '2px 5px',
        fontSize: 9,
        fontWeight: 600,
        fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
        color: 'var(--ice-text-tertiary)',
        flexShrink: 0,
        lineHeight: 1,
        pointerEvents: 'none',
        letterSpacing: '0.02em',
      }}
    >
      {provider.toUpperCase()}
    </span>
  );
});

ProviderPill.displayName = 'ProviderPill';
