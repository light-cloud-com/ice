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
import { SECURITY_LEVEL_COLORS } from '@ui/config/color-palette';
import {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  searchTemplates,
  getFeaturedTemplates,
  expandComposedTemplate,
} from '@ui/config/templates';
import { useTranslation } from '@ui/i18n';
import { Badge } from '@ui/shared/components/ui/badge';
import { SearchInput } from '@ui/shared/components/ui/search-input';
import { cn } from '@ui/shared/utils/cn';
import { addToActiveCard } from '@ui/store/slices/cards-slice';
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
  Check,
  X,
} from 'lucide-react';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import type { ComposedTemplate, TemplateCategoryMeta } from '@ui/config/templates/types';
import type { AppDispatch } from '@ui/store';

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

const DIFFICULTY_META: Record<string, { label: string; dots: number }> = {
  starter: { label: 'Starter', dots: 1 },
  intermediate: { label: 'Intermediate', dots: 2 },
  advanced: { label: 'Advanced', dots: 3 },
  expert: { label: 'Expert', dots: 4 },
};

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
    <span className="flex items-center gap-1">
      {resolved.map((b) => (
        <img key={b.key} src={b.url} alt={b.label} title={b.label} width={14} height={14} className="shrink-0" />
      ))}
    </span>
  );
};

const DifficultyDots: React.FC<{ level?: string }> = ({ level }) => {
  const info = DIFFICULTY_META[level || 'starter'] || DIFFICULTY_META.starter;
  return (
    <span className="flex items-center gap-0.5" title={info.label}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn('w-1.5 h-1.5 rounded-full', i <= info.dots ? 'bg-ice-accent' : 'bg-ice-border')} />
      ))}
    </span>
  );
};

