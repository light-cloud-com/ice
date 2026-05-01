/**
 * Resource Palette Component
 *
 * Categorized infrastructure components with collapsible sections,
 * tooltips, and prominent category headers.
 */

import * as SelectPrimitive from '@radix-ui/react-select';
import {
  Blocks,
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  Globe,
  Search,
} from 'lucide-react';
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getBrandIcon } from '../../../assets/icons/brand-registry';
import { GROUP_COLOR_PRESETS } from '../../../config/color-palette';
import { ENABLED_PROVIDER_IDS } from '../../../config/providers';
import { useTranslation } from '../../../i18n';
import axiosInstance from '../../../shared/api/axios-instance';
import { PanelHeader } from '../../../shared/components/ui/panel-header';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../../shared/components/ui/resizable';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../../shared/components/ui/tooltip';
import { useResolvePath } from '../../../shared/hooks/use-resolve-path';
import { cn } from '../../../shared/utils/cn';
import { ProjectBrowser } from '../../project-browser';
import { TemplateCategoriesPanel } from '../../templates/components/template-categories-panel';
import { CATEGORY_DEFS, CATEGORY_MAP, CATEGORY_ORDER } from '../data/categories';
import { COMPONENTS } from '../data/components';
import { PALETTE_STYLES, PROVIDERS, loadCollapsed, saveCollapsed } from '../data/providers';
import type { CategoryDef, ComponentDef, Provider, ResourcePaletteProps } from '../types';

// Category definitions live in `../data/categories.ts` (rf-rpal-2). They are
// re-exported as `CATEGORY_DEFS`, `CATEGORY_ORDER`, and `CATEGORY_MAP` and
// imported here below.

// Component definitions live in `../data/components.ts` (rf-rpal-3).

let groupColorIndex = 0;
function nextGroupColor(): string {
  const color = GROUP_COLOR_PRESETS[groupColorIndex % GROUP_COLOR_PRESETS.length];
  groupColorIndex++;
  return color;
}

// PROVIDERS, STORAGE_KEY, loadCollapsed, saveCollapsed and PALETTE_STYLES
// live in `../data/providers.ts` (rf-rpal-4).

// =============================================================================
// Blocks Section (extracted for use in resizable split)
// =============================================================================

interface BlocksSectionProps {
  localSearch: string;
  setLocalSearch: (v: string) => void;
  selectedProvider: string;
  setSelectedProvider: (v: string) => void;
  projectProvider: string | null;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  filteredComponents: ComponentDef[];
  categorizedItems: { category: CategoryDef; items: ComponentDef[] }[];
  isSearching: boolean;
  showGroup: boolean;
  collapsedCategories: Set<string>;
  toggleCategory: (id: string) => void;
  mounted: boolean;
  staggerIdx: number;
}

