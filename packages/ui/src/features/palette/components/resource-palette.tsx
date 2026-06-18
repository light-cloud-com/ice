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
 *   - `../data/categories.ts` — `getCategoryDefs(t)` / `getCategoryMap(t)` / `CATEGORY_ORDER` (rf-rpal-2; locale-reactive)
 *   - `../data/components.ts` — `getComponents(t)`, blockKey, def (rf-rpal-3; locale-reactive)
 *   - `../data/providers.ts` — `getProviders(t)`, STORAGE_KEY, load/saveCollapsed,
 *     PALETTE_STYLES (rf-rpal-4; locale-reactive)
 *   - `./component-item.tsx` — ComponentItem (rf-rpal-5)
 *   - `./draggable-group-item.tsx` — DraggableGroupItem + nextGroupColor
 *     (rf-rpal-6)
 *   - `../sections/blocks-section.tsx` — BlocksSection (rf-rpal-7)
 */

import { isCategoryEnabledForProvider, type CategoryId } from '@ice/constants';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ENABLED_PROVIDER_IDS } from '../../../config/providers';
import { useTranslation } from '../../../i18n';
import axiosInstance from '../../../shared/api/axios-instance';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../../shared/components/ui/resizable';
import { TooltipProvider } from '../../../shared/components/ui/tooltip';
import { useResolvePathContext } from '../../../shared/hooks/use-resolve-path-context';
import { ProjectBrowser } from '../../project-browser';
import { TemplateCategoriesPanel } from '../../templates/components/template-categories-panel';
import { getCategoryMap, CATEGORY_ORDER } from '../data/categories';
import { getComponents, componentMatchesQuery } from '../data/components';
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
  const { t } = useTranslation();
  // Show blocks only on canvas/table views (not settings/deployments)
  const isCanvasView = !pathname.endsWith('/settings') && !pathname.endsWith('/deployments');

  // Localized lookup of category labels/tooltips — re-derives when the
  // user switches locale because `t` is a fresh closure per locale.
  const categoryMap = useMemo(() => getCategoryMap(t), [t]);
  // Localized concept blocks — same locale-reactivity contract.
  const components = useMemo(() => getComponents(t), [t]);

  // Get the current project's locked provider (if set) — IA7: shared resolution.
  const resolved = useResolvePathContext();
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
      components.filter((c) => {
        // A provider is effective for this concept only when it's globally
        // enabled AND the concept's palette category is enabled for it.
        const effectiveProviders = c.providers.filter(
          (p: string) =>
            ENABLED_PROVIDER_IDS.has(p) && isCategoryEnabledForProvider(c.category as CategoryId, p as Provider),
        );
        if (effectiveProviders.length === 0) return false;

        // CD3 — match name/description/tooltip + the localized category label +
        // goal/synonym keywords, mirroring the richer template search. Lets
        // "database", "api", "cron", "cache" etc. resolve to the right block.
        const matchesSearch = componentMatchesQuery(c, localSearch, categoryMap.get(c.category)?.label ?? '');
        const matchesProvider = selectedProvider === 'all' || effectiveProviders.includes(selectedProvider as Provider);
        return matchesSearch && matchesProvider;
      }),
    [components, localSearch, selectedProvider, categoryMap],
  );

  // Providers with at least one concept whose (category × provider) gate
  // is open. The palette dropdown enables a provider option iff its id is
  // in this set — so AWS shows up the moment any of its categories has a
  // block, even if the active project's provider is something else.
  const availableProviderIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of components) {
      for (const p of c.providers) {
        if (set.has(p)) continue;
        if (ENABLED_PROVIDER_IDS.has(p) && isCategoryEnabledForProvider(c.category as CategoryId, p as Provider)) {
          set.add(p);
        }
      }
    }
    return set;
  }, [components]);

  // Group filtered items by category, preserving order
  const categorizedItems = useMemo(() => {
    const groups: { category: CategoryDef; items: ComponentDef[] }[] = [];
    for (const catId of CATEGORY_ORDER) {
      const items = filteredComponents.filter((c) => c.category === catId);
      if (items.length > 0) {
        const catDef = categoryMap.get(catId)!;
        groups.push({ category: catDef, items });
      }
    }
    return groups;
  }, [filteredComponents, categoryMap]);

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
                  availableProviderIds={availableProviderIds}
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
