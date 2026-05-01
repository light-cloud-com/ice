/**
 * rf-wgal-3 — Visual badges/strips for the web template-gallery page.
 *
 * Four small read-only sub-components used by both the gallery card
 * and the detail panel:
 *
 *   - ProviderLogos: SVG brand logos for cloud providers (AWS/GCP/...)
 *     with uppercase text-chip fallback. Null when no providers.
 *   - TechStackLogos: brand-icon strip resolved via getBrandIcon. Capped
 *     at `max` (default 5) and null when no tag matches.
 *   - DifficultyDots: 1..4 dots, lit per `getDifficultyMeta(t)[level]`.
 *   - TrustBadge: 'official' (accent) / 'verified' (emerald). Null for
 *     missing or 'community'.
 *
 * Mirrors the rf-tgal-3 split but the web variants have different
 * sizing (w-1.5 vs w-1, px-1.5 vs px-1) and ProviderLogos is logo-first
 * with a text fallback (vs UI's chip-only ProviderBadges).
 *
 * All four are pure visual leaves — no Redux, no callbacks. Grouped in
 * one module because they share render-context and are always imported
 * together by `TemplateCard` and `TemplateDetail`.
 */

import { getBrandIcon, getProviderBrandIcon } from '@ui/assets/icons/brand-registry';
import { useTranslation } from '@ui/i18n';
import { cn } from '@ui/shared/utils/cn';
import React, { useMemo } from 'react';
import { getDifficultyMeta } from '../utils/difficulty-meta';

export interface ProviderLogosProps {
  providers?: string[];
  size?: number;
}

/** Renders SVG brand logos for cloud providers with fallback text */
export const ProviderLogos: React.FC<ProviderLogosProps> = ({ providers, size = 16 }) => {
  if (!providers || providers.length === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {providers.map((p) => {
        const brand = getProviderBrandIcon(p);
        return brand ? (
          <img key={p} src={brand.url} alt={brand.label} width={size} height={size} className="shrink-0 opacity-70" />
        ) : (
          <span
            key={p}
            className="text-ice-2xs font-medium px-1.5 py-0.5 rounded bg-ice-raised text-ice-text-3 uppercase"
          >
            {p}
          </span>
        );
      })}
    </span>
  );
};

export interface TechStackLogosProps {
  tags: string[];
  max?: number;
}

/** Renders SVG logos for tech stack tags (React, PostgreSQL, etc.) */
export const TechStackLogos: React.FC<TechStackLogosProps> = ({ tags, max = 5 }) => {
  const resolved = useMemo(() => {
    const items: { key: string; url: string; label: string }[] = [];
    for (const tag of tags) {
      if (items.length >= max) break;
      const brand = getBrandIcon(tag);
      if (brand) items.push({ key: tag, url: brand.url, label: brand.label });
    }
    return items;
  }, [tags, max]);

  if (resolved.length === 0) return null;
  return (
    <span className="flex items-center gap-2">
      {resolved.map((b) => (
        <img key={b.key} src={b.url} alt={b.label} title={b.label} width={18} height={18} className="shrink-0" />
      ))}
    </span>
  );
};

export interface DifficultyDotsProps {
  level?: string;
}

export const DifficultyDots: React.FC<DifficultyDotsProps> = ({ level }) => {
  const { t } = useTranslation();
  const diffMeta = getDifficultyMeta(t);
  const info = diffMeta[level || 'starter'] || diffMeta.starter;
  return (
    <span className="flex items-center gap-0.5" title={info.label}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn('w-1.5 h-1.5 rounded-full', i <= info.dots ? 'bg-ice-accent' : 'bg-ice-border')} />
      ))}
    </span>
  );
};

export interface TrustBadgeProps {
  trust?: string;
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({ trust }) => {
  const { t } = useTranslation();
  if (!trust || trust === 'community') return null;
  return (
    <span
      className={cn(
        'text-ice-2xs font-semibold px-1.5 py-0.5 rounded',
        trust === 'official' ? 'bg-ice-accent/15 text-ice-accent' : 'bg-emerald-500/15 text-emerald-400',
      )}
    >
      {trust === 'official' ? t('templates.gallery.official') : t('templates.gallery.verified')}
    </span>
  );
};
