/**
 * Step 3: Template Selection
 *
 * Searchable template grid with category tabs, "Blank" option, and provider compatibility.
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
  FileCode2,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  searchTemplates,
  getProviderCompatibility,
} from '../../../config/templates';
import { SECURITY_LEVEL_COLORS } from '../../../config/color-palette';
import { Badge } from '../../../shared/components/ui/badge';
import { SearchInput } from '../../../shared/components/ui/search-input';
import { cn } from '../../../shared/utils/cn';
import type { Provider } from '../../../config/blocks/types';
import type { TemplateCategory } from '../../../config/templates';

const ICON_MAP: Record<string, React.ElementType> = {
  Rocket,
  Brain,
  BrainCircuit,
  ShieldCheck,
  Zap,
  Server,
  Activity,
  Globe,
};

const SECURITY_BADGE: Record<string, { label: string; color: string }> = {
  basic: { label: 'Basic', color: SECURITY_LEVEL_COLORS.basic },
  standard: { label: 'Standard', color: SECURITY_LEVEL_COLORS.standard },
  strict: { label: 'Strict', color: SECURITY_LEVEL_COLORS.strict },
  compliance: { label: 'Compliance', color: SECURITY_LEVEL_COLORS.compliance },
};

interface TemplateStepProps {
  selectedTemplateId: string | null;
  searchQuery: string;
  provider: Provider;
  onSelect: (templateId: string | null) => void;
  onSearchChange: (query: string) => void;
}

export const TemplateStep: React.FC<TemplateStepProps> = ({
  selectedTemplateId,
  searchQuery,
  provider,
  onSelect,
  onSearchChange,
}) => {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');

  const filtered = useMemo(() => {
    // First filter by category
    let pool = ALL_TEMPLATES;
    if (activeCategory !== 'all') {
      pool = pool.filter((t) => t.category === activeCategory);
    }
    // Then apply text search
    return searchTemplates(searchQuery, pool);
  }, [searchQuery, activeCategory]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-ice-text-1 mb-1">Choose a Template</h3>
        <p className="text-xs text-ice-text-2 mb-3">Start from a pre-built template or a blank canvas</p>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveCategory('all')}
          className={cn(
            'shrink-0 px-2.5 py-1 rounded-full text-ice-xs font-medium transition-all',
            activeCategory === 'all'
              ? 'bg-ice-accent-muted text-ice-accent ring-1 ring-ice-accent/40'
              : 'bg-ice-surface text-ice-text-2 hover:text-ice-text-1 hover:bg-ice-hover',
          )}
        >
          All
        </button>
        {TEMPLATE_CATEGORIES.map((cat) => {
          const CatIcon = ICON_MAP[cat.icon] || Zap;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-ice-xs font-medium transition-all',
                activeCategory === cat.id
                  ? 'ring-1 ring-opacity-40'
                  : 'bg-ice-surface text-ice-text-2 hover:text-ice-text-1 hover:bg-ice-hover',
              )}
              style={
                activeCategory === cat.id
                  ? {
                      backgroundColor: cat.color + '20',
                      color: cat.color,
                      // @ts-expect-error CSS custom property
                      '--tw-ring-color': cat.color + '66',
                    }
                  : undefined
              }
            >
              <CatIcon className="w-2.5 h-2.5" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <SearchInput
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Search templates..."
      />

      {/* Template grid */}
      <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
        {/* Blank option */}
        <button
          onClick={() => onSelect(null)}
          className={cn(
            'flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all',
            selectedTemplateId === null
              ? 'border-ice-accent bg-ice-accent-muted'
              : 'border-ice-border bg-ice-surface hover:border-ice-border-strong',
          )}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ice-raised">
              <FileCode2 className="h-3.5 w-3.5 text-ice-text-2" />
            </div>
            <span className="text-xs font-semibold text-ice-text-1">Blank Canvas</span>
          </div>
          <p className="text-ice-xs text-ice-text-2 leading-snug">
            Start with an empty canvas and build your infrastructure from scratch.
          </p>
        </button>

        {/* Template cards */}
        {filtered.map((template) => {
          const Icon = ICON_MAP[template.icon] || Rocket;
          const secBadge = SECURITY_BADGE[template.securityLevel];
          const isSelected = selectedTemplateId === template.id;
          const compat = getProviderCompatibility(template, provider);
          const allSupported = compat.supported === compat.total;
          const noneSupported = compat.supported === 0;
          const catMeta = TEMPLATE_CATEGORIES.find((c) => c.id === template.category);

          return (
            <button
              key={template.id}
              onClick={() => onSelect(template.id)}
              className={cn(
                'flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all',
                noneSupported && 'opacity-50',
                isSelected
                  ? 'border-ice-accent bg-ice-accent-muted'
                  : 'border-ice-border bg-ice-surface hover:border-ice-border-strong',
              )}
            >
              <div className="flex items-center gap-2 w-full">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-ice-text-1 block truncate">{template.name}</span>
                  <span className="text-ice-xs text-ice-text-2">{template.estimatedCost}</span>
                </div>
              </div>
              <p className="text-ice-xs text-ice-text-2 leading-snug line-clamp-2">{template.description}</p>
              <div className="flex items-center gap-1 flex-wrap">
                {catMeta && (
                  <span
                    className="text-ice-2xs px-1 py-0.5 rounded font-medium"
                    style={{ color: catMeta.color, backgroundColor: catMeta.color + '20' }}
                  >
                    {catMeta.label}
                  </span>
                )}
                <span
                  className="text-ice-2xs px-1 py-0.5 rounded font-medium"
                  style={{ color: secBadge.color, backgroundColor: secBadge.color + '20' }}
                >
                  {secBadge.label}
                </span>
                <span className="text-ice-xs text-ice-text-3">{template.blocks.length} blocks</span>
                {/* Provider compatibility indicator */}
                {allSupported ? (
                  <span className="flex items-center gap-0.5 text-ice-2xs text-emerald-400">
                    <CheckCircle className="w-2.5 h-2.5" />
                  </span>
                ) : !noneSupported ? (
                  <span
                    className="flex items-center gap-0.5 text-ice-2xs text-amber-400"
                    title={`Unsupported: ${compat.unsupported.join(', ')}`}
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {compat.unsupported.length}
                  </span>
                ) : null}
                {template.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[8px] px-1 py-0 h-3.5">
                    {tag}
                  </Badge>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