const BlocksSection: React.FC<BlocksSectionProps> = ({
  localSearch,
  setLocalSearch,
  selectedProvider,
  setSelectedProvider,
  projectProvider,
  searchInputRef,
  filteredComponents,
  categorizedItems,
  isSearching,
  showGroup,
  collapsedCategories,
  toggleCategory,
  mounted,
  staggerIdx: initialStaggerIdx,
}) => {
  const { t } = useTranslation();
  let staggerIdx = initialStaggerIdx;

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        icon={<Blocks aria-hidden="true" className="w-3.5 h-3.5" />}
        title={t('palette.title')}
        search={{
          value: localSearch,
          onChange: setLocalSearch,
          placeholder: t('palette.searchPlaceholder'),
          ref: searchInputRef,
          id: 'ice-palette-search-input',
        }}
        actions={
          <SelectPrimitive.Root value={selectedProvider} onValueChange={setSelectedProvider}>
            <SelectPrimitive.Trigger
              id="ice-palette-provider-select"
              className={cn(
                'group inline-flex items-center gap-1 rounded p-1 transition-colors outline-none',
                'text-ice-text-3/50 hover:text-ice-text-1 focus-visible:ring-1 focus-visible:ring-blue-500',
              )}
            >
              {(() => {
                const brand = selectedProvider !== 'all' ? getBrandIcon(selectedProvider) : null;
                return brand ? (
                  <img src={brand.url} alt="" className="w-3.5 h-3.5" />
                ) : (
                  <Globe aria-hidden="true" className="w-3.5 h-3.5" />
                );
              })()}
              <SelectPrimitive.Icon asChild>
                <ChevronDown aria-hidden="true" className="w-2.5 h-2.5 shrink-0" />
              </SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>

            <SelectPrimitive.Portal>
              <SelectPrimitive.Content
                position="popper"
                side="bottom"
                align="end"
                sideOffset={4}
                className={cn(
                  'z-[99999] max-h-[280px] overflow-hidden',
                  'rounded-md border border-ice-border bg-ice-overlay shadow-xl',
                  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
                  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98]',
                  'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
                )}
              >
                <SelectPrimitive.Viewport className="p-0.5">
                  {PROVIDERS.map((provider) => {
                    const isLocked = !!projectProvider && provider.id !== 'all' && provider.id !== projectProvider;
                    const brand = provider.id !== 'all' ? getBrandIcon(provider.id) : null;
                    return (
                      <SelectPrimitive.Item
                        key={provider.id}
                        value={provider.id}
                        disabled={isLocked}
                        className={cn(
                          'relative flex items-center gap-2 rounded px-2 py-1 outline-none cursor-pointer select-none transition-colors text-ice-xs',
                          'text-ice-text-2 hover:text-ice-text-1 hover:bg-ice-hover focus:bg-ice-hover focus:text-ice-text-1',
                          'data-[disabled]:opacity-30 data-[disabled]:pointer-events-none',
                        )}
                      >
                        {brand ? (
                          <img src={brand.url} alt="" className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Globe aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-ice-text-3" />
                        )}
                        <SelectPrimitive.ItemText>
                          <span className="truncate">{provider.label}</span>
                        </SelectPrimitive.ItemText>
                        {provider.id === selectedProvider && (
                          <Check aria-hidden="true" className="w-3 h-3 shrink-0 text-blue-400 ml-auto" />
                        )}
                      </SelectPrimitive.Item>
                    );
                  })}
                </SelectPrimitive.Viewport>
              </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
          </SelectPrimitive.Root>
        }
      />

      {/* Scrollable blocks content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        <div className="px-2 py-2">
          {categorizedItems.map(({ category, items }) => {
            const isCollapsed = !isSearching && collapsedCategories.has(category.id);

            return (
              <div key={category.id}>
                {!isSearching && (
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="w-full flex items-center py-1 px-2 text-left transition-colors hover:text-ice-text-1"
                  >
                    <span
                      className="w-4 h-4 flex items-center justify-center shrink-0 -ml-0.5 mr-0.5 rounded hover:bg-ice-hover"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategory(category.id);
                      }}
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={cn(
                          'w-3 h-3 text-ice-text-3/50 transition-transform duration-150',
                          !isCollapsed && 'rotate-90',
                        )}
                      />
                    </span>
                    <span
                      className="text-ice-xs font-medium tracking-wide"
                      style={{ color: isCollapsed ? undefined : category.color, opacity: isCollapsed ? 0.5 : 0.8 }}
                    >
                      {category.label}
                    </span>
                    <span className="ml-1.5 text-ice-xs text-ice-text-3/40 tabular-nums">{items.length}</span>
                  </button>
                )}

                {!isCollapsed && (
                  <div className={cn(!isSearching ? 'pb-1' : '')}>
                    {items.map((component) => {
                      const idx = staggerIdx++;
                      return (
                        <ComponentItem
                          key={component.type}
                          component={component}
                          selectedProvider={selectedProvider}
                          categoryColor={category.color}
                          staggerIndex={mounted ? 0 : idx}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {filteredComponents.length === 0 && !showGroup && (
            <div className="text-center py-16 palette-fade-enter">
              <Search className="w-5 h-5 text-ice-text-3 mx-auto mb-3" />
              <p className="text-ice-base text-ice-text-3 font-medium">{t('palette.noBlocksFound')}</p>
              <p className="text-ice-xs text-ice-text-3 mt-1">{t('palette.noBlocksHint')}</p>
            </div>
          )}

          {showGroup && filteredComponents.length > 0 && (
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent my-2 mx-2" />
          )}

          {showGroup && <DraggableGroupItem />}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export type { ResourcePaletteProps } from '../types';

export const ResourcePalette: React.FC<ResourcePaletteProps> = ({
  showProjectSection = true,
  showBlocksSection = true,
  showTemplatesSection = false,
}) => {
  const { pathname } = useLocation();
  // Show blocks only on canvas/table views (not settings/deployments)
  const isCanvasView = !pathname.endsWith('/settings') && !pathname.endsWith('/deployments');

  // Get the current project's locked provider (if set)
  const segments = pathname.split('/').filter(Boolean);
  const resolved = useResolvePath(segments);
  const [projectProvider, setProjectProvider] = useState<string | null>(null);

  useEffect(() => {
    if (resolved.type === 'project' && resolved.id) {
      axiosInstance
        .post('/canvas/projects/get', { projectId: resolved.id })
        .then((res) => setProjectProvider(res.data.provider || null))
        .catch(() => setProjectProvider(null));
    } else {
      setProjectProvider(null);
    }
  }, [resolved.type, resolved.id]);

  const [localSearch, setLocalSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('all');

  // Lock provider filter to project's provider when set
  useEffect(() => {
    if (projectProvider) {
      setSelectedProvider(projectProvider);
    }
  }, [projectProvider]);
  const showProjects = showProjectSection;
  const showBlocks = showBlocksSection;
  const showTemplates = showTemplatesSection;
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(loadCollapsed);
  const [mounted, setMounted] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleCategory = useCallback((categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      saveCollapsed(next);
      return next;
    });
  }, []);

  // Filter components by search + provider
  const filteredComponents = useMemo(
    () =>
      COMPONENTS.filter((c) => {
        // Only show components that have at least one enabled provider
        const hasEnabledProvider = c.providers.some((p: string) => ENABLED_PROVIDER_IDS.has(p));
        if (!hasEnabledProvider) return false;

        const matchesSearch =
          !localSearch.trim() ||
          c.name.toLowerCase().includes(localSearch.toLowerCase()) ||
          c.description.toLowerCase().includes(localSearch.toLowerCase());
        const matchesProvider = selectedProvider === 'all' || c.providers.includes(selectedProvider as Provider);
        return matchesSearch && matchesProvider;
      }),
    [localSearch, selectedProvider],
  );

  // Group filtered items by category, preserving order
  const categorizedItems = useMemo(() => {
    const groups: { category: CategoryDef; items: ComponentDef[] }[] = [];
    for (const catId of CATEGORY_ORDER) {
      const items = filteredComponents.filter((c) => c.category === catId);
      if (items.length > 0) {
        const catDef = CATEGORY_MAP.get(catId)!;
        groups.push({ category: catDef, items });
      }
    }
    return groups;
  }, [filteredComponents]);

  const isSearching = localSearch.trim().length > 0;
  const showGroup = !localSearch.trim() || 'group organize'.includes(localSearch.toLowerCase());

  // Running stagger index for mount animation
  const staggerIdx = 0;

  return (
    <TooltipProvider delayDuration={400}>
      {/* Inject keyframes */}
      <style>{PALETTE_STYLES}</style>

      <div
        className="h-full flex flex-col select-none relative"
        id="ice-palette-panel"
        data-testid="resource-palette"
        style={{
          fontFamily: "'JetBrains Mono Variable', monospace",
          background: 'var(--ice-bg-surface)',
        }}
      >
        {/* Content — active sections stacked in resizable panels */}
        {(() => {
          const sections: { key: string; content: React.ReactNode }[] = [];

          if (showProjects) {
            sections.push({
              key: 'projects',
              content: (
                <div className="h-full overflow-y-auto custom-scrollbar">
                  <ProjectBrowser />
                </div>
              ),
            });
          }

          if (showBlocks && isCanvasView) {
            sections.push({
              key: 'blocks',
              content: (
                <BlocksSection
                  localSearch={localSearch}
                  setLocalSearch={setLocalSearch}
                  selectedProvider={selectedProvider}
                  setSelectedProvider={setSelectedProvider}
                  projectProvider={projectProvider}
                  searchInputRef={searchInputRef}
                  filteredComponents={filteredComponents}
                  categorizedItems={categorizedItems}
                  isSearching={isSearching}
                  showGroup={showGroup}
                  collapsedCategories={collapsedCategories}
                  toggleCategory={toggleCategory}
                  mounted={mounted}
                  staggerIdx={staggerIdx}
                />
              ),
            });
          }

          if (showTemplates) {
            sections.push({
              key: 'templates',
              content: (
                <div className="h-full overflow-y-auto custom-scrollbar">
                  <TemplateCategoriesPanel embedded />
                </div>
              ),
            });
          }

          if (sections.length === 0) return null;
          if (sections.length === 1) return sections[0].content;

          const panelSize = Math.floor(100 / sections.length);
          return (
            <ResizablePanelGroup direction="vertical" autoSaveId="ice-palette-split" className="h-full">
              {sections.map((section, i) => (
                <React.Fragment key={section.key}>
                  {i > 0 && <ResizableHandle withHandle />}
                  <ResizablePanel defaultSize={panelSize} minSize={15}>
                    {section.content}
                  </ResizablePanel>
                </React.Fragment>
              ))}
            </ResizablePanelGroup>
          );
        })()}
      </div>
    </TooltipProvider>
  );
};

