/**
 * Resource Palette orchestrator.
 *
 * Composes the project browser, the blocks section (`BlocksSection`), and
 * the embedded template gallery into a vertically-resizable panel group.
 * The orchestrator owns the cross-section state — search query, provider
 * filter, project-provider lock, collapsed-category set, and mount flag —
 * and forwards filter results to BlocksSection via props.
 *
 * Section / leaf splits (rf-rpal series):
 *   - `../types.ts` — CategoryDef, ComponentDef, Provider, props (rf-rpal-1)
 *   - `../data/categories.ts` — CATEGORY_DEFS / ORDER / MAP (rf-rpal-2)
 *   - `../data/components.ts` — COMPONENTS, blockKey, def (rf-rpal-3)
 *   - `../data/providers.ts` — PROVIDERS, STORAGE_KEY, load/saveCollapsed,
 *     PALETTE_STYLES (rf-rpal-4)
 *   - `./component-item.tsx` — ComponentItem (rf-rpal-5)
 *   - `./draggable-group-item.tsx` — DraggableGroupItem + nextGroupColor
 *     (rf-rpal-6)
 *   - `../sections/blocks-section.tsx` — BlocksSection (rf-rpal-7)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { isCategoryEnabledForProvider, type CategoryId } from '@ice/constants';
import { ENABLED_PROVIDER_IDS } from '../../../config/providers';
import axiosInstance from '../../../shared/api/axios-instance';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../../shared/components/ui/resizable';
import { TooltipProvider } from '../../../shared/components/ui/tooltip';
import { useResolvePath } from '../../../shared/hooks/use-resolve-path';
import { ProjectBrowser } from '../../project-browser';
import { TemplateCategoriesPanel } from '../../templates/components/template-categories-panel';
import { CATEGORY_MAP, CATEGORY_ORDER } from '../data/categories';
import { COMPONENTS } from '../data/components';
import { PALETTE_STYLES, loadCollapsed, saveCollapsed } from '../data/providers';
import { BlocksSection } from '../sections/blocks-section';
import type { CategoryDef, ComponentDef, Provider, ResourcePaletteProps } from '../types';

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

  // Filter components by search + (category × provider) gate
  const filteredComponents = useMemo(
    () =>
      COMPONENTS.filter((c) => {
        // A provider is effective for this concept only when it's globally
        // enabled AND the concept's palette category is enabled for it.
        const effectiveProviders = c.providers.filter(
          (p: string) =>
            ENABLED_PROVIDER_IDS.has(p) &&
            isCategoryEnabledForProvider(c.category as CategoryId, p as Provider),
        );
        if (effectiveProviders.length === 0) return false;

        const matchesSearch =
          !localSearch.trim() ||
          c.name.toLowerCase().includes(localSearch.toLowerCase()) ||
          c.description.toLowerCase().includes(localSearch.toLowerCase());
        const matchesProvider =
          selectedProvider === 'all' || effectiveProviders.includes(selectedProvider as Provider);
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
                <div id="ice-palette-projects-section" className="h-full overflow-y-auto custom-scrollbar">
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
                <div id="ice-palette-templates-section" className="h-full overflow-y-auto custom-scrollbar">
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

