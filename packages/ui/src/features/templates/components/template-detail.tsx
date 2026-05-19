/**
 * rf-tgal-5 — TemplateDetail.
 *
 * Full detail panel rendered inside the gallery dialog when the user
 * clicks a card. Replaces the gallery list view with: hero (icon +
 * name + trust + category), stats grid (cost + difficulty), provider
 * chips, provider cost comparison, compliance, resource breakdown
 * (blocks-by-category + connections + groups), environment presets,
 * tags, and an optional repo link, plus a sticky "Use Template" CTA.
 *
 * Two memoised computations:
 *   - blocksByCategory: groups blocks by their iceType prefix.
 *   - providerComparison: tries `expandComposedTemplate` + `compareProviderCosts`
 *     and falls back to [] on any throw — load-bearing because the
 *     template config may reference an unknown provider when first
 *     authored.
 */

import { getEnabledProvidersForTemplate } from '@ice/templates';
import { Rocket, ArrowLeft, GitBranch, Box, Cable, Layers, Plus } from 'lucide-react';
import React, { useMemo } from 'react';

import { TEMPLATE_CATEGORIES, expandComposedTemplate } from '../../../config/templates';
import { formatCostRaw } from '../../../features/cost/utils/cost-calculator';
import { compareProviderCosts } from '../../../features/cost/utils/provider-pricing';
import { useTranslation } from '../../../i18n';
import { Badge } from '../../../shared/components/ui/badge';
import { cn } from '../../../shared/utils/cn';
import { TrustBadge } from './badges';
import { ICON_MAP } from '../data/icon-map';
import { getDifficultyLabels } from '../utils/difficulty-labels';
import type { ComposedTemplate } from '../../../config/templates';

export interface TemplateDetailProps {
  template: ComposedTemplate;
  onBack: () => void;
  onUse: (template: ComposedTemplate) => void;
}

