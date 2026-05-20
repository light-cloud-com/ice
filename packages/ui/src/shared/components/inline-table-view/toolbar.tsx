/**
 * Toolbar section of the inline table view. Holds search, status +
 * provider filter chips, the optional "clear filters" affordance, the
 * groupBy select, and the density toggle. Extracted from
 * `inline-table-view.tsx` (rf-itab-2).
 *
 * All state lives in the orchestrator — this component only takes
 * inputs + handler refs.
 */
import { ChevronDown, Filter as FilterIcon, X } from 'lucide-react';
import React from 'react';
import { providerLabel, STATUS_COLORS, type RowStatus } from '../inline-table-view-helpers';
import { FilterChip } from './filter-chip';
import { ALL_STATUSES, type Density, type GroupBy } from './types';
import { useTranslation } from '../../../i18n';
import { SearchInput } from '../ui/search-input';

export interface ToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: Set<RowStatus>;
  providerFilter: Set<string>;
  counts: Record<RowStatus, number>;
  availableProviders: string[];
  hasActiveFilter: boolean;
  groupBy: GroupBy;
  density: Density;
  onToggleStatus: (s: RowStatus) => void;
  onToggleProvider: (p: string) => void;
  onClearFilters: () => void;
  onGroupByChange: (g: GroupBy) => void;
  onDensityChange: (d: Density) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  search,
  onSearchChange,
  statusFilter,
  providerFilter,
  counts,
  availableProviders,
  hasActiveFilter,
  groupBy,
  density,
  onToggleStatus,
  onToggleProvider,
  onClearFilters,
  onGroupByChange,
  onDensityChange,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-ice-border bg-ice-raised shrink-0">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={t('table.search.placeholder')}
        className="w-64"
      />

      <div className="flex items-center gap-1 ml-1">
        <FilterIcon className="w-3 h-3 text-ice-text-3" />
        {ALL_STATUSES.filter((s) => counts[s] > 0).map((s) => (
          <FilterChip
            key={`status-${s}`}
            active={statusFilter.has(s)}
            label={`${t(`table.status.${s}`)} ${counts[s]}`}
            onClick={() => onToggleStatus(s)}
            dot={STATUS_COLORS[s].dot}
          />
        ))}
      </div>

      {availableProviders.length > 1 && (
        <div className="flex items-center gap-1">
          <span className="w-px h-4 bg-ice-border mx-1" />
          {availableProviders.map((p) => (
            <FilterChip
              key={`provider-${p}`}
              active={providerFilter.has(p)}
              label={providerLabel(p)}
              onClick={() => onToggleProvider(p)}
            />
          ))}
        </div>
      )}

      {hasActiveFilter && (
        <button
          onClick={onClearFilters}
          className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-ice-2xs text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-active"
        >
          <X className="w-3 h-3" />
          {t('table.filter.clear')}
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {/* Group by */}
        <label className="flex items-center gap-1.5 text-ice-2xs text-ice-text-3">
          {t('table.groupBy.label')}
          <div className="relative">
            <select
              value={groupBy}
              onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
              className="appearance-none pl-2 pr-6 py-0.5 rounded border border-ice-border bg-ice-raised text-ice-text-1 text-ice-2xs focus:outline-none focus:border-ice-border-strong"
            >
              <option value="none">{t('table.groupBy.none')}</option>
              <option value="status">{t('table.groupBy.status')}</option>
              <option value="provider">{t('table.groupBy.provider')}</option>
              <option value="family">{t('table.groupBy.family')}</option>
              <option value="group">{t('table.groupBy.group')}</option>
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-ice-text-3 pointer-events-none" />
          </div>
        </label>

        {/* Density */}
        <div className="flex items-center rounded border border-ice-border overflow-hidden text-ice-2xs">
          <button
            onClick={() => onDensityChange('comfortable')}
            className={`px-1.5 py-0.5 ${density === 'comfortable' ? 'bg-ice-accent-muted text-ice-text-1' : 'text-ice-text-3 hover:text-ice-text-1'}`}
          >
            {t('table.density.comfortable')}
          </button>
          <button
            onClick={() => onDensityChange('compact')}
            className={`px-1.5 py-0.5 border-l border-ice-border ${density === 'compact' ? 'bg-ice-accent-muted text-ice-text-1' : 'text-ice-text-3 hover:text-ice-text-1'}`}
          >
            {t('table.density.compact')}
          </button>
        </div>
      </div>
    </div>
  );
};
