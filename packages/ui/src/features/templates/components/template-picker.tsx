/**
 * Template Picker Component
 *
 * Searchable dropdown that displays composed templates grouped by category.
 * Templates are block-based and expanded via expandComposedTemplate().
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
  LayoutTemplate,
} from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  searchTemplates,
  expandComposedTemplate,
  type ComposedTemplate,
} from '../../../config/templates';
import { Badge } from '../../../shared/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from '../../../shared/components/ui/dropdown-menu';
import { cn } from '../../../shared/utils/cn';
import { createCard, importToActiveCard } from '../../../store/slices/cards-slice';
import { openTabInPane, setActivePane } from '../../../store/slices/ui-slice';
import type { AppDispatch, RootState } from '../../../store';
import { SearchInput } from '../../../shared/components/ui/search-input';

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

export const TemplatePicker: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const activePaneId = useSelector((state: RootState) => state.ui.splitView.activePaneId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => searchTemplates(search, ALL_TEMPLATES), [search]);

  // Group filtered templates by category (preserving TEMPLATE_CATEGORIES order)
  const grouped = useMemo(() => {
    const groups: {
      category: (typeof TEMPLATE_CATEGORIES)[number];
      templates: ComposedTemplate[];
    }[] = [];
    for (const cat of TEMPLATE_CATEGORIES) {
      const templates = filtered.filter((t) => t.category === cat.id);
      if (templates.length > 0) {
        groups.push({ category: cat, templates });
      }
    }
    return groups;
  }, [filtered]);

  const handleSelect = (template: ComposedTemplate) => {
    const { nodes, edges } = expandComposedTemplate(template);
    const cardId = `card-${Date.now()}`;
    dispatch(createCard({ name: template.name, id: cardId }));
    dispatch(openTabInPane({ paneId: activePaneId, cardId }));
    dispatch(setActivePane(activePaneId));
    dispatch(importToActiveCard({ nodes, edges }));
    setOpen(false);
    setSearch('');

    import('../../../shared/api/api-adapter').then(({ getApi }) => {
      getApi()
        .templates.loadToGraph({ name: template.name, nodes, edges })
        .catch((err: unknown) => {
          console.warn('Failed to sync template to backend:', err);
        });
    });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          title="Start from Template"
          className="p-1.5 rounded hover:bg-muted transition-colors app-no-drag text-emerald-500 hover:text-emerald-600"
        >
          <LayoutTemplate className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>Templates</DropdownMenuLabel>
        <div className="px-2 pb-1.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search templates..."
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {grouped.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              No templates match &quot;{search}&quot;
            </div>
          ) : (
            grouped.map(({ category, templates }) => {
              const CatIcon = ICON_MAP[category.icon] || Zap;
              return (
                <div key={category.id}>
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <CatIcon className="w-3 h-3" style={{ color: category.color }} />
                    <span
                      className="text-ice-xs font-semibold uppercase tracking-wider"
                      style={{ color: category.color }}
                    >
                      {category.label}
                    </span>
                  </div>
                  {templates.map((template) => {
                    const Icon = ICON_MAP[template.icon] || Rocket;
                    return (
                      <button
                        key={template.id}
                        onClick={() => handleSelect(template)}
                        className={cn(
                          'flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-left text-sm',
                          'outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
                          'focus:bg-accent focus:text-accent-foreground cursor-default',
                        )}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary mt-0.5">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-xs">{template.name}</span>
                            <span className="text-ice-xs text-muted-foreground ml-2 shrink-0">
                              {template.estimatedCost}
                            </span>
                          </div>
                          <p className="text-ice-sm text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                            {template.description}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-ice-xs text-muted-foreground">{template.blocks.length} blocks</span>
                            <span className="text-muted-foreground/40 mx-0.5">&middot;</span>
                            {template.tags.slice(0, 4).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-ice-2xs px-1 py-0 h-3.5">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
