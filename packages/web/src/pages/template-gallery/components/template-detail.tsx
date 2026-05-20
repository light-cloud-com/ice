/**
 * rf-wgal-6 — TemplateDetail (web).
 *
 * The slide-in right panel rendered when the user clicks a card in the
 * gallery page's grid. Replaces the right ~380px column with: hero
 * (icon + name + trust + category chip + close button), stats grid
 * (cost + difficulty), provider chips with logos, compliance, resource
 * breakdown (blocksByCategory + connections + groups), environment
 * presets, tech stack chips with logos, optional repo link, plus a
 * sticky "Use Template" CTA at the bottom.
 *
 * One memoised computation:
 *   - blocksByCategory: groups blocks by their iceType prefix.
 *
 * Mirrors rf-tgal-5 but the web variant has:
 *   - `onClose` (X button) instead of rf-tgal-5's `onBack` (left arrow)
 *   - tech-stack chips inline in the panel (vs rf-tgal-5's external Badge component)
 *   - no provider-cost-comparison table (web omits it)
 *   - capitalize on the cost value
 *   - inline provider chips with brand-logo images
 */

import { getBrandIcon, getProviderBrandIcon } from '@ui/assets/icons/brand-registry';
import { TEMPLATE_CATEGORIES } from '@ui/config/templates';
import { useTranslation } from '@ui/i18n';
import { Rocket, GitBranch, Box, Cable, Layers, Plus, ArrowUpRight, X } from 'lucide-react';
import React, { useMemo } from 'react';
import { TrustBadge } from './badges';
import { ICON_MAP } from '../data/icon-map';
import { getDifficultyMeta } from '../utils/difficulty-meta';
import type { ComposedTemplate } from '@ui/config/templates';

export interface TemplateDetailProps {
  template: ComposedTemplate;
  onClose: () => void;
  onUse: (template: ComposedTemplate) => void;
}

