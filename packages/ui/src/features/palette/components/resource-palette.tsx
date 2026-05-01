/**
 * Resource Palette Component
 *
 * Categorized infrastructure components with collapsible sections,
 * tooltips, and prominent category headers.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

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

// Category definitions live in `../data/categories.ts` (rf-rpal-2). They are
// re-exported as `CATEGORY_DEFS`, `CATEGORY_ORDER`, and `CATEGORY_MAP` and
// imported here below.

// Component definitions live in `../data/components.ts` (rf-rpal-3).
// nextGroupColor + DraggableGroupItem live in `./draggable-group-item.tsx`
// (rf-rpal-6).

// PROVIDERS, STORAGE_KEY, loadCollapsed, saveCollapsed and PALETTE_STYLES
// live in `../data/providers.ts` (rf-rpal-4).

// BlocksSection extracted to `../sections/blocks-section.tsx` (rf-rpal-7).

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

// ComponentItem extracted to `./component-item.tsx` (rf-rpal-5).

// DraggableGroupItem extracted to `./draggable-group-item.tsx` (rf-rpal-6).
