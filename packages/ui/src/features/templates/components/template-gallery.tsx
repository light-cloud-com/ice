/**
 * Template Gallery — Full-screen overlay
 *
 * Opened from the sidebar category panel or empty canvas overlay.
 * Full searchable, filterable gallery with:
 *   - Sidebar filters (category, provider, compliance, difficulty)
 *   - Grid of template cards with metadata
 *   - Detail view with resource breakdown
 *   - "Use Template" adds to the ACTIVE canvas (does NOT replace)
 *
 * Sub-component splits (rf-tgal series):
 *   - `../data/icon-map.ts`               — ICON_MAP lucide registry (rf-tgal-1)
 *   - `../utils/difficulty-labels.ts`     — getDifficultyLabels(t) (rf-tgal-2)
 *   - `./badges.tsx`                      — DifficultyDots / ProviderBadges /
 *                                            TrustBadge / TechStackLogos (rf-tgal-3)
 *   - `./template-card.tsx`               — memoised grid card (rf-tgal-4)
 *   - `./template-detail.tsx`             — full detail panel (rf-tgal-5)
 */

import { getEnabledProvidersForTemplate } from '@ice/templates';
import { Zap, LayoutTemplate, Sparkles } from 'lucide-react';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { TemplateCard } from './template-card';
import { TemplateDetail } from './template-detail';
import {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  searchTemplates,
  getFeaturedTemplates,
  expandComposedTemplate,
} from '../../../config/templates';
import { useTranslation } from '../../../i18n';
import axiosInstance from '../../../shared/api/axios-instance';
import { Dialog, DialogContent } from '../../../shared/components/ui/dialog';
import { SearchInput } from '../../../shared/components/ui/search-input';
import { cn } from '../../../shared/utils/cn';
import { toSlug } from '../../../shared/utils/slug';
import { store } from '../../../store';
import { closeTemplateGallery } from '../../../store/slices/ui-slice';
import { ICON_MAP } from '../data/icon-map';
import type { ComposedTemplate, TemplateCategory, TemplateCategoryMeta } from '../../../config/templates';
import type { AppDispatch, RootState } from '../../../store';

// =============================================================================
// Template Gallery Dialog — full-screen overlay
// =============================================================================

