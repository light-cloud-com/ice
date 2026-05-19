/**
 * rf-tgal-4 — TemplateCard.
 *
 * Memoised grid card for the gallery list view. The whole node is one
 * <button> firing onSelect(template), with the row split into:
 *   header (icon-square + name + trust-badge + estimated-cost + chevron)
 *   description (line-clamped)
 *   meta row (DifficultyDots + blocks count + connections count + ProviderBadges)
 *   tech-stack strip (TechStackLogos with max=6)
 *
 * `React.memo` wrap is load-bearing — the gallery's grid renders many
 * cards at once, and `setSelectedTemplate` updates re-render the whole
 * orchestrator. Without memo, every card re-renders. The wrap test
 * pins the $$typeof boundary and uses `.type` to unwrap for direct-FC
 * tests (per react-memo-wrapper-must-be-unwrapped-via-dot-type-for-direct-fc-tree-walker).
 */

import { getEnabledProvidersForTemplate } from '@ice/templates';
import { Rocket, ChevronRight } from 'lucide-react';
import React from 'react';
import { DifficultyDots, ProviderBadges, TrustBadge, TechStackLogos } from './badges';
import { TEMPLATE_CATEGORIES } from '../../../config/templates';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import { ICON_MAP } from '../data/icon-map';
import type { ComposedTemplate } from '../../../config/templates';

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
      className={cn(
        'flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition-all w-full group',
        'border-ice-border bg-ice-surface hover:border-ice-border-strong hover:shadow-md',
        'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
      )}
    >
      {/* Header: icon + name + arrow */}
      <div className="flex items-center gap-3 w-full">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: color + '15' }}
        >
          <Icon className="h-4.5 w-4.5" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-ice-text-1 truncate">
              {t(`templates.items.${template.id}.name`)}
            </span>
            <TrustBadge trust={template.trust} />
          </div>
          <span className="text-ice-xs text-ice-text-3">{template.estimatedCost}</span>
        </div>
        <ChevronRight className="w-4 h-4 text-ice-text-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Description */}
      <p className="text-ice-xs text-ice-text-2 leading-snug line-clamp-2">
        {t(`templates.items.${template.id}.description`)}
      </p>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <DifficultyDots level={template.difficulty} />
        <span className="text-ice-2xs text-ice-text-3">
          {template.blocks.length} {t('templates.gallery.blocks')}
        </span>
        {template.connections.length > 0 && (
          <span className="text-ice-2xs text-ice-text-3">
            {template.connections.length} {t('templates.gallery.connections')}
          </span>
        )}
        <ProviderBadges providers={getEnabledProvidersForTemplate(template)} />
      </div>

      {/* Tech stack icons */}
      <div className="flex items-center gap-1">
        <TechStackLogos tags={template.tags} max={6} />
      </div>
    </button>
  );
});
TemplateCard.displayName = 'TemplateCard';
