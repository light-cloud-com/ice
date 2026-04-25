/**
 * Template Gallery — Full page
 *
 * Route: /templates?category=xxx&search=xxx&provider=xxx&difficulty=xxx
 *
 * Full-page layout:
 * - Header with title, count, search, and filter chips
 * - Responsive grid of template cards
 * - Slide-in detail panel when a card is clicked
 */

import { getBrandIcon, getProviderBrandIcon } from '@ui/assets/icons/brand-registry';
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
  Box,
  Cable,
  Layers,
  Plus,
  ArrowUpRight,
  X,
} from 'lucide-react';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import type { ComposedTemplate, TemplateCategoryMeta } from '@ui/config/templates';
import type { AppDispatch, RootState } from '@ui/store';

// =============================================================================
// Constants
// =============================================================================

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

function getDifficultyMeta(t: (key: string) => string): Record<string, { label: string; dots: number }> {
  return {
    starter: { label: t('templates.gallery.difficultyStarter'), dots: 1 },
    intermediate: { label: t('templates.gallery.difficultyIntermediate'), dots: 2 },
    advanced: { label: t('templates.gallery.difficultyAdvanced'), dots: 3 },
    expert: { label: t('templates.gallery.difficultyExpert'), dots: 4 },
  };
}

// =============================================================================
// Small shared pieces
// =============================================================================

/** Renders SVG brand logos for cloud providers with fallback text */
const ProviderLogos: React.FC<{ providers?: string[]; size?: number }> = ({ providers, size = 16 }) => {
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

/** Renders SVG logos for tech stack tags (React, PostgreSQL, etc.) */
const TechStackLogos: React.FC<{ tags: string[]; max?: number }> = ({ tags, max = 5 }) => {
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

const DifficultyDots: React.FC<{ level?: string }> = ({ level }) => {
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

const TrustBadge: React.FC<{ trust?: string }> = ({ trust }) => {
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

// =============================================================================
// FilterChip — toggle pill used in the header
// =============================================================================

const FilterChip: React.FC<{
  label: string;
  icon?: React.ElementType;
  color?: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}> = ({ label, icon: Icon, color, active, count, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-ice-xs font-medium transition-colors',
      active ? 'ring-1 ring-opacity-40' : 'bg-ice-raised text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover',
    )}
    style={
      active
        ? {
            backgroundColor: (color || 'var(--ice-accent)') + '20',
            color: color || 'var(--ice-accent)',
            ['--tw-ring-color' as string]: (color || 'var(--ice-accent)') + '66',
          }
        : undefined
    }
  >
    {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
    {label}
    {count != null && <span className="text-ice-2xs opacity-60 font-variant-numeric tabular-nums">{count}</span>}
  </button>
);

// =============================================================================
// Template Card
// =============================================================================

const TemplateCard: React.FC<{
  template: ComposedTemplate;
  onSelect: (t: ComposedTemplate) => void;
}> = React.memo(({ template, onSelect }) => {
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
      {/* ── Top section: icon, name, cost ─────────────────────────────── */}
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

      {/* ── Cost banner ──────────────────────────────────────────────── */}
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

      {/* ── Provider logos + tech stack logos ─────────────────────────── */}
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

// =============================================================================
// Template Detail — slide-in right panel
// =============================================================================

const TemplateDetail: React.FC<{
  template: ComposedTemplate;
  onClose: () => void;
  onUse: (t: ComposedTemplate) => void;
}> = ({ template, onClose, onUse }) => {
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

// =============================================================================
// Template Gallery Page
// =============================================================================

export const TemplateGalleryPage: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
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

      // Always navigate if project was created
      const slug = project.slug || toSlug(template.name);
      const basePath = orgName ? `/${toSlug(orgName)}/${slug}` : `/${slug}`;
      window.location.href = basePath;
    },
    [dispatch],
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