export const TemplateDetail: React.FC<TemplateDetailProps> = ({ template, onBack, onUse }) => {
  const { t } = useTranslation();
  const Icon = ICON_MAP[template.icon] || Rocket;
  const catMeta = TEMPLATE_CATEGORIES.find((c) => c.id === template.category);
  const DIFFICULTY_LABELS = getDifficultyLabels(t);
  const diffInfo = DIFFICULTY_LABELS[template.difficulty || 'starter'] || DIFFICULTY_LABELS.starter;

  const blocksByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const block of template.blocks) {
      const category = block.iceType.split('.')[0];
      const existing = map.get(category) || [];
      existing.push(block.label);
      map.set(category, existing);
    }
    return map;
  }, [template.blocks]);

  const providerComparison = useMemo(() => {
    try {
      const { nodes } = expandComposedTemplate(template, template.provider);
      return compareProviderCosts(nodes, template.provider || 'aws');
    } catch {
      return [];
    }
  }, [template]);

  return (
    <div className="flex flex-col h-full">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-4 py-3 text-ice-xs text-ice-text-2 hover:text-ice-text-1 transition-colors shrink-0 border-b border-ice-border"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('templates.gallery.backToList')}
      </button>

      <div className="flex-1 overflow-y-auto">
        {/* Hero */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3 mb-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: (catMeta?.color || '#3b82f6') + '15' }}
            >
              <Icon className="h-6 w-6" style={{ color: catMeta?.color || '#3b82f6' }} />
            </div>
            <div>
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
          </div>
          <p className="text-ice-sm text-ice-text-2 leading-relaxed">
            {t(`templates.items.${template.id}.description`)}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-px bg-ice-border mx-5 rounded-lg overflow-hidden mb-4">
          <div className="bg-ice-surface px-3 py-2.5 text-center">
            <div className="text-sm font-semibold text-ice-text-1">{template.estimatedCost}</div>
            <div className="text-ice-2xs text-ice-text-3">{t('templates.gallery.costEstimate')}</div>
          </div>
          <div className="bg-ice-surface px-3 py-2.5 text-center">
            <div className="text-sm font-semibold text-ice-text-1">{diffInfo.label}</div>
            <div className="text-ice-2xs text-ice-text-3">{t('templates.gallery.difficulty')}</div>
          </div>
        </div>

        {/* Providers (filtered by feature flags) */}
        {(() => {
          const enabledProviders = getEnabledProvidersForTemplate(template);
          if (enabledProviders.length === 0) return null;
          return (
            <div className="px-5 mb-4">
              <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">
                {t('templates.gallery.provider')}
              </div>
              <div className="flex gap-1.5">
                {enabledProviders.map((p) => (
                  <span
                    key={p}
                    className="text-ice-xs font-medium px-2.5 py-1 rounded-md bg-ice-raised text-ice-text-2 uppercase"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Provider Cost Comparison */}
        {providerComparison.length > 0 && (
          <div className="px-5 mb-4">
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">
              {t('cost.providerComparison')}
            </div>
            <div className="space-y-1.5">
              {providerComparison.map((pc) => (
                <div
                  key={pc.provider}
                  className={cn(
                    'flex items-center justify-between py-1 px-2 rounded',
                    pc.provider === (template.provider || 'aws') && 'bg-emerald-500/10 border border-emerald-500/20',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-ice-sm text-ice-text-1 font-medium">{pc.label}</span>
                    {pc.provider === (template.provider || 'aws') && (
                      <span className="text-ice-xs text-emerald-400">current</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-ice-sm text-ice-text-1 font-mono">
                      {formatCostRaw(pc.totalMonthlyCost)}/mo
                    </span>
                    {pc.provider !== (template.provider || 'aws') && pc.delta !== 0 && (
                      <span className={cn('text-ice-xs font-mono', pc.delta < 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {pc.delta > 0 ? '+' : ''}
                        {Math.round(pc.deltaPercent)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compliance */}
        {template.compliance && template.compliance.length > 0 && (
          <div className="px-5 mb-4">
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
        <div className="px-5 mb-4">
          <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-2">
            {t('templates.gallery.resourceBreakdown')}
          </div>
          <div className="space-y-1.5">
            {Array.from(blocksByCategory.entries()).map(([category, labels]) => (
              <div key={category} className="flex items-start gap-2 text-ice-xs">
                <Box className="w-3 h-3 text-ice-text-3 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-ice-text-2">
                    {t(`blocks.categories.${category.toLowerCase()}.label`)}
                  </span>
                  <span className="text-ice-text-3 ml-1">{labels.join(', ')}</span>
                </div>
              </div>
            ))}
            {template.connections.length > 0 && (
              <div className="flex items-center gap-2 text-ice-xs">
                <Cable className="w-3 h-3 text-ice-text-3 shrink-0" />
                <span className="text-ice-text-3">
                  {template.connections.length} {t('templates.gallery.connections')}
                </span>
              </div>
            )}
            {template.groups && template.groups.length > 0 && (
              <div className="flex items-center gap-2 text-ice-xs">
                <Layers className="w-3 h-3 text-ice-text-3 shrink-0" />
                <span className="text-ice-text-3">
                  {template.groups.length} {t('templates.gallery.groups')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Environments */}
        {template.environmentPresets.length > 0 && (
          <div className="px-5 mb-4">
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

        {/* Tags */}
        {template.tags.length > 0 && (
          <div className="px-5 mb-4">
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">
              {t('templates.gallery.tags')}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {template.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-ice-2xs px-1.5 py-0.5">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Repo */}
        {template.repo && (
          <div className="px-5 mb-5">
            <a
              href={template.repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ice-xs text-ice-accent hover:underline flex items-center gap-1"
            >
              <GitBranch className="w-3 h-3" /> {t('templates.gallery.viewRepository')}
            </a>
          </div>
        )}
      </div>

      {/* Sticky bottom */}
      <div className="shrink-0 px-5 py-4 border-t border-ice-border">
        <button
          onClick={() => onUse(template)}
          className="flex items-center justify-center gap-2 w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-ice-accent text-ice-text-1 hover:bg-ice-accent-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('wizard.createButton')}
        </button>
      </div>
    </div>
  );
};