export const TemplateGalleryDialog: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const isOpen = useSelector((state: RootState) => state.ui.dialogs.templateGallery);
  const initialCategory = useSelector((state: RootState) => state.ui.templateGalleryCategory);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<ComposedTemplate | null>(null);

  // Sync initial category from sidebar click
  useEffect(() => {
    if (isOpen && initialCategory) {
      setActiveCategory(initialCategory as TemplateCategory);
      setSelectedTemplate(null);
      setSearch('');
    } else if (isOpen && !initialCategory) {
      setActiveCategory('all');
      setSelectedTemplate(null);
      setSearch('');
    }
  }, [isOpen, initialCategory]);

  const filtered = useMemo(() => {
    // Hide templates whose every block is disabled by feature flags — these
    // would land on the canvas as a sea of `providerUnsupported` stubs and
    // confuse the user. Templates that retain at least one viable provider
    // stay visible.
    let pool = ALL_TEMPLATES.filter((tpl) => getEnabledProvidersForTemplate(tpl).length > 0);
    if (activeCategory !== 'all') {
      pool = pool.filter((tpl) => tpl.category === activeCategory);
    }
    return searchTemplates(search, pool);
  }, [search, activeCategory]);

  const featured = useMemo(() => getFeaturedTemplates(), []);
  const showFeatured = activeCategory === 'all' && !search;

  // Group by category
  const groupedByCategory = useMemo(() => {
    const templates = showFeatured ? filtered.filter((tpl) => !tpl.featured) : filtered;
    const groups: { category: TemplateCategoryMeta; templates: ComposedTemplate[] }[] = [];
    for (const cat of TEMPLATE_CATEGORIES) {
      const catTemplates = templates.filter((tpl) => tpl.category === cat.id);
      if (catTemplates.length > 0) {
        groups.push({ category: cat, templates: catTemplates });
      }
    }
    return groups;
  }, [filtered, showFeatured]);

  // Create a new project with the selected template
  const handleUseTemplate = useCallback(
    async (template: ComposedTemplate) => {
      const rootState = store.getState() as RootState;
      const orgId = rootState.account.selectedOrg?.id;
      const orgName = rootState.account.selectedOrg?.name;
      let project: any;

      try {
        // 1. Create project
        const res = await axiosInstance.post('/canvas/projects/create', {
          name: template.name,
          type: 'project',
          organisationId: orgId,
        });
        project = res.data;

        // Non-critical steps — don't block navigation if they fail
        try {
          // 2. Set provider
          if (template.provider) {
            await axiosInstance.post('/canvas/projects/update', {
              projectId: project.id,
              provider: template.provider,
              region: template.environmentPresets[0]?.region || '',
            });
          }

          // 3. Fetch the project to get the card created by bootstrapProductionEnvironment
          const projectRes = await axiosInstance.post('/canvas/projects/get', { projectId: project.id });
          const cardId = projectRes.data.cards?.[0]?.id;

          // 4. Apply template to the production card
          const { nodes, edges } = expandComposedTemplate(template, template.provider);
          if (cardId) {
            await axiosInstance.post('/canvas/cards/update', { cardId, nodes, edges });
          }

          // 4. Refresh sidebar
          if (orgId) {
            const { fetchProjectTree } = await import('../../../store/slices/projects-slice');
            dispatch(fetchProjectTree(orgId));
          }
        } catch (err) {
          console.warn('Non-critical template step failed:', err);
        }
      } catch (err) {
        console.error('Failed to create project:', err);
        return;
      }

      // Always close and navigate if project was created
      dispatch(closeTemplateGallery());
      const slug = project.slug || toSlug(template.name);
      const basePath = orgName ? `/${toSlug(orgName)}/${slug}` : `/${slug}`;
      window.location.href = basePath;
    },
    [dispatch],
  );

  const handleClose = useCallback(() => {
    dispatch(closeTemplateGallery());
  }, [dispatch]);

  if (!isOpen) return null;

  // ── Detail view ────────────────────────────────────────────────────────
  if (selectedTemplate) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-lg max-h-[85vh] bg-ice-base border-ice-border text-ice-text-1 p-0 gap-0 overflow-hidden flex flex-col">
          <TemplateDetail
            template={selectedTemplate}
            onBack={() => setSelectedTemplate(null)}
            onUse={handleUseTemplate}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // ── Gallery list view ──────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] bg-ice-base border-ice-border text-ice-text-1 p-0 gap-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-ice-text-1">{t('templates.gallery.title')}</h2>
              <p className="text-ice-xs text-ice-text-3 mt-0.5">{t('templates.gallery.subtitle')}</p>
            </div>
          </div>

          {/* Search */}
          <SearchInput value={search} onChange={setSearch} placeholder={t('templates.searchPlaceholder')} />
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 px-5 pb-3 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'shrink-0 px-2.5 py-1 rounded-full text-ice-xs font-medium transition-all',
              activeCategory === 'all'
                ? 'bg-ice-accent-muted text-ice-accent ring-1 ring-ice-accent/40'
                : 'bg-ice-raised text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover',
            )}
          >
            {t('templates.gallery.allCategories')}
          </button>
          {TEMPLATE_CATEGORIES.map((cat) => {
            const CatIcon = ICON_MAP[cat.icon] || Zap;
            const count = ALL_TEMPLATES.filter((tpl) => tpl.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-ice-xs font-medium transition-all',
                  count === 0 && 'opacity-40',
                  activeCategory === cat.id
                    ? 'ring-1 ring-opacity-40'
                    : 'bg-ice-raised text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover',
                )}
                style={
                  activeCategory === cat.id
                    ? {
                        backgroundColor: cat.color + '20',
                        color: cat.color,
                        ['--tw-ring-color' as string]: cat.color + '66',
                      }
                    : undefined
                }
              >
                <CatIcon className="w-2.5 h-2.5" />
                {cat.label}
                {count > 0 && <span className="text-ice-2xs opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <LayoutTemplate className="w-10 h-10 text-ice-text-3 mx-auto mb-3 opacity-30" />
              <p className="text-ice-sm text-ice-text-3">
                {search ? `${t('templates.noResults')} "${search}"` : t('templates.gallery.emptyCategory')}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Featured */}
              {showFeatured && featured.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Sparkles className="w-3.5 h-3.5 text-ice-accent" />
                    <span className="text-ice-xs font-semibold text-ice-accent uppercase tracking-wider">
                      {t('templates.gallery.featured')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {featured.map((tpl) => (
                      <TemplateCard key={tpl.id} template={tpl} onSelect={setSelectedTemplate} />
                    ))}
                  </div>
                </div>
              )}

              {/* Category groups */}
              {groupedByCategory.map(({ category, templates }) => {
                const CatIcon = ICON_MAP[category.icon] || Zap;
                return (
                  <div key={category.id}>
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <CatIcon className="w-3.5 h-3.5" style={{ color: category.color }} />
                      <span
                        className="text-ice-xs font-semibold uppercase tracking-wider"
                        style={{ color: category.color }}
                      >
                        {category.label}
                      </span>
                      <span className="text-ice-2xs text-ice-text-3">({templates.length})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {templates.map((tpl) => (
                        <TemplateCard key={tpl.id} template={tpl} onSelect={setSelectedTemplate} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
