/**
 * rf-wgal-5 — TemplateCard (web).
 *
 * Memoised grid card for the gallery page's grid view. The whole node
 * is one <button> firing onSelect(template), with the row split into:
 *   header (icon-square + name + TrustBadge + description)
 *   cost banner (estimatedCost + monthEst label + DifficultyDots + blocks count)
 *   provider+tech strip (ProviderLogos + divider + TechStackLogos + ChevronRight)
 *
 * `React.memo` wrap is load-bearing — the gallery's grid renders many
 * cards at once, and `setSelectedTemplate` updates re-render the whole
 * orchestrator. Without memo, every card re-renders. The wrap test
 * pins the $$typeof boundary and uses `.type` to unwrap for direct-FC
 * tests (per react-memo-wrapper-must-be-unwrapped-via-dot-type-for-direct-fc-tree-walker).
 *
 * Mirrors the rf-tgal-4 split but the web variant has a different
 * layout (cost banner with monthEst label, divider span, larger icon
 * square at h-10 vs h-9, line-clamp-2 description above the cost
 * banner instead of below the meta row).
 */

import { TEMPLATE_CATEGORIES } from '@ui/config/templates';
import { useTranslation } from '@ui/i18n';
import { cn } from '@ui/shared/utils/cn';
import { Rocket, ChevronRight } from 'lucide-react';
import React from 'react';

import { ProviderLogos, TechStackLogos, DifficultyDots, TrustBadge } from './badges';
import { ICON_MAP } from '../data/icon-map';
import type { ComposedTemplate } from '@ui/config/templates';

export interface TemplateCardProps {
  template: ComposedTemplate;
  onSelect: (template: ComposedTemplate) => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = React.memo(({ template, onSelect }) => {
  const { t } = useTranslation();
  const Icon = ICON_MAP[template.icon] || Rocket;
  const catMeta = TEMPLATE_CATEGORIES.find((c) => c.id === template.category);
  const color = catMeta?.color || '#3b82f6';

  return (
    <button
      onClick={() => onSelect(template)}
      aria-label={`View ${template.name} template`}
      className={cn(
        'flex flex-col rounded-xl border text-left transition-colors w-full group',
        'border-ice-border bg-ice-surface hover:border-ice-border-strong hover:shadow-lg',
        'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
      )}
    >
      {/* Top section: icon, name, cost */}
      <div className="flex items-start gap-3 p-4 pb-2">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: color + '12' }}
        >
          <Icon className="h-5 w-5" style={{ color }} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-ice-text-1 truncate">
              {t(`templates.items.${template.id}.name`)}
            </span>
            <TrustBadge trust={template.trust} />
          </div>
          <p className="text-ice-xs text-ice-text-2 leading-snug line-clamp-2 mt-0.5">
            {t(`templates.items.${template.id}.description`)}
          </p>
        </div>
      </div>

      {/* Cost banner */}
      <div className="mx-4 mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-ice-raised/60">
        <span className="text-xs font-semibold text-ice-text-1 font-variant-numeric tabular-nums">
          {template.estimatedCost}
        </span>
        <span className="text-ice-2xs text-ice-text-3">{t('templates.gallery.monthEst')}</span>
        <span className="flex-1" />
        <DifficultyDots level={template.difficulty} />
        <span className="text-ice-2xs text-ice-text-3">
          {template.blocks.length} {t('templates.gallery.blocks')}
        </span>
      </div>

      {/* Provider logos + tech stack logos */}
      <div className="flex items-center gap-3 px-4 pb-3">
        {/* Cloud providers */}
        <ProviderLogos providers={template.providers} size={18} />

        {/* Divider */}
        {template.providers && template.providers.length > 0 && template.tags.length > 0 && (
          <span className="w-px h-4 bg-ice-border" aria-hidden="true" />
        )}

        {/* Tech stack from tags */}
        <TechStackLogos tags={template.tags} max={5} />

        <span className="flex-1" />
        <ChevronRight
          className="w-4 h-4 text-ice-text-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-hidden="true"
        />
      </div>
    </button>
  );
});
TemplateCard.displayName = 'TemplateCard';