// =============================================================================
// Component Item — micro-card with accent edge + optional runtime selector
// =============================================================================

interface ComponentItemProps {
  component: ComponentDef;
  selectedProvider: string;
  categoryColor: string;
  staggerIndex: number;
}

const ComponentItem: React.FC<ComponentItemProps> = ({ component, selectedProvider, categoryColor, staggerIndex }) => {
  const Icon = component.icon;
  const [isDragging, setIsDragging] = useState(false);
  const [selectedRuntime, setSelectedRuntime] = useState<string | null>(component.runtimes?.[0]?.value ?? null);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/ice-block', component.type);
    e.dataTransfer.setData('application/ice-block-name', component.name);
    e.dataTransfer.setData('application/ice-block-provider', selectedProvider);

    // Include selected runtime in drag data overrides
    const dataOverrides: Record<string, unknown> = {
      description: component.description,
    };
    if (selectedRuntime) {
      dataOverrides.runtime = selectedRuntime;
    }
    e.dataTransfer.setData('application/ice-block-data', JSON.stringify(dataOverrides));
    e.dataTransfer.effectAllowed = 'move';

    const runtimeLabel = selectedRuntime ? ` (${selectedRuntime})` : '';
    const dragImage = document.createElement('div');
    dragImage.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(15, 23, 35, 0.95);
        color: #fff;
        border-radius: 10px;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
        font-family: 'JetBrains Mono Variable', monospace;
        backdrop-filter: blur(20px);
        border-left: 3px solid ${categoryColor};
        letter-spacing: 0.02em;
      ">
        ${component.name}<span style="color: rgba(255,255,255,0.5); font-weight: 400; margin-left: 4px;">${runtimeLabel}</span>
      </div>
    `;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const hasRuntimes = component.runtimes && component.runtimes.length > 0;

  return (
    <div className="palette-item-enter" style={{ animationDelay: staggerIndex > 0 ? `${staggerIndex * 15}ms` : '0ms' }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={cn(
              'group flex items-center py-0.5 pl-6 pr-2 cursor-grab',
              'hover:text-ice-text-1',
              'active:cursor-grabbing active:opacity-70',
              'transition-colors',
              isDragging && 'opacity-40',
            )}
            data-block-type={component.type}
            data-testid={`block-item-${component.type}`}
          >
            <Icon className="w-3 h-3 mr-2 shrink-0" style={{ color: `${categoryColor}80` }} />
            <span className="text-ice-xs text-ice-text-3 group-hover:text-ice-text-1 truncate transition-colors">
              {component.name}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={8}
          className="max-w-[240px] bg-ice-overlay border border-ice-border text-ice-sm leading-relaxed px-3 py-2 rounded-md shadow-lg"
        >
          <p className="font-medium text-ice-text-1 text-ice-base mb-1">{component.name}</p>
          <p className="text-ice-text-2">{component.description}</p>
          <div className="flex gap-1 mt-1.5">
            {component.providers.map((p) => (
              <span key={p} className="text-ice-2xs font-medium text-ice-text-3 uppercase">
                {p}
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Runtime chips — shown below the drag row */}
      {hasRuntimes && (
        <div className="flex flex-wrap gap-1 pl-8 pr-2 mb-1 mt-0.5">
          {component.runtimes!.map((rt) => {
            const isSelected = selectedRuntime === rt.value;
            return (
              <button
                key={rt.value}
                onClick={() => setSelectedRuntime(rt.value)}
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                className={cn(
                  'px-1.5 py-0.5 rounded text-ice-xs font-medium transition-all duration-150 cursor-grab',
                  'active:cursor-grabbing active:scale-95',
                  'border',
                  isSelected ? 'border-current' : 'border-transparent hover:bg-ice-hover',
                )}
                style={
                  isSelected
                    ? {
                        color: categoryColor,
                        backgroundColor: `${categoryColor}12`,
                        borderColor: `${categoryColor}30`,
                      }
                    : {
                        color: 'var(--ice-text-tertiary)',
                      }
                }
              >
                {rt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Draggable Group Item
// =============================================================================

const DraggableGroupItem: React.FC = () => {
  const { t } = useTranslation();
  const handleDragStart = (e: React.DragEvent) => {
    const color = nextGroupColor();
    e.dataTransfer.setData('application/ice-group', 'Custom');
    e.dataTransfer.setData('application/ice-group-name', 'New Group');
    e.dataTransfer.setData('application/ice-group-color', color);
    e.dataTransfer.effectAllowed = 'move';

    const dragImage = document.createElement('div');
    dragImage.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(15, 23, 35, 0.95);
        color: ${color};
        border-radius: 10px;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${color}30;
        font-family: 'JetBrains Mono Variable', monospace;
        border: 1px dashed ${color}50;
        letter-spacing: 0.02em;
      ">
        New Group
      </div>
    `;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        'group flex items-center gap-2.5 py-2.5 px-3 mx-1 rounded-lg cursor-grab',
        'border border-dashed border-ice-border hover:border-amber-500/25',
        'hover:bg-amber-500/[0.03]',
        'active:cursor-grabbing active:scale-[0.97]',
        'transition-all duration-200',
      )}
    >
      <Folder className="w-3.5 h-3.5 text-ice-text-3 group-hover:text-amber-400/70 transition-colors shrink-0" />
      <span className="text-ice-base text-ice-text-2 group-hover:text-ice-text-1 transition-colors">
        {t('palette.group')}
      </span>
    </div>
  );
};
