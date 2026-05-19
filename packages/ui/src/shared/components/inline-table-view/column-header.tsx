/**
 * Column header strip above the scrolling body. Renders one
 * `<SortHeader>` per sortable column plus a non-sortable Endpoints
 * label and two flanking spacer spans.
 *
 * Extracted from `inline-table-view.tsx` (rf-itab-2).
 */
import React from 'react';
import { SortHeader } from './sort-header';
import type { SortCol, SortDir } from './types';
import { useTranslation } from '../../../i18n';

export interface ColumnHeaderProps {
  sortCol: SortCol;
  sortDir: SortDir;
  onToggleSort: (col: SortCol) => void;
}

export const ColumnHeader: React.FC<ColumnHeaderProps> = ({ sortCol, sortDir, onToggleSort }) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[12px_1fr_140px_110px_120px_140px_180px_90px_36px] items-center gap-2 px-3 py-1.5 border-b border-ice-border bg-ice-raised shrink-0">
      <span />
      <SortHeader col="label" label={t('table.columns.name')} sortCol={sortCol} sortDir={sortDir} onToggleSort={onToggleSort} />
      <SortHeader col="typeLabel" label={t('table.columns.type')} sortCol={sortCol} sortDir={sortDir} onToggleSort={onToggleSort} />
      <SortHeader col="provider" label={t('table.columns.provider')} sortCol={sortCol} sortDir={sortDir} onToggleSort={onToggleSort} />
      <SortHeader col="status" label={t('table.columns.status')} sortCol={sortCol} sortDir={sortDir} onToggleSort={onToggleSort} />
      <span className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider">
        {t('table.columns.endpoints')}
      </span>
      <SortHeader col="providerId" label={t('table.columns.id')} sortCol={sortCol} sortDir={sortDir} onToggleSort={onToggleSort} />
      <SortHeader col="updatedAt" label={t('table.columns.updated')} sortCol={sortCol} sortDir={sortDir} onToggleSort={onToggleSort} />
      <span />
    </div>
  );
};
