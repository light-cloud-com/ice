/**
 * Footer strip showing total / filtered counts, the selected count,
 * and the per-status mini-counts on the right that double as
 * filter-toggle buttons.
 *
 * Extracted from `inline-table-view.tsx` (rf-itab-2).
 */
import React from 'react';
import { STATUS_COLORS, type RowStatus } from '../inline-table-view-helpers';
import { ALL_STATUSES } from './types';
import { useTranslation } from '../../../i18n';

export interface TableFooterProps {
  sortedCount: number;
  totalCount: number;
  selectedCount: number;
  counts: Record<RowStatus, number>;
  statusFilter: Set<RowStatus>;
  onToggleStatus: (s: RowStatus) => void;
}

export const TableFooter: React.FC<TableFooterProps> = ({
  sortedCount,
  totalCount,
  selectedCount,
  counts,
  statusFilter,
  onToggleStatus,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-t border-ice-border bg-ice-raised shrink-0 text-ice-2xs">
      <span className="text-ice-text-3 tabular-nums">
        {sortedCount === totalCount
          ? t('table.footer.total', { count: totalCount })
          : t('table.footer.filtered', { shown: sortedCount, total: totalCount })}
      </span>
      {selectedCount > 0 && (
        <span className="text-ice-accent tabular-nums">{t('table.footer.selected', { count: selectedCount })}</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {ALL_STATUSES.filter((s) => counts[s] > 0).map((s) => (
          <button
            key={s}
            onClick={() => onToggleStatus(s)}
            className={`inline-flex items-center gap-1 px-1 py-0.5 rounded text-ice-text-3 hover:text-ice-text-1 ${
              statusFilter.has(s) ? 'text-ice-text-1' : ''
            }`}
            title={t(`table.status.${s}`)}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLORS[s].dot }} />
            <span className="tabular-nums">{counts[s]}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
