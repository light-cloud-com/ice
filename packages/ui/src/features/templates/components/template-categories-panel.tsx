/**
 * Template Categories Panel — Left sidebar section
 *
 * Shows template categories and featured templates with search.
 * Clicking a category navigates to /templates?category=xxx (full page).
 */

import {
  Rocket,
  Brain,
  BrainCircuit,
  ShieldCheck,
  Zap,
  Server,
  Activity,
  Globe,
  Waypoints,
  ShoppingCart,
  Smartphone,
  GitBranch,
  LayoutTemplate,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ALL_TEMPLATES, TEMPLATE_CATEGORIES, getFeaturedTemplates, searchTemplates } from '../../../config/templates';
import { useTranslation } from '../../../i18n';
import { PanelHeader } from '../../../shared/components/ui/panel-header';
import { cn } from '../../../shared/utils/cn';
import { toggleTemplates } from '../../../store/slices/ui-slice';
import type { AppDispatch } from '../../../store';

const ICON_MAP: Record<string, React.ElementType> = {
  Rocket,
  Brain,
  BrainCircuit,
  ShieldCheck,
  Zap,
  Server,
  Activity,
  Globe,
  Waypoints,
  ShoppingCart,
  Smartphone,
  GitBranch,
};

interface TemplateCategoriesPanelProps {
  /** When true, hides the close button (used when embedded inside ResourcePalette) */
  embedded?: boolean;
}

export const TemplateCategoriesPanel: React.FC<TemplateCategoriesPanelProps> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tpl of ALL_TEMPLATES) {
      counts.set(tpl.category, (counts.get(tpl.category) || 0) + 1);
    }
    return counts;
  }, []);

  const featuredTemplates = useMemo(() => getFeaturedTemplates().slice(0, 5), []);

  // Filter by search
  const isSearching = search.trim().length > 0;
  const searchResults = useMemo(() => (isSearching ? searchTemplates(search) : []), [search, isSearching]);

  const filteredCategories = useMemo(() => {
    if (!isSearching) return TEMPLATE_CATEGORIES;
    const matchedCategoryIds = new Set(searchResults.map((t) => t.category));
    return TEMPLATE_CATEGORIES.filter((cat) => matchedCategoryIds.has(cat.id));
  }, [isSearching, searchResults]);

  const filteredFeatured = useMemo(() => {
    if (!isSearching) return featuredTemplates;
    const matchedIds = new Set(searchResults.map((t) => t.id));
    return featuredTemplates.filter((t) => matchedIds.has(t.id));
  }, [isSearching, searchResults, featuredTemplates]);

  const goToGallery = (category?: string) => {
    // SPA navigation via react-router. The previous implementation used
    // `window.location.href` which triggers a full page reload — that
    // reload was the bug some users hit: the dev server's history-API
    // fallback didn't always serve the SPA bundle on a hard navigation,
    // so `/templates` returned the canvas (or 404) instead of opening
    // the gallery. `navigate(...)` stays inside the SPA's BrowserRouter
    // and the `<Route path="/templates">` registered at
    // `packages/web/src/app/app.tsx:264` picks it up cleanly.
    const params = category ? `?category=${category}` : '';
    navigate(`/templates${params}`);
  };

  return (
    <div className="h-full flex flex-col bg-ice-surface">
      <PanelHeader
        icon={<LayoutTemplate className="w-3.5 h-3.5" />}
        title={t('templates.gallery.title')}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t('templates.gallery.searchPlaceholder') || 'Search templates…',
        }}
        onClose={embedded ? undefined : () => dispatch(toggleTemplates())}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Search results summary */}
        {isSearching && (
          <div className="px-4 py-2 text-ice-2xs text-ice-text-3">
            {t('templates.gallery.templateCount', { count: searchResults.length })}
          </div>
        )}

        {/* Browse all — hero (hidden when searching) */}
        {!isSearching && (
          <div className="px-3 pt-3 pb-2">
            <button
              onClick={() => goToGallery()}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-3 rounded-lg text-left transition-all',
                'bg-ice-accent/10 border border-ice-accent/20 hover:bg-ice-accent/15',
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ice-accent/15">
                <Sparkles className="h-4 w-4 text-ice-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-ice-text-1">{t('templates.gallery.allCategories')}</span>
                <span className="text-ice-xs text-ice-text-3 block">
                  {t('templates.gallery.templateCount', { count: ALL_TEMPLATES.length })}
                </span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-ice-accent shrink-0" />
            </button>
          </div>
        )}

        {/* Category list */}
        {filteredCategories.length > 0 && (
          <div className="px-3 pb-3">
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider px-1 mb-2">
              {t('table.category')}
            </div>
            <div className="space-y-0.5">
              {filteredCategories.map((cat) => {
                const CatIcon = ICON_MAP[cat.icon] || Zap;
                const count = isSearching
                  ? searchResults.filter((t) => t.category === cat.id).length
                  : categoryCounts.get(cat.id) || 0;
                const isEmpty = count === 0;

                return (
                  <button
                    key={cat.id}
                    onClick={() => !isEmpty && goToGallery(cat.id)}
                    disabled={isEmpty}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-all',
                      isEmpty ? 'opacity-40 cursor-not-allowed' : 'hover:bg-ice-hover cursor-pointer',
                    )}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: cat.color + '15' }}
                    >
                      <CatIcon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-ice-text-1">
                        {t(`templates.categories.${cat.id}.label`)}
                      </span>
                      <span className="text-ice-2xs text-ice-text-3 block">
                        {t(`templates.categories.${cat.id}.description`)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {count > 0 ? (
                        <>
                          <span className="text-ice-xs text-ice-text-3 tabular-nums">{count}</span>
                          <ChevronRight className="w-3 h-3 text-ice-text-3" />
                        </>
                      ) : (
                        <span className="text-ice-2xs text-ice-text-3">{t('templates.gallery.comingSoon')}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Featured quick links */}
        {filteredFeatured.length > 0 && (
          <div className="px-3 pb-3">
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider px-1 mb-2">
              {t('templates.gallery.featured')}
            </div>
            <div className="space-y-0.5">
              {filteredFeatured.map((tpl) => {
                const Icon = ICON_MAP[tpl.icon] || Rocket;
                const catMeta = TEMPLATE_CATEGORIES.find((c) => c.id === tpl.category);
                return (
                  <button
                    key={tpl.id}
                    onClick={() => goToGallery()}
                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left hover:bg-ice-hover transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: catMeta?.color || '#3b82f6' }} />
                    <span className="text-ice-xs font-medium text-ice-text-1 truncate flex-1">
                      {t(`templates.items.${tpl.id}.name`)}
                    </span>
                    <span className="text-ice-2xs text-ice-text-3 shrink-0">{tpl.estimatedCost}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* No results */}
        {isSearching && searchResults.length === 0 && (
          <div className="px-4 py-8 text-center text-ice-xs text-ice-text-3">
            {t('templates.gallery.noMatchSearch', { search })}
          </div>
        )}
      </div>
    </div>
  );
};
