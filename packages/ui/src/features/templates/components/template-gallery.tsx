/**
 * Template Gallery — Full-screen overlay
 *
 * Opened from the sidebar category panel or empty canvas overlay.
 * Full searchable, filterable gallery with:
 * - Sidebar filters (category, provider, compliance, difficulty)
 * - Grid of template cards with metadata
 * - Detail view with resource breakdown
 * - "Use Template" adds to the ACTIVE canvas (does NOT replace)
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
  ArrowLeft,
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
  X,
  Search,
  Plus,
} from 'lucide-react';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  searchTemplates,
  getFeaturedTemplates,
  expandComposedTemplate,
} from '../../../config/templates';
import { SECURITY_LEVEL_COLORS } from '../../../config/color-palette';
import { Badge } from '../../../shared/components/ui/badge';
import { SearchInput } from '../../../shared/components/ui/search-input';
import {
  Dialog,
  DialogContent,
} from '../../../shared/components/ui/dialog';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import { compareProviderCosts } from '../../../features/cost/utils/provider-pricing';
import { formatCostRaw } from '../../../features/cost/utils/cost-calculator';
import { addToActiveCard } from '../../../store/slices/cards-slice';
import { closeTemplateGallery } from '../../../store/slices/ui-slice';
import type { ComposedTemplate, TemplateCategory, TemplateCategoryMeta } from '../../../config/templates/types';
import type { AppDispatch, RootState } from '../../../store';

// =============================================================================
// Icon map
// =============================================================================

const ICON_MAP: Record<string, React.ElementType> = {
  Rocket, Brain, BrainCircuit, ShieldCheck, Zap, Server, Activity, Globe,
  Waypoints, ShoppingCart, Smartphone, GitBranch,
};

const DIFFICULTY_LABELS: Record<string, { label: string; dots: number }> = {
  starter: { label: 'Starter', dots: 1 },
  intermediate: { label: 'Intermediate', dots: 2 },
  advanced: { label: 'Advanced', dots: 3 },
  expert: { label: 'Expert', dots: 4 },
};

// =============================================================================
// Sub-components
// =============================================================================

const DifficultyDots: React.FC<{ level?: string }> = ({ level }) => {
  const info = DIFFICULTY_LABELS[level || 'starter'] || DIFFICULTY_LABELS.starter;
  return (
    <span className="flex items-center gap-0.5" title={info.label}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn('w-1 h-1 rounded-full', i <= info.dots ? 'bg-ice-accent' : 'bg-ice-border')} />
      ))}
    </span>
  );
};

const ProviderBadges: React.FC<{ providers?: string[] }> = ({ providers }) => {
  if (!providers || providers.length === 0) return null;
  return (
    <span className="flex items-center gap-0.5">
      {providers.map((p) => (
        <span key={p} className="text-ice-2xs font-medium px-1 py-0 rounded bg-ice-raised text-ice-text-3 uppercase">{p}</span>
      ))}
    </span>
  );
};

const TrustBadge: React.FC<{ trust?: string }> = ({ trust }) => {
  if (!trust || trust === 'community') return null;
  return (
    <span className={cn(
      'text-ice-2xs font-semibold px-1 py-0 rounded',
      trust === 'official' ? 'bg-ice-accent/15 text-ice-accent' : 'bg-emerald-500/15 text-emerald-400',
    )}>
      {trust === 'official' ? 'Official' : 'Verified'}
    </span>
  );
};

// =============================================================================
// Template Card — for the grid
// =============================================================================

interface TemplateCardProps {
  template: ComposedTemplate;
  onSelect: (template: ComposedTemplate) => void;
}

const TemplateCard: React.FC<TemplateCardProps> = React.memo(({ template, onSelect }) => {
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
            <span className="text-sm font-semibold text-ice-text-1 truncate">{template.name}</span>
            <TrustBadge trust={template.trust} />
          </div>
          <span className="text-ice-xs text-ice-text-3">{template.estimatedCost}</span>
        </div>
        <ChevronRight className="w-4 h-4 text-ice-text-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Description */}
      <p className="text-ice-xs text-ice-text-2 leading-snug line-clamp-2">{template.description}</p>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <DifficultyDots level={template.difficulty} />
        <span className="text-ice-2xs text-ice-text-3">{template.blocks.length} blocks</span>
        {template.connections.length > 0 && (
          <span className="text-ice-2xs text-ice-text-3">{template.connections.length} connections</span>
        )}
        <ProviderBadges providers={template.providers} />
      </div>

      {/* Tags */}
      <div className="flex gap-1 flex-wrap">
        {template.tags.slice(0, 4).map((tag) => (
          <Badge key={tag} variant="secondary" className="text-ice-2xs px-1.5 py-0">{tag}</Badge>
        ))}
      </div>
    </button>
  );
});
TemplateCard.displayName = 'TemplateCard';

// =============================================================================
// Template Detail — full detail panel inside the gallery
// =============================================================================

interface TemplateDetailProps {
  template: ComposedTemplate;
  onBack: () => void;
  onUse: (template: ComposedTemplate) => void;
}

