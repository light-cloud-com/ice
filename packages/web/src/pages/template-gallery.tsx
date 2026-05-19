/**
 * Template Gallery — Full page
 *
 * Route: /templates?category=xxx&search=xxx&provider=xxx&difficulty=xxx
 *
 * Full-page layout:
 *   - Header with title, count, search, and filter chips
 *   - Responsive grid of template cards
 *   - Slide-in detail panel when a card is clicked
 *
 * Sub-component splits (rf-wgal series):
 *   - `./template-gallery/data/icon-map.ts`              — ICON_MAP lucide registry (rf-wgal-1)
 *   - `./template-gallery/utils/difficulty-meta.ts`      — getDifficultyMeta(t) (rf-wgal-2)
 *   - `./template-gallery/components/badges.tsx`         — ProviderLogos / TechStackLogos /
 *                                                          DifficultyDots / TrustBadge (rf-wgal-3)
 *   - `./template-gallery/components/filter-chip.tsx`    — FilterChip toggle pill (rf-wgal-4)
 *   - `./template-gallery/components/template-card.tsx`  — memoised grid card (rf-wgal-5)
 *   - `./template-gallery/components/template-detail.tsx` — full detail panel (rf-wgal-6)
 */

import {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  searchTemplates,
  getFeaturedTemplates,
  expandComposedTemplate,
} from '@ui/config/templates';
import { useTranslation } from '@ui/i18n';
import axiosInstance from '@ui/shared/api/axios-instance';
import { SearchInput } from '@ui/shared/components/ui/search-input';
import { cn } from '@ui/shared/utils/cn';
import { toSlug } from '@ui/shared/utils/slug';
import { store } from '@ui/store';
import { Zap, LayoutTemplate, Sparkles, X } from 'lucide-react';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FilterChip } from './template-gallery/components/filter-chip';
import { TemplateCard } from './template-gallery/components/template-card';
import { TemplateDetail } from './template-gallery/components/template-detail';
import { ICON_MAP } from './template-gallery/data/icon-map';
import { getDifficultyMeta } from './template-gallery/utils/difficulty-meta';
import type { ComposedTemplate, TemplateCategoryMeta } from '@ui/config/templates';
import type { AppDispatch, RootState } from '@ui/store';

// =============================================================================
// Template Gallery Page
// =============================================================================