const TrustBadge: React.FC<{ trust?: string }> = ({ trust }) => {
  if (!trust || trust === 'community') return null;
  return (
    <span
      className={cn(
        'text-ice-2xs font-semibold px-1.5 py-0.5 rounded',
        trust === 'official' ? 'bg-ice-accent/15 text-ice-accent' : 'bg-emerald-500/15 text-emerald-400',
      )}
    >
      {trust === 'official' ? 'Official' : 'Verified'}
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
            <span className="text-sm font-semibold text-ice-text-1 truncate">{template.name}</span>
            <TrustBadge trust={template.trust} />
          </div>
          <p className="text-ice-xs text-ice-text-2 leading-snug line-clamp-2 mt-0.5">{template.description}</p>
        </div>
      </div>

      {/* ── Cost banner ──────────────────────────────────────────────── */}
      <div className="mx-4 mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-ice-raised/60">
        <span className="text-xs font-semibold text-ice-text-1 font-variant-numeric tabular-nums">
          {template.estimatedCost}
        </span>
        <span className="text-ice-2xs text-ice-text-3">/month est.</span>
        <span className="flex-1" />
        <DifficultyDots level={template.difficulty} />
        <span className="text-ice-2xs text-ice-text-3">{template.blocks.length} blocks</span>
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

      {/* ── Tag pills ────────────────────────────────────────────────── */}
      <div className="flex gap-1 flex-wrap px-4 pb-4">
        {template.tags.slice(0, 4).map((tag) => (
          <Badge key={tag} variant="secondary" className="text-ice-2xs px-1.5 py-0">
            {tag}
          </Badge>
        ))}
        {template.tags.length > 4 && (
          <span className="text-ice-2xs text-ice-text-3 self-center">+{template.tags.length - 4}</span>
        )}
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
  applied: boolean;
}> = ({ template, onClose, onUse, applied }) => {
  const Icon = ICON_MAP[template.icon] || Rocket;
  const catMeta = TEMPLATE_CATEGORIES.find((c) => c.id === template.category);
  const secColor = SECURITY_LEVEL_COLORS[template.securityLevel] || '#6b7280';
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
          <h2 className="text-base font-semibold text-ice-text-1">{template.name}</h2>
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
          aria-label="Close details"
          className="p-1 rounded text-ice-text-3 hover:text-ice-text-1 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <p className="text-ice-sm text-ice-text-2 leading-relaxed">{template.description}</p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-px bg-ice-border rounded-lg overflow-hidden">
          {[
            { value: template.estimatedCost, label: 'Cost' },
            { value: diffInfo.label, label: 'Difficulty' },
            { value: template.securityLevel, label: 'Security', color: secColor },
          ].map((s) => (
            <div key={s.label} className="bg-ice-surface px-3 py-2.5 text-center">
              <div
                className="text-sm font-semibold text-ice-text-1 capitalize"
                style={s.color ? { color: s.color } : undefined}
              >
                {s.value}
              </div>
              <div className="text-ice-2xs text-ice-text-3">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Providers — with logos */}
        {template.providers && template.providers.length > 0 && (
          <div>
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">Providers</div>
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
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">Compliance</div>
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
          <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-2">Resources</div>
          <div className="space-y-1.5">
            {Array.from(blocksByCategory.entries()).map(([cat, labels]) => (
              <div key={cat} className="flex items-start gap-2 text-ice-xs">
                <Box className="w-3 h-3 text-ice-text-3 mt-0.5 shrink-0" aria-hidden="true" />
                <span className="font-medium text-ice-text-2">{cat}</span>
                <span className="text-ice-text-3">{labels.join(', ')}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-ice-xs">
              <Cable className="w-3 h-3 text-ice-text-3" aria-hidden="true" />
              <span className="text-ice-text-3">{template.connections.length} connections</span>
            </div>
            {template.groups && template.groups.length > 0 && (
              <div className="flex items-center gap-2 text-ice-xs">
                <Layers className="w-3 h-3 text-ice-text-3" aria-hidden="true" />
                <span className="text-ice-text-3">{template.groups.length} groups</span>
              </div>
            )}
          </div>
        </div>

        {/* Environments */}
        {template.environmentPresets.length > 0 && (
          <div>
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">Environments</div>
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
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">Tech Stack</div>
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
            <GitBranch className="w-3 h-3" aria-hidden="true" /> View Repository{' '}
            <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
          </a>
        )}
      </div>

      {/* Action */}
      <div className="shrink-0 px-5 py-4 border-t border-ice-border">
        <button
          onClick={() => onUse(template)}
          disabled={applied}
          className={cn(
            'flex items-center justify-center gap-2 w-full text-sm font-medium px-4 py-2.5 rounded-lg transition-colors',
            applied
              ? 'bg-emerald-500/15 text-emerald-400 cursor-default'
              : 'bg-ice-accent text-ice-text-1 hover:bg-ice-accent-hover',
          )}
        >
          {applied ? (
            <>
              <Check className="w-4 h-4" /> Added to Canvas
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" /> Add to Canvas
            </>
          )}
        </button>
        {!applied && (
          <p className="text-ice-2xs text-ice-text-3 text-center mt-1.5">
            Adds to your current design — won't replace existing blocks
          </p>
        )}
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
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
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
    (template: ComposedTemplate) => {
      const { nodes, edges } = expandComposedTemplate(template);
      dispatch(addToActiveCard({ nodes, edges }));
      setAppliedIds((prev) => new Set(prev).add(template.id));
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
              Templates
            </h1>
            <p className="text-ice-xs text-ice-text-3 mt-0.5 tabular-nums">{filtered.length} templates</p>
          </div>
          <div className="w-72">
            <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search templates\u2026" />
          </div>
        </div>

        {/* Filter rows */}
        <div className="px-6 pb-3 space-y-2">
          {/* Category */}
          <div className="flex items-center gap-2">
            <span className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider w-16 shrink-0">
              Category
            </span>
            <div className="flex items-center gap-1 overflow-x-auto">
              <FilterChip
                label="All"
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
                    label={cat.label}
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
              Provider
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
              Difficulty
            </span>
            <div className="flex items-center gap-1">
              {Object.entries(DIFFICULTY_META).map(([key, info]) => (
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
                Clear filters
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
                {searchParam ? `No templates match "${searchParam}"` : 'No templates match the current filters'}
              </p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="mt-3 text-ice-xs text-ice-accent hover:underline">
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {showFeatured && featured.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-ice-accent" aria-hidden="true" />
                    <span className="text-sm font-semibold text-ice-accent">Featured</span>
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
                        {category.label}
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
              applied={appliedIds.has(selectedTemplate.id)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