export const TemplateDetail: React.FC<TemplateDetailProps> = ({ template, onClose, onUse }) => {
  const { t } = useTranslation();
  const Icon = ICON_MAP[template.icon] || Rocket;
  const catMeta = TEMPLATE_CATEGORIES.find((c) => c.id === template.category);
  const DIFFICULTY_META = getDifficultyMeta(t);
  const diffInfo = DIFFICULTY_META[template.difficulty || 'starter'] || DIFFICULTY_META.starter;

  const blocksByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const block of template.blocks) {
      const cat = block.iceType.split('.')[0];
      (map.get(cat) || (map.set(cat, []), map.get(cat)!)).push(block.label);
    }
    return map;
  }, [template.blocks]);

  return (
    <div className="h-full flex flex-col border-l border-ice-border bg-ice-surface">
      {/* Close + title */}
      <div className="shrink-0 flex items-start gap-3 px-5 pt-5 pb-4 border-b border-ice-border">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: (catMeta?.color || '#3b82f6') + '15' }}
        >
          <Icon className="h-5 w-5" style={{ color: catMeta?.color || '#3b82f6' }} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ice-text-1">{t(`templates.items.${template.id}.name`)}</h2>
          <div className="flex items-center gap-2 mt-1">
            <TrustBadge trust={template.trust} />
            {catMeta && (
              <span
                className="text-ice-2xs px-1.5 py-0.5 rounded font-medium"
                style={{ color: catMeta.color, backgroundColor: catMeta.color + '15' }}
              >
                {catMeta.label}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label={t('common.buttons.close')}
          className="p-1 rounded text-ice-text-3 hover:text-ice-text-1 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <p className="text-ice-sm text-ice-text-2 leading-relaxed">{t(`templates.items.${template.id}.description`)}</p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-px bg-ice-border rounded-lg overflow-hidden">
          {[
            { value: template.estimatedCost, label: t('templates.gallery.costEstimate') },
            { value: diffInfo.label, label: t('templates.gallery.difficulty') },
          ].map((s) => (
            <div key={s.label} className="bg-ice-surface px-3 py-2.5 text-center">
              <div className="text-sm font-semibold text-ice-text-1 capitalize">{s.value}</div>
              <div className="text-ice-2xs text-ice-text-3">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Providers — with logos */}
        {template.providers && template.providers.length > 0 && (
          <div>
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">
              {t('templates.gallery.providers')}
            </div>
            <div className="flex gap-2">
              {template.providers.map((p) => {
                const brand = getProviderBrandIcon(p);
                return (
                  <span
                    key={p}
                    className="flex items-center gap-1.5 text-ice-xs font-medium px-2.5 py-1.5 rounded-md bg-ice-raised text-ice-text-2"
                  >
                    {brand && <img src={brand.url} alt="" width={16} height={16} aria-hidden="true" />}
                    <span className="uppercase">{p}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Compliance */}
        {template.compliance && template.compliance.length > 0 && (
          <div>
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">
              {t('templates.gallery.compliance')}
            </div>
            <div className="flex gap-1.5">
              {template.compliance.map((tag) => (
                <span
                  key={tag}
                  className="text-ice-xs font-medium px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 uppercase"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Resources */}
        <div>
          <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-2">
            {t('templates.gallery.resourceBreakdown')}
          </div>
          <div className="space-y-1.5">
            {Array.from(blocksByCategory.entries()).map(([cat, labels]) => (
              <div key={cat} className="flex items-start gap-2 text-ice-xs">
                <Box className="w-3 h-3 text-ice-text-3 mt-0.5 shrink-0" aria-hidden="true" />
                <span className="font-medium text-ice-text-2">{t(`blocks.categories.${cat.toLowerCase()}.label`)}</span>
                <span className="text-ice-text-3">{labels.join(', ')}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-ice-xs">
              <Cable className="w-3 h-3 text-ice-text-3" aria-hidden="true" />
              <span className="text-ice-text-3">
                {template.connections.length} {t('templates.gallery.connections')}
              </span>
            </div>
            {template.groups && template.groups.length > 0 && (
              <div className="flex items-center gap-2 text-ice-xs">
                <Layers className="w-3 h-3 text-ice-text-3" aria-hidden="true" />
                <span className="text-ice-text-3">
                  {template.groups.length} {t('templates.gallery.groups')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Environments */}
        {template.environmentPresets.length > 0 && (
          <div>
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">
              {t('templates.gallery.environmentPresets')}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {template.environmentPresets.map((env) => (
                <span key={env.name} className="text-ice-xs px-2 py-0.5 rounded bg-ice-raised text-ice-text-2">
                  {env.name} <span className="text-ice-text-3">{env.region}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tech Stack & Tags — with logos */}
        {template.tags.length > 0 && (
          <div>
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">
              {t('templates.gallery.techStack')}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {template.tags.map((tag) => {
                const brand = getBrandIcon(tag);
                return (
                  <span
                    key={tag}
                    className="flex items-center gap-1 text-ice-2xs font-medium px-1.5 py-0.5 rounded bg-ice-raised text-ice-text-2"
                  >
                    {brand && <img src={brand.url} alt="" width={12} height={12} aria-hidden="true" />}
                    {tag}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Repo */}
        {template.repo && (
          <a
            href={template.repo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ice-xs text-ice-accent hover:underline flex items-center gap-1"
          >
            <GitBranch className="w-3 h-3" aria-hidden="true" /> {t('templates.gallery.viewRepository')}{' '}
            <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
          </a>
        )}
      </div>

      {/* Action */}
      <div className="shrink-0 px-5 py-4 border-t border-ice-border">
        <button
          onClick={() => onUse(template)}
          className="flex items-center justify-center gap-2 w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-ice-accent text-ice-text-1 hover:bg-ice-accent-hover transition-colors"
        >
          <Plus className="w-4 h-4" /> {t('wizard.createButton')}
        </button>
      </div>
    </div>
  );
};