const TemplateDetail: React.FC<TemplateDetailProps> = ({ template, onBack, onUse }) => {
  const { t } = useTranslation();
  const Icon = ICON_MAP[template.icon] || Rocket;
  const catMeta = TEMPLATE_CATEGORIES.find((c) => c.id === template.category);
  const secColor = SECURITY_LEVEL_COLORS[template.securityLevel] || '#6b7280';
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
              <h2 className="text-base font-semibold text-ice-text-1">{template.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <TrustBadge trust={template.trust} />
                {catMeta && (
                  <span className="text-ice-2xs px-1.5 py-0.5 rounded font-medium" style={{ color: catMeta.color, backgroundColor: catMeta.color + '15' }}>
                    {catMeta.label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="text-ice-sm text-ice-text-2 leading-relaxed">{template.description}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-px bg-ice-border mx-5 rounded-lg overflow-hidden mb-4">
          <div className="bg-ice-surface px-3 py-2.5 text-center">
            <div className="text-sm font-semibold text-ice-text-1">{template.estimatedCost}</div>
            <div className="text-ice-2xs text-ice-text-3">{t('templates.gallery.costEstimate')}</div>
          </div>
          <div className="bg-ice-surface px-3 py-2.5 text-center">
            <div className="text-sm font-semibold text-ice-text-1">{diffInfo.label}</div>
            <div className="text-ice-2xs text-ice-text-3">{t('templates.gallery.difficulty')}</div>
          </div>
          <div className="bg-ice-surface px-3 py-2.5 text-center">
            <div className="text-sm font-semibold" style={{ color: secColor }}>{template.securityLevel}</div>
            <div className="text-ice-2xs text-ice-text-3">{t('templates.gallery.security')}</div>
          </div>
        </div>

        {/* Providers */}
        {template.providers && template.providers.length > 0 && (
          <div className="px-5 mb-4">
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">{t('templates.gallery.provider')}</div>
            <div className="flex gap-1.5">
              {template.providers.map((p) => (
                <span key={p} className="text-ice-xs font-medium px-2.5 py-1 rounded-md bg-ice-raised text-ice-text-2 uppercase">{p}</span>
              ))}
            </div>
          </div>
        )}

        {/* Provider Cost Comparison */}
        {providerComparison.length > 0 && (
          <div className="px-5 mb-4">
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">{t('cost.providerComparison')}</div>
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
                      <span
                        className={cn(
                          'text-ice-xs font-mono',
                          pc.delta < 0 ? 'text-emerald-400' : 'text-red-400',
                        )}
                      >
                        {pc.delta > 0 ? '+' : ''}{Math.round(pc.deltaPercent)}%
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
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">Compliance</div>
            <div className="flex gap-1.5">
              {template.compliance.map((tag) => (
                <span key={tag} className="text-ice-xs font-medium px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 uppercase">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Resources */}
        <div className="px-5 mb-4">
          <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-2">{t('templates.gallery.resourceBreakdown')}</div>
          <div className="space-y-1.5">
            {Array.from(blocksByCategory.entries()).map(([category, labels]) => (
              <div key={category} className="flex items-start gap-2 text-ice-xs">
                <Box className="w-3 h-3 text-ice-text-3 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-ice-text-2">{category}</span>
                  <span className="text-ice-text-3 ml-1">{labels.join(', ')}</span>
                </div>
              </div>
            ))}
            {template.connections.length > 0 && (
              <div className="flex items-center gap-2 text-ice-xs">
                <Cable className="w-3 h-3 text-ice-text-3 shrink-0" />
                <span className="text-ice-text-3">{template.connections.length} {t('templates.gallery.connections')}</span>
              </div>
            )}
            {template.groups && template.groups.length > 0 && (
              <div className="flex items-center gap-2 text-ice-xs">
                <Layers className="w-3 h-3 text-ice-text-3 shrink-0" />
                <span className="text-ice-text-3">{template.groups.length} {t('templates.gallery.groups')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Environments */}
        {template.environmentPresets.length > 0 && (
          <div className="px-5 mb-4">
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">{t('templates.gallery.environmentPresets')}</div>
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
            <div className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider mb-1.5">{t('templates.gallery.tags')}</div>
            <div className="flex gap-1.5 flex-wrap">
              {template.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-ice-2xs px-1.5 py-0.5">{tag}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Repo */}
        {template.repo && (
          <div className="px-5 mb-5">
            <a href={template.repo.url} target="_blank" rel="noopener noreferrer"
              className="text-ice-xs text-ice-accent hover:underline flex items-center gap-1">
              <GitBranch className="w-3 h-3" /> View Repository
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
          Add to Canvas
        </button>
        <p className="text-ice-2xs text-ice-text-3 text-center mt-1.5">Adds to your current design — won't replace existing blocks</p>
      </div>
    </div>
  );
};

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
    let pool = ALL_TEMPLATES;
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

  // Add template to ACTIVE canvas (not replace)
  const handleUseTemplate = useCallback(
    (template: ComposedTemplate) => {
      const { nodes, edges } = expandComposedTemplate(template);
      // addToActiveCard merges with existing canvas — offsets new nodes to avoid overlap
      dispatch(addToActiveCard({ nodes, edges }));
      dispatch(closeTemplateGallery());

      // Sync to backend
      import('../../../shared/api/api-adapter').then(({ getApi }) => {
        getApi()
          .templates.loadToGraph({ name: template.name, nodes, edges })
          .catch((err: unknown) => console.warn('Failed to sync template to backend:', err));
      });
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
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('templates.searchPlaceholder')}
          />
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
                    ? { backgroundColor: cat.color + '20', color: cat.color, ['--tw-ring-color' as string]: cat.color + '66' }
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
                    <span className="text-ice-xs font-semibold text-ice-accent uppercase tracking-wider">{t('templates.gallery.featured')}</span>
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
                      <span className="text-ice-xs font-semibold uppercase tracking-wider" style={{ color: category.color }}>
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
