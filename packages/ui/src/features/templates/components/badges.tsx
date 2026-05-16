/**
 * rf-tgal-3 — Visual badges/strips used by the template gallery.
 *
 * Four small read-only sub-components rendered by both the gallery
 * card and the detail view:
 *
 *   - DifficultyDots: 1..4 dots, lit per `getDifficultyLabels(t)[level]`.
 *   - ProviderBadges: uppercase chip strip — null for empty/missing.
 *   - TrustBadge: 'official' (accent) / 'verified' (emerald). Null for
 *     missing or 'community'.
 *   - TechStackLogos: brand-icon strip resolved via getBrandIcon.
 *     Capped at `max` (default 5) and null when no tag matches.
 *
 * All four are pure visual leaves — no Redux, no callbacks. Grouped in
 * one module because they share the same render-context and are
 * always imported together by `TemplateCard` and `TemplateDetail`.
 */

import { isProviderEnabled } from '@ice/constants';
import React, { useMemo } from 'react';

import { getBrandIcon } from '../../../assets/icons/brand-registry';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import { getDifficultyLabels } from '../utils/difficulty-labels';

export interface DifficultyDotsProps {
  level?: string;
}

export const DifficultyDots: React.FC<DifficultyDotsProps> = ({ level }) => {
  const { t } = useTranslation();
  const labels = getDifficultyLabels(t);
  const info = labels[level || 'starter'] || labels.starter;
  return (
    <span className="flex items-center gap-0.5" title={info.label}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn('w-1 h-1 rounded-full', i <= info.dots ? 'bg-ice-accent' : 'bg-ice-border')} />
      ))}
    </span>
  );
};

export interface ProviderBadgesProps {
  providers?: string[];
}

export const ProviderBadges: React.FC<ProviderBadgesProps> = ({ providers }) => {
  const enabled = providers?.filter(isProviderEnabled) ?? [];
  if (enabled.length === 0) return null;
  return (
    <span className="flex items-center gap-0.5">
      {enabled.map((p) => (
        <span key={p} className="text-ice-2xs font-medium px-1 py-0 rounded bg-ice-raised text-ice-text-3 uppercase">
          {p}
        </span>
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
        'text-ice-2xs font-semibold px-1 py-0 rounded',
        trust === 'official' ? 'bg-ice-accent/15 text-ice-accent' : 'bg-emerald-500/15 text-emerald-400',
      )}
    >
      {trust === 'official' ? t('templates.gallery.official') : t('templates.gallery.verified')}
    </span>
  );
};

export interface TechStackLogosProps {
  tags: string[];
  max?: number;
}

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
