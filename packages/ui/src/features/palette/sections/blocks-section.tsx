/**
 * Resource Palette — BlocksSection.
 *
 * Extracted verbatim from `resource-palette.tsx` (rf-rpal-7). Renders the
 * blocks list with the panel header (title + search + provider dropdown),
 * the per-category collapsible groups of `ComponentItem`s, and the
 * `DraggableGroupItem` affordance at the bottom.
 *
 * The section receives the orchestrator's filter / state surface as props
 * — it does NOT manage state itself. `staggerIdx` accumulates across the
 * categories on first mount so the per-item enter animations stagger
 * sequentially across the whole list.
 */

import * as SelectPrimitive from '@radix-ui/react-select';
import { Blocks, Check, ChevronDown, ChevronRight, Globe, Search } from 'lucide-react';
import React from 'react';

import { getBrandIcon } from '../../../assets/icons/brand-registry';
import { useTranslation } from '../../../i18n';
import { PanelHeader } from '../../../shared/components/ui/panel-header';
import { cn } from '../../../shared/utils/cn';
import { ComponentItem } from '../components/component-item';
import { DraggableGroupItem } from '../components/draggable-group-item';
import { getProviders } from '../data/providers';
import type { CategoryDef, ComponentDef } from '../types';

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

export const BlocksSection: React.FC<BlocksSectionProps> = ({
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
  // Locale-reactive provider list — re-derives "All" label when locale switches.
  // Cheap to recompute each render (≤4 entries) and avoids the test-renderer
  // pitfall where direct-FC walks bypass useMemo's fiber context.
  const providers = getProviders(t);
  let staggerIdx = initialStaggerIdx;

  return (
    <div id="ice-palette-blocks-section" className="h-full flex flex-col">
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
                  {providers.map((provider) => {
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