export const TemplateGalleryPage: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-synced state
  const categoryParam = searchParams.get('category') || 'all';
  const searchParam = searchParams.get('search') || '';
  const difficultyParam = searchParams.get('difficulty') || '';
  const providerParam = searchParams.get('provider') || '';

  const [selectedTemplate, setSelectedTemplate] = useState<ComposedTemplate | null>(null);
  const [searchInput, setSearchInput] = useState(searchParam);

  useEffect(() => {
    setSearchInput(searchParam);
  }, [searchParam]);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v && v !== 'all') next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const timer = setTimeout(() => updateParams({ search: searchInput }), 300);
    return () => clearTimeout(timer);
  }, [searchInput, updateParams]);

  // Count active filters
  const activeFilterCount = [categoryParam !== 'all' && categoryParam, difficultyParam, providerParam].filter(
    Boolean,
  ).length;

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
    setSearchInput('');
  }, [setSearchParams]);

  // Filter
  const filtered = useMemo(() => {
    let pool = ALL_TEMPLATES;
    if (categoryParam && categoryParam !== 'all') pool = pool.filter((tpl) => tpl.category === categoryParam);
    if (difficultyParam) pool = pool.filter((tpl) => tpl.difficulty === difficultyParam);
    if (providerParam) pool = pool.filter((tpl) => tpl.providers?.includes(providerParam as 'gcp' | 'aws' | 'azure'));
    return searchTemplates(searchParam, pool);
  }, [searchParam, categoryParam, difficultyParam, providerParam]);

  const featured = useMemo(() => getFeaturedTemplates(), []);
  const showFeatured = categoryParam === 'all' && !searchParam && !difficultyParam && !providerParam;

  const groupedByCategory = useMemo(() => {
    const pool = showFeatured ? filtered.filter((tpl) => !tpl.featured) : filtered;
    const groups: { category: TemplateCategoryMeta; templates: ComposedTemplate[] }[] = [];
    for (const cat of TEMPLATE_CATEGORIES) {
      const items = pool.filter((tpl) => tpl.category === cat.id);
      if (items.length > 0) groups.push({ category: cat, templates: items });
    }
    return groups;
  }, [filtered, showFeatured]);

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
            const { fetchProjectTree } = await import('@ui/store/slices/projects-slice');
            dispatch(fetchProjectTree(orgId));
          }
        } catch (err) {
          console.warn('Non-critical template step failed:', err);
        }
      } catch (err) {
        console.error('Failed to create project:', err);
        return;
      }

      // Always navigate if project was created. Use react-router's
      // navigate() — `window.location.href` (the previous shape) forces a
      // full-page reload, which in the dev server + Electron desktop
      // combination has been observed to drop the navigation entirely
      // (the page reloads to the SAME URL because the dev server's
      // history-API fallback serves index.html before the route's
      // intended target is read). Staying inside the SPA's BrowserRouter
      // means the new project URL is resolved by `<Route path="/*">` →
      // `DynamicContent` → `useResolvePath` → renders the canvas.
      const slug = project.slug || toSlug(template.name);
      const basePath = orgName ? `/${toSlug(orgName)}/${slug}` : `/${slug}`;
      navigate(basePath);
    },
    [dispatch, navigate],
  );

  return (
    <div className="h-full flex flex-col">
      {/* ═══ Page header ═══════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b border-ice-border bg-ice-surface">
        {/* Title row */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <h1 className="text-lg font-semibold text-ice-text-1" style={{ textWrap: 'balance' }}>
              {t('templates.gallery.title')}
            </h1>
            <p className="text-ice-xs text-ice-text-3 mt-0.5 tabular-nums">
              {t('templates.gallery.templateCount', { count: filtered.length })}
            </p>
          </div>
          <div className="w-72">
            <SearchInput value={searchInput} onChange={setSearchInput} placeholder={t('templates.searchPlaceholder')} />
          </div>
        </div>

        {/* Filter rows */}
        <div className="px-6 pb-3 space-y-2">
          {/* Category */}
          <div className="flex items-center gap-2">
            <span className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider w-16 shrink-0">
              {t('table.category')}
            </span>
            <div className="flex items-center gap-1 overflow-x-auto">
              <FilterChip
                label={t('templates.gallery.allCategories')}
                icon={LayoutTemplate}
                active={!categoryParam || categoryParam === 'all'}
                count={ALL_TEMPLATES.length}
                onClick={() => updateParams({ category: 'all' })}
              />
              {TEMPLATE_CATEGORIES.map((cat) => {
                const count = ALL_TEMPLATES.filter((tpl) => tpl.category === cat.id).length;
                if (count === 0) return null;
                const CatIcon = ICON_MAP[cat.icon] || Zap;
                return (
                  <FilterChip
                    key={cat.id}
                    label={t(`templates.categories.${cat.id}.label`)}
                    icon={CatIcon}
                    color={cat.color}
                    active={categoryParam === cat.id}
                    count={count}
                    onClick={() => updateParams({ category: categoryParam === cat.id ? 'all' : cat.id })}
                  />
                );
              })}
            </div>
          </div>

          {/* Provider */}
          <div className="flex items-center gap-2">
            <span className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider w-16 shrink-0">
              {t('templates.gallery.providerFilter')}
            </span>
            <div className="flex items-center gap-1">
              {['gcp', 'aws', 'azure'].map((p) => (
                <FilterChip
                  key={p}
                  label={p.toUpperCase()}
                  active={providerParam === p}
                  onClick={() => updateParams({ provider: providerParam === p ? '' : p })}
                />
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div className="flex items-center gap-2">
            <span className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider w-16 shrink-0">
              {t('templates.gallery.difficultyFilter')}
            </span>
            <div className="flex items-center gap-1">
              {Object.entries(getDifficultyMeta(t)).map(([key, info]) => (
                <FilterChip
                  key={key}
                  label={info.label}
                  active={difficultyParam === key}
                  onClick={() => updateParams({ difficulty: difficultyParam === key ? '' : key })}
                />
              ))}
            </div>

            {/* Clear filters */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="ml-2 flex items-center gap-1 text-ice-xs text-ice-text-3 hover:text-ice-text-1 transition-colors"
              >
                <X className="w-3 h-3" />
                {t('templates.gallery.clearFilters')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Content area ════════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 flex">
        {/* Grid */}
        <div className={cn('flex-1 min-w-0 overflow-y-auto px-6 py-5', selectedTemplate && 'max-w-[calc(100%-380px)]')}>
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <LayoutTemplate className="w-12 h-12 text-ice-text-3 mx-auto mb-3 opacity-30" />
              <p className="text-ice-sm text-ice-text-3">
                {searchParam
                  ? t('templates.gallery.noMatchSearch', { search: searchParam })
                  : t('templates.gallery.noMatchFilters')}
              </p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="mt-3 text-ice-xs text-ice-accent hover:underline">
                  {t('templates.gallery.clearAllFilters')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {showFeatured && featured.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-ice-accent" aria-hidden="true" />
                    <span className="text-sm font-semibold text-ice-accent">{t('templates.gallery.featured')}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {featured.map((tpl) => (
                      <TemplateCard key={tpl.id} template={tpl} onSelect={setSelectedTemplate} />
                    ))}
                  </div>
                </div>
              )}

              {groupedByCategory.map(({ category, templates }) => {
                const CatIcon = ICON_MAP[category.icon] || Zap;
                return (
                  <div key={category.id}>
                    <div className="flex items-center gap-2 mb-3">
                      <CatIcon className="w-4 h-4" style={{ color: category.color }} aria-hidden="true" />
                      <span className="text-sm font-semibold" style={{ color: category.color }}>
                        {t(`templates.categories.${category.id}.label`)}
                      </span>
                      <span className="text-ice-xs text-ice-text-3">({templates.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

        {/* Detail panel */}
        {selectedTemplate && (
          <div className="w-[380px] shrink-0">
            <TemplateDetail
              template={selectedTemplate}
              onClose={() => setSelectedTemplate(null)}
              onUse={handleUseTemplate}
            />
          </div>
        )}
      </div>
    </div>
  );
};
